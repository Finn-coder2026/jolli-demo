/**
 * MultiTenantJobSchedulerManager - Manages pg-boss instances per tenant-org.
 *
 * ## Multi-Tenant Mode
 *
 * When a registry client is provided, this manager creates and caches pg-boss
 * schedulers for each tenant-org pair. Each org gets its own pg-boss tables
 * in its schema (e.g., public.job for default org, org_engineering.job for
 * additional orgs).
 *
 * ## Single-Tenant Mode (Backward Compatibility)
 *
 * When no registry client is provided, this manager uses a single scheduler
 * with the default configuration - exactly like the existing behavior.
 * This ensures existing deployments continue to work without changes.
 *
 * ## Connection Pooling
 *
 * Schedulers are cached with LRU eviction and TTL-based expiration:
 * - Each tenant-org pair gets its own pg-boss instance
 * - Schedulers are reused for the same tenant-org pair
 * - LRU eviction removes least-recently-used schedulers when at capacity
 * - TTL-based expiration removes idle schedulers
 *
 * @module MultiTenantJobSchedulerManager
 */

import type { Database } from "../core/Database";
import { getTenantContext } from "../tenant/TenantContext";
import type { TenantDatabaseConfig } from "../tenant/TenantDatabaseConfig";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type { JobDefinition } from "../types/JobTypes";
import { getLog } from "../util/Logger";
import { createJobScheduler, type JobScheduler } from "./JobScheduler";
import { createTenantOrgJobScheduler, type TenantOrgJobScheduler } from "./TenantOrgJobScheduler";
import type { Org, OrgSummary, Tenant, TenantSummary } from "jolli-common";

const log = getLog(import.meta);

/**
 * Configuration for the MultiTenantJobSchedulerManager.
 */
export interface MultiTenantJobSchedulerManagerConfig {
	/**
	 * Registry client to fetch tenant/org information.
	 * If not provided, single-tenant mode is used.
	 */
	registryClient?: TenantRegistryClient | undefined;

	/**
	 * Connection manager to get database connections per tenant-org.
	 * Required for multi-tenant mode.
	 */
	connectionManager?: TenantOrgConnectionManager | undefined;

	/**
	 * Default database for single-tenant mode.
	 * Required for single-tenant mode (when registryClient is not provided).
	 */
	defaultDatabase?: Database | undefined;

	/**
	 * Whether to run workers that process jobs.
	 * - true: Workers run, processing jobs
	 * - false: Only queue jobs, don't process them (for Vercel serverless)
	 */
	workerMode: boolean;

	/**
	 * Maximum number of cached schedulers (default: 100).
	 */
	maxSchedulers?: number | undefined;

	/**
	 * Time-to-live in milliseconds for cached schedulers (default: 30 minutes).
	 */
	ttlMs?: number | undefined;

	/**
	 * Function to decrypt database passwords.
	 * Required for multi-tenant mode.
	 */
	decryptPassword?: ((encrypted: string) => Promise<string>) | undefined;
}

/**
 * Cache entry for a tenant-org scheduler.
 */
interface SchedulerCacheEntry {
	/** The wrapped scheduler */
	scheduler: TenantOrgJobScheduler;
	/** Timestamp when this entry was last used */
	lastUsed: number;
	/** Whether this entry is currently being initialized */
	initializing?: Promise<SchedulerCacheEntry>;
}

/**
 * Callback function type for registering jobs on a scheduler.
 * Called when a new scheduler is created to register all jobs.
 */
export type JobRegistrationCallback = (scheduler: JobScheduler) => void;

/**
 * Manager for job schedulers with multi-tenant support.
 */
export interface MultiTenantJobSchedulerManager {
	/**
	 * Get or create a scheduler for the given tenant and org.
	 */
	getScheduler(tenant: Tenant, org: Org): Promise<TenantOrgJobScheduler>;

	/**
	 * Get a scheduler for the current TenantContext.
	 * Falls back to default scheduler in single-tenant mode.
	 */
	getSchedulerForContext(): Promise<TenantOrgJobScheduler>;

	/**
	 * Register job definitions that will be applied to all schedulers.
	 * This stores the definitions and applies them when schedulers are created.
	 */
	registerJobDefinitions(definitions: Array<JobDefinition>): void;

	/**
	 * Set a callback that will be called to register jobs on new schedulers.
	 * This is an alternative to registerJobDefinitions() for job groups that
	 * have complex dependencies or closures.
	 */
	setJobRegistrationCallback(callback: JobRegistrationCallback): void;

	/**
	 * List all active tenant-org pairs (for worker polling).
	 * Returns empty array in single-tenant mode.
	 * Returns summary types since not all fields are needed for scheduling.
	 */
	listActiveSchedulers(): Promise<Array<{ tenant: TenantSummary; org: OrgSummary }>>;

	/**
	 * Get the underlying single-tenant scheduler (for backward compatibility).
	 * Returns undefined in multi-tenant mode.
	 */
	getSingleTenantScheduler(): JobScheduler | undefined;

	/**
	 * Close all cached schedulers.
	 */
	closeAll(): Promise<void>;

	/**
	 * Get the current number of cached schedulers.
	 */
	getCacheSize(): number;

	/**
	 * Run TTL eviction - removes schedulers older than ttlMs.
	 */
	evictExpired(): Promise<void>;
}

/**
 * Build a PostgreSQL connection string from TenantDatabaseConfig.
 */
function buildConnectionString(dbConfig: TenantDatabaseConfig, password: string): string {
	const username = encodeURIComponent(dbConfig.databaseUsername);
	const encodedPassword = encodeURIComponent(password);
	const host = dbConfig.databaseHost;
	const port = dbConfig.databasePort;
	const database = dbConfig.databaseName;

	return `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
}

/**
 * Create a MultiTenantJobSchedulerManager.
 */
export function createMultiTenantJobSchedulerManager(
	config: MultiTenantJobSchedulerManagerConfig,
): MultiTenantJobSchedulerManager {
	const { registryClient, connectionManager, defaultDatabase, workerMode } = config;
	const maxSchedulers = config.maxSchedulers ?? 100;
	const ttlMs = config.ttlMs ?? 30 * 60 * 1000; // 30 minutes default

	const cache = new Map<string, SchedulerCacheEntry>();
	const jobDefinitions: Array<JobDefinition> = [];
	let jobRegistrationCallback: JobRegistrationCallback | undefined;

	// Single-tenant mode variables
	let singleTenantScheduler: TenantOrgJobScheduler | undefined;
	let singleTenantJobScheduler: JobScheduler | undefined;

	// Check if we're in single-tenant mode
	const isSingleTenantMode = !registryClient;

	if (isSingleTenantMode) {
		if (!defaultDatabase) {
			throw new Error("defaultDatabase is required for single-tenant mode");
		}
		log.info("MultiTenantJobSchedulerManager: Single-tenant mode (no registry client)");
	} else {
		if (!connectionManager) {
			throw new Error("connectionManager is required for multi-tenant mode");
		}
		if (!config.decryptPassword) {
			throw new Error("decryptPassword is required for multi-tenant mode");
		}
		log.info("MultiTenantJobSchedulerManager: Multi-tenant mode");
	}

	/**
	 * Initialize the single-tenant scheduler.
	 */
	function initSingleTenantScheduler(): TenantOrgJobScheduler {
		if (singleTenantScheduler) {
			return singleTenantScheduler;
		}

		if (!defaultDatabase) {
			throw new Error("defaultDatabase is required for single-tenant mode");
		}

		log.info("Creating single-tenant job scheduler");

		// Create the underlying scheduler with default configuration
		singleTenantJobScheduler = createJobScheduler({
			jobDao: defaultDatabase.jobDao,
			schema: "pgboss", // Use existing schema for backward compatibility
			workerMode,
		});

		// Register all job definitions
		for (const definition of jobDefinitions) {
			singleTenantJobScheduler.registerJob(definition);
		}

		// Call registration callback if set
		if (jobRegistrationCallback) {
			jobRegistrationCallback(singleTenantJobScheduler);
		}

		// Create a "fake" tenant and org for the wrapper
		const now = new Date();
		const defaultTenant: Tenant = {
			id: "default",
			slug: "default",
			displayName: "Default Tenant",
			status: "active",
			deploymentType: "shared",
			databaseProviderId: "default",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			createdAt: now,
			updatedAt: now,
			provisionedAt: now,
		};

		const defaultOrg: Org = {
			id: "default",
			tenantId: "default",
			slug: "default",
			displayName: "Default Org",
			schemaName: "public",
			isDefault: true,
			status: "active",
			createdAt: now,
			updatedAt: now,
		};

		singleTenantScheduler = createTenantOrgJobScheduler({
			tenant: defaultTenant,
			org: defaultOrg,
			scheduler: singleTenantJobScheduler,
		});

		return singleTenantScheduler;
	}

	function getCacheKey(tenantId: string, orgId: string): string {
		return `${tenantId}:${orgId}`;
	}

	function evictLRU(): void {
		if (cache.size < maxSchedulers) {
			return;
		}

		// Find the entry with the oldest lastUsed timestamp
		let oldestKey: string | null = null;
		let oldestTime = Number.POSITIVE_INFINITY;

		for (const [key, entry] of cache.entries()) {
			if (entry.lastUsed < oldestTime) {
				oldestTime = entry.lastUsed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			const entry = cache.get(oldestKey);
			cache.delete(oldestKey);
			if (entry && !entry.initializing) {
				log.info("LRU eviction for scheduler: %s", oldestKey);
				// Stop the scheduler asynchronously
				entry.scheduler.stop().catch(err => {
					log.warn("Error stopping evicted scheduler %s: %s", oldestKey, err);
				});
			}
		}
	}

	async function getScheduler(tenant: Tenant, org: Org): Promise<TenantOrgJobScheduler> {
		// In single-tenant mode, always return the single scheduler
		if (isSingleTenantMode) {
			return initSingleTenantScheduler();
		}

		const key = getCacheKey(tenant.id, org.id);
		const now = Date.now();

		// Check if entry exists in cache
		const existing = cache.get(key);
		if (existing) {
			// Check if it's currently being initialized
			if (existing.initializing) {
				log.debug("Waiting for initializing scheduler: %s", key);
				const initialized = await existing.initializing;
				return initialized.scheduler;
			}

			// Update lastUsed and return
			existing.lastUsed = now;
			log.debug("Cache hit for scheduler: %s", key);
			return existing.scheduler;
		}

		// Need to create a new scheduler
		log.info("Cache miss - creating new scheduler for tenant %s, org %s", tenant.id, org.id);

		// Evict LRU entry if at capacity
		evictLRU();

		// Create placeholder entry with initializing promise
		const initPromise = (async (): Promise<SchedulerCacheEntry> => {
			// These should be guaranteed by the multi-tenant mode validation at initialization
			if (!registryClient || !connectionManager || !config.decryptPassword) {
				throw new Error(
					"Multi-tenant mode required but registryClient, connectionManager, or decryptPassword is missing",
				);
			}

			// Get database config for the tenant
			const dbConfig = await registryClient.getTenantDatabaseConfig(tenant.id);
			if (!dbConfig) {
				throw new Error(`No database config found for tenant: ${tenant.slug} (${tenant.id})`);
			}

			// Decrypt the password
			const password = await config.decryptPassword(dbConfig.databasePasswordEncrypted);

			// Build connection string for pg-boss
			const connectionString = buildConnectionString(dbConfig, password);

			// Get the database instance for the JobDao
			const database = await connectionManager.getConnection(tenant, org);

			// Create the job scheduler with the org's schema
			const scheduler = createJobScheduler({
				jobDao: database.jobDao,
				schema: org.schemaName, // Use org's schema for pg-boss tables
				connection: {
					connectionString,
					ssl: dbConfig.databaseSsl,
				},
				workerMode,
			});

			// Register all job definitions
			for (const definition of jobDefinitions) {
				scheduler.registerJob(definition);
			}

			// Call registration callback if set
			if (jobRegistrationCallback) {
				jobRegistrationCallback(scheduler);
			}

			// Start the scheduler
			await scheduler.start();

			// Create the wrapped scheduler
			const tenantOrgScheduler = createTenantOrgJobScheduler({
				tenant,
				org,
				scheduler,
			});

			const entry: SchedulerCacheEntry = {
				scheduler: tenantOrgScheduler,
				lastUsed: Date.now(),
			};

			// Update cache entry with completed initialization
			cache.set(key, entry);

			log.info("Created scheduler for tenant %s, org %s (schema: %s)", tenant.id, org.id, org.schemaName);

			return entry;
		})();

		// Store placeholder with initializing promise
		cache.set(key, {
			scheduler: null as unknown as TenantOrgJobScheduler,
			lastUsed: now,
			initializing: initPromise,
		});

		try {
			const entry = await initPromise;
			return entry.scheduler;
		} catch (error) {
			// Remove failed entry from cache
			cache.delete(key);
			throw error;
		}
	}

	async function getSchedulerForContext(): Promise<TenantOrgJobScheduler> {
		// In single-tenant mode, always return the single scheduler
		if (isSingleTenantMode) {
			return await initSingleTenantScheduler();
		}

		// Get the current tenant context
		const context = getTenantContext();
		if (!context) {
			// No tenant context - this shouldn't happen in multi-tenant mode
			// but we handle it gracefully by throwing an error
			throw new Error("No tenant context available. Are you in a tenant-scoped request?");
		}

		return await getScheduler(context.tenant, context.org);
	}

	function registerJobDefinitions(definitions: Array<JobDefinition>): void {
		// Store definitions for future schedulers
		jobDefinitions.push(...definitions);

		// Register with existing single-tenant scheduler if it exists
		if (singleTenantJobScheduler) {
			for (const definition of definitions) {
				singleTenantJobScheduler.registerJob(definition);
			}
		}

		// Register with existing cached schedulers
		for (const entry of cache.values()) {
			if (!entry.initializing && entry.scheduler) {
				for (const definition of definitions) {
					entry.scheduler.registerJob(definition);
				}
			}
		}

		log.info("Registered %d job definitions", definitions.length);
	}

	function setJobRegistrationCallback(callback: JobRegistrationCallback): void {
		jobRegistrationCallback = callback;

		// If single-tenant scheduler already exists, call the callback on it
		if (singleTenantJobScheduler) {
			callback(singleTenantJobScheduler);
		}

		// Call on existing cached schedulers
		for (const entry of cache.values()) {
			if (!entry.initializing && entry.scheduler) {
				callback(entry.scheduler.scheduler);
			}
		}

		log.info("Set job registration callback");
	}

	async function listActiveSchedulers(): Promise<Array<{ tenant: TenantSummary; org: OrgSummary }>> {
		// In single-tenant mode, return empty array (no tenant-org pairs to iterate)
		if (isSingleTenantMode) {
			return [];
		}

		// List all active tenants and their orgs
		const result: Array<{ tenant: TenantSummary; org: OrgSummary }> = [];

		const tenants = await registryClient?.listTenants();
		for (const tenant of tenants) {
			if (tenant.status !== "active") {
				continue;
			}

			const orgs = await registryClient?.listOrgs(tenant.id);
			for (const org of orgs) {
				if (org.status !== "active") {
					continue;
				}

				result.push({ tenant, org });
			}
		}

		return result;
	}

	function getSingleTenantScheduler(): JobScheduler | undefined {
		if (isSingleTenantMode) {
			// Initialize if needed and return the underlying scheduler
			initSingleTenantScheduler();
			return singleTenantJobScheduler;
		}
		return;
	}

	async function closeAll(): Promise<void> {
		log.info("Closing all %d cached schedulers", cache.size);

		const closePromises: Array<Promise<void>> = [];

		// Close cached multi-tenant schedulers
		for (const [key, entry] of cache.entries()) {
			const closePromise = (async () => {
				try {
					if (entry.initializing) {
						const initialized = await entry.initializing;
						await initialized.scheduler.stop();
					} else if (entry.scheduler) {
						await entry.scheduler.stop();
					}
					log.debug("Closed scheduler: %s", key);
				} catch (err) {
					log.warn("Error closing scheduler %s: %s", key, err);
				}
			})();
			closePromises.push(closePromise);
		}

		// Close single-tenant scheduler if it exists
		if (singleTenantScheduler) {
			closePromises.push(
				singleTenantScheduler.stop().catch(err => {
					log.warn("Error closing single-tenant scheduler: %s", err);
				}),
			);
		}

		await Promise.all(closePromises);
		cache.clear();
		singleTenantScheduler = undefined;
		singleTenantJobScheduler = undefined;

		log.info("All schedulers closed");
	}

	function getCacheSize(): number {
		return cache.size;
	}

	async function evictExpired(): Promise<void> {
		const now = Date.now();
		const expiredKeys: Array<string> = [];

		for (const [key, entry] of cache.entries()) {
			// Don't evict entries that are still initializing
			if (!entry.initializing && now - entry.lastUsed > ttlMs) {
				expiredKeys.push(key);
			}
		}

		if (expiredKeys.length > 0) {
			log.info("Evicting %d expired schedulers", expiredKeys.length);

			for (const key of expiredKeys) {
				const entry = cache.get(key);
				if (entry) {
					cache.delete(key);
					try {
						await entry.scheduler.stop();
						log.debug("Closed expired scheduler: %s", key);
					} catch (err) {
						log.warn("Error closing expired scheduler %s: %s", key, err);
					}
				}
			}
		}
	}

	return {
		getScheduler,
		getSchedulerForContext,
		registerJobDefinitions,
		setJobRegistrationCallback,
		listActiveSchedulers,
		getSingleTenantScheduler,
		closeAll,
		getCacheSize,
		evictExpired,
	};
}
