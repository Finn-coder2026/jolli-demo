/**
 * Worker entry point for AWS ECS Fargate.
 * This runs as a standalone process (no Express server) that processes jobs
 * across all tenants and orgs in multi-tenant mode.
 */
/* v8 ignore start - Entry point file, similar to Main.ts */
import { getConfig, initializeConfig } from "../config/Config.js";
import type { Database } from "../core/Database.js";
import type { DaoProvider } from "../dao/DaoProvider.js";
import type { DocDao } from "../dao/DocDao.js";
import type { IntegrationDao } from "../dao/IntegrationDao.js";
import type { JobDao } from "../dao/JobDao.js";
import type { SourceDao } from "../dao/SourceDao.js";
import { createIntegrationManager } from "../integrations/IntegrationsManager.js";
import { createAssetCleanupJobs } from "../jobs/AssetCleanupJobs.js";
import { createCoreJobs } from "../jobs/CoreJobs.js";
import { createDemoJobs } from "../jobs/DemoJobs.js";
import { createJobEventEmitter } from "../jobs/JobEventEmitter.js";
import type { JobScheduler } from "../jobs/JobScheduler.js";
import { createJobsToJrnAdapter } from "../jobs/JobsToJrnAdapter.js";
import { createKnowledgeGraphJobs } from "../jobs/KnowledgeGraphJobs.js";
import { createMultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import { getRedisClientIfAvailable, initCache } from "../services/CacheService.js";
import { createImageStorageService } from "../services/ImageStorageService.js";
import { createLogLevelService, type LogLevelService } from "../services/LogLevelService.js";
import { createMercureService, type MercureService } from "../services/MercureService.js";
import { getTenantContext } from "../tenant/TenantContext.js";
import { createTenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager.js";
import { createTenantRegistryClient } from "../tenant/TenantRegistryClient.js";
import type { JobEvent } from "../types/JobTypes.js";
import { decryptDatabasePassword } from "../util/DecryptPassword.js";
import { getLog } from "../util/Logger.js";
import { setupHeartbeatService } from "./HeartbeatSetup.js";
import { startWorkerPolling, type WorkerPollingConfig } from "./WorkerPolling.js";

const log = getLog(import.meta);

/**
 * Creates a proxy that throws an error if any property is accessed.
 * Used to catch bugs where code runs outside of tenant context.
 * In worker mode, job handlers always run within runWithTenantContext(),
 * so getTenantContext() should always return a valid context.
 * If this proxy is accessed, it indicates a bug.
 */
function createErrorThrowingProxy<T extends object>(name: string): T {
	return new Proxy({} as T, {
		get(_target, prop) {
			throw new Error(
				`Attempted to access ${String(prop)} on ${name} outside of tenant context. ` +
					`Job handlers must run within runWithTenantContext().`,
			);
		},
	});
}

/**
 * Main worker entry point.
 * Initializes configuration, creates scheduler manager, and starts polling.
 */
async function main(): Promise<void> {
	log.info("Starting Jolli Worker...");

	// Initialize configuration from provider chain
	await initializeConfig();
	const config = getConfig();

	// Initialize cache to enable Redis-based log level sync
	await initCache();
	const redisClient = getRedisClientIfAvailable();

	// Initialize LogLevelService for dynamic log level management
	// When Redis is available, this subscribes to log level changes from backend
	let logLevelService: LogLevelService | undefined;
	if (redisClient) {
		logLevelService = await createLogLevelService({
			redisClient,
			persistToRedis: config.LOG_LEVEL_PERSIST_TO_REDIS,
			persistTtlSeconds: config.LOG_LEVEL_PERSIST_TTL_SECONDS,
		});
		log.info("LogLevelService initialized with Redis sync - log levels will sync with backend");
	} else {
		log.info("Redis not available - log levels will not sync with backend");
	}

	// Verify we're in multi-tenant mode
	if (!config.MULTI_TENANT_ENABLED) {
		log.error("MULTI_TENANT_ENABLED is not set. Worker mode requires multi-tenant configuration.");
		process.exit(1);
	}

	if (!config.MULTI_TENANT_REGISTRY_URL) {
		log.error("MULTI_TENANT_REGISTRY_URL is not set. Worker mode requires registry configuration.");
		process.exit(1);
	}

	// Create multi-tenant infrastructure
	const registryClient = createTenantRegistryClient({
		registryDatabaseUrl: config.MULTI_TENANT_REGISTRY_URL,
		poolMax: 5,
	});

	const connectionManager = createTenantOrgConnectionManager({
		registryClient,
		maxConnections: config.MULTI_TENANT_CONNECTION_POOL_MAX,
		ttlMs: config.MULTI_TENANT_CONNECTION_TTL_MS,
		poolMax: config.MULTI_TENANT_POOL_MAX_PER_CONNECTION,
		decryptPassword: decryptDatabasePassword,
	});

	// Create scheduler manager with worker mode enabled
	const schedulerManager = createMultiTenantJobSchedulerManager({
		registryClient,
		connectionManager,
		workerMode: true, // Workers process jobs
		maxSchedulers: config.WORKER_MAX_SCHEDULERS,
		decryptPassword: decryptDatabasePassword,
	});

	// Set up job definitions to register when schedulers are created
	// Create error-throwing proxies instead of empty mocks.
	// In worker mode, job handlers ALWAYS run within runWithTenantContext(),
	// so getTenantContext() should always return a valid context.
	// If these proxies are accessed, it indicates a bug (code running outside tenant context).
	const mockJobDao = createErrorThrowingProxy<JobDao>("mockJobDao");
	const mockDocDao = createErrorThrowingProxy<DocDao>("mockDocDao");
	const mockSourceDao = createErrorThrowingProxy<SourceDao>("mockSourceDao");
	const mockDatabase = createErrorThrowingProxy<Database>("mockDatabase");

	// Create a tenant-aware DaoProvider for IntegrationsManager.
	// This provider gets the DAO from the current tenant context,
	// which is set by runWithTenantContext() before job handlers execute.
	const tenantAwareIntegrationDaoProvider: DaoProvider<IntegrationDao> = {
		getDao: context => {
			const tenantContext = context ?? getTenantContext();
			if (!tenantContext?.database?.integrationDao) {
				throw new Error(
					"No integration DAO available in tenant context. " +
						"Job handlers must run within runWithTenantContext().",
				);
			}
			return tenantContext.database.integrationDao;
		},
	};

	// Create shared event emitter for job chaining
	const sharedEventEmitter = createJobEventEmitter();

	// Create integration manager with tenant-aware DAO provider.
	// The provider resolves the DAO from the current tenant context at runtime.
	const integrationManager = createIntegrationManager(
		mockDatabase,
		sharedEventEmitter,
		registryClient,
		tenantAwareIntegrationDaoProvider,
	);

	// Create image storage service (global, uses S3)
	const imageStorageService = createImageStorageService();

	// Create job factories
	const coreJobs = createCoreJobs(mockJobDao);
	const demoJobs = createDemoJobs();
	const knowledgeGraphJobs = createKnowledgeGraphJobs(mockDatabase, integrationManager);
	const assetCleanupJobs = createAssetCleanupJobs(mockDatabase, imageStorageService);
	const jobsToJrnAdapter = createJobsToJrnAdapter(integrationManager, mockDocDao, mockSourceDao);

	// Register job definitions from factories that have getDefinitions() methods
	const allDefinitions = [
		...coreJobs.getDefinitions(),
		...demoJobs.getDefinitions(),
		...assetCleanupJobs.getDefinitions(),
		...integrationManager.getJobDefinitions(),
	];
	schedulerManager.registerJobDefinitions(allDefinitions);
	log.info({ jobCount: allDefinitions.length }, "Registered %d job definitions", allDefinitions.length);

	// Set up Mercure for job event publishing (if enabled)
	const mercureService = createMercureService();
	if (mercureService.isEnabled()) {
		log.info("Mercure enabled for job event publishing");
	} else {
		log.info("Mercure not enabled - job events will not be published");
	}

	// Register jobs that use the registerJobs pattern via callback.
	// These jobs are registered when each scheduler is created, allowing them
	// to have references to the scheduler for job chaining.
	schedulerManager.setJobRegistrationCallback((scheduler, _database) => {
		knowledgeGraphJobs.registerJobs(scheduler);
		jobsToJrnAdapter.registerJobs(scheduler);

		// Wire up Mercure event publishing for this scheduler
		if (mercureService.isEnabled()) {
			setupMercureJobEventPublishing(scheduler, mercureService);
		}
	});
	log.info("Set up job registration callback for KnowledgeGraphJobs and JobsToJrnAdapter");

	// Start polling for tenant/org pairs
	const pollingConfig: WorkerPollingConfig = {
		pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
		maxConcurrentSchedulers: config.WORKER_MAX_SCHEDULERS,
		retryMaxRetries: config.WORKER_RETRY_MAX_RETRIES,
		retryBaseDelayMs: config.WORKER_RETRY_BASE_DELAY_MS,
		retryMaxDelayMs: config.WORKER_RETRY_MAX_DELAY_MS,
		retryResetAfterMs: config.WORKER_RETRY_RESET_AFTER_MS,
	};

	await startWorkerPolling(schedulerManager, registryClient, pollingConfig);

	log.info("Worker polling started");

	// Set up heartbeat service for Better Stack monitoring
	// Uses cached connections from the connection manager for health checks
	const heartbeatService = setupHeartbeatService({
		connectionManager,
	});
	heartbeatService.start();
	log.info("Heartbeat service started");

	// Handle graceful shutdown with forced exit fallback
	const SHUTDOWN_TIMEOUT_MS = 30000;
	const shutdown = async (signal: string) => {
		log.info({ signal }, "Received %s signal, shutting down...", signal);

		// Force exit if graceful shutdown takes too long (prevents hung connections from blocking)
		const forceExitTimer = setTimeout(() => {
			log.warn("Graceful shutdown timed out after %dms, forcing exit", SHUTDOWN_TIMEOUT_MS);
			process.exit(1);
		}, SHUTDOWN_TIMEOUT_MS);

		try {
			heartbeatService.stop();
			if (logLevelService) {
				await logLevelService.close();
			}
			await schedulerManager.closeAll();
			await connectionManager.closeAll();
			clearTimeout(forceExitTimer);
			log.info("Graceful shutdown complete");
			process.exit(0);
		} catch (error) {
			clearTimeout(forceExitTimer);
			log.error(error, "Error during shutdown");
			process.exit(1);
		}
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	log.info("Worker ready and processing jobs");
}

/**
 * Sets up Mercure publishing for job events on a scheduler.
 * Events are emitted within tenant context (via runWithTenantContext in wrapJobHandler),
 * so getTenantContext() returns the correct tenant/org for topic construction.
 */
function setupMercureJobEventPublishing(scheduler: JobScheduler, mercureService: MercureService): void {
	const eventEmitter = scheduler.getEventEmitter();

	log.info("Setting up Mercure job event publishing for scheduler");

	// Note: We don't include 'type' or 'timestamp' in payloads - MercureService.publishJobEvent adds them

	eventEmitter.on("job:started", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
		};
		log.debug({ jobId: data.jobId, name: data.name }, "Publishing job:started to Mercure");
		mercureService.publishJobEvent("job:started", data).catch(err => {
			log.warn(err, "Failed to publish job:started to Mercure");
		});
	});

	eventEmitter.on("job:completed", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
			completionInfo?: unknown;
		};
		log.debug({ jobId: data.jobId, name: data.name }, "Publishing job:completed to Mercure");
		mercureService.publishJobEvent("job:completed", data).catch(err => {
			log.warn(err, "Failed to publish job:completed to Mercure");
		});
	});

	eventEmitter.on("job:failed", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			error?: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
		};
		log.debug({ jobId: data.jobId, name: data.name }, "Publishing job:failed to Mercure");
		mercureService.publishJobEvent("job:failed", data).catch(err => {
			log.warn(err, "Failed to publish job:failed to Mercure");
		});
	});

	eventEmitter.on("job:cancelled", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			showInDashboard?: boolean;
			keepCardAfterCompletion?: boolean;
		};
		log.debug({ jobId: data.jobId, name: data.name }, "Publishing job:cancelled to Mercure");
		mercureService.publishJobEvent("job:cancelled", data).catch(err => {
			log.warn(err, "Failed to publish job:cancelled to Mercure");
		});
	});

	eventEmitter.on("job:stats-updated", (event: JobEvent) => {
		const data = event.data as {
			jobId: string;
			name: string;
			stats: unknown;
			showInDashboard?: boolean;
		};
		log.debug({ jobId: data.jobId, name: data.name }, "Publishing job:stats-updated to Mercure");
		mercureService.publishJobEvent("job:stats-updated", data).catch(err => {
			log.warn(err, "Failed to publish job:stats-updated to Mercure");
		});
	});
}

/**
 * Starts the worker with retry logic.
 * Retries startup on transient failures (e.g., database not ready, Parameter Store hiccup)
 * to prevent rapid crash loops that trigger the ECS circuit breaker.
 */
async function startWithRetry(): Promise<void> {
	const maxAttempts = 3;
	const baseDelayMs = 5000;
	const maxDelayMs = 30000;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await main();
			return;
		} catch (error) {
			if (attempt === maxAttempts) {
				log.error(error, "Fatal error in worker after %d attempts, exiting", maxAttempts);
				process.exit(1);
			}

			const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
			log.error(error, "Worker startup failed (attempt %d/%d), retrying in %dms", attempt, maxAttempts, delay);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
}

// Run the worker with startup retry
startWithRetry().catch(error => {
	log.error(error, "Fatal error in worker startup retry");
	process.exit(1);
});
