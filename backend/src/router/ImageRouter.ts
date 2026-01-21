/**
 * Router for image upload and retrieval endpoints.
 * Handles image uploads to S3 and provides signed URL access.
 */

import { getConfig } from "../config/Config";
import type { AssetDao } from "../dao/AssetDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { ImageStorageService } from "../services/ImageStorageService";
import { getTenantContext } from "../tenant/TenantContext";
import { validateImage } from "../util/ImageValidator";
import { getLog } from "../util/Logger";
import { getUserId, handleLookupError, isLookupError } from "../util/RouterUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type NextFunction, type Request, type Response, type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Creates an error handler for PayloadTooLargeError from express.raw().
 * Exported for testing purposes.
 *
 * @param maxSizeBytes - Maximum allowed file size in bytes
 * @returns Express error-handling middleware
 */
export function createPayloadTooLargeHandler(maxSizeBytes: number) {
	return (err: Error, _req: Request, res: Response, next: NextFunction) => {
		if (err.name === "PayloadTooLargeError" || (err as NodeJS.ErrnoException).code === "LIMIT_FILE_SIZE") {
			const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
			log.warn({ maxSize: maxSizeBytes }, "Image rejected: payload too large (limit: %s MB)", maxSizeMB);
			return res.status(400).json({
				error: `File size exceeds maximum allowed size (${maxSizeMB} MB)`,
			});
		}
		next(err);
	};
}

/**
 * Creates the image router.
 *
 * @param imageStorageService - Service for S3 image operations
 * @param assetDaoProvider - Provider for asset metadata DAO
 * @param tokenUtil - Token utility for authentication
 * @returns Express router for image endpoints
 */
export function createImageRouter(
	imageStorageService: ImageStorageService,
	assetDaoProvider: DaoProvider<AssetDao>,
	tokenUtil: TokenUtil<UserInfo>,
): Router {
	const router = express.Router();

	/**
	 * POST /api/images
	 * Upload a new image.
	 *
	 * Expects raw binary body with Content-Type header set to image MIME type.
	 * Optionally accepts X-Original-Filename header for metadata.
	 *
	 * Returns: { imageId: string, url: string }
	 */
	const config = getConfig();
	// Use config limit + small buffer for express parsing overhead
	const expressLimit = config.IMAGE_MAX_SIZE_BYTES + 1024;
	// Error handler for PayloadTooLargeError from express.raw()
	const handlePayloadTooLarge = createPayloadTooLargeHandler(config.IMAGE_MAX_SIZE_BYTES);

	router.post(
		"/",
		express.raw({ type: "image/*", limit: expressLimit }),
		handlePayloadTooLarge,
		async (req: Request, res: Response) => {
			try {
				// Get authenticated user
				const userIdResult = getUserId(tokenUtil, req);
				if (isLookupError(userIdResult)) {
					return handleLookupError(res, userIdResult);
				}

				// Get tenant and org context, falling back to defaults for single-tenant mode
				const tenantContext = getTenantContext();
				const tenantId = tenantContext?.tenant.id ?? "0";
				const orgId = tenantContext?.org.id ?? "0";

				// Validate request has body
				if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
					return res.status(400).json({ error: "No image data provided" });
				}

				// Get MIME type from Content-Type header
				const contentType = req.get("Content-Type");
				/* v8 ignore next 3 -- express.raw only parses when Content-Type is image/*, so this is always set */
				if (!contentType) {
					return res.status(400).json({ error: "Content-Type header is required" });
				}
				// Extract MIME type (remove charset etc if present)
				const mimeType = contentType.split(";")[0].trim();

				// Validate the image
				const validationResult = validateImage(req.body, mimeType, config.IMAGE_MAX_SIZE_BYTES);
				if (!validationResult.valid) {
					log.warn(
						{ tenantId, orgId, userId: userIdResult, error: validationResult.error },
						"Image validation failed: %s",
						validationResult.error,
					);
					return res.status(400).json({ error: validationResult.error });
				}

				// Get original filename from header (optional), truncate to 255 chars for database
				const rawFilename = req.get("X-Original-Filename");
				const originalFilename = rawFilename ? rawFilename.slice(0, 255) : undefined;

				// Upload to S3 with tenant/org/_default prefix
				const result = await imageStorageService.uploadImage(
					tenantId,
					orgId,
					req.body,
					validationResult.mimeType,
					validationResult.extension,
					originalFilename,
				);

				// Save asset metadata to database (org isolation is handled by schema-scoped DAO)
				const assetDao = assetDaoProvider.getDao(tenantContext);
				await assetDao.createAsset({
					s3Key: result.imageId,
					assetType: "image",
					mimeType: validationResult.mimeType,
					size: result.size,
					originalFilename: originalFilename ?? null,
					uploadedBy: userIdResult,
				});

				log.info(
					{ tenantId, orgId, userId: userIdResult, imageId: result.imageId, size: result.size },
					"Image uploaded: %s (%d bytes)",
					result.imageId,
					result.size,
				);

				// Return the image ID and API URL
				return res.status(201).json({
					imageId: result.imageId,
					url: `/api/images/${result.imageId}`,
				});
			} catch (error) {
				log.error(error, "Failed to upload image");
				return res.status(500).json({ error: "Failed to upload image" });
			}
		},
	);

	/**
	 * GET /api/images/*imageId
	 * Get a signed URL for an image and redirect to it.
	 * Uses wildcard to capture paths with slashes (e.g., tenant/org/_default/uuid.png)
	 *
	 * Returns: 302 redirect to signed S3 URL
	 */
	router.get("/*imageId", async (req: Request, res: Response) => {
		try {
			// Get authenticated user
			const userIdResult = getUserId(tokenUtil, req);
			if (isLookupError(userIdResult)) {
				return handleLookupError(res, userIdResult);
			}

			const tenantContext = getTenantContext();

			// Get imageId from the wildcard path parameter (Express 5 returns array for wildcards with slashes)
			const imageIdParam = req.params.imageId;
			/* v8 ignore next -- Express 5 array handling for wildcard paths with slashes */
			const imageId = Array.isArray(imageIdParam) ? imageIdParam.join("/") : imageIdParam;
			/* v8 ignore next 3 -- Express route *imageId ensures imageId is always present */
			if (!imageId) {
				return res.status(400).json({ error: "Image ID is required" });
			}

			// Check if asset exists in database (not deleted)
			// Note: Org isolation is handled by schema-scoped DAO - each org has its own DB schema
			const assetDao = assetDaoProvider.getDao(tenantContext);
			const asset = await assetDao.findByS3Key(imageId);
			if (!asset) {
				return res.status(404).json({ error: "Image not found" });
			}

			// Generate signed URL and redirect (imageId is the full S3 key path)
			const signedUrl = await imageStorageService.getSignedUrl(imageId, {
				contentDisposition: "inline",
			});

			log.debug({ imageId }, "Redirecting to signed URL for image %s", imageId);

			return res.redirect(302, signedUrl);
		} catch (error) {
			log.error(error, "Failed to get image");
			return res.status(500).json({ error: "Failed to get image" });
		}
	});

	/**
	 * DELETE /api/images/*imageId
	 * Delete an image.
	 * Uses wildcard to capture paths with slashes (e.g., tenant/org/_default/uuid.png)
	 *
	 * Returns: 204 No Content on success
	 */
	router.delete("/*imageId", async (req: Request, res: Response) => {
		try {
			// Get authenticated user
			const userIdResult = getUserId(tokenUtil, req);
			if (isLookupError(userIdResult)) {
				return handleLookupError(res, userIdResult);
			}

			const tenantContext = getTenantContext();

			// Get imageId from the wildcard path parameter (Express 5 returns array for wildcards with slashes)
			const imageIdParam = req.params.imageId;
			/* v8 ignore next -- Express 5 array handling for wildcard paths with slashes */
			const imageId = Array.isArray(imageIdParam) ? imageIdParam.join("/") : imageIdParam;
			/* v8 ignore next 3 -- Express route *imageId ensures imageId is always present */
			if (!imageId) {
				return res.status(400).json({ error: "Image ID is required" });
			}

			// Check if asset exists in database (not deleted)
			// Note: Org isolation is handled by schema-scoped DAO - each org has its own DB schema
			const assetDao = assetDaoProvider.getDao(tenantContext);
			const asset = await assetDao.findByS3Key(imageId);
			if (!asset) {
				return res.status(404).json({ error: "Image not found" });
			}

			// Only the uploader can delete their own images
			// TODO: Add admin role bypass when role system is implemented
			if (asset.uploadedBy !== userIdResult) {
				log.warn(
					{ userId: userIdResult, imageId, ownerId: asset.uploadedBy },
					"User %d attempted to delete image owned by user %d",
					userIdResult,
					asset.uploadedBy,
				);
				return res.status(403).json({ error: "You can only delete images you uploaded" });
			}

			// Delete from S3 first - if this fails, we haven't touched the DB yet
			// and the user can retry. If we soft-deleted DB first and S3 failed,
			// the image would appear deleted but still be accessible via signed URL.
			await imageStorageService.deleteImage(imageId);

			// Then soft delete in database (if this fails, we have an orphaned S3 deletion,
			// but that's safer than the reverse - the image is truly gone from storage)
			await assetDao.softDelete(imageId);

			log.info({ userId: userIdResult, imageId }, "Image deleted: %s", imageId);

			return res.status(204).send();
		} catch (error) {
			log.error(error, "Failed to delete image");
			return res.status(500).json({ error: "Failed to delete image" });
		}
	});

	return router;
}
