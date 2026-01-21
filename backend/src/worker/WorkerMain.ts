/**
 * Worker entry point for AWS ECS Fargate.
 * This runs as a standalone process (no Express server) that processes jobs
 * across all tenants and orgs in multi-tenant mode.
 */
/* v8 ignore start - Entry point file, similar to Main.ts */
import { getConfig, initializeConfig } from "../config/Config.js";
import { createCoreJobs } from "../jobs/CoreJobs.js";
import { createDemoJobs } from "../jobs/DemoJobs.js";
import { createMultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager.js";
import { createMercureService } from "../services/MercureService.js";
import { createTenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager.js";
import { createTenantRegistryClient } from "../tenant/TenantRegistryClient.js";
import { decryptDatabasePassword } from "../util/DecryptPassword.js";
import { getLog } from "../util/Logger.js";
import { startWorkerPolling, type WorkerPollingConfig } from "./WorkerPolling.js";

const log = getLog(import.meta);

/**
 * Main worker entry point.
 * Initializes configuration, creates scheduler manager, and starts polling.
 */
async function main(): Promise<void> {
	log.info("Starting Jolli Worker...");

	// Initialize configuration from provider chain
	await initializeConfig();
	const config = getConfig();

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
	// Create mock JobDao since we won't be using it directly in worker mode
	// The actual DAOs are created per-tenant when the scheduler is initialized
	const mockJobDao = {
		createJobExecution: () => Promise.resolve(),
		updateJobStatus: () => Promise.resolve(),
		appendLog: () => Promise.resolve(),
		updateStats: () => Promise.resolve(),
		updateCompletionInfo: () => Promise.resolve(),
		getJobExecution: () => Promise.resolve(undefined),
		listJobExecutions: () => Promise.resolve([]),
		deleteOldExecutions: () => Promise.resolve(0),
		pinJob: () => Promise.resolve(),
		unpinJob: () => Promise.resolve(),
		dismissJob: () => Promise.resolve(),
		deleteAllJobs: () => Promise.resolve(),
	};

	const coreJobs = createCoreJobs(mockJobDao);
	const demoJobs = createDemoJobs();

	// Register job definitions
	// Note: KnowledgeGraphJobs and JobsToJrnAdapter will be added once they
	// have getDefinitions() methods
	const allDefinitions = [...coreJobs.getDefinitions(), ...demoJobs.getDefinitions()];
	schedulerManager.registerJobDefinitions(allDefinitions);

	log.info({ jobCount: allDefinitions.length }, "Registered %d job definitions", allDefinitions.length);

	// Set up Mercure for job event publishing (if enabled)
	const mercureService = createMercureService();
	if (mercureService.isEnabled()) {
		log.info("Mercure enabled for job event publishing");
	} else {
		log.info("Mercure not enabled - job events will not be published");
	}

	// Start polling for tenant/org pairs
	const pollingConfig: WorkerPollingConfig = {
		pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
		maxConcurrentSchedulers: config.WORKER_MAX_SCHEDULERS,
	};

	await startWorkerPolling(schedulerManager, registryClient, pollingConfig);

	log.info("Worker polling started");

	// Handle graceful shutdown
	const shutdown = async (signal: string) => {
		log.info({ signal }, "Received %s signal, shutting down...", signal);

		try {
			await schedulerManager.closeAll();
			await connectionManager.closeAll();
			log.info("Graceful shutdown complete");
			process.exit(0);
		} catch (error) {
			log.error(error, "Error during shutdown");
			process.exit(1);
		}
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	log.info("Worker ready and processing jobs");
}

// Run the worker
main().catch(error => {
	log.error(error, "Fatal error in worker");
	process.exit(1);
});
