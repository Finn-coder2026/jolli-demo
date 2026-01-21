import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Logger", () => {
	const originalEnv = process.env;
	let mockInitSyncPinoPretty: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };

		// Set up mocks before each test
		mockInitSyncPinoPretty = vi.fn();
		vi.doMock("jolli-common", () => ({
			createLog: vi.fn().mockReturnValue({
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
			}),
			initSyncPinoPretty: mockInitSyncPinoPretty,
		}));
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("getLog", () => {
		it("returns a logger with string module name", async () => {
			const { getLog } = await import("./Logger");
			const log = getLog("test-module");

			expect(log).toBeDefined();
			expect(typeof log.info).toBe("function");
			expect(typeof log.error).toBe("function");
			expect(typeof log.warn).toBe("function");
			expect(typeof log.debug).toBe("function");
		});

		it("returns a logger with import.meta", async () => {
			const { getLog } = await import("./Logger");
			const log = getLog(import.meta);

			expect(log).toBeDefined();
			expect(typeof log.info).toBe("function");
		});
	});

	describe("sync pino-pretty initialization", () => {
		it("initializes sync pino-pretty when LOG_PRETTY_SYNC is true", async () => {
			process.env.LOG_PRETTY_SYNC = "true";

			// Importing Logger triggers initSyncPretty() automatically
			await import("./Logger");

			expect(mockInitSyncPinoPretty).toHaveBeenCalled();
		});

		it("does not initialize sync pino-pretty when LOG_PRETTY_SYNC is not set", async () => {
			delete process.env.LOG_PRETTY_SYNC;

			await import("./Logger");

			expect(mockInitSyncPinoPretty).not.toHaveBeenCalled();
		});
	});
});
