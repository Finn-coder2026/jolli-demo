import type { LogLevel } from "./LoggerCommon";
import type { Logger as PinoLogger } from "pino";
import pino from "pino";

/**
 * State for managing log levels at runtime.
 * Supports global, module-specific, tenant+org specific, and tenant+org+module specific overrides.
 */
export interface LogLevelState {
	/** Global log level for all loggers */
	global: LogLevel;
	/** Module-specific log level overrides */
	modules: Record<string, LogLevel>;
	/** Tenant+Org specific log level overrides. Key format: "tenantSlug:orgSlug" */
	tenantOrg: Record<string, LogLevel>;
	/** Tenant+Org+Module specific log level overrides. Key format: "tenantSlug:orgSlug:moduleName" */
	tenantOrgModule: Record<string, LogLevel>;
}

/**
 * Build a tenant+org key for the tenantOrg overrides map.
 * @param tenantSlug - The tenant slug
 * @param orgSlug - The org slug
 * @returns The combined key in format "tenantSlug:orgSlug"
 */
export function buildTenantOrgKey(tenantSlug: string, orgSlug: string): string {
	return `${tenantSlug}:${orgSlug}`;
}

/**
 * Parse a tenant+org key back into its components.
 * @param key - The combined key in format "tenantSlug:orgSlug"
 * @returns Object with tenantSlug and orgSlug, or undefined if invalid
 */
export function parseTenantOrgKey(key: string): { tenantSlug: string; orgSlug: string } | undefined {
	const parts = key.split(":");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return;
	}
	return { tenantSlug: parts[0], orgSlug: parts[1] };
}

/**
 * Build a tenant+org+module key for the tenantOrgModule overrides map.
 * @param tenantSlug - The tenant slug
 * @param orgSlug - The org slug
 * @param moduleName - The module name
 * @returns The combined key in format "tenantSlug:orgSlug:moduleName"
 */
export function buildTenantOrgModuleKey(tenantSlug: string, orgSlug: string, moduleName: string): string {
	return `${tenantSlug}:${orgSlug}:${moduleName}`;
}

/**
 * Parse a tenant+org+module key back into its components.
 * @param key - The combined key in format "tenantSlug:orgSlug:moduleName"
 * @returns Object with tenantSlug, orgSlug, and moduleName, or undefined if invalid
 */
export function parseTenantOrgModuleKey(
	key: string,
): { tenantSlug: string; orgSlug: string; moduleName: string } | undefined {
	const parts = key.split(":");
	if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
		return;
	}
	return { tenantSlug: parts[0], orgSlug: parts[1], moduleName: parts[2] };
}

/**
 * Validate that a string is a valid LogLevel.
 * @param level - The string to validate
 * @returns True if valid, false otherwise
 */
export function isValidLogLevel(level: string): level is LogLevel {
	return ["trace", "debug", "info", "warn", "error", "fatal"].includes(level);
}

/**
 * LoggerRegistry - Singleton that tracks all loggers and manages runtime log level changes.
 *
 * Level Priority (highest to lowest):
 * 1. Tenant+Org+Module override (most specific - module for a specific tenant+org)
 * 2. Tenant+Org override (all modules for a specific tenant+org)
 * 3. Module override (module for all tenants)
 * 4. Global level (baseline)
 *
 * Usage:
 * - Loggers are registered automatically when created via createLog()
 * - Use setGlobalLevel() to change log level for all loggers
 * - Use setModuleLevel() to override level for a specific module
 * - Use setTenantOrgLevel() to override level for a specific tenant+org combination
 * - Use setTenantOrgModuleLevel() to override level for a specific module within a tenant+org
 * - getEffectiveLevel() returns the level that should be used for a given context
 */
class LoggerRegistry {
	private loggers = new Map<string, PinoLogger>();
	private state: LogLevelState = {
		global: "info",
		modules: {},
		tenantOrg: {},
		tenantOrgModule: {},
	};

	/**
	 * Register a logger for runtime level management.
	 * @param moduleName - The module name (typically derived from filename)
	 * @param logger - The pino logger instance
	 */
	register(moduleName: string, logger: PinoLogger): void {
		this.loggers.set(moduleName, logger);
	}

	/**
	 * Get a registered logger by module name.
	 * @param moduleName - The module name
	 * @returns The logger or undefined if not registered
	 */
	getLogger(moduleName: string): PinoLogger | undefined {
		return this.loggers.get(moduleName);
	}

	/**
	 * Get all registered module names.
	 * @returns Array of module names
	 */
	getRegisteredModules(): Array<string> {
		return Array.from(this.loggers.keys()).sort();
	}

	/**
	 * Set the global log level and update all registered loggers.
	 * @param level - The new global log level
	 */
	setGlobalLevel(level: LogLevel): void {
		this.state.global = level;
		this.updateAllLoggers();
	}

	/**
	 * Set or clear a module-specific log level override.
	 * @param moduleName - The module name
	 * @param level - The log level, or null to clear the override
	 */
	setModuleLevel(moduleName: string, level: LogLevel | null): void {
		if (level === null) {
			delete this.state.modules[moduleName];
		} else {
			this.state.modules[moduleName] = level;
		}
		this.updateLoggerLevel(moduleName);
	}

	/**
	 * Set or clear a tenant+org specific log level override.
	 * @param tenantSlug - The tenant slug
	 * @param orgSlug - The org slug
	 * @param level - The log level, or null to clear the override
	 */
	setTenantOrgLevel(tenantSlug: string, orgSlug: string, level: LogLevel | null): void {
		const key = buildTenantOrgKey(tenantSlug, orgSlug);
		if (level === null) {
			delete this.state.tenantOrg[key];
		} else {
			this.state.tenantOrg[key] = level;
		}
		// Update all loggers to ensure they can emit logs at this level.
		// The TenantAwareLogger will filter based on tenant context, but
		// the underlying pino logger needs to accept the log call first.
		this.updateAllLoggers();
	}

	/**
	 * Set or clear a tenant+org+module specific log level override.
	 * This is the most specific override, targeting a particular module within a tenant+org.
	 * @param tenantSlug - The tenant slug
	 * @param orgSlug - The org slug
	 * @param moduleName - The module name
	 * @param level - The log level, or null to clear the override
	 */
	setTenantOrgModuleLevel(tenantSlug: string, orgSlug: string, moduleName: string, level: LogLevel | null): void {
		const key = buildTenantOrgModuleKey(tenantSlug, orgSlug, moduleName);
		if (level === null) {
			delete this.state.tenantOrgModule[key];
		} else {
			this.state.tenantOrgModule[key] = level;
		}
		// Update all loggers to ensure they can emit logs at this level.
		// The TenantAwareLogger will filter based on tenant context, but
		// the underlying pino logger needs to accept the log call first.
		this.updateAllLoggers();
	}

	/**
	 * Get the effective log level for a given context.
	 *
	 * Priority (highest to lowest):
	 * 1. Tenant+Org+Module override (most specific)
	 * 2. Tenant+Org override (all modules for that tenant)
	 * 3. Module override (that module for all tenants)
	 * 4. Global level (baseline)
	 *
	 * @param moduleName - The module name
	 * @param tenantSlug - Optional tenant slug for tenant-specific override
	 * @param orgSlug - Optional org slug for tenant-specific override
	 * @returns The effective log level
	 */
	getEffectiveLevel(moduleName: string, tenantSlug?: string, orgSlug?: string): LogLevel {
		if (tenantSlug && orgSlug) {
			// Check tenant+org+module override first (highest priority)
			const tomKey = buildTenantOrgModuleKey(tenantSlug, orgSlug, moduleName);
			const tenantOrgModuleLevel = this.state.tenantOrgModule[tomKey];
			if (tenantOrgModuleLevel) {
				return tenantOrgModuleLevel;
			}

			// Check tenant+org override
			const toKey = buildTenantOrgKey(tenantSlug, orgSlug);
			const tenantOrgLevel = this.state.tenantOrg[toKey];
			if (tenantOrgLevel) {
				return tenantOrgLevel;
			}
		}

		// Check module override
		const moduleLevel = this.state.modules[moduleName];
		if (moduleLevel) {
			return moduleLevel;
		}

		// Fall back to global level
		return this.state.global;
	}

	/**
	 * Check if a given log level should be logged for the given context.
	 * @param methodLevel - The level of the log method being called (e.g., "debug")
	 * @param moduleName - The module name
	 * @param tenantSlug - Optional tenant slug
	 * @param orgSlug - Optional org slug
	 * @returns True if the log should be emitted
	 */
	shouldLog(methodLevel: LogLevel, moduleName: string, tenantSlug?: string, orgSlug?: string): boolean {
		const effectiveLevel = this.getEffectiveLevel(moduleName, tenantSlug, orgSlug);
		const methodLevelValue = pino.levels.values[methodLevel];
		const effectiveLevelValue = pino.levels.values[effectiveLevel];
		return methodLevelValue >= effectiveLevelValue;
	}

	/**
	 * Get the current log level state.
	 * @returns A copy of the current state
	 */
	getState(): LogLevelState {
		return {
			global: this.state.global,
			modules: { ...this.state.modules },
			tenantOrg: { ...this.state.tenantOrg },
			tenantOrgModule: { ...this.state.tenantOrgModule },
		};
	}

	/**
	 * Bulk update state (for syncing from external sources like Redis pub/sub).
	 * @param state - The new state to apply
	 */
	setState(state: LogLevelState): void {
		this.state = {
			global: state.global,
			modules: { ...state.modules },
			tenantOrg: { ...state.tenantOrg },
			tenantOrgModule: { ...state.tenantOrgModule },
		};
		this.updateAllLoggers();
	}

	/**
	 * Clear all overrides and reset to default state.
	 * @param globalLevel - Optional global level to set (defaults to "info")
	 */
	reset(globalLevel: LogLevel = "info"): void {
		this.state = {
			global: globalLevel,
			modules: {},
			tenantOrg: {},
			tenantOrgModule: {},
		};
		this.updateAllLoggers();
	}

	/**
	 * Clear all registered loggers (for testing purposes).
	 * This should only be used in tests to reset state between test runs.
	 * @internal
	 */
	clearLoggers(): void {
		this.loggers.clear();
	}

	/**
	 * Update the level of a specific logger based on current state.
	 */
	private updateLoggerLevel(moduleName: string): void {
		const logger = this.loggers.get(moduleName);
		if (logger) {
			// Set to the most verbose level needed across all overrides.
			// This ensures the logger can emit logs for any override level.
			// TenantAwareLogger handles the actual filtering based on context.
			logger.level = this.getMostVerboseLevel();
		}
	}

	/**
	 * Update all registered loggers to reflect current state.
	 * Loggers are set to the most verbose level that might be needed,
	 * considering all overrides (global, module, and tenant+org).
	 */
	private updateAllLoggers(): void {
		// Find the most verbose level across all overrides
		const minLevel = this.getMostVerboseLevel();

		// Set all loggers to the most verbose level needed.
		// TenantAwareLogger handles the actual filtering based on context.
		for (const logger of this.loggers.values()) {
			logger.level = minLevel;
		}
	}

	/**
	 * Get the most verbose (lowest numeric value) log level across all overrides.
	 * This ensures underlying pino loggers will accept log calls that
	 * TenantAwareLogger decides should be emitted.
	 */
	private getMostVerboseLevel(): LogLevel {
		let minLevelValue = pino.levels.values[this.state.global];
		let minLevel: LogLevel = this.state.global;

		// Check module overrides
		for (const level of Object.values(this.state.modules)) {
			const levelValue = pino.levels.values[level];
			if (levelValue < minLevelValue) {
				minLevelValue = levelValue;
				minLevel = level;
			}
		}

		// Check tenant+org overrides
		for (const level of Object.values(this.state.tenantOrg)) {
			const levelValue = pino.levels.values[level];
			if (levelValue < minLevelValue) {
				minLevelValue = levelValue;
				minLevel = level;
			}
		}

		// Check tenant+org+module overrides
		for (const level of Object.values(this.state.tenantOrgModule)) {
			const levelValue = pino.levels.values[level];
			if (levelValue < minLevelValue) {
				minLevelValue = levelValue;
				minLevel = level;
			}
		}

		return minLevel;
	}
}

// Singleton instance
export const loggerRegistry = new LoggerRegistry();
