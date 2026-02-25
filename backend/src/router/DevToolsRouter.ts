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
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler.js";
import { createSectionPathService } from "../services/SectionPathService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { getForwardedHost } from "../util/RequestUtil";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Router } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

export interface DevToolsRouterOptions {
	// Single-tenant mode: use jobScheduler directly
	// Multi-tenant mode: use schedulerManager to get per-context scheduler
	jobScheduler?: JobScheduler | undefined;
	schedulerManager: MultiTenantJobSchedulerManager;
	docDaoProvider: DaoProvider<DocDao>;
	docDraftDaoProvider: DaoProvider<DocDraftDao>;
	docDraftSectionChangesDaoProvider: DaoProvider<DocDraftSectionChangesDao>;
	collabConvoDaoProvider: DaoProvider<CollabConvoDao>;
	siteDaoProvider: DaoProvider<SiteDao>;
	jobDaoProvider: DaoProvider<JobDao>;
	integrationDaoProvider: DaoProvider<IntegrationDao>;
	gitHubInstallationDaoProvider: DaoProvider<GitHubInstallationDao>;
	syncArticleDaoProvider: DaoProvider<SyncArticleDao>;
	spaceDaoProvider: DaoProvider<SpaceDao>;
	tokenUtil: TokenUtil<UserInfo>;
}

/**
 * Creates a router for developer tools endpoints
 */
export function createDevToolsRouter(options: DevToolsRouterOptions): Router {
	const router = express.Router();
	const {
		jobScheduler,
		schedulerManager,
		docDaoProvider,
		docDraftDaoProvider,
		docDraftSectionChangesDaoProvider,
		collabConvoDaoProvider,
		siteDaoProvider,
		jobDaoProvider,
		integrationDaoProvider,
		gitHubInstallationDaoProvider,
		syncArticleDaoProvider,
		spaceDaoProvider,
		tokenUtil,
	} = options;

	// Helper to get the scheduler for the current request context
	// In single-tenant mode, use the direct jobScheduler
	// In multi-tenant mode, use schedulerManager.getSchedulerForContext()
	async function getScheduler(): Promise<JobScheduler | TenantOrgJobScheduler | undefined> {
		if (jobScheduler) {
			return jobScheduler;
		}
		return await schedulerManager.getSchedulerForContext();
	}

	// Helper to get DAOs with tenant context
	function getDocDao(): DocDao {
		return docDaoProvider.getDao(getTenantContext());
	}
	function getDocDraftDao(): DocDraftDao {
		return docDraftDaoProvider.getDao(getTenantContext());
	}
	function getDocDraftSectionChangesDao(): DocDraftSectionChangesDao {
		return docDraftSectionChangesDaoProvider.getDao(getTenantContext());
	}
	function getCollabConvoDao(): CollabConvoDao {
		return collabConvoDaoProvider.getDao(getTenantContext());
	}
	function getSiteDao(): SiteDao {
		return siteDaoProvider.getDao(getTenantContext());
	}
	function getJobDao(): JobDao {
		return jobDaoProvider.getDao(getTenantContext());
	}
	function getIntegrationDao(): IntegrationDao {
		return integrationDaoProvider.getDao(getTenantContext());
	}
	function getGitHubInstallationDao(): GitHubInstallationDao {
		return gitHubInstallationDaoProvider.getDao(getTenantContext());
	}
	function getSyncArticleDao(): SyncArticleDao {
		return syncArticleDaoProvider.getDao(getTenantContext());
	}
	function getSpaceDao(): SpaceDao {
		return spaceDaoProvider.getDao(getTenantContext());
	}

	/**
	 * GET /api/dev-tools/info
	 * Returns developer tools configuration and status
	 */
	router.get("/info", (_req, res) => {
		try {
			const config = getConfig();

			if (!config.USE_DEVELOPER_TOOLS) {
				return res.json({
					enabled: false,
					githubAppCreatorEnabled: false,
					jobTesterEnabled: false,
					dataClearerEnabled: false,
				});
			}

			// Build the default GitHub App manifest
			const smeeUrl = config.SMEE_API_URL || "";
			const origin = config.ORIGIN;
			const defaultManifest = {
				name: config.DEV_TOOLS_GITHUB_APP_NAME ?? `jolli-${process.env.PSTORE_ENV}`,
				url: origin,
				hook_attributes: {
					url: smeeUrl,
					active: smeeUrl !== "",
				},
				redirect_url: `${origin}/devtools?view=github-app-callback`,
				setup_url: `${origin}/api/github/installation/callback`,
				public: false,
				default_permissions: {
					contents: "read",
					metadata: "read",
				},
				default_events: ["meta", "create", "delete", "push", "release", "repository"],
			};

			return res.json({
				enabled: true,
				githubAppCreatorEnabled: config.USE_DEV_TOOLS_GITHUB_APP_CREATED,
				// Demo jobs tester requires both USE_DEV_TOOLS_JOB_TESTER and ENABLE_DEMO_JOBS
				jobTesterEnabled: config.USE_DEV_TOOLS_JOB_TESTER && config.ENABLE_DEMO_JOBS,
				dataClearerEnabled: config.USE_DEV_TOOLS_DATA_CLEARER,
				draftGeneratorEnabled: true,
				githubApp: {
					defaultOrg: "jolliai",
					defaultManifest,
				},
			});
		} catch (error) {
			log.error(error, "Error getting dev tools info");
			return res.status(500).json({ error: "internal_server_error" });
		}
	});

	/**
	 * GET /api/dev-tools/github-app/callback
	 * Handles the GitHub App manifest callback and exchanges the code for app details
	 */
	router.get("/github-app/callback", async (req, res) => {
		try {
			const config = getConfig();

			if (!config.USE_DEVELOPER_TOOLS) {
				return res.status(403).json({ error: "developer_tools_disabled" });
			}

			const { code } = req.query;

			if (!code || typeof code !== "string") {
				log.warn("Missing or invalid code in GitHub App callback");
				return res.status(400).json({ error: "missing_code" });
			}

			// Exchange the code for the app configuration
			// https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest#3-you-exchange-the-temporary-code-to-retrieve-the-app-configuration
			const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
				method: "POST",
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});

			if (!response.ok) {
				const errorText = await response.text();
				log.error({ status: response.status, error: errorText }, "Failed to exchange manifest code");
				return res.status(500).json({ error: "github_api_error" });
			}

			const appData = await response.json();

			// Format the app data into the structure expected by GITHUB_APPS_INFO
			const githubAppInfo = {
				app_id: appData.id,
				slug: appData.slug,
				client_id: appData.client_id,
				client_secret: appData.client_secret,
				webhook_secret: appData.webhook_secret,
				private_key: appData.pem,
				name: appData.name,
				html_url: appData.html_url,
				created_at: appData.created_at,
				updated_at: appData.updated_at,
			};

			// Return the formatted JSON as a single-line string
			const configJson = JSON.stringify(githubAppInfo);

			log.info({ appName: appData.name, appId: appData.id }, "Successfully created GitHub App via manifest");

			return res.json({
				success: true,
				config: configJson,
				appInfo: {
					name: appData.name,
					htmlUrl: appData.html_url,
				},
			});
		} catch (error) {
			log.error(error, "Error handling GitHub App manifest callback");
			return res.status(500).json({ error: "internal_server_error" });
		}
	});

	/**
	 * POST /api/dev-tools/trigger-demo-job
	 * Triggers a demo job for testing dashboard widgets
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This endpoint is being removed
	router.post("/trigger-demo-job", async (req, res) => {
		try {
			const config = getConfig();

			if (!config.USE_DEVELOPER_TOOLS) {
				return res.status(403).json({ error: "developer_tools_disabled" });
			}

			const { jobName, params } = req.body as { jobName?: string; params?: unknown };

			if (!jobName || typeof jobName !== "string") {
				log.warn("Missing or invalid jobName in trigger demo job request");
				return res.status(400).json({ error: "missing_job_name" });
			}

			// Validate that this is a demo job
			if (!jobName.startsWith("demo:")) {
				log.warn({ jobName }, "Attempted to trigger non-demo job via demo endpoint");
				return res.status(400).json({ error: "invalid_job_name" });
			}

			// Get the scheduler for the current context
			const scheduler = await getScheduler();
			if (!scheduler) {
				log.warn("No job scheduler available for demo job trigger");
				return res.status(503).json({ error: "job_scheduler_unavailable" });
			}

			// Special-case mapping: run end2end flow triggers knowledge-graph processing
			if (jobName === "demo:run-end2end-flow") {
				const integrationIdRaw = (params as { integrationId?: unknown })?.integrationId;
				const jrnPrefixRaw = (params as { jrnPrefix?: unknown })?.jrnPrefix;
				const integrationId = Number.parseInt(String(integrationIdRaw), 10);
				if (Number.isNaN(integrationId)) {
					log.warn({ integrationId: integrationIdRaw }, "Invalid integration ID for end2end flow");
					return res.status(400).json({ error: "invalid_integration_id" });
				}

				const forwardParams: { integrationId: number; jrnPrefix?: string } = { integrationId };
				if (typeof jrnPrefixRaw === "string" && jrnPrefixRaw.trim() !== "") {
					forwardParams.jrnPrefix = jrnPrefixRaw;
				}

				const result = await scheduler.queueJob({
					name: "knowledge-graph:architecture",
					params: forwardParams,
					options: { priority: "normal" },
				});
				log.info(
					{ jobId: result.jobId, jobName, integrationId },
					"Triggered knowledge-graph job from end2end flow",
				);
				return res.json({ ...result, mappedFrom: jobName });
			}

			// Special-case mapping: API Articles generation (code2docusaurus only)
			if (jobName === "demo:code-to-api-articles") {
				const integrationIdRaw = (params as { integrationId?: unknown })?.integrationId;
				const jrnPrefixRaw = (params as { jrnPrefix?: unknown })?.jrnPrefix;
				const integrationId = Number.parseInt(String(integrationIdRaw), 10);
				if (Number.isNaN(integrationId)) {
					log.warn({ integrationId: integrationIdRaw }, "Invalid integration ID for code-to-api-articles");
					return res.status(400).json({ error: "invalid_integration_id" });
				}

				const forwardParams: { integrationId: number; jrnPrefix?: string } = { integrationId };
				if (typeof jrnPrefixRaw === "string" && jrnPrefixRaw.trim() !== "") {
					forwardParams.jrnPrefix = jrnPrefixRaw;
				}

				const result = await scheduler.queueJob({
					name: "knowledge-graph:code-to-api-articles",
					params: forwardParams,
					options: { priority: "normal" },
				});
				log.info(
					{ jobId: result.jobId, jobName, integrationId },
					"Triggered knowledge-graph code-to-api-articles job from demo endpoint",
				);
				return res.json({ ...result, mappedFrom: jobName });
			}

			// Special-case mapping: Run JolliScript
			if (jobName === "demo:run-jolliscript") {
				const typedParams = params as {
					docJrn?: unknown;
					syncUp?: unknown;
					syncDown?: unknown;
					useUpdatePrompt?: unknown;
				};
				const docJrnRaw = typedParams?.docJrn;
				if (typeof docJrnRaw !== "string" || docJrnRaw.trim() === "") {
					log.warn({ docJrn: docJrnRaw }, "Invalid or missing docJrn for run-jolliscript");
					return res.status(400).json({ error: "invalid_doc_arn" });
				}

				// Extract optional boolean params with defaults
				const syncUp = typeof typedParams.syncUp === "boolean" ? typedParams.syncUp : true;
				const syncDown = typeof typedParams.syncDown === "boolean" ? typedParams.syncDown : true;
				const useUpdatePrompt =
					typeof typedParams.useUpdatePrompt === "boolean" ? typedParams.useUpdatePrompt : false;

				const result = await scheduler.queueJob({
					name: "knowledge-graph:run-jolliscript",
					params: { docJrn: docJrnRaw, syncUp, syncDown, useUpdatePrompt },
					options: { priority: "normal" },
				});
				log.info(
					{ jobId: result.jobId, jobName, docJrn: docJrnRaw },
					"Triggered run-jolliscript job from demo endpoint",
				);
				return res.json({ ...result, mappedFrom: jobName });
			}

			// Default: queue the specified demo job
			const result = await scheduler.queueJob({ name: jobName, params: params ?? {} });

			log.info({ jobId: result.jobId, jobName }, "Triggered demo job");

			return res.json(result);
		} catch (error) {
			log.error(error, "Error triggering demo job");
			return res.status(500).json({ error: "internal_server_error" });
		}
	});

	/**
	 * POST /api/dev-tools/clear-data
	 * Clears various types of data for development/testing purposes
	 */
	router.post("/clear-data", async (req, res) => {
		try {
			const config = getConfig();

			if (!config.USE_DEVELOPER_TOOLS) {
				return res.status(403).json({ error: "developer_tools_disabled" });
			}

			const { dataType } = req.body as { dataType?: string };

			if (!dataType) {
				log.warn("Missing or invalid dataType in clear data request");
				return res.status(400).json({ error: "missing_data_type" });
			}

			const validDataTypes = ["articles", "sites", "jobs", "github", "sync", "spaces"];
			if (!validDataTypes.includes(dataType)) {
				log.warn({ dataType }, "Invalid dataType in clear data request");
				return res.status(400).json({ error: "invalid_data_type" });
			}

			// Validation: check for active jobs before clearing jobs
			if (dataType === "jobs") {
				const activeJobs = await getJobDao().listJobExecutions({ status: "active" });
				if (activeJobs.length > 0) {
					log.warn({ count: activeJobs.length }, "Cannot clear jobs while jobs are active");
					return res.status(400).json({
						error: "jobs_running",
						message: `Cannot clear jobs while ${activeJobs.length} job(s) are still active`,
					});
				}
			}

			let message = "";

			switch (dataType) {
				case "articles":
					await getCollabConvoDao().deleteAllCollabConvos();
					await getDocDraftDao().deleteAllDocDrafts();
					await getDocDao().deleteAllDocs();
					message = "All articles cleared successfully";
					break;
				case "sites":
					await getSiteDao().deleteAllSites();
					message = "All sites cleared successfully";
					break;
				case "jobs":
					await getJobDao().deleteAllJobs();
					message = "All job executions cleared successfully";
					break;
				case "github":
					await getIntegrationDao().removeAllGitHubIntegrations();
					await getGitHubInstallationDao().deleteAllInstallations();
					message = "All GitHub integrations and installations cleared successfully";
					break;
				case "sync":
					await getSyncArticleDao().deleteAllSyncArticles();
					message = "All sync data cleared successfully";
					break;
				case "spaces":
					await getCollabConvoDao().deleteAllCollabConvos();
					await getDocDraftDao().deleteAllDocDrafts();
					await getDocDao().deleteAllDocs();
					await getSpaceDao().deleteAllSpaces();
					message = "All spaces and their content cleared successfully";
					break;
			}

			log.info({ dataType }, "Data cleared successfully");

			return res.json({
				success: true,
				deletedCount: 0,
				message,
			});
		} catch (error) {
			log.error(error, "Error clearing data");
			return res.status(500).json({ error: "internal_server_error" });
		}
	});

	/**
	 * Helper to create a proposed section change
	 */
	function createProposedChange(
		changeType: "update" | "insert-after",
		section: { title: string | null; content: string },
		changeIndex: number,
	): Array<{
		for: "content";
		who: { type: "agent"; id: number };
		description: string;
		value: string;
		appliedAt: undefined;
	}> {
		/* v8 ignore next - preamble sections without title use default description */
		const sectionTitle = section.title || "this section";
		if (changeType === "update") {
			return [
				{
					for: "content" as const,
					who: { type: "agent" as const, id: 1 },
					description: `Description for change ${changeIndex}: Update section ${sectionTitle} with new content`,
					value: `Here is content to update section ${sectionTitle} with.\n\n- Bullet point 1\n- Bullet point 2\n- Bullet point 3`,
					appliedAt: undefined,
				},
			];
		}
		// insert-after
		return [
			{
				for: "content" as const,
				who: { type: "agent" as const, id: 1 },
				description: `Description for change ${changeIndex}: Insert new content after section ${sectionTitle}`,
				value: `Here is content to insert after section ${sectionTitle}.\n\n1. Numbered point 1\n2. Numbered point 2\n3. Numbered point 3`,
				appliedAt: undefined,
			},
		];
	}

	/**
	 * Helper function to look up an article by JRN, with URL-decoding fallback
	 */
	async function findArticleByJrn(jrn: string) {
		let article = await getDocDao().readDoc(jrn);
		if (!article) {
			// Try URL-decoding the JRN in case it was encoded (e.g., from browser address bar)
			try {
				const decodedJrn = decodeURIComponent(jrn);
				if (decodedJrn !== jrn) {
					article = await getDocDao().readDoc(decodedJrn);
					if (article) {
						log.info("Found article using decoded JRN: %s -> %s", jrn, decodedJrn);
					}
				}
			} catch {
				// Invalid URL encoding, ignore
			}
		}
		return article;
	}

	/**
	 * Helper function to filter out preamble and H1 sections from parsed sections
	 */
	function getContentSections(
		sections: Array<{ id: string; title: string | null; content: string }>,
		articleContent: string,
	) {
		return sections.filter(section => {
			// Skip preamble (null title)
			if (!section.title) {
				return false;
			}
			// Skip H1 sections (they're usually the article title)
			// We can detect H1 by checking if the section title appears in the markdown with "# " prefix
			const h1Pattern = new RegExp(`^# ${section.title}$`, "m");
			return !h1Pattern.test(articleContent);
		});
	}

	/**
	 * Helper function to create section changes for a draft
	 */
	async function createSectionChanges(params: {
		numEdits: number;
		contentSections: Array<{ id: string; title: string | null; content: string }>;
		contentSectionIndices: Array<number>;
		draftId: number;
		docId: number;
	}) {
		const { numEdits, contentSections, contentSectionIndices, draftId, docId } = params;
		const changeTypes = ["update", "insert-after", "update"] as const;

		for (let i = 0; i < numEdits; i++) {
			// If we have content sections available, use them
			// Otherwise, use the last content section for insert-after changes
			const hasContentSection = i < contentSections.length;
			const section = hasContentSection ? contentSections[i] : contentSections[contentSections.length - 1];
			const sectionIndex = hasContentSection
				? contentSectionIndices[i]
				: contentSectionIndices[contentSectionIndices.length - 1];

			// If we've run out of sections, force insert-after changes
			const changeType = hasContentSection ? changeTypes[i % changeTypes.length] : "insert-after";

			const proposed = createProposedChange(changeType, section, i + 1);

			// Create section change with both path (for backward compatibility) and section ID
			await getDocDraftSectionChangesDao().createDocDraftSectionChanges({
				draftId,
				docId,
				changeType,
				path: `/sections/${sectionIndex}`,
				sectionId: section.id, // Use the stable section ID
				baseContent: section.content, // Store base content for merge
				content: section.content,
				proposed,
				comments: [],
				applied: false,
				dismissed: false,
			});
		}
	}

	/**
	 * POST /api/dev-tools/generate-draft-with-edits
	 * Generates a draft with sample section edit suggestions
	 */
	router.post("/generate-draft-with-edits", async (req, res) => {
		try {
			const config = getConfig();

			if (!config.USE_DEVELOPER_TOOLS) {
				return res.status(403).json({ error: "developer_tools_disabled" });
			}

			const { docJrn, numEdits = 2 } = req.body;

			// Validate input
			if (!docJrn) {
				return res.status(400).json({ error: "docJrn is required" });
			}

			if (numEdits < 1 || numEdits > 5) {
				return res.status(400).json({ error: "numEdits must be between 1 and 5" });
			}

			// Look up the article
			const article = await findArticleByJrn(docJrn);
			if (!article) {
				return res.status(404).json({ error: `Article not found with JRN: ${docJrn}` });
			}
			const docId = article.id;
			log.info("Found article %s (id: %d) for draft generation", article.jrn, docId);

			// Use the actual article content instead of hard-coded sample
			const sampleContent = article.content;

			// Create section path service and parse sections with IDs
			const sectionPathService = createSectionPathService();
			const { sections, mapping: sectionIdMapping } = sectionPathService.parseSectionsWithIds(sampleContent);

			// Create the draft with section ID mapping
			// Use the article's title if available, otherwise fall back to a descriptive name
			const draftTitle = article.contentMetadata?.title ?? `Draft for ${article.jrn}`;
			// Attribute the draft to the logged-in user when available; fallback to a devtools user (1)
			// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
			const createdBy = req.orgUser?.id ?? tokenUtil.decodePayload(req)?.userId ?? 1;

			const draft = await getDocDraftDao().createDocDraft({
				title: draftTitle,
				content: sampleContent,
				docId,
				createdBy,
				contentMetadata: {
					sectionIds: sectionIdMapping,
				},
			});

			// Find H2+ sections (skip preamble and H1 title)
			const contentSections = getContentSections(sections, sampleContent);

			// Map content sections back to their original indices in the sections array
			const contentSectionIndices: Array<number> = [];
			for (let i = 0; i < sections.length; i++) {
				const section = sections[i];
				if (section.title && !new RegExp(`^# ${section.title}$`, "m").test(sampleContent)) {
					contentSectionIndices.push(i);
				}
			}

			// Ensure we have at least one content section to work with
			if (contentSections.length === 0) {
				return res.status(400).json({
					success: false,
					error: "Article must have at least one section to generate draft edits",
				});
			}

			// Generate section changes
			/* v8 ignore next - draft.docId should always be set, fallback is defensive */
			const draftDocId = draft.docId ?? docId; // Draft should have docId, fallback to original
			await createSectionChanges({
				numEdits,
				contentSections,
				contentSectionIndices,
				draftId: draft.id,
				docId: draftDocId,
			});

			log.info({ draftId: draft.id, numEdits }, "Generated draft with section edits");

			return res.json({
				success: true,
				draftId: draft.id,
				message: `Created draft "${draftTitle}" with ${numEdits} section edit suggestions`,
			});
		} catch (error) {
			log.error(error, "Error generating draft with edits");
			return res.status(500).json({ error: "internal_server_error" });
		}
	});

	/**
	 * POST /api/dev-tools/reload-config
	 * Reloads configuration from all providers (AWS Parameter Store, Vercel, local env)
	 * and clears tenant-specific config caches
	 */
	router.post("/reload-config", async (_req, res) => {
		try {
			const config = getConfig();

			if (!config.USE_DEVELOPER_TOOLS) {
				return res.status(403).json({ error: "developer_tools_disabled" });
			}

			// Reload config from all providers (AWS Parameter Store, Vercel, local env)
			await reloadConfig();
			// Clear tenant-specific config caches so they get rebuilt on next request
			clearTenantConfigCache();

			log.info("Configuration reloaded via DevTools");

			return res.json({
				success: true,
				message: "Configuration reloaded successfully",
			});
		} catch (error) {
			log.error(error, "Error reloading configuration");
			return res.status(500).json({ error: "internal_server_error" });
		}
	});

	// Note: The /redirect endpoint is now in createDevToolsRedirectRouter()
	// which is mounted separately without authentication.

	return router;
}

/**
 * Creates a router for the dev-tools redirect endpoint.
 * This is separate from the main DevToolsRouter because it needs to be
 * unauthenticated (to redirect users before they log in).
 */
export function createDevToolsRedirectRouter(): Router {
	const router = express.Router();

	/**
	 * GET /redirect
	 * Returns redirect information for development domain.
	 * This endpoint is unauthenticated and works regardless of USE_DEVELOPER_TOOLS setting.
	 * Only returns redirect info when:
	 * - NODE_ENV is not "production"
	 * - Request is directly to localhost (not through nginx gateway with non-localhost domain)
	 * - Request hostname is "localhost"
	 */
	router.get("/redirect", (req, res) => {
		const config = getConfig();

		// Only works in non-production environments
		if (config.NODE_ENV === "production") {
			return res.json({ redirectTo: null });
		}

		// Check the effective hostname (X-Forwarded-Host takes precedence for gateway detection)
		const forwardedHost = getForwardedHost(req);
		const host = req.headers.host || "";
		const hostname = host.split(":")[0];

		// If X-Forwarded-Host is set to a non-localhost domain, we're coming through a gateway
		// and should not redirect (would cause a loop)
		if (forwardedHost) {
			const forwardedHostname = forwardedHost.split(":")[0];
			if (forwardedHostname !== "localhost") {
				return res.json({ redirectTo: null });
			}
		}

		// Only redirect if on localhost (not already on tenant domain)
		if (hostname !== "localhost") {
			return res.json({ redirectTo: null });
		}

		// Return the base domain to redirect to
		// USE_GATEWAY determines protocol and port handling:
		// - USE_GATEWAY=true: HTTPS without port (via nginx gateway)
		// - USE_GATEWAY=false: HTTP with port (direct access)
		const useGateway = config.USE_GATEWAY;
		const baseDomain = config.BASE_DOMAIN;

		// Don't redirect if BASE_DOMAIN is not set or is localhost (would redirect to same host)
		if (!baseDomain || baseDomain === "localhost") {
			return res.json({ redirectTo: null });
		}

		if (useGateway) {
			return res.json({
				redirectTo: baseDomain,
				useHttps: true,
			});
		}

		const port = host.split(":")[1] || "8034";
		return res.json({
			redirectTo: baseDomain,
			useHttps: false,
			port,
		});
	});

	return router;
}
