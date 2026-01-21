import type { ImageClient, ImageUploadResult } from "./ImageClient";

export function mockImageClient(partial?: Partial<ImageClient>): ImageClient {
	return {
		uploadImage: async (): Promise<ImageUploadResult> => ({
			imageId: "test-tenant/test-org/_default/test-image-id.png",
			url: "https://example.com/images/test-image-id.png",
		}),
		deleteImage: async () => void 0,
		...partial,
	};
}
