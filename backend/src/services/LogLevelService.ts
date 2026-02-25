import { getLog } from "../util/Logger";
import type { RedisClientType } from "../util/RedisClient";
import type { LogLevel, LogLevelState } from "jolli-common";
import { loggerRegistry } from "jolli-common";

const log = getLog(import.meta);

/**
 * Redis pub/sub channel name for log level state synchronization.
 */
const LOG_LEVEL_CHANNEL = "jolli:log-level:sync";

/**
 * Redis key for persisting log level state.
 */
const LOG_LEVEL_STATE_KEY = "jolli:log-level:state";

/**
 * Service for managing log levels at runtime.
 *
 * Supports:
 * - Global log level changes
 * - Module-specific overrides
 * - Tenant+Org specific overrides (for debugging specific customers)
 * - Tenant+Org+Module specific overrides (for debugging specific modules for specific customers)
 * - Optional Redis pub/sub for multi-instance synchronization
 */
export interface LogLevelService {
	/**
	 * Set the global log level for all loggers.
	 */
	setGlobalLevel(level: LogLevel): Promise<void>;

	/**
	 * Set or clear a module-specific log level override.
	 * @param moduleName - The module name
	 * @param level - The log level, or null to clear the override
	 */
	setModuleLevel(moduleName: string, level: LogLevel | null): Promise<void>;

	/**
	 * Set or clear a tenant+org specific log level override.
	 * @param tenantSlug - The tenant slug
	 * @param orgSlug - The org slug
	 * @param level - The log level, or null to clear the override
	 */
	setTenantOrgLevel(tenantSlug: string, orgSlug: string, level: LogLevel | null): Promise<void>;

	/**
	 * Set or clear a tenant+org+module specific log level override.
	 * This is the most specific override, targeting a particular module within a tenant+org.
	 * @param tenantSlug - The tenant slug
	 * @param orgSlug - The org slug
	 * @param moduleName - The module name
	 * @param level - The log level, or null to clear the override
	 */
	setTenantOrgModuleLevel(
		tenantSlug: string,
		orgSlug: string,
		moduleName: string,
		level: LogLevel | null,
	): Promise<void>;

	/**
	 * Get the current log level state.
	 */
	getState(): LogLevelState;

	/**
	 * Get the list of registered logger module names.
	 */
	getRegisteredModules(): Array<string>;

	/**
	 * Close any connections (e.g., Redis subscriber).
	 */
	close(): Promise<void>;

	/**
	 * Clear all log level overrides (resets to default global level).
	 * Clears: modules, tenantOrg, tenantOrgModule overrides.
	 */
	clearAll(): Promise<void>;

	/**
	 * Clear overrides for a specific tenant+org.
	 * Clears BOTH tenant-org level AND all tenant-org-module overrides for that tenant+org.
	 */
	clearTenantOrg(tenantSlug: string, orgSlug: string): Promise<void>;
}

/**
 * Options for creating the LogLevelService.
 */
export interface LogLevelServiceOptions {
	/**
	 * Optional Redis client for pub/sub synchronization across instances.
	 * If provided, log level changes will be published and subscribed to.
	 * Supports both standalone Redis and MemoryDB cluster mode.
	 */
	redisClient?: RedisClientType;

	/**
	 * Initial global log level. Defaults to "info".
	 */
	initialLevel?: LogLevel;

	/**
	 * Whether to persist log level state to Redis. Defaults to true.
	 * Only takes effect when redisClient is provided.
	 */
	persistToRedis?: boolean;

	/**
	 * TTL for persisted log level state in Redis in seconds.
	 * Defaults to 86400 (24 hours). Set to 0 to disable TTL (persist indefinitely).
	 */
	persistTtlSeconds?: number;
}

/**
 * Create a LogLevelService instance.
 *
 * @param options - Configuration options
 * @returns Promise resolving to the LogLevelService instance
 */
export async function createLogLevelService(options: LogLevelServiceOptions = {}): Promise<LogLevelService> {
	const { redisClient, initialLevel = "info", persistToRedis = true, persistTtlSeconds = 86400 } = options;

	// Initialize the registry with the initial level
	loggerRegistry.setGlobalLevel(initialLevel);

	// Create a duplicate Redis client for subscribing (can't publish and subscribe on same client)
	let subscriberClient: RedisClientType | null = null;

	if (redisClient) {
		// Load persisted state from Redis on startup (before setting up subscriber)
		if (persistToRedis) {
			try {
				const savedState = await redisClient.get(LOG_LEVEL_STATE_KEY);
				if (savedState) {
					const state = JSON.parse(savedState) as LogLevelState;
					loggerRegistry.setState(state);
					log.info("Loaded persisted log level state from Redis");
				}
			} catch (err) {
				log.warn({ err }, "Failed to load persisted log level state from Redis");
			}
		}

		// Duplicate the client for subscription
		subscriberClient = redisClient.duplicate();

		// Subscribe to log level sync channel
		subscriberClient.subscribe(LOG_LEVEL_CHANNEL).catch((err: Error) => {
			log.warn({ err }, "Failed to subscribe to log level sync channel");
		});

		// Handle incoming messages
		subscriberClient.on("message", (channel, message) => {
			if (channel === LOG_LEVEL_CHANNEL) {
				try {
					const state = JSON.parse(message) as LogLevelState;
					log.debug("Received log level state sync via Redis");
					loggerRegistry.setState(state);
				} catch (err) {
					log.warn({ err }, "Failed to parse log level sync message");
				}
			}
		});

		log.info("LogLevelService initialized with Redis pub/sub sync");
	} else {
		log.info("LogLevelService initialized (single-instance mode)");
	}

	/**
	 * Publish current state to Redis for other instances to sync,
	 * and optionally persist to Redis for restart recovery.
	 */
	async function publishState(): Promise<void> {
		if (redisClient) {
			const state = loggerRegistry.getState();
			const stateJson = JSON.stringify(state);
			await redisClient.publish(LOG_LEVEL_CHANNEL, stateJson);

			if (persistToRedis) {
				if (persistTtlSeconds > 0) {
					await redisClient.setex(LOG_LEVEL_STATE_KEY, persistTtlSeconds, stateJson);
				} else {
					await redisClient.set(LOG_LEVEL_STATE_KEY, stateJson);
				}
			}
		}
	}

	return {
		async setGlobalLevel(level: LogLevel): Promise<void> {
			log.info({ level }, "Setting global log level");
			loggerRegistry.setGlobalLevel(level);
			await publishState();
		},

		async setModuleLevel(moduleName: string, level: LogLevel | null): Promise<void> {
			if (level === null) {
				log.info({ moduleName }, "Clearing module log level override");
			} else {
				log.info({ moduleName, level }, "Setting module log level override");
			}
			loggerRegistry.setModuleLevel(moduleName, level);
			await publishState();
		},

		async setTenantOrgLevel(tenantSlug: string, orgSlug: string, level: LogLevel | null): Promise<void> {
			if (level === null) {
				log.info({ tenantSlug, orgSlug }, "Clearing tenant+org log level override");
			} else {
				log.info({ tenantSlug, orgSlug, level }, "Setting tenant+org log level override");
			}
			loggerRegistry.setTenantOrgLevel(tenantSlug, orgSlug, level);
			await publishState();
		},

		async setTenantOrgModuleLevel(
			tenantSlug: string,
			orgSlug: string,
			moduleName: string,
			level: LogLevel | null,
		): Promise<void> {
			if (level === null) {
				log.info({ tenantSlug, orgSlug, moduleName }, "Clearing tenant+org+module log level override");
			} else {
				log.info({ tenantSlug, orgSlug, moduleName, level }, "Setting tenant+org+module log level override");
			}
			loggerRegistry.setTenantOrgModuleLevel(tenantSlug, orgSlug, moduleName, level);
			await publishState();
		},

		getState(): LogLevelState {
			return loggerRegistry.getState();
		},

		getRegisteredModules(): Array<string> {
			return loggerRegistry.getRegisteredModules();
		},

		async close(): Promise<void> {
			if (subscriberClient) {
				await subscriberClient.unsubscribe(LOG_LEVEL_CHANNEL);
				await subscriberClient.quit();
				subscriberClient = null;
				log.info("LogLevelService Redis subscriber closed");
			}
		},

		async clearAll(): Promise<void> {
			log.info("Clearing all log level overrides");
			const currentState = loggerRegistry.getState();
			// Reset to just global level, clearing all overrides
			loggerRegistry.setState({
				global: currentState.global,
				modules: {},
				tenantOrg: {},
				tenantOrgModule: {},
			});
			await publishState();
		},

		async clearTenantOrg(tenantSlug: string, orgSlug: string): Promise<void> {
			log.info({ tenantSlug, orgSlug }, "Clearing log level overrides for tenant+org");
			const currentState = loggerRegistry.getState();
			const tenantOrgKey = `${tenantSlug}:${orgSlug}`;
			const tenantOrgKeyPrefix = `${tenantOrgKey}:`;

			// Build new state without the specific tenant-org entries
			const newTenantOrg = { ...currentState.tenantOrg };
			delete newTenantOrg[tenantOrgKey];

			// Remove all tenant-org-module entries for this tenant+org
			const newTenantOrgModule = { ...currentState.tenantOrgModule };
			for (const key of Object.keys(newTenantOrgModule)) {
				if (key.startsWith(tenantOrgKeyPrefix)) {
					delete newTenantOrgModule[key];
				}
			}

			loggerRegistry.setState({
				global: currentState.global,
				modules: currentState.modules,
				tenantOrg: newTenantOrg,
				tenantOrgModule: newTenantOrgModule,
			});
			await publishState();
		},
	};
}
