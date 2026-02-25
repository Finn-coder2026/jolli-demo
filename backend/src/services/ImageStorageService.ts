/**
 * Service for storing and retrieving images from S3.
 * Handles image upload with SSE and signed URL generation.
 *
 * Note: S3 buckets must be pre-created per environment (jolli-images-{env}).
 * See docs for bucket configuration requirements.
 */

import { getConfig } from "../config/Config";
import type { AllowedImageMimeType } from "../util/ImageValidator";
import { getLog } from "../util/Logger";
import { randomUUID } from "node:crypto";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const log = getLog(import.meta);

/**
 * Result of an image upload operation.
 */
export interface ImageUploadResult {
	imageId: string;
	bucket: string;
	key: string;
	mimeType: AllowedImageMimeType;
	size: number;
}

/**
 * Options for getting a signed URL.
 */
export interface SignedUrlOptions {
	/** Expiry time in seconds (defaults to config value) */
	expiresIn?: number;
	/** Content-Disposition header value */
	contentDisposition?: "inline" | "attachment";
}

/**
 * Service for managing image storage in S3.
 *
 * Uses a single bucket per environment with hierarchical keys:
 * {tenantId}/{orgId}/{spaceSlug}/{uuid}.{ext}
 *
 * Legacy images use "_default" as the space slug.
 * New images use the actual space slug for proper scoping.
 *
 * Uses IDs instead of slugs for tenant/org for stability - slugs can change, IDs cannot.
 * Space slugs are used in the path for readability since they're relatively stable.
 */
export interface ImageStorageService {
	/**
	 * Upload an image to S3.
	 *
	 * @param tenantId - Tenant ID (UUID string) for key prefix
	 * @param orgId - Organization ID (UUID string) for key prefix
	 * @param buffer - Image data
	 * @param mimeType - MIME type of the image
	 * @param extension - File extension
	 * @param originalFilename - Optional original filename for metadata
	 * @param spaceSlug - Optional space slug for scoping (defaults to "_default" for legacy)
	 * @returns Upload result with imageId (full S3 key path)
	 */
	uploadImage(
		tenantId: string,
		orgId: string,
		buffer: Buffer,
		mimeType: AllowedImageMimeType,
		extension: string,
		originalFilename?: string,
		spaceSlug?: string,
	): Promise<ImageUploadResult>;

	/**
	 * Generate a signed URL for accessing an image.
	 *
	 * @param imageId - Full S3 key path (e.g., "tenant/org/_default/uuid.png")
	 * @param options - Signed URL options
	 */
	getSignedUrl(imageId: string, options?: SignedUrlOptions): Promise<string>;

	/**
	 * Download an image from S3 (for bundling into sites).
	 *
	 * @param imageId - Full S3 key path
	 */
	downloadImage(imageId: string): Promise<{ buffer: Buffer; mimeType: string }>;

	/**
	 * Delete an image from S3.
	 *
	 * @param imageId - Full S3 key path
	 */
	deleteImage(imageId: string): Promise<void>;

	/**
	 * Check if an image exists.
	 *
	 * @param imageId - Full S3 key path
	 */
	imageExists(imageId: string): Promise<boolean>;
}

/**
 * Creates the S3 image storage service.
 */
export function createImageStorageService(s3Client?: S3Client): ImageStorageService {
	const config = getConfig();
	const region = config.IMAGE_S3_REGION ?? config.AWS_REGION;

	// Use provided client or create a new one
	const client = s3Client ?? new S3Client({ region });

	// Track if we've verified the bucket exists (single bucket per environment)
	let bucketVerified = false;

	/**
	 * Get the single bucket name for this environment.
	 */
	function getBucketName(): string {
		return `jolli-images-${config.IMAGE_S3_ENV}`;
	}

	/**
	 * Ensure the bucket exists. Throws if bucket is not found.
	 * Buckets must be pre-created per environment with proper security settings.
	 */
	async function ensureBucketExists(): Promise<void> {
		// Skip if we've already verified the bucket
		if (bucketVerified) {
			return;
		}

		const bucketName = getBucketName();

		try {
			// Check if bucket exists
			await client.send(new HeadBucketCommand({ Bucket: bucketName }));
			bucketVerified = true;
			log.debug({ bucket: bucketName }, "Bucket %s exists", bucketName);
		} catch (error) {
			if (isNotFoundError(error)) {
				throw new Error(
					`S3 bucket '${bucketName}' does not exist. ` +
						`Create the bucket with SSE-S3 encryption and Block Public Access enabled.`,
				);
			}
			throw error;
		}
	}

	/**
	 * Upload an image to S3.
	 * Key structure: {tenantId}/{orgId}/{spaceSlug}/{uuid}.{extension}
	 * Legacy images use "_default" as spaceSlug.
	 */
	async function uploadImage(
		tenantId: string,
		orgId: string,
		buffer: Buffer,
		mimeType: AllowedImageMimeType,
		extension: string,
		originalFilename?: string,
		spaceSlug?: string,
	): Promise<ImageUploadResult> {
		const bucketName = getBucketName();
		await ensureBucketExists();

		// Generate unique image ID with tenant/org/space prefix
		// Use "_default" for legacy/org-wide images when no space is specified
		const uuid = randomUUID();
		const effectiveSpaceSlug = spaceSlug ?? "_default";
		const imageId = `${tenantId}/${orgId}/${effectiveSpaceSlug}/${uuid}.${extension}`;

		// Build metadata
		const metadata: Record<string, string> = {};
		if (originalFilename) {
			metadata["original-filename"] = originalFilename;
		}

		// Upload to S3 with SSE
		await client.send(
			new PutObjectCommand({
				Bucket: bucketName,
				Key: imageId,
				Body: buffer,
				ContentType: mimeType,
				ServerSideEncryption: "AES256",
				Metadata: metadata,
			}),
		);

		log.info(
			{ bucket: bucketName, imageId, mimeType, size: buffer.length },
			"Uploaded image %s to %s (%d bytes)",
			imageId,
			bucketName,
			buffer.length,
		);

		return {
			imageId,
			bucket: bucketName,
			key: imageId,
			mimeType,
			size: buffer.length,
		};
	}

	/**
	 * Generate a signed URL for accessing an image.
	 * @param imageId - Full S3 key path (e.g., "tenant/org/_default/uuid.png")
	 */
	async function getSignedImageUrl(imageId: string, options?: SignedUrlOptions): Promise<string> {
		const bucketName = getBucketName();
		const expiresIn = options?.expiresIn ?? config.IMAGE_SIGNED_URL_EXPIRY_SECONDS;

		const command = new GetObjectCommand({
			Bucket: bucketName,
			Key: imageId,
			ResponseContentDisposition: options?.contentDisposition === "attachment" ? "attachment" : "inline",
		});

		const url = await getSignedUrl(client, command, { expiresIn });

		log.debug(
			{ bucket: bucketName, imageId, expiresIn },
			"Generated signed URL for %s (expires in %ds)",
			imageId,
			expiresIn,
		);

		return url;
	}

	/**
	 * Download an image from S3.
	 * @param imageId - Full S3 key path (e.g., "tenant/org/_default/uuid.png")
	 */
	async function downloadImage(imageId: string): Promise<{ buffer: Buffer; mimeType: string }> {
		const bucketName = getBucketName();

		const response = await client.send(
			new GetObjectCommand({
				Bucket: bucketName,
				Key: imageId,
			}),
		);

		// Convert stream to buffer
		const chunks: Array<Uint8Array> = [];
		const stream = response.Body as AsyncIterable<Uint8Array>;
		for await (const chunk of stream) {
			chunks.push(chunk);
		}
		const buffer = Buffer.concat(chunks);

		log.debug(
			{ bucket: bucketName, imageId, size: buffer.length },
			"Downloaded image %s (%d bytes)",
			imageId,
			buffer.length,
		);

		return {
			buffer,
			mimeType: response.ContentType ?? "application/octet-stream",
		};
	}

	/**
	 * Delete an image from S3.
	 * @param imageId - Full S3 key path (e.g., "tenant/org/_default/uuid.png")
	 */
	async function deleteImage(imageId: string): Promise<void> {
		const bucketName = getBucketName();

		await client.send(
			new DeleteObjectCommand({
				Bucket: bucketName,
				Key: imageId,
			}),
		);

		log.info({ bucket: bucketName, imageId }, "Deleted image %s from %s", imageId, bucketName);
	}

	/**
	 * Check if an image exists.
	 * Uses HEAD request to avoid downloading the entire file.
	 * @param imageId - Full S3 key path (e.g., "tenant/org/_default/uuid.png")
	 */
	async function imageExists(imageId: string): Promise<boolean> {
		const bucketName = getBucketName();

		try {
			await client.send(
				new HeadObjectCommand({
					Bucket: bucketName,
					Key: imageId,
				}),
			);
			return true;
		} catch (error) {
			if (isNotFoundError(error)) {
				return false;
			}
			throw error;
		}
	}

	return {
		uploadImage,
		getSignedUrl: getSignedImageUrl,
		downloadImage,
		deleteImage,
		imageExists,
	};
}

/**
 * Check if an error is a "not found" error (404 or NoSuchBucket/NoSuchKey).
 */
function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
	return (
		err.name === "NotFound" ||
		err.name === "NoSuchBucket" ||
		err.name === "NoSuchKey" ||
		err.$metadata?.httpStatusCode === 404
	);
}
