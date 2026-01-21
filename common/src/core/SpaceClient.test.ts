import type { ClientAuth } from "./Client";
import { createSpaceClient } from "./SpaceClient";
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

describe("SpaceClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all space methods", () => {
		const client = createSpaceClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.listSpaces).toBeDefined();
		expect(client.getDefaultSpace).toBeDefined();
		expect(client.getSpace).toBeDefined();
		expect(client.createSpace).toBeDefined();
		expect(client.updateSpace).toBeDefined();
		expect(client.deleteSpace).toBeDefined();
		expect(client.getTreeContent).toBeDefined();
		expect(client.getTrashContent).toBeDefined();
		expect(client.hasTrash).toBeDefined();
	});

	describe("listSpaces", () => {
		it("should fetch list of spaces", async () => {
			const mockSpaces = [
				{
					id: 1,
					name: "Space 1",
					slug: "test-space",
					jrn: "space:space1",
					description: undefined,
					ownerId: 1,
					defaultSort: "default",
					defaultFilters: {},
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockSpaces,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.listSpaces();

			expect(result).toEqual(mockSpaces);
			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/spaces", expect.any(Object));
		});

		it("should throw error when listSpaces fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.listSpaces()).rejects.toThrow("Failed to list spaces: Internal Server Error");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => [],
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.listSpaces();

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("getDefaultSpace", () => {
		it("should fetch default space", async () => {
			const mockSpace = {
				id: 1,
				name: "default",
				slug: "test-space",
				jrn: "space:default",
				description: undefined,
				ownerId: 1,
				defaultSort: "default",
				defaultFilters: {},
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockSpace,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.getDefaultSpace();

			expect(result).toEqual(mockSpace);
			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/spaces/default", expect.any(Object));
		});

		it("should throw error when getDefaultSpace fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.getDefaultSpace()).rejects.toThrow("Failed to get default space: Not Found");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getDefaultSpace();

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("getSpace", () => {
		it("should fetch space by id", async () => {
			const mockSpace = {
				id: 2,
				name: "My Space",
				slug: "test-space",
				jrn: "space:myspace",
				description: "Test space",
				ownerId: 1,
				defaultSort: "default",
				defaultFilters: {},
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockSpace,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.getSpace(2);

			expect(result).toEqual(mockSpace);
			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/spaces/2", expect.any(Object));
		});

		it("should return undefined when space not found", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.getSpace(999);

			expect(result).toBeUndefined();
		});

		it("should throw error when getSpace fails with non-404 error", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.getSpace(1)).rejects.toThrow("Failed to get space: Internal Server Error");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getSpace(1);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("createSpace", () => {
		it("should create a new space", async () => {
			const newSpace = {
				name: "New Space",
				slug: "test-space",
				description: "A new space",
				ownerId: 1,
				defaultSort: "default" as const,
				defaultFilters: {},
			};

			const mockCreatedSpace = {
				id: 3,
				name: "New Space",
				slug: "test-space",
				jrn: "space:newspace",
				description: "A new space",
				ownerId: 1,
				defaultSort: "default",
				defaultFilters: {},
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockCreatedSpace,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.createSpace(newSpace);

			expect(result).toEqual(mockCreatedSpace);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/spaces",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("should throw error when createSpace fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(
				client.createSpace({
					name: "Test",
					slug: "test-space",
					description: undefined,
					ownerId: 1,
					defaultSort: "default",
					defaultFilters: {},
				}),
			).rejects.toThrow("Failed to create space: Bad Request");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.createSpace({
				name: "Test",
				slug: "test-space",
				description: undefined,
				ownerId: 1,
				defaultSort: "default",
				defaultFilters: {},
			});

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("updateSpace", () => {
		it("should update an existing space", async () => {
			const updateData = {
				name: "Updated Space",
				description: "Updated description",
			};

			const mockUpdatedSpace = {
				id: 1,
				name: "Updated Space",
				slug: "test-space",
				jrn: "space:updated",
				description: "Updated description",
				ownerId: 1,
				defaultSort: "default",
				defaultFilters: {},
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-02T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUpdatedSpace,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.updateSpace(1, updateData);

			expect(result).toEqual(mockUpdatedSpace);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/spaces/1",
				expect.objectContaining({ method: "PUT" }),
			);
		});

		it("should return undefined when space not found", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.updateSpace(999, { name: "Test" });

			expect(result).toBeUndefined();
		});

		it("should throw error when updateSpace fails with non-404 error", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.updateSpace(1, { name: "Test" })).rejects.toThrow(
				"Failed to update space: Internal Server Error",
			);
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.updateSpace(1, { name: "Test" });

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("deleteSpace", () => {
		it("should delete a space", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			await client.deleteSpace(1);

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost/api/spaces/1",
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("should throw error when deleteSpace fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.deleteSpace(1)).rejects.toThrow("Failed to delete space: Forbidden");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.deleteSpace(1);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("getTreeContent", () => {
		it("should fetch tree content for a space", async () => {
			const mockDocs = [
				{
					id: 1,
					jrn: "doc:test",
					content: "Test",
					contentType: "text/markdown",
					spaceId: 1,
					parentId: undefined,
					isFolder: false,
					sortOrder: 0,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocs,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.getTreeContent(1);

			expect(result).toEqual(mockDocs);
			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/spaces/1/tree", expect.any(Object));
		});

		it("should throw error when getTreeContent fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.getTreeContent(1)).rejects.toThrow("Failed to get tree content: Not Found");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => [],
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getTreeContent(1);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("getTrashContent", () => {
		it("should fetch trash content for a space", async () => {
			const mockTrashDocs = [
				{
					id: 2,
					jrn: "doc:deleted",
					content: "Deleted",
					contentType: "text/markdown",
					spaceId: 1,
					parentId: undefined,
					isFolder: false,
					sortOrder: 0,
					deletedAt: "2024-01-02T00:00:00Z",
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockTrashDocs,
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.getTrashContent(1);

			expect(result).toEqual(mockTrashDocs);
			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/spaces/1/trash", expect.any(Object));
		});

		it("should throw error when getTrashContent fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.getTrashContent(1)).rejects.toThrow(
				"Failed to get trash content: Internal Server Error",
			);
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => [],
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getTrashContent(1);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("hasTrash", () => {
		it("should return true when space has trash", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ hasTrash: true }),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.hasTrash(1);

			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/spaces/1/has-trash", expect.any(Object));
		});

		it("should return false when space has no trash", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ hasTrash: false }),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());
			const result = await client.hasTrash(1);

			expect(result).toBe(false);
		});

		it("should throw error when hasTrash fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth());

			await expect(client.hasTrash(1)).rejects.toThrow("Failed to check trash: Bad Request");
		});

		it("should call checkUnauthorized", async () => {
			const checkUnauthorized = vi.fn();
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ hasTrash: false }),
			});
			global.fetch = mockFetch;

			const client = createSpaceClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.hasTrash(1);

			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});
});
