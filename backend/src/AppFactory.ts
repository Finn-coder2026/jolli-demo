import "./util/Env";
import { version } from "../package.json";
import { createAuditMiddleware, createAuditService, setGlobalAuditService } from "./audit";
import { createMultiTenantConnectMiddleware, isAuthGateway, isMultiTenantAuthEnabled } from "./auth/AuthGateway";
import { createGrantConfig } from "./auth/AuthProvider";
import { runDevMigrations, shouldRunDevMigrations } from "./cli/DevMigrationRunner";
import { getConfig, initializeConfig } from "./config/Config";
import { connectProviderRegistry, createConnectRouter, GitHubConnectProvider } from "./connect";
import { createMultiAgentFromEnv } from "./core/agent";
import { createDatabase } from "./core/Database";
import type { ExitHandler } from "./index";
import { createIntegrationManager } from "./integrations/IntegrationsManager";
import { createCoreJobs } from "./jobs/CoreJobs.js";
import { createDemoJobs } from "./jobs/DemoJobs.js";
import { createJobEventEmitter } from "./jobs/JobEventEmitter.js";
import { createJobsToJrnAdapter } from "./jobs/JobsToJrnAdapter.js";
import { createKnowledgeGraphJobs } from "./jobs/KnowledgeGraphJobs.js";
import { createMultiTenantJobSchedulerManager } from "./jobs/MultiTenantJobSchedulerManager.js";
import { createAdminRouter } from "./router/AdminRouter";
import { createAuditRouter } from "./router/AuditRouter";
import { createAuthRouter } from "./router/AuthRouter";
import { createChatRouter } from "./router/ChatRouter";
import { createCollabConvoRouter } from "./router/CollabConvoRouter";
import { createConvoRouter } from "./router/ConvoRouter";
import { createDevToolsRedirectRouter, createDevToolsRouter } from "./router/DevToolsRouter";
import { createDocDraftRouter } from "./router/DocDraftRouter";
import { createDocHistoryRouter } from "./router/DocHistoryRouter";
import { createDocRouter } from "./router/DocRouter";
import { createDocsiteRouter } from "./router/DocsiteRouter";
import { createGitHubAppRouter } from "./router/GitHubAppRouter";
import { createImageRouter } from "./router/ImageRouter";
import { createIngestRouter } from "./router/IngestRouter";
import { createIntegrationRouter } from "./router/IntegrationRouter";
import { createJobRouter } from "./router/JobRouter.js";
import { createKnowledgeGraphRouter } from "./router/KnowledgeGraphRouter";
import { createMercureRouter } from "./router/MercureRouter";
import { createOrgRouter } from "./router/OrgRouter";
import { createSiteAuthRouter } from "./router/SiteAuthRouter";
import { createSiteRouter, validateGitHubOrgAccess } from "./router/SiteRouter";
import { createSpaceRouter } from "./router/SpaceRouter";
import { createStatusRouter } from "./router/StatusRouter";
import { createSyncRouter } from "./router/SyncRouter";
import { createTenantRouter } from "./router/TenantRouter";
import { createVisitRouter } from "./router/VisitRouter";
import { createWebhookRouter } from "./router/WebhookRouter";
import { createImageStorageService } from "./services/ImageStorageService";
import { createMultiTenantFromEnv } from "./tenant/MultiTenantSetup";
import type { TenantRegistryClient } from "./tenant/TenantRegistryClient";
import { createAuthHandler } from "./util/AuthHandler";
import { expressSessionHandler, issueVisitorCookie } from "./util/Cookies";
import { decryptDatabasePassword } from "./util/DecryptPassword";
import { getLog } from "./util/Logger";
import { getRequestHost, getRequestHostname, getRequestProtocol } from "./util/RequestUtil";
import { seedDocs } from "./util/SeedDocs";
import { createSequelize } from "./util/Sequelize";
import { startSmeeClient } from "./util/Smee";
import { createTokenUtilFromEnv } from "./util/TokenUtil";
import { createUserProvisioningMiddleware } from "./util/UserProvisioningMiddleware";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Express } from "express";
import express from "express";
import grant from "grant";
import type { UserInfo } from "jolli-common";
import morgan from "morgan";

const log = getLog(import.meta);

/**
 * Create a CORS origin validator function for gateway mode.
 * Validates that the request origin is from an allowed domain.
 */
function createCorsOriginValidator(
	baseDomain: string,
	allowLocalhostOrigin: boolean,
	configuredOrigin: string,
): (requestOrigin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) => void {
	return (requestOrigin, callback) => {
		// Allow requests with no origin (e.g., same-origin, curl)
		if (!requestOrigin) {
			callback(null, true);
			return;
		}
		try {
			const url = new URL(requestOrigin);
			const hostname = url.hostname;
			// Allow localhost origins when explicitly configured (for local dev with gateway mode)
			if (allowLocalhostOrigin && hostname === "localhost") {
				callback(null, true);
				return;
			}
			// Allow if hostname equals baseDomain, ends with .baseDomain, or equals admin.baseDomain
			if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`) || hostname === `admin.${baseDomain}`) {
				callback(null, true);
				return;
			}
		} catch {
			// Invalid URL, fall through to deny
		}
		// Also allow the configured ORIGIN for backwards compatibility
		if (requestOrigin === configuredOrigin) {
			callback(null, true);
			return;
		}
		callback(new Error("Not allowed by CORS"));
	};
}

/**
 * Check if a request path should bypass tenant middleware.
 * Returns true if the path is allowed without tenant context.
 */
function shouldBypassTenantMiddleware(
	path: string,
	hostname: string | undefined,
	baseDomain: string | undefined,
	nodeEnv: string,
): boolean {
	// Always allow /status without tenant context (health checks)
	if (path === "/status") {
		return true;
	}

	// In non-production, allow /dev-tools/redirect without tenant context
	if (nodeEnv !== "production" && path === "/dev-tools/redirect") {
		return true;
	}

	// Subdomain-specific path rules (only when baseDomain is configured)
	if (!baseDomain || !hostname) {
		return false;
	}

	// api.{baseDomain} → /admin/* only (bootstrap, etc. with HMAC auth)
	if (hostname === `api.${baseDomain}` && path.startsWith("/admin/")) {
		log.debug("allowing %s over api.%s", path, baseDomain);
		return true;
	}

	// auth.{baseDomain} → auth gateway paths only
	if (hostname === `auth.${baseDomain}`) {
		const authGatewayPaths = ["/auth/callback", "/auth/emails", "/auth/select-email", "/auth/gateway-info"];
		if (authGatewayPaths.includes(path)) {
			log.debug("allowing %s over auth.%s", path, baseDomain);
			return true;
		}
	}

	// connect.{baseDomain} → connect callbacks only
	if (hostname === `connect.${baseDomain}` && path.startsWith("/connect/") && path.includes("/callback")) {
		log.debug("allowing %s over connect.%s", path, baseDomain);
		return true;
	}

	return false;
}

/**
 * Create middleware for dynamic OAuth redirect_uri based on request host.
 * Used in non-multi-tenant mode with gateway enabled.
 */
function createDynamicOAuthMiddleware(baseDomain: string) {
	return (req: express.Request, res: express.Response, next: express.NextFunction) => {
		const host = getRequestHost(req);
		if (!host) {
			return next();
		}

		const hostname = host.split(":")[0]; // Remove port

		// Check if hostname is a subdomain of BASE_DOMAIN
		// Note: /connect routes don't have tenant context, so we use pattern-based validation
		const isAllowedHost = hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);

		if (isAllowedHost) {
			const protocol = getRequestProtocol(req);
			const dynamicOrigin = `${protocol}://${host}`;

			// Store the origin in session for callback redirect
			if (req.session) {
				req.session.oauthOrigin = dynamicOrigin;
			}

			const provider = req.path.split("/")[1]; // e.g., /google -> google
			// Check if redirect_uri is already in query (to avoid redirect loop)
			if (provider && !req.path.includes("/callback") && !req.query.redirect_uri) {
				// Redirect to same URL with query params for grant to read
				const redirectUri = `${dynamicOrigin}/connect/${provider}/callback`;
				const redirectUrl = `/connect/${provider}?origin=${encodeURIComponent(dynamicOrigin)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
				log.debug({ dynamicOrigin, redirectUri }, "Redirecting with dynamic OAuth config");
				return res.redirect(redirectUrl);
			}
		}
		next();
	};
}

/**
 * Run dev migrations for multi-tenant infrastructure if in dev mode.
 */
async function runDevMigrationsIfNeeded(
	multiTenantInfra: ReturnType<typeof createMultiTenantFromEnv>,
	decryptPassword: typeof decryptDatabasePassword,
): Promise<void> {
	if (!multiTenantInfra || !shouldRunDevMigrations()) {
		return;
	}
	log.info("Running dev migrations for all tenant-orgs...");
	await runDevMigrations({
		registryClient: multiTenantInfra.registryClient,
		decryptPassword,
	});
}

/**
 * Start smee.io client for local webhook development if configured.
 */
async function startSmeeClientIfConfigured(smeeUrl: string | undefined, origin: string): Promise<void> {
	if (!smeeUrl) {
		return;
	}
	const shutdownHandlers: Array<ExitHandler> = [];
	const localApiUrl = `${origin}/api`;
	const localWebhooksUrl = `${localApiUrl}/webhooks`;
	const localGithubWebhookUrl = `${localWebhooksUrl}/github`;
	await startSmeeClient(shutdownHandlers, {
		localUrl: localGithubWebhookUrl,
		smeeUrl,
	}).catch((reason: unknown) => {
		log.error(reason);
	});
	log.info({ smeeWebhooksUrl: smeeUrl }, "Using smee.io for webhook delivery");
}

/**
 * Create middleware to handle OAuth error redirects on the auth gateway.
 * When OAuth fails (e.g., user cancels), the provider redirects to the gateway root with error params.
 * This middleware forwards these errors back to the tenant's returnTo URL.
 */
function createOAuthErrorMiddleware(baseDomain: string, configuredOrigin: string) {
	return (req: express.Request, res: express.Response, next: express.NextFunction) => {
		const host = getRequestHost(req) ?? "";

		// Only handle on auth gateway
		if (!isAuthGateway(host, baseDomain)) {
			return next();
		}

		// Check for OAuth error
		const error = req.query.error as string | undefined;
		if (!error) {
			return next();
		}

		// Get the stored tenant info from session
		const gatewayAuth = req.session?.gatewayAuth;
		if (gatewayAuth?.returnTo) {
			// Redirect error back to tenant
			const returnUrl = new URL("/", gatewayAuth.returnTo);
			returnUrl.searchParams.set("error", error);
			if (req.query.error_description) {
				returnUrl.searchParams.set("error_description", req.query.error_description as string);
			}

			// Clean up session
			if (req.session) {
				delete req.session.gatewayAuth;
				delete req.session.oauthOrigin;
			}

			log.info({ error, returnTo: gatewayAuth.returnTo }, "Auth gateway forwarding OAuth error to tenant");
			return res.redirect(returnUrl.toString());
		}

		// No gatewayAuth - fallback to configured origin
		log.warn({ error }, "Auth gateway received OAuth error but no gatewayAuth in session");
		return res.redirect(`${configuredOrigin}/?error=${encodeURIComponent(error)}`);
	};
}

/**
 * Start the job scheduler and queue initial jobs if available.
 * In multi-tenant mode, job scheduling is handled by external workers.
 */
async function startJobSchedulerIfAvailable(
	jobScheduler: ReturnType<ReturnType<typeof createMultiTenantJobSchedulerManager>["getSingleTenantScheduler"]>,
	coreJobs: ReturnType<typeof createCoreJobs>,
	demoJobs: ReturnType<typeof createDemoJobs>,
	knowledgeGraphJobs: ReturnType<typeof createKnowledgeGraphJobs>,
): Promise<void> {
	if (jobScheduler) {
		await jobScheduler.start();
		log.info("Job scheduler started");

		// Queue core jobs that should be scheduled on startup
		await coreJobs.queueJobs(jobScheduler);

		// Queue demo jobs that should be queued on startup
		await demoJobs.queueJobs(jobScheduler);

		// Queue knowledge graph jobs (currently no-op, jobs are queued on demand)
		await knowledgeGraphJobs.queueJobs(jobScheduler);
	} else {
		log.info("Multi-tenant mode: job scheduling handled by external worker");
	}
}

/**
 * Creates the Express app without starting the server.
 * Used by both Vercel serverless and local dev (vite-node).
 */
export async function createExpressApp(): Promise<Express> {
	log.info(`Jolli v${version} initializing Express app`);

	// Load configuration from Parameter Store (if PSTORE_ENV is set)
	log.info("Initializing configuration...");
	try {
		await initializeConfig();
	} catch (error) {
		log.error(error, "Failed to initialize configuration.");
		throw error;
	}
	const Configs = getConfig();
	log.info({ pstoreEnv: Configs.PSTORE_ENV }, "Configuration initialized");

	// Validate GitHub org access for Sites feature (fail fast if misconfigured)
	await validateGitHubOrgAccess(Configs);

	const sequelize = await createSequelize();
	// In Vercel multi-tenant mode, skip postSync hooks on default database
	// because tenant tables only exist in tenant databases (not the default db).
	// postSync hooks will run correctly when tenant connections are established.
	const skipPostSync = process.env.VERCEL === "1" && Configs.MULTI_TENANT_ENABLED;
	const db = await createDatabase(sequelize, { skipPostSync });

	// Seed test data for development
	if (Configs.SEED_DATABASE) {
		await seedDocs(db.docDao);
	}

	// Clean up any duplicate integrations on startup
	const duplicatesRemoved = await db.integrationDao.removeDuplicateGitHubIntegrations();
	if (duplicatesRemoved > 0) {
		log.info({ duplicatesRemoved }, "Removed duplicate GitHub integrations on startup");
	}

	const tokenUtil = createTokenUtilFromEnv<UserInfo>();
	const authHandler = createAuthHandler(tokenUtil);
	const userProvisioningMiddleware = createUserProvisioningMiddleware(db.userDaoProvider, tokenUtil);

	// Initialize audit service
	const auditService = createAuditService(db.auditEventDaoProvider);
	setGlobalAuditService(auditService);
	if (Configs.AUDIT_ENABLED) {
		log.info("Audit trail enabled");
	}

	const agent = createMultiAgentFromEnv();

	// Initialize multi-tenant infrastructure if enabled
	const multiTenantInfra = createMultiTenantFromEnv(decryptDatabasePassword, db);
	if (multiTenantInfra) {
		log.info("Multi-tenant mode enabled");
	}

	// Run dev migrations automatically in local development for multi-tenant mode
	await runDevMigrationsIfNeeded(multiTenantInfra, decryptDatabasePassword);

	const app = express();

	// Initialize job scheduler manager
	// Determine mode based on environment and configuration
	const isMultiTenant = !!multiTenantInfra;
	const isVercel = process.env.VERCEL === "1";

	log.info("Initializing job scheduler manager...");
	const schedulerManager = createMultiTenantJobSchedulerManager({
		// In single-tenant mode, no registry client is needed
		registryClient: isMultiTenant ? multiTenantInfra.registryClient : undefined,
		connectionManager: isMultiTenant ? multiTenantInfra.connectionManager : undefined,
		// Default database for single-tenant mode
		defaultDatabase: !isMultiTenant ? db : undefined,
		// Password decryption for multi-tenant mode
		decryptPassword: isMultiTenant ? decryptDatabasePassword : undefined,
		// Worker mode - determines if job workers run inline:
		// - If WORKER_MODE env var is set, use that value explicitly (not from Config.ts to avoid provider chain)
		// - Otherwise, compute based on deployment context:
		//   - Single-tenant: workers run inline (existing behavior)
		//   - Multi-tenant on Vercel: no workers (external workers in AWS)
		//   - Multi-tenant local dev: workers run inline for convenience
		workerMode:
			process.env.WORKER_MODE !== undefined ? process.env.WORKER_MODE === "true" : !isMultiTenant || !isVercel,
	});

	// Get the scheduler for single-tenant mode or throw if multi-tenant
	// In multi-tenant mode, schedulers are created on-demand per tenant-org
	const jobScheduler = schedulerManager.getSingleTenantScheduler();
	if (!jobScheduler && !isMultiTenant) {
		throw new Error("Failed to get single-tenant job scheduler");
	}

	// Create job definition groups
	const coreJobs = createCoreJobs(db.jobDao);
	const demoJobs = createDemoJobs(db.docDao);

	// Create a shared event emitter for integration events
	// In single-tenant mode, use the scheduler's event emitter
	// In multi-tenant mode, create a standalone event emitter
	const sharedEventEmitter = jobScheduler?.getEventEmitter() ?? createJobEventEmitter();

	// Register integration types and integration type specific jobs
	const integrationManager = createIntegrationManager(db, sharedEventEmitter, multiTenantInfra?.registryClient);

	// Register simple job definitions (no complex dependencies)
	schedulerManager.registerJobDefinitions([
		...coreJobs.getDefinitions(),
		...demoJobs.getDefinitions(),
		...integrationManager.getJobDefinitions(),
	]);

	// Register knowledge graph jobs via callback for complex dependencies
	const knowledgeGraphJobs = createKnowledgeGraphJobs(db, integrationManager);
	schedulerManager.setJobRegistrationCallback(scheduler => {
		knowledgeGraphJobs.registerJobs(scheduler);
	});

	// Register Jobs to JRN adapter (only in single-tenant mode with a scheduler)
	const jobsToJrnAdapter = createJobsToJrnAdapter(integrationManager, db.docDao);
	if (jobScheduler) {
		jobsToJrnAdapter.registerJobs(jobScheduler);
	}

	// Start job scheduler and queue jobs (single-tenant mode only)
	// In multi-tenant mode, workers poll and execute jobs separately
	await startJobSchedulerIfAvailable(jobScheduler, coreJobs, demoJobs, knowledgeGraphJobs);

	// Start smee.io client for local webhook development if configured
	await startSmeeClientIfConfigured(Configs.SMEE_API_URL, Configs.ORIGIN);

	// Apply middleware
	app.set("trust proxy", 1);

	app.use(
		morgan(":method :url :status :res[content-length] - :response-time ms", {
			stream: {
				write: (message: string) => {
					log.debug(message.trim());
				},
			},
		}),
	);

	// Configure CORS - use dynamic origin validation when USE_GATEWAY is enabled
	const useGateway = Configs.USE_GATEWAY;
	const baseDomain = Configs.BASE_DOMAIN;
	const corsOrigin =
		useGateway && baseDomain
			? createCorsOriginValidator(baseDomain, Configs.ALLOW_LOCALHOST_ORIGIN, Configs.ORIGIN)
			: Configs.ORIGIN;

	app.use(
		cors({
			origin: corsOrigin,
			credentials: true,
			allowedHeaders: ["Content-Type"],
		}),
	);

	app.use(cookieParser());

	// Mount webhook router BEFORE express.json() so it can use its own body parser
	// with signature verification. The webhook router needs access to the raw body.
	// Pass multi-tenant dependencies for installation-based routing.
	app.use(
		"/api/webhooks",
		createWebhookRouter(sharedEventEmitter, {
			registryClient: multiTenantInfra?.registryClient,
			schedulerManager: isMultiTenant ? schedulerManager : undefined,
		}),
	);

	app.use(express.json({ limit: "10mb" }));
	app.use(await expressSessionHandler(sequelize));

	// Mount audit middleware to capture request context for audit logging
	if (Configs.AUDIT_ENABLED) {
		app.use("/api", createAuditMiddleware());
	}

	// Mount tenant middleware on all /api routes when multi-tenant is enabled
	// This validates the tenant from subdomain/custom domain and establishes context
	if (multiTenantInfra) {
		// Mount on /api but exclude certain endpoints based on subdomain + path rules
		app.use("/api", (req, res, next) => {
			const hostname = getRequestHostname(req);
			if (shouldBypassTenantMiddleware(req.path, hostname, baseDomain, Configs.NODE_ENV)) {
				return next();
			}
			// All other requests go through tenant middleware
			return multiTenantInfra.middleware(req, res, next);
		});
	}

	// Multi-tenant auth gateway mode
	// When USE_MULTI_TENANT_AUTH is enabled, OAuth flows go through auth.{BASE_DOMAIN}
	const multiTenantAuthEnabled = isMultiTenantAuthEnabled();
	if (multiTenantAuthEnabled && baseDomain) {
		log.info({ baseDomain }, "Multi-tenant auth gateway enabled");
		app.use("/connect", createMultiTenantConnectMiddleware(baseDomain));
	}

	// Dynamic OAuth redirect_uri based on request host
	// Enabled when: USE_GATEWAY is enabled (non-production only) OR multi-tenant auth is enabled (gateway needs dynamic redirect)
	const enableDynamicOAuth = (Configs.NODE_ENV !== "production" && useGateway) || multiTenantAuthEnabled;
	if (enableDynamicOAuth && !multiTenantAuthEnabled && baseDomain) {
		// Non-multi-tenant dynamic OAuth mode (legacy behavior)
		log.info({ baseDomain }, "Dynamic OAuth enabled (non-multi-tenant mode)");
		app.use("/connect", createDynamicOAuthMiddleware(baseDomain));
	}

	app.use(grant.express(createGrantConfig(Configs.ORIGIN, enableDynamicOAuth)));

	// Handle OAuth error redirects on the auth gateway
	if (multiTenantAuthEnabled && baseDomain) {
		app.get("/", createOAuthErrorMiddleware(baseDomain, Configs.ORIGIN));
	}

	app.use((req, res, next) => {
		if (req.path === "/") {
			issueVisitorCookie(req, res);
		}
		next();
	});

	// Mount all API routers
	app.use(
		"/api/audit",
		authHandler,
		userProvisioningMiddleware,
		createAuditRouter({ auditEventDaoProvider: db.auditEventDaoProvider, auditService }),
	);
	app.use("/api/auth", createAuthRouter(db.authDaoProvider, db.userDaoProvider, tokenUtil));
	app.use(
		"/api/chat",
		authHandler,
		userProvisioningMiddleware,
		createChatRouter(db.convoDaoProvider, tokenUtil, agent),
	);
	app.use(
		"/api/collab-convos",
		authHandler,
		userProvisioningMiddleware,
		createCollabConvoRouter(
			db.collabConvoDaoProvider,
			db.docDraftDaoProvider,
			db.docDraftSectionChangesDaoProvider,
			tokenUtil,
			integrationManager,
		),
	);
	app.use("/api/convos", authHandler, userProvisioningMiddleware, createConvoRouter(db.convoDaoProvider, tokenUtil));
	app.use(
		"/api/doc-drafts",
		authHandler,
		userProvisioningMiddleware,
		createDocDraftRouter(
			db.docDraftDaoProvider,
			db.docDaoProvider,
			db.docDraftSectionChangesDaoProvider,
			tokenUtil,
			db.collabConvoDaoProvider,
			db.userDaoProvider,
			db.docDraftEditHistoryDaoProvider,
			db.docHistoryDaoProvider,
			db.sequelize,
			db.syncArticleDaoProvider,
		),
	);
	app.use(
		"/api/doc-histories",
		authHandler,
		userProvisioningMiddleware,
		createDocHistoryRouter(db.docHistoryDaoProvider, db.docDaoProvider, db.sequelize),
	);
	// Dev tools redirect - unauthenticated, allows localhost redirect to tenant domain before login
	// MUST be mounted BEFORE the authenticated dev-tools router so /redirect is accessible without auth
	app.use("/api/dev-tools", createDevToolsRedirectRouter());
	app.use(
		"/api/dev-tools",
		authHandler,
		createDevToolsRouter({
			jobScheduler,
			schedulerManager,
			docDaoProvider: db.docDaoProvider,
			siteDaoProvider: db.siteDaoProvider,
			docDraftDaoProvider: db.docDraftDaoProvider,
			docDraftSectionChangesDaoProvider: db.docDraftSectionChangesDaoProvider,
			collabConvoDaoProvider: db.collabConvoDaoProvider,
			jobDaoProvider: db.jobDaoProvider,
			integrationDaoProvider: db.integrationDaoProvider,
			gitHubInstallationDaoProvider: db.githubInstallationDaoProvider,
			syncArticleDaoProvider: db.syncArticleDaoProvider,
			tokenUtil,
		}),
	);
	app.use(
		"/api/docs",
		authHandler,
		userProvisioningMiddleware,
		createDocRouter(db.docDaoProvider, db.docDraftDaoProvider, tokenUtil, db.syncArticleDaoProvider),
	);
	app.use(
		"/api/spaces",
		authHandler,
		userProvisioningMiddleware,
		createSpaceRouter(db.spaceDaoProvider, db.docDaoProvider, tokenUtil),
	);
	app.use(
		"/api/docsites",
		authHandler,
		userProvisioningMiddleware,
		createDocsiteRouter(db.docsiteDaoProvider, db.integrationDaoProvider, integrationManager),
	);
	// Image storage service (created early for use in site generation as well as image routes)
	const imageStorageService = createImageStorageService();

	// Public site auth endpoints (login endpoint - no auth required)
	app.use("/api/sites", createSiteAuthRouter(db.siteDaoProvider, tokenUtil));
	// Protected site endpoints
	app.use(
		"/api/sites",
		authHandler,
		userProvisioningMiddleware,
		createSiteRouter(db.siteDaoProvider, db.docDaoProvider, tokenUtil, imageStorageService),
	);
	app.use("/api/github", createGitHubAppRouter(db.githubInstallationDaoProvider, integrationManager, {}));

	// Connect Gateway - Multi-tenant integration support
	// Register providers and mount the connect router
	connectProviderRegistry.register(
		new GitHubConnectProvider(db.githubInstallationDaoProvider, multiTenantInfra?.registryClient),
	);
	app.use("/api/connect", createConnectRouter(connectProviderRegistry, {}));

	app.use("/api/ingest", authHandler, userProvisioningMiddleware, createIngestRouter(db.docDaoProvider));

	// Image upload and retrieval (using imageStorageService created earlier)
	app.use(
		"/api/images",
		authHandler,
		userProvisioningMiddleware,
		createImageRouter(imageStorageService, db.assetDaoProvider, tokenUtil),
	);

	app.use(
		"/api/integrations",
		authHandler,
		userProvisioningMiddleware,
		createIntegrationRouter({ manager: integrationManager, docDaoProvider: db.docDaoProvider }),
	);
	app.use(
		"/api/jobs",
		authHandler,
		userProvisioningMiddleware,
		createJobRouter({ jobScheduler, schedulerManager, jobDaoProvider: db.jobDaoProvider, tokenUtil }),
	);
	app.use("/api/mercure", authHandler, userProvisioningMiddleware, createMercureRouter());
	app.use("/api/knowledge-graph", createKnowledgeGraphRouter({ jobScheduler, schedulerManager })); // DEV endpoint - no auth

	// Sync router for CLI markdown sync (no auth - CLI uses its own auth mechanism)
	app.use("/api/v1/sync", createSyncRouter(db.docDaoProvider, db.syncArticleDaoProvider));

	// OrgRouter for multi-tenant mode. In non-multi-tenant mode, getTenantContext() returns null
	// and the router returns early without using the registry client.
	const registryClient: TenantRegistryClient = multiTenantInfra?.registryClient ?? {
		getTenant: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantBySlug: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantByDomain: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantDatabaseConfig: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listTenants: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listAllActiveTenants: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getOrg: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getOrgBySlug: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getDefaultOrg: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listOrgs: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listAllActiveOrgs: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantOrgByInstallationId: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		createInstallationMapping: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		deleteInstallationMapping: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		close: () => Promise.resolve(),
	};
	app.use("/api/org", createOrgRouter({ registryClient }));

	// Admin endpoints for multi-tenant operations (bootstrap, etc.)
	// Only mounted when multi-tenant is enabled AND BOOTSTRAP_SECRET is configured
	if (multiTenantInfra && Configs.BOOTSTRAP_SECRET) {
		app.use(
			"/api/admin",
			createAdminRouter({
				registryClient: multiTenantInfra.registryClient,
				connectionManager: multiTenantInfra.connectionManager,
				bootstrapSecret: Configs.BOOTSTRAP_SECRET,
				bootstrapTimestampToleranceMs: Configs.BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
			}),
		);
	}

	// Tenant validation endpoint - works in both single and multi-tenant modes
	app.use("/api/tenant", createTenantRouter({ registryClient }));
	app.use("/api/status", createStatusRouter());
	app.use("/api/visit", createVisitRouter(db.visitDaoProvider, tokenUtil));
	// Grant library handles /connect/:provider/callback automatically and redirects to /api/auth/callback

	// IMPORTANT: Do NOT mount frontend static files here
	// Frontend is deployed separately to Vercel static hosting

	// DO NOT call app.listen() - Vercel handles that
	log.info("Express app created successfully");

	return app;
}

/**
 * For backwards compatibility with vite-node dev server.
 * Creates and starts the Express server.
 */
export async function createAndStartServer(): Promise<Express> {
	log.info(`Jolli v${version} starting up on Node ${process.version}`);

	const app = await createExpressApp();

	const shutdownHandlers: Array<ExitHandler> = [];

	const signalListener = (signal: NodeJS.Signals) => {
		log.info("Exiting Jolli due to signal: %s", signal);
		process.exit(0);
	};

	// add shutdown handler to clean up gracefully
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
		process.on(signal, signalListener);
	}

	// stop server and call exit handlers on exit
	process.on("exit", (code: number) => {
		for (const shutdownHandler of shutdownHandlers) {
			shutdownHandler.stop(code);
		}
		log.info("Jolli stopped at %s", new Date());
	});

	// Only listen if not in serverless environment
	if (process.env.VERCEL !== "1") {
		const Configs = getConfig();
		const isProduction = Configs.NODE_ENV === "production";

		if (isProduction) {
			const indexPath = `${process.cwd()}/index.html`;
			const noCache = { headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } };
			app.use("/assets", express.static("assets", { maxAge: "1y" }));
			app.use((_request, response) => response.sendFile(indexPath, noCache));
			const host = process.env.HOST ?? "0.0.0.0";
			const port = Number.parseInt(process.env.PORT ?? "8034");
			app.listen(port, host, () => log.info("ready"));
		}
	}

	return app;
}
