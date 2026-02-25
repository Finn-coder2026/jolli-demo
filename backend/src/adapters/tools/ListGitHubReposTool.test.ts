import type { IntegrationDao } from "../../dao/IntegrationDao";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createListGitHubReposToolDefinition, executeListGitHubReposTool } from "./ListGitHubReposTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: vi.fn(),
}));

vi.mock("../../util/GithubAppUtil", () => ({
	fetchInstallationRepositories: vi.fn(),
}));

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { fetchInstallationRepositories } from "../../util/GithubAppUtil";

const mockGetCoreJolliGithubApp = vi.mocked(getCoreJolliGithubApp);
const mockFetchInstallationRepositories = vi.mocked(fetchInstallationRepositories);

describe("ListGitHubReposTool", () => {
	let deps: AgentHubToolDeps;
	let mockIntegrationDao: IntegrationDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockIntegrationDao = mocks.mockIntegrationDao;
	});

	describe("createListGitHubReposToolDefinition", () => {
		it("returns a valid tool definition with the correct name", () => {
			const def = createListGitHubReposToolDefinition();
			expect(def.name).toBe("list_github_repos");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeListGitHubReposTool", () => {
		it("returns message when GitHub App is not configured", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: -1,
				slug: "",
				clientId: "",
				clientSecret: "",
				webhookSecret: "",
				privateKey: "",
				name: "",
				htmlUrl: "",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual([]);
			expect(parsed.message).toBe("GitHub App is not configured.");
			expect(mockIntegrationDao.listIntegrations).not.toHaveBeenCalled();
		});

		it("returns message when no active GitHub integrations", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: 12345,
				slug: "jolli-app",
				clientId: "client-id",
				clientSecret: "client-secret",
				webhookSecret: "webhook-secret",
				privateKey: "private-key",
				name: "Jolli App",
				htmlUrl: "https://github.com/apps/jolli-app",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual([]);
			expect(parsed.message).toContain("No active GitHub integrations found");
		});

		it("returns repos from active integrations", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: 12345,
				slug: "jolli-app",
				clientId: "client-id",
				clientSecret: "client-secret",
				webhookSecret: "webhook-secret",
				privateKey: "private-key",
				name: "Jolli App",
				htmlUrl: "https://github.com/apps/jolli-app",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 100 },
				},
			] as never);
			mockFetchInstallationRepositories.mockResolvedValue(["acme/docs", "acme/api"]);

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual(["acme/docs", "acme/api"]);
			expect(parsed.message).toBeUndefined();
			expect(mockFetchInstallationRepositories).toHaveBeenCalledTimes(1);
		});

		it("deduplicates installation IDs across integrations", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: 12345,
				slug: "jolli-app",
				clientId: "client-id",
				clientSecret: "client-secret",
				webhookSecret: "webhook-secret",
				privateKey: "private-key",
				name: "Jolli App",
				htmlUrl: "https://github.com/apps/jolli-app",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 100 },
				},
				{
					id: 2,
					type: "github",
					status: "active",
					name: "acme/api",
					metadata: { repo: "acme/api", branch: "main", features: [], installationId: 100 },
				},
				{
					id: 3,
					type: "github",
					status: "active",
					name: "other-org/lib",
					metadata: { repo: "other-org/lib", branch: "main", features: [], installationId: 200 },
				},
			] as never);
			mockFetchInstallationRepositories
				.mockResolvedValueOnce(["acme/docs", "acme/api"])
				.mockResolvedValueOnce(["other-org/lib"]);

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual(["acme/docs", "acme/api", "other-org/lib"]);
			// Should only call fetch twice (once per unique installation ID)
			expect(mockFetchInstallationRepositories).toHaveBeenCalledTimes(2);
		});

		it("handles fetchInstallationRepositories error gracefully", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: 12345,
				slug: "jolli-app",
				clientId: "client-id",
				clientSecret: "client-secret",
				webhookSecret: "webhook-secret",
				privateKey: "private-key",
				name: "Jolli App",
				htmlUrl: "https://github.com/apps/jolli-app",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 100 },
				},
				{
					id: 2,
					type: "github",
					status: "active",
					name: "other-org/lib",
					metadata: { repo: "other-org/lib", branch: "main", features: [], installationId: 200 },
				},
			] as never);
			mockFetchInstallationRepositories
				.mockResolvedValueOnce({ error: "Token expired" })
				.mockResolvedValueOnce(["other-org/lib"]);

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			// Should still return repos from the successful call
			expect(parsed.repos).toEqual(["other-org/lib"]);
		});

		it("returns message when no repos found despite active integrations", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: 12345,
				slug: "jolli-app",
				clientId: "client-id",
				clientSecret: "client-secret",
				webhookSecret: "webhook-secret",
				privateKey: "private-key",
				name: "Jolli App",
				htmlUrl: "https://github.com/apps/jolli-app",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [], installationId: 100 },
				},
			] as never);
			mockFetchInstallationRepositories.mockResolvedValue([]);

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual([]);
			expect(parsed.message).toContain("No repositories found");
		});

		it("skips integrations without installationId in metadata", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({
				appId: 12345,
				slug: "jolli-app",
				clientId: "client-id",
				clientSecret: "client-secret",
				webhookSecret: "webhook-secret",
				privateKey: "private-key",
				name: "Jolli App",
				htmlUrl: "https://github.com/apps/jolli-app",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 1,
					type: "github",
					status: "active",
					name: "acme/docs",
					metadata: { repo: "acme/docs", branch: "main", features: [] },
				},
			] as never);

			const result = await executeListGitHubReposTool(deps);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual([]);
			expect(parsed.message).toContain("No repositories found");
			expect(mockFetchInstallationRepositories).not.toHaveBeenCalled();
		});
	});
});
