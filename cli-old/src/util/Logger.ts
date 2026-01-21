import { createLog, type Logger } from "jolli-common";

/**
 * Get a logger for the specified module. The module name is derived from the file name.
 * To use in a module, call `getLog(import.meta)` near the top of the file (after imports).
 *
 * @param module the module meta or module name
 */
export function getLog(module: string | ImportMeta): Logger {
	return createLog(module);
}
