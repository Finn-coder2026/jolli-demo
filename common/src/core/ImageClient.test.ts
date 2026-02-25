import type { ClientAuth } from "./Client";
import { createImageClient } from "./ImageClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create a mock auth object
function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

// Helper to create a mock auth object that returns no headers (to test fallback)
function createMockAuthWithoutHeaders(): ClientAuth {
	return {
		createRequest: (method, _body, additional) => {
			return {
				method,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
	};
}

describe("ImageClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all image methods", () => {
		const client = createImageClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.uploadImage).toBeDefined();
		expect(client.deleteImage).toBeDefined();
	});

	describe("uploadImage", () => {
		it("should upload a File with its name", async () => {
			const mockResult = {
				imageId: "tenant/org/_default/uuid.png",
				url: "/api/images/tenant/org/_default/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const file = new File(["test"], "test.png", { type: "image/png" });
			const result = await client.uploadImage(file);

			expect(result).toEqual(mockResult);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					method: "POST",
					body: file,
					headers: expect.objectContaining({
						"Content-Type": "image/png",
						"X-Original-Filename": "test.png",
					}),
				}),
			);
		});

		it("should upload a Blob with custom filename", async () => {
			const mockResult = {
				imageId: "tenant/org/_default/uuid.png",
				url: "/api/images/tenant/org/_default/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const blob = new Blob(["test"], { type: "image/jpeg" });
			const result = await client.uploadImage(blob, { filename: "custom.jpg" });

			expect(result).toEqual(mockResult);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					method: "POST",
					body: blob,
					headers: expect.objectContaining({
						"Content-Type": "image/jpeg",
						"X-Original-Filename": "custom.jpg",
					}),
				}),
			);
		});

		it("should upload with spaceId header when provided", async () => {
			const mockResult = {
				imageId: "tenant/org/my-space/uuid.png",
				url: "/api/images/tenant/org/my-space/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const file = new File(["test"], "test.png", { type: "image/png" });
			const result = await client.uploadImage(file, { spaceId: 42 });

			expect(result).toEqual(mockResult);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					method: "POST",
					body: file,
					headers: expect.objectContaining({
						"Content-Type": "image/png",
						"X-Original-Filename": "test.png",
						"X-Space-Id": "42",
					}),
				}),
			);
		});

		it("should upload with both filename and spaceId options", async () => {
			const mockResult = {
				imageId: "tenant/org/my-space/uuid.png",
				url: "/api/images/tenant/org/my-space/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const blob = new Blob(["test"], { type: "image/jpeg" });
			const result = await client.uploadImage(blob, { filename: "custom.jpg", spaceId: 123 });

			expect(result).toEqual(mockResult);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					method: "POST",
					body: blob,
					headers: expect.objectContaining({
						"Content-Type": "image/jpeg",
						"X-Original-Filename": "custom.jpg",
						"X-Space-Id": "123",
					}),
				}),
			);
		});

		it("should generate filename for Blob without custom name", async () => {
			const mockResult = {
				imageId: "tenant/org/_default/uuid.png",
				url: "/api/images/tenant/org/_default/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const blob = new Blob(["test"], { type: "image/png" });
			await client.uploadImage(blob);

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-Original-Filename": expect.stringMatching(/^image-\d+\.png$/),
					}),
				}),
			);
		});

		it("should use default Content-Type when file has no type", async () => {
			const mockResult = {
				imageId: "tenant/org/_default/uuid.png",
				url: "/api/images/tenant/org/_default/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const blob = new Blob(["test"]); // No type specified
			await client.uploadImage(blob, { filename: "noext" });

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					headers: expect.objectContaining({
						"Content-Type": "image/png",
					}),
				}),
			);
		});

		it("should throw Unauthorized when checkUnauthorized returns true", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: async () => ({ error: "Unauthorized" }),
			});
			global.fetch = mockFetch;

			const client = createImageClient(
				"http://localhost",
				createMockAuth(res => res.status === 401),
			);
			const file = new File(["test"], "test.png", { type: "image/png" });

			await expect(client.uploadImage(file)).rejects.toThrow("Unauthorized");
		});

		it("should throw error with server message on failure", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				json: async () => ({ error: "File too large" }),
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const file = new File(["test"], "test.png", { type: "image/png" });

			await expect(client.uploadImage(file)).rejects.toThrow("File too large");
		});

		it("should throw default error when server response has no error message", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const file = new File(["test"], "test.png", { type: "image/png" });

			await expect(client.uploadImage(file)).rejects.toThrow("Failed to upload image");
		});

		it("should handle JSON parse failure on error response", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.reject(new Error("Invalid JSON")),
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			const file = new File(["test"], "test.png", { type: "image/png" });

			await expect(client.uploadImage(file)).rejects.toThrow("Upload failed");
		});

		it("should handle auth that returns no headers", async () => {
			const mockResult = {
				imageId: "tenant/org/_default/uuid.png",
				url: "/api/images/tenant/org/_default/uuid.png",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResult,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuthWithoutHeaders());
			const file = new File(["test"], "test.png", { type: "image/png" });
			const result = await client.uploadImage(file);

			expect(result).toEqual(mockResult);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images",
				expect.objectContaining({
					method: "POST",
					body: file,
					headers: expect.objectContaining({
						"Content-Type": "image/png",
						"X-Original-Filename": "test.png",
					}),
				}),
			);
		});
	});

	describe("deleteImage", () => {
		it("should delete an image successfully", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());
			await client.deleteImage("tenant/org/_default/uuid.png");

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/images/tenant/org/_default/uuid.png",
				expect.objectContaining({
					method: "DELETE",
				}),
			);
		});

		it("should throw Unauthorized when checkUnauthorized returns true", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: async () => ({ error: "Unauthorized" }),
			});
			global.fetch = mockFetch;

			const client = createImageClient(
				"http://localhost",
				createMockAuth(res => res.status === 401),
			);

			await expect(client.deleteImage("tenant/org/_default/uuid.png")).rejects.toThrow("Unauthorized");
		});

		it("should throw error with server message on failure", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				json: async () => ({ error: "Image not found" }),
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());

			await expect(client.deleteImage("tenant/org/_default/uuid.png")).rejects.toThrow("Image not found");
		});

		it("should throw default error when server response has no error message", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());

			await expect(client.deleteImage("tenant/org/_default/uuid.png")).rejects.toThrow("Failed to delete image");
		});

		it("should handle JSON parse failure on error response", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.reject(new Error("Invalid JSON")),
			});
			global.fetch = mockFetch;

			const client = createImageClient("http://localhost", createMockAuth());

			await expect(client.deleteImage("tenant/org/_default/uuid.png")).rejects.toThrow("Delete failed");
		});
	});
});
