import * as Config from "../config/Config";
import type { Database } from "../core/Database";
import { mockDatabase } from "../core/Database.mock";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { createMockIntegrationsManager } from "../integrations/IntegrationsManager.mock";
import { mockActiveUser } from "../model/ActiveUser.mock";
import { mockDoc } from "../model/Doc.mock";
import type { GithubRepoIntegration } from "../model/Integration";
import { mockIntegration } from "../model/Integration.mock";
import { mockSpace } from "../model/Space.mock";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import * as GithubAppUtil from "../util/GithubAppUtil";
import * as IntegrationUtil from "../util/IntegrationUtil";
import * as TokenUtil from "../util/TokenUtil";
import type { JobScheduler } from "./JobScheduler";
import { createKnowledgeGraphJobs } from "./KnowledgeGraphJobs";
import type { WorkflowResult, WorkflowType } from "jolli-agent/workflows";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Type helper for workflow args in tests
type WorkflowArgsWithSyncIt = {
	syncIt?: (fs: { writeFile: unknown; listFiles: unknown; readFile: unknown }) => Promise<void>;
	outputDir?: string;
	projectName?: string;
	githubUrl?: string;
	markdownContent?: string;
	filename?: string;
	currentDir?: string;
	additionalTools?: Array<unknown>;
	additionalToolExecutor?: unknown;
};

vi.mock("jolli-agent/workflows", () => ({
	runWorkflowForJob: vi.fn(),
}));

describe("KnowledgeGraphJobs", () => {
	let db: Database;
	let integrationsManager: IntegrationsManager;
	let registeredJobs: Array<JobDefinition> = [];
	let scheduler: JobScheduler;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.E2B_API_KEY = "e2b";
		process.env.E2B_TEMPLATE_ID = "tmpl";
		process.env.ANTHROPIC_API_KEY = "anthropic";
		delete process.env.VERCEL_TOKEN;

		db = mockDatabase();
		integrationsManager = createMockIntegrationsManager();
		registeredJobs = [];
		scheduler = {
			registerJob: (def: JobDefinition) => {
				registeredJobs.push(def);
			},
		} as unknown as JobScheduler;

		vi.restoreAllMocks();
		vi.clearAllMocks();

		// Default space/user mocks for resolveSandboxAuth (used by run-jolliscript and cli-impact)
		db.spaceDao.getDefaultSpace = vi.fn().mockResolvedValue(mockSpace({ id: 1, slug: "global", ownerId: 1 }));
		db.activeUserDao.findById = vi
			.fn()
			.mockResolvedValue(mockActiveUser({ id: 1, email: "owner@test.com", name: "Owner" }));
		vi.spyOn(TokenUtil, "createSandboxServiceToken").mockReturnValue("mock-sandbox-token");
	});

	function getRegisteredJobHandler(jobName = "knowledge-graph:architecture") {
		const jobs = createKnowledgeGraphJobs(db, integrationsManager);
		jobs.registerJobs(scheduler);
		expect(registeredJobs.length).toBeGreaterThan(0);
		const job = registeredJobs.find(j => j.name === jobName);
		if (!job) {
			throw new Error(
				`Job ${jobName} not registered. Available jobs: ${registeredJobs.map(j => j.name).join(", ")}`,
			);
		}
		return job;
	}

	it("registers process-integration job and succeeds for repo metadata", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 1,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock types from external library
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: true, assistantText: "hi", outputFiles: {} } as any);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 1 }, context)).resolves.toBeUndefined();
		expect(runWorkflowForJob).toHaveBeenCalled();

		// Verify stats updates were called
		expect(context.updateStats).toHaveBeenCalled();
		// Check that final stats include completed status
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				phase: "completed",
				progress: 100,
				githubUrl: "https://github.com/owner/repo",
			}),
		);
	});

	it("succeeds for installationId metadata by resolving first repo", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 2,
			type: "github",
			metadata: { repo: "", installationId: 999, branch: "main", features: [], githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		db.githubInstallationDao.lookupByInstallationId = vi
			.fn()
			// biome-ignore lint/suspicious/noExplicitAny: Mock test data
			.mockResolvedValue({ repos: ["owner/other"], id: 1 } as any);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		await expect(def.handler({ integrationId: 2 }, createMockContext(def.name))).resolves.toBeUndefined();
	});

	it("throws when workflow fails with error message", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 3,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 1, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: false, error: "bad" } as any);

		await expect(def.handler({ integrationId: 3 }, createMockContext(def.name))).rejects.toThrow(
			"Workflow failed: bad",
		);
	});

	it("covers non-Error catch branch (Unknown error)", async () => {
		const def = getRegisteredJobHandler();
		// Make dao throw a non-Error value
		integrationsManager.getIntegration = vi.fn().mockRejectedValue("not-an-error");
		await expect(def.handler({ integrationId: 99 }, createMockContext(def.name))).rejects.toBeTruthy();
	});

	it("throws when env E2B_API_KEY is missing (getWorkflowConfig)", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 4,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 1, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: true } as any);

		// Mock getWorkflowConfig to throw the error
		vi.spyOn(Config, "getWorkflowConfig").mockImplementation(() => {
			throw new Error("E2B_API_KEY environment variable is not set");
		});

		await expect(def.handler({ integrationId: 4 }, createMockContext(def.name))).rejects.toThrow(
			"E2B_API_KEY environment variable is not set",
		);
	});

	it("throws when env E2B_TEMPLATE_ID is missing (getWorkflowConfig)", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 5,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 1, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: true } as any);

		// Mock getWorkflowConfig to throw the error
		vi.spyOn(Config, "getWorkflowConfig").mockImplementation(() => {
			throw new Error("E2B_TEMPLATE_ID environment variable is not set");
		});

		await expect(def.handler({ integrationId: 5 }, createMockContext(def.name))).rejects.toThrow(
			"E2B_TEMPLATE_ID environment variable is not set",
		);
	});

	it("throws when env ANTHROPIC_API_KEY is missing (getWorkflowConfig)", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 6,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 1, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: true } as any);

		// Mock getWorkflowConfig to throw the error
		vi.spyOn(Config, "getWorkflowConfig").mockImplementation(() => {
			throw new Error("ANTHROPIC_API_KEY environment variable is not set");
		});

		await expect(def.handler({ integrationId: 6 }, createMockContext(def.name))).rejects.toThrow(
			"ANTHROPIC_API_KEY environment variable is not set",
		);
	});

	it("handles error when neither integrationId nor docJrn are provided", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");

		// Make readDoc throw an error
		db.docDao.readDoc = vi.fn().mockRejectedValue(new Error("Database error"));

		const context = createMockContext(def.name);

		// Call with params that will reach handleJobError with no integrationId or docJrn
		// Using empty string for docJrn which won't provide a useful identifier
		await expect(def.handler({ docJrn: "" }, context)).rejects.toThrow();

		// Verify that the error was logged with error message key
		expect(context.log).toHaveBeenCalledWith("error", { error: "Database error", docJrn: "" });
	});

	it("includes vercelToken in config when VERCEL_TOKEN is set", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 7,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 1, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: true } as any);

		// Mock getWorkflowConfig to return a config with vercelToken
		vi.spyOn(Config, "getWorkflowConfig").mockReturnValue({
			e2bApiKey: "e2b",
			e2bTemplateId: "tmpl",
			e2bEnabled: true,
			anthropicApiKey: "anthropic",
			githubToken: "token",
			syncServerUrl: "https://public.jolli.example/api",
			vercelToken: "vercel-token",
			debug: true,
		});

		await expect(def.handler({ integrationId: 7 }, createMockContext(def.name))).resolves.toBeUndefined();

		// Check that runWorkflowForJob was called with vercelToken in config
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"architecture-doc",
			expect.objectContaining({
				vercelToken: "vercel-token",
				e2bApiKey: "e2b",
				e2bTemplateId: "tmpl",
				e2bEnabled: true,
				anthropicApiKey: "anthropic",
				githubToken: "token",
				debug: true,
			}),
			expect.objectContaining({
				githubUrl: "https://github.com/owner/repo",
				killSandbox: false,
				syncIt: expect.any(Function),
				syncItPhase: "after",
			}),
			expect.any(Function),
		);
	});

	it("captures sandbox ID from workflow output data", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 20,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
			outputData: { sandboxId: "sandbox_abc123xyz" },
			// biome-ignore lint/suspicious/noExplicitAny: Mock types from external library
		} as any);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 20 }, context)).resolves.toBeUndefined();

		// Verify final stats include the sandbox ID from outputData
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "sandbox_abc123xyz",
				phase: "completed",
				progress: 100,
			}),
		);
	});

	it("captures sandbox ID from log messages during workflow execution", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 21,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

		// Mock runWorkflowForJob to call the logger with sandbox ID message
		vi.mocked(runWorkflowForJob).mockImplementation(
			(_type: WorkflowType, _config: unknown, _args: unknown, logger?: (message: string) => void) => {
				// Simulate sandbox creation log message
				if (logger) {
					logger("Created sandbox: sandbox_xyz789");
				}
				return Promise.resolve({ success: true });
			},
		);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 21 }, context)).resolves.toBeUndefined();

		// Verify stats were updated with the captured sandbox ID
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "sandbox_xyz789",
				phase: "sandbox-running",
				progress: 30,
			}),
		);
		// Also verify final update
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "sandbox_xyz789",
				phase: "completed",
				progress: 100,
			}),
		);
	});

	it("captures E2B sandbox ID from log messages", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 22,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

		// Mock runWorkflowForJob to call the logger with E2B sandbox ID message
		vi.mocked(runWorkflowForJob).mockImplementation(
			(_type: WorkflowType, _config: unknown, _args: unknown, logger?: (message: string) => void) => {
				// Simulate E2B sandbox log message
				if (logger) {
					logger("E2B sandbox created: e2b-sandbox-123");
				}
				return Promise.resolve({ success: true });
			},
		);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 22 }, context)).resolves.toBeUndefined();

		// Verify stats were updated with the captured E2B sandbox ID
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "e2b-sandbox-123",
				phase: "sandbox-running",
				progress: 30,
			}),
		);
	});

	it("handles workflow without sandbox ID", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 23,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 23 }, context)).resolves.toBeUndefined();

		// Verify final stats have fallback value when no sandbox ID is available
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "completed-without-id",
				phase: "completed",
				progress: 100,
			}),
		);
	});

	it("queueJobs resolves and logs", async () => {
		const jobs = createKnowledgeGraphJobs(db, integrationsManager);
		await expect(jobs.queueJobs(scheduler)).resolves.toBeUndefined();
	});

	it("throws when integration is not found", async () => {
		const def = getRegisteredJobHandler();
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(null);

		await expect(def.handler({ integrationId: 11 }, createMockContext(def.name))).rejects.toThrow(
			"Integration with ID 11 not found",
		);
	});

	it("throws when integration is not github type", async () => {
		const def = getRegisteredJobHandler();
		const integration = mockIntegration({
			id: 8,
			// biome-ignore lint/suspicious/noExplicitAny: Mock test data
			type: "github" as any, // Will override to simulate wrong type
			metadata: { repo: "owner/repo", branch: "main", features: [] },
		});
		// Override the type to simulate a non-github integration
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		(integration as any).type = "gitlab";
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);

		await expect(def.handler({ integrationId: 8 }, createMockContext(def.name))).rejects.toThrow(
			"Integration 8 is not a GitHub integration (type: gitlab)",
		);
	});

	it("throws when installation has no repos", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 9,
			type: "github",
			metadata: { repo: "", installationId: 777, branch: "main", features: [], githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		// biome-ignore lint/suspicious/noExplicitAny: Mock test data
		db.githubInstallationDao.lookupByInstallationId = vi.fn().mockResolvedValue({ repos: [], id: 1 } as any);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		await expect(def.handler({ integrationId: 9 }, createMockContext(def.name))).rejects.toThrow(
			"No repositories found for installation 777",
		);
	});

	it("throws when integration has no repository information", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		const integration: GithubRepoIntegration = mockIntegration({
			id: 10,
			type: "github",
			metadata: { repo: "", branch: "main", features: [], githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		await expect(def.handler({ integrationId: 10 }, createMockContext(def.name))).rejects.toThrow(
			"Integration has no repository information",
		);
	});

	// Tests for docs-to-docusaurus job
	describe("docs-to-docusaurus job", () => {
		it("registers docs-to-docusaurus job and succeeds", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 30,
				type: "github",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
			vi.mocked(runWorkflowForJob).mockResolvedValue({
				success: true,
				assistantText: "docs generated",
				outputFiles: {},
			} satisfies Partial<WorkflowResult> as WorkflowResult);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 30 }, context)).resolves.toBeUndefined();

			// Verify that runWorkflowForJob was called with docs-to-site workflow
			expect(runWorkflowForJob).toHaveBeenCalledWith(
				"docs-to-site",
				expect.objectContaining({
					e2bApiKey: "e2b",
					e2bTemplateId: "tmpl",
					anthropicApiKey: "anthropic",
					githubToken: "token",
					debug: true,
				}),
				expect.objectContaining({
					outputDir: "./docusaurus/docs",
					projectName: "repo",
				}),
				expect.any(Function),
			);

			// Verify stats updates were called
			expect(context.updateStats).toHaveBeenCalled();
			// Check that final stats include completed status
			expect(context.updateStats).toHaveBeenCalledWith(
				expect.objectContaining({
					phase: "completed",
					progress: 100,
					githubUrl: "https://github.com/owner/repo",
				}),
			);
		});

		it("handles workflow failure for docs-to-docusaurus", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 31,
				type: "github",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 1, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
			// biome-ignore lint/suspicious/noExplicitAny: Mock test data
			vi.mocked(runWorkflowForJob).mockResolvedValue({ success: false, error: "docs generation failed" } as any);

			await expect(def.handler({ integrationId: 31 }, createMockContext(def.name))).rejects.toThrow(
				"Workflow failed: docs generation failed",
			);
		});

		it("captures sandbox ID from logs for docs-to-docusaurus", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 32,
				type: "github",
				metadata: {
					repo: "owner/docs-repo",
					branch: "main",
					features: [],
					installationId: 456,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

			// Mock runWorkflowForJob to call the logger with sandbox ID message
			vi.mocked(runWorkflowForJob).mockImplementation(
				(_type: WorkflowType, _config: unknown, _args: unknown, logger?: (message: string) => void) => {
					// Simulate sandbox creation log message
					if (logger) {
						logger("Created sandbox: sandbox_docs123");
					}
					return Promise.resolve({ success: true });
				},
			);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 32 }, context)).resolves.toBeUndefined();

			// Verify stats were updated with the captured sandbox ID
			expect(context.updateStats).toHaveBeenCalledWith(
				expect.objectContaining({
					sandboxId: "sandbox_docs123",
					phase: "sandbox-running",
					progress: 30,
				}),
			);
			// Also verify final update
			expect(context.updateStats).toHaveBeenCalledWith(
				expect.objectContaining({
					sandboxId: "sandbox_docs123",
					phase: "completed",
					progress: 100,
				}),
			);
		});

		it("logs when using installationId for docs-to-docusaurus", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 34,
				type: "github",
				metadata: { repo: "", branch: "main", features: [], installationId: 999, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			db.githubInstallationDao.lookupByInstallationId = vi
				.fn()
				// biome-ignore lint/suspicious/noExplicitAny: Mock test data
				.mockResolvedValue({ repos: ["owner/test-repo"], id: 1 } as any);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
			vi.mocked(runWorkflowForJob).mockResolvedValue({
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 34 }, context)).resolves.toBeUndefined();
		});

		it("captures E2B sandbox ID from logs for docs-to-docusaurus", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 35,
				type: "github",
				metadata: {
					repo: "owner/e2b-test",
					branch: "main",
					features: [],
					installationId: 888,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

			// Mock runWorkflowForJob to call the logger with E2B sandbox ID message
			vi.mocked(runWorkflowForJob).mockImplementation(
				(_type: WorkflowType, _config: unknown, _args: unknown, logger?: (message: string) => void) => {
					// Simulate E2B sandbox log message
					if (logger) {
						logger("E2B sandbox created: e2b-sandbox-456");
					}
					return Promise.resolve({ success: true });
				},
			);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 35 }, context)).resolves.toBeUndefined();

			// Verify stats were updated with the captured E2B sandbox ID
			expect(context.updateStats).toHaveBeenCalledWith(
				expect.objectContaining({
					sandboxId: "e2b-sandbox-456",
					phase: "sandbox-running",
					progress: 30,
				}),
			);
		});

		it("passes syncIt function to workflow", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 36,
				type: "github",
				metadata: {
					repo: "owner/sync-test",
					branch: "main",
					features: [],
					installationId: 999,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;

			// Mock some documents with the new JRN format
			const mockDocs = [
				{
					jrn: "jrn:prod:global:docs:article/doc1.md",
					content: "# Document 1",
					contentType: "text/markdown",
					updatedBy: "test",
					version: 1,
				},
				{
					jrn: "jrn:prod:global:docs:article/folder-doc2.md",
					content: "# Document 2",
					contentType: "text/markdown",
					updatedBy: "test",
					version: 1,
				},
			];

			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			db.docDao.listDocs = vi.fn().mockResolvedValue(mockDocs);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

			// Capture the workflow args passed to runWorkflowForJob
			let capturedArgs: unknown;
			vi.mocked(runWorkflowForJob).mockImplementation(
				(_type: WorkflowType, _config: unknown, args: unknown, _logger?: (message: string) => void) => {
					capturedArgs = args;
					return Promise.resolve({ success: true });
				},
			);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 36 }, context)).resolves.toBeUndefined();

			// Verify that syncIt function was passed
			expect(capturedArgs).toBeDefined();
			const typedArgs = capturedArgs as WorkflowArgsWithSyncIt;
			expect(typedArgs.syncIt).toBeDefined();
			expect(typeof typedArgs.syncIt).toBe("function");
			expect(typedArgs.outputDir).toBe("./docusaurus/docs");
			expect(typedArgs.projectName).toBe("sync-test");

			// Test the syncIt function
			const mockWriteFile = vi.fn().mockResolvedValue(undefined);
			if (!typedArgs.syncIt) {
				throw new Error("syncIt function not found");
			}
			await typedArgs.syncIt({ writeFile: mockWriteFile, listFiles: vi.fn(), readFile: vi.fn() });

			// Verify that listDocs was called (empty slug filter to get all docs)
			expect(db.docDao.listDocs).toHaveBeenCalledWith({ startsWithJrn: "" });

			// Verify that writeFile was called for each document
			// The resource ID is extracted from the JRN (everything after jrn:prod:global:docs:article/)
			expect(mockWriteFile).toHaveBeenCalledTimes(2);
			expect(mockWriteFile).toHaveBeenCalledWith("api-docs/docs/doc1.md", "# Document 1");
			expect(mockWriteFile).toHaveBeenCalledWith("api-docs/docs/folder-doc2.md", "# Document 2");

			// Verify logs with new structured logging format
			expect(context.log).toHaveBeenCalledWith("sync-starting");
			expect(context.log).toHaveBeenCalledWith("found-documents", { count: 2 });
			expect(context.log).toHaveBeenCalledWith("sync-completed");
		});

		it("handles empty documents in syncIt", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 37,
				type: "github",
				metadata: {
					repo: "owner/empty-docs",
					branch: "main",
					features: [],
					installationId: 888,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;

			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			db.docDao.listDocs = vi.fn().mockResolvedValue([]); // No documents
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

			// Capture the workflow args
			let capturedArgs: unknown;
			vi.mocked(runWorkflowForJob).mockImplementation(
				(_type: WorkflowType, _config: unknown, args: unknown, _logger?: (message: string) => void) => {
					capturedArgs = args;
					return Promise.resolve({ success: true });
				},
			);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 37 }, context)).resolves.toBeUndefined();

			// Test the syncIt function with no documents
			const mockWriteFile = vi.fn();
			const typedArgs = capturedArgs as WorkflowArgsWithSyncIt;
			if (!typedArgs.syncIt) {
				throw new Error("syncIt function not found");
			}
			await typedArgs.syncIt({ writeFile: mockWriteFile, listFiles: vi.fn(), readFile: vi.fn() });

			// Verify that writeFile was never called
			expect(mockWriteFile).not.toHaveBeenCalled();

			// Verify appropriate log message with new structured logging
			expect(context.log).toHaveBeenCalledWith("no-documents");
		});

		it("handles writeFile errors in syncIt for individual documents", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 39,
				type: "github",
				metadata: {
					repo: "owner/write-error-test",
					branch: "main",
					features: [],
					installationId: 666,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;

			const mockDocs = [
				{
					jrn: "jrn:prod:global:docs:article/good.md",
					content: "# Good Document",
					contentType: "text/markdown",
					updatedBy: "test",
					version: 1,
				},
				{
					jrn: "jrn:prod:global:docs:article/bad.md",
					content: "# Bad Document",
					contentType: "text/markdown",
					updatedBy: "test",
					version: 1,
				},
			];

			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			db.docDao.listDocs = vi.fn().mockResolvedValue(mockDocs);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

			// Capture the workflow args
			let capturedArgs: unknown;
			vi.mocked(runWorkflowForJob).mockImplementation(
				(_type: WorkflowType, _config: unknown, args: unknown, _logger?: (message: string) => void) => {
					capturedArgs = args;
					return Promise.resolve({ success: true });
				},
			);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 39 }, context)).resolves.toBeUndefined();

			// Test the syncIt function with writeFile that fails on second document
			const mockWriteFile = vi
				.fn()
				.mockResolvedValueOnce(undefined) // First doc succeeds
				.mockRejectedValueOnce(new Error("Write failed")); // Second doc fails

			const typedArgs = capturedArgs as WorkflowArgsWithSyncIt;
			if (!typedArgs.syncIt) {
				throw new Error("syncIt function not found");
			}
			await typedArgs.syncIt({ writeFile: mockWriteFile, listFiles: vi.fn(), readFile: vi.fn() });

			// Verify that writeFile was called for both documents
			expect(mockWriteFile).toHaveBeenCalledTimes(2);

			// Verify error log for the failed document with new structured logging
			expect(context.log).toHaveBeenCalledWith("file-persist-error", {
				jrn: "jrn:prod:global:docs:article/bad.md",
				error: "Error: Write failed",
			});
			// But sync should still complete
			expect(context.log).toHaveBeenCalledWith("sync-completed");
		});

		it("handles errors in syncIt gracefully", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 38,
				type: "github",
				metadata: {
					repo: "owner/error-test",
					branch: "main",
					features: [],
					installationId: 777,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;

			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			// Make listDocs throw an error
			db.docDao.listDocs = vi.fn().mockRejectedValue(new Error("Database error"));
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");

			// Capture the workflow args
			let capturedArgs: unknown;
			vi.mocked(runWorkflowForJob).mockImplementation(
				(_type: WorkflowType, _config: unknown, args: unknown, _logger?: (message: string) => void) => {
					capturedArgs = args;
					return Promise.resolve({ success: true });
				},
			);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 38 }, context)).resolves.toBeUndefined();

			// Test the syncIt function with error
			const mockWriteFile = vi.fn();
			const typedArgs = capturedArgs as WorkflowArgsWithSyncIt;
			if (!typedArgs.syncIt) {
				throw new Error("syncIt function not found");
			}
			await typedArgs.syncIt({ writeFile: mockWriteFile, listFiles: vi.fn(), readFile: vi.fn() });

			// Verify that writeFile was never called
			expect(mockWriteFile).not.toHaveBeenCalled();

			// Verify error log message with new structured logging
			expect(context.log).toHaveBeenCalledWith("sync-error", {
				error: "Error: Database error",
			});
		});

		it("extracts project name from GitHub URL correctly", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 33,
				type: "github",
				metadata: {
					repo: "owner/my-special-project",
					branch: "main",
					features: [],
					installationId: 789,
					githubAppId: 1,
				},
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
			vi.mocked(runWorkflowForJob).mockResolvedValue({
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 33 }, context)).resolves.toBeUndefined();

			// Verify that the project name was extracted correctly
			expect(runWorkflowForJob).toHaveBeenCalledWith(
				"docs-to-site",
				expect.anything(),
				expect.objectContaining({
					outputDir: "./docusaurus/docs",
					projectName: "my-special-project",
				}),
				expect.any(Function),
			);
		});

		it("passes killSandbox=true to workflow when specified for docs-to-docusaurus", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:docs-to-docusaurus");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			const integration: GithubRepoIntegration = mockIntegration({
				id: 42,
				type: "github",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
			vi.mocked(runWorkflowForJob).mockResolvedValue({
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult);

			const context = createMockContext(def.name);
			await expect(def.handler({ integrationId: 42, killSandbox: true }, context)).resolves.toBeUndefined();

			// Verify that runWorkflowForJob was called with killSandbox=true
			expect(runWorkflowForJob).toHaveBeenCalledWith(
				"docs-to-site",
				expect.objectContaining({
					e2bApiKey: "e2b",
					e2bTemplateId: "tmpl",
					anthropicApiKey: "anthropic",
					githubToken: "token",
					debug: true,
				}),
				expect.objectContaining({
					outputDir: "./docusaurus/docs",
					projectName: "repo",
					killSandbox: true,
				}),
				expect.any(Function),
			);
		});
	});

	it("passes killSandbox=true to workflow when specified", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 40,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 40, killSandbox: true }, context)).resolves.toBeUndefined();

		// Verify that runWorkflowForJob was called with killSandbox=true
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"architecture-doc",
			expect.objectContaining({
				e2bApiKey: "e2b",
				e2bTemplateId: "tmpl",
				anthropicApiKey: "anthropic",
				githubToken: "token",
				debug: true,
			}),
			expect.objectContaining({
				githubUrl: "https://github.com/owner/repo",
				killSandbox: true,
			}),
			expect.any(Function),
		);
	});

	it("passes killSandbox=false by default when not specified", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 41,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 41 }, context)).resolves.toBeUndefined();

		// Verify that runWorkflowForJob was called with killSandbox=false (default)
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"architecture-doc",
			expect.objectContaining({
				e2bApiKey: "e2b",
				e2bTemplateId: "tmpl",
				anthropicApiKey: "anthropic",
				githubToken: "token",
				debug: true,
			}),
			expect.objectContaining({
				githubUrl: "https://github.com/owner/repo",
				killSandbox: false,
			}),
			expect.any(Function),
		);
	});

	it("runs run-jolliscript job with doc content", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");
		// Content must have job steps in front matter (prompts come from run_prompt steps)
		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Doc Title" },
				contentType: "text/markdown",
			}),
		);
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:123" }, context)).resolves.toBeUndefined();

		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"run-jolliscript",
			expect.objectContaining({
				e2bApiKey: "e2b",
				e2bTemplateId: "tmpl",
				anthropicApiKey: "anthropic",
				debug: true,
			}),
			expect.objectContaining({
				markdownContent: expect.stringContaining("job:"),
				filename: expect.stringContaining("Doc Title"),
				killSandbox: false,
				additionalTools: expect.any(Array),
				jobSteps: expect.arrayContaining([expect.objectContaining({ name: "test step" })]),
			}),
			expect.any(Function),
		);

		expect(context.updateStats).toHaveBeenCalledWith(expect.objectContaining({ docJrn: "doc:123" }));
	});

	it("injects sandbox auth token and space into run-jolliscript workflow config", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "jrn:/org_1/spc_abc123:docs:article/doc-123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Doc Title" },
				contentType: "text/markdown",
				spaceId: 77,
			}),
		);
		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 77,
				slug: "sandbox-space",
				ownerId: 321,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(
			mockActiveUser({
				id: 321,
				email: "owner@example.com",
				name: "Space Owner",
			}),
		);
		const sandboxTokenSpy = vi.spyOn(TokenUtil, "createSandboxServiceToken").mockReturnValue("sandbox-token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		await expect(
			def.handler({ docJrn: "jrn:/org_1/spc_abc123:docs:article/doc-123" }, createMockContext(def.name)),
		).resolves.toBeUndefined();

		expect(sandboxTokenSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 321,
				email: "owner@example.com",
				spaceSlug: "sandbox-space",
				ttl: "30m",
			}),
		);
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"run-jolliscript",
			expect.objectContaining({
				jolliAuthToken: "sandbox-token",
				jolliSpace: "sandbox-space",
				syncServerUrl: expect.any(String),
			}),
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("throws when docJrn is missing for run-jolliscript job", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		db.docDao.readDoc = vi.fn().mockResolvedValue(undefined);

		await expect(def.handler({ docJrn: "missing" }, createMockContext(def.name))).rejects.toThrow(
			"Document missing not found",
		);
	});

	it("throws when doc has no content for run-jolliscript job", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: "",
				contentType: "text/markdown",
			}),
		);

		await expect(def.handler({ docJrn: "doc:123" }, createMockContext(def.name))).rejects.toThrow(
			"Document doc:123 has no content to process",
		);
	});

	it("throws when space has no owner for run-jolliscript job", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");

		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:owner-test",
				content: "# Has content",
				contentType: "text/markdown",
				spaceId: 77,
			}),
		);
		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 77,
				slug: "test-space",
				ownerId: 0,
			}),
		);

		await expect(def.handler({ docJrn: "doc:owner-test" }, createMockContext(def.name))).rejects.toThrow(
			'Space "test-space" has no owner',
		);
	});

	it("throws when space owner is not found for run-jolliscript job", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");

		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:orphan-test",
				content: "# Has content",
				contentType: "text/markdown",
				spaceId: 78,
			}),
		);
		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 78,
				slug: "orphan-space",
				ownerId: 888,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(undefined);

		await expect(def.handler({ docJrn: "doc:orphan-test" }, createMockContext(def.name))).rejects.toThrow(
			'Owner (id=888) for space "orphan-space" not found',
		);
	});

	it("captures sandbox ID from logs and includes docJrn in stats for run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: capture sandbox step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:456",
				content: contentWithJobSteps,
				contentMetadata: { title: "Sandbox Test Doc" },
				contentType: "text/markdown",
			}),
		);

		// Mock runWorkflowForJob to call the logger with sandbox ID message
		vi.mocked(runWorkflowForJob).mockImplementation(
			(_type: WorkflowType, _config: unknown, _args: unknown, logger?: (message: string) => void) => {
				// Simulate sandbox creation log message
				if (logger) {
					logger("Created sandbox: sandbox_joi123");
				}
				return Promise.resolve({ success: true });
			},
		);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:456" }, context)).resolves.toBeUndefined();

		// Verify stats were updated with both the sandbox ID and docJrn
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "sandbox_joi123",
				docJrn: "doc:456",
			}),
		);
	});

	it("captures sandbox ID from messageContext for run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: context sandbox step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:789",
				content: contentWithJobSteps,
				contentMetadata: { title: "Context Sandbox Doc" },
				contentType: "text/markdown",
			}),
		);

		// Mock runWorkflowForJob to call the logger with messageContext containing sandboxId
		vi.mocked(runWorkflowForJob).mockImplementation(
			(
				_type: WorkflowType,
				_config: unknown,
				_args: unknown,
				logger?: (message: string, context?: Record<string, unknown>) => void,
			) => {
				// Simulate sandbox creation with context
				if (logger) {
					// Call logger with message key and context containing sandboxId
					logger("sandbox.created", { sandboxId: "sandbox_ctx789" });
				}
				return Promise.resolve({ success: true });
			},
		);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:789" }, context)).resolves.toBeUndefined();

		// Verify stats were updated with the sandbox ID from context
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				sandboxId: "sandbox_ctx789",
				docJrn: "doc:789",
			}),
		);
	});

	it("handles github integration token retrieval in run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const githubIntegration = mockIntegration({
			id: 1,
			type: "github",
			status: "active",
			name: "test-integration",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;

		integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token_123");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test Doc" },
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:123" }, context)).resolves.toBeUndefined();

		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"run-jolliscript",
			expect.objectContaining({
				anthropicApiKey: "anthropic",
			}),
			expect.any(Object),
			expect.any(Function),
		);
	});

	it("handles github integration token error in run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const githubIntegration = mockIntegration({
			id: 1,
			type: "github",
			status: "active",
			name: "test-integration",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;

		integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockRejectedValue(
			new Error("Token retrieval failed"),
		);

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test Doc" },
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:123" }, context)).resolves.toBeUndefined();

		expect(context.log).toHaveBeenCalledWith("github-token-error", expect.any(Object));
	});

	it("handles no github integration in run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test Doc" },
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:123" }, context)).resolves.toBeUndefined();

		expect(context.log).toHaveBeenCalledWith("no-github-integration");
	});

	it("handles undefined github token in run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const githubIntegration = mockIntegration({
			id: 1,
			type: "github",
			status: "active",
			name: "test-integration",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;

		integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
		// Return undefined token
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue(undefined as never);

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test Doc" },
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:123" }, context)).resolves.toBeUndefined();

		// Verify the tokenPreview was set to "undefined"
		expect(context.log).toHaveBeenCalledWith(
			"using-github-token",
			expect.objectContaining({
				tokenPreview: "undefined",
			}),
		);
	});

	it("uses sanitized JRN as filename when contentMetadata has no title", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "/special/path/doc:456",
				content: contentWithJobSteps,
				contentMetadata: {}, // No title
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "/special/path/doc:456" }, context)).resolves.toBeUndefined();

		// Verify that the sanitized JRN was used as the filename
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"run-jolliscript",
			expect.anything(),
			expect.objectContaining({
				filename: expect.stringContaining("_special_path_doc_456"),
			}),
			expect.any(Function),
		);
	});

	it("uses sanitized JRN as filename when contentMetadata has empty title", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "/path/doc",
				content: contentWithJobSteps,
				contentMetadata: { title: "   " }, // Empty/whitespace title
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "/path/doc" }, context)).resolves.toBeUndefined();

		// Verify that the sanitized JRN was used as the filename
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"run-jolliscript",
			expect.anything(),
			expect.objectContaining({
				filename: "_path_doc.md",
			}),
			expect.any(Function),
		);
	});

	it("does not pass syncIt when syncDown is hardcoded to false (docJrn has no slash)", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test" },
				contentType: "text/markdown",
			}),
		);

		// Capture the args to verify syncIt is not passed
		let capturedSyncIt: ((fs: unknown) => Promise<void>) | undefined;
		// biome-ignore lint/suspicious/useAwait: Mock implementation doesn't need await
		vi.mocked(runWorkflowForJob).mockImplementation(async (_workflow, _config, args) => {
			// biome-ignore lint/suspicious/noExplicitAny: Mock types
			capturedSyncIt = (args as any).syncIt;
			return {
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult;
		});

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc" }, context)).resolves.toBeUndefined();

		// syncIt should NOT be passed since syncDown is hardcoded to false
		expect(capturedSyncIt).toBeUndefined();
	});

	it("does not pass syncIt when syncDown is hardcoded to false (lastSlashIndex is 0)", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "/doc",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test" },
				contentType: "text/markdown",
			}),
		);

		// Capture the args to verify syncIt is not passed
		let capturedSyncIt: ((fs: unknown) => Promise<void>) | undefined;
		// biome-ignore lint/suspicious/useAwait: Mock implementation doesn't need await
		vi.mocked(runWorkflowForJob).mockImplementation(async (_workflow, _config, args) => {
			// biome-ignore lint/suspicious/noExplicitAny: Mock types
			capturedSyncIt = (args as any).syncIt;
			return {
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult;
		});

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "/doc" }, context)).resolves.toBeUndefined();

		// syncIt should NOT be passed since syncDown is hardcoded to false
		expect(capturedSyncIt).toBeUndefined();
	});

	it("uses 'doc.md' as filename when JRN is empty and no title", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "",
				content: contentWithJobSteps,
				contentMetadata: {}, // No title
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "" }, context)).resolves.toBeUndefined();

		// Verify that the fallback filename was used
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"run-jolliscript",
			expect.anything(),
			expect.objectContaining({
				filename: "doc.md",
			}),
			expect.any(Function),
		);
	});

	it("runs code-to-api-articles job successfully", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:code-to-api-articles");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 1,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("token");
		// biome-ignore lint/suspicious/noExplicitAny: Mock types from external library
		vi.mocked(runWorkflowForJob).mockResolvedValue({ success: true, assistantText: "hi", outputFiles: {} } as any);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 1, jrnPrefix: "/api-docs" }, context)).resolves.toBeUndefined();
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"code-to-api-docs",
			expect.objectContaining({
				githubToken: "token",
			}),
			expect.objectContaining({
				githubUrl: "https://github.com/owner/repo",
				syncIt: expect.any(Function),
			}),
			expect.any(Function),
		);
	});

	it("handles error in code-to-api-articles job", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:code-to-api-articles");

		integrationsManager.getIntegration = vi.fn().mockRejectedValue(new Error("Integration not found"));

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 999, jrnPrefix: "/api-docs" }, context)).rejects.toThrow(
			"Integration not found",
		);

		// Check that the error was logged
		expect(context.log).toHaveBeenCalledWith("error", expect.objectContaining({ integrationId: 999 }));
	});

	it("extracts job steps from front matter", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		// Front matter with job steps
		const contentWithJobSteps = `---
job:
  steps:
    - name: Step 1
      prompt: Do step 1
    - name: Step 2
      prompt: Do step 2
---
# Test
## Jolli_Main
\`\`\`joi
system: test
\`\`\``;

		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:with-steps",
				content: contentWithJobSteps,
				contentMetadata: { title: "Doc With Steps" },
				contentType: "text/markdown",
			}),
		);

		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
			assistantText: "done",
			outputFiles: {},
		} as Awaited<ReturnType<typeof runWorkflowForJob>>);

		const context = createMockContext(def.name);
		await def.handler({ docJrn: "doc:with-steps" }, context);

		// Verify the job steps were found and logged
		expect(context.log).toHaveBeenCalledWith("found-job-steps", expect.objectContaining({ count: 2 }));
	});

	it("executes article editing tools in run-jolliscript", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const contentWithJobSteps = `---
job:
  steps:
    - name: test step
      run_prompt: Do something
---
# Test Content`;
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:123",
				content: contentWithJobSteps,
				contentMetadata: { title: "Test Doc" },
				contentType: "text/markdown",
			}),
		);

		// Mock runWorkflowForJob to capture and call the tool executor
		let capturedToolExecutor: ((call: { name: string; arguments?: unknown }) => Promise<string>) | undefined;
		// biome-ignore lint/suspicious/useAwait: Mock implementation doesn't need await
		vi.mocked(runWorkflowForJob).mockImplementation(async (_workflow, _config, args) => {
			// biome-ignore lint/suspicious/noExplicitAny: Mock types
			capturedToolExecutor = (args as any).additionalToolExecutor;
			return {
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult;
		});

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:123" }, context)).resolves.toBeUndefined();

		// Now invoke the captured tool executor with different tool calls
		expect(capturedToolExecutor).toBeDefined();
		if (capturedToolExecutor) {
			// Test get_current_article
			const result1 = await capturedToolExecutor({ name: "get_current_article" });
			expect(result1).toBeDefined();

			// Test create_article
			const result2 = await capturedToolExecutor({
				name: "create_article",
				arguments: { content: "# New Article" },
			});
			expect(result2).toBeDefined();

			// Test edit_section
			const result3 = await capturedToolExecutor({
				name: "edit_section",
				arguments: { sectionTitle: "Section 1", newContent: "Updated content" },
			});
			expect(result3).toBeDefined();

			// Test create_section
			const result4 = await capturedToolExecutor({
				name: "create_section",
				arguments: { sectionTitle: "New Section", content: "Content", insertAfter: "Section 1" },
			});
			expect(result4).toBeDefined();

			// Test delete_section
			const result5 = await capturedToolExecutor({
				name: "delete_section",
				arguments: { sectionTitle: "Section 1" },
			});
			expect(result5).toBeDefined();

			// Test sync_up_article
			const result6 = await capturedToolExecutor({
				name: "sync_up_article",
				arguments: { sandboxPath: "/path/to/file.md", articleName: "test-article" },
			});
			expect(result6).toBeDefined();

			// Test unknown tool
			const result7 = await capturedToolExecutor({ name: "unknown_tool" });
			expect(result7).toContain("Unknown article editing tool");
		}
	});

	it("throws when document has no job steps", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

		// Content without job steps in front matter
		db.docDao.readDoc = vi.fn().mockResolvedValue(
			mockDoc({
				jrn: "doc:no-job-steps",
				content: "# Some content that does not have job steps in front matter",
				contentMetadata: { title: "Missing Job Steps" },
				contentType: "text/markdown",
			}),
		);

		// Mock runWorkflowForJob in case it gets called (it shouldn't)
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ docJrn: "doc:no-job-steps" }, context)).rejects.toThrow(
			"does not contain any job steps",
		);

		expect(context.log).toHaveBeenCalledWith("no-job-steps", { docJrn: "doc:no-job-steps" });

		// Verify runWorkflowForJob was NOT called
		expect(runWorkflowForJob).not.toHaveBeenCalled();
	});

	it("runs cli-impact job with resolved space, integration, and sandbox auth token", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 900,
				slug: "impact-space",
				ownerId: 321,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(
			mockActiveUser({
				id: 321,
				email: "impact-owner@example.com",
				name: "Impact Owner",
			}),
		);

		const integration: GithubRepoIntegration = mockIntegration({
			id: 55,
			type: "github",
			metadata: {
				repo: "impact-org/impact-repo",
				branch: "main",
				features: [],
				installationId: 123,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token_impact");
		const sandboxTokenSpy = vi
			.spyOn(TokenUtil, "createSandboxServiceToken")
			.mockReturnValue("sandbox-impact-token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(
			def.handler(
				{
					spaceId: 900,
					integrationId: 55,
					eventJrn: "jrn::path:/home/global/sources/github/impact-org/impact-repo/feature/cli",
				},
				context,
			),
		).resolves.toBeUndefined();

		expect(sandboxTokenSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 321,
				email: "impact-owner@example.com",
				spaceSlug: "impact-space",
				ttl: "30m",
			}),
		);
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"cli-impact",
			expect.objectContaining({
				githubToken: "gh_token_impact",
				jolliAuthToken: "sandbox-impact-token",
				jolliSpace: "impact-space",
			}),
			expect.objectContaining({
				githubOrg: "impact-org",
				githubRepo: "impact-repo",
				githubBranch: "feature/cli",
				eventJrn: "jrn::path:/home/global/sources/github/impact-org/impact-repo/feature/cli",
				killSandbox: false,
				cursorSha: undefined,
			}),
			expect.any(Function),
		);
		expect(context.updateStats).toHaveBeenCalledWith(
			expect.objectContaining({
				phase: "completed",
				progress: 100,
				githubUrl: "https://github.com/impact-org/impact-repo",
			}),
		);
	});

	it("fails cli-impact job when event JRN repo does not match integration repo", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 901,
				slug: "impact-space",
				ownerId: 321,
			}),
		);
		const integration: GithubRepoIntegration = mockIntegration({
			id: 56,
			type: "github",
			metadata: {
				repo: "correct-org/correct-repo",
				branch: "main",
				features: [],
				installationId: 123,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token_impact");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		await expect(
			def.handler(
				{
					spaceId: 901,
					integrationId: 56,
					eventJrn: "jrn::path:/home/global/sources/github/wrong-org/wrong-repo/main",
				},
				createMockContext(def.name),
			),
		).rejects.toThrow("does not match integration repo");
		expect(runWorkflowForJob).not.toHaveBeenCalled();
	});

	it("fails cli-impact job when space has no owner", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 902,
				slug: "no-owner-space",
				ownerId: 0,
			}),
		);
		const integration: GithubRepoIntegration = mockIntegration({
			id: 57,
			type: "github",
			metadata: {
				repo: "some-org/some-repo",
				branch: "main",
				features: [],
				installationId: 123,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token");

		await expect(
			def.handler(
				{
					spaceId: 902,
					integrationId: 57,
					eventJrn: "jrn::path:/home/global/sources/github/some-org/some-repo/main",
				},
				createMockContext(def.name),
			),
		).rejects.toThrow('Space "no-owner-space" has no owner');
	});

	it("fails cli-impact job when space owner is not found", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 903,
				slug: "orphan-space",
				ownerId: 999,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(undefined);
		const integration: GithubRepoIntegration = mockIntegration({
			id: 58,
			type: "github",
			metadata: {
				repo: "some-org/some-repo",
				branch: "main",
				features: [],
				installationId: 123,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token");

		await expect(
			def.handler(
				{
					spaceId: 903,
					integrationId: 58,
					eventJrn: "jrn::path:/home/global/sources/github/some-org/some-repo/main",
				},
				createMockContext(def.name),
			),
		).rejects.toThrow('Owner (id=999) for space "orphan-space" not found');
	});

	it("updates source cursor after successful cli-impact job", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 910,
				slug: "cursor-space",
				ownerId: 330,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(
			mockActiveUser({
				id: 330,
				email: "cursor-owner@example.com",
				name: "Cursor Owner",
			}),
		);

		const integration: GithubRepoIntegration = mockIntegration({
			id: 60,
			type: "github",
			metadata: {
				repo: "cursor-org/cursor-repo",
				branch: "main",
				features: [],
				installationId: 130,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token_cursor");
		vi.spyOn(TokenUtil, "createSandboxServiceToken").mockReturnValue("sandbox-cursor-token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await def.handler(
			{
				spaceId: 910,
				sourceId: 70,
				integrationId: 60,
				eventJrn: "jrn::path:/home/global/sources/github/cursor-org/cursor-repo/main",
				afterSha: "new-sha-abc123",
				cursorSha: "prev-sha-000",
			},
			context,
		);

		// Verify cursor was updated with the afterSha
		expect(db.sourceDao.updateCursor).toHaveBeenCalledWith(70, {
			value: "new-sha-abc123",
			updatedAt: expect.any(String),
		});
		expect(context.log).toHaveBeenCalledWith("source-cursor-updated", {
			sourceId: 70,
			afterSha: "new-sha-abc123",
		});
		// Verify cursorSha was passed to workflow
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"cli-impact",
			expect.anything(),
			expect.objectContaining({ cursorSha: "prev-sha-000" }),
			expect.any(Function),
		);
	});

	it("does not update cursor when sourceId or afterSha is missing", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 911,
				slug: "no-cursor-space",
				ownerId: 331,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(
			mockActiveUser({
				id: 331,
				email: "no-cursor@example.com",
				name: "No Cursor",
			}),
		);

		const integration: GithubRepoIntegration = mockIntegration({
			id: 61,
			type: "github",
			metadata: {
				repo: "nocursor-org/nocursor-repo",
				branch: "main",
				features: [],
				installationId: 131,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token");
		vi.spyOn(TokenUtil, "createSandboxServiceToken").mockReturnValue("sandbox-token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		// No sourceId or afterSha provided
		await def.handler(
			{
				spaceId: 911,
				integrationId: 61,
				eventJrn: "jrn::path:/home/global/sources/github/nocursor-org/nocursor-repo/main",
			},
			context,
		);

		expect(db.sourceDao.updateCursor).not.toHaveBeenCalled();
	});

	it("does not fail job when cursor update fails", async () => {
		const def = getRegisteredJobHandler("knowledge-graph:cli-impact");
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		db.spaceDao.getSpace = vi.fn().mockResolvedValue(
			mockSpace({
				id: 912,
				slug: "fail-cursor-space",
				ownerId: 332,
			}),
		);
		db.activeUserDao.findById = vi.fn().mockResolvedValue(
			mockActiveUser({
				id: 332,
				email: "fail-cursor@example.com",
				name: "Fail Cursor",
			}),
		);

		const integration: GithubRepoIntegration = mockIntegration({
			id: 62,
			type: "github",
			metadata: {
				repo: "failcursor-org/failcursor-repo",
				branch: "main",
				features: [],
				installationId: 132,
				githubAppId: 1,
			},
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("gh_token");
		vi.spyOn(TokenUtil, "createSandboxServiceToken").mockReturnValue("sandbox-token");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		// Make cursor update fail
		db.sourceDao.updateCursor = vi.fn().mockRejectedValue(new Error("DB connection lost"));

		const context = createMockContext(def.name);
		// Should not throw — cursor update failure is non-fatal
		await expect(
			def.handler(
				{
					spaceId: 912,
					sourceId: 72,
					integrationId: 62,
					eventJrn: "jrn::path:/home/global/sources/github/failcursor-org/failcursor-repo/main",
					afterSha: "sha-that-wont-save",
				},
				context,
			),
		).resolves.toBeUndefined();

		expect(context.log).toHaveBeenCalledWith("source-cursor-update-failed", {
			sourceId: 72,
			afterSha: "sha-that-wont-save",
			error: "DB connection lost",
		});
	});

	it("registers all knowledge graph jobs", () => {
		const jobs = createKnowledgeGraphJobs(db, integrationsManager);
		jobs.registerJobs(scheduler);

		expect(registeredJobs.length).toBe(7);
		expect(registeredJobs.find(j => j.name === "knowledge-graph:architecture")).toBeTruthy();
		expect(registeredJobs.find(j => j.name === "knowledge-graph:code-to-api-articles")).toBeTruthy();
		expect(registeredJobs.find(j => j.name === "knowledge-graph:docs-to-docusaurus")).toBeTruthy();
		expect(registeredJobs.find(j => j.name === "knowledge-graph:run-jolliscript")).toBeTruthy();
		expect(registeredJobs.find(j => j.name === "knowledge-graph:cli-impact")).toBeTruthy();
		expect(registeredJobs.find(j => j.name === "knowledge-graph:git-push-event")).toBeTruthy();
		expect(registeredJobs.find(j => j.name === "knowledge-graph:analyze-source-doc")).toBeTruthy();
	});

	// Tests for git-push-event job handler (lines 100-219)
	describe("git-push-event job", () => {
		it("registers git-push-event job", () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");
			expect(def).toBeTruthy();
			expect(def.name).toBe("knowledge-graph:git-push-event");
		});

		it("handles git push event with commits", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");

			const pushParams = {
				ref: "refs/heads/main",
				before: "abc123",
				after: "def456",
				repository: {
					full_name: "owner/repo",
				},
				commits: [
					{
						id: "commit1",
						message: "Test commit",
						added: ["file1.ts", "file2.ts"],
						modified: ["file3.ts"],
						removed: ["file4.ts"],
					},
				],
			};

			const context = createMockContext(def.name);
			await expect(def.handler(pushParams, context)).resolves.toBeUndefined();

			// Verify logs were called
			expect(context.log).toHaveBeenCalledWith("git-push", {
				ref: "refs/heads/main",
				before: "abc123",
				after: "def456",
			});
			expect(context.log).toHaveBeenCalledWith("files-added", { files: "file1.ts, file2.ts" });
			expect(context.log).toHaveBeenCalledWith("files-modified", { files: "file3.ts" });
			expect(context.log).toHaveBeenCalledWith("files-removed", { files: "file4.ts" });
		});

		it("handles git push event with no file changes", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");

			const pushParams = {
				ref: "refs/heads/main",
				before: "abc123",
				after: "def456",
				repository: {
					full_name: "owner/repo",
				},
				commits: [
					{
						id: "commit1",
						message: "Test commit",
						added: [],
						modified: [],
						removed: [],
					},
				],
			};

			const context = createMockContext(def.name);
			await expect(def.handler(pushParams, context)).resolves.toBeUndefined();

			// Verify git-push log was called
			expect(context.log).toHaveBeenCalledWith("git-push", {
				ref: "refs/heads/main",
				before: "abc123",
				after: "def456",
			});
			// Files-added/modified/removed should not be called
			expect(context.log).not.toHaveBeenCalledWith("files-added", expect.any(Object));
		});

		it("shouldTriggerEvent returns false for non-branch refs", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");
			const shouldTrigger = def.shouldTriggerEvent;
			if (!shouldTrigger) {
				throw new Error("shouldTriggerEvent not defined");
			}

			const pushParams = {
				ref: "refs/tags/v1.0.0",
				before: "abc123",
				after: "def456",
				repository: {
					full_name: "owner/repo",
				},
				commits: [],
			};

			const result = await shouldTrigger("github:push", pushParams);
			expect(result).toBe(false);
		});

		it("shouldTriggerEvent returns false when integration does not match", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");
			const shouldTrigger = def.shouldTriggerEvent;
			if (!shouldTrigger) {
				throw new Error("shouldTriggerEvent not defined");
			}

			// Set up an integration that won't match
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 1,
					type: "github",
					name: "different/repo",
					metadata: { repo: "different/repo", branch: "develop", features: [] },
				}),
			]);

			const pushParams = {
				ref: "refs/heads/main",
				before: "abc123",
				after: "def456",
				repository: {
					full_name: "owner/repo",
				},
				commits: [],
			};

			const result = await shouldTrigger("github:push", pushParams);
			expect(result).toBe(false);
		});

		it("shouldTriggerEvent returns true when integration matches", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");
			const shouldTrigger = def.shouldTriggerEvent;
			if (!shouldTrigger) {
				throw new Error("shouldTriggerEvent not defined");
			}

			// Set up a matching integration
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([
				mockIntegration({
					id: 1,
					type: "github",
					name: "owner/repo",
					metadata: { repo: "owner/repo", branch: "main", features: [] },
				}),
			]);

			const pushParams = {
				ref: "refs/heads/main",
				before: "abc123",
				after: "def456",
				repository: {
					full_name: "owner/repo",
				},
				commits: [],
			};

			const result = await shouldTrigger("github:push", pushParams);
			expect(result).toBe(true);
		});

		it("shouldTriggerEvent returns true for non-github-push events", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:git-push-event");
			const shouldTrigger = def.shouldTriggerEvent;
			if (!shouldTrigger) {
				throw new Error("shouldTriggerEvent not defined");
			}

			const result = await shouldTrigger("other:event", {});
			expect(result).toBe(true);
		});
	});

	// Test for getWorkflowConfig with accessToken to cover line 153
	it("covers debug logging path in getWorkflowConfig", async () => {
		const def = getRegisteredJobHandler();
		const { runWorkflowForJob } = await import("jolli-agent/workflows");

		const integration: GithubRepoIntegration = mockIntegration({
			id: 50,
			type: "github",
			metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
		}) as GithubRepoIntegration;
		integrationsManager.getIntegration = vi.fn().mockResolvedValue(integration);

		// Provide an access token to trigger the debug logging path
		vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue("test_token_12345678");
		vi.mocked(runWorkflowForJob).mockResolvedValue({
			success: true,
		} satisfies Partial<WorkflowResult> as WorkflowResult);

		const context = createMockContext(def.name);
		await expect(def.handler({ integrationId: 50 }, context)).resolves.toBeUndefined();

		// Verify that the workflow was called with the token
		expect(runWorkflowForJob).toHaveBeenCalledWith(
			"architecture-doc",
			expect.objectContaining({
				githubToken: "test_token_12345678",
			}),
			expect.anything(),
			expect.any(Function),
		);
	});

	// Tests for githubIntegrationToProcessIntegrationParamsConverter (lines 604-617)
	describe("githubIntegrationToProcessIntegrationParamsConverter", () => {
		it("converts valid github integration to process integration params", () => {
			const def = getRegisteredJobHandler("knowledge-graph:architecture");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const githubIntegration = {
				id: 123,
				type: "github",
				name: "owner/repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: [],
					installationId: 456,
					githubAppId: 1,
				},
			};

			const result = converter(githubIntegration);
			expect(result).toEqual({
				integrationId: 123,
				killSandbox: false,
			});
		});

		it("returns undefined for inactive github integration", () => {
			const def = getRegisteredJobHandler("knowledge-graph:architecture");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const githubIntegration = {
				id: 123,
				type: "github",
				name: "owner/repo",
				status: "inactive",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: [],
					installationId: 456,
					githubAppId: 1,
				},
			};

			const result = converter(githubIntegration);
			expect(result).toBeUndefined();
		});

		it("returns undefined for integration where name does not match repo", () => {
			const def = getRegisteredJobHandler("knowledge-graph:architecture");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const githubIntegration = {
				id: 123,
				type: "github",
				name: "different/repo",
				status: "active",
				metadata: {
					repo: "owner/repo",
					branch: "main",
					features: [],
					installationId: 456,
					githubAppId: 1,
				},
			};

			const result = converter(githubIntegration);
			expect(result).toBeUndefined();
		});

		it("returns undefined for non-github integration", () => {
			const def = getRegisteredJobHandler("knowledge-graph:architecture");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const integration = {
				id: 123,
				type: "gitlab",
				name: "owner/repo",
				status: "active",
				metadata: {},
			};

			const result = converter(integration);
			expect(result).toBeUndefined();
		});

		it("returns undefined for invalid params", () => {
			const def = getRegisteredJobHandler("knowledge-graph:architecture");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const result = converter(null);
			expect(result).toBeUndefined();
		});
	});

	// Tests for githubPushToRunJolliScriptParamsConverter
	describe("githubPushToRunJolliScriptParamsConverter", () => {
		it("converts valid github push event params to run-jolliscript params", () => {
			const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const eventParams = {
				docArn: "/home/spacex/article_edit_2.md",
				repository: "owner/repo",
				branch: "main",
				pusher: "test-user",
			};

			const result = converter(eventParams);
			expect(result).toEqual({
				docJrn: "/home/spacex/article_edit_2.md",
				killSandbox: false,
			});
		});

		it("returns undefined for missing docArn", () => {
			const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const eventParams = {
				repository: "owner/repo",
				branch: "main",
				pusher: "test-user",
			};

			const result = converter(eventParams);
			expect(result).toBeUndefined();
		});

		it("returns undefined for empty docArn", () => {
			const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const eventParams = {
				docArn: "   ",
				repository: "owner/repo",
				branch: "main",
				pusher: "test-user",
			};

			const result = converter(eventParams);
			expect(result).toBeUndefined();
		});

		it("returns undefined for null params", () => {
			const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const result = converter(null);
			expect(result).toBeUndefined();
		});

		it("returns undefined for undefined params", () => {
			const def = getRegisteredJobHandler("knowledge-graph:run-jolliscript");
			const converter = def.triggerEventParamsConverter;
			if (!converter) {
				throw new Error("triggerEventParamsConverter not defined");
			}

			const result = converter(undefined);
			expect(result).toBeUndefined();
		});
	});

	describe("analyze-source-doc job", () => {
		it("registers analyze-source-doc job", () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			expect(def).toBeTruthy();
			expect(def.name).toBe("knowledge-graph:analyze-source-doc");
		});

		it("fetches diff, constructs prompt, and runs workflow", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			// Mock the doc
			db.docDao.readDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "doc:source-article",
					content: "# Source Article\n\nDocuments the API endpoints.",
					contentType: "text/markdown",
					sourceMetadata: { repo: "owner/repo", branch: "main", path: "docs/api.md" },
				}),
			);

			// Mock GitHub integration for token
			const githubIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				name: "owner/repo",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue(
				// biome-ignore lint/suspicious/noExplicitAny: Overloaded function mock needs type override
				{ accessToken: "gh_token", owner: "owner", repo: "repo" } as any,
			);

			// Mock fetchGithubCompare
			vi.spyOn(GithubAppUtil, "fetchGithubCompare").mockResolvedValue({
				diff: "diff --git a/src/api.ts b/src/api.ts\n+added new endpoint",
				files: [{ filename: "src/api.ts", status: "modified", patch: "+added new endpoint" }],
			});

			vi.mocked(runWorkflowForJob).mockResolvedValue({
				success: true,
			} satisfies Partial<WorkflowResult> as WorkflowResult);

			const context = createMockContext(def.name);
			await expect(
				def.handler(
					{
						docJrn: "doc:source-article",
						before: "abc123",
						after: "def456",
						owner: "owner",
						repo: "repo",
						branch: "main",
					},
					context,
				),
			).resolves.toBeUndefined();

			// Verify fetchGithubCompare was called
			expect(GithubAppUtil.fetchGithubCompare).toHaveBeenCalledWith(
				"gh_token",
				"owner",
				"repo",
				"abc123",
				"def456",
			);

			// Verify workflow was called with the right args
			expect(runWorkflowForJob).toHaveBeenCalledWith(
				"run-jolliscript",
				expect.objectContaining({
					anthropicApiKey: "anthropic",
				}),
				expect.objectContaining({
					additionalTools: expect.arrayContaining([expect.objectContaining({ name: "edit_section" })]),
					jobSteps: expect.arrayContaining([
						expect.objectContaining({
							name: "analyze-source-changes",
							run_prompt: expect.stringContaining("documentation reviewer"),
						}),
					]),
					killSandbox: true,
				}),
				expect.any(Function),
			);

			expect(context.log).toHaveBeenCalledWith("completed", { docJrn: "doc:source-article" });
		});

		it("throws when document is not found", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			db.docDao.readDoc = vi.fn().mockResolvedValue(undefined);

			await expect(
				def.handler(
					{
						docJrn: "doc:missing",
						before: "abc",
						after: "def",
						owner: "o",
						repo: "r",
						branch: "main",
					},
					createMockContext(def.name),
				),
			).rejects.toThrow("Document doc:missing not found");
		});

		it("throws when document has no content", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			db.docDao.readDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "doc:empty",
					content: "",
					contentType: "text/markdown",
				}),
			);

			await expect(
				def.handler(
					{
						docJrn: "doc:empty",
						before: "abc",
						after: "def",
						owner: "o",
						repo: "r",
						branch: "main",
					},
					createMockContext(def.name),
				),
			).rejects.toThrow("Document doc:empty has no content to analyze");
		});

		it("throws when no GitHub access token available", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			db.docDao.readDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "doc:no-token",
					content: "# Some content",
					contentType: "text/markdown",
				}),
			);
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([]);

			await expect(
				def.handler(
					{
						docJrn: "doc:no-token",
						before: "abc",
						after: "def",
						owner: "o",
						repo: "r",
						branch: "main",
					},
					createMockContext(def.name),
				),
			).rejects.toThrow("No GitHub access token available");
		});

		it("throws when diff fetch fails", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			db.docDao.readDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "doc:diff-fail",
					content: "# Some content",
					contentType: "text/markdown",
				}),
			);

			const githubIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				name: "owner/repo",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue(
				// biome-ignore lint/suspicious/noExplicitAny: Overloaded function mock needs type override
				{ accessToken: "gh_token", owner: "owner", repo: "repo" } as any,
			);
			vi.spyOn(GithubAppUtil, "fetchGithubCompare").mockResolvedValue(undefined);

			await expect(
				def.handler(
					{
						docJrn: "doc:diff-fail",
						before: "abc",
						after: "def",
						owner: "owner",
						repo: "repo",
						branch: "main",
					},
					createMockContext(def.name),
				),
			).rejects.toThrow("Failed to fetch diff");
		});

		it("returns early when diff is empty (no changes)", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			const { runWorkflowForJob } = await import("jolli-agent/workflows");

			db.docDao.readDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "doc:empty-diff",
					content: "# Content",
					contentType: "text/markdown",
				}),
			);

			const githubIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				name: "owner/repo",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockResolvedValue(
				// biome-ignore lint/suspicious/noExplicitAny: Overloaded function mock needs type override
				{ accessToken: "gh_token", owner: "owner", repo: "repo" } as any,
			);
			vi.spyOn(GithubAppUtil, "fetchGithubCompare").mockResolvedValue({ diff: "   ", files: [] });

			const context = createMockContext(def.name);
			await expect(
				def.handler(
					{
						docJrn: "doc:empty-diff",
						before: "abc",
						after: "def",
						owner: "owner",
						repo: "repo",
						branch: "main",
					},
					context,
				),
			).resolves.toBeUndefined();

			expect(context.log).toHaveBeenCalledWith("no-changes", { docJrn: "doc:empty-diff" });
			expect(runWorkflowForJob).not.toHaveBeenCalled();
		});

		it("handles github token error gracefully and throws", async () => {
			const def = getRegisteredJobHandler("knowledge-graph:analyze-source-doc");
			db.docDao.readDoc = vi.fn().mockResolvedValue(
				mockDoc({
					jrn: "doc:token-error",
					content: "# Content",
					contentType: "text/markdown",
				}),
			);

			const githubIntegration = mockIntegration({
				id: 1,
				type: "github",
				status: "active",
				name: "owner/repo",
				metadata: { repo: "owner/repo", branch: "main", features: [], installationId: 123, githubAppId: 1 },
			}) as GithubRepoIntegration;
			integrationsManager.listIntegrations = vi.fn().mockResolvedValue([githubIntegration]);
			vi.spyOn(IntegrationUtil, "getAccessTokenForGithubRepoIntegration").mockRejectedValue(
				new Error("Token failed"),
			);

			const context = createMockContext(def.name);
			await expect(
				def.handler(
					{
						docJrn: "doc:token-error",
						before: "abc",
						after: "def",
						owner: "owner",
						repo: "repo",
						branch: "main",
					},
					context,
				),
			).rejects.toThrow("No GitHub access token available");

			expect(context.log).toHaveBeenCalledWith("github-token-error", expect.any(Object));
		});
	});

	afterEach(() => {
		process.env = originalEnv;
	});
});

function createMockContext(name: string): JobContext {
	return {
		jobId: "job-1",
		jobName: name,
		emitEvent: vi.fn(),
		log: vi.fn(),
		updateStats: vi.fn().mockResolvedValue(undefined),
		setCompletionInfo: vi.fn().mockResolvedValue(undefined),
	} as JobContext;
}
