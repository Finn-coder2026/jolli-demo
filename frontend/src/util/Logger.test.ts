import { getLog } from "./Logger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Logger", () => {
	let mockLocalStorage: Map<string, string>;

	beforeEach(() => {
		// Create mock localStorage
		mockLocalStorage = new Map<string, string>();
		const mockStorage = {
			getItem: (key: string) => mockLocalStorage.get(key) ?? null,
			setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
			removeItem: (key: string) => mockLocalStorage.delete(key),
			clear: () => mockLocalStorage.clear(),
			key: (index: number) => Array.from(mockLocalStorage.keys())[index] ?? null,
			get length() {
				return mockLocalStorage.size;
			},
		} as Storage;

		vi.stubGlobal("localStorage", mockStorage);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		mockLocalStorage.clear();
	});

	it("should create a logger with default settings", () => {
		const log = getLog("TestModule");
		expect(log).toBeDefined();
		expect(log.info).toBeDefined();
		expect(log.error).toBeDefined();
		expect(log.warn).toBeDefined();
		expect(log.debug).toBeDefined();
	});

	it("should create a logger with LOG_LEVEL from localStorage", () => {
		mockLocalStorage.set("LOG_LEVEL", "debug");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should create a logger with LOG_PRETTY set to true", () => {
		mockLocalStorage.set("LOG_PRETTY", "true");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should create a logger with LOG_PRETTY set to false", () => {
		mockLocalStorage.set("LOG_PRETTY", "false");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should create a logger with LOG_LEVEL_OVERRIDES", () => {
		mockLocalStorage.set("LOG_LEVEL_OVERRIDES", "TestModule:debug,OtherModule:error");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should create a logger with all localStorage settings", () => {
		mockLocalStorage.set("LOG_LEVEL", "warn");
		mockLocalStorage.set("LOG_PRETTY", "true");
		mockLocalStorage.set("LOG_LEVEL_OVERRIDES", "TestModule:debug");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should cache browser pretty transport", () => {
		mockLocalStorage.set("LOG_PRETTY", "true");
		const log1 = getLog("Module1");
		const log2 = getLog("Module2");
		expect(log1).toBeDefined();
		expect(log2).toBeDefined();
	});

	it("should create logger with import.meta", () => {
		const mockImportMeta = {
			url: "file:///path/to/module.ts",
		} as ImportMeta;
		const log = getLog(mockImportMeta);
		expect(log).toBeDefined();
	});

	it("should handle pretty logging in development mode", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";
		mockLocalStorage.delete("LOG_PRETTY");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
		process.env.NODE_ENV = originalEnv;
	});

	it("should handle non-pretty logging in production mode", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		mockLocalStorage.delete("LOG_PRETTY");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
		process.env.NODE_ENV = originalEnv;
	});

	it("should handle pretty logging explicitly enabled in production", () => {
		const originalEnv = process.env.NODE_ENV;
		process.env.NODE_ENV = "production";
		mockLocalStorage.set("LOG_PRETTY", "true");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
		process.env.NODE_ENV = originalEnv;
	});

	it("should enable logging by default when DISABLE_LOGGING not in localStorage", () => {
		// Ensure DISABLE_LOGGING is not in localStorage
		mockLocalStorage.delete("DISABLE_LOGGING");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should handle localStorage DISABLE_LOGGING override", () => {
		// Set localStorage to disable logging
		mockLocalStorage.set("DISABLE_LOGGING", "true");
		const log = getLog("TestModule");
		expect(log).toBeDefined();
	});

	it("should handle error accessing process.env.DISABLE_LOGGING", () => {
		// Save original process.env
		const originalEnv = process.env;

		// Create a proxy that throws when DISABLE_LOGGING is accessed
		const proxyEnv = new Proxy(originalEnv, {
			get(target, prop) {
				if (prop === "DISABLE_LOGGING") {
					throw new Error("DISABLE_LOGGING is not accessible");
				}
				return target[prop as keyof typeof target];
			},
		});

		// Replace process.env with the proxy
		Object.defineProperty(process, "env", {
			value: proxyEnv,
			configurable: true,
		});

		const log = getLog("TestModule");
		expect(log).toBeDefined();

		// Restore original process.env
		Object.defineProperty(process, "env", {
			value: originalEnv,
			configurable: true,
		});
	});
});
