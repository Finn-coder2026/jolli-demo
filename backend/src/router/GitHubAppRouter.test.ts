import { resetConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import { mockGitHubInstallationDao } from "../dao/GitHubInstallationDao.mock";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import type { GitHubApp } from "../model/GitHubApp";
import * as GitHubAppModel from "../model/GitHubApp";
import { mockGitHubApp } from "../model/GitHubApp.mock";
import { mockIntegration } from "../model/Integration.mock";
import { createAuthHandler } from "../util/AuthHandler";
import * as GithubAppUtil from "../util/GithubAppUtil";
import * as IntegrationUtil from "../util/IntegrationUtil";
import { createTokenUtil } from "../util/TokenUtil";
import { createGitHubAppRouter } from "./GitHubAppRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("GitHubAppRouter", () => {
	let app: Express;
	let integrationsManager: IntegrationsManager;
	let githubInstallationDao: GitHubInstallationDao;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	beforeEach(() => {
		// Reset config and environment to clear any multi-tenant settings from other tests
		delete process.env.MULTI_TENANT_ENABLED;
		// Set ORIGIN for the tests - the router now uses getConfig().ORIGIN
		process.env.ORIGIN = "http://localhost:3000";
		resetConfig();

		integrationsManager = createMockIntegrationsManager();
		githubInstallationDao = mockGitHubInstallationDao();

		const authHandler = createAuthHandler(tokenUtil);

		app = express();
		app.use(express.json());
		app.use(cookieParser());
		app.use((req, _res, next) => {
			req.session = {} as unknown as typeof req.session;
			next();
		});
		app.use("/github", authHandler);
		app.use("/github", createGitHubAppRouter(mockDaoProvider(githubInstallationDao), integrationsManager, {}));

		const userInfo: UserInfo = {
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		};

		authToken = tokenUtil.generateToken(userInfo);

		// Clear all mocks
		vi.clearAllMocks();
	});

	describe("GET /installation-url/:integrationId", () => {
		it("should return 400 for invalid integration ID", async () => {
			const response = await request(app)
				.get("/github/installation-url/invalid")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid integration ID" });
		});

		it("should return 404 when integration not found", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const response = await request(app)
				.get("/github/installation-url/123")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 400 when integration status is not pending_installation or needs_repo_access", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 123,
					type: "github",
					status: "active",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						githubAppId: 12345,
						features: [],
					},
				}),
			]);

			const response = await request(app)
				.get("/github/installation-url/123")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Integration does not need installation or repo access" });
		});

		it("should return 400 when integration is missing repository information", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 123,
					type: "github",
					status: "pending_installation",
					metadata: {} as never,
				}),
			]);

			const response = await request(app)
				.get("/github/installation-url/123")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Integration is missing repository or app information" });
		});

		it("should return installation URL for pending_installation status", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 123,
					type: "github",
					status: "pending_installation",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						githubAppId: 12345,
						features: [],
					},
				}),
			]);

			vi.spyOn(GithubAppUtil, "generateInstallationUrl").mockResolvedValue(
				"https://github.com/apps/test-app/installations/new",
			);

			const response = await request(app)
				.get("/github/installation-url/123")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				installUrl: "https://github.com/apps/test-app/installations/new",
			});
		});

		it("should return installation URL for needs_repo_access status", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 124,
					type: "github",
					status: "needs_repo_access",
					metadata: {
						repo: "owner/repo2",
						branch: "main",
						githubAppId: 12345,
						features: [],
					},
				}),
			]);

			vi.spyOn(GithubAppUtil, "generateInstallationUrl").mockResolvedValue(
				"https://github.com/apps/test-app/installations/new",
			);

			const response = await request(app)
				.get("/github/installation-url/124")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				installUrl: "https://github.com/apps/test-app/installations/new",
			});
		});

		it("should return 500 when an error occurs", async () => {
			integrationsManager.listIntegrations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.get("/github/installation-url/123")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get installation URL" });
		});
	});

	describe("POST /setup/redirect", () => {
		it("should redirect to GitHub installation page", async () => {
			const response = await request(app)
				.post("/github/setup/redirect")
				.send({})
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.redirectUrl).toContain("https://github.com/apps/test-app/installations/new");
			expect(response.body.redirectUrl).toContain("state=");
		});

		it("should call cleanupOrphanedGitHubAppInstallations before redirecting", async () => {
			const cleanupSpy = vi
				.spyOn(GithubAppUtil, "cleanupOrphanedGitHubAppInstallations")
				.mockResolvedValue({ uninstalledCount: 0, failedCount: 0 });

			const response = await request(app)
				.post("/github/setup/redirect")
				.send({})
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(cleanupSpy).toHaveBeenCalledWith(githubInstallationDao, undefined);
			expect(response.body.redirectUrl).toContain("https://github.com/apps/test-app/installations/new");

			cleanupSpy.mockRestore();
		});

		it("should still redirect when cleanup throws an error", async () => {
			const cleanupSpy = vi
				.spyOn(GithubAppUtil, "cleanupOrphanedGitHubAppInstallations")
				.mockRejectedValue(new Error("Cleanup failed"));

			const response = await request(app)
				.post("/github/setup/redirect")
				.send({})
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.redirectUrl).toContain("https://github.com/apps/test-app/installations/new");

			cleanupSpy.mockRestore();
		});
	});

	describe("GET /installation/callback (no auth)", () => {
		let publicApp: Express;

		beforeEach(() => {
			const testIntegrationsManager = createMockIntegrationsManager();
			const testGithubInstallationDao = mockGitHubInstallationDao();

			publicApp = express();
			publicApp.use(express.json());
			publicApp.use(cookieParser());
			publicApp.use((req, _res, next) => {
				req.session = {} as unknown as typeof req.session;
				next();
			});
			publicApp.use(
				"/github",
				createGitHubAppRouter(mockDaoProvider(testGithubInstallationDao), testIntegrationsManager, {}),
			);
			integrationsManager = testIntegrationsManager;
			githubInstallationDao = testGithubInstallationDao;
		});

		it("should redirect with error when setup_action is not install", async () => {
			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "cancelled", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=setup_cancelled");
		});

		it("should redirect with error when installation_id is missing", async () => {
			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=no_installation_id");
		});

		it("should redirect with error when installation not found in any app", async () => {
			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{
					id: 999,
					account: { login: "other-org", type: "Organization" },
				} as never,
			]);

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=installation_not_found");
		});

		it("should successfully create installation and redirect for organization", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue([
				"test-org/repo1",
				"test-org/repo2",
			]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe(
				"http://localhost:3000/integrations/github/org/test-org?new_installation=true",
			);
			expect(GithubAppUtil.upsertInstallationContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					account: { login: "test-org", type: "Organization" },
					target_type: "Organization",
				}),
				123,
				["test-org/repo1", "test-org/repo2"],
				expect.anything(),
				"setup flow",
			);
		});

		it("should successfully update existing installation and redirect for user", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 456,
				account: { login: "test-user", type: "User" },
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["test-user/new-repo"]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "456" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe(
				"http://localhost:3000/integrations/github/user/test-user?new_installation=true",
			);
			expect(GithubAppUtil.upsertInstallationContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					account: { login: "test-user", type: "User" },
				}),
				456,
				["test-user/new-repo"],
				expect.anything(),
				"setup flow",
			);
		});

		it("should use state parameter for redirect origin", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 789,
				account: { login: "test-org", type: "Organization" },
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue([]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const customOrigin = "https://custom.example.com";
			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({
					setup_action: "install",
					installation_id: "789",
					state: encodeURIComponent(customOrigin),
				});

			expect(response.status).toBe(302);
			expect(response.header.location).toBe(
				`${customOrigin}/integrations/github/org/test-org?new_installation=true`,
			);
		});

		it("should redirect with error when access token fetch fails", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue({
				error: "failed_to_get_access_token",
			});

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=failed_to_get_access_token");
		});

		it("should redirect with error when fetch repositories fails", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue({
				error: "failed_to_fetch_repositories",
			});

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=failed_to_fetch_repositories");
		});

		it("should handle missing repositories field in API response", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue([]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockResolvedValue(undefined);

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe(
				"http://localhost:3000/integrations/github/org/test-org?new_installation=true",
			);
			expect(GithubAppUtil.upsertInstallationContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					account: { login: "test-org", type: "Organization" },
					target_type: "Organization",
				}),
				123,
				[],
				expect.anything(),
				"setup flow",
			);
		});

		it("should handle JWT creation errors and redirect with installation_not_found", async () => {
			// When findInstallationInGithubApp returns undefined (installation not found)
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue(undefined);

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=installation_not_found");
		});

		it("should handle errors during installation processing and redirect with installation_failed", async () => {
			vi.spyOn(GithubAppUtil, "findInstallationInGithubApp").mockResolvedValue({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
			vi.spyOn(GithubAppUtil, "fetchInstallationRepositories").mockResolvedValue(["test-org/repo1"]);
			vi.spyOn(GithubAppUtil, "upsertInstallationContainer").mockRejectedValue(new Error("Database error"));

			const response = await request(publicApp)
				.get("/github/installation/callback")
				.query({ setup_action: "install", installation_id: "123" });

			expect(response.status).toBe(302);
			expect(response.header.location).toBe("http://localhost:3000/?error=installation_failed");
		});
	});

	describe("GET /github/summary", () => {
		it("should return GitHub integration summary", async () => {
			const installations = [
				{
					id: 1,
					name: "org1",
					containerType: "org" as const,
					appId: 100,
					installationId: 123,
					repos: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					name: "org2",
					containerType: "org" as const,
					appId: 100,
					installationId: 456,
					repos: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 1,
					type: "github",
					status: "active",
					metadata: { installationId: 123, repo: "owner/repo1", branch: "main", features: [] },
				}),
				mockIntegration({
					id: 2,
					type: "github",
					status: "needs_repo_access",
					metadata: { installationId: 123, repo: "owner/repo2", branch: "main", features: [] },
				}),
				mockIntegration({
					id: 3,
					type: "github",
					status: "active",
					metadata: { installationId: 456, repo: "owner/repo3", branch: "main", features: [] },
				}),
			]);

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue(installations);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation")
				.mockResolvedValueOnce([{ full_name: "owner/repo1" } as never, { full_name: "owner/repo2" } as never])
				.mockResolvedValueOnce([{ full_name: "owner/repo3" } as never]);

			const response = await request(app).get("/github/summary").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				orgCount: 2,
				totalRepos: 3,
				enabledRepos: 3,
				needsAttention: 1,
			});
			expect(response.body).toHaveProperty("lastSync");
		});

		it("should return 500 when an error occurs", async () => {
			integrationsManager.listIntegrations = vi.fn().mockRejectedValue(new Error("Database error"));
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			const response = await request(app).get("/github/summary").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to fetch summary" });
		});

		it("should handle errors when fetching repositories for installations", async () => {
			const installations = [
				{
					id: 1,
					name: "org1",
					containerType: "org" as const,
					appId: 100,
					installationId: 123,
					repos: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 1,
					type: "github",
					status: "active",
					metadata: { installationId: 123, repo: "owner/repo1", branch: "main", features: [] },
				}),
			]);

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue(installations);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockRejectedValue(new Error("Network error"));

			const response = await request(app).get("/github/summary").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				orgCount: 1,
				totalRepos: 0,
				enabledRepos: 1,
			});
		});

		it("should refetch integrations after cleaning up orphaned ones", async () => {
			const installations = [
				{
					id: 1,
					name: "org1",
					containerType: "org" as const,
					appId: 100,
					installationId: 123,
					repos: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			integrationsManager.listIntegrations = vi
				.fn()
				.mockResolvedValueOnce([
					mockIntegration({
						id: 1,
						type: "github",
						status: "active",
						metadata: { installationId: 123, repo: "owner/repo1", branch: "main", features: [] },
					}),
					mockIntegration({
						id: 2,
						type: "github",
						status: "active",
						metadata: { installationId: 999, repo: "owner/orphaned-repo", branch: "main", features: [] },
					}),
				])
				.mockResolvedValueOnce([
					mockIntegration({
						id: 1,
						type: "github",
						status: "active",
						metadata: { installationId: 123, repo: "owner/repo1", branch: "main", features: [] },
					}),
				]);

			integrationsManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue(installations);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "owner/repo1" } as never,
			]);

			const response = await request(app).get("/github/summary").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 2,
					metadata: expect.objectContaining({ installationId: 999 }),
				}),
			);
			expect(integrationsManager.listIntegrations).toHaveBeenCalledTimes(2);
			expect(response.body).toMatchObject({
				orgCount: 1,
				totalRepos: 1,
				enabledRepos: 1,
			});
		});
	});

	describe("GET /github/installations", () => {
		it("should return empty array when no installations exist", async () => {
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual([]);
		});

		it("should return installations with org and user data", async () => {
			const mockOrgInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1", "test-org/repo2"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstallation = {
				id: 2,
				name: "test-user",
				appId: 12345,
				installationId: 200,
				repos: ["test-user/repo3"],
				containerType: "user" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockIntegration1 = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				metadata: {
					repo: "test-org/repo1",
					installationId: 100,
					githubAppId: 12345,
					branch: "main",
					features: [],
				},
			});

			githubInstallationDao.listInstallations = vi
				.fn()
				.mockResolvedValue([mockOrgInstallation, mockUserInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([mockIntegration1]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation")
				.mockResolvedValueOnce([{ full_name: "test-org/repo1" }] as never)
				.mockResolvedValueOnce([{ full_name: "test-user/repo3" }] as never);

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0]).toMatchObject({
				id: 1,
				installationId: 100,
				name: "test-org",
				githubAppId: 12345,
				totalRepos: 2,
				enabledRepos: 1,
				containerType: "org",
				appName: "Test App",
				installationStatus: "active",
			});
			expect(response.body[1]).toMatchObject({
				id: 2,
				installationId: 200,
				name: "test-user",
				githubAppId: 12345,
				totalRepos: 1,
				enabledRepos: 0,
				containerType: "user",
				appName: "Test App",
				installationStatus: "active",
			});
		});

		it("should return 500 when an error occurs", async () => {
			githubInstallationDao.listInstallations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to fetch installations" });
		});

		it("should handle errors in checkInstallationStatus gracefully", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockRejectedValue(new Error("Network error"));

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0].installationStatus).toBe("not_installed");
		});

		it("should return not_installed status when getCoreJolliGithubApp returns null in checkInstallationStatus", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const mockApp = mockGitHubApp({
				appId: 12345,
				name: "Test App",
				slug: "test-app",
				privateKey: "test-key",
				htmlUrl: "https://github.com/apps/test-app",
			});

			// First call returns the app (for the main endpoint), second call returns null (for checkInstallationStatus)
			let callCount = 0;
			vi.spyOn(GitHubAppModel, "getCoreJolliGithubApp").mockImplementation((() => {
				callCount++;
				if (callCount === 1) {
					return mockApp;
				}
				return null;
			}) as () => GitHubApp);

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0].installationStatus).toBe("not_installed");
		});

		it("should return not_installed status when getRepositoriesForInstallation returns null", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue(undefined);

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0].installationStatus).toBe("not_installed");
		});
	});

	describe("POST /github/installations/sync", () => {
		it("should sync all GitHub Apps and cleanup orphaned integrations", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);
			const cleanupSpy = vi.spyOn(IntegrationUtil, "cleanupOrphanedGitHubIntegrations").mockResolvedValue(0);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 0 });
			expect(syncSpy).toHaveBeenCalledTimes(1);
			expect(cleanupSpy).toHaveBeenCalledOnce();

			syncSpy.mockRestore();
			cleanupSpy.mockRestore();
		});

		it("should handle sync errors gracefully", async () => {
			const syncSpy = vi
				.spyOn(GithubAppUtil, "syncAllInstallationsForApp")
				.mockRejectedValue(new Error("Sync failed"));
			const cleanupSpy = vi.spyOn(IntegrationUtil, "cleanupOrphanedGitHubIntegrations").mockResolvedValue(0);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			// The error is caught and logged, but the endpoint still returns 200
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 0 });

			syncSpy.mockRestore();
			cleanupSpy.mockRestore();
		});

		it("should handle database errors gracefully", async () => {
			githubInstallationDao.listInstallations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 0 });
		});

		it("should heal integrations with errors during sync", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);
			const cleanupSpy = vi.spyOn(IntegrationUtil, "cleanupOrphanedGitHubIntegrations").mockResolvedValue(0);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			// Create integrations - one with error that can be healed, one without error
			const brokenIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "needs_repo_access",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					accessError: "repoRemovedFromInstallation",
				},
			});

			const healthyIntegration = mockIntegration({
				id: 2,
				type: "github",
				status: "active",
				metadata: {
					repo: "owner/other-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
				},
			});

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration, healthyIntegration]);
			integrationsManager.handleAccessCheck = vi
				.fn()
				.mockResolvedValue({ result: { hasAccess: true, status: "active" } });

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 1 });
			expect(integrationsManager.handleAccessCheck).toHaveBeenCalledTimes(1);
			expect(integrationsManager.handleAccessCheck).toHaveBeenCalledWith(brokenIntegration);

			syncSpy.mockRestore();
			cleanupSpy.mockRestore();
		});

		it("should not count failed healing attempts", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);
			const cleanupSpy = vi.spyOn(IntegrationUtil, "cleanupOrphanedGitHubIntegrations").mockResolvedValue(0);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			// Create an integration with error that still doesn't have access
			const brokenIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "needs_repo_access",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					accessError: "repoRemovedFromInstallation",
				},
			});

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration]);
			integrationsManager.handleAccessCheck = vi
				.fn()
				.mockResolvedValue({ result: { hasAccess: false, status: "needs_repo_access" } });

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 0 });
			expect(integrationsManager.handleAccessCheck).toHaveBeenCalledTimes(1);

			syncSpy.mockRestore();
			cleanupSpy.mockRestore();
		});

		it("should handle errors during access check healing gracefully", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);
			const cleanupSpy = vi.spyOn(IntegrationUtil, "cleanupOrphanedGitHubIntegrations").mockResolvedValue(0);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			// Create an integration with error
			const brokenIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "needs_repo_access",
				metadata: {
					repo: "owner/test-repo",
					branch: "main",
					features: ["push"],
					githubAppId: 456,
					installationId: 123,
					accessError: "repoRemovedFromInstallation",
				},
			});

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([brokenIntegration]);
			integrationsManager.handleAccessCheck = vi.fn().mockRejectedValue(new Error("Access check failed"));

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			// Should still succeed but not count as healed
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 0 });

			syncSpy.mockRestore();
			cleanupSpy.mockRestore();
		});

		it("should handle errors when listing integrations during healing", async () => {
			const syncSpy = vi.spyOn(GithubAppUtil, "syncAllInstallationsForApp").mockResolvedValue([]);
			const cleanupSpy = vi.spyOn(IntegrationUtil, "cleanupOrphanedGitHubIntegrations").mockResolvedValue(0);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			integrationsManager.listIntegrations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			// Should still succeed
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ message: "Synced GitHub Installations for App", healedCount: 0 });

			syncSpy.mockRestore();
			cleanupSpy.mockRestore();
		});

		it("should return 500 when getCoreJolliGithubApp fails", async () => {
			// Mock getCoreJolliGithubApp to throw before any try-catch blocks
			const getCoreJolliGithubAppSpy = vi
				.spyOn(GitHubAppModel, "getCoreJolliGithubApp")
				.mockImplementation(() => {
					throw new Error("Failed to get GitHub app");
				});

			const response = await request(app)
				.post("/github/installations/sync")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to sync installations" });

			getCoreJolliGithubAppSpy.mockRestore();
		});
	});

	describe("GET /github/installations/:installationId/repos", () => {
		it("should return 400 when installationId is invalid", async () => {
			const response = await request(app)
				.get("/github/installations/invalid/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid installation ID" });
		});

		it("should return 404 when installation not found", async () => {
			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Installation not found" });
		});

		it("should return 500 when an error occurs", async () => {
			githubInstallationDao.lookupByInstallationId = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to fetch repositories" });
		});

		it("should return repos with integration status", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 123,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const existingIntegration = mockIntegration({
				id: 1,
				type: "github",
				metadata: { repo: "test-org/repo1", branch: "main", features: [], installationId: 123 },
			});

			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInstallation);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([existingIntegration]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "test-org/repo1", default_branch: "main" } as never,
				{ full_name: "test-org/repo2", default_branch: "main" } as never,
			]);

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				repos: [
					{
						fullName: "test-org/repo1",
						defaultBranch: "main",
						enabled: true,
						status: "active",
						integrationId: 1,
						lastAccessCheck: undefined,
						accessError: undefined,
					},
					{
						fullName: "test-org/repo2",
						defaultBranch: "main",
						enabled: false,
						status: "available",
						integrationId: undefined,
						lastAccessCheck: undefined,
						accessError: undefined,
					},
				],
				installationStatus: "active",
			});
		});

		it("should include repos with integrations that are no longer in GitHub installation", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 123,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const removedRepoIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				metadata: {
					repo: "test-org/removed-repo",
					branch: "main",
					features: [],
					installationId: 123,
					githubAppId: 12345,
				},
			});

			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInstallation);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([removedRepoIntegration]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "test-org/other-repo", default_branch: "main" } as never,
			]);

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.repos).toContainEqual({
				fullName: "test-org/removed-repo",
				defaultBranch: "main",
				enabled: true,
				status: "needs_repo_access",
				integrationId: 1,
				lastAccessCheck: undefined,
				accessError: "repoNotAccessibleViaInstallation",
			});
		});

		it("should handle removed repo integration without branch metadata", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 123,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const removedRepoIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				metadata: {
					repo: "test-org/removed-repo",
					features: [],
					installationId: 123,
					githubAppId: 12345,
				} as never,
			});

			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInstallation);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([removedRepoIntegration]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([]);

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.repos).toContainEqual({
				fullName: "test-org/removed-repo",
				defaultBranch: "main",
				enabled: true,
				status: "needs_repo_access",
				integrationId: 1,
				lastAccessCheck: undefined,
				accessError: "repoNotAccessibleViaInstallation",
			});
		});

		it("should handle app uninstalled case by returning not_installed status", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 123,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInstallation);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue(undefined);

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				repos: [],
				installationStatus: "not_installed",
			});
		});

		it("should skip integrations without repo metadata when adding removed repos", async () => {
			const mockInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 123,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const badIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				metadata: {
					branch: "main",
					features: [],
					installationId: 123,
					githubAppId: 12345,
				} as never,
			});

			const goodIntegration = mockIntegration({
				id: 2,
				type: "github",
				status: "active",
				metadata: {
					repo: "test-org/good-repo",
					branch: "main",
					features: [],
					installationId: 123,
					githubAppId: 12345,
				},
			});

			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(mockInstallation);
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([mockInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([badIntegration, goodIntegration]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([]);

			const response = await request(app)
				.get("/github/installations/123/repos")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.repos).toHaveLength(1);
			expect(response.body.repos[0].fullName).toBe("test-org/good-repo");
		});
	});

	describe("POST /github/repos/:owner/:repo", () => {
		it("should return existing integration if already enabled", async () => {
			const existing = mockIntegration({
				id: 1,
				type: "github",
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			});

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([existing]);

			const response = await request(app)
				.post("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`)
				.send({ branch: "main" });

			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({
				...existing,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			});
		});

		it("should create new integration when none exists", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 100, account: { login: "test-org" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "owner/repo", default_branch: "main" } as never,
			]);

			// Installation exists in the tenant's local DB
			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue({
				id: 1,
				name: "test-org",
				installationId: 100,
				appId: 12345,
				repos: ["owner/repo"],
				containerType: "org",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const newIntegration = mockIntegration({
				id: 1,
				type: "github",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: [],
					githubAppId: 12345,
					installationId: 100,
				},
			});

			integrationsManager.createIntegration = vi.fn().mockResolvedValue(newIntegration);

			const response = await request(app)
				.post("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`)
				.send({ branch: "main" });

			expect(response.status).toBe(201);
			expect(integrationsManager.createIntegration).toHaveBeenCalled();
		});

		it("should return 404 when repository not found in any installation", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 100, account: { login: "test-org" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "other/repo", default_branch: "main" } as never,
			]);

			const response = await request(app)
				.post("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`)
				.send({ branch: "main" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Repository not found in any GitHub App installation" });
		});

		it("should return 500 when an error occurs", async () => {
			integrationsManager.listIntegrations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`)
				.send({ branch: "main" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to enable repository" });
		});

		it("should default to main branch when branch not provided", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
				{ id: 100, account: { login: "test-org" } } as never,
			]);
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "owner/repo", default_branch: "main" } as never,
			]);

			// Installation exists in the tenant's local DB
			githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue({
				id: 1,
				name: "test-org",
				installationId: 100,
				appId: 12345,
				repos: ["owner/repo"],
				containerType: "org",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const newIntegration = mockIntegration({
				id: 1,
				type: "github",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: [],
					githubAppId: 12345,
					installationId: 100,
				},
			});

			integrationsManager.createIntegration = vi.fn().mockResolvedValue(newIntegration);

			const response = await request(app)
				.post("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`)
				.send({});

			expect(response.status).toBe(201);
			expect(integrationsManager.createIntegration).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						branch: "main",
					}),
				}),
			);
		});

		it("should handle when getInstallations returns null", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue(undefined);

			const response = await request(app)
				.post("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`)
				.send({ branch: "main" });

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("Repository not found in any GitHub App installation");
		});
	});

	describe("DELETE /github/repos/:owner/:repo", () => {
		it("should delete repository integration", async () => {
			const existing = mockIntegration({
				id: 1,
				type: "github",
				metadata: { repo: "owner/repo", branch: "main", features: [] },
			});

			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([existing]);
			integrationsManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.delete("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(existing);
		});

		it("should return 404 when integration not found", async () => {
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			const response = await request(app)
				.delete("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Integration not found" });
		});

		it("should return 500 when an error occurs", async () => {
			integrationsManager.listIntegrations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.delete("/github/repos/owner/repo")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to remove repository integration" });
		});
	});

	describe("DELETE /github/installations/:id", () => {
		it("should delete installation and all its integrations", async () => {
			const installation = {
				id: 1,
				name: "test-org",
				appId: 100,
				installationId: 12345,
				repos: ["test-org/repo1", "test-org/repo2"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const integration1 = mockIntegration({
				id: 10,
				type: "github",
				metadata: { repo: "test-org/repo1", installationId: 12345, branch: "main", features: [] },
			});
			const integration2 = mockIntegration({
				id: 11,
				type: "github",
				metadata: { repo: "test-org/repo2", installationId: 12345, branch: "main", features: [] },
			});

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([installation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([integration1, integration2]);
			integrationsManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);
			githubInstallationDao.deleteInstallation = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, deletedIntegrations: 2 });
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(integration1);
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(integration2);
			expect(githubInstallationDao.deleteInstallation).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid installation ID", async () => {
			const response = await request(app)
				.delete("/github/installations/invalid")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid installation ID" });
		});

		it("should return 404 when installation not found", async () => {
			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([]);

			const response = await request(app)
				.delete("/github/installations/999")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Installation not found" });
		});

		it("should return 500 when an error occurs", async () => {
			githubInstallationDao.listInstallations = vi.fn().mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete installation" });
		});

		it("should call uninstallGitHubApp after local deletion", async () => {
			const uninstallSpy = vi.spyOn(GithubAppUtil, "uninstallGitHubApp").mockResolvedValue(true);

			const installation = {
				id: 1,
				name: "test-org",
				appId: 100,
				installationId: 12345,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([installation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);
			githubInstallationDao.deleteInstallation = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(uninstallSpy).toHaveBeenCalledWith(12345);

			uninstallSpy.mockRestore();
		});

		it("should still succeed when GitHub uninstall fails", async () => {
			const uninstallSpy = vi
				.spyOn(GithubAppUtil, "uninstallGitHubApp")
				.mockRejectedValue(new Error("GitHub API error"));

			const installation = {
				id: 1,
				name: "test-org",
				appId: 100,
				installationId: 12345,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([installation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);
			githubInstallationDao.deleteInstallation = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			// Should still succeed — uninstall failure is logged but not propagated
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, deletedIntegrations: 0 });
			expect(uninstallSpy).toHaveBeenCalledWith(12345);

			uninstallSpy.mockRestore();
		});

		it("should delete integrations matching owner prefix even without installationId", async () => {
			const installation = {
				id: 1,
				name: "test-org",
				appId: 100,
				installationId: 12345,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const integration1 = mockIntegration({
				id: 10,
				type: "github",
				metadata: { repo: "test-org/repo1", installationId: 12345, branch: "main", features: [] },
			});

			const integration2 = mockIntegration({
				id: 11,
				type: "github",
				metadata: { repo: "test-org/repo2", branch: "main", features: [] },
			});

			const integration3 = mockIntegration({
				id: 12,
				type: "github",
				metadata: { repo: "other-org/repo1", branch: "main", features: [] },
			});

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([installation]);
			integrationsManager.listIntegrations = vi
				.fn()
				.mockResolvedValue([integration1, integration2, integration3]);
			integrationsManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);
			githubInstallationDao.deleteInstallation = vi.fn().mockResolvedValue(undefined);

			const response = await request(app)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, deletedIntegrations: 2 });
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(integration1);
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(integration2);
			expect(integrationsManager.deleteIntegration).not.toHaveBeenCalledWith(integration3);
			expect(githubInstallationDao.deleteInstallation).toHaveBeenCalledWith(1);
		});

		it("should clean up installation mapping in registry when registryClient is provided", async () => {
			const mockRegistryClient = {
				deleteInstallationMapping: vi.fn().mockResolvedValue(undefined),
			};
			const registryApp = express();
			registryApp.use(express.json());
			registryApp.use(cookieParser());
			registryApp.use((req, _res, next) => {
				req.session = {} as unknown as typeof req.session;
				next();
			});
			registryApp.use("/github", createAuthHandler(tokenUtil));
			registryApp.use(
				"/github",
				createGitHubAppRouter(mockDaoProvider(githubInstallationDao), integrationsManager, {
					registryClient: mockRegistryClient as never,
				}),
			);

			const installation = {
				id: 1,
				name: "test-org",
				appId: 100,
				installationId: 12345,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([installation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);
			githubInstallationDao.deleteInstallation = vi.fn().mockResolvedValue(undefined);

			const response = await request(registryApp)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(mockRegistryClient.deleteInstallationMapping).toHaveBeenCalledWith(12345);
		});

		it("should succeed even if registry cleanup fails", async () => {
			const mockRegistryClient = {
				deleteInstallationMapping: vi.fn().mockRejectedValue(new Error("Registry error")),
			};
			const registryApp = express();
			registryApp.use(express.json());
			registryApp.use(cookieParser());
			registryApp.use((req, _res, next) => {
				req.session = {} as unknown as typeof req.session;
				next();
			});
			registryApp.use("/github", createAuthHandler(tokenUtil));
			registryApp.use(
				"/github",
				createGitHubAppRouter(mockDaoProvider(githubInstallationDao), integrationsManager, {
					registryClient: mockRegistryClient as never,
				}),
			);

			const installation = {
				id: 1,
				name: "test-org",
				appId: 100,
				installationId: 12345,
				repos: [],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([installation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);
			githubInstallationDao.deleteInstallation = vi.fn().mockResolvedValue(undefined);

			const response = await request(registryApp)
				.delete("/github/installations/1")
				.set("Cookie", `authToken=${authToken}`);

			// Should still succeed — registry cleanup failure is logged but not propagated
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true, deletedIntegrations: 0 });
			expect(mockRegistryClient.deleteInstallationMapping).toHaveBeenCalledWith(12345);
		});
	});

	describe("multi-tenant security", () => {
		afterEach(() => {
			delete process.env.MULTI_TENANT_ENABLED;
			resetConfig();
		});

		describe("POST /repos/:owner/:repo cross-tenant protection", () => {
			it("should return 403 when the installation is not in the tenant's local DB", async () => {
				integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

				vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
				vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
					{ id: 100, account: { login: "other-org" } } as never,
				]);
				vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
					{ full_name: "owner/repo", default_branch: "main" } as never,
				]);

				// Default mock lookupByInstallationId returns undefined,
				// simulating that this installation belongs to another tenant
				githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue(undefined);

				const response = await request(app)
					.post("/github/repos/owner/repo")
					.set("Cookie", `authToken=${authToken}`)
					.send({ branch: "main" });

				expect(response.status).toBe(403);
				expect(response.body).toEqual({
					error: "This GitHub installation is not connected to your organization",
				});
			});

			it("should allow enabling a repo when installation exists in tenant's local DB", async () => {
				integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

				vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
				vi.spyOn(GithubAppUtil, "getInstallations").mockResolvedValue([
					{ id: 100, account: { login: "test-org" } } as never,
				]);
				vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
					{ full_name: "owner/repo", default_branch: "main" } as never,
				]);

				// Installation exists in tenant's local DB
				githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue({
					id: 1,
					name: "test-org",
					installationId: 100,
					appId: 12345,
					repos: ["owner/repo"],
					containerType: "org",
					createdAt: new Date(),
					updatedAt: new Date(),
				});

				const newIntegration = mockIntegration({
					id: 1,
					type: "github",
					metadata: {
						repo: "owner/repo",
						branch: "main",
						features: [],
						githubAppId: 12345,
						installationId: 100,
					},
				});
				integrationsManager.createIntegration = vi.fn().mockResolvedValue(newIntegration);

				const response = await request(app)
					.post("/github/repos/owner/repo")
					.set("Cookie", `authToken=${authToken}`)
					.send({ branch: "main" });

				expect(response.status).toBe(201);
				expect(integrationsManager.createIntegration).toHaveBeenCalled();
			});
		});

		describe("GET /installation/callback in multi-tenant mode", () => {
			let publicApp: Express;

			beforeEach(() => {
				process.env.MULTI_TENANT_ENABLED = "true";
				resetConfig();

				const testIntegrationsManager = createMockIntegrationsManager();
				const testGithubInstallationDao = mockGitHubInstallationDao();

				publicApp = express();
				publicApp.use(express.json());
				publicApp.use(cookieParser());
				publicApp.use((req, _res, next) => {
					req.session = {} as unknown as typeof req.session;
					next();
				});
				publicApp.use(
					"/github",
					createGitHubAppRouter(mockDaoProvider(testGithubInstallationDao), testIntegrationsManager, {}),
				);
			});

			it("should redirect with error when callback is hit in multi-tenant mode", async () => {
				const response = await request(publicApp)
					.get("/github/installation/callback")
					.query({ setup_action: "install", installation_id: "123" });

				expect(response.status).toBe(302);
				expect(response.header.location).toBe("http://localhost:3000/?error=use_connect_gateway");
			});

			it("should redirect with error even when state is present but not encrypted", async () => {
				const response = await request(publicApp)
					.get("/github/installation/callback")
					.query({
						setup_action: "install",
						installation_id: "123",
						state: encodeURIComponent("https://tenant.example.com"),
					});

				expect(response.status).toBe(302);
				expect(response.header.location).toBe("http://localhost:3000/?error=use_connect_gateway");
			});
		});

		describe("missing tenant context in multi-tenant mode", () => {
			let multiTenantApp: Express;

			beforeEach(() => {
				process.env.MULTI_TENANT_ENABLED = "true";
				resetConfig();

				const testIntegrationsManager = createMockIntegrationsManager();
				const testGithubInstallationDao = mockGitHubInstallationDao();

				const authHandler = createAuthHandler(tokenUtil);

				multiTenantApp = express();
				multiTenantApp.use(express.json());
				multiTenantApp.use(cookieParser());
				multiTenantApp.use((req, _res, next) => {
					req.session = {} as unknown as typeof req.session;
					next();
				});
				multiTenantApp.use("/github", authHandler);
				multiTenantApp.use(
					"/github",
					createGitHubAppRouter(mockDaoProvider(testGithubInstallationDao), testIntegrationsManager, {}),
				);
			});

			it("should return 500 for GET /summary when tenant context is missing", async () => {
				const response = await request(multiTenantApp)
					.get("/github/summary")
					.set("Cookie", `authToken=${authToken}`);

				expect(response.status).toBe(500);
				expect(response.body).toEqual({ error: "Failed to fetch summary" });
			});

			it("should return 500 for GET /installations when tenant context is missing", async () => {
				const response = await request(multiTenantApp)
					.get("/github/installations")
					.set("Cookie", `authToken=${authToken}`);

				expect(response.status).toBe(500);
				expect(response.body).toEqual({ error: "Failed to fetch installations" });
			});

			it("should return 500 for POST /installations/sync when tenant context is missing", async () => {
				const response = await request(multiTenantApp)
					.post("/github/installations/sync")
					.set("Cookie", `authToken=${authToken}`);

				expect(response.status).toBe(500);
				expect(response.body).toEqual({ error: "Failed to sync installations" });
			});
		});
	});

	describe("Orphaned integration cleanup", () => {
		it("should cleanup orphaned integrations when fetching installations", async () => {
			const validInstallation = {
				id: 1,
				name: "test-org",
				appId: 12345,
				installationId: 100,
				repos: ["test-org/repo1"],
				containerType: "org" as const,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const validIntegration = mockIntegration({
				id: 10,
				type: "github",
				metadata: { repo: "test-org/repo1", installationId: 100, branch: "main", features: [] },
			});

			const orphanedIntegration = mockIntegration({
				id: 11,
				type: "github",
				metadata: { repo: "orphaned/repo", installationId: 999, branch: "main", features: [] },
			});

			githubInstallationDao.listInstallations = vi.fn().mockResolvedValue([validInstallation]);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([validIntegration, orphanedIntegration]);
			integrationsManager.deleteIntegration = vi.fn().mockResolvedValue(undefined);

			vi.spyOn(GithubAppUtil, "createGitHubAppJWT").mockReturnValue("mock-jwt-token");
			vi.spyOn(GithubAppUtil, "getRepositoriesForInstallation").mockResolvedValue([
				{ full_name: "test-org/repo1" } as never,
			]);

			const response = await request(app).get("/github/installations").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(integrationsManager.deleteIntegration).toHaveBeenCalledWith(orphanedIntegration);
			expect(integrationsManager.deleteIntegration).not.toHaveBeenCalledWith(validIntegration);
		});
	});
});
