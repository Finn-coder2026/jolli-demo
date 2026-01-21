import type { ClientAuth } from "./Client";
import { createGitHubClient } from "./GitHubClient";
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

describe("GitHubClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all GitHub methods", () => {
		const client = createGitHubClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.setupGitHubRedirect).toBeDefined();
		expect(client.getGitHubSummary).toBeDefined();
		expect(client.getGitHubApps).toBeDefined();
		expect(client.getGitHubInstallations).toBeDefined();
		expect(client.syncGitHubInstallations).toBeDefined();
		expect(client.getInstallationRepos).toBeDefined();
		expect(client.enableRepo).toBeDefined();
		expect(client.disableRepo).toBeDefined();
		expect(client.deleteGitHubInstallation).toBeDefined();
		expect(client.listAvailableInstallations).toBeDefined();
		expect(client.connectExistingInstallation).toBeDefined();
	});

	describe("setupGitHubRedirect", () => {
		it("should setup GitHub redirect successfully", async () => {
			const mockResponse = {
				redirectUrl: "https://github.com/apps/jolli/installations/new",
				success: true,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.setupGitHubRedirect();

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/setup/redirect", {
				method: "POST",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error with message from response when setup fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: "Setup failed: Invalid configuration" }),
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.setupGitHubRedirect()).rejects.toThrow("Setup failed: Invalid configuration");
		});

		it("should throw generic error when setup fails without error message", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.setupGitHubRedirect()).rejects.toThrow("Failed to setup GitHub redirect");
		});
	});

	describe("getGitHubSummary", () => {
		it("should get GitHub summary successfully", async () => {
			const mockSummary = {
				orgCount: 2,
				totalRepos: 10,
				enabledRepos: 5,
				needsAttention: 1,
				lastSync: "2024-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockSummary,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.getGitHubSummary();

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/summary", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockSummary);
		});

		it("should throw error when get summary fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.getGitHubSummary()).rejects.toThrow(
				"Failed to get GitHub summary: Internal Server Error",
			);
		});
	});

	describe("getGitHubApps", () => {
		it("should get GitHub apps successfully", async () => {
			const mockApps = [
				{
					appId: 1,
					name: "Jolli App",
					slug: "jolli-app",
					htmlUrl: "https://github.com/apps/jolli-app",
					createdAt: "2024-01-01T00:00:00Z",
					orgCount: 2,
					totalRepos: 10,
					enabledRepos: 5,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockApps,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.getGitHubApps();

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/apps", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockApps);
		});

		it("should throw error when get apps fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Unauthorized",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.getGitHubApps()).rejects.toThrow("Failed to get GitHub apps: Unauthorized");
		});
	});

	describe("getGitHubInstallations", () => {
		it("should get all GitHub installations successfully", async () => {
			const mockInstallations = [
				{
					installationId: 123,
					orgName: "test-org",
					githubAppId: 1,
					totalRepos: 5,
					enabledRepos: 3,
					needsAttention: 0,
					containerType: "org" as const,
					appName: "Jolli App",
					orgId: 1,
					installationStatus: "active" as const,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInstallations,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.getGitHubInstallations();

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/installations", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockInstallations);
		});

		it("should get GitHub installations filtered by appId", async () => {
			const mockInstallations = [
				{
					installationId: 123,
					orgName: "test-org",
					githubAppId: 1,
					totalRepos: 5,
					enabledRepos: 3,
					needsAttention: 0,
					containerType: "org" as const,
					appName: "Jolli App",
					orgId: 1,
					installationStatus: "active" as const,
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockInstallations,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.getGitHubInstallations(1);

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/installations?appId=1", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockInstallations);
		});

		it("should throw error when get installations fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Service Unavailable",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.getGitHubInstallations()).rejects.toThrow(
				"Failed to get GitHub installations: Service Unavailable",
			);
		});
	});

	describe("syncGitHubInstallations", () => {
		it("should sync GitHub installations successfully", async () => {
			const mockResponse = {
				message: "Successfully synced installations",
				syncedCount: 3,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.syncGitHubInstallations();

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/installations/sync", {
				method: "POST",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when sync fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.syncGitHubInstallations()).rejects.toThrow(
				"Failed to sync GitHub installations: Forbidden",
			);
		});
	});

	describe("getInstallationRepos", () => {
		it("should get installation repos successfully", async () => {
			const mockResponse = {
				repos: [
					{
						fullName: "owner/repo1",
						defaultBranch: "main",
						enabled: true,
						status: "active" as const,
						integrationId: 1,
						lastAccessCheck: "2024-01-01T00:00:00Z",
					},
				],
				installationStatus: "active" as const,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.getInstallationRepos(123);

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/installations/123/repos", {
				method: "GET",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when get installation repos fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.getInstallationRepos(999)).rejects.toThrow(
				"Failed to get installation repos: Not Found",
			);
		});
	});

	describe("enableRepo", () => {
		it("should enable repo with default branch successfully", async () => {
			const mockIntegration = {
				id: 1,
				type: "github" as const,
				name: "owner/repo",
				enabled: true,
				status: "active" as const,
				metadata: {
					repo: "owner/repo",
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

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.enableRepo("owner", "repo");

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/repos/owner/repo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({}),
			});
			expect(result).toEqual(mockIntegration);
		});

		it("should enable repo with custom branch successfully", async () => {
			const mockIntegration = {
				id: 1,
				type: "github" as const,
				name: "owner/repo",
				enabled: true,
				status: "active" as const,
				metadata: {
					repo: "owner/repo",
					branch: "develop",
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

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.enableRepo("owner", "repo", "develop");

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/repos/owner/repo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ branch: "develop" }),
			});
			expect(result).toEqual(mockIntegration);
		});

		it("should throw error when enable fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Conflict",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.enableRepo("owner", "repo")).rejects.toThrow("Failed to enable repository: Conflict");
		});
	});

	describe("disableRepo", () => {
		it("should disable repo successfully", async () => {
			const mockIntegration = {
				id: 1,
				type: "github" as const,
				name: "owner/repo",
				enabled: false,
				status: "active" as const,
				metadata: {
					repo: "owner/repo",
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

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.disableRepo("owner", "repo");

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/repos/owner/repo", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockIntegration);
		});

		it("should throw error when disable fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.disableRepo("owner", "repo")).rejects.toThrow("Failed to remove repository: Not Found");
		});
	});

	describe("deleteGitHubInstallation", () => {
		it("should delete GitHub installation successfully", async () => {
			const mockResponse = {
				success: true,
				deletedIntegrations: 5,
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.deleteGitHubInstallation(1);

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/github/installations/1", {
				method: "DELETE",
				headers: {},
				credentials: "include",
				body: null,
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when delete installation fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.deleteGitHubInstallation(1)).rejects.toThrow(
				"Failed to delete installation: Forbidden",
			);
		});
	});

	describe("listAvailableInstallations", () => {
		it("should list available installations successfully", async () => {
			const mockResponse = {
				installations: [
					{
						accountLogin: "acme-org",
						accountType: "Organization",
						installationId: 123,
						repos: ["acme-org/repo1", "acme-org/repo2"],
						alreadyConnectedToCurrentOrg: false,
					},
				],
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.listAvailableInstallations();

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/connect/github/list-available", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: "{}",
			});
			expect(result).toEqual(mockResponse);
		});

		it("should throw error when list available fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Unauthorized",
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());

			await expect(client.listAvailableInstallations()).rejects.toThrow(
				"Failed to list available installations: Unauthorized",
			);
		});
	});

	describe("connectExistingInstallation", () => {
		it("should connect existing installation successfully", async () => {
			const mockResponse = {
				success: true,
				redirectUrl: "https://tenant.example.com/integrations/github/org/acme-org?new_installation=true",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockResponse,
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.connectExistingInstallation(123);

			expect(mockFetch).toHaveBeenCalledWith("http://localhost/api/connect/github/connect-existing", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ installationId: 123 }),
			});
			expect(result).toEqual(mockResponse);
		});

		it("should return error response when connect fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: "Installation not found" }),
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.connectExistingInstallation(999);

			expect(result).toEqual({
				success: false,
				error: "Installation not found",
			});
		});

		it("should return generic error when connect fails without error message", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({}),
			});
			global.fetch = mockFetch;

			const client = createGitHubClient("http://localhost", createMockAuth());
			const result = await client.connectExistingInstallation(999);

			expect(result).toEqual({
				success: false,
				error: "Failed to connect installation",
			});
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for setupGitHubRedirect", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ redirectUrl: "https://github.com", success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.setupGitHubRedirect();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getGitHubSummary", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ orgCount: 0 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getGitHubSummary();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getGitHubApps", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => [] };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getGitHubApps();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getGitHubInstallations", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => [] };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getGitHubInstallations();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for syncGitHubInstallations", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ message: "Synced" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.syncGitHubInstallations();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getInstallationRepos", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ repos: [], installationStatus: "active" }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.getInstallationRepos(123);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for enableRepo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.enableRepo("owner", "repo");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for disableRepo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.disableRepo("owner", "repo");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for deleteGitHubInstallation", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.deleteGitHubInstallation(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listAvailableInstallations", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ installations: [] }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.listAvailableInstallations();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for connectExistingInstallation", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ success: true }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createGitHubClient("http://localhost", createMockAuth(checkUnauthorized));
			await client.connectExistingInstallation(123);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
