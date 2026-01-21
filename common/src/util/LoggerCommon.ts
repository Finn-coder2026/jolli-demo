import type { Logger as PinoLogger, StreamEntry, ThreadStream } from "pino";
import pino from "pino";

/**
 * Cached pino-pretty module for synchronous use.
 * Must be initialized via initSyncPinoPretty() before use.
 */
let syncPinoPrettyModule: ((options: object) => ThreadStream) | undefined;

/**
 * Log stream type - using pino's native streams.
 * "console" and "file" are native pino types.
 */
export type LogStreamType = "console" | "file";

/**
 * Log level type - using pino's native levels
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Base logging transport configuration interface
 */
interface LoggingTransportConfig {
	/**
	 * Transport type: "console" or "file"
	 */
	type: LogStreamType;
	/**
	 * Transport-specific log level.
	 */
	level: LogLevel;
	/**
	 * Whether to use pretty-printing for this transport (only applicable to console transport).
	 */
	pretty: boolean;
}

/**
 * File transport configuration interface
 */
export interface FileTransportConfig extends LoggingTransportConfig {
	type: "file";
	/**
	 * Log file name prefix or pattern, e.g. "application"
	 * We use log rotation, and will include %DATE% in the filename, e.g. `${filenamePrefix}-%DATE%.log`
	 */
	filenamePrefix: string;
	/**
	 * Directory path for log files. If not set, defaults to a logs folder under the current working directory.
	 */
	fileDirectoryPath: string;
	/**
	 * Date pattern for log rotation, e.g. "yyyy-MM-dd"
	 */
	datePattern: string; // e.g. "yyyy-MM-dd"
	/**
	 * Maximum number of files to keep (will default ot 14 if not set).
	 */
	maxFiles: number; // e.g. 14
	/**
	 * Maximum size of a log file before rotation, e.g. "500m" for 500 megabytes.
	 * units can be "k", "m", "g".
	 * Defaults to "500m" if not set.
	 */
	maxSize: string;
}

/**
 * Console transport configuration interface
 */
export interface ConsoleTransportConfig extends LoggingTransportConfig {
	type: "console";
}

/**
 * Logging configuration interface
 */
export interface LoggingConfig {
	/**
	 * Whether logging is enabled. If false, a no-op logger will be returned.
	 */
	enabled: boolean;
	/**
	 * Default log level
	 */
	level: LogLevel;
	/**
	 * Transports configuration
	 */
	transports: Array<LoggingTransportConfig>;
	/**
	 * Module-specific log level overrides. Use the name of the file without extension as module name.
	 * Format: "module1:level1,module2:level2"
	 * Example: "Database:debug,Auth:info"
	 */
	moduleOverrides: Record<string, string | undefined>;
}

const transports = new Map<string, ThreadStream>();

function getServerTransport(transportConfig: LoggingTransportConfig): ThreadStream {
	const { type, pretty, level } = transportConfig;
	const transport = transports.get(type);
	if (transport) {
		return transport;
	}

	if (type === "file") {
		const fileConfig = transportConfig as FileTransportConfig;
		const { datePattern, filenamePrefix, fileDirectoryPath, maxFiles, maxSize } = fileConfig;

		const fileTransport = pino.transport({
			targets: [
				{
					target: "pino-roll",
					level,
					options: {
						file: `${fileDirectoryPath}/${filenamePrefix}`,
						frequency: "daily",
						size: maxSize,
						dateFormat: datePattern,
						extension: ".log",
						mkdir: true,
						symlink: process.platform !== "win32",
						limit: {
							count: maxFiles,
						},
					},
				},
			],
		});
		transports.set(type, fileTransport);
	} else if (type === "console") {
		if (pretty) {
			// Check if we should use synchronous pretty printing (for environments where worker threads don't work)
			// pino.transport() uses worker threads which some bundlers interfere with
			if (process.env.LOG_PRETTY_SYNC === "true") {
				// Use synchronous pino-pretty stream (no worker threads)
				// Requires initSyncPinoPretty() to be called first
				if (!syncPinoPrettyModule) {
					throw new Error(
						"LOG_PRETTY_SYNC=true requires initSyncPinoPretty() to be called first with the pino-pretty module",
					);
				}
				const prettyStream = syncPinoPrettyModule({
					colorize: true,
					translateTime: "yyyy-mm-dd HH:MM:ss",
					ignore: "pid,hostname",
					messageFormat: "{module} - {msg}",
					singleLine: true,
				});
				transports.set(type, prettyStream);
			} else {
				const prettyTransport = pino.transport({
					target: "pino-pretty",
					level: transportConfig.level,
					options: {
						colorize: true,
						translateTime: "yyyy-mm-dd HH:MM:ss",
						ignore: "pid,hostname",
						messageFormat: "{module} - {msg}",
						singleLine: true,
					},
				});
				transports.set(type, prettyTransport);
			}
		} else {
			transports.set(type, process.stdout);
		}
	}
	return transports.get(type);
}

function getModuleName(module: string | ImportMeta): string {
	const moduleUrl = typeof module === "string" ? module : module.url;
	const lastSlashIndex = moduleUrl.lastIndexOf("/");
	const fileNameWithExtension = lastSlashIndex >= 0 ? moduleUrl.substring(lastSlashIndex + 1) : moduleUrl;
	const parts = fileNameWithExtension.split(".");
	// If there's an extension, remove it; otherwise return the whole name
	return parts.length > 1 ? parts.slice(0, -1).join(".") : fileNameWithExtension;
}

/**
 * Create a logging configuration.
 *
 * @param enabled Whether logging is enabled. If false, a no-op logger will be returned.
 * @param filenamePrefix Prefix for log file names when using file transport, e.g. "application".
 * @param level Default log level. If not provided, defaults to "info".
 * @param pretty Whether to use pretty-printing for console transport.
 * @param transportNames array of transport configurations.
 * If not provided, defaults to console in development and file in production.
 * @param moduleOverrides Module-specific log level overrides in the format "module1:level1,module2:level2"
 * @param fileDirectoryPath directory path for log files when using file transport.
 * @param datePattern Date pattern for log rotation, e.g. "yyyy-MM-dd". Defaults to "yyyy-MM-dd".
 * @param maxFiles Maximum number of files or duration to keep logs,
 * e.g. "14d" for 14 days or number of files to keep. Defaults to "14d".
 * @param maxSize Maximum size of a log file before rotation, e.g. "500m" for 500 megabytes.
 * units can be "k", "m", "g". Defaults to "500m".
 * @returns Logging configuration object
 */
export function createLoggingConfig(
	enabled: boolean,
	filenamePrefix: string,
	level: LogLevel,
	pretty: boolean,
	transportNames: string,
	moduleOverrides: string,
	fileDirectoryPath: string,
	datePattern = "yyyy-MM-dd",
	maxFiles = 14,
	maxSize = "500m",
): LoggingConfig {
	const defaultTransportNames = transportNames.split(",").map((t: string) => t.trim());
	const transportConfigs: Array<LoggingTransportConfig> = [];
	for (const transport of defaultTransportNames) {
		if (transport === "file") {
			const transportConfig: FileTransportConfig = {
				type: "file",
				filenamePrefix,
				fileDirectoryPath,
				datePattern,
				maxFiles,
				maxSize,
				level,
				pretty,
			};
			transportConfigs.push(transportConfig);
		}
		if (transport === "console") {
			const transportConfig: LoggingTransportConfig = {
				type: "console",
				level,
				pretty,
			};
			transportConfigs.push(transportConfig);
		}
	}
	const overrides: Record<string, string> = {};
	if (moduleOverrides) {
		const pairs = moduleOverrides.split(",");
		for (const pair of pairs) {
			const [module, lvl] = pair.split(":");
			if (module && lvl) {
				overrides[module.trim()] = lvl.trim();
			}
		}
	}
	return {
		enabled,
		level,
		transports: transportConfigs,
		moduleOverrides: overrides,
	};
}

/**
 * Configures server-side logging based on environment variables.
 * The supported environment variables are:
 * - DISABLE_LOGGING: Set to "true" to disable logging entirely (returns no-op logger).
 * - LOG_FILE_NAME_PREFIX: Prefix for log file names when using file transport, e.g. "application".
 * - LOG_LEVEL: Default log level. If not provided, defaults to "info".
 * - LOG_PRETTY: Whether to use pretty-printing for console output.
 * - LOG_PRETTY_SYNC: Set to "true" to use synchronous pino-pretty (required for Next.js compatibility).
 *   When true, avoids worker threads that conflict with Next.js webpack bundling.
 * - LOG_TRANSPORTS: comma-separated list of transports, e.g. "console,file".
 *   If not provided, defaults to console in development and file in production.
 * - LOG_LEVEL_OVERRIDES: module-specific log level overrides, e.g. "Database:debug,Auth:error"
 * - LOG_FILE_DIRECTORY_PATH: directory path for log files when using file transport.
 * - LOG_FILE_DATE_PATTERN: Date pattern for log rotation, e.g. "yyyy-MM-dd".
 *   If not provided, defaults to "yyyy-MM-dd".
 * - LOG_FILE_MAX_FILES: Maximum number of files or duration to keep logs,
 *   e.g. "14d" for 14 days or number of files to keep.
 *   Defaults to "14d".
 *   If not provided, defaults to "./logs".
 *
 * @returns Logging configuration object
 */
function getLoggingConfig(): LoggingConfig {
	const enabled = process.env.DISABLE_LOGGING !== "true";
	const isDevelopment = process.env.NODE_ENV === "development";
	const logFilePrefix = process.env.LOG_FILE_NAME_PREFIX ?? "application";
	const level = (process.env.LOG_LEVEL ?? "info") as LogLevel;
	const pretty = (process.env.LOG_PRETTY ?? (isDevelopment ? "true" : "false")) === "true";
	const transports = process.env.LOG_TRANSPORTS ?? (isDevelopment ? "console" : "file");
	const moduleOverrides = process.env.LOG_LEVEL_OVERRIDES ?? "";
	const fileDirectoryPath = process.env.LOG_FILE_DIRECTORY_PATH ?? "./logs";
	const fileDatePattern = process.env.LOG_FILE_DATE_PATTERN ?? "yyyy-MM-dd";
	const fileMaxFiles = Number(process.env.LOG_FILE_MAX_FILES ?? "14");
	return createLoggingConfig(
		enabled,
		logFilePrefix,
		level,
		pretty,
		transports,
		moduleOverrides,
		fileDirectoryPath,
		fileDatePattern,
		fileMaxFiles,
	);
}

function createDefaultLogger(config: LoggingConfig): PinoLogger {
	const streams: Array<StreamEntry> = [];

	for (const transportConfig of config.transports) {
		const transport = getServerTransport(transportConfig);
		if (transport) {
			streams.push({ level: transportConfig.level, stream: transport });
		}
	}
	// If multiple streams, use pino.multistream
	if (streams.length > 1) {
		return pino(
			{
				level: config.level,
			},
			pino.multistream(streams),
		);
	}
	// Single stream
	if (streams.length === 1) {
		return pino(
			{
				level: config.level,
			},
			streams[0].stream,
		);
	}
	// No streams configured, use default
	return pino({
		level: config.level,
	});
}

function validateLogLevel(logName: string, logLevel: LogLevel): pino.LevelWithSilent | undefined {
	if (logName && logLevel) {
		const level = logLevel.toLowerCase();
		const { values } = pino.levels;
		if (values[level] === undefined) {
			// biome-ignore lint/suspicious/noConsole: needed to fix logging mistakes.
			console.log(`Unable to set ${logName} log level to ${logLevel} as it is an invalid value`);
			// biome-ignore lint/suspicious/noConsole:  needed to fix logging mistakes.
			console.log(`Valid values are: ${Object.keys(values)}`);
			return;
		}
		return level as pino.LevelWithSilent;
	}
	return;
}

// Create a child logger for a specific module with optional level override
function createModuleLogger(
	moduleName: string,
	loggingConfigProvider: () => LoggingConfig,
	defaultLoggerProvider: (config: LoggingConfig) => PinoLogger,
): PinoLogger {
	const loggingConfig = loggingConfigProvider();
	const levelOverride = loggingConfig.moduleOverrides[moduleName];
	const childLevel = validateLogLevel(moduleName, levelOverride as LogLevel);

	// If we have a child level override that's more verbose than the base level,
	// we need to create the parent logger with that more verbose level
	const effectiveLevel = (childLevel ?? loggingConfig.level) as LogLevel;
	const parentLevel = getMinimumLevel(effectiveLevel, loggingConfig.level);

	// Create a new config with the minimum level needed
	// We also need to update all transport levels to match
	const effectiveConfig = {
		...loggingConfig,
		level: parentLevel,
		transports: loggingConfig.transports.map(t => ({ ...t, level: parentLevel })),
	};
	const logger = defaultLoggerProvider(effectiveConfig);

	return logger.child({ module: moduleName }, { level: effectiveLevel });
}

// Helper to get the more verbose (lower priority number) level
function getMinimumLevel(level1: LogLevel, level2: LogLevel): LogLevel {
	const levels = pino.levels.values;
	return levels[level1] < levels[level2] ? level1 : level2;
}

// Type alias for compatibility
export type Logger = PinoLogger;

/**
 * Create a no-op logger that does nothing.
 * Used when DISABLE_LOGGING environment variable is set to 'true'.
 */
function createNoOpLogger(): Logger {
	const noop = () => {
		// Intentionally empty - no-op logger does nothing
	};
	const noopLogger = {
		trace: noop,
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
		fatal: noop,
		child: () => noopLogger,
		level: "silent",
		silent: noop,
		isLevelEnabled: () => false,
	} as unknown as Logger;
	return noopLogger;
}

// Singleton no-op logger instance
let noopLoggerInstance: Logger | undefined;

/**
 * Get a logger for the specified module. The module name is derived from the file name.
 * To use in a module, call `getLog(import.meta)` near the top of the file (after imports).
 *
 * If the logging config has enabled=false, a no-op logger is returned.
 *
 * @param module the module meta or module name
 * @param loggingConfigProvider an optional logging config provider to use instead of the default one.
 * @param defaultLoggerProvider an optional default logger provider to use instead of the default one.
 */
export function createLog(
	module: string | ImportMeta,
	loggingConfigProvider?: () => LoggingConfig,
	defaultLoggerProvider?: (config: LoggingConfig) => PinoLogger,
): Logger {
	const configProvider = loggingConfigProvider ?? getLoggingConfig;
	const config = configProvider();

	// Check if logging is disabled
	if (!config.enabled) {
		if (!noopLoggerInstance) {
			noopLoggerInstance = createNoOpLogger();
		}
		return noopLoggerInstance;
	}

	const moduleName = getModuleName(module);
	return createModuleLogger(moduleName, configProvider, defaultLoggerProvider ?? createDefaultLogger);
}

/**
 * Initialize the synchronous pino-pretty module for use with LOG_PRETTY_SYNC=true.
 * This must be called before creating any loggers when LOG_PRETTY_SYNC is enabled.
 *
 * This approach avoids using eval() which causes bundler warnings and security concerns.
 * The caller imports pino-pretty and passes it to this function.
 *
 * @example
 * ```typescript
 * import pinoPretty from "pino-pretty";
 * initSyncPinoPretty(pinoPretty);
 * ```
 *
 * @param pinoPrettyModule The pino-pretty module default export
 */
export function initSyncPinoPretty(pinoPrettyModule: (options: object) => ThreadStream): void {
	syncPinoPrettyModule = pinoPrettyModule;
}
