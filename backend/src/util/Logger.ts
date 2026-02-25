import { createTenantAwareLogger } from "./TenantAwareLogger";
import { createRequire } from "node:module";
import { createLog, initSyncPinoPretty, type Logger } from "jolli-common";

// Initialize sync pino-pretty at module load time if LOG_PRETTY_SYNC is enabled
// Uses createRequire to load pino-pretty synchronously without triggering bundler warnings
if (process.env.LOG_PRETTY_SYNC === "true") {
	const require = createRequire(import.meta.url);
	const pinoPretty = require("pino-pretty");
	initSyncPinoPretty(pinoPretty);
}

/**
 * Extract module name from module meta or string.
 * @param module - The module meta or module name string
 * @returns The module name (filename without extension)
 */
function getModuleName(module: string | ImportMeta): string {
	const moduleUrl = typeof module === "string" ? module : module.url;
	const lastSlashIndex = moduleUrl.lastIndexOf("/");
	const fileNameWithExtension = lastSlashIndex >= 0 ? moduleUrl.substring(lastSlashIndex + 1) : moduleUrl;
	const parts = fileNameWithExtension.split(".");
	return parts.length > 1 ? parts.slice(0, -1).join(".") : fileNameWithExtension;
}

/**
 * Get a logger for the specified module. The module name is derived from the file name.
 * To use in a module, call `getLog(import.meta)` near the top of the file (after imports).
 *
 * The returned logger is wrapped with tenant-aware functionality that enables
 * per-tenant log level overrides (e.g., enable debug logging for a specific customer).
 *
 * @param module the module meta or module name
 */
export function getLog(module: string | ImportMeta): Logger {
	const baseLogger = createLog(module);
	const moduleName = getModuleName(module);
	return createTenantAwareLogger(baseLogger, moduleName);
}
