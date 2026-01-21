import type { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock pino
vi.mock("pino", () => {
	const createMockLogger = () => ({
		child: vi.fn((_bindings, options) => ({
			...createMockLogger(),
			level: options?.level,
		})),
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		fatal: vi.fn(),
		trace: vi.fn(),
		level: "info",
	});

	const mockLogger = createMockLogger();

	const mockTransport = vi.fn(() => ({
		on: vi.fn(),
		once: vi.fn(),
		emit: vi.fn(),
	}));
	const mockDestination = vi.fn(() => ({ write: vi.fn() }));
	const mockMultistream = vi.fn(_streams => ({ write: vi.fn() }));

	return {
		default: Object.assign(
			vi.fn(() => mockLogger),
			{
				transport: mockTransport,
				destination: mockDestination,
				multistream: mockMultistream,
				levels: {
					values: {
						trace: 10,
						debug: 20,
						info: 30,
						warn: 40,
						error: 50,
						fatal: 60,
					},
				},
			},
		),
		transport: mockTransport,
		destination: mockDestination,
		multistream: mockMultistream,
		levels: {
			values: {
				trace: 10,
				debug: 20,
				info: 30,
				warn: 40,
				error: 50,
				fatal: 60,
			},
		},
	};
});

// Mock pino-roll
vi.mock("pino-roll", () => ({
	default: vi.fn(),
}));

// Mock pino-pretty
vi.mock("pino-pretty", () => ({
	default: vi.fn(),
}));

describe("Logger", () => {
	beforeEach(() => {
		vi.resetModules();
		// Mock window to be undefined for server-side tests
		vi.stubGlobal("window", undefined);
		// Mock process.env
		process.env.NODE_ENV = "test";
		process.env.LOG_LEVEL = "info";
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		delete process.env.LOG_FILE_NAME_PREFIX;
		delete process.env.LOG_PRETTY;
		delete process.env.LOG_PRETTY_SYNC;
		delete process.env.LOG_LEVEL;
		delete process.env.LOG_TRANSPORTS;
		delete process.env.LOG_LEVEL_OVERRIDES;
		delete process.env.LOG_FILE_DIRECTORY_PATH;
	});

	describe("getLog", () => {
		it("should create a logger from string module name", async () => {
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("TestModule");

			expect(logger).toBeDefined();
			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "TestModule" },
				expect.objectContaining({
					level: expect.any(String),
				}),
			);
		});

		it("should create a logger from ImportMeta with file URL", async () => {
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const mockImportMeta = {
				url: "file:///path/to/TestModule.ts",
			} as ImportMeta;

			const logger = createLog(mockImportMeta);

			expect(logger).toBeDefined();
			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "TestModule" },
				expect.objectContaining({
					level: expect.any(String),
				}),
			);
		});

		it("should extract module name from file path without extension", async () => {
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const mockImportMeta = {
				url: "file:///path/to/MyModule.test.ts",
			} as ImportMeta;

			createLog(mockImportMeta);

			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "MyModule.test" },
				expect.objectContaining({
					level: expect.any(String),
				}),
			);
		});

		it("should handle module name without path", async () => {
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const mockImportMeta = {
				url: "SimpleModule.js",
			} as ImportMeta;

			createLog(mockImportMeta);

			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "SimpleModule" },
				expect.objectContaining({
					level: expect.any(String),
				}),
			);
		});

		it("should handle module name without extension", async () => {
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			createLog("NoExtension");

			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "NoExtension" },
				expect.objectContaining({
					level: expect.any(String),
				}),
			);
		});
	});

	describe("server-side logging configuration", () => {
		it("should use console transport in development by default", async () => {
			process.env.NODE_ENV = "development";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should use environment variables for configuration", async () => {
			process.env.LOG_LEVEL = "debug";
			process.env.LOG_PRETTY = "false";
			const pino = await import("pino");
			const mockChildLogger = { level: "debug" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("test");

			expect(logger).toBeDefined();
			expect(pino.default).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "debug",
				}),
				expect.anything(),
			);
		});

		it("should handle file transport configuration", async () => {
			process.env.LOG_TRANSPORTS = "file";
			process.env.LOG_FILE_NAME_PREFIX = "myapp";
			process.env.LOG_FILE_DIRECTORY_PATH = "/var/log";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalledWith(
				expect.objectContaining({
					targets: expect.arrayContaining([
						expect.objectContaining({
							target: "pino-roll",
							options: expect.objectContaining({
								file: "/var/log/myapp",
								frequency: "daily",
								extension: ".log",
								mkdir: true,
							}),
						}),
					]),
				}),
			);
		});

		it("should handle multiple transports", async () => {
			process.env.LOG_TRANSPORTS = "console,file";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.multistream).toHaveBeenCalled();
		});

		it("should handle browser transport", async () => {
			process.env.LOG_TRANSPORTS = "browser";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			// Browser transport is handled in browser environment, not server-side
			expect(pino.default).toHaveBeenCalled();
		});

		it("should handle module-specific log level overrides", async () => {
			process.env.LOG_LEVEL = "error";
			process.env.LOG_LEVEL_OVERRIDES = "Database:debug,Auth:info";
			const pino = await import("pino");
			const mockChildLogger = { level: "debug" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("Database");

			expect(logger).toBeDefined();
			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "Database" },
				expect.objectContaining({
					level: "debug",
				}),
			);
		});

		it("should use default level when module override not specified", async () => {
			process.env.LOG_LEVEL = "warn";
			process.env.LOG_LEVEL_OVERRIDES = "Database:debug";
			const pino = await import("pino");
			const mockChildLogger = { level: "warn" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("OtherModule");

			expect(logger).toBeDefined();
			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "OtherModule" },
				expect.objectContaining({
					level: "warn",
				}),
			);
		});

		it("should handle malformed module overrides gracefully", async () => {
			process.env.LOG_LEVEL_OVERRIDES = "Invalid,NoColon:,Database:debug";
			const pino = await import("pino");
			const mockChildLogger = { level: "debug" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("Database");

			expect(logger).toBeDefined();
			expect(mockLogger.child).toHaveBeenCalledWith(
				{ module: "Database" },
				expect.objectContaining({
					level: "debug",
				}),
			);
		});

		it("should log a warning when an override uses an invalid level", async () => {
			process.env.LOG_LEVEL_OVERRIDES = "Database:verbose";
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
				// Intentionally empty - we just want to suppress console output
			});
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			createLog("Database");

			expect(logSpy).toHaveBeenCalledWith(
				"Unable to set Database log level to verbose as it is an invalid value",
			);
			expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Valid values are"));
			logSpy.mockRestore();
		});

		it("should use json format in production by default", async () => {
			process.env.NODE_ENV = "production";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should use pretty format when specified", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_PRETTY = "true";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "info",
					target: "pino-pretty",
					options: expect.objectContaining({
						colorize: true,
						translateTime: "yyyy-mm-dd HH:MM:ss",
					}),
				}),
			);
		});

		it("should use simple format when specified", async () => {
			process.env.LOG_PRETTY = "false";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should use default console transport when no transport specified", async () => {
			delete process.env.LOG_TRANSPORTS;
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should use default info level when no level specified", async () => {
			delete process.env.LOG_LEVEL;
			const pino = await import("pino");
			const mockChildLogger = { level: "info" };
			const mockLogger = {
				child: vi.fn(() => mockChildLogger),
			} as unknown as Logger;
			(pino.default as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "info",
				}),
				expect.anything(),
			);
		});

		it("should use config level when transport level not specified", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_LEVEL = "debug";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalledWith(
				expect.objectContaining({
					level: "debug",
				}),
				expect.anything(),
			);
		});

		it("should use config format when transport format not specified", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_PRETTY = "false";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should handle file transport with level fallback to config", async () => {
			process.env.LOG_TRANSPORTS = "file";
			process.env.LOG_LEVEL = "warn";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalledWith(
				expect.objectContaining({
					targets: expect.arrayContaining([
						expect.objectContaining({
							level: "warn",
						}),
					]),
				}),
			);
		});

		it("should handle browser transport with level fallback to config", async () => {
			process.env.LOG_TRANSPORTS = "browser";
			process.env.LOG_LEVEL = "error";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			// Browser transport is handled in browser environment, not server-side
			expect(pino.default).toHaveBeenCalled();
		});

		it("should handle file transport with format fallback to config", async () => {
			process.env.LOG_TRANSPORTS = "file";
			process.env.LOG_PRETTY = "false";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should use file transport in production by default", async () => {
			process.env.NODE_ENV = "production";
			delete process.env.LOG_TRANSPORTS;
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalled();
		});

		it("should handle json format in production by default for file transport", async () => {
			process.env.NODE_ENV = "production";
			process.env.LOG_TRANSPORTS = "file";
			delete process.env.LOG_PRETTY;
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should handle json format in production by default for console transport", async () => {
			process.env.NODE_ENV = "production";
			process.env.LOG_TRANSPORTS = "console";
			delete process.env.LOG_PRETTY;
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});

		it("should handle pretty format in development by default", async () => {
			process.env.NODE_ENV = "development";
			delete process.env.LOG_PRETTY;
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalled();
		});

		it("should handle pino-pretty transport", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_PRETTY = "true";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalledWith(
				expect.objectContaining({
					target: "pino-pretty",
					level: "info",
					options: expect.objectContaining({
						colorize: true,
						translateTime: "yyyy-mm-dd HH:MM:ss",
						ignore: "pid,hostname",
						messageFormat: "{module} - {msg}",
						singleLine: true,
					}),
				}),
			);
		});

		it("should use synchronous pino-pretty when LOG_PRETTY_SYNC is true", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_PRETTY = "true";
			process.env.LOG_PRETTY_SYNC = "true";
			const pino = await import("pino");

			const { createLog, initSyncPinoPretty } = await import("./LoggerCommon");

			// Initialize sync pino-pretty with a mock
			const mockPinoPretty = vi.fn().mockReturnValue({ write: vi.fn() });
			initSyncPinoPretty(mockPinoPretty);

			createLog("test");

			// pino.transport should NOT be called for console when using sync mode
			// Instead, the initialized pino-pretty module is called synchronously
			expect(pino.transport).not.toHaveBeenCalledWith(
				expect.objectContaining({
					target: "pino-pretty",
				}),
			);
			// The mock should have been called with pretty options
			expect(mockPinoPretty).toHaveBeenCalledWith(
				expect.objectContaining({
					colorize: true,
					singleLine: true,
				}),
			);
			// The logger should still be created with pino
			expect(pino.default).toHaveBeenCalled();
		});

		it("should throw error when LOG_PRETTY_SYNC is true but initSyncPinoPretty not called", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_PRETTY = "true";
			process.env.LOG_PRETTY_SYNC = "true";

			const { createLog } = await import("./LoggerCommon");

			// Should throw because initSyncPinoPretty was not called
			expect(() => createLog("test")).toThrow(
				"LOG_PRETTY_SYNC=true requires initSyncPinoPretty() to be called first",
			);
		});

		it("should create logger with single file stream", async () => {
			process.env.LOG_TRANSPORTS = "file";
			process.env.LOG_FILE_NAME_PREFIX = "test";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.transport).toHaveBeenCalled();

			// Call getLog again to test transport caching
			createLog("test2");
			expect(pino.transport).toHaveBeenCalledTimes(1); // Should reuse cached transport
		});

		it("should handle multiple console streams", async () => {
			process.env.LOG_TRANSPORTS = "console";
			process.env.LOG_PRETTY = "false";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			createLog("test");

			expect(pino.default).toHaveBeenCalled();
		});
	});

	describe("no-op logger when DISABLE_LOGGING is true", () => {
		it("should return no-op logger when DISABLE_LOGGING is true", async () => {
			process.env.DISABLE_LOGGING = "true";
			const pino = await import("pino");

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("test");

			expect(logger).toBeDefined();
			expect(logger.level).toBe("silent");
			// Pino should not be called when DISABLE_LOGGING is set
			expect(pino.default).not.toHaveBeenCalled();
		});

		it("should have all standard logger methods as no-ops", async () => {
			process.env.DISABLE_LOGGING = "true";

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("test");

			// All methods should exist
			expect(logger.trace).toBeDefined();
			expect(logger.debug).toBeDefined();
			expect(logger.info).toBeDefined();
			expect(logger.warn).toBeDefined();
			expect(logger.error).toBeDefined();
			expect(logger.fatal).toBeDefined();
			expect(logger.silent).toBeDefined();
			expect(logger.child).toBeDefined();

			// Methods should be callable without throwing
			logger.trace("test");
			logger.debug("test");
			logger.info("test");
			logger.warn("test");
			logger.error("test");
			logger.fatal("test");
			logger.silent("test");
		});

		it("should return same no-op logger instance (singleton)", async () => {
			process.env.DISABLE_LOGGING = "true";

			const { createLog } = await import("./LoggerCommon");
			const logger1 = createLog("test1");
			const logger2 = createLog("test2");

			// Should be the same instance
			expect(logger1).toBe(logger2);
		});

		it("should have child method that returns same no-op logger", async () => {
			process.env.DISABLE_LOGGING = "true";

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("test");
			const childLogger = logger.child({ module: "child" });

			expect(childLogger).toBe(logger);
		});

		it("should have isLevelEnabled method that always returns false", async () => {
			process.env.DISABLE_LOGGING = "true";

			const { createLog } = await import("./LoggerCommon");
			const logger = createLog("test");

			expect(logger.isLevelEnabled).toBeDefined();
			expect(logger.isLevelEnabled("info")).toBe(false);
			expect(logger.isLevelEnabled("debug")).toBe(false);
			expect(logger.isLevelEnabled("error")).toBe(false);
		});

		afterEach(() => {
			delete process.env.DISABLE_LOGGING;
		});
	});
});
