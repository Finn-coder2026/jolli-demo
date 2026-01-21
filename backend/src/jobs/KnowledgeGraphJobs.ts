//noinspection ExceptionCaughtLocallyJS

import {
	type JobStep,
	type JolliScriptFrontMatter,
	parseSections,
} from "../../../tools/jolliagent/src/jolliscript/parser";
import type { RunState, ToolCall } from "../../../tools/jolliagent/src/Types";
import { createCreateArticleToolDefinition, executeCreateArticleTool } from "../adapters/tools/CreateArticleTool";
import { createCreateSectionToolDefinition, executeCreateSectionTool } from "../adapters/tools/CreateSectionTool";
import { createDeleteSectionToolDefinition, executeDeleteSectionTool } from "../adapters/tools/DeleteSectionTool";
import { createEditSectionToolDefinition, executeEditSectionTool } from "../adapters/tools/EditSectionTool";
import {
	createGetCurrentArticleToolDefinition,
	executeGetCurrentArticleTool,
} from "../adapters/tools/GetCurrentArticleTool";
import {
	createGetLatestLinearTicketsToolDefinition,
	executeGetLatestLinearTicketsTool,
	type GetLatestLinearTicketsArgs,
} from "../adapters/tools/GetLatestLinearTicketsTool";
import {
	createSyncUpArticleToolDefinition,
	executeSyncUpArticleTool,
	type SyncUpArticleArgs,
} from "../adapters/tools/SyncUpArticleTool";
import { getWorkflowConfig } from "../config/Config";
import type { Database } from "../core/Database";
import { GITHUB_PUSH, INTEGRATIONS_GITHUB_CREATED_EVENT } from "../events/GithubEvents";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { GithubPushSchema, type GithubPushSchemaParams } from "../schemas/GithubSchemas";
import {
	GithubIntegrationSchema,
	type GithubIntegrationSchemaParams,
	type IntegrationSchemaParams,
} from "../schemas/IntegrationSchemas";
import type { JobContext } from "../types/JobTypes";
import { getAccessTokenForGithubRepoIntegration } from "../util/IntegrationUtil";
import { getLog } from "../util/Logger";
import { jobDefinitionBuilder } from "./JobDefinitions";
import type { JobScheduler } from "./JobScheduler";
import { runWorkflowForJob } from "jolli-agent/workflows";
import { type GithubRepoIntegrationMetadata, jrnParser } from "jolli-common";
import { z } from "zod";

const log = getLog(import.meta);

/**
 * Knowledge Graph Jobs
 * Handles knowledge graph generation and processing for GitHub repositories
 */
export interface KnowledgeGraphJobs {
	/**
	 * Register all knowledge graph related jobs with the scheduler
	 */
	registerJobs: (jobScheduler: JobScheduler) => void;
	/**
	 * Queue initial knowledge graph jobs
	 */
	queueJobs: (jobScheduler: JobScheduler) => Promise<void>;
}

// Schema for the job parameters
const ProcessIntegrationSchema = z.object({
	integrationId: z.number(),
	killSandbox: z.boolean().default(false),
}) as z.ZodType<{
	integrationId: number;
	killSandbox: boolean;
}>;

type ProcessIntegrationParams = z.infer<typeof ProcessIntegrationSchema>;

const RunJolliScriptSchema = z.object({
	docJrn: z.string(),
	killSandbox: z.boolean().default(false),
}) as z.ZodType<{
	docJrn: string;
	killSandbox: boolean;
}>;

type RunJolliScriptParams = z.infer<typeof RunJolliScriptSchema>;

// Schema for the job stats
const KnowledgeGraphStatsSchema = z.object({
	sandboxId: z.string().optional(),
	phase: z.string(),
	progress: z.number().min(0).max(100),
	githubUrl: z.string(),
	startedAt: z.string().optional(),
	docJrn: z.string().optional(),
});

type KnowledgeGraphStats = z.infer<typeof KnowledgeGraphStatsSchema>;

/**
 * Creates knowledge graph jobs
 */
export function createKnowledgeGraphJobs(db: Database, integrationsManager: IntegrationsManager): KnowledgeGraphJobs {
	const { docDao, docDraftDao, docDraftSectionChangesDao, userDao } = db as Database & {
		docDao: import("../dao/DocDao").DocDao;
		docDraftDao: import("../dao/DocDraftDao").DocDraftDao;
		docDraftSectionChangesDao: import("../dao/DocDraftSectionChangesDao").DocDraftSectionChangesDao;
		userDao: import("../dao/UserDao").UserDao;
	};

	function getGithubUrl(integration: GithubIntegrationSchemaParams, context?: JobContext): string {
		const repo = integration.metadata.repo;
		if (context) {
			context.log("using-repo", { repo });
		}
		return `https://github.com/${repo}`;
	}

	async function isGithubIntegrationRepo(params: GithubPushSchemaParams) {
		const {
			ref,
			repository: { full_name },
		} = params;
		const branch = ref.startsWith("refs/heads/") ? ref.substring("refs/heads/".length) : undefined;
		if (!branch) {
			// only support pushes to a branch
			return false;
		}
		const integrations = await integrationsManager.listIntegrations();
		return integrations.some(integration => {
			const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			return "github" === integration.type && full_name === integration.name && branch === metadata?.branch;
		});
	}

	function isGithubIntegration(params: IntegrationSchemaParams): boolean {
		log.debug("isGithubIntegration: %O", params);
		const { name, status } = params;
		return "active" === status && params.metadata?.repo === name;
	}

	async function shouldTriggerGithubPushJob(name: string, params: GithubPushSchemaParams): Promise<boolean> {
		if (GITHUB_PUSH === name) {
			return await isGithubIntegrationRepo(params);
		}
		return true;
	}

	function githubPushJobHandler(params: GithubPushSchemaParams, context: JobContext): Promise<void> {
		// add more fields as-needed
		const { ref, before, after, commits } = params;
		context.log("git-push", { ref, before, after });
		log.debug("git push: ref: %s; before: %s; after: %s", ref, before, after);
		for (const commit of commits) {
			const { added, modified, removed } = commit;
			if (added.length > 0) {
				context.log("files-added", { files: added.join(", ") });
			}
			if (modified.length > 0) {
				context.log("files-modified", { files: modified.join(", ") });
			}
			if (removed.length > 0) {
				context.log("files-removed", { files: removed.join(", ") });
			}
			log.debug("files added: %s", added.join(", "));
			log.debug("files modified: %s", modified.join(", "));
			log.debug("files removed: %s", removed.join(", "));
		}
		return Promise.resolve();
	}

	/**
	 * Creates a custom logger that captures sandbox IDs from log messages
	 * and updates job stats when a sandbox ID is detected
	 *
	 * Supports both legacy plain string messages and new localization-friendly message keys with context
	 */
	function createSandboxCapturingLogger(
		context: JobContext,
		githubUrl: string,
		docJrn?: string,
	): {
		logger: (messageOrKey: string, messageContext?: Record<string, unknown>) => void;
		getSandboxId: () => string | undefined;
	} {
		let capturedSandboxId: string | undefined;

		const logger = (messageOrKey: string, messageContext?: Record<string, unknown>) => {
			// Log to job context (supports both plain strings and message keys)
			// Always pass a context object (even if empty) so the backend can distinguish
			// message keys from plain strings for translation
			const ctx = messageContext ?? {};
			context.log(messageOrKey, ctx);

			// Try to extract sandbox ID from context first (new localized format)
			let detectedSandboxId: string | undefined;
			if (messageContext && typeof messageContext.sandboxId === "string") {
				detectedSandboxId = messageContext.sandboxId;
			}

			// Fall back to regex extraction from message string (legacy format)
			if (!detectedSandboxId) {
				const sandboxIdMatch = messageOrKey.match(
					/(?:sandbox[_\s]?(?:id|ID)?[:\s]+|Created sandbox[:\s]+)(sandbox_[a-zA-Z0-9]+)/i,
				);
				if (sandboxIdMatch) {
					detectedSandboxId = sandboxIdMatch[1];
				}
			}

			// Fall back to E2B sandbox patterns
			if (!detectedSandboxId) {
				const e2bSandboxMatch = messageOrKey.match(/(?:E2B|e2b)[^:]*sandbox[^:]*[:\s]+([a-zA-Z0-9-]+)/i);
				if (e2bSandboxMatch) {
					detectedSandboxId = e2bSandboxMatch[1];
				}
			}

			// If we detected a sandbox ID and haven't captured one yet, capture it and update stats
			if (detectedSandboxId && !capturedSandboxId) {
				capturedSandboxId = detectedSandboxId;
				context.log("sandbox-id-captured", { sandboxId: capturedSandboxId });

				// Update stats with the captured sandbox ID
				const statsUpdate: Record<string, unknown> = {
					sandboxId: capturedSandboxId,
					phase: "sandbox-running",
					progress: 30,
					githubUrl,
					startedAt: new Date().toISOString(),
				};
				if (docJrn) {
					statsUpdate.docJrn = docJrn;
				}

				context.updateStats(statsUpdate).catch(err => {
					/* v8 ignore next */
					context.log(`Failed to update stats with sandbox ID: ${err}`);
				});
			}
		};

		return {
			logger,
			getSandboxId: () => capturedSandboxId,
		};
	}

	/**
	 * Creates a syncIt function for syncing API documentation files from workflow output to DocDao
	 */
	/* v8 ignore start - syncUp is currently disabled (hardcoded to false) */
	function createApiDocsSyncIt(context: JobContext) {
		return async (fs: {
			writeFile: (location: string, data: string) => Promise<void>;
			listFiles: (root?: string) => Promise<Array<string>>;
			readFile: (path: string) => Promise<string>;
			docsRoot?: string;
		}) => {
			try {
				const baseRoot = fs.docsRoot && fs.docsRoot.trim().length > 0 ? fs.docsRoot : "./api-docs";
				const root = `${baseRoot.replace(/\/$/, "")}/docs`;
				const files = await fs.listFiles(root);
				context.log("scanning-files", { count: files.length, root });

				for (const filename of files) {
					try {
						const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const rootRe = new RegExp(`^${escapeRe(root)}\/`);
						const rel = filename.replace(rootRe, "");
						if (rel === filename) {
							// Skip files not under the root directory - no need to log this
							continue;
						}
						const data = await fs.readFile(filename);
						// Generate JRN using article() which normalizes: lowercase, spaces to hyphens
						const jrn = jrnParser.article(rel);
						const existing = await docDao.readDoc(jrn);
						const title = rel;
						if (existing) {
							await docDao.updateDoc({
								...existing,
								content: data,
								contentType: "text/markdown",
								contentMetadata: {
									...(existing.contentMetadata as Record<string, unknown>),
									title,
								},
								updatedBy: "knowledge-graph",
								version: existing.version + 1,
							});
						} else {
							// Generate slug from the relative path (lowercase, hyphens for separators)
							const slug = rel
								.toLowerCase()
								.replace(/\.(md|mdx)$/i, "")
								.replace(/[/\\]/g, "-")
								.replace(/\s+/g, "-");

							await docDao.createDoc({
								jrn,
								slug,
								path: "",
								content: data,
								contentType: "text/markdown",
								updatedBy: "knowledge-graph",
								source: undefined,
								sourceMetadata: undefined,
								contentMetadata: { title },
								spaceId: undefined,
								parentId: undefined,
								docType: "document",
								sortOrder: 0,
								createdBy: "knowledge-graph",
							});
						}
						context.log("file-persisted", {
							jrn,
							bytes: data.length,
						});
					} catch (e) {
						context.log("file-failed", { filename, error: String(e) });
					}
				}
			} catch (e) {
				context.log("post-sync-failed", { error: String(e) });
			}
		};
	}
	/* v8 ignore stop */

	/**
	 * Creates a syncIt function for syncing JolliScript output files to DocDao
	 */
	/* v8 ignore start - syncUp is currently disabled (hardcoded to false) */
	function createJolliScriptSyncIt(context: JobContext) {
		return async (fs: {
			writeFile: (location: string, data: string) => Promise<void>;
			listFiles: (root?: string) => Promise<Array<string>>;
			readFile: (path: string) => Promise<string>;
			docsRoot?: string;
		}) => {
			try {
				const root = "./";
				const files = await fs.listFiles(root);
				context.log("scanning-files", { count: files.length, root });

				for (const filename of files) {
					try {
						// Skip non-markdown files
						if (!filename.endsWith(".md")) {
							continue;
						}

						// Get relative path from root
						const rel = filename.startsWith("./") ? filename.substring(2) : filename;

						const data = await fs.readFile(filename);
						// Generate JRN using article() which normalizes: lowercase, spaces to hyphens
						const jrn = jrnParser.article(rel);
						const existing = await docDao.readDoc(jrn);
						const title = rel;

						if (existing) {
							await docDao.updateDoc({
								...existing,
								content: data,
								contentType: "text/markdown",
								contentMetadata: {
									...(existing.contentMetadata as Record<string, unknown>),
									title,
								},
								updatedBy: "run-jolliscript",
								version: existing.version + 1,
							});
						} else {
							// Generate slug from the relative path (lowercase, hyphens for separators)
							const slug = rel
								.toLowerCase()
								.replace(/\.(md|mdx)$/i, "")
								.replace(/[/\\]/g, "-")
								.replace(/\s+/g, "-");

							await docDao.createDoc({
								jrn,
								slug,
								path: "",
								content: data,
								contentType: "text/markdown",
								updatedBy: "run-jolliscript",
								source: undefined,
								sourceMetadata: undefined,
								contentMetadata: { title },
								spaceId: undefined,
								parentId: undefined,
								docType: "document",
								sortOrder: 0,
								createdBy: "run-jolliscript",
							});
						}
						context.log("file-persisted", {
							jrn,
							bytes: data.length,
						});
					} catch (e) {
						context.log("file-failed", { filename, error: String(e) });
					}
				}
			} catch (e) {
				context.log("sync-failed", { error: String(e) });
			}
		};
	}
	/* v8 ignore stop */

	/* v8 ignore start - syncDown is currently disabled (hardcoded to false) */
	function createDocToDocusaurusSyncIt(context: JobContext) {
		return async (fs: {
			writeFile: (location: string, data: string) => Promise<void>;
			listFiles: (root?: string) => Promise<Array<string>>;
			readFile: (path: string) => Promise<string>;
		}) => {
			try {
				context.log("sync-starting");

				// List all documents with the new JRN format (docs service, article type)
				// Filter for articles in the global workspace
				const jrnPrefix = "jrn:prod:global:docs:article/";
				const docs = await docDao.listDocs({ startsWithJrn: "" });

				if (!docs || docs.length === 0) {
					context.log("no-documents");
					return;
				}

				context.log("found-documents", { count: docs.length });

				for (const doc of docs) {
					try {
						// Extract the resource ID from the JRN
						// e.g., jrn:prod:global:docs:article/foo-bar.md -> foo-bar.md
						const relativePath = doc.jrn.replace(jrnPrefix, "");

						// Construct the target path in api-docs/docs/
						const targetPath = `api-docs/docs/${relativePath}`;

						// Get the document content
						const content = doc.content || "";

						// Write the file using the provided adapter
						await fs.writeFile(targetPath, content);

						context.log("file-persisted", {
							jrn: doc.jrn,
							bytes: content.length,
						});
					} catch (error) {
						context.log("file-persist-error", {
							jrn: doc.jrn,
							error: String(error),
						});
					}
				}

				context.log("sync-completed");
			} catch (error) {
				context.log("sync-error", { error: String(error) });
			}
		};
	}
	/* v8 ignore stop */

	/**
	 * Sets up GitHub integration: fetches, validates, gets token, resolves URL
	 */
	async function setupGithubIntegration(context: JobContext, integrationId: number) {
		const integration = await integrationsManager.getIntegration(integrationId);
		if (!integration) {
			throw new Error(`Integration with ID ${integrationId} not found`);
		}

		// Validate it's a GitHub integration
		let githubIntegration: GithubIntegrationSchemaParams;
		try {
			githubIntegration = GithubIntegrationSchema.parse(integration);
		} catch (_error) {
			throw new Error(`Integration ${integrationId} is not a GitHub integration (type: ${integration.type})`);
		}

		// Validate repository metadata
		const hasRepo = githubIntegration.metadata?.repo && githubIntegration.metadata.repo.trim().length > 0;
		const hasInstallationId = githubIntegration.metadata?.installationId;

		// If installationId is present, validate it has repos
		if (hasInstallationId && githubIntegration.metadata.installationId) {
			const installation = await db.githubInstallationDao.lookupByInstallationId(
				githubIntegration.metadata.installationId,
			);
			if (installation && (!installation.repos || installation.repos.length === 0)) {
				throw new Error(`No repositories found for installation ${githubIntegration.metadata.installationId}`);
			}
		}

		// Must have either a repo or an installationId with repos
		if (!hasRepo && !hasInstallationId) {
			throw new Error("Integration has no repository information");
		}

		const githubUrl = getGithubUrl(githubIntegration, context);

		context.log("fetching-token", { integrationId });
		const accessToken = await getAccessTokenForGithubRepoIntegration(integration);
		context.log("token-obtained", { integrationId });

		return { integration: githubIntegration, accessToken, githubUrl };
	}

	/**
	 * Updates job phase with standard stats structure
	 */
	async function updateJobPhase(
		context: JobContext,
		phase: string,
		progress: number,
		githubUrl: string,
		options?: { docJrn?: string; sandboxId?: string },
	) {
		const statsUpdate: Record<string, unknown> = {
			sandboxId: options?.sandboxId,
			phase,
			progress,
			githubUrl,
			startedAt: new Date().toISOString(),
		};
		if (options?.docJrn) {
			statsUpdate.docJrn = options.docJrn;
		}
		await context.updateStats(statsUpdate);
	}

	/**
	 * Processes workflow result: validates success, extracts sandbox ID, updates completion stats
	 */
	async function processWorkflowResult(
		context: JobContext,
		result: { success: boolean; error?: string; outputData?: { sandboxId?: string } },
		capturedSandboxId: string | undefined,
		githubUrl: string,
		options?: { docJrn?: string },
	): Promise<string | undefined> {
		if (!result.success) {
			throw new Error(`Workflow failed: ${result.error}`);
		}

		const sandboxId = (result.outputData?.sandboxId as string | undefined) || capturedSandboxId;
		const updateOptions: { sandboxId: string; docJrn?: string } = {
			sandboxId: sandboxId || "completed-without-id",
		};
		if (options?.docJrn) {
			updateOptions.docJrn = options.docJrn;
		}
		await updateJobPhase(context, "completed", 100, githubUrl, updateOptions);

		return sandboxId;
	}

	/**
	 * Handles job errors with consistent logging
	 */
	function handleJobError(
		context: JobContext,
		error: unknown,
		jobType: string,
		params: { integrationId?: number; docJrn?: string },
	): never {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		context.log("error", { error: errorMessage, ...params });

		const identifier = params.integrationId ? `integration ${params.integrationId}` : params.docJrn || "unknown";
		context.log(`Error ${jobType} for ${identifier}: ${errorMessage}`);
		log.error({ ...params, errorMessage, errorStack }, `Failed to ${jobType}`);
		throw error;
	}

	function githubIntegrationToProcessIntegrationParamsConverter(
		params: unknown,
	): ProcessIntegrationParams | undefined {
		log.debug("githubIntegrationToProcessIntegrationParamsConverter: %s", JSON.stringify(params));
		const integrationParse = GithubIntegrationSchema.safeParse(params);
		log.debug("CONVERTER: integrationParse: %O", integrationParse);
		if (integrationParse.success && isGithubIntegration(integrationParse.data)) {
			const { id } = integrationParse.data;
			return {
				integrationId: id,
				killSandbox: false,
			};
		}
		return;
	}

	/**
	 * Converts github:push:trigger-jolliscript event params to RunJolliScriptParams.
	 * Maps docArn to docJrn for compatibility with the job schema.
	 */
	function githubPushToRunJolliScriptParamsConverter(params: unknown): RunJolliScriptParams | undefined {
		const eventParams = params as { docArn?: string };
		if (typeof eventParams?.docArn === "string" && eventParams.docArn.trim() !== "") {
			return {
				docJrn: eventParams.docArn,
				killSandbox: false,
			};
		}
		log.warn({ params }, "githubPushToRunJolliScriptParamsConverter: missing or invalid docArn in event params");
		return;
	}

	async function processIntegrationJobHandler(params: unknown, context: JobContext): Promise<void> {
		const { integrationId, killSandbox = false } = params as ProcessIntegrationParams;

		context.log("starting", { integrationId });

		try {
			// Initialize stats
			await updateJobPhase(context, "initializing", 0, "");

			// Setup GitHub integration
			const { integration, accessToken, githubUrl } = await setupGithubIntegration(context, integrationId);

			// Update stats with GitHub URL
			await updateJobPhase(context, "preparing-workflow", 10, githubUrl);

			context.log("running-workflow", { githubUrl });

			// Build workflow config
			const workflowConfig = getWorkflowConfig(accessToken);

			// Update stats before starting workflow
			await updateJobPhase(context, "starting-sandbox", 20, githubUrl);

			// Create a custom logger that intercepts sandbox ID
			const { logger: customLogger, getSandboxId } = createSandboxCapturingLogger(context, githubUrl);

			// Create syncIt function to push files under api-docs/docs to DocDao
			const syncIt = createApiDocsSyncIt(context);

			const result = await runWorkflowForJob(
				"architecture-doc",
				workflowConfig,
				{
					githubUrl,
					syncIt,
					syncItPhase: "after",
					killSandbox,
				},
				customLogger,
			);

			// Process workflow result and get sandbox ID
			const sandboxId = await processWorkflowResult(context, result, getSandboxId(), githubUrl);

			// Log completion details
			context.log("completed", { integrationId });

			log.info(
				{
					integrationId,
					repo: integration.metadata.repo,
					workflowSuccess: result.success,
					outputData: result.outputData,
					sandboxId,
				},
				"Knowledge graph workflow completed",
			);
		} catch (error) {
			handleJobError(context, error, "process integration for knowledge graph", { integrationId });
		}
	}

	async function codeToApiArticleJobHandler(params: unknown, context: JobContext): Promise<void> {
		const { integrationId, killSandbox = false } = params as ProcessIntegrationParams;

		context.log("starting", { integrationId });

		try {
			// Initialize stats
			await updateJobPhase(context, "initializing", 0, "");

			// Setup GitHub integration
			const { accessToken, githubUrl } = await setupGithubIntegration(context, integrationId);

			// Update stats with GitHub URL
			await updateJobPhase(context, "preparing-workflow", 10, githubUrl);

			const workflowConfig = getWorkflowConfig(accessToken);

			// Update stats before starting workflow
			await updateJobPhase(context, "starting-sandbox", 20, githubUrl);

			// Create a custom logger that intercepts sandbox ID
			const { logger: customLogger, getSandboxId } = createSandboxCapturingLogger(context, githubUrl);

			// Create syncIt function
			const syncIt = createApiDocsSyncIt(context);

			const result = await runWorkflowForJob(
				"code-to-api-docs",
				workflowConfig,
				{ githubUrl, syncIt, syncItPhase: "after", killSandbox },
				customLogger,
			);

			// Process workflow result
			await processWorkflowResult(context, result, getSandboxId(), githubUrl);

			context.log("completed", { integrationId });
		} catch (error) {
			handleJobError(context, error, "process integration for code-to-api-articles", { integrationId });
		}
	}

	async function docToDocusaurusJobHandler(params: ProcessIntegrationParams, context: JobContext): Promise<void> {
		const { integrationId, killSandbox = false } = params;

		context.log("starting", { integrationId });

		try {
			// Set up integration and get GitHub URL
			const { githubUrl, accessToken } = await setupGithubIntegration(context, integrationId);

			await updateJobPhase(context, "preparing-workflow", 10, githubUrl);
			context.log("running-workflow", { githubUrl });

			// Build workflow config
			const workflowConfig = getWorkflowConfig(accessToken);

			await updateJobPhase(context, "starting-sandbox", 20, githubUrl);

			// Create logger that captures sandbox IDs
			const { logger: customLogger, getSandboxId } = createSandboxCapturingLogger(context, githubUrl);

			// Define the output directory for Docusaurus docs
			const outputDir = "./docusaurus/docs";

			// Get the project name from the GitHub URL
			const projectName = githubUrl.split("/").pop() || "project";

			// Define a syncIt function to read docs from /home/space-1 and write to api-docs/docs/
			// This function will be passed to the workflow and can be called with an FS adapter
			const syncIt = createDocToDocusaurusSyncIt(context);

			// Pass the syncIt function through workflowArgs
			// The workflow can access this function and call it with a writeFile implementation
			const workflowArgsWithSync: {
				outputDir: string;
				projectName: string;
				syncIt: typeof syncIt;
			} = {
				outputDir,
				projectName,
				// Add syncIt as a custom property - the workflow implementation can use this
				syncIt,
			};

			const result = await runWorkflowForJob(
				"docs-to-site",
				workflowConfig,
				{ ...workflowArgsWithSync, killSandbox },
				customLogger,
			);

			await processWorkflowResult(context, result, getSandboxId(), githubUrl);

			// Job handlers must return void
			context.log("completed", { integrationId });
		} catch (error) {
			handleJobError(context, error, "process integration for docs-to-docusaurus", { integrationId });
		}
	}

	/**
	 * Extract job steps from document front matter
	 */
	function extractJobStepsFromContent(content: string, docJrn: string): Array<JobStep> | undefined {
		try {
			const sections = parseSections(content);
			const frontMatterSection = sections.find(s => s.isFrontMatter);
			if (!frontMatterSection?.frontMatter) {
				return;
			}
			const fm = frontMatterSection.frontMatter as JolliScriptFrontMatter;
			if (fm.job?.steps && Array.isArray(fm.job.steps)) {
				log.debug({ docJrn, stepCount: fm.job.steps.length }, "Found job steps in front matter");
				return fm.job.steps;
			}
			/* v8 ignore start - defensive catch for malformed markdown */
		} catch (error) {
			log.warn({ docJrn, error: String(error) }, "Failed to parse front matter for job steps");
		}
		return;
		/* v8 ignore stop */
	}

	/**
	 * Execute article editing tools for the JolliScript workflow
	 * Uses suggestion mode to create drafts for review instead of direct edits
	 */
	async function executeArticleTool(call: ToolCall, runState: RunState, articleId: string): Promise<string> {
		switch (call.name) {
			case "get_current_article":
				return await executeGetCurrentArticleTool(undefined, articleId, docDraftDao, docDao);
			case "create_article":
				return await executeCreateArticleTool(
					undefined,
					articleId,
					call.arguments as { content: string },
					docDraftDao,
					0, // System user ID for job-initiated edits
					docDao,
				);
			case "edit_section":
				log.info("Executing edit_section with suggestion mode for article %s", articleId);
				return await executeEditSectionTool(
					undefined,
					articleId,
					call.arguments as { sectionTitle: string; newContent: string },
					docDraftDao,
					0, // System user ID for job-initiated edits (unused in article suggestion mode)
					docDao,
					docDraftSectionChangesDao, // Enable suggestion mode
					userDao, // For looking up article owner
				);
			case "create_section":
				log.info("Executing create_section with suggestion mode for article %s", articleId);
				return await executeCreateSectionTool(
					undefined,
					articleId,
					call.arguments as { sectionTitle: string; content: string; insertAfter: string },
					docDraftDao,
					0, // System user ID for job-initiated edits (unused in article suggestion mode)
					docDao,
					docDraftSectionChangesDao, // Enable suggestion mode
					userDao, // For looking up article owner
				);
			case "delete_section":
				log.info("Executing delete_section with suggestion mode for article %s", articleId);
				return await executeDeleteSectionTool(
					undefined,
					articleId,
					call.arguments as { sectionTitle: string },
					docDraftDao,
					0, // System user ID for job-initiated edits (unused in article suggestion mode)
					docDao,
					docDraftSectionChangesDao, // Enable suggestion mode
					userDao, // For looking up article owner
				);
			case "get_latest_linear_tickets":
				return await executeGetLatestLinearTicketsTool(
					call.arguments as GetLatestLinearTicketsArgs | undefined,
				);
			case "sync_up_article":
				// sync_up_article reads a file from the E2B sandbox and saves it to the database
				return await executeSyncUpArticleTool(call.arguments as SyncUpArticleArgs, runState, docDao);
			default:
				return `Unknown article editing tool: ${call.name}`;
		}
	}

	async function runJolliScriptJobHandler(params: RunJolliScriptParams, context: JobContext): Promise<void> {
		const { docJrn, killSandbox = false } = params;
		const syncUp = false;
		const syncDown = false;
		context.log("starting", { docJrn });
		log.info({ docJrn, killSandbox }, "runJolliScriptJobHandler starting");

		try {
			await updateJobPhase(context, "initializing", 0, docJrn, { docJrn });
			log.debug({ docJrn }, "Phase: initializing");

			const doc = await docDao.readDoc(docJrn);
			log.debug({ docJrn, docFound: !!doc, contentLength: doc?.content?.length }, "Doc lookup result");
			if (!doc) {
				context.log("doc-not-found", { docJrn });
				throw new Error(`Document ${docJrn} not found`);
			}
			if (!doc.content || doc.content.trim().length === 0) {
				context.log("doc-no-content", { docJrn });
				throw new Error(`Document ${docJrn} has no content to process`);
			}

			await updateJobPhase(context, "preparing-workflow", 10, docJrn, { docJrn });

			// Get GitHub token and repo details from first active integration (similar to CollabConvoRouter)
			let githubToken: string | undefined;
			let githubOrg: string | undefined;
			let githubRepo: string | undefined;
			let githubBranch: string | undefined;
			try {
				const integrations = await integrationsManager.listIntegrations();
				context.log("found-integrations", {
					count: integrations.length,
					integrations: integrations.map(i => `${i.name} (type=${i.type}, status=${i.status})`).join(", "),
				});

				const activeGithubIntegration = integrations.find(i => i.type === "github" && i.status === "active");

				if (activeGithubIntegration) {
					const gh = await getAccessTokenForGithubRepoIntegration(activeGithubIntegration, true);

					// Handle the case where gh might be undefined (e.g., in tests)
					if (gh) {
						githubToken = gh.accessToken;
						githubOrg = gh.owner;
						githubRepo = gh.repo;
						// Get branch from metadata if available
						const metadata = activeGithubIntegration.metadata as { branch?: string };
						githubBranch = metadata?.branch || "main";
					}

					/* v8 ignore start - debug logging */
					const tokenPreview = githubToken
						? `${githubToken.substring(0, 8)}...${githubToken.substring(githubToken.length - 4)}`
						: "undefined";
					context.log("using-github-token", {
						integration: activeGithubIntegration.name,
						repo: githubOrg && githubRepo ? `${githubOrg}/${githubRepo}` : "unknown",
						branch: githubBranch || "main",
						tokenPreview,
						tokenLength: githubToken?.length || 0,
					});
					/* v8 ignore stop */
				} else {
					context.log("no-github-integration");
				}
			} catch (error) {
				context.log("github-token-error", { error: String(error) });
				log.error(error, "Failed to get GitHub token from integration");
			}

			log.debug({ docJrn, hasGithubToken: !!githubToken }, "Getting workflow config");
			const workflowConfig = getWorkflowConfig(githubToken);
			log.debug(
				{ docJrn, hasE2bApiKey: !!workflowConfig.e2bApiKey, hasAnthropicKey: !!workflowConfig.anthropicApiKey },
				"Workflow config obtained",
			);

			await updateJobPhase(context, "starting-sandbox", 20, docJrn, { docJrn });

			// Create logger that captures sandbox IDs
			const { logger: customLogger, getSandboxId } = createSandboxCapturingLogger(context, docJrn, docJrn);

			const metadataTitle = doc.contentMetadata?.title?.trim();
			const sanitizedJrn = docJrn.replace(/[^a-zA-Z0-9._-]/g, "_");
			const filename =
				metadataTitle && metadataTitle.length > 0 ? `${metadataTitle}.md` : `${sanitizedJrn || "doc"}.md`;

			// TODO: Implement syncUp functionality to upload files to sandbox before workflow starts
			// Currently only syncDown is implemented (saving generated files back to DocDao after workflow)
			/* v8 ignore start - syncUp is currently hardcoded to false */
			if (syncUp) {
				context.log("sync-up-not-implemented", { syncUp });
			}
			/* v8 ignore stop */

			// Create syncIt function for JolliScript output (only if syncDown is true)
			const syncIt = syncDown ? createJolliScriptSyncIt(context) : undefined;

			// Create article editing tools for this specific document
			// This allows the jolliscript to edit its own article content
			const articleId = docJrn; // The JRN is the article ID
			const articleEditingTools = [
				createGetCurrentArticleToolDefinition(undefined, articleId),
				createCreateArticleToolDefinition(undefined, articleId),
				createEditSectionToolDefinition(undefined, articleId),
				createCreateSectionToolDefinition(undefined, articleId),
				createDeleteSectionToolDefinition(undefined, articleId),
				createGetLatestLinearTicketsToolDefinition(),
				createSyncUpArticleToolDefinition(),
			];

			context.log("created-editing-tools", { count: articleEditingTools.length, articleId });

			// Create tool executor for article editing tools
			// Accepts runState so tools like sync_up_article can access the E2B sandbox
			const articleToolExecutor = (call: ToolCall, runState: RunState): Promise<string> => {
				context.log("executing-tool", { name: call.name });
				return executeArticleTool(call, runState, articleId);
			};

			// Extract job steps from front matter if present
			const jobSteps = extractJobStepsFromContent(doc.content as string, docJrn);
			/* v8 ignore start - logging when job steps are found in front matter */
			if (jobSteps) {
				context.log("found-job-steps", { count: jobSteps.length, docJrn });
			}
			/* v8 ignore stop */

			const workflowArgs: Record<string, unknown> = {
				markdownContent: doc.content,
				filename,
				killSandbox,
				additionalTools: articleEditingTools,
				additionalToolExecutor: articleToolExecutor,
				// Pass GitHub details for pre-checkout if available
				githubOrg,
				githubRepo,
				githubBranch,
				// Pass job steps if present
				jobSteps,
			};

			// Verify document has job steps in front matter (prompts come from run_prompt steps)
			if (!jobSteps || jobSteps.length === 0) {
				context.log("no-job-steps", { docJrn });
				throw new Error(
					`Document ${docJrn} does not contain any job steps in front matter. Add job.steps to define the workflow.`,
				);
			}
			log.debug({ docJrn, stepCount: jobSteps.length }, "Document has job steps");

			// Only add syncIt and syncItPhase if syncDown is true
			/* v8 ignore start - syncDown is currently hardcoded to false */
			if (syncDown && syncIt) {
				workflowArgs.syncIt = syncIt;
				workflowArgs.syncItPhase = "after";
			}
			/* v8 ignore stop */

			log.info({ docJrn }, "Calling runWorkflowForJob");
			context.log("calling-workflow", { docJrn });
			const result = await runWorkflowForJob("run-jolliscript", workflowConfig, workflowArgs, customLogger);
			log.info({ docJrn, success: result.success, error: result.error }, "runWorkflowForJob returned");

			/* v8 ignore start - workflow failure logging only occurs when runWorkflowForJob fails */
			if (!result.success) {
				context.log("workflow-failed", { docJrn, error: result.error });
			}
			/* v8 ignore stop */

			await processWorkflowResult(context, result, getSandboxId(), docJrn, { docJrn });

			context.log("completed", { docJrn });
		} catch (error) {
			handleJobError(context, error, "run-jolliscript workflow", { docJrn });
		}
	}

	function registerJobs(jobScheduler: JobScheduler): void {
		// Register the process-integration job
		const processIntegrationJob = jobDefinitionBuilder<ProcessIntegrationParams, KnowledgeGraphStats>()
			.category("knowledge-graph")
			.name("architecture")
			.title("Knowledge Graph Build")
			.description("Process a GitHub integration to generate knowledge graph data")
			.schema(ProcessIntegrationSchema)
			.statsSchema(KnowledgeGraphStatsSchema)
			.showInDashboard()
			.keepCardAfterCompletion()
			.triggerEvents([INTEGRATIONS_GITHUB_CREATED_EVENT])
			.triggerEventParamsConverter(githubIntegrationToProcessIntegrationParamsConverter)
			.handler(processIntegrationJobHandler)
			.build();

		jobScheduler.registerJob(processIntegrationJob);

		// Register the code-to-api-articles job (generate API docs only, no architecture, no deploy)
		const codeToApiArticlesJob = jobDefinitionBuilder<ProcessIntegrationParams, KnowledgeGraphStats>()
			.category("knowledge-graph")
			.name("code-to-api-articles")
			.title("Code 2 API Articles")
			.description("Generate API articles from code (code2docusaurus), persist to Doc DB")
			.schema(ProcessIntegrationSchema)
			.statsSchema(KnowledgeGraphStatsSchema)
			.showInDashboard()
			.keepCardAfterCompletion()
			.handler(codeToApiArticleJobHandler)
			.build();

		jobScheduler.registerJob(codeToApiArticlesJob);

		// Register the docs-to-docusaurus job
		const docsToDocusaurusJob = jobDefinitionBuilder<ProcessIntegrationParams, KnowledgeGraphStats>()
			.category("knowledge-graph")
			.name("docs-to-docusaurus")
			.title("Docs to Docusaurus")
			.description("Convert documentation from GitHub repository to Docusaurus format")
			.schema(ProcessIntegrationSchema)
			.statsSchema(KnowledgeGraphStatsSchema)
			.showInDashboard()
			.keepCardAfterCompletion()
			.handler(docToDocusaurusJobHandler)
			.build();

		jobScheduler.registerJob(docsToDocusaurusJob);

		const runJolliScriptJob = jobDefinitionBuilder<RunJolliScriptParams, KnowledgeGraphStats>()
			.category("knowledge-graph")
			.name("run-jolliscript")
			.title("Run JolliScript Workflow")
			.description("Execute the run-jolliscript workflow for stored DocDao markdown content")
			.schema(RunJolliScriptSchema)
			.statsSchema(KnowledgeGraphStatsSchema)
			.showInDashboard()
			.keepCardAfterCompletion()
			.handler(runJolliScriptJobHandler)
			.triggerEvents(["github:push:trigger-jolliscript"])
			.triggerEventParamsConverter(githubPushToRunJolliScriptParamsConverter)
			.build();

		jobScheduler.registerJob(runJolliScriptJob);

		const gitPushEventJob = jobDefinitionBuilder<GithubPushSchemaParams>()
			.category("knowledge-graph")
			.name("git-push-event")
			.title("Git Push Event")
			.description("Process git push events from GitHub")
			.schema(GithubPushSchema)
			.triggerEvents([GITHUB_PUSH])
			.shouldTriggerEvent(shouldTriggerGithubPushJob)
			.handler(githubPushJobHandler)
			.build();

		jobScheduler.registerJob(gitPushEventJob);

		log.debug("Knowledge graph jobs registered");
	}

	async function queueJobs(_jobScheduler: JobScheduler): Promise<void> {
		// For now, we don't queue any jobs automatically
		// Jobs will be queued on-demand when needed
		log.debug("Knowledge graph jobs ready for on-demand execution");
		await Promise.resolve();
	}

	return {
		registerJobs,
		queueJobs,
	};
}
