import { clearTenantConfigCache, getConfig, reloadConfig } from "../config/Config";
import type { CollabConvoDao } from "../dao/CollabConvoDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { JobDao } from "../dao/JobDao";
import type { SiteDao } from "../dao/SiteDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import type { JobScheduler } from "../jobs/JobScheduler.js";
import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import type { TokenUtil } from "../util/TokenUtil";
import { createDevToolsRedirectRouter, createDevToolsRouter } from "./DevToolsRouter";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config");

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("DevToolsRouter", () => {
	let app: Express;
	let mockJobScheduler: JobScheduler;
	let mockSchedulerManager: MultiTenantJobSchedulerManager;
	let mockDocDao: DocDao;
	let mockDocDraftDao: DocDraftDao;
	let mockDocDraftSectionChangesDao: DocDraftSectionChangesDao;
	let mockCollabConvoDao: CollabConvoDao;
	let mockSiteDao: SiteDao;
	let mockJobDao: JobDao;
	let mockIntegrationDao: IntegrationDao;
	let mockGitHubInstallationDao: GitHubInstallationDao;
	let mockSyncArticleDao: SyncArticleDao;
	let mockSpaceDao: SpaceDao;
	let mockTokenUtil: TokenUtil<UserInfo>;
	const origin = "http://localhost:8034";

	function setupApp(): void {
		app = express();
		app.use(express.json());

		mockJobScheduler = {
			queueJob: vi.fn().mockResolvedValue({
				jobId: "test-job-id",
				name: "demo:test-job",
				message: "Job queued successfully",
			}),
		} as unknown as JobScheduler;

		mockSchedulerManager = {
			getSchedulerForContext: vi.fn().mockResolvedValue(undefined),
		} as unknown as MultiTenantJobSchedulerManager;

		mockDocDao = {
			deleteAllDocs: vi.fn().mockResolvedValue(undefined),
			readDoc: vi.fn(),
		} as unknown as DocDao;

		mockDocDraftDao = {
			deleteAllDocDrafts: vi.fn().mockResolvedValue(undefined),
			createDocDraft: vi.fn().mockResolvedValue({ id: 123, title: "Test Article", content: "" }),
		} as unknown as DocDraftDao;

		mockDocDraftSectionChangesDao = {
			createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
		} as unknown as DocDraftSectionChangesDao;

		mockCollabConvoDao = {
			deleteAllCollabConvos: vi.fn().mockResolvedValue(undefined),
		} as unknown as CollabConvoDao;

		mockSiteDao = {
			deleteAllSites: vi.fn().mockResolvedValue(undefined),
		} as unknown as SiteDao;

		mockJobDao = {
			deleteAllJobs: vi.fn().mockResolvedValue(undefined),
			listJobExecutions: vi.fn().mockResolvedValue([]),
		} as unknown as JobDao;

		mockIntegrationDao = {
			removeAllGitHubIntegrations: vi.fn().mockResolvedValue(undefined),
		} as unknown as IntegrationDao;

		mockGitHubInstallationDao = {
			deleteAllInstallations: vi.fn().mockResolvedValue(undefined),
		} as unknown as GitHubInstallationDao;

		mockSyncArticleDao = {
			deleteAllSyncArticles: vi.fn().mockResolvedValue(undefined),
		} as unknown as SyncArticleDao;

		mockSpaceDao = {
			deleteAllSpaces: vi.fn().mockResolvedValue(undefined),
		} as unknown as SpaceDao;

		mockTokenUtil = {
			getUserInfo: vi.fn().mockReturnValue({ id: 1, email: "test@example.com" }),
			decodePayload: vi.fn().mockReturnValue({ userId: 1, email: "test@example.com" }),
		} as unknown as TokenUtil<UserInfo>;

		// Mount the redirect router first (unauthenticated in production)
		app.use("/dev-tools", createDevToolsRedirectRouter());
		// Then mount the main dev tools router (authenticated in production)
		app.use(
			"/dev-tools",
			createDevToolsRouter({
				jobScheduler: mockJobScheduler,
				schedulerManager: mockSchedulerManager,
				docDaoProvider: mockDaoProvider(mockDocDao),
				docDraftDaoProvider: mockDaoProvider(mockDocDraftDao),
				docDraftSectionChangesDaoProvider: mockDaoProvider(mockDocDraftSectionChangesDao),
				collabConvoDaoProvider: mockDaoProvider(mockCollabConvoDao),
				siteDaoProvider: mockDaoProvider(mockSiteDao),
				jobDaoProvider: mockDaoProvider(mockJobDao),
				integrationDaoProvider: mockDaoProvider(mockIntegrationDao),
				gitHubInstallationDaoProvider: mockDaoProvider(mockGitHubInstallationDao),
				syncArticleDaoProvider: mockDaoProvider(mockSyncArticleDao),
				spaceDaoProvider: mockDaoProvider(mockSpaceDao),
				tokenUtil: mockTokenUtil,
			}),
		);
	}

	beforeEach(() => {
		setupApp();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("GET /info", () => {
		it("should return disabled when USE_DEVELOPER_TOOLS is false", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/info");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				enabled: false,
				githubAppCreatorEnabled: false,
				jobTesterEnabled: false,
				dataClearerEnabled: false,
			});
		});

		it("should return dev tools info when USE_DEVELOPER_TOOLS is true", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
				SMEE_API_URL: "https://smee.io/test",
				DEV_TOOLS_GITHUB_APP_NAME: "jolli-local",
				ORIGIN: origin,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/info");

			expect(response.status).toBe(200);
			expect(response.body.enabled).toBe(true);
			expect(response.body.githubApp).toBeDefined();
			expect(response.body.githubApp.defaultOrg).toBe("jolliai");
			expect(response.body.githubApp.defaultManifest).toBeDefined();
			expect(response.body.githubApp.defaultManifest.name).toBe("jolli-local");
			expect(response.body.githubApp.defaultManifest.url).toBe(origin);
		});

		it("should set webhook URL when SMEE_API_URL is configured", async () => {
			const smeeUrl = "https://smee.io/test123";
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
				SMEE_API_URL: smeeUrl,
				DEV_TOOLS_GITHUB_APP_NAME: "jolli-local",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/info");

			expect(response.status).toBe(200);
			expect(response.body.githubApp.defaultManifest.hook_attributes.url).toBe(smeeUrl);
			expect(response.body.githubApp.defaultManifest.hook_attributes.active).toBe(true);
		});

		it("should set empty webhook URL when SMEE_API_URL is not configured", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
				SMEE_API_URL: undefined,
				DEV_TOOLS_GITHUB_APP_NAME: "jolli-local",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/info");

			expect(response.status).toBe(200);
			expect(response.body.githubApp.defaultManifest.hook_attributes.url).toBe("");
			expect(response.body.githubApp.defaultManifest.hook_attributes.active).toBe(false);
		});

		it("should use fallback app name when DEV_TOOLS_GITHUB_APP_NAME is not configured", async () => {
			const originalPstoreEnv = process.env.PSTORE_ENV;
			process.env.PSTORE_ENV = "test-env";

			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
				SMEE_API_URL: "https://smee.io/test",
				DEV_TOOLS_GITHUB_APP_NAME: undefined,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/info");

			expect(response.status).toBe(200);
			expect(response.body.githubApp.defaultManifest.name).toBe("jolli-test-env");

			// Restore original value
			if (originalPstoreEnv !== undefined) {
				process.env.PSTORE_ENV = originalPstoreEnv;
			} else {
				delete process.env.PSTORE_ENV;
			}
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(getConfig).mockImplementation(() => {
				throw new Error("Config error");
			});

			const response = await request(app).get("/dev-tools/info");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("internal_server_error");
		});
	});

	describe("GET /github-app/callback", () => {
		it("should return 403 when developer tools are disabled", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/github-app/callback?code=test123");

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("developer_tools_disabled");
		});

		it("should return 400 when code is missing", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/github-app/callback");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_code");
		});

		it("should return 400 when code is not a string", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/github-app/callback?code[]=test");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_code");
		});

		it("should exchange code for GitHub App configuration", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const mockAppData = {
				id: 12345,
				slug: "test-app",
				name: "Test App",
				client_id: "Iv1.test123",
				client_secret: "secret123",
				webhook_secret: "webhook123",
				pem: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
				html_url: "https://github.com/apps/test-app",
				created_at: "2024-01-01T00:00:00Z",
				updated_at: "2024-01-01T00:00:00Z",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockAppData,
			});

			const response = await request(app).get("/dev-tools/github-app/callback?code=test123");

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.config).toBeDefined();
			expect(response.body.appInfo.name).toBe("Test App");
			expect(response.body.appInfo.htmlUrl).toBe("https://github.com/apps/test-app");

			const config = JSON.parse(response.body.config);
			expect(config.app_id).toBe(12345);
			expect(config.slug).toBe("test-app");
			expect(config.client_id).toBe("Iv1.test123");
			expect(config.private_key).toBe(mockAppData.pem);
		});

		it("should handle GitHub API errors", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				text: async () => "Not found",
			});

			const response = await request(app).get("/dev-tools/github-app/callback?code=invalid");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("github_api_error");
		});

		it("should handle fetch errors", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const response = await request(app).get("/dev-tools/github-app/callback?code=test123");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("internal_server_error");
		});
	});

	describe("POST /trigger-demo-job", () => {
		it("should return 403 when developer tools are disabled", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/trigger-demo-job").send({ jobName: "demo:test" });

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("developer_tools_disabled");
		});

		it("should return 400 when jobName is missing", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/trigger-demo-job").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_job_name");
		});

		it("should return 400 when jobName is not a string", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/trigger-demo-job").send({ jobName: 123 });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_job_name");
		});

		it("should return 400 when jobName is not a demo job", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({ jobName: "core:health-check" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_job_name");
		});

		it("should trigger demo job successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({ jobName: "demo:quick-stats" });

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.message).toBe("Job queued successfully");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "demo:quick-stats",
				params: {},
			});
		});

		it("should handle job scheduler errors", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockJobScheduler.queueJob).mockRejectedValueOnce(new Error("Queue error"));

			const response = await request(app).post("/dev-tools/trigger-demo-job").send({ jobName: "demo:test-job" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("internal_server_error");
		});

		it("should trigger knowledge-graph job for demo:run-end2end-flow with valid integrationId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-end2end-flow",
					params: { integrationId: 123 },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:run-end2end-flow");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:architecture",
				params: { integrationId: 123 },
				options: { priority: "normal" },
			});
		});

		it("should trigger knowledge-graph job for demo:run-end2end-flow with string integrationId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-end2end-flow",
					params: { integrationId: "456" },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:run-end2end-flow");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:architecture",
				params: { integrationId: 456 },
				options: { priority: "normal" },
			});
		});

		it("should return 400 for demo:run-end2end-flow with invalid integrationId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-end2end-flow",
					params: { integrationId: "not-a-number" },
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_integration_id");
		});

		it("should return 400 for demo:run-end2end-flow without integrationId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/trigger-demo-job").send({
				jobName: "demo:run-end2end-flow",
				params: {},
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_integration_id");
		});

		it("should trigger knowledge-graph job for demo:run-end2end-flow with jrnPrefix", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-end2end-flow",
					params: { integrationId: 123, jrnPrefix: "/custom/path" },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:run-end2end-flow");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:architecture",
				params: { integrationId: 123, jrnPrefix: "/custom/path" },
				options: { priority: "normal" },
			});
		});

		it("should trigger knowledge-graph code-to-api-articles job with valid integrationId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:code-to-api-articles",
					params: { integrationId: 789 },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:code-to-api-articles");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:code-to-api-articles",
				params: { integrationId: 789 },
				options: { priority: "normal" },
			});
		});

		it("should trigger knowledge-graph code-to-api-articles job with jrnPrefix", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:code-to-api-articles",
					params: { integrationId: 789, jrnPrefix: "/api/docs" },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:code-to-api-articles");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:code-to-api-articles",
				params: { integrationId: 789, jrnPrefix: "/api/docs" },
				options: { priority: "normal" },
			});
		});

		it("should return 400 for demo:code-to-api-articles with invalid integrationId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:code-to-api-articles",
					params: { integrationId: "invalid" },
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_integration_id");
		});

		it("should trigger run-jolliscript job with valid docJrn", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-jolliscript",
					params: { docJrn: "/home/space-1/test.md" },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:run-jolliscript");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/test.md", syncUp: true, syncDown: true, useUpdatePrompt: false },
				options: { priority: "normal" },
			});
		});

		it("should trigger run-jolliscript job with syncUp and syncDown set to false", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-jolliscript",
					params: { docJrn: "/home/space-1/test.md", syncUp: false, syncDown: false },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:run-jolliscript");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/test.md", syncUp: false, syncDown: false, useUpdatePrompt: false },
				options: { priority: "normal" },
			});
		});

		it("should trigger run-jolliscript job with useUpdatePrompt set to true", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-jolliscript",
					params: { docJrn: "/home/space-1/test.md", syncUp: false, syncDown: false, useUpdatePrompt: true },
				});

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("test-job-id");
			expect(response.body.mappedFrom).toBe("demo:run-jolliscript");

			expect(mockJobScheduler.queueJob).toHaveBeenCalledWith({
				name: "knowledge-graph:run-jolliscript",
				params: { docJrn: "/home/space-1/test.md", syncUp: false, syncDown: false, useUpdatePrompt: true },
				options: { priority: "normal" },
			});
		});

		it("should return 400 for demo:run-jolliscript with missing docJrn", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/trigger-demo-job").send({
				jobName: "demo:run-jolliscript",
				params: {},
			});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_doc_arn");
		});

		it("should return 400 for demo:run-jolliscript with empty docJrn", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/trigger-demo-job")
				.send({
					jobName: "demo:run-jolliscript",
					params: { docJrn: "   " },
				});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_doc_arn");
		});

		it("should return 503 when no scheduler is available (multi-tenant mode without jobScheduler)", async () => {
			// Setup app without jobScheduler to test schedulerManager fallback path
			const appNoScheduler = express();
			appNoScheduler.use(express.json());
			appNoScheduler.use(
				"/dev-tools",
				createDevToolsRouter({
					// No jobScheduler provided - will fall back to schedulerManager
					schedulerManager: mockSchedulerManager,
					docDaoProvider: mockDaoProvider(mockDocDao),
					docDraftDaoProvider: mockDaoProvider(mockDocDraftDao),
					docDraftSectionChangesDaoProvider: mockDaoProvider(mockDocDraftSectionChangesDao),
					collabConvoDaoProvider: mockDaoProvider(mockCollabConvoDao),
					siteDaoProvider: mockDaoProvider(mockSiteDao),
					jobDaoProvider: mockDaoProvider(mockJobDao),
					integrationDaoProvider: mockDaoProvider(mockIntegrationDao),
					gitHubInstallationDaoProvider: mockDaoProvider(mockGitHubInstallationDao),
					syncArticleDaoProvider: mockDaoProvider(mockSyncArticleDao),
					spaceDaoProvider: mockDaoProvider(mockSpaceDao),
					tokenUtil: mockTokenUtil,
				}),
			);

			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			// schedulerManager.getSchedulerForContext returns undefined by default
			const response = await request(appNoScheduler)
				.post("/dev-tools/trigger-demo-job")
				.send({ jobName: "demo:quick-stats" });

			expect(response.status).toBe(503);
			expect(response.body.error).toBe("job_scheduler_unavailable");
		});

		it("should use scheduler from schedulerManager when jobScheduler is not provided", async () => {
			// Create a scheduler that will be returned by schedulerManager
			const contextScheduler = {
				queueJob: vi.fn().mockResolvedValue({
					jobId: "context-job-id",
					name: "demo:test-job",
					message: "Job queued from context",
				}),
			} as unknown as JobScheduler;

			const appWithContextScheduler = express();
			appWithContextScheduler.use(express.json());

			const contextSchedulerManager = {
				getSchedulerForContext: vi.fn().mockResolvedValue(contextScheduler),
			} as unknown as MultiTenantJobSchedulerManager;

			appWithContextScheduler.use(
				"/dev-tools",
				createDevToolsRouter({
					// No jobScheduler - will use schedulerManager
					schedulerManager: contextSchedulerManager,
					docDaoProvider: mockDaoProvider(mockDocDao),
					docDraftDaoProvider: mockDaoProvider(mockDocDraftDao),
					docDraftSectionChangesDaoProvider: mockDaoProvider(mockDocDraftSectionChangesDao),
					collabConvoDaoProvider: mockDaoProvider(mockCollabConvoDao),
					siteDaoProvider: mockDaoProvider(mockSiteDao),
					jobDaoProvider: mockDaoProvider(mockJobDao),
					integrationDaoProvider: mockDaoProvider(mockIntegrationDao),
					gitHubInstallationDaoProvider: mockDaoProvider(mockGitHubInstallationDao),
					syncArticleDaoProvider: mockDaoProvider(mockSyncArticleDao),
					spaceDaoProvider: mockDaoProvider(mockSpaceDao),
					tokenUtil: mockTokenUtil,
				}),
			);

			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(appWithContextScheduler)
				.post("/dev-tools/trigger-demo-job")
				.send({ jobName: "demo:quick-stats" });

			expect(response.status).toBe(200);
			expect(response.body.jobId).toBe("context-job-id");
			expect(contextScheduler.queueJob).toHaveBeenCalledWith({
				name: "demo:quick-stats",
				params: {},
			});
		});
	});

	describe("POST /clear-data", () => {
		it("should return 403 when developer tools are disabled", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "articles" });

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("developer_tools_disabled");
		});

		it("should return 400 when dataType is missing", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_data_type");
		});

		it("should return 400 when dataType is invalid", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "invalid-type" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_data_type");
		});

		it("should clear articles successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "articles" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("All articles cleared successfully");
			expect(mockCollabConvoDao.deleteAllCollabConvos).toHaveBeenCalled();
			expect(mockDocDraftDao.deleteAllDocDrafts).toHaveBeenCalled();
			expect(mockDocDao.deleteAllDocs).toHaveBeenCalled();
		});

		it("should clear sites successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "sites" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("All sites cleared successfully");
			expect(mockSiteDao.deleteAllSites).toHaveBeenCalled();
		});

		it("should clear jobs successfully when no jobs are running", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockJobDao.listJobExecutions).mockResolvedValue([]);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "jobs" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("All job executions cleared successfully");
			expect(mockJobDao.listJobExecutions).toHaveBeenCalledWith({ status: "active" });
			expect(mockJobDao.deleteAllJobs).toHaveBeenCalled();
		});

		it("should return 400 when trying to clear jobs while jobs are running", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockJobDao.listJobExecutions).mockResolvedValue([
				{
					id: "running-job",
					name: "test-job",
					params: {},
					status: "active",
					logs: [],
					retryCount: 0,
					createdAt: new Date(),
				},
			]);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "jobs" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("jobs_running");
			expect(response.body.message).toContain("Cannot clear jobs while 1 job(s) are still active");
			expect(mockJobDao.deleteAllJobs).not.toHaveBeenCalled();
		});

		it("should clear GitHub integrations and installations successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "github" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("All GitHub integrations and installations cleared successfully");
			expect(mockIntegrationDao.removeAllGitHubIntegrations).toHaveBeenCalled();
			expect(mockGitHubInstallationDao.deleteAllInstallations).toHaveBeenCalled();
		});

		it("should clear sync data successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "sync" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("All sync data cleared successfully");
			expect(mockSyncArticleDao.deleteAllSyncArticles).toHaveBeenCalled();
		});

		it("should clear spaces and their content successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "spaces" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("All spaces and their content cleared successfully");
			expect(mockCollabConvoDao.deleteAllCollabConvos).toHaveBeenCalled();
			expect(mockDocDraftDao.deleteAllDocDrafts).toHaveBeenCalled();
			expect(mockDocDao.deleteAllDocs).toHaveBeenCalled();
			expect(mockSpaceDao.deleteAllSpaces).toHaveBeenCalled();
		});

		it("should handle errors gracefully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.deleteAllDocs).mockRejectedValueOnce(new Error("Database error"));

			const response = await request(app).post("/dev-tools/clear-data").send({ dataType: "articles" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("internal_server_error");
		});
	});

	describe("POST /generate-draft-with-edits", () => {
		it("should return 403 when developer tools are disabled", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ title: "Test Article" });

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("developer_tools_disabled");
		});

		it("should return 400 when docJrn is not provided", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/generate-draft-with-edits").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("docJrn is required");
		});

		it("should generate draft with docJrn successfully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Existing Article",
				content:
					"# Test\n\n## Introduction\n\nThis is the introduction.\n\n## Features\n\nList of features.\n\n## Usage\n\nHow to use it.",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			// Override the mock to return a draft with docId
			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValueOnce({
				id: 123,
				title: "Draft for jrn:jolli:doc:test-article",
				content: "",
				docId: 456,
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 3 });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.draftId).toBe(123);
			expect(response.body.message).toContain("3 section edit suggestions");
		});

		it("should return 404 when docJrn is not found", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:nonexistent", numEdits: 3 });

			expect(response.status).toBe(404);
			expect(response.body.error).toContain("Article not found with JRN");
		});

		it("should handle URL-encoded JRN", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			// First call with encoded JRN returns undefined
			vi.mocked(mockDocDao.readDoc).mockResolvedValueOnce(undefined);

			// Second call with decoded JRN returns the article
			vi.mocked(mockDocDao.readDoc).mockResolvedValueOnce({
				id: 456,
				jrn: "jrn:jolli:doc:test article",
				title: "Test Article",
				content: "# Test\n\n## Section 1\n\nContent here\n\n## Section 2\n\nMore content",
				contentMetadata: { title: "Test Article" },
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValueOnce({
				id: 123,
				title: "Test Article",
				content: "",
				docId: 456,
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn%3Ajolli%3Adoc%3Atest%20article", numEdits: 3 });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockDocDao.readDoc).toHaveBeenCalledTimes(2);
			expect(mockDocDao.readDoc).toHaveBeenNthCalledWith(1, "jrn%3Ajolli%3Adoc%3Atest%20article");
			expect(mockDocDao.readDoc).toHaveBeenNthCalledWith(2, "jrn:jolli:doc:test article");
		});

		it("should handle invalid URL encoding gracefully", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			// First call with invalid encoded JRN returns undefined
			vi.mocked(mockDocDao.readDoc).mockResolvedValueOnce(undefined);

			// Invalid URL encoding like %E0%A4%A (incomplete UTF-8 sequence)
			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn%E0%A4%A", numEdits: 3 });

			expect(response.status).toBe(404);
			expect(response.body.error).toContain("Article not found with JRN");
			// Should only be called once since decodeURIComponent will throw
			expect(mockDocDao.readDoc).toHaveBeenCalledTimes(1);
		});

		it("should use article title in draft title", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test\n\n## Section 1\n\nContent here\n\n## Section 2\n\nMore content",
				contentMetadata: { title: "My Great Article" },
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValueOnce({
				id: 123,
				title: "My Great Article",
				content: "",
				docId: 456,
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 2 });

			expect(response.status).toBe(200);
			expect(mockDocDraftDao.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "My Great Article",
				}),
			);
		});

		it("should fall back to JRN when article has no title", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test\n\n## Section 1\n\nContent here\n\n## Section 2\n\nMore content",
				contentMetadata: {}, // No title in metadata
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValueOnce({
				id: 123,
				title: "Draft for jrn:jolli:doc:test-article",
				content: "",
				docId: 456,
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 2 });

			expect(response.status).toBe(200);
			expect(mockDocDraftDao.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Draft for jrn:jolli:doc:test-article",
				}),
			);
		});

		it("should return 400 when numEdits is less than 1", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 0 });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("numEdits must be between 1 and 5");
		});

		it("should return 400 when numEdits is greater than 5", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 6 });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("numEdits must be between 1 and 5");
		});

		it("should return 500 when draft creation fails", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test",
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			vi.mocked(mockDocDraftDao.createDocDraft).mockRejectedValueOnce(new Error("Database error"));

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 2 });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("internal_server_error");
		});

		it("should return 400 when article has no editable sections", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			// Article with only preamble content that matches title, no other sections
			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test Article", // Only a title that matches the h1, no content sections
				contentMetadata: { title: "Test Article" },
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValueOnce({
				id: 123,
				title: "Test Article",
				content: "",
				docId: 456,
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 2 });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("Article must have at least one section to generate draft edits");
		});

		it("should use fallback userId of 1 when token has no userId", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			// Mock tokenUtil to return undefined (no logged-in user)
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValueOnce(undefined);

			vi.mocked(mockDocDao.readDoc).mockResolvedValue({
				id: 456,
				jrn: "jrn:jolli:doc:test-article",
				title: "Test Article",
				content: "# Test\n\n## Section 1\n\nContent here\n\n## Section 2\n\nMore content",
				contentMetadata: { title: "Test Article" },
				createdAt: new Date(),
				updatedAt: new Date(),
			} as never);

			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValueOnce({
				id: 123,
				title: "Test Article",
				content: "",
				docId: 456,
			} as never);

			const response = await request(app)
				.post("/dev-tools/generate-draft-with-edits")
				.send({ docJrn: "jrn:jolli:doc:test-article", numEdits: 2 });

			expect(response.status).toBe(200);
			// Verify that createdBy falls back to 1 when no user token
			expect(mockDocDraftDao.createDocDraft).toHaveBeenCalledWith(
				expect.objectContaining({
					createdBy: 1,
				}),
			);
		});
	});

	describe("GET /redirect", () => {
		it("should return null when in production mode", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "production",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ redirectTo: null });
		});

		it("should return null when accessed through nginx gateway (X-Forwarded-Host present)", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app)
				.get("/dev-tools/redirect")
				.set("Host", "localhost:8034")
				.set("X-Forwarded-Host", "mytenant.jolli.app");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ redirectTo: null });
		});

		it("should still redirect when X-Forwarded-Host is localhost (vite proxy)", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: true,
			} as ReturnType<typeof getConfig>);

			// Frontend on 8034 proxies to backend on 7034, setting X-Forwarded-Host
			const response = await request(app)
				.get("/dev-tools/redirect")
				.set("Host", "localhost:7034")
				.set("X-Forwarded-Host", "localhost:8034");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				redirectTo: "jolli.app",
				useHttps: true,
			});
		});

		it("should return null when not on localhost", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect").set("Host", "mytenant.lvh.me:8034");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ redirectTo: null });
		});

		it("should return BASE_DOMAIN with HTTP and port when USE_GATEWAY is false", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect").set("Host", "localhost:8034");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				redirectTo: "jolli.app",
				useHttps: false,
				port: "8034",
			});
		});

		it("should return BASE_DOMAIN with HTTPS (no port) when USE_GATEWAY is true", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "mydomain.dev",
				USE_GATEWAY: true,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect").set("Host", "localhost:8034");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				redirectTo: "mydomain.dev",
				useHttps: true,
			});
		});

		it("should handle missing host header", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: false,
			} as ReturnType<typeof getConfig>);

			// supertest always sets a host header, so we test that empty host works
			const response = await request(app).get("/dev-tools/redirect").set("Host", "");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ redirectTo: null });
		});

		it("should use default port when port not in host header", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "jolli.app",
				USE_GATEWAY: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect").set("Host", "localhost");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				redirectTo: "jolli.app",
				useHttps: false,
				port: "8034",
			});
		});

		it("should return null when BASE_DOMAIN is not set", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: undefined,
				USE_GATEWAY: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect").set("Host", "localhost:8034");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ redirectTo: null });
		});

		it("should return null when BASE_DOMAIN is localhost", async () => {
			vi.mocked(getConfig).mockReturnValue({
				NODE_ENV: "development",
				BASE_DOMAIN: "localhost",
				USE_GATEWAY: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/dev-tools/redirect").set("Host", "localhost:8034");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ redirectTo: null });
		});
	});

	describe("POST /reload-config", () => {
		it("should return 403 when developer tools are disabled", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: false,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).post("/dev-tools/reload-config").send({});

			expect(response.status).toBe(403);
			expect(response.body.error).toBe("developer_tools_disabled");
		});

		it("should reload config successfully when developer tools are enabled", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(reloadConfig).mockResolvedValue({} as never);

			const response = await request(app).post("/dev-tools/reload-config").send({});

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.message).toBe("Configuration reloaded successfully");
			expect(reloadConfig).toHaveBeenCalled();
			expect(clearTenantConfigCache).toHaveBeenCalled();
		});

		it("should handle errors during config reload", async () => {
			vi.mocked(getConfig).mockReturnValue({
				USE_DEVELOPER_TOOLS: true,
			} as ReturnType<typeof getConfig>);

			vi.mocked(reloadConfig).mockRejectedValue(new Error("Failed to reload"));

			const response = await request(app).post("/dev-tools/reload-config").send({});

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("internal_server_error");
		});
	});
});
