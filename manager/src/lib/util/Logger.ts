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
 * Get a logger for the specified module. The module name is derived from the file name.
 * To use in a module, call `getLog(import.meta)` near the top of the file (after imports).
 *
 * @param module the module meta or module name
 */
export function getLog(module: string | ImportMeta): Logger {
	return createLog(module);
}
