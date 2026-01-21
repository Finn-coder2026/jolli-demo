import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock jolli-common module
vi.mock("jolli-common", () => ({
	createLog: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
	initSyncPinoPretty: vi.fn(),
}));

// Store original env
const originalEnv = { ...process.env };

describe("Logger", () => {
	beforeEach(() => {
		// Reset modules to re-import Logger with fresh state
		vi.resetModules();
		// Reset env
		process.env = { ...originalEnv };
	});

	describe("getLog", () => {
		it("should call createLog with module name string", async () => {
			const { getLog } = await import("./Logger");
			const { createLog } = await import("jolli-common");

			const logger = getLog("test-module");

			expect(createLog).toHaveBeenCalledWith("test-module");
			expect(logger).toBeDefined();
			expect(logger.info).toBeDefined();
		});

		it("should call createLog with ImportMeta object", async () => {
			const { getLog } = await import("./Logger");
			const { createLog } = await import("jolli-common");

			const mockImportMeta = { url: "file:///path/to/module.ts" } as ImportMeta;
			const logger = getLog(mockImportMeta);

			expect(createLog).toHaveBeenCalledWith(mockImportMeta);
			expect(logger).toBeDefined();
		});
	});

	describe("LOG_PRETTY_SYNC initialization", () => {
		it("should not call initSyncPinoPretty when LOG_PRETTY_SYNC is not set", async () => {
			delete process.env.LOG_PRETTY_SYNC;
			vi.resetModules();

			const { initSyncPinoPretty } = await import("jolli-common");
			await import("./Logger");

			expect(initSyncPinoPretty).not.toHaveBeenCalled();
		});

		it("should not call initSyncPinoPretty when LOG_PRETTY_SYNC is false", async () => {
			process.env.LOG_PRETTY_SYNC = "false";
			vi.resetModules();

			const { initSyncPinoPretty } = await import("jolli-common");
			await import("./Logger");

			expect(initSyncPinoPretty).not.toHaveBeenCalled();
		});

		it("should call initSyncPinoPretty when LOG_PRETTY_SYNC is true", async () => {
			process.env.LOG_PRETTY_SYNC = "true";
			vi.resetModules();

			// Re-import to trigger the initialization logic
			const { initSyncPinoPretty } = await import("jolli-common");
			await import("./Logger");

			expect(initSyncPinoPretty).toHaveBeenCalled();
		});
	});
});
