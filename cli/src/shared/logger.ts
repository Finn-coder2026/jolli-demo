import { getConfig } from "./config";
import pino from "pino";

// =============================================================================
// Types
// =============================================================================

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export type Logger = pino.Logger;

// =============================================================================
// Module name extraction
// =============================================================================

function getModuleName(module: string | ImportMeta): string {
	const moduleUrl = typeof module === "string" ? module : module.url;
	const lastSlashIndex = moduleUrl.lastIndexOf("/");
	const fileNameWithExtension = lastSlashIndex >= 0 ? moduleUrl.substring(lastSlashIndex + 1) : moduleUrl;
	const parts = fileNameWithExtension.split(".");
	// If there's an extension, remove it; otherwise return the whole name
	return parts.length > 1 ? parts.slice(0, -1).join(".") : fileNameWithExtension;
}

// =============================================================================
// Pretty formatting (inline, no transport needed)
// =============================================================================

const LEVEL_COLORS: Record<number, string> = {
	10: "\x1b[90m", // trace - gray
	20: "\x1b[36m", // debug - cyan
	30: "\x1b[32m", // info - green
	40: "\x1b[33m", // warn - yellow
	50: "\x1b[31m", // error - red
	60: "\x1b[35m", // fatal - magenta
};

const LEVEL_NAMES: Record<number, string> = {
	10: "TRACE",
	20: "DEBUG",
	30: "INFO",
	40: "WARN",
	50: "ERROR",
	60: "FATAL",
};

const RESET = "\x1b[0m";

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (n: number) => n.toString().padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function prettyDestination(): pino.DestinationStream {
	return {
		write(chunk: string): void {
			try {
				const obj = JSON.parse(chunk);
				const time = formatTime(obj.time);
				const level = obj.level as number;
				const color = LEVEL_COLORS[level] ?? "";
				const levelName = LEVEL_NAMES[level] ?? "LOG";
				const moduleName = obj.module ?? "unknown";
				const msg = obj.msg ?? "";

				const line = `${color}[${time}] ${levelName}${RESET} ${moduleName} - ${msg}\n`;
				process.stdout.write(line);
			} catch {
				// Fallback to raw output if parsing fails
				process.stdout.write(chunk);
			}
		},
	};
}

// =============================================================================
// Logger creation
// =============================================================================

let rootLogger: pino.Logger | undefined;

function getRootLogger(): pino.Logger {
	if (!rootLogger) {
		const config = getConfig();
		rootLogger = pino(
			{
				level: config.LOG_LEVEL,
			},
			prettyDestination(),
		);
	}
	return rootLogger;
}

/**
 * Get a logger for the specified module. The module name is derived from the file name.
 * To use in a module, call `getLog(import.meta)` near the top of the file (after imports).
 *
 * @param module the module meta or module name
 */
export function getLog(module: string | ImportMeta): Logger {
	const moduleName = getModuleName(module);
	return getRootLogger().child({ module: moduleName });
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Log an error with proper formatting
 */
export function logError(logger: Logger, err: unknown, message: string): void {
	if (err instanceof Error) {
		logger.error({ err }, message);
	} else {
		logger.error({ err: String(err) }, message);
	}
}

/**
 * Reset the logger (useful for testing)
 */
export function resetLogger(): void {
	rootLogger = undefined;
}

// =============================================================================
// Legacy exports for backwards compatibility
// =============================================================================

/**
 * @deprecated Use getLog(import.meta) instead
 */
export function createLogger(name: string): Logger {
	return getRootLogger().child({ module: name });
}
