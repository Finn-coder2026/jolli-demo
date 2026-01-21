import type { ClientAuth } from "./Client";
import { createDocsiteClient } from "./DocsiteClient";
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

describe("DocsiteClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all docsite methods", () => {
		const client = createDocsiteClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.listDocsites).toBeDefined();
		expect(client.getDocsite).toBeDefined();
		expect(client.createDocsite).toBeDefined();
		expect(client.updateDocsite).toBeDefined();
		expect(client.deleteDocsite).toBeDefined();
		expect(client.generateDocsite).toBeDefined();
		expect(client.generateDocsiteFromRepos).toBeDefined();
	});

	describe("listDocsites", () => {
		it("should list all docsites", async () => {
			const mockDocsites = [
				{
					id: 1,
					name: "test-docs",
					displayName: "Test Documentation",
					userId: 123,
					visibility: "internal" as const,
					status: "active" as const,
					metadata: {
						repos: [{ repo: "owner/repo", branch: "main" }],
						deployments: [],
					},
					createdAt: new Date("2025-01-01T00:00:00Z"),
					updatedAt: new Date("2025-01-01T00:00:00Z"),
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocsites,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.listDocsites();

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockDocsites);
		});

		it("should throw error when listing fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Internal Server Error" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(client.listDocsites()).rejects.toThrow("Internal Server Error");
		});

		it("should throw error with statusText when json parsing fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Gateway",
				json: async () => {
					return await Promise.reject(new Error("Invalid JSON"));
				},
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(client.listDocsites()).rejects.toThrow("Bad Gateway");
		});
	});

	describe("getDocsite", () => {
		it("should get a docsite by id", async () => {
			const mockDocsite = {
				id: 1,
				name: "test-docs",
				displayName: "Test Documentation",
				userId: 123,
				visibility: "internal" as const,
				status: "active" as const,
				metadata: {
					repos: [{ repo: "owner/repo", branch: "main" }],
					deployments: [],
				},
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocsite,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.getDocsite(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites/1", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockDocsite);
		});

		it("should return undefined when docsite not found", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.getDocsite(999);

			expect(result).toBeUndefined();
		});

		it("should throw error when get fails with non-404 error", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Internal Server Error" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(client.getDocsite(1)).rejects.toThrow("Internal Server Error");
		});
	});

	describe("createDocsite", () => {
		it("should create a site", async () => {
			const mockDocsite = {
				id: 1,
				name: "test-docs",
				displayName: "Test Documentation",
				userId: 123,
				visibility: "internal" as const,
				status: "pending" as const,
				metadata: undefined,
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocsite,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.createDocsite({
				name: "test-docs",
				displayName: "Test Documentation",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					name: "test-docs",
					displayName: "Test Documentation",
				}),
			});
			expect(result).toEqual(mockDocsite);
		});

		it("should throw error when creation fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
				json: async () => ({ error: "Bad Request" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(
				client.createDocsite({
					name: "test-docs",
					displayName: "Test Documentation",
				}),
			).rejects.toThrow("Bad Request");
		});
	});

	describe("updateDocsite", () => {
		it("should update an existing docsite", async () => {
			const mockDocsite = {
				id: 1,
				name: "test-docs",
				displayName: "Updated Documentation",
				userId: 123,
				visibility: "external" as const,
				status: "active" as const,
				metadata: undefined,
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocsite,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.updateDocsite(1, {
				id: 1,
				displayName: "Updated Documentation",
				visibility: "external",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites/1", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					id: 1,
					displayName: "Updated Documentation",
					visibility: "external",
				}),
			});
			expect(result).toEqual(mockDocsite);
		});

		it("should throw error when update fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({ error: "Not Found" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(
				client.updateDocsite(999, {
					id: 999,
					displayName: "Updated",
				}),
			).rejects.toThrow("Not Found");
		});
	});

	describe("deleteDocsite", () => {
		it("should delete a docsite", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			await client.deleteDocsite(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites/1", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
		});

		it("should throw error when deletion fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
				json: async () => ({ error: "Not Found" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(client.deleteDocsite(999)).rejects.toThrow("Not Found");
		});
	});

	describe("generateDocsite", () => {
		it("should generate a docsite from integration", async () => {
			const mockDocsite = {
				id: 1,
				name: "generated-docs",
				displayName: "Generated Documentation",
				userId: 123,
				visibility: "external" as const,
				status: "building" as const,
				metadata: {
					repos: [
						{
							repo: "owner/repo",
							branch: "main",
							integrationId: 1,
						},
					],
					deployments: [
						{
							environment: "production" as const,
							url: "https://generated-docs.vercel.app",
							deploymentId: "dpl_123",
							deployedAt: "2025-01-01T00:00:00Z",
							status: "ready" as const,
						},
					],
					framework: "docusaurus-2",
					buildCommand: "npm run build",
					outputDirectory: "build",
					lastBuildAt: "2025-01-01T00:00:00Z",
					lastDeployedAt: "2025-01-01T00:00:00Z",
				},
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocsite,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.generateDocsite({
				integrationIds: [1],
				name: "generated-docs",
				displayName: "Generated Documentation",
				visibility: "external",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites/generate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					integrationIds: [1],
					name: "generated-docs",
					displayName: "Generated Documentation",
					visibility: "external",
				}),
			});
			expect(result).toEqual(mockDocsite);
		});

		it("should throw error when generation fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Internal Server Error" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(
				client.generateDocsite({
					integrationIds: [1],
					name: "test",
					displayName: "Test",
				}),
			).rejects.toThrow("Internal Server Error");
		});
	});

	describe("generateDocsiteFromRepos", () => {
		it("should generate a docsite from repositories", async () => {
			const mockDocsite = {
				id: 1,
				name: "generated-docs",
				displayName: "Generated Documentation",
				userId: 123,
				visibility: "external" as const,
				status: "building" as const,
				metadata: {
					repos: [
						{
							repo: "owner/repo",
							branch: "main",
							integrationId: 1,
						},
					],
					deployments: [],
				},
				createdAt: new Date("2025-01-01T00:00:00Z"),
				updatedAt: new Date("2025-01-01T00:00:00Z"),
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockDocsite,
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());
			const result = await client.generateDocsiteFromRepos({
				repositories: [{ fullName: "owner/repo", defaultBranch: "main" }],
				name: "generated-docs",
				displayName: "Generated Documentation",
				visibility: "external",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/docsites/generate-from-repos", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					repositories: [{ fullName: "owner/repo", defaultBranch: "main" }],
					name: "generated-docs",
					displayName: "Generated Documentation",
					visibility: "external",
				}),
			});
			expect(result).toEqual(mockDocsite);
		});

		it("should throw error when generation from repos fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
				json: async () => ({ error: "Internal Server Error" }),
			});
			global.fetch = mockFetch;

			const client = createDocsiteClient("", createMockAuth());

			await expect(
				client.generateDocsiteFromRepos({
					repositories: [{ fullName: "owner/repo", defaultBranch: "main" }],
					name: "test",
					displayName: "Test",
				}),
			).rejects.toThrow("Internal Server Error");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for listDocsites", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => [] };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.listDocsites();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getDocsite", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.getDocsite(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for createDocsite", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.createDocsite({ name: "test", displayName: "Test" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for updateDocsite", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.updateDocsite(1, { id: 1, displayName: "Updated" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for deleteDocsite", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.deleteDocsite(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for generateDocsite", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.generateDocsite({ integrationIds: [1], name: "test", displayName: "Test" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for generateDocsiteFromRepos", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createDocsiteClient("", createMockAuth(checkUnauthorized));
			await client.generateDocsiteFromRepos({
				repositories: [{ fullName: "owner/repo", defaultBranch: "main" }],
				name: "test",
				displayName: "Test",
			});

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
