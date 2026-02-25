import "./util/Env";
import { version } from "../package.json";
import {
	auditLog,
	createAuditMiddleware,
	createAuditService,
	createInitialAuditContext,
	runWithAuditContext,
	setGlobalAuditService,
} from "./audit";
import { isAuthGateway, isMultiTenantAuthEnabled } from "./auth/AuthGateway";
import { createBetterAuth } from "./auth/BetterAuthConfig";
import { runDevMigrations, shouldRunDevMigrations } from "./cli/DevMigrationRunner";
import { getConfig, initializeConfig } from "./config/Config";
import { connectProviderRegistry, createConnectRouter, GitHubConnectProvider } from "./connect";
import { createDatabase } from "./core/Database";
import { createManagerDatabase, setGlobalManagerDatabase } from "./core/ManagerDatabase";
import {
	createAiCheck,
	createAuthCheck,
	createDatabaseCheck,
	createGitCheck,
	createHealthService,
	createMultiTenantDatabaseCheck,
	createRealtimeCheck,
	createStorageCheck,
	createVercelCheck,
} from "./health";
import type { ExitHandler } from "./index";
import { createIntegrationManager } from "./integrations/IntegrationsManager";
import { createAssetCleanupJobs } from "./jobs/AssetCleanupJobs.js";
import { createCoreJobs } from "./jobs/CoreJobs.js";
import { createDemoJobs } from "./jobs/DemoJobs.js";
import { createJobEventEmitter } from "./jobs/JobEventEmitter.js";
import { createJobsToJrnAdapter } from "./jobs/JobsToJrnAdapter.js";
import { createKnowledgeGraphJobs } from "./jobs/KnowledgeGraphJobs.js";
import { createMultiTenantJobSchedulerManager } from "./jobs/MultiTenantJobSchedulerManager.js";
import { createRememberMeCleanupJobs } from "./jobs/RememberMeCleanupJobs.js";
import { createPermissionMiddleware } from "./middleware/PermissionMiddleware";
import { createRememberMeMiddleware } from "./middleware/RememberMeMiddleware";
import { createSyncSpaceScopeMiddleware, createSyncTenantMiddleware } from "./middleware/SyncAuthMiddleware";
import { createOnboardingRouter } from "./onboarding-agent/OnboardingRouter";
import { createOnboardingWebhookListener } from "./onboarding-agent/OnboardingWebhookListener";
import { createAdminRouter } from "./router/AdminRouter";
import { createAgentConvoRouter } from "./router/AgentConvoRouter";
import { createAuditRouter } from "./router/AuditRouter";
import { createAuthEmailSelectionRouter } from "./router/AuthEmailSelectionRouter";
import { createAuthRouter } from "./router/AuthRouter";
import { createCollabConvoRouter } from "./router/CollabConvoRouter";
import { createCronRouter } from "./router/CronRouter";
import { createDevToolsRedirectRouter, createDevToolsRouter } from "./router/DevToolsRouter";
import { createDocDraftRouter } from "./router/DocDraftRouter";
import { createDocHistoryRouter } from "./router/DocHistoryRouter";
import { createDocRouter } from "./router/DocRouter";
import { createDocsiteRouter } from "./router/DocsiteRouter";
import { createGitHubAppRouter } from "./router/GitHubAppRouter";
import { createImageRouter } from "./router/ImageRouter";
import { createIngestRouter } from "./router/IngestRouter";
import { createIntegrationRouter } from "./router/IntegrationRouter";
import { createInvitationAcceptRouter } from "./router/InvitationAcceptRouter";
import { createJobRouter } from "./router/JobRouter.js";
import { createKnowledgeGraphRouter } from "./router/KnowledgeGraphRouter";
import { createLogLevelRouter } from "./router/LogLevelRouter";
import { createMercureRouter } from "./router/MercureRouter";
import { createOrgRouter } from "./router/OrgRouter";
import { createOwnerInvitationAcceptRouter } from "./router/OwnerInvitationAcceptRouter";
import { createPasswordAuthRouter } from "./router/PasswordAuthRouter";
import { createProfileRouter } from "./router/ProfileRouter";
import { createRoleRouter } from "./router/RoleRouter";
import { createSiteAuthRouter } from "./router/SiteAuthRouter";
import { createSiteRouter, validateGitHubOrgAccess } from "./router/SiteRouter";
import { createSourceRouter, createSpaceSourceRouter } from "./router/SourceRouter";
import { createSpaceRouter } from "./router/SpaceRouter";
import { createStatusRouter } from "./router/StatusRouter";
import { createSyncRouter } from "./router/SyncRouter";
import { createTenantRouter } from "./router/TenantRouter";
import { createTenantSelectionRouter } from "./router/TenantSelectionRouter";
import { createUserManagementRouter } from "./router/UserManagementRouter";
import { createVisitRouter } from "./router/VisitRouter";
import { createWebhookRouter } from "./router/WebhookRouter";
import { ActiveUserProvisioningService } from "./services/ActiveUserProvisioningService";
import { getRedisClientIfAvailable, initCache } from "./services/CacheService";
import { createImageStorageService } from "./services/ImageStorageService";
import { LoginSecurityService } from "./services/LoginSecurityService";
import { createLogLevelService, type LogLevelService } from "./services/LogLevelService";
import { PasswordAuthService } from "./services/PasswordAuthService";
import { createPermissionService } from "./services/PermissionService";
import { createRememberMeService } from "./services/RememberMeService";
import { createMultiTenantFromEnv } from "./tenant/MultiTenantSetup";
import {
	createTenantOrgContext,
	getTenantContext,
	runWithTenantContext,
	type TenantOrgContext,
} from "./tenant/TenantContext";
import type { TenantRegistryClient } from "./tenant/TenantRegistryClient";
import { createRegistrySequelize } from "./tenant/TenantSequelizeFactory";
import { createAuthHandler } from "./util/AuthHandler";
import { type AWSCredentialsFactoryOptions, createAWSCredentialsProvider } from "./util/AWSCredentials";
import {
	buildRememberMeCookieValue,
	expressSessionHandler,
	issueVisitorCookie,
	resolveCookieDomain,
} from "./util/Cookies";
import { decryptDatabasePassword } from "./util/DecryptPassword";
import { createInvitationTokenUtilFromEnv } from "./util/InvitationTokenUtil";
import { getLog } from "./util/Logger";
import { createOctokit } from "./util/OctokitUtil";
import { createOwnerInvitationTokenUtil } from "./util/OwnerInvitationTokenUtil";
import { getRequestHost, getRequestHostname } from "./util/RequestUtil";
import { seedDocs } from "./util/SeedDocs";
import { createSequelize } from "./util/Sequelize";
import { startSmeeClient } from "./util/Smee";
import { createTokenUtilFromEnv, setGlobalTokenUtil } from "./util/TokenUtil";
import { createUserProvisioningMiddleware } from "./util/UserProvisioningMiddleware";
import { S3Client } from "@aws-sdk/client-s3";
import cookieParser from "cookie-parser";
import cors from "cors";
import type { Express, RequestHandler } from "express";
import express from "express";
import type { UserInfo } from "jolli-common";
import morgan from "morgan";
import ms from "ms";

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
 * Extract client IP from request headers
 */
function getClientIp(req: express.Request): string {
	return (
		(req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
		(req.headers["x-real-ip"] as string) ||
		req.ip ||
		"unknown"
	);
}

/**
 * Record login failure and log the result
 */
async function handleLoginFailure(email: string): Promise<void> {
	const { failCount, isLocked } = await LoginSecurityService.recordFailure(email);
	if (isLocked) {
		log.warn({ email, failCount }, "Account locked after max login failures");
	} else {
		log.debug({ email, failCount }, "Login failure recorded");
	}
}

/**
 * Check if a request path should bypass tenant middleware.
 * Returns true if the path is allowed without tenant context.
 * @internal Exported for testing
 */
export function shouldBypassTenantMiddleware(
	path: string,
	hostname: string | undefined,
	baseDomain: string | undefined,
	nodeEnv: string,
): boolean {
	// Always allow status and cron endpoints without tenant context:
	// - /status, /status/check, /status/health (health checks for load balancers/monitoring)
	// - /cron/* (Vercel cron jobs, e.g., /cron/heartbeat)
	if (path === "/status" || path.startsWith("/status/") || path.startsWith("/cron/")) {
		return true;
	}

	// For local development, always allow /admin/* without tenant context (bootstrap endpoint uses HMAC auth)
	if (hostname === "localhost" && path.startsWith("/admin/")) {
		return true;
	}

	// In non-production, allow /dev-tools/redirect without tenant context
	if (nodeEnv !== "production" && path === "/dev-tools/redirect") {
		return true;
	}

	// Allow /v1/sync/* without tenant hostname validation (CLI sync resolves tenant from JWT separately)
	if (path.startsWith("/v1/sync/")) {
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

	// All domains → allow /auth/* paths (better-auth authentication)
	// Auth routes are global and don't require tenant context
	// Note: favoritesHash for preferences sync is obtained from /api/org/current instead
	if (path.startsWith("/auth/")) {
		log.debug("allowing %s for better-auth (domain-agnostic)", path);
		return true;
	}

	// All domains → allow /invitation/* and /owner-invitation/* paths (invitation acceptance)
	// Invitation tokens contain tenant info so context comes from the token
	if (path.startsWith("/invitation/") || path.startsWith("/owner-invitation/")) {
		log.debug("allowing %s for invitation acceptance (domain-agnostic)", path);
		return true;
	}

	// connect.{baseDomain} → connect callbacks and webhooks (ConnectRouter is mounted at /api/connect)
	// Note: path has /api prefix stripped since middleware is mounted at /api
	// Allow callbacks (e.g., /connect/github/callback) and webhooks (e.g., /connect/github/webhook)
	if (
		hostname === `connect.${baseDomain}` &&
		path.startsWith("/connect/") &&
		(path.includes("/callback") || path.includes("/webhook"))
	) {
		log.debug("allowing %s over connect.%s", path, baseDomain);
		return true;
	}

	return false;
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
 * For multi-tenant mode, webhooks are routed through the connect gateway domain.
 */
async function startSmeeClientIfConfigured(smeeUrl: string | undefined): Promise<void> {
	if (!smeeUrl) {
		return;
	}
	const shutdownHandlers: Array<ExitHandler> = [];
	// Post directly to the backend server, bypassing the nginx gateway.
	// The gateway's bare domain returns the SPA fallback instead of proxying.
	const backendPort = process.env.PORT ?? "7034";
	const localGithubWebhookUrl = `http://localhost:${backendPort}/api/webhooks/github`;
	await startSmeeClient(shutdownHandlers, {
		localUrl: localGithubWebhookUrl,
		smeeUrl,
	}).catch((reason: unknown) => {
		log.error(reason);
	});
	log.info({ smeeWebhooksUrl: smeeUrl, localUrl: localGithubWebhookUrl }, "Using smee.io for webhook delivery");
}

/**
 * Tracks whether deferred initialization tasks have been run.
 * These tasks are non-critical and can run after the first request is handled
 * to reduce cold start latency on Vercel.
 */
let deferredTasksRun = false;

/**
 * Interface for deferred task context.
 */
interface DeferredTaskContext {
	db: Awaited<ReturnType<typeof createDatabase>>;
	smeeUrl: string | undefined;
	origin: string;
	configs: ReturnType<typeof getConfig>;
}

/**
 * Run deferred initialization tasks after the first request.
 * This reduces cold start latency by deferring non-critical work.
 */
function runDeferredTasks(context: DeferredTaskContext): void {
	if (deferredTasksRun) {
		return;
	}
	deferredTasksRun = true;

	// Run tasks asynchronously without blocking
	setImmediate(async () => {
		log.debug("Running deferred initialization tasks...");

		// Validate GitHub org access for Sites feature (deferred from startup)
		try {
			await validateGitHubOrgAccess(context.configs);
		} catch (error) {
			log.error(error, "Failed to validate GitHub org access (deferred)");
		}

		// Clean up duplicate GitHub integrations
		try {
			const duplicatesRemoved = await context.db.integrationDao.removeDuplicateGitHubIntegrations();
			if (duplicatesRemoved > 0) {
				log.info({ duplicatesRemoved }, "Removed duplicate GitHub integrations (deferred)");
			}
		} catch (error) {
			log.error(error, "Failed to remove duplicate GitHub integrations");
		}

		// Start smee.io client for local webhook development
		await startSmeeClientIfConfigured(context.smeeUrl);

		log.debug("Deferred initialization tasks completed");
	});
}

/**
 * Create middleware to run deferred tasks after the first response.
 */
function createDeferredTaskMiddleware(context: DeferredTaskContext) {
	return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
		if (!deferredTasksRun) {
			res.on("finish", () => runDeferredTasks(context));
		}
		next();
	};
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
	assetCleanupJobs: ReturnType<typeof createAssetCleanupJobs>,
	authCleanupJobs: ReturnType<typeof createRememberMeCleanupJobs> | undefined,
	enableDemoJobs: boolean,
): Promise<number> {
	const startTime = Date.now();
	if (jobScheduler) {
		await jobScheduler.start();
		log.info("Job scheduler started");

		// Queue all jobs in parallel for faster startup
		const jobPromises: Array<Promise<void>> = [
			coreJobs.queueJobs(jobScheduler),
			knowledgeGraphJobs.queueJobs(jobScheduler),
			assetCleanupJobs.queueJobs(jobScheduler),
		];

		// Queue auth cleanup jobs if available (requires Manager DB)
		if (authCleanupJobs) {
			jobPromises.push(authCleanupJobs.queueJobs(jobScheduler));
		}

		// Only queue demo jobs if explicitly enabled (disable in production for faster cold starts)
		if (enableDemoJobs) {
			jobPromises.push(demoJobs.queueJobs(jobScheduler));
		} else {
			log.info("Demo jobs disabled (ENABLE_DEMO_JOBS=false)");
		}

		await Promise.all(jobPromises);
	} else {
		log.info("Multi-tenant mode: job scheduling handled by external worker");
	}
	return Date.now() - startTime;
}

interface HealthServiceDependencies {
	sequelize: import("sequelize").Sequelize;
	s3Client: S3Client;
	octokit: import("@octokit/rest").Octokit;
	/** Connection manager for multi-tenant database health checks (optional) */
	connectionManager?: import("./tenant/TenantOrgConnectionManager").TenantOrgConnectionManager;
}

/**
 * Create health service with all health checks.
 * When connectionManager is provided, adds multi-tenant database check using cached connections.
 */
function createHealthServiceWithChecks(deps: HealthServiceDependencies): import("./health").HealthService {
	const healthChecks = [
		createDatabaseCheck(deps.sequelize),
		createStorageCheck(deps.s3Client),
		createGitCheck(deps.octokit),
		createAiCheck(),
		createAuthCheck(),
		createRealtimeCheck(),
		createVercelCheck(),
	];

	// Add multi-tenant database check when connection manager is available
	// Uses cached connections per Doug's recommendation for checking real health
	if (deps.connectionManager) {
		healthChecks.push(
			createMultiTenantDatabaseCheck({
				connectionManager: deps.connectionManager,
			}),
		);
	}

	return createHealthService({ checks: healthChecks });
}

/**
 * Runs startup database tasks: seeding test data and cleaning up duplicates.
 * Skipped in multi-tenant Vercel mode because tenant tables only exist in tenant databases.
 */
async function runStartupDatabaseTasks(
	db: Awaited<ReturnType<typeof createDatabase>>,
	skipPostSync: boolean,
	seedDatabase: boolean,
): Promise<void> {
	// Seed test data for development
	if (seedDatabase && !skipPostSync) {
		await seedDocs(db.docDao);
	}

	// Duplicate integration cleanup is now deferred to after the first request
	// to reduce cold start latency. See createDeferredTaskMiddleware.
}

/**
 * Creates the Express app without starting the server.
 * Used by both Vercel serverless and local dev (vite-node).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Main app factory function, complexity is expected
export async function createExpressApp(): Promise<Express> {
	const appStartTime = Date.now();
	log.info(`Jolli v${version} initializing Express app`);

	// Load configuration from Parameter Store (if PSTORE_ENV is set)
	const configStartTime = Date.now();
	log.info("Initializing configuration...");
	try {
		await initializeConfig();
	} catch (error) {
		log.error(error, "Failed to initialize configuration.");
		throw error;
	}
	const Configs = getConfig();
	log.info({ pstoreEnv: Configs.PSTORE_ENV, durationMs: Date.now() - configStartTime }, "Configuration initialized");

	// Initialize cache (Redis or in-memory fallback)
	const cacheStartTime = Date.now();
	try {
		const { type: cacheType } = await initCache();
		log.info({ cacheType, durationMs: Date.now() - cacheStartTime }, "Cache initialized");
	} catch (error) {
		log.error(error, "Failed to initialize cache, using in-memory fallback");
	}

	// Initialize LogLevelService for dynamic log level management
	// Uses Redis pub/sub for multi-instance sync if available
	const redisClientForLogLevel = getRedisClientIfAvailable();
	const logLevelService: LogLevelService = await createLogLevelService({
		...(redisClientForLogLevel && { redisClient: redisClientForLogLevel }),
		initialLevel: Configs.LOG_LEVEL,
		persistToRedis: Configs.LOG_LEVEL_PERSIST_TO_REDIS,
		persistTtlSeconds: Configs.LOG_LEVEL_PERSIST_TTL_SECONDS,
	});

	// GitHub org validation is deferred to reduce cold start latency.
	// See runDeferredTasks() - validation happens after first request.

	const dbStartTime = Date.now();
	const sequelize = await createSequelize();
	// When SKIP_SEQUELIZE_SYNC is set in multi-tenant mode, skip postSync hooks on default database
	// because tenant tables only exist in tenant databases (not the default db).
	// postSync hooks will run correctly when tenant connections are established.
	const skipPostSync = process.env.SKIP_SEQUELIZE_SYNC === "true" && Configs.MULTI_TENANT_ENABLED;
	const db = await createDatabase(sequelize, { skipPostSync });
	log.info({ durationMs: Date.now() - dbStartTime }, "Database initialized");

	// Create Manager DB instance for centralized authentication
	// IMPORTANT: Global singletons (ManagerDatabase, TokenUtil) must be set during app startup,
	// before the server starts accepting requests. Routers (OrgRouter, TenantRouter) access
	// these singletons via getGlobalManagerDatabase() and getGlobalTokenUtil() to filter results
	// by user access without requiring dependency injection through router config.
	let managerDb: ReturnType<typeof createManagerDatabase> | undefined;
	let rememberMeService: ReturnType<typeof createRememberMeService> | undefined;
	if (Configs.MULTI_TENANT_ENABLED && Configs.MULTI_TENANT_REGISTRY_URL) {
		log.info("Initializing Manager Database for authentication...");
		const managerSequelize = createRegistrySequelize(Configs.MULTI_TENANT_REGISTRY_URL, 5);
		managerDb = createManagerDatabase(managerSequelize);
		setGlobalManagerDatabase(managerDb);
		log.info("Manager Database initialized");

		// Create RememberMeService early so cleanup jobs can be registered with other jobs
		rememberMeService = createRememberMeService(managerDb.rememberMeTokenDao);
	}

	// Run startup database tasks (seeding and duplicate cleanup)
	await runStartupDatabaseTasks(db, skipPostSync, Configs.SEED_DATABASE);

	const tokenUtil = createTokenUtilFromEnv<UserInfo>();
	setGlobalTokenUtil(tokenUtil);
	const authHandler = createAuthHandler(tokenUtil);
	const userProvisioningMiddleware = createUserProvisioningMiddleware(
		tokenUtil,
		managerDb?.globalUserDao,
		db.activeUserDaoProvider,
	);
	const syncSpaceScopeMiddleware = createSyncSpaceScopeMiddleware(tokenUtil);

	// Initialize audit service
	const auditService = createAuditService(db.auditEventDaoProvider);
	setGlobalAuditService(auditService);
	if (Configs.AUDIT_ENABLED) {
		log.info("Audit trail enabled");
	}

	// Create shared S3 client for reuse across services
	// Uses default AWS credential chain (IAM task role on ECS)
	const s3CredentialsOptions: AWSCredentialsFactoryOptions = {};
	if (Configs.AWS_OIDC_ROLE_ARN) {
		s3CredentialsOptions.roleArn = Configs.AWS_OIDC_ROLE_ARN;
	}
	if (Configs.AWS_REGION) {
		s3CredentialsOptions.region = Configs.AWS_REGION;
	}
	const s3Credentials = createAWSCredentialsProvider(s3CredentialsOptions);
	const s3Client = new S3Client({
		region: Configs.IMAGE_S3_REGION ?? Configs.AWS_REGION,
		...(s3Credentials && { credentials: s3Credentials }),
	});

	// Image storage service (created early for use in jobs and routes)
	const imageStorageService = createImageStorageService(s3Client);

	// Create shared Octokit instance for reuse
	const octokit = createOctokit();

	// Initialize multi-tenant infrastructure if enabled
	const multiTenantInfra = createMultiTenantFromEnv(decryptDatabasePassword, tokenUtil);
	if (multiTenantInfra) {
		log.info("Multi-tenant mode enabled");
	}

	// Run dev migrations automatically in local development for multi-tenant mode
	await runDevMigrationsIfNeeded(multiTenantInfra, decryptDatabasePassword);

	const app = express();

	// Initialize job scheduler manager
	// Determine mode based on environment and configuration
	const isMultiTenant = !!multiTenantInfra;

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
		// - Single-tenant: workers run inline (existing behavior)
		// - Multi-tenant: workers run externally (AWS ECS Fargate or local worker:dev)
		workerMode: process.env.WORKER_MODE !== undefined ? process.env.WORKER_MODE === "true" : !isMultiTenant,
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
	const integrationManager = createIntegrationManager(
		db,
		sharedEventEmitter,
		multiTenantInfra?.registryClient,
		db.integrationDaoProvider,
	);

	// Register simple job definitions (no complex dependencies)
	schedulerManager.registerJobDefinitions([
		...coreJobs.getDefinitions(),
		...demoJobs.getDefinitions(),
		...integrationManager.getJobDefinitions(),
	]);

	// Register knowledge graph jobs via callback for complex dependencies
	const knowledgeGraphJobs = createKnowledgeGraphJobs(db, integrationManager);

	// Create asset cleanup jobs (needs imageStorageService for S3 deletion)
	const assetCleanupJobs = createAssetCleanupJobs(db, imageStorageService);

	// Create auth cleanup jobs if rememberMeService is available (requires Manager DB)
	const authCleanupJobs = rememberMeService ? createRememberMeCleanupJobs(rememberMeService) : undefined;

	// Create JRN adapter before the callback so it's available for both modes
	const jobsToJrnAdapter = createJobsToJrnAdapter(integrationManager, db.docDao, db.sourceDao);

	schedulerManager.setJobRegistrationCallback((scheduler, database) => {
		knowledgeGraphJobs.registerJobs(scheduler);
		assetCleanupJobs.registerJobs(scheduler);
		jobsToJrnAdapter.registerJobs(scheduler);
		if (authCleanupJobs) {
			authCleanupJobs.registerJobs(scheduler);
		}
		// Register onboarding webhook listener on each tenant's event emitter
		// so push events trigger sync detection in multi-tenant mode.
		// Uses the tenant-scoped DAO from the database parameter to ensure
		// queries hit the correct PostgreSQL schema.
		createOnboardingWebhookListener(scheduler.getEventEmitter(), database.userOnboardingDao);
	});

	// Start job scheduler and queue jobs (single-tenant mode only)
	// In multi-tenant mode, workers poll and execute jobs separately
	const jobSchedulerDurationMs = await startJobSchedulerIfAvailable(
		jobScheduler,
		coreJobs,
		demoJobs,
		knowledgeGraphJobs,
		assetCleanupJobs,
		authCleanupJobs,
		Configs.ENABLE_DEMO_JOBS,
	);
	log.info({ durationMs: jobSchedulerDurationMs }, "Job scheduler initialization complete");

	// Smee.io client is now started as a deferred task to reduce cold start latency.
	// See createDeferredTaskMiddleware.

	// Apply middleware
	app.set("trust proxy", 1);

	// Deferred task middleware - runs non-critical initialization after first response
	// This reduces cold start latency on Vercel by deferring GitHub validation, duplicate cleanup, and smee.io client start
	app.use(
		createDeferredTaskMiddleware({
			db,
			smeeUrl: Configs.SMEE_API_URL,
			origin: Configs.ORIGIN,
			configs: Configs,
		}),
	);

	// Global request logger - logs ALL incoming requests
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
	app.use(await expressSessionHandler());

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
			const bypass = shouldBypassTenantMiddleware(req.path, hostname, baseDomain, Configs.NODE_ENV);
			if (bypass) {
				log.debug("Tenant middleware bypassed for %s (host: %s)", req.path, hostname);
				return next();
			}
			log.debug("Tenant middleware applied for %s (host: %s, baseDomain: %s)", req.path, hostname, baseDomain);
			// All other requests go through tenant middleware
			return multiTenantInfra.middleware(req, res, next);
		});
	}

	// Mount better-auth to handle OAuth at /auth
	// Better-auth handles OAuth callbacks at /auth/callback/:provider
	let _betterAuthInstance: Awaited<ReturnType<typeof createBetterAuth>> | undefined;
	let passwordAuthService: PasswordAuthService | undefined;

	if (managerDb) {
		// Create PasswordAuthService for password reset handling (shared across auth flows)
		passwordAuthService = new PasswordAuthService(managerDb.globalUserDao, managerDb.globalAuthDao);

		// Apply RememberMeMiddleware before better-auth to auto-login users with valid remember-me tokens
		if (rememberMeService) {
			const rememberMeMiddleware = createRememberMeMiddleware({
				rememberMeService,
				globalUserDao: managerDb.globalUserDao,
				userOrgDao: managerDb.userOrgDao,
				tokenUtil,
			});
			app.use(rememberMeMiddleware);
		}

		/**
		 * Log a login audit event in the tenant's audit trail.
		 * Fire-and-forget — errors are logged but don't affect the login response.
		 */
		async function logLoginAuditEvent(
			req: express.Request,
			userId: number,
			userEmail: string,
			method: string,
		): Promise<void> {
			try {
				// Resolve tenant context from gateway session or current tenant context
				const tenantSlug = req.session?.gatewayAuth?.tenantSlug;
				const existingTenantContext = getTenantContext();

				let tenantContext = existingTenantContext;

				if (!tenantContext && tenantSlug && multiTenantInfra) {
					const tenant = await multiTenantInfra.registryClient.getTenantBySlug(tenantSlug);
					if (tenant) {
						const org = await multiTenantInfra.registryClient.getDefaultOrg(tenant.id);
						if (org) {
							const database = await multiTenantInfra.connectionManager.getConnection(tenant, org);
							tenantContext = createTenantOrgContext(tenant, org, database);
						}
					}
				}

				if (!tenantContext) {
					log.debug({ userId, method }, "Login audit skipped: no tenant context available");
					return;
				}

				const auditContext = createInitialAuditContext(req);

				runWithTenantContext(tenantContext, () => {
					runWithAuditContext({ ...auditContext, actorId: userId, actorEmail: userEmail }, () => {
						auditLog({
							action: "login",
							resourceType: "session",
							resourceId: userId,
							resourceName: userEmail,
							actorId: userId,
							actorEmail: userEmail,
							metadata: { method },
						});
					});
				});
			} catch (error) {
				log.warn(error, "Failed to log login audit event");
			}
		}

		try {
			// createBetterAuth is async to support MemoryDB IAM authentication for Redis
			const authInstance = await createBetterAuth({
				tokenUtil,
				globalUserDao: managerDb.globalUserDao,
				verificationDao: managerDb.verificationDao,
				passwordAuthService,
				managerDb,
			});
			_betterAuthInstance = authInstance;

			// Mount GitHub email-selection endpoints outside of AppFactory for clearer separation:
			// - POST /auth/validate-code
			// - POST /auth/select-email
			app.use(
				createAuthEmailSelectionRouter({
					managerDb,
					betterAuth: authInstance,
					tokenUtil,
					tokenCookieMaxAge: Configs.TOKEN_COOKIE_MAX_AGE,
					origin: Configs.ORIGIN,
				}),
			);

			// Mount better-auth handler directly without wrapper
			// Use regex to match /auth and any subpaths (e.g., /auth/sign-in/social, /auth/callback/google)
			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Auth handler needs multiple conditional paths
			app.all(/^\/auth(?:\/.*)?$/, async (req, res) => {
				try {
					const protocol = req.protocol || "http";
					const host = req.get("host") || "localhost";
					const url = `${protocol}://${host}${req.originalUrl || req.url}`;

					// Login security checks for email/password sign-in (before calling better-auth)
					const isEmailSignIn = req.originalUrl?.includes("/sign-in/email") && req.method === "POST";
					// Check if this is an OAuth callback (for remember-me support)
					const isOAuthCallback = /\/auth\/callback\/(google|github)/.test(req.originalUrl ?? "");
					const email = req.body?.email;
					const clientIp = getClientIp(req);

					// Perform pre-auth security checks for email sign-in
					if (isEmailSignIn && email) {
						try {
							const securityCheck = await LoginSecurityService.performSecurityCheck(email, clientIp);
							if (securityCheck.blocked && securityCheck.statusCode && securityCheck.response) {
								res.status(securityCheck.statusCode).json(securityCheck.response);
								return;
							}
						} catch (securityError) {
							log.error(securityError, "Login security check failed");
							// Allow request to proceed even if security check fails
						}
					}

					// Build headers, adding custom X-Remember-Me header if remember-me is requested
					const headersInit: Record<string, string> = {};
					for (const [key, value] of Object.entries(req.headers)) {
						if (typeof value === "string") {
							headersInit[key] = value;
						} else if (Array.isArray(value)) {
							headersInit[key] = value.join(", ");
						}
					}
					// Pass rememberMe flag via custom header since better-auth consumes request body
					// Accept both boolean true and string "true" for flexibility
					const rememberMeRequested = req.body?.rememberMe === true || req.body?.rememberMe === "true";
					if (isEmailSignIn && rememberMeRequested) {
						headersInit["x-remember-me"] = "true";
						log.debug({ email }, "Remember-me requested for login");
					}

					const webRequest = new Request(url, {
						method: req.method,
						headers: headersInit,
						body:
							req.method !== "GET" && req.method !== "HEAD" && req.body ? JSON.stringify(req.body) : null,
					});

					const webResponse = await authInstance.handler(webRequest);

					// Record login failure for email/password sign-in (after better-auth responds)
					// better-auth's after hook doesn't run on auth failures, so we handle it here
					if (isEmailSignIn && email && webResponse.status !== 200) {
						try {
							await handleLoginFailure(email);
						} catch (securityError) {
							log.error(securityError, "Failed to record login failure");
						}
					}

					res.status(webResponse.status);

					// Handle Set-Cookie headers specially - they need to be set as an array
					// because Headers.forEach concatenates multiple values which breaks cookies
					const setCookieHeaders = webResponse.headers.getSetCookie?.() || [];

					// Set other headers (skip set-cookie since we handle it below after adding remember-me cookie)
					// Also skip internal control headers used only between better-auth hooks and this wrapper.
					webResponse.headers.forEach((value, key) => {
						const lowerKey = key.toLowerCase();
						if (
							lowerKey === "set-cookie" ||
							lowerKey === "x-remember-me" ||
							lowerKey === "x-email-selection"
						) {
							return;
						}
						res.setHeader(key, value);
					});

					const responseBody = await webResponse.text();

					// Parse authToken from Set-Cookie headers for OAuth remember-me
					// (OAuth callback doesn't return JSON body, so we extract user ID from JWT cookie)
					let authTokenValue: string | undefined;
					for (const cookieStr of setCookieHeaders) {
						if (cookieStr.startsWith("authToken=")) {
							const match = cookieStr.match(/^authToken=([^;]+)/);
							authTokenValue = match?.[1];
							break;
						}
					}

					// Get remember-me preference from better-auth response header (unified for all login methods)
					// BetterAuthConfig hook reads from OAuth state or request header, then sets this response header
					const shouldRememberMe = webResponse.headers.get("x-remember-me") === "true";

					// Get email selection data from better-auth response header
					// BetterAuthConfig hook sets this when GitHub OAuth returns multiple verified emails
					const emailSelectionData = webResponse.headers.get("x-email-selection");
					if (emailSelectionData) {
						const isSecure = Configs.ORIGIN.startsWith("https://");
						const cookieDomain = resolveCookieDomain();
						const domainPart = cookieDomain ? `Domain=${cookieDomain}; ` : "";
						const emailSelectionCookie = `email_selection=${encodeURIComponent(emailSelectionData)}; ${domainPart}Path=/; ${isSecure ? "Secure; " : ""}SameSite=Lax; Max-Age=300`;
						setCookieHeaders.push(emailSelectionCookie);
						log.info({ emailSelectionData }, "Set email selection cookie from better-auth header");
					}

					const isLoginSuccess =
						(isEmailSignIn && webResponse.status === 200) ||
						(isOAuthCallback &&
							(webResponse.status === 200 || webResponse.status === 302) &&
							authTokenValue);

					// Extract user info for both audit logging and remember-me
					let loginUserId: number | undefined;
					let loginEmail: string | undefined;
					let loginMethod: string | undefined;

					if (isLoginSuccess) {
						if (isEmailSignIn) {
							try {
								const responseJson = JSON.parse(responseBody);
								const userIdStr = responseJson?.user?.id;
								loginUserId = userIdStr ? Number.parseInt(userIdStr, 10) : undefined;
								loginEmail = email || responseJson?.user?.email;
								loginMethod = "email";
							} catch {
								// Response parsing failed
							}
						} else if (isOAuthCallback && authTokenValue) {
							const payload = tokenUtil.decodePayloadFromToken(authTokenValue);
							loginUserId = payload?.userId;
							loginEmail = payload?.email;
							const providerMatch = req.originalUrl?.match(/\/callback\/(google|github)/);
							loginMethod = providerMatch?.[1] ?? "oauth";
						}
					}

					// Audit log successful login (fire-and-forget)
					if (loginUserId && loginEmail) {
						logLoginAuditEvent(req, loginUserId, loginEmail, loginMethod ?? "unknown").catch(err =>
							log.warn(err, "Login audit fire-and-forget error"),
						);
					}

					// Handle remember-me token for successful authentication
					const shouldCreateRememberMe =
						rememberMeService && Configs.REMEMBER_ME_ENABLED && isLoginSuccess && shouldRememberMe;

					log.debug(
						{
							isEmailSignIn,
							isOAuthCallback,
							status: webResponse.status,
							shouldRememberMe,
							hasAuthToken: !!authTokenValue,
							isLoginSuccess,
							hasRememberMeService: !!rememberMeService,
							rememberMeEnabled: Configs.REMEMBER_ME_ENABLED,
							shouldCreateRememberMe,
						},
						"Remember-me token creation check",
					);

					if (shouldCreateRememberMe && rememberMeService) {
						try {
							// Reuse already-extracted userId from login detection above
							if (loginUserId) {
								const userAgent = req.headers["user-agent"];
								const token = await rememberMeService.createToken(loginUserId, userAgent, clientIp);

								const rmMaxAge = ms(Configs.REMEMBER_ME_DURATION);
								const isSecure = Configs.ORIGIN.startsWith("https://");
								const cookieDomain = resolveCookieDomain();
								const rmCookie = buildRememberMeCookieValue(token, cookieDomain, rmMaxAge, isSecure);
								setCookieHeaders.push(rmCookie);

								log.info(
									{ userId: loginUserId, isOAuth: isOAuthCallback, email: loginEmail || "oauth" },
									"Remember-me token created",
								);
							} else {
								log.warn(
									{ responseBody: responseBody.slice(0, 200), hasAuthToken: !!authTokenValue },
									"No user ID found for remember-me token",
								);
							}
						} catch (rememberMeError) {
							log.warn(rememberMeError, "Failed to create remember-me token");
						}
					}

					// Set all cookies at once (including remember-me if added)
					if (setCookieHeaders.length > 0) {
						res.setHeader("set-cookie", setCookieHeaders);
					}

					res.send(responseBody);
				} catch (error) {
					log.error({ error }, "Better-auth handler error");
					res.status(500).json({ error: "Internal server error" });
				}
			});

			log.info("Better-auth initialized successfully at /auth");
		} catch (error) {
			log.error({ error }, "Failed to initialize better-auth, using legacy auth only");
		}
	}

	// Multi-tenant auth gateway mode
	const multiTenantAuthEnabled = isMultiTenantAuthEnabled();

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

	// Role and Permission management (RBAC) - create early for auth router logging
	const permissionService = createPermissionService(db.roleDaoProvider, db.activeUserDaoProvider);
	const permissionMiddleware = createPermissionMiddleware({
		tokenUtil,
		permissionService,
	});

	// Mount all API routers
	app.use(
		"/api/audit",
		authHandler,
		userProvisioningMiddleware,
		createAuditRouter({ auditEventDaoProvider: db.auditEventDaoProvider, auditService }),
	);
	// Mount authentication router
	app.use(
		"/api/auth",
		createAuthRouter({
			spaceDaoProvider: db.spaceDaoProvider,
			tokenUtil,
			// Pass RememberMeService for clearing tokens on logout
			rememberMeService,
		}),
	);

	// Test route to verify /auth path is reachable
	app.get("/auth/test", (_req, res) => {
		log.info("Test route /auth/test reached");
		res.json({ message: "/auth path is working", timestamp: new Date().toISOString() });
	});

	// Better-auth is already mounted above (before multi-tenant middleware)
	// Here we mount additional auth-related routers
	if (managerDb && passwordAuthService) {
		// Mount tenant selection router
		const activeUserProvisioningService = multiTenantInfra
			? new ActiveUserProvisioningService({
					registryClient: multiTenantInfra.registryClient,
					connectionManager: multiTenantInfra.connectionManager,
				})
			: undefined;

		app.use(
			"/api/auth",
			createTenantSelectionRouter({
				userOrgDao: managerDb.userOrgDao,
				tokenUtil,
				...(activeUserProvisioningService && { activeUserProvisioningService }),
			}),
		);

		// Legacy password reset routes (password/validate-reset-token, password/reset-password)
		app.use(
			"/api/auth/legacy",
			createPasswordAuthRouter({
				verificationDao: managerDb.verificationDao,
				passwordHistoryDao: managerDb.passwordHistoryDao,
				globalAuthDao: managerDb.globalAuthDao,
				...(rememberMeService ? { rememberMeService } : {}),
			}),
		);

		// Profile router for user profile management (requires authentication)
		app.use(
			"/api/profile",
			authHandler,
			createProfileRouter({
				globalUserDao: managerDb.globalUserDao,
				globalAuthDao: managerDb.globalAuthDao,
				passwordHistoryDao: managerDb.passwordHistoryDao,
				tokenUtil,
				activeUserDaoProvider: db.activeUserDaoProvider,
				userPreferenceDaoProvider: db.userPreferenceDaoProvider,
				...(rememberMeService ? { rememberMeService } : {}),
			}),
		);
	}

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
	app.use(
		"/api/agent/convos",
		authHandler,
		userProvisioningMiddleware,
		createAgentConvoRouter(db.collabConvoDaoProvider, tokenUtil, undefined, {
			spaceDaoProvider: db.spaceDaoProvider,
			docDaoProvider: db.docDaoProvider,
			docDraftDaoProvider: db.docDraftDaoProvider,
			sourceDaoProvider: db.sourceDaoProvider,
			integrationDaoProvider: db.integrationDaoProvider,
			permissionService,
			integrationsManager: integrationManager,
		}),
	);
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
			db.activeUserDaoProvider,
			db.docDraftEditHistoryDaoProvider,
			db.docHistoryDaoProvider,
			db.sequelize,
			db.syncArticleDaoProvider,
			db.assetDaoProvider,
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
			spaceDaoProvider: db.spaceDaoProvider,
			tokenUtil,
		}),
	);
	app.use(
		"/api/docs",
		authHandler,
		userProvisioningMiddleware,
		createDocRouter(
			db.docDaoProvider,
			db.docDraftDaoProvider,
			tokenUtil,
			permissionMiddleware,
			db.syncArticleDaoProvider,
		),
	);
	app.use(
		"/api/spaces",
		authHandler,
		userProvisioningMiddleware,
		createSpaceRouter(
			db.spaceDaoProvider,
			db.docDaoProvider,
			db.userSpacePreferenceDaoProvider,
			tokenUtil,
			permissionMiddleware,
		),
	);
	app.use(
		"/api/docsites",
		authHandler,
		userProvisioningMiddleware,
		createDocsiteRouter(db.docsiteDaoProvider, db.integrationDaoProvider, integrationManager, permissionMiddleware),
	);

	// Public site auth endpoints (login endpoint - no auth required)
	app.use("/api/sites", createSiteAuthRouter(db.siteDaoProvider, tokenUtil));
	// Protected site endpoints
	app.use(
		"/api/sites",
		authHandler,
		userProvisioningMiddleware,
		createSiteRouter(db.siteDaoProvider, tokenUtil, permissionMiddleware, imageStorageService),
	);
	app.use(
		"/api/github",
		createGitHubAppRouter(db.githubInstallationDaoProvider, integrationManager, {
			...(multiTenantInfra?.registryClient ? { registryClient: multiTenantInfra.registryClient } : {}),
		}),
	);

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
		createImageRouter(imageStorageService, db.assetDaoProvider, db.spaceDaoProvider, tokenUtil),
	);

	app.use(
		"/api/integrations",
		authHandler,
		userProvisioningMiddleware,
		createIntegrationRouter({
			manager: integrationManager,
			docDaoProvider: db.docDaoProvider,
			permissionMiddleware,
		}),
	);
	const sourceRouterDeps = {
		sourceDaoProvider: db.sourceDaoProvider,
		integrationDaoProvider: db.integrationDaoProvider,
	};
	const spaceSourceRouterDeps = {
		sourceDaoProvider: db.sourceDaoProvider,
		spaceDaoProvider: db.spaceDaoProvider,
	};
	app.use("/api/v1/sources", authHandler, userProvisioningMiddleware, createSourceRouter(sourceRouterDeps));
	app.use(
		"/api/v1/spaces/:spaceId/sources",
		authHandler,
		userProvisioningMiddleware,
		createSpaceSourceRouter(spaceSourceRouterDeps),
	);
	app.use(
		"/api/jobs",
		authHandler,
		userProvisioningMiddleware,
		createJobRouter({
			jobScheduler,
			schedulerManager,
			jobDaoProvider: db.jobDaoProvider,
			tokenUtil,
			permissionMiddleware,
		}),
	);
	app.use("/api/mercure", authHandler, userProvisioningMiddleware, createMercureRouter({ tokenUtil }));
	app.use(
		"/api/onboarding",
		authHandler,
		userProvisioningMiddleware,
		createOnboardingRouter({
			userOnboardingDaoProvider: db.userOnboardingDaoProvider,
			tokenUtil,
			...(Configs.ANTHROPIC_API_KEY && { anthropicApiKey: Configs.ANTHROPIC_API_KEY }),
			// Phase 3: DAO providers for real GitHub integration
			integrationDaoProvider: db.integrationDaoProvider,
			docDaoProvider: db.docDaoProvider,
			githubInstallationDaoProvider: db.githubInstallationDaoProvider,
			spaceDaoProvider: db.spaceDaoProvider,
			// Phase 4: DAO providers for smart import with update detection
			docDraftDaoProvider: db.docDraftDaoProvider,
			docDraftSectionChangesDaoProvider: db.docDraftSectionChangesDaoProvider,
			// User preferences for auto-favoriting created spaces
			userPreferenceDaoProvider: db.userPreferenceDaoProvider,
		}),
	);
	app.use("/api/knowledge-graph", createKnowledgeGraphRouter({ jobScheduler, schedulerManager })); // DEV endpoint - no auth

	// Sync router for CLI markdown sync (auth required, sandbox-service tokens scoped to their space).
	// In multi-tenant mode, tenant middleware is bypassed for /v1/sync/ (see shouldBypassTenantMiddleware),
	// so we add syncTenantMiddleware to resolve the tenant context directly from the JWT.
	const syncMiddleware: Array<RequestHandler> = [authHandler];
	if (multiTenantInfra) {
		syncMiddleware.push(
			createSyncTenantMiddleware({
				tokenUtil,
				registryClient: multiTenantInfra.registryClient,
				connectionManager: multiTenantInfra.connectionManager,
			}),
		);
	}
	syncMiddleware.push(syncSpaceScopeMiddleware);
	app.use(
		"/api/v1/sync",
		...syncMiddleware,
		createSyncRouter(db.docDaoProvider, db.syncArticleDaoProvider, db.syncCommitDaoProvider, db.spaceDaoProvider),
	);

	// OrgRouter for multi-tenant mode. In non-multi-tenant mode, getTenantContext() returns null
	// and the router returns early without using the registry client.
	const registryClient: TenantRegistryClient = multiTenantInfra?.registryClient ?? {
		getTenant: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantBySlug: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantByDomain: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantDatabaseConfig: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listTenants: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listTenantsWithDefaultOrg: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listAllActiveTenants: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getOrg: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getOrgBySlug: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getDefaultOrg: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listOrgs: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		listAllActiveOrgs: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		getTenantOrgByInstallationId: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		createInstallationMapping: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		ensureInstallationMapping: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		deleteInstallationMapping: () => Promise.reject(new Error("TenantRegistryClient not configured")),
		close: () => Promise.resolve(),
	};
	app.use("/api/org", createOrgRouter({ registryClient, userPreferenceDaoProvider: db.userPreferenceDaoProvider }));

	// User management endpoints (active users, invitations, archived users)
	// Note: Email functionality requires Manager DB (multi-tenant mode)
	const invitationExpiryDays = 7;
	const invitationExpirySeconds = invitationExpiryDays * 24 * 60 * 60;

	if (managerDb) {
		// Full functionality with email sending
		const invitationTokenUtil = createInvitationTokenUtilFromEnv();
		app.use(
			"/api/user-management",
			authHandler,
			userProvisioningMiddleware,
			createUserManagementRouter({
				activeUserDaoProvider: db.activeUserDaoProvider,
				archivedUserDaoProvider: db.archivedUserDaoProvider,
				userInvitationDaoProvider: db.userInvitationDaoProvider,
				roleDaoProvider: db.roleDaoProvider,
				verificationDao: managerDb.verificationDao,
				tokenUtil,
				invitationTokenUtil,
				permissionMiddleware,
				permissionService,
				getInvitationExpirySeconds: () => invitationExpirySeconds,
				getOrigin: () => Configs.ORIGIN,
				userOrgDao: managerDb.userOrgDao,
				globalUserDao: managerDb.globalUserDao,
				spaceDaoProvider: db.spaceDaoProvider,
			}),
		);
	} else {
		// Fallback for single-tenant mode - log warning that email won't be sent
		log.warn("Manager DB not available - invitation emails will not be sent");
		const invitationTokenUtil = createInvitationTokenUtilFromEnv();
		const noopVerificationDao = {
			createVerification: () => Promise.resolve({ id: 0 } as never),
			findById: () => Promise.resolve(undefined),
			findByTokenHash: () => Promise.resolve(undefined),
			findByResetPasswordToken: () => Promise.resolve(undefined),
			markAsUsed: () => Promise.resolve(),
			deleteVerification: () => Promise.resolve(),
			deleteExpiredOrUsed: () => Promise.resolve(0),
			deleteByIdentifierAndType: () => Promise.resolve(0),
		};
		// No-op DAOs for single-tenant mode (user removal doesn't affect other tenants)
		const noopUserOrgDao = {
			getUserOrgs: () => Promise.resolve([]),
			getUserTenants: () => Promise.resolve([]),
			getUniqueTenants: () => Promise.resolve([]),
			getOrgsForTenant: () => Promise.resolve([]),
			createUserOrg: () => Promise.resolve({} as never),
			updateLastAccessed: () => Promise.resolve(),
			setDefaultTenant: () => Promise.resolve(),
			deleteUserOrg: () => Promise.resolve(),
			updateRole: () => Promise.resolve(),
		};
		const noopGlobalUserDao = {
			findUserByEmail: () => Promise.resolve(undefined),
			findUserById: () => Promise.resolve(undefined),
			createUser: () => Promise.resolve({} as never),
			updateUser: () => Promise.resolve(),
			deleteUser: () => Promise.resolve(),
			updateUserEmail: () => Promise.resolve(),
		};
		app.use(
			"/api/user-management",
			authHandler,
			userProvisioningMiddleware,
			createUserManagementRouter({
				activeUserDaoProvider: db.activeUserDaoProvider,
				archivedUserDaoProvider: db.archivedUserDaoProvider,
				userInvitationDaoProvider: db.userInvitationDaoProvider,
				roleDaoProvider: db.roleDaoProvider,
				verificationDao: noopVerificationDao,
				tokenUtil,
				invitationTokenUtil,
				permissionMiddleware,
				permissionService,
				getInvitationExpirySeconds: () => invitationExpirySeconds,
				getOrigin: () => Configs.ORIGIN,
				userOrgDao: noopUserOrgDao,
				globalUserDao: noopGlobalUserDao,
				spaceDaoProvider: db.spaceDaoProvider,
			}),
		);
	}

	// Invitation accept endpoints (public - no auth required)
	// This allows users to accept invitations by setting up their password
	if (managerDb && multiTenantInfra) {
		const invitationTokenUtil = createInvitationTokenUtilFromEnv();
		// Capture multiTenantInfra for use in the async function (TypeScript narrowing)
		const infra = multiTenantInfra;

		// Create a function to get tenant context by tenant ID and org ID
		async function getTenantContextByTenantId(
			tenantId: string,
			orgId: string,
		): Promise<TenantOrgContext | undefined> {
			try {
				const tenant = await infra.registryClient.getTenant(tenantId);
				if (!tenant) {
					return;
				}
				const org = await infra.registryClient.getOrg(orgId);
				if (!org) {
					return;
				}
				const database = await infra.connectionManager.getConnection(tenant, org);
				return createTenantOrgContext(tenant, org, database);
			} catch (error) {
				log.error(error, "Failed to get tenant context by ID");
				return;
			}
		}

		// Create getSessionFromRequest function using better-auth if available
		const getSessionFromRequest = _betterAuthInstance
			? async (req: express.Request) => {
					try {
						const protocol = req.protocol || "http";
						const host = req.get("host") || "localhost";
						const url = `${protocol}://${host}${req.originalUrl || req.url}`;
						const headers: Record<string, string> = {};
						if (req.headers.cookie) {
							headers.cookie = req.headers.cookie;
						}
						const webRequest = new Request(url, {
							method: "GET",
							headers,
						});
						const session = await _betterAuthInstance.api.getSession({ headers: webRequest.headers });
						if (session?.user) {
							return {
								user: {
									id: session.user.id,
									email: session.user.email,
									name: session.user.name,
								},
							};
						}
						return null;
					} catch (error) {
						log.error(error, "Failed to get session from request");
						return null;
					}
				}
			: undefined;

		app.use(
			"/api/invitation",
			createInvitationAcceptRouter({
				invitationTokenUtil,
				verificationDao: managerDb.verificationDao,
				globalUserDao: managerDb.globalUserDao,
				globalAuthDao: managerDb.globalAuthDao,
				userOrgDao: managerDb.userOrgDao,
				userInvitationDaoProvider: db.userInvitationDaoProvider,
				activeUserDaoProvider: db.activeUserDaoProvider,
				getTenantContextByTenantId,
				managerSequelize: managerDb.sequelize,
				...(getSessionFromRequest && { getSessionFromRequest }),
			}),
		);
	}

	// Owner invitation accept endpoints (public - no auth required)
	// This allows users to accept owner invitations sent from the Manager app
	if (managerDb && multiTenantInfra && Configs.TOKEN_SECRET) {
		const ownerInvitationTokenUtil = createOwnerInvitationTokenUtil(Configs.TOKEN_SECRET);
		const infra = multiTenantInfra;

		// Session getter for OAuth flow (same pattern as InvitationAcceptRouter)
		const getSessionForOwnerInvitation = _betterAuthInstance
			? async (req: express.Request) => {
					try {
						const protocol = req.protocol || "http";
						const host = req.get("host") || "localhost";
						const url = `${protocol}://${host}${req.originalUrl || req.url}`;
						const headers: Record<string, string> = {};
						if (req.headers.cookie) {
							headers.cookie = req.headers.cookie;
						}
						const webRequest = new Request(url, {
							method: "GET",
							headers,
						});
						const session = await _betterAuthInstance.api.getSession({ headers: webRequest.headers });
						if (session?.user) {
							return {
								user: {
									id: session.user.id,
									email: session.user.email,
									name: session.user.name,
								},
							};
						}
						return null;
					} catch (error) {
						log.error(error, "Failed to get session for owner invitation");
						return null;
					}
				}
			: undefined;

		app.use(
			"/api/owner-invitation",
			createOwnerInvitationAcceptRouter({
				ownerInvitationTokenUtil,
				verificationDao: managerDb.verificationDao,
				ownerInvitationDao: managerDb.ownerInvitationDao,
				globalUserDao: managerDb.globalUserDao,
				globalAuthDao: managerDb.globalAuthDao,
				userOrgDao: managerDb.userOrgDao,
				activeUserDaoProvider: db.activeUserDaoProvider,
				spaceDaoProvider: db.spaceDaoProvider,
				registryClient: infra.registryClient,
				connectionManager: infra.connectionManager,
				managerSequelize: managerDb.sequelize,
				...(getSessionForOwnerInvitation && { getSessionFromRequest: getSessionForOwnerInvitation }),
			}),
		);
	}

	app.use(
		"/api/roles",
		authHandler,
		userProvisioningMiddleware,
		createRoleRouter({
			roleDaoProvider: db.roleDaoProvider,
			permissionDaoProvider: db.permissionDaoProvider,
			permissionMiddleware,
			permissionService,
		}),
	);

	// Admin endpoints for multi-tenant operations (bootstrap, etc.)
	// Only mounted when multi-tenant is enabled AND BOOTSTRAP_SECRET is configured
	if (multiTenantInfra && Configs.BOOTSTRAP_SECRET) {
		// Create token util for owner invitation email sending
		const adminOwnerInvitationTokenUtil = Configs.TOKEN_SECRET
			? createOwnerInvitationTokenUtil(Configs.TOKEN_SECRET)
			: undefined;

		app.use(
			"/api/admin",
			createAdminRouter({
				registryClient: multiTenantInfra.registryClient,
				connectionManager: multiTenantInfra.connectionManager,
				bootstrapSecret: Configs.BOOTSTRAP_SECRET,
				bootstrapTimestampToleranceMs: Configs.BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
				// Owner invitation dependencies (for send-owner-invitation-email endpoint)
				verificationDao: managerDb?.verificationDao,
				ownerInvitationDao: managerDb?.ownerInvitationDao,
				globalUserDao: managerDb?.globalUserDao,
				ownerInvitationTokenUtil: adminOwnerInvitationTokenUtil,
				gatewayDomain: Configs.BASE_DOMAIN,
			}),
		);
	}

	// Log level management endpoints
	// Only mounted when BOOTSTRAP_SECRET is configured (uses same auth mechanism)
	if (Configs.BOOTSTRAP_SECRET) {
		app.use(
			"/api/admin/log-level",
			createLogLevelRouter({
				logLevelService,
				adminSecret: Configs.BOOTSTRAP_SECRET,
				timestampToleranceMs: Configs.BOOTSTRAP_TIMESTAMP_TOLERANCE_MS,
			}),
		);
	}

	// Tenant validation endpoint - works in both single and multi-tenant modes
	app.use("/api/tenant", createTenantRouter({ registryClient }));
	// Create health service once for reuse by status and cron routers
	// Include multi-tenant database check when in multi-tenant mode (uses cached connections)
	const healthService = createHealthServiceWithChecks({
		sequelize,
		s3Client,
		octokit,
		...(multiTenantInfra?.connectionManager && { connectionManager: multiTenantInfra.connectionManager }),
	});
	app.use("/api/status", createStatusRouter({ healthService }));
	app.use("/api/cron", createCronRouter({ healthService }));
	app.use("/api/visit", createVisitRouter(db.visitDaoProvider, tokenUtil));

	// IMPORTANT: Do NOT mount frontend static files here
	// Frontend is deployed separately to Vercel static hosting

	// DO NOT call app.listen() - Vercel handles that
	log.info({ totalDurationMs: Date.now() - appStartTime }, "Express app created successfully");

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

	// Serve static files and listen in production
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

	return app;
}
