import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/images";

export interface ImageUploadResult {
	imageId: string;
	url: string;
}

export interface ImageUploadOptions {
	/** Optional filename (used for pasted images) */
	filename?: string;
	/** Optional space ID for space-scoped uploads. If not provided, image is org-wide (legacy). */
	spaceId?: number | undefined;
}

export interface ImageClient {
	/**
	 * Upload an image to the server.
	 * Tenant routing is handled automatically via JWT authentication.
	 * @param file - File or Blob to upload
	 * @param options - Upload options (filename, spaceId)
	 */
	uploadImage(file: File | Blob, options?: ImageUploadOptions): Promise<ImageUploadResult>;

	/**
	 * Delete an image from the server.
	 * @param imageId - The full image ID path (e.g., "tenant/org/space-slug/uuid.ext")
	 */
	deleteImage(imageId: string): Promise<void>;
}

export function createImageClient(baseUrl: string, auth: ClientAuth): ImageClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	return {
		uploadImage,
		deleteImage,
	};

	async function uploadImage(file: File | Blob, options?: ImageUploadOptions): Promise<ImageUploadResult> {
		// Determine filename
		const finalFilename = options?.filename ?? (file instanceof File ? file.name : `image-${Date.now()}.png`);

		// Get base request config (includes auth headers, credentials, org slug, etc.)
		const baseRequest = auth.createRequest("POST", undefined);

		// Build headers with optional space ID for space-scoped uploads
		// Cast baseRequest.headers to Record since our auth implementation returns that type
		const baseHeaders = (baseRequest.headers ?? {}) as Record<string, string>;
		const headers: Record<string, string> = {
			...baseHeaders,
			"Content-Type": file.type || "image/png",
			"X-Original-Filename": finalFilename,
		};

		// Add space ID header if provided for space-scoped uploads
		if (options?.spaceId !== undefined) {
			headers["X-Space-Id"] = options.spaceId.toString();
		}

		// Override body and Content-Type for binary upload, merge headers
		const requestInit: RequestInit = {
			...baseRequest,
			body: file,
			headers,
		};

		// Tenant routing handled automatically by backend via JWT middleware
		const response = await fetch(basePath, requestInit);

		if (auth.checkUnauthorized?.(response)) {
			throw new Error("Unauthorized");
		}

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ error: "Upload failed" }))) as { error: string };
			throw new Error(error.error || "Failed to upload image");
		}

		return (await response.json()) as ImageUploadResult;
	}

	async function deleteImage(imageId: string): Promise<void> {
		const response = await fetch(`${basePath}/${imageId}`, auth.createRequest("DELETE"));

		if (auth.checkUnauthorized?.(response)) {
			throw new Error("Unauthorized");
		}

		if (!response.ok) {
			const error = (await response.json().catch(() => ({ error: "Delete failed" }))) as { error: string };
			throw new Error(error.error || "Failed to delete image");
		}
	}
}
