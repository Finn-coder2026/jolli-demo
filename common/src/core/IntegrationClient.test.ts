import type { ClientAuth } from "./Client";
import { createIntegrationClient } from "./IntegrationClient";
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

describe("IntegrationClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all integration methods", () => {
		const client = createIntegrationClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.createIntegration).toBeDefined();
		expect(client.listIntegrations).toBeDefined();
		expect(client.getIntegration).toBeDefined();
		expect(client.updateIntegration).toBeDefined();
		expect(client.deleteIntegration).toBeDefined();
	});

	describe("create", () => {
		it("should create a new integration", async () => {
			const mockIntegration = {
				id: 1,
				type: "github" as const,
				name: "test-repo",
				status: "active" as const,
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
				},
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockIntegration,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.createIntegration({
				type: "github",
				name: "test-repo",
				status: "active",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
				},
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: expect.any(String),
			});
			expect(result).toEqual(mockIntegration);
		});

		it("should throw error when creation fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(
				client.createIntegration({
					type: "github",
					name: "test-repo",
					status: "active",
					metadata: undefined,
				}),
			).rejects.toThrow("Failed to create integration: Bad Request");
		});
	});

	describe("list", () => {
		it("should list all integrations", async () => {
			const mockIntegrations = [
				{
					id: 1,
					type: "github" as const,
					name: "repo1",
					status: "active" as const,
					metadata: undefined,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				},
				{
					id: 2,
					type: "github" as const,
					name: "repo2",
					status: "active" as const,
					metadata: undefined,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockIntegrations,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.listIntegrations();

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockIntegrations);
		});

		it("should throw error when listing fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(client.listIntegrations()).rejects.toThrow(
				"Failed to list integrations: Internal Server Error",
			);
		});
	});

	describe("get", () => {
		it("should get an integration by id", async () => {
			const mockIntegration = {
				id: 1,
				type: "github" as const,
				name: "test-repo",
				status: "active" as const,
				metadata: undefined,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockIntegration,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.getIntegration(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations/1", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockIntegration);
		});

		it("should return undefined when integration not found", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.getIntegration(999);

			expect(result).toBeUndefined();
		});

		it("should throw error when get fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(client.getIntegration(1)).rejects.toThrow("Failed to get integration: Internal Server Error");
		});
	});

	describe("update", () => {
		it("should update an integration", async () => {
			const mockIntegration = {
				id: 1,
				type: "github" as const,
				name: "updated-repo",
				status: "active" as const,
				metadata: undefined,
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockIntegration,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.updateIntegration(mockIntegration);

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations/1", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: expect.any(String),
			});
			expect(result).toEqual(mockIntegration);
		});

		it("should throw error when update fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(
				client.updateIntegration({
					id: 999,
					type: "github",
					name: "test",
					status: "active",
					metadata: undefined,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				}),
			).rejects.toThrow("Failed to update integration: Not Found");
		});
	});

	describe("delete", () => {
		it("should delete an integration", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			await client.deleteIntegration(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations/1", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
		});

		it("should throw error when delete fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(client.deleteIntegration(999)).rejects.toThrow("Failed to delete integration: Not Found");
		});
	});

	describe("checkAccess", () => {
		it("should check access for an integration", async () => {
			const mockResponse = {
				hasAccess: true,
				status: "active" as const,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.checkAccess(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations/1/check-access", {
				method: "POST",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when check access fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(client.checkAccess(1)).rejects.toThrow("Failed to check access: Internal Server Error");
		});
	});

	describe("uploadFile", () => {
		it("should upload a file to an integration", async () => {
			const mockResponse = {
				success: true,
				fileId: "file-123",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createIntegrationClient("", createMockAuth());
			const result = await client.uploadFile(1, {
				filename: "test.md",
				content: "# Test content",
				contentType: "text/markdown",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/integrations/1/upload", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: expect.any(String),
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when upload fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});

			const client = createIntegrationClient("", createMockAuth());

			await expect(
				client.uploadFile(1, {
					filename: "test.md",
					content: "# Test",
					contentType: "text/markdown",
				}),
			).rejects.toThrow("Failed to upload file: Bad Request");
		});

		it("should call checkUnauthorized for uploadFile", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.uploadFile(1, {
				filename: "test.md",
				content: "# Test",
				contentType: "text/markdown",
			});

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for createIntegration", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.createIntegration({ type: "github", name: "test", status: "active", metadata: undefined });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listIntegrations", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => [] };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.listIntegrations();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getIntegration", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, status: 200, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.getIntegration(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for updateIntegration", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.updateIntegration({
				id: 1,
				type: "github",
				name: "test",
				status: "active",
				metadata: undefined,
				createdAt: "2024-01-01",
				updatedAt: "2024-01-01",
			});

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for deleteIntegration", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.deleteIntegration(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for checkAccess", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ hasAccess: true, status: "active" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createIntegrationClient("", createMockAuth(checkUnauthorized));
			await client.checkAccess(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
