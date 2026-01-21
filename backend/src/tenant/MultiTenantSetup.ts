import { getConfig } from "../config/Config";
import type { Database } from "../core/Database";
import { getLog } from "../util/Logger";
import { createTenantMiddleware, type TenantMiddlewareConfig } from "./TenantMiddleware";
import {
	createTenantOrgConnectionManager,
	type TenantOrgConnectionManager,
	type TenantOrgConnectionManagerConfig,
} from "./TenantOrgConnectionManager";
import { createTenantRegistryClient, type TenantRegistryClient } from "./TenantRegistryClient";
import type { RequestHandler } from "express";

const log = getLog(import.meta);

/**
 * Multi-tenant infrastructure components.
 */
export interface MultiTenantInfrastructure {
	/** Client for querying the tenant registry database */
	registryClient: TenantRegistryClient;
	/** Connection manager with LRU caching */
	connectionManager: TenantOrgConnectionManager;
	/** Express middleware for resolving tenant/org context */
	middleware: RequestHandler;
	/** Cleanup function to close all connections */
	shutdown: () => Promise<void>;
}

/**
 * Configuration for multi-tenant setup.
 */
export interface MultiTenantSetupConfig {
	/** URL for the tenant registry database */
	registryDatabaseUrl: string;
	/** Function to decrypt encrypted database passwords */
	decryptPassword: (encrypted: string) => Promise<string>;
	/** Default database for the "jolli" tenant fallback */
	defaultDatabase: Database;
	/** Maximum number of cached connections (default: 100) */
	maxConnections?: number;
	/** TTL for cached connections in ms (default: 30 minutes) */
	ttlMs?: number;
	/** Pool max per connection (default: 5) */
	poolMaxPerConnection?: number;
	/** Whether to enable Sequelize logging (default: false) */
	logging?: boolean;
}

/**
 * Creates multi-tenant infrastructure components from configuration.
 * Returns undefined if multi-tenant mode is not enabled.
 */
export function createMultiTenantInfrastructure(config: MultiTenantSetupConfig): MultiTenantInfrastructure {
	log.info("Initializing multi-tenant infrastructure");

	// Create registry client
	const registryClient = createTenantRegistryClient({
		registryDatabaseUrl: config.registryDatabaseUrl,
	});

	// Create connection manager (needs registry client to fetch database configs)
	const connectionManagerConfig: TenantOrgConnectionManagerConfig = {
		registryClient,
		decryptPassword: config.decryptPassword,
		maxConnections: config.maxConnections,
		ttlMs: config.ttlMs,
		poolMax: config.poolMaxPerConnection,
		logging: config.logging,
	};
	const connectionManager = createTenantOrgConnectionManager(connectionManagerConfig);

	// Create middleware
	const baseDomain = getConfig().BASE_DOMAIN;
	const middlewareConfig: TenantMiddlewareConfig = {
		registryClient,
		connectionManager,
		defaultDatabase: config.defaultDatabase,
		...(baseDomain && { baseDomain }),
	};
	const middleware = createTenantMiddleware(middlewareConfig);

	// Create shutdown function
	async function shutdown(): Promise<void> {
		log.info("Shutting down multi-tenant infrastructure");
		await connectionManager.closeAll();
		await registryClient.close();
		log.info("Multi-tenant infrastructure shutdown complete");
	}

	log.info("Multi-tenant infrastructure initialized");

	return {
		registryClient,
		connectionManager,
		middleware,
		shutdown,
	};
}

/**
 * Creates multi-tenant infrastructure from environment configuration.
 * Returns undefined if multi-tenant mode is not enabled.
 *
 * @param decryptPassword Function to decrypt encrypted database passwords
 * @param defaultDatabase Default database for the "jolli" tenant fallback
 */
export function createMultiTenantFromEnv(
	decryptPassword: (encrypted: string) => Promise<string>,
	defaultDatabase: Database,
): MultiTenantInfrastructure | undefined {
	const envConfig = getConfig();

	if (!envConfig.MULTI_TENANT_ENABLED) {
		log.info("Multi-tenant mode is disabled");
		return;
	}

	const registryUrl = envConfig.MULTI_TENANT_REGISTRY_URL;
	if (!registryUrl) {
		throw new Error("MULTI_TENANT_REGISTRY_URL is required when MULTI_TENANT_ENABLED is true");
	}

	return createMultiTenantInfrastructure({
		registryDatabaseUrl: registryUrl,
		decryptPassword,
		defaultDatabase,
		maxConnections: envConfig.MULTI_TENANT_CONNECTION_POOL_MAX,
		ttlMs: envConfig.MULTI_TENANT_CONNECTION_TTL_MS,
		poolMaxPerConnection: envConfig.MULTI_TENANT_POOL_MAX_PER_CONNECTION,
		logging: envConfig.POSTGRES_LOGGING,
	});
}
