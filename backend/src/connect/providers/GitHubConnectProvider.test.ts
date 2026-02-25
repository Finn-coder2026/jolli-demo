import { resetConfig } from "../../config/Config";
import type { DaoProvider } from "../../dao/DaoProvider";
import type { GitHubInstallationDao } from "../../dao/GitHubInstallationDao";
import { mockGitHubInstallationDao } from "../../dao/GitHubInstallationDao.mock";
import * as GitHubAppModel from "../../model/GitHubApp";
import { mockGitHubApp } from "../../model/GitHubApp.mock";
import type { TenantOrgContext } from "../../tenant/TenantContext";
import type { TenantOrgByInstallationResult, TenantRegistryClient } from "../../tenant/TenantRegistryClient";
import * as GithubAppUtil from "../../util/GithubAppUtil";
import type { ConnectStatePayload } from "../ConnectProvider";
import { validateConnectCode } from "../ConnectStateService";
import type { GitHubConnectCodeData } from "./GitHubConnectProvider";
import { GitHubConnectProvider, getGitHubSetupUrl, isMultiTenantEnabled } from "./GitHubConnectProvider";
import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Database
const mockDatabase = {} as TenantOrgContext["database"];

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

// Helper to create a mock tenant context
function createMockTenantContext(tenantSlug = "test-tenant", orgSlug = "test-org"): TenantOrgContext {
	return {
		tenant: {
			id: "1",
			slug: tenantSlug,
			displayName: "Test Tenant",
			status: "active",
			deploymentType: "shared",
			databaseProviderId: "default",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			provisionedAt: new Date(),
		},
		org: {
			id: "1",
			tenantId: "1",
			slug: orgSlug,
			displayName: "Test Org",
			schemaName: `org_${orgSlug}`,
			status: "active",
			isDefault: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		schemaName: `org_${orgSlug}`,
		database: mockDatabase,
	};
}

describe("GitHubConnectProvider", () => {
	let provider: GitHubConnectProvider;
	let githubInstallationDao: GitHubInstallationDao;

	beforeEach(() => {
		// Reset environment and config
		delete process.env.MULTI_TENANT_ENABLED;
		delete process.env.BASE_DOMAIN;
		delete process.env.CONNECT_GATEWAY_DOMAIN;
		process.env.GITHUB_CONNECT_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString("base64");
		process.env.GITHUB_CONNECT_SIGNING_KEY = "test-signing-key-for-github-connect";
		resetConfig();

		// Set up mock DAO
		githubInstallationDao = mockGitHubInstallationDao();
		provider = new GitHubConnectProvider(mockDaoProvider(githubInstallationDao));

		// Mock the GitHub app
		vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockReturnValue(
			mockGitHubApp({
				appId: 12345,
				name: "Test App",
				slug: "test-app",
				privateKey: "test-private-key",
				htmlUrl: "https://github.com/apps/test-app",
			}),
		);

		vi.clearAllMocks();
	});

	describe("name", () => {
		it("should be github", () => {
			expect(provider.name).toBe("github");
		});
	});

	describe("getSetupRedirectUrl", () => {
		it("should return GitHub App installation URL with encrypted state", async () => {
			const url = await provider.getSetupRedirectUrl("test-tenant", "test-org", "https://tenant.example.com");

			expect(url).toContain("https://github.com/apps/test-app/installations/new");
			expect(url).toContain("state=");
		});

		it("should handle undefined orgSlug", async () => {
			const url = await provider.getSetupRedirectUrl("test-tenant", undefined, "https://tenant.example.com");

			expect(url).toContain("https://github.com/apps/test-app/installations/new");
			expect(url).toContain("state=");
		});
	});

	describe("handleCallback", () => {
		let mockStatePayload: ConnectStatePayload;

		beforeEach(() => {
			mockStatePayload = {
				provider: "github",
				tenantSlug: "test-tenant",
				orgSlug: "test-org",
				returnTo: "https://tenant.example.com",
				issuedAt: Date.now(),
				expiresAt: Date.now() + 300000,
			};
		});

		it("should return error when setup_action is not install", async () => {
			const req = {
				query: { setup_action: "cancelled", installation_id: "123" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("setup_cancelled");
				expect(result.redirectUrl).toBe("https://tenant.example.com/?error=setup_cancelled");
			}
		});

		it("should return error when installation_id is missing", async () => {
			const req = {
				query: { setup_action: "install" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("no_installation_id");
				expect(result.redirectUrl).toBe("https://tenant.example.com/?error=no_installation_id");
			}
		});

		it("should return error when installation not found in GitHub App", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue(undefined);

			const req = {
				query: { setup_action: "install", installation_id: "123" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("installation_not_found");
				expect(result.redirectUrl).toBe("https://tenant.example.com/?error=installation_not_found");
			}
		});

		it("should return error when access token fetch fails", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue({
				error: "failed_to_get_access_token",
			});

			const req = {
				query: { setup_action: "install", installation_id: "123" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("failed_to_get_access_token");
			}
		});

		it("should return error when fetch repositories fails", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue({
				error: "failed_to_fetch_repositories",
			});

			const req = {
				query: { setup_action: "install", installation_id: "123" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("failed_to_fetch_repositories");
			}
		});

		it("should successfully generate code and redirect for organization", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue([
				"test-org/repo1",
				"test-org/repo2",
			]);

			const req = {
				query: { setup_action: "install", installation_id: "123" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectUrl).toContain("https://tenant.example.com/api/connect/github/complete");
				expect(result.redirectUrl).toContain("code=");

				// Validate the code contains correct data
				const url = new URL(result.redirectUrl);
				const code = url.searchParams.get("code");
				expect(code).toBeTruthy();
				if (!code) {
					return;
				}

				const decoded = validateConnectCode<GitHubConnectCodeData>("github", code);
				expect(decoded).toBeTruthy();
				expect(decoded?.data.installationId).toBe(123);
				expect(decoded?.data.accountLogin).toBe("test-org");
				expect(decoded?.data.containerType).toBe("org");
				expect(decoded?.data.repoNames).toEqual(["test-org/repo1", "test-org/repo2"]);
			}
		});

		it("should handle user account type correctly", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 456,
				account: { login: "test-user", type: "User" },
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["test-user/repo1"]);

			const req = {
				query: { setup_action: "install", installation_id: "456" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(true);
			if (result.success) {
				const url = new URL(result.redirectUrl);
				const code = url.searchParams.get("code");
				if (!code) {
					return;
				}
				const decoded = validateConnectCode<GitHubConnectCodeData>("github", code);
				expect(decoded?.data.containerType).toBe("user");
			}
		});

		it("should handle empty repositories list", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue([]);

			const req = {
				query: { setup_action: "install", installation_id: "123" },
			} as unknown as Request;

			const result = await provider.handleCallback(req, mockStatePayload);

			expect(result.success).toBe(true);
			if (result.success) {
				const url = new URL(result.redirectUrl);
				const code = url.searchParams.get("code");
				if (!code) {
					return;
				}
				const decoded = validateConnectCode<GitHubConnectCodeData>("github", code);
				expect(decoded?.data.repoNames).toEqual([]);
			}
		});
	});

	describe("handleComplete", () => {
		it("should return error for invalid code data", async () => {
			const result = await provider.handleComplete(null, createMockTenantContext());

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("invalid_code_data");
			}
		});

		it("should return error for missing installationId", async () => {
			const result = await provider.handleComplete(
				{ accountLogin: "test", containerType: "org", repoNames: [] },
				createMockTenantContext(),
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("invalid_code_data");
			}
		});

		it("should return error for invalid containerType", async () => {
			const result = await provider.handleComplete(
				{ installationId: 123, accountLogin: "test", containerType: "invalid", repoNames: [] },
				createMockTenantContext(),
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("invalid_code_data");
			}
		});

		it("should return error for missing repoNames array", async () => {
			const result = await provider.handleComplete(
				{ installationId: 123, accountLogin: "test", containerType: "org" },
				createMockTenantContext(),
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("invalid_code_data");
			}
		});

		it("should create new installation entry when not existing", async () => {
			githubInstallationDao.lookupByName = vi.fn().mockResolvedValue(null);
			githubInstallationDao.createInstallation = vi.fn().mockResolvedValue(undefined);

			const codeData: GitHubConnectCodeData = {
				installationId: 123,
				accountLogin: "test-org",
				containerType: "org",
				repoNames: ["test-org/repo1", "test-org/repo2"],
			};

			const result = await provider.handleComplete(codeData, createMockTenantContext());

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectPath).toBe("/integrations/github/org/test-org?new_installation=true");
			}
			expect(githubInstallationDao.createInstallation).toHaveBeenCalledWith({
				containerType: "org",
				name: "test-org",
				installationId: 123,
				repos: ["test-org/repo1", "test-org/repo2"],
			});
		});

		it("should update existing installation entry", async () => {
			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				installationId: 100,
				repos: ["test-org/old-repo"],
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			githubInstallationDao.lookupByName = vi.fn().mockResolvedValue(existingInstallation);
			githubInstallationDao.updateInstallation = vi.fn().mockResolvedValue(undefined);

			const codeData: GitHubConnectCodeData = {
				installationId: 123,
				accountLogin: "test-org",
				containerType: "org",
				repoNames: ["test-org/repo1", "test-org/repo2"],
			};

			const result = await provider.handleComplete(codeData, createMockTenantContext());

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectPath).toBe("/integrations/github/org/test-org?new_installation=true");
			}
			expect(githubInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "org",
				installationId: 123,
				repos: ["test-org/repo1", "test-org/repo2"],
			});
		});

		it("should handle user container type", async () => {
			githubInstallationDao.lookupByName = vi.fn().mockResolvedValue(null);
			githubInstallationDao.createInstallation = vi.fn().mockResolvedValue(undefined);

			const codeData: GitHubConnectCodeData = {
				installationId: 456,
				accountLogin: "test-user",
				containerType: "user",
				repoNames: ["test-user/repo1"],
			};

			const result = await provider.handleComplete(codeData, createMockTenantContext());

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectPath).toBe("/integrations/github/user/test-user?new_installation=true");
			}
		});
	});

	describe("listAvailableInstallations", () => {
		it("should return empty array when no installations exist", async () => {
			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([]);

			const result = await provider.listAvailableInstallations("user-token", createMockTenantContext());

			expect(result).toEqual([]);
		});

		it("should return empty array when getInstallations returns undefined", async () => {
			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue(undefined);

			const result = await provider.listAvailableInstallations("user-token", createMockTenantContext());

			expect(result).toEqual([]);
		});

		it("should list available installations with their connection status", async () => {
			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 123, account: { login: "acme-org", type: "Organization" } } as never,
				{ id: 456, account: { login: "other-org", type: "Organization" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["acme-org/repo1"]);

			// Mock existing connected installation
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([
				{
					id: 1,
					name: "acme-org",
					installationId: 123,
					containerType: "org",
					repos: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const result = await provider.listAvailableInstallations("user-token", createMockTenantContext());

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				accountLogin: "acme-org",
				accountType: "Organization",
				installationId: 123,
				repos: ["acme-org/repo1"],
				alreadyConnectedToCurrentOrg: true,
			});
			expect(result[1]).toEqual({
				accountLogin: "other-org",
				accountType: "Organization",
				installationId: 456,
				repos: ["acme-org/repo1"], // Uses same mock result
				alreadyConnectedToCurrentOrg: false,
			});
		});

		it("should handle User account type", async () => {
			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 789, account: { login: "test-user", type: "User" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["test-user/repo1"]);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			const result = await provider.listAvailableInstallations("user-token", createMockTenantContext());

			expect(result).toHaveLength(1);
			expect(result[0].accountType).toBe("User");
		});

		it("should handle repo fetch failures gracefully", async () => {
			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 123, account: { login: "acme-org", type: "Organization" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue({
				error: "failed_to_get_access_token",
			});
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			const result = await provider.listAvailableInstallations("user-token", createMockTenantContext());

			expect(result).toHaveLength(1);
			expect(result[0].repos).toEqual([]); // Empty array on failure
		});

		it("should exclude installations owned by a different tenant", async () => {
			const mockRegistryClient = {
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			} as unknown as TenantRegistryClient;
			const providerWithRegistry = new GitHubConnectProvider(
				mockDaoProvider(githubInstallationDao),
				mockRegistryClient,
			);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 100, account: { login: "my-org", type: "Organization" } } as never,
				{ id: 200, account: { login: "other-tenant-org", type: "Organization" } } as never,
				{ id: 300, account: { login: "unclaimed-org", type: "Organization" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["some/repo"]);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			const tenantContext = createMockTenantContext();

			// Installation 100: owned by current tenant
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockImplementation((installationId: number) => {
				if (installationId === 100) {
					return Promise.resolve({
						tenant: { id: "1" },
						org: { id: "1" },
					} as TenantOrgByInstallationResult);
				}
				if (installationId === 200) {
					return Promise.resolve({
						tenant: { id: "other-tenant-id" },
						org: { id: "2" },
					} as TenantOrgByInstallationResult);
				}
				// 300 is unclaimed
				return Promise.resolve(undefined);
			});

			const result = await providerWithRegistry.listAvailableInstallations("user-token", tenantContext);

			// Should include current tenant's (100) and unclaimed (300), but not other tenant's (200)
			expect(result).toHaveLength(2);
			expect(result.map(r => r.installationId)).toEqual([100, 300]);
		});

		it("should include installations owned by the current tenant", async () => {
			const mockRegistryClient = {
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			} as unknown as TenantRegistryClient;
			const providerWithRegistry = new GitHubConnectProvider(
				mockDaoProvider(githubInstallationDao),
				mockRegistryClient,
			);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 100, account: { login: "my-org", type: "Organization" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["my-org/repo1"]);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			const tenantContext = createMockTenantContext();
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue({
				tenant: { id: "1" },
				org: { id: "1" },
			} as TenantOrgByInstallationResult);

			const result = await providerWithRegistry.listAvailableInstallations("user-token", tenantContext);

			expect(result).toHaveLength(1);
			expect(result[0].installationId).toBe(100);
			expect(result[0].accountLogin).toBe("my-org");
		});

		it("should return empty array in multi-tenant mode without registry client", async () => {
			process.env.MULTI_TENANT_ENABLED = "true";
			resetConfig();

			// Default provider has no registry client
			const result = await provider.listAvailableInstallations("user-token", createMockTenantContext());

			expect(result).toEqual([]);
		});

		it("should include unclaimed installations with no mapping", async () => {
			const mockRegistryClient = {
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			} as unknown as TenantRegistryClient;
			const providerWithRegistry = new GitHubConnectProvider(
				mockDaoProvider(githubInstallationDao),
				mockRegistryClient,
			);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 500, account: { login: "new-org", type: "Organization" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["new-org/repo1"]);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			// No mapping exists for this installation
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue(undefined);

			const result = await providerWithRegistry.listAvailableInstallations(
				"user-token",
				createMockTenantContext(),
			);

			expect(result).toHaveLength(1);
			expect(result[0].installationId).toBe(500);
			expect(result[0].accountLogin).toBe("new-org");
		});
	});

	describe("connectExistingInstallation", () => {
		it("should return configuration_error in multi-tenant mode without registry client", async () => {
			process.env.MULTI_TENANT_ENABLED = "true";
			resetConfig();

			// Default provider has no registry client
			const result = await provider.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("configuration_error");
			}
		});

		it("should return error when installation not found", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue(undefined);

			const result = await provider.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("installation_not_found");
			}
		});

		it("should return error when repo fetch fails", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "acme-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue({
				error: "failed_to_get_access_token",
			});

			const result = await provider.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("failed_to_get_access_token");
			}
		});

		it("should connect existing organization installation", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "acme-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue([
				"acme-org/repo1",
				"acme-org/repo2",
			]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const result = await provider.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectPath).toBe("/integrations/github/org/acme-org?new_installation=true");
			}
			expect(GithubAppUtil.upsertInstallationContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 123,
					account: { login: "acme-org", type: "Organization" },
				}),
				123,
				["acme-org/repo1", "acme-org/repo2"],
				expect.anything(),
				"connect flow",
			);
		});

		it("should connect existing user installation", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 456,
				account: { login: "test-user", type: "User" },
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["test-user/repo1"]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const result = await provider.connectExistingInstallation(456, createMockTenantContext());

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectPath).toBe("/integrations/github/user/test-user?new_installation=true");
			}
		});

		it("should update existing installation entry", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "acme-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["acme-org/repo1"]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const result = await provider.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(true);
			expect(GithubAppUtil.upsertInstallationContainer).toHaveBeenCalled();
		});

		it("should reject connecting an installation owned by another tenant", async () => {
			const mockRegistryClient = {
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			} as unknown as TenantRegistryClient;
			const providerWithRegistry = new GitHubConnectProvider(
				mockDaoProvider(githubInstallationDao),
				mockRegistryClient,
			);

			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue({
				tenant: { id: "other-tenant-id" },
				org: { id: "2" },
			} as TenantOrgByInstallationResult);

			const result = await providerWithRegistry.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("installation_not_available");
			}
		});

		it("should allow connecting an unclaimed installation", async () => {
			const mockRegistryClient = {
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
			} as unknown as TenantRegistryClient;
			const providerWithRegistry = new GitHubConnectProvider(
				mockDaoProvider(githubInstallationDao),
				mockRegistryClient,
			);

			// No mapping exists
			vi.mocked(mockRegistryClient.getTenantOrgByInstallationId).mockResolvedValue(undefined);

			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "acme-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["acme-org/repo1"]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const result = await providerWithRegistry.connectExistingInstallation(123, createMockTenantContext());

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.redirectPath).toBe("/integrations/github/org/acme-org?new_installation=true");
			}
		});
	});
});

describe("isMultiTenantEnabled", () => {
	beforeEach(() => {
		delete process.env.MULTI_TENANT_ENABLED;
		resetConfig();
	});

	it("should return false when MULTI_TENANT_ENABLED is not set", () => {
		expect(isMultiTenantEnabled()).toBe(false);
	});

	it("should return true when MULTI_TENANT_ENABLED is true", () => {
		process.env.MULTI_TENANT_ENABLED = "true";
		resetConfig();

		expect(isMultiTenantEnabled()).toBe(true);
	});
});

describe("getGitHubSetupUrl", () => {
	beforeEach(() => {
		delete process.env.BASE_DOMAIN;
		delete process.env.CONNECT_GATEWAY_DOMAIN;
		delete process.env.ORIGIN;
		process.env.ORIGIN = "http://localhost:3000";
		resetConfig();
	});

	it("should return connect gateway URL for GitHub setup", () => {
		const url = getGitHubSetupUrl();
		expect(url).toContain("/api/connect/github/setup");
	});

	it("should use custom connect gateway domain when configured", () => {
		process.env.BASE_DOMAIN = "jolli.ai";
		process.env.CONNECT_GATEWAY_DOMAIN = "connect-custom.jolli.ai";
		process.env.USE_GATEWAY = "true";
		resetConfig();

		const url = getGitHubSetupUrl();
		expect(url).toBe("https://connect-custom.jolli.ai/api/connect/github/setup");
	});
});
