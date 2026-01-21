import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/images";

export interface ImageUploadResult {
	imageId: string;
	url: string;
}

export interface ImageClient {
	/**
	 * Upload an image to the server.
	 * Tenant routing is handled automatically via JWT authentication.
	 * @param file - File or Blob to upload
	 * @param filename - Optional filename (used for pasted images)
	 */
	uploadImage(file: File | Blob, filename?: string): Promise<ImageUploadResult>;

	/**
	 * Delete an image from the server.
	 * @param imageId - The full image ID path (e.g., "tenant/org/_default/uuid.ext")
	 */
	deleteImage(imageId: string): Promise<void>;
}

export function createImageClient(baseUrl: string, auth: ClientAuth): ImageClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	return {
		uploadImage,
		deleteImage,
	};

	async function uploadImage(file: File | Blob, filename?: string): Promise<ImageUploadResult> {
		// Determine filename
		const finalFilename = filename ?? (file instanceof File ? file.name : `image-${Date.now()}.png`);

		// Get base request config (includes auth headers, credentials, org slug, etc.)
		const baseRequest = auth.createRequest("POST", undefined);

		// Override body and Content-Type for binary upload, merge headers
		const requestInit: RequestInit = {
			...baseRequest,
			body: file,
			headers: {
				...baseRequest.headers,
				"Content-Type": file.type || "image/png",
				"X-Original-Filename": finalFilename,
			},
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
