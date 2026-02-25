import type { ClientAuth } from "./Client";
import { createDocClient } from "./DocClient";
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

describe("DocClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all doc methods", () => {
		const client = createDocClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.createDoc).toBeDefined();
		expect(client.listDocs).toBeDefined();
		expect(client.findDoc).toBeDefined();
		expect(client.updateDoc).toBeDefined();
		expect(client.deleteDoc).toBeDefined();
		expect(client.clearAll).toBeDefined();
		expect(client.search).toBeDefined();
		expect(client.reorderDoc).toBeDefined();
	});

	describe("createDoc", () => {
		it("should create a new document", async () => {
			const mockDoc = {
				id: 1,
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Test content",
				contentType: "text/plain",
				contentMetadata: undefined,
				version: 1,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
				deletedAt: undefined,
				explicitlyDeleted: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.createDoc({
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Test content",
				contentType: "text/plain",
				contentMetadata: undefined,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/docs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: expect.any(String),
			});
			expect(result).toEqual(mockDoc);
		});

		it("should throw error when creation fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createDocClient("", createMockAuth());

			await expect(
				client.createDoc({
					jrn: "jrn:doc:test",
					slug: "test-slug",
					path: "",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Test",
					contentType: "text/plain",
					contentMetadata: undefined,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
				}),
			).rejects.toThrow("Failed to create document: Bad Request");
		});

		it("should use custom baseUrl when provided", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ id: 1 }),
			});
			global.fetch = mockFetch;

			const client = createDocClient("https://example.com", createMockAuth());
			await client.createDoc({
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Test",
				contentType: "text/plain",
				contentMetadata: undefined,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
			});

			expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/docs", expect.any(Object));
		});
	});

	describe("listDocs", () => {
		it("should list all documents", async () => {
			const mockDocs = [
				{
					id: 1,
					jrn: "jrn:doc:1",
					slug: "test-slug-1",
					path: "",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Doc 1",
					contentType: "text/plain",
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
				{
					id: 2,
					jrn: "jrn:doc:2",
					slug: "test-slug-2",
					path: "",
					createdAt: "2024-01-02T00:00:00Z",
					updatedAt: "2024-01-02T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Doc 2",
					contentType: "text/plain",
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocs,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.listDocs();

			expect(mockFetch).toHaveBeenCalledWith("/api/docs", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockDocs);
			expect(result.length).toBe(2);
		});

		it("should throw error when listing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Unauthorized",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.listDocs()).rejects.toThrow("Failed to list documents: Unauthorized");
		});

		it("should list documents with startsWithJrn filter", async () => {
			const mockDocs = [
				{
					id: 1,
					jrn: "/docsite/123/doc1",
					slug: "docsite-123-doc1",
					path: "",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Doc 1",
					contentType: "text/plain",
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocs,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.listDocs({ startsWithJrn: "/docsite/123/" });

			expect(mockFetch).toHaveBeenCalledWith("/api/docs?startsWithJrn=%2Fdocsite%2F123%2F", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockDocs);
		});

		it("should list documents with includeRoot filter", async () => {
			const mockDocs = [
				{
					id: 1,
					jrn: "/root/internal/doc",
					slug: "root-internal-doc",
					path: "",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Internal Doc",
					contentType: "text/plain",
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocs,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.listDocs({ includeRoot: true });

			expect(mockFetch).toHaveBeenCalledWith("/api/docs?includeRoot=true", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockDocs);
		});

		it("should list documents with both startsWithJrn and includeRoot filters", async () => {
			const mockDocs = [
				{
					id: 1,
					jrn: "/root/scripts/doc1",
					slug: "root-scripts-doc1",
					path: "",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Script Doc",
					contentType: "text/plain",
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocs,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.listDocs({ startsWithJrn: "/root/scripts", includeRoot: true });

			expect(mockFetch).toHaveBeenCalledWith("/api/docs?startsWithJrn=%2Froot%2Fscripts&includeRoot=true", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockDocs);
		});
	});

	describe("findDoc", () => {
		it("should find a specific document by ARN", async () => {
			const mockDoc = {
				id: 1,
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Test content",
				contentType: "text/plain",
				contentMetadata: undefined,
				version: 1,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
				deletedAt: undefined,
				explicitlyDeleted: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.findDoc("jrn:doc:test");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/jrn%3Adoc%3Atest", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should return undefined when document not found", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const client = createDocClient("", createMockAuth());
			const result = await client.findDoc("jrn:doc:nonexistent");

			expect(result).toBeUndefined();
		});

		it("should throw error when fetch fails with non-404 error", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.findDoc("jrn:doc:test")).rejects.toThrow(
				"Failed to get document: Internal Server Error",
			);
		});
	});

	describe("getDocById", () => {
		it("should get a document by ID", async () => {
			const mockDoc = {
				id: 123,
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Test content",
				contentType: "text/plain",
				contentMetadata: undefined,
				version: 1,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
				deletedAt: undefined,
				explicitlyDeleted: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.getDocById(123);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/id/123", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should return undefined when document not found", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
			});

			const client = createDocClient("", createMockAuth());
			const result = await client.getDocById(999);

			expect(result).toBeUndefined();
		});

		it("should throw error when fetch fails with non-404 error", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.getDocById(123)).rejects.toThrow("Failed to get document by ID: Internal Server Error");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.getDocById(123);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("updateDoc", () => {
		it("should update a document", async () => {
			const docToUpdate = {
				id: 1,
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-02T00:00:00Z",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Updated content",
				contentType: "text/plain",
				contentMetadata: undefined,
				version: 2,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
				deletedAt: undefined,
				explicitlyDeleted: false,
			};

			const mockUpdated = {
				id: 1,
				jrn: "jrn:doc:test",
				slug: "test-slug",
				path: "",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-02T00:00:00Z",
				updatedBy: "test@example.com",
				source: undefined,
				sourceMetadata: undefined,
				content: "Updated content",
				contentType: "text/plain",
				contentMetadata: undefined,
				version: 2,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test@example.com",
				deletedAt: undefined,
				explicitlyDeleted: false,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUpdated,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.updateDoc(docToUpdate);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/jrn%3Adoc%3Atest", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(docToUpdate),
			});
			expect(result).toEqual(mockUpdated);
		});

		it("should throw error when update fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Conflict",
			});

			const client = createDocClient("", createMockAuth());

			await expect(
				client.updateDoc({
					id: 1,
					jrn: "jrn:doc:test",
					slug: "test-slug",
					path: "",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-02T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					content: "Updated",
					contentType: "text/plain",
					contentMetadata: undefined,
					version: 2,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				}),
			).rejects.toThrow("Failed to update document: Conflict");
		});
	});

	describe("deleteDoc", () => {
		it("should delete a document", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			await client.deleteDoc("jrn:doc:test");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/jrn%3Adoc%3Atest", {
				method: "DELETE",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should throw error when deletion fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.deleteDoc("jrn:doc:nonexistent")).rejects.toThrow(
				"Failed to delete document: Not Found",
			);
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.deleteDoc("jrn:doc:test");

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("softDelete", () => {
		it("should soft delete a document by id", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			await client.softDelete(123);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/123/soft-delete", {
				method: "POST",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should throw error when soft delete fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.softDelete(123)).rejects.toThrow(
				"Failed to soft delete document: Internal Server Error",
			);
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.softDelete(123);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("restore", () => {
		it("should restore a soft deleted document", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			await client.restore(456);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/456/restore", {
				method: "POST",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should throw error when restore fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.restore(456)).rejects.toThrow("Failed to restore document: Not Found");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.restore(456);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("renameDoc", () => {
		it("should rename a document by id", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				contentMetadata: { title: "New Title" },
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.renameDoc(1, "New Title");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/rename", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: "New Title" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should throw error when rename fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.renameDoc(999, "New Title")).rejects.toThrow("Failed to rename document: Not Found");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockDoc = { id: 1, jrn: "doc:test" };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.renameDoc(1, "New Title");

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("reorderDoc", () => {
		it("should reorder a document up", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				sortOrder: 0,
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderDoc(1, "up");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ direction: "up" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should reorder a document down", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				sortOrder: 2,
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderDoc(1, "down");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ direction: "down" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should return undefined when document is at boundary", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
			});

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderDoc(1, "up");

			expect(result).toBeUndefined();
		});

		it("should throw error when reorder fails with non-400 error", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.reorderDoc(1, "up")).rejects.toThrow(
				"Failed to reorder document: Internal Server Error",
			);
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockDoc = { id: 1, jrn: "doc:test", sortOrder: 0 };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.reorderDoc(1, "up");

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("moveDoc", () => {
		it("should move a document to another folder", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				parentId: 2,
				path: "/folder-b/doc",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.moveDoc(1, 2);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/move", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ parentId: 2 }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should move a document to root level (parentId null)", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				parentId: undefined,
				path: "/doc",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.moveDoc(1, null);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/move", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ parentId: null }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should move a document with referenceDocId and position for positioning", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				parentId: 2,
				path: "/folder-b/doc",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.moveDoc(1, 2, 3, "after");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/move", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ parentId: 2, referenceDocId: 3, position: "after" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should move a document with referenceDocId null (end of folder)", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				parentId: 2,
				path: "/folder-b/doc",
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.moveDoc(1, 2, null);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/move", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ parentId: 2, referenceDocId: null }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should throw error with message from server on validation failure", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({ error: "Cannot move folder to its descendant" }),
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.moveDoc(1, 2)).rejects.toThrow("Cannot move folder to its descendant");
		});

		it("should throw generic error when no error message in response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}),
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.moveDoc(1, 2)).rejects.toThrow("Failed to move document: Internal Server Error");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockDoc = { id: 1, jrn: "doc:test", parentId: 2 };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.moveDoc(1, 2);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("reorderAt", () => {
		it("should reorder document after another document", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				sortOrder: 1.5,
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderAt(1, 2, "after");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder-at", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ referenceDocId: 2, position: "after" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should reorder document before another document", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				sortOrder: 0.5,
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderAt(1, 2, "before");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder-at", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ referenceDocId: 2, position: "before" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should move to end of folder (referenceDocId null)", async () => {
			const mockDoc = {
				id: 1,
				jrn: "doc:test",
				sortOrder: 10,
			};
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderAt(1, null, "after");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder-at", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ referenceDocId: null, position: "after" }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should throw error when document not found (400 response)", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({ error: "Document not found" }),
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.reorderAt(999, 2, "after")).rejects.toThrow("Document not found");
		});

		it("should throw generic error when 400 response has no error message", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({}),
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.reorderAt(999, 2, "after")).rejects.toThrow("Failed to reorder document: Bad Request");
		});

		it("should throw error with message from server on other failures", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Database error" }),
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.reorderAt(1, 2, "after")).rejects.toThrow("Database error");
		});

		it("should throw generic error when no error message in response", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({}),
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.reorderAt(1, 2, "after")).rejects.toThrow(
				"Failed to reorder document: Internal Server Error",
			);
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockDoc = { id: 1, jrn: "doc:test", sortOrder: 1.5 };
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});

			const client = createDocClient("", createMockAuth(checkUnauthorized));
			await client.reorderAt(1, 2, "after");

			expect(checkUnauthorized).toHaveBeenCalled();
		});

		it("should send empty body when no parameters provided", async () => {
			const mockDoc = { id: 1, jrn: "doc:test", sortOrder: 10 };
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderAt(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder-at", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});

		it("should only send referenceDocId when position not provided", async () => {
			const mockDoc = { id: 1, jrn: "doc:test", sortOrder: 1.5 };
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDoc,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.reorderAt(1, 2);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/by-id/1/reorder-at", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ referenceDocId: 2 }),
				credentials: "include",
			});
			expect(result).toEqual(mockDoc);
		});
	});

	describe("clearAll", () => {
		it("should clear all documents", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			await client.clearAll();

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/clearAll", {
				method: "DELETE",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should throw error when clearAll fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.clearAll()).rejects.toThrow("Failed to clear all documents: Forbidden");
		});
	});

	describe("search", () => {
		it("should search documents", async () => {
			const mockSearchResult = {
				chunks: [
					{
						id: 1,
						docId: 1,
						content: "matching content",
						embedding: [0.1, 0.2, 0.3],
						version: 1,
					},
					{
						id: 2,
						docId: 2,
						content: "another match",
						embedding: [0.4, 0.5, 0.6],
						version: 1,
					},
				],
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockSearchResult,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.search({
				query: "test query",
				limit: 5,
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					query: "test query",
					limit: 5,
				}),
			});
			expect(result).toEqual(mockSearchResult);
			expect(result.chunks.length).toBe(2);
		});

		it("should search with default limit", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ chunks: [] }),
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			await client.search({ query: "test" });

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/search", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ query: "test" }),
			});
		});

		it("should throw error when search fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.search({ query: "test" })).rejects.toThrow("Failed to search documents: Bad Request");
		});
	});

	describe("searchByTitle", () => {
		it("should search documents by title", async () => {
			const mockDocs = [
				{
					id: 1,
					jrn: "article:my-test-article-123",
					slug: "my-test-article-123",
					path: "",
					content: "content1",
					contentType: "text/plain",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
				{
					id: 2,
					jrn: "article:my-test-article-456",
					slug: "my-test-article-456",
					path: "",
					content: "content2",
					contentType: "text/plain",
					createdAt: "2024-01-02T00:00:00Z",
					updatedAt: "2024-01-02T00:00:00Z",
					updatedBy: "test@example.com",
					source: undefined,
					sourceMetadata: undefined,
					contentMetadata: undefined,
					version: 1,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					sortOrder: 0,
					createdBy: "test@example.com",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocs,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.searchByTitle("test");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/search-by-title", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ title: "test" }),
			});
			expect(result).toEqual(mockDocs);
		});

		it("should throw error when searchByTitle fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.searchByTitle("test")).rejects.toThrow(
				"Failed to search documents by title: Internal Server Error",
			);
		});
	});

	describe("searchArticlesForLink", () => {
		it("should search articles for link with title only", async () => {
			const mockResults = [
				{
					id: 1,
					jrn: "article:my-test-article-123",
					slug: "my-test-article-123",
					path: "",
					updatedAt: "2024-01-01T00:00:00Z",
					contentMetadata: undefined,
					parentFolderName: "Folder A",
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResults,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.searchArticlesForLink("test");

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/search-articles-for-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ title: "test" }),
			});
			expect(result).toEqual(mockResults);
		});

		it("should search articles for link with title and spaceId", async () => {
			const mockResults = [
				{
					id: 2,
					jrn: "article:my-test-article-456",
					slug: "my-test-article-456",
					path: "",
					updatedAt: "2024-01-02T00:00:00Z",
					contentMetadata: undefined,
					parentFolderName: null,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResults,
			});
			global.fetch = mockFetch;

			const client = createDocClient("", createMockAuth());
			const result = await client.searchArticlesForLink("test", 42);

			expect(mockFetch).toHaveBeenCalledWith("/api/docs/search-articles-for-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ title: "test", spaceId: 42 }),
			});
			expect(result).toEqual(mockResults);
		});

		it("should throw error when searchArticlesForLink fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.searchArticlesForLink("test")).rejects.toThrow(
				"Failed to search articles for link: Internal Server Error",
			);
		});
	});

	describe("createDraftFromArticle", () => {
		it("should create a draft from an article", async () => {
			const mockDraft = {
				id: 1,
				docId: 123,
				title: "Test Article",
				content: "Test content",
				createdBy: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDraft,
			});

			const client = createDocClient("", createMockAuth());

			const result = await client.createDraftFromArticle("article:test-123");

			expect(global.fetch).toHaveBeenCalledWith(
				"/api/docs/article%3Atest-123/create-draft",
				expect.objectContaining({
					method: "POST",
				}),
			);
			expect(result).toEqual(mockDraft);
		});

		it("should throw error when create draft fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createDocClient("", createMockAuth());

			await expect(client.createDraftFromArticle("article:nonexistent")).rejects.toThrow(
				"Failed to create draft from article: Not Found",
			);
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for all methods", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockDoc = { id: 1, jrn: "jrn:doc:test" };
			const mockResponse = { ok: true, status: 200, json: async () => mockDoc };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocClient("", createMockAuth(checkUnauthorized));

			await client.createDoc({
				jrn: "test",
				slug: "test-slug",
				path: "",
				content: "",
				contentType: "text/plain",
				updatedBy: "test",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "test",
			});
			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
			await client.listDocs();
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockDoc });
			await client.findDoc("jrn:doc:test");
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockDoc });
			await client.getDocById(1);
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => mockDoc });
			await client.updateDoc({
				id: 1,
				jrn: "test",
				slug: "test-slug",
				path: "",
				content: "",
				contentType: "text/plain",
				version: 1,
				createdAt: "",
				updatedAt: "",
				updatedBy: "",
				source: undefined,
				sourceMetadata: undefined,
				contentMetadata: undefined,
				spaceId: undefined,
				parentId: undefined,
				docType: "document" as const,
				sortOrder: 0,
				createdBy: "",
				deletedAt: undefined,
				explicitlyDeleted: false,
			});
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
			await client.deleteDoc("jrn:doc:test");
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
			await client.clearAll();
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ chunks: [] }) });
			await client.search({ query: "test" });
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
			await client.searchByTitle("test");
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
			await client.searchArticlesForLink("test");
			expect(checkUnauthorized).toHaveBeenCalled();

			checkUnauthorized.mockClear();
			global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) });
			await client.createDraftFromArticle("jrn:doc:test");
			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});
});
