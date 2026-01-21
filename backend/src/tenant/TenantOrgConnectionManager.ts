/**
 * TenantOrgConnectionManager - Multi-tenant database connection management.
 *
 * ## Schema Isolation Strategy
 *
 * This module uses PostgreSQL's `search_path` mechanism for org-level data isolation:
 *
 * 1. Each org has its own schema (e.g., "org_engineering", "org_marketing")
 * 2. When a connection is created, we run `SET search_path TO "${schemaName}", public`
 * 3. All subsequent queries use tables from the org's schema automatically
 * 4. No changes to model definitions are required - they work transparently
 *
 * ## Connection Pooling
 *
 * Connections are cached by `${tenantId}:${orgId}` key with LRU eviction:
 * - Each tenant-org pair gets its own Sequelize instance
 * - Connections are reused for the same tenant-org pair
 * - LRU eviction removes least-recently-used connections when at capacity
 * - TTL-based expiration removes idle connections
 *
 * ## Thread Safety
 *
 * Concurrent requests for the same tenant-org pair are handled safely:
 * - First request creates a "pending" entry with an initialization promise
 * - Subsequent requests wait on the same promise
 * - Only one connection is created per tenant-org pair
 *
 * @module TenantOrgConnectionManager
 */

import type { CreateDatabaseOptions, Database } from "../core/Database";
import { getLog } from "../util/Logger";
import type { TenantDatabaseConfig } from "./TenantDatabaseConfig";
import type { TenantRegistryClient } from "./TenantRegistryClient";
import { createTenantDatabase, createTenantSequelize } from "./TenantSequelizeFactory";
import type { Org, Tenant } from "jolli-common";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Cache entry for a tenant-org connection.
 */
interface ConnectionCacheEntry {
	/** Sequelize instance for this tenant's database */
	sequelize: Sequelize;
	/** Database instance with DAOs */
	database: Database;
	/** Schema name for this org */
	schemaName: string;
	/** Timestamp when this entry was last used */
	lastUsed: number;
	/** Whether this entry is currently being initialized */
	initializing?: Promise<ConnectionCacheEntry>;
}

/**
 * Configuration for the TenantOrgConnectionManager.
 */
export interface TenantOrgConnectionManagerConfig {
	/** Registry client to fetch tenant database config (required) */
	registryClient: TenantRegistryClient;
	/** Maximum number of cached connections (default: 100) */
	maxConnections?: number | undefined;
	/** Time-to-live in milliseconds for cached connections (default: 30 minutes) */
	ttlMs?: number | undefined;
	/** Function to decrypt database passwords */
	decryptPassword: (encrypted: string) => Promise<string>;
	/** Pool max per connection (default: 5) */
	poolMax?: number | undefined;
	/** Whether to enable Sequelize logging (default: false) */
	logging?: boolean | undefined;
}

/**
 * Options for getConnection.
 */
export interface GetConnectionOptions {
	/**
	 * Force sequelize.sync() to run even in Vercel/serverless environments.
	 * Use this during bootstrap operations where we need to create tables.
	 */
	forceSync?: boolean;
}

/**
 * Manager for tenant-org database connections with LRU caching.
 * Each cache entry is keyed by `${tenantId}:${orgId}` and contains
 * a Sequelize instance with the search_path set to the org's schema.
 */
export interface TenantOrgConnectionManager {
	/**
	 * Get or create a database connection for the given tenant and org.
	 * Sets the search_path to the org's schema.
	 * @param tenant - The tenant
	 * @param org - The org
	 * @param options - Options including forceSync for bootstrap operations
	 */
	getConnection(tenant: Tenant, org: Org, options?: GetConnectionOptions): Promise<Database>;

	/**
	 * Remove a specific connection from the cache and close it.
	 */
	evictConnection(tenantId: string, orgId: string): Promise<void>;

	/**
	 * Close all cached connections and clear the cache.
	 */
	closeAll(): Promise<void>;

	/**
	 * Get the current number of cached connections.
	 */
	getCacheSize(): number;

	/**
	 * Run TTL eviction - removes entries older than ttlMs.
	 */
	evictExpired(): Promise<void>;
}

/**
 * Internal configuration that allows injecting dependencies for testing.
 */
export interface TenantOrgConnectionManagerInternalConfig extends TenantOrgConnectionManagerConfig {
	/** For testing - factory function to create Database instances */
	createDatabaseFn?: (sequelize: Sequelize, options?: CreateDatabaseOptions) => Promise<Database>;
	/** For testing - factory function to create Sequelize instances */
	createSequelizeFn?: (dbConfig: TenantDatabaseConfig, password: string, schemaName: string) => Sequelize;
}

/**
 * Create a TenantOrgConnectionManager with LRU caching.
 */
export function createTenantOrgConnectionManager(
	config: TenantOrgConnectionManagerInternalConfig,
): TenantOrgConnectionManager {
	const { registryClient } = config;
	const maxConnections = config.maxConnections ?? 100;
	const ttlMs = config.ttlMs ?? 30 * 60 * 1000; // 30 minutes default
	const poolMax = config.poolMax ?? 5;
	const logging = config.logging ?? false;

	const cache = new Map<string, ConnectionCacheEntry>();

	function getCacheKey(tenantId: string, orgId: string): string {
		return `${tenantId}:${orgId}`;
	}

	function createSequelizeForDbConfig(
		dbConfig: TenantDatabaseConfig,
		password: string,
		schemaName: string,
	): Sequelize {
		if (config.createSequelizeFn) {
			return config.createSequelizeFn(dbConfig, password, schemaName);
		}
		return createTenantSequelize(dbConfig, password, poolMax, logging, schemaName);
	}

	function createDatabaseInstance(sequelize: Sequelize, options?: CreateDatabaseOptions): Promise<Database> {
		if (config.createDatabaseFn) {
			return config.createDatabaseFn(sequelize, options);
		}
		return createTenantDatabase(sequelize, options);
	}

	function evictLRU(): void {
		if (cache.size < maxConnections) {
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
			if (entry) {
				log.info("LRU eviction for connection: %s", oldestKey);
				// Close asynchronously - don't wait
				entry.sequelize.close().catch(err => {
					log.warn("Error closing evicted connection %s: %s", oldestKey, err);
				});
			}
		}
	}

	async function getConnection(tenant: Tenant, org: Org, options?: GetConnectionOptions): Promise<Database> {
		const key = getCacheKey(tenant.id, org.id);
		const now = Date.now();

		// Check if entry exists in cache
		const existing = cache.get(key);
		if (existing) {
			// Check if it's currently being initialized
			if (existing.initializing) {
				log.debug("Waiting for initializing connection: %s", key);
				const initialized = await existing.initializing;
				return initialized.database;
			}

			// Update lastUsed and return
			existing.lastUsed = now;
			log.debug("Cache hit for connection: %s", key);
			return existing.database;
		}

		// Need to create a new connection
		log.info("Cache miss - creating new connection for tenant %s, org %s", tenant.id, org.id);

		// Evict LRU entry if at capacity
		evictLRU();

		// Create placeholder entry with initializing promise to prevent duplicate creation
		const initPromise = (async (): Promise<ConnectionCacheEntry> => {
			// Fetch database config separately from tenant (keeps Tenant interface clean)
			const dbConfig = await registryClient.getTenantDatabaseConfig(tenant.id);
			if (!dbConfig) {
				throw new Error(`No database config found for tenant: ${tenant.slug} (${tenant.id})`);
			}

			const password = await config.decryptPassword(dbConfig.databasePasswordEncrypted);
			// Pass schemaName so the connection options set search_path on ALL connections
			const sequelize = createSequelizeForDbConfig(dbConfig, password, org.schemaName);

			// Pass forceSync to createDatabaseInstance - used during bootstrap to force table creation
			const database = await createDatabaseInstance(
				sequelize,
				options?.forceSync ? { forceSync: true } : undefined,
			);

			const entry: ConnectionCacheEntry = {
				sequelize,
				database,
				schemaName: org.schemaName,
				lastUsed: Date.now(),
			};

			// Update cache entry with completed initialization
			cache.set(key, entry);

			log.info("Created connection for tenant %s, org %s (schema: %s)", tenant.id, org.id, org.schemaName);

			return entry;
		})();

		// Store placeholder with initializing promise
		cache.set(key, {
			sequelize: null as unknown as Sequelize,
			database: null as unknown as Database,
			schemaName: org.schemaName,
			lastUsed: now,
			initializing: initPromise,
		});

		try {
			const entry = await initPromise;
			return entry.database;
		} catch (error) {
			// Remove failed entry from cache
			cache.delete(key);
			throw error;
		}
	}

	async function evictConnection(tenantId: string, orgId: string): Promise<void> {
		const key = getCacheKey(tenantId, orgId);
		const entry = cache.get(key);

		if (entry) {
			cache.delete(key);

			// Wait for initialization to complete if in progress
			if (entry.initializing) {
				try {
					const initialized = await entry.initializing;
					await initialized.sequelize.close();
				} catch {
					// Initialization failed, nothing to close
				}
			} else {
				await entry.sequelize.close();
			}

			log.info("Evicted connection: %s", key);
		}
	}

	async function closeAll(): Promise<void> {
		log.info("Closing all %d cached connections", cache.size);

		const closePromises: Array<Promise<void>> = [];

		for (const [key, entry] of cache.entries()) {
			const closePromise = (async () => {
				try {
					if (entry.initializing) {
						const initialized = await entry.initializing;
						await initialized.sequelize.close();
					} else {
						await entry.sequelize.close();
					}
					log.debug("Closed connection: %s", key);
				} catch (err) {
					log.warn("Error closing connection %s: %s", key, err);
				}
			})();
			closePromises.push(closePromise);
		}

		await Promise.all(closePromises);
		cache.clear();

		log.info("All connections closed");
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
			log.info("Evicting %d expired connections", expiredKeys.length);

			for (const key of expiredKeys) {
				const entry = cache.get(key);
				if (entry) {
					cache.delete(key);
					try {
						await entry.sequelize.close();
						log.debug("Closed expired connection: %s", key);
					} catch (err) {
						log.warn("Error closing expired connection %s: %s", key, err);
					}
				}
			}
		}
	}

	return {
		getConnection,
		evictConnection,
		closeAll,
		getCacheSize,
		evictExpired,
	};
}
