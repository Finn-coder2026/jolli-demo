import { browserConsoleWriter } from "./BrowserConsoleWriter";
import { createLog, createLoggingConfig, type Logger, type LoggingConfig, type LogLevel } from "jolli-common";
import pino, { type Logger as PinoLogger, type ThreadStream } from "pino";

const transports = new Map<string, ThreadStream>();

function getBrowserPrettyTransport(): ThreadStream {
	const key = "browser-pretty";
	const transport = transports.get(key);
	if (transport) {
		return transport;
	}
	transports.set(key, {
		target: "pino-pretty",
		options: {
			colorize: true,
			translateTime: "SYS:HH:MM:ss.l",
			ignore: "pid,hostname",
			messageFormat: "{module} {msg}",
			singleLine: true,
		},
	});
	return transports.get(key);
}

/**
 * Configures browser-side logging based on local storage settings.
 * The supported local storage keys are:
 * - DISABLE_LOGGING: Set to "true" to disable logging entirely (returns no-op logger).
 * - LOG_LEVEL: Default log level. If not provided, defaults to "info".
 * - LOG_PRETTY: Whether to use pretty-printing for console output. Defaults to "false".
 * - LOG_LEVEL_OVERRIDES: module-specific log level overrides, e.g. "Database:debug,Auth:error"
 *
 * @returns Logging configuration object
 */
function getLoggingConfig(): LoggingConfig {
	const enabled = process.env.NODE_ENV !== "test" && localStorage.getItem("DISABLE_LOGGING") !== "true";
	const isDevelopment = process.env.NODE_ENV === "development";
	const logFilePrefix = "noop";
	const level = (localStorage.getItem("LOG_LEVEL") ?? "info") as LogLevel;
	const pretty = (localStorage.getItem("LOG_PRETTY") ?? (isDevelopment ? "true" : "false")) === "true";
	const transports = "";
	const moduleOverrides = localStorage.getItem("LOG_LEVEL_OVERRIDES") ?? "";
	const fileDirectoryPath = "./logs";
	return createLoggingConfig(enabled, logFilePrefix, level, pretty, transports, moduleOverrides, fileDirectoryPath);
}

function createDefaultLogger(config: LoggingConfig): PinoLogger {
	const { level } = config;
	const isDevelopment = process.env.NODE_ENV === "development";
	const pretty = (localStorage.getItem("LOG_PRETTY") ?? (isDevelopment ? "true" : "false")) === "true";
	if (pretty) {
		const writer = browserConsoleWriter(console);
		const transport = getBrowserPrettyTransport();
		return pino({
			level,
			browser: {
				asObject: false,
				write: writer as unknown as pino.WriteFn,
			},
			transport,
		});
	} else {
		return pino({
			level,
			browser: {
				asObject: true,
			},
		});
	}
}

/**
 * Get a logger for the specified module. The module name is derived from the file name.
 * To use in a module, call `getLog(import.meta)` near the top of the file (after imports).
 *
 * @param module the module meta or module name
 */
export function getLog(module: string | ImportMeta): Logger {
	return createLog(module, getLoggingConfig, createDefaultLogger);
}
