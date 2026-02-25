import { getTenantContext } from "../tenant/TenantContext";
import type { Logger, LogLevel } from "jolli-common";
import { loggerRegistry } from "jolli-common";

/**
 * Log methods that can be intercepted for tenant-aware level checking.
 */
const LOG_METHODS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type LogMethod = (typeof LOG_METHODS)[number];

/**
 * Create a tenant-aware logger wrapper.
 *
 * This proxy wraps a pino logger and intercepts log method calls to check
 * the effective log level based on tenant context. This enables per-tenant
 * debug logging without affecting other tenants.
 *
 * The wrapper checks the current tenant context (via AsyncLocalStorage) and
 * uses the LoggerRegistry to determine the effective log level for that
 * tenant+org combination.
 *
 * @param logger - The base pino logger to wrap
 * @param moduleName - The module name for this logger
 * @returns A proxy that wraps the logger with tenant-aware level checking
 */
export function createTenantAwareLogger(logger: Logger, moduleName: string): Logger {
	return new Proxy(logger, {
		get(target, prop) {
			// Only intercept log methods
			if (typeof prop === "string" && LOG_METHODS.includes(prop as LogMethod)) {
				const methodLevel = prop as LogLevel;

				// Return a function that checks tenant context before logging
				return (...args: Array<unknown>) => {
					const ctx = getTenantContext();

					// Safely extract tenant and org slugs (handle partial/incomplete contexts)
					const tenantSlug = ctx?.tenant?.slug;
					const orgSlug = ctx?.org?.slug;

					// Check if we should log based on effective level
					const shouldLog = loggerRegistry.shouldLog(methodLevel, moduleName, tenantSlug, orgSlug);

					if (shouldLog) {
						// Call the original log method
						// Use unknown cast to bypass type narrowing - we know the method exists
						return (target as unknown as Record<string, (...args: Array<unknown>) => unknown>)[prop](
							...args,
						);
					}

					// Skip logging - level too low for this tenant context
					return;
				};
			}

			// For all other properties/methods, pass through to original logger
			return Reflect.get(target, prop);
		},
	});
}
