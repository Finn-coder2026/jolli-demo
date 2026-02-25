/**
 * Tests for the connect_github_repo agent hub tool.
 */

import type { IntegrationDao } from "../../dao/IntegrationDao";
import type { IntegrationsManager } from "../../integrations/IntegrationsManager";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import {
	connectGitHubRepoArgsSchema,
	createConnectGitHubRepoToolDefinition,
	executeConnectGitHubRepoTool,
} from "./ConnectGitHubRepoTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

// Mock the GitHubApp model
const mockGetCoreJolliGithubApp = vi.fn();
vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: () => mockGetCoreJolliGithubApp(),
}));

// Mock GithubAppUtil functions
const mockFindExistingInstallation = vi.fn();
const mockGenerateInstallationUrl = vi.fn();
const mockParseGitHubRepoUrl = vi.fn();
vi.mock("../../util/GithubAppUtil", () => ({
	findExistingInstallation: (...args: Array<unknown>) => mockFindExistingInstallation(...args),
	generateInstallationUrl: (...args: Array<unknown>) => mockGenerateInstallationUrl(...args),
	parseGitHubRepoUrl: (...args: Array<unknown>) => mockParseGitHubRepoUrl(...args),
}));

// Mock Logger
vi.mock("../../util/Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

/** Creates a valid GitHub App config for testing. */
function validApp() {
	return {
		appId: 12345,
		slug: "jolli-app",
		clientId: "abc",
		clientSecret: "secret",
		webhookSecret: "whsec",
		privateKey: "key",
		name: "Jolli",
		htmlUrl: "https://github.com/apps/jolli-app",
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

describe("ConnectGitHubRepoTool", () => {
	let deps: AgentHubToolDeps;
	let mockIntegrationDao: IntegrationDao;
	let mockIntegrationsManager: IntegrationsManager;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockIntegrationDao = mocks.mockIntegrationDao;
		mockIntegrationsManager = mocks.mockIntegrationsManager;

		// Default: valid app, valid URL parse
		mockGetCoreJolliGithubApp.mockReturnValue(validApp());
		mockParseGitHubRepoUrl.mockReturnValue({
			owner: "acme",
			repo: "docs",
			repoFullName: "acme/docs",
		});
	});

	describe("createConnectGitHubRepoToolDefinition", () => {
		it("returns a valid tool definition with repoUrl parameter", () => {
			const def = createConnectGitHubRepoToolDefinition();
			expect(def.name).toBe("connect_github_repo");
			expect(def.description).toBeTruthy();
			expect(def.parameters.properties).toHaveProperty("repoUrl");
			expect(def.parameters.required).toContain("repoUrl");
		});
	});

	describe("connectGitHubRepoArgsSchema", () => {
		it("accepts a valid repoUrl", () => {
			const result = connectGitHubRepoArgsSchema.safeParse({ repoUrl: "https://github.com/acme/docs" });
			expect(result.success).toBe(true);
		});

		it("rejects empty repoUrl", () => {
			const result = connectGitHubRepoArgsSchema.safeParse({ repoUrl: "" });
			expect(result.success).toBe(false);
		});

		it("rejects missing repoUrl", () => {
			const result = connectGitHubRepoArgsSchema.safeParse({});
			expect(result.success).toBe(false);
		});
	});

	describe("executeConnectGitHubRepoTool", () => {
		it("returns error when GitHub App is not configured", async () => {
			mockGetCoreJolliGithubApp.mockReturnValue({ appId: -1 });

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(true);
			expect(parsed.message).toContain("not configured");
		});

		it("returns error for invalid repo URL", async () => {
			mockParseGitHubRepoUrl.mockImplementation(() => {
				throw new Error("Invalid GitHub repository URL");
			});

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "not-a-url" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(true);
			expect(parsed.message).toContain("Invalid GitHub repository URL");
		});

		it("returns alreadyConnected when active integration exists for repo", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "docs",
					metadata: { repo: "acme/docs", branch: "main", features: ["sync"] },
				},
			] as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.alreadyConnected).toBe(true);
			expect(parsed.integration.id).toBe(10);
			expect(parsed.integration.repo).toBe("acme/docs");
		});

		it("defaults branch to 'main' when existing integration has undefined branch", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "active",
					name: "docs",
					metadata: { repo: "acme/docs", branch: undefined, features: ["sync"] },
				},
			] as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.alreadyConnected).toBe(true);
			expect(parsed.integration.branch).toBe("main");
		});

		it("does not treat non-active integrations as already connected", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([
				{
					id: 10,
					type: "github",
					status: "needs_repo_access",
					name: "docs",
					metadata: { repo: "acme/docs", branch: "main", features: ["sync"] },
				},
			] as never);

			mockFindExistingInstallation.mockResolvedValue({
				installationId: 999,
				defaultBranch: "main",
				accountLogin: "acme",
				accountType: "Organization",
				repositories: [],
			});

			vi.mocked(mockIntegrationsManager.createIntegration).mockResolvedValue({
				result: { id: 11, type: "github", name: "docs", status: "active", metadata: { repo: "acme/docs" } },
			} as never);
			vi.mocked(mockIntegrationsManager.handleAccessCheck).mockResolvedValue({
				result: { hasAccess: true },
			} as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.alreadyConnected).toBeUndefined();
			expect(parsed.connected).toBe(true);
		});

		it("successfully creates integration when installation is found", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);
			mockFindExistingInstallation.mockResolvedValue({
				installationId: 999,
				defaultBranch: "develop",
				accountLogin: "acme",
				accountType: "Organization",
				repositories: [],
			});

			const createdIntegration = {
				id: 42,
				type: "github",
				name: "docs",
				status: "active",
				metadata: { repo: "acme/docs", branch: "develop", features: ["sync"] },
			};
			vi.mocked(mockIntegrationsManager.createIntegration).mockResolvedValue({
				result: createdIntegration,
			} as never);
			vi.mocked(mockIntegrationsManager.handleAccessCheck).mockResolvedValue({
				result: { hasAccess: true },
			} as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(true);
			expect(parsed.integration.id).toBe(42);
			expect(parsed.integration.repo).toBe("acme/docs");
			expect(parsed.integration.branch).toBe("develop");

			// Verify createIntegration was called with correct args
			expect(mockIntegrationsManager.createIntegration).toHaveBeenCalledWith({
				type: "github",
				name: "docs",
				status: "active",
				metadata: {
					repo: "acme/docs",
					branch: "develop",
					features: ["sync"],
					githubAppId: 12345,
					installationId: 999,
				},
			});

			// Verify access check was called
			expect(mockIntegrationsManager.handleAccessCheck).toHaveBeenCalledWith(createdIntegration);
		});

		it("returns warning when access check fails after creation", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);
			mockFindExistingInstallation.mockResolvedValue({
				installationId: 999,
				defaultBranch: "main",
				accountLogin: "acme",
				accountType: "Organization",
				repositories: [],
			});

			vi.mocked(mockIntegrationsManager.createIntegration).mockResolvedValue({
				result: { id: 42, type: "github", name: "docs", status: "active" },
			} as never);
			vi.mocked(mockIntegrationsManager.handleAccessCheck).mockResolvedValue({
				error: { code: 403, reason: "Token expired" },
			} as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(true);
			expect(parsed.warning).toBe(true);
			expect(parsed.message).toContain("Token expired");
		});

		it("returns error when createIntegration fails", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);
			mockFindExistingInstallation.mockResolvedValue({
				installationId: 999,
				defaultBranch: "main",
				accountLogin: "acme",
				accountType: "Organization",
				repositories: [],
			});

			vi.mocked(mockIntegrationsManager.createIntegration).mockResolvedValue({
				error: { statusCode: 409, error: "Duplicate integration" },
			} as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(true);
			expect(parsed.message).toContain("Duplicate integration");
		});

		it("returns fallback error message when createIntegration returns no result and no error", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);
			mockFindExistingInstallation.mockResolvedValue({
				installationId: 999,
				defaultBranch: "main",
				accountLogin: "acme",
				accountType: "Organization",
				repositories: [],
			});

			vi.mocked(mockIntegrationsManager.createIntegration).mockResolvedValue({} as never);

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(true);
			expect(parsed.message).toContain("Unknown error creating integration");
		});

		it("returns needsInstallation with installation URL when no installation found", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);
			mockFindExistingInstallation.mockResolvedValue(undefined);
			mockGenerateInstallationUrl.mockResolvedValue("https://github.com/apps/jolli-app/installations/new");

			const result = await executeConnectGitHubRepoTool(deps, { repoUrl: "https://github.com/acme/docs" });
			const parsed = JSON.parse(result);

			expect(parsed.needsInstallation).toBe(true);
			expect(parsed.installUrl).toBe("https://github.com/apps/jolli-app/installations/new");
			expect(parsed.message).toContain("not installed");
		});

		it("returns error when integrationsManager is not available", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);
			mockFindExistingInstallation.mockResolvedValue({
				installationId: 999,
				defaultBranch: "main",
				accountLogin: "acme",
				accountType: "Organization",
				repositories: [],
			});

			// Create deps without integrationsManager (omit the property entirely)
			const depsWithoutManager: AgentHubToolDeps = {
				spaceDaoProvider: deps.spaceDaoProvider,
				docDaoProvider: deps.docDaoProvider,
				docDraftDaoProvider: deps.docDraftDaoProvider,
				integrationDaoProvider: deps.integrationDaoProvider,
				sourceDaoProvider: deps.sourceDaoProvider,
				permissionService: deps.permissionService,
			};

			const result = await executeConnectGitHubRepoTool(depsWithoutManager, {
				repoUrl: "https://github.com/acme/docs",
			});
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(true);
			expect(parsed.message).toContain("not available");
		});
	});
});
