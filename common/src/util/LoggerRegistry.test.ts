import {
	buildTenantOrgKey,
	buildTenantOrgModuleKey,
	isValidLogLevel,
	loggerRegistry,
	parseTenantOrgKey,
	parseTenantOrgModuleKey,
} from "./LoggerRegistry";
import type { Logger as PinoLogger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock pino to provide the levels object
vi.mock("pino", () => ({
	default: Object.assign(vi.fn(), {
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
	}),
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
}));

describe("LoggerRegistry", () => {
	// Create mock loggers
	function createMockLogger(): PinoLogger {
		return {
			level: "info",
			trace: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			fatal: vi.fn(),
			child: vi.fn(),
		} as unknown as PinoLogger;
	}

	beforeEach(() => {
		// Reset registry state and clear loggers before each test
		loggerRegistry.clearLoggers();
		loggerRegistry.reset("info");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("buildTenantOrgKey", () => {
		it("should combine tenant and org slugs with colon separator", () => {
			expect(buildTenantOrgKey("acme", "engineering")).toBe("acme:engineering");
		});

		it("should handle empty strings", () => {
			expect(buildTenantOrgKey("", "")).toBe(":");
		});
	});

	describe("parseTenantOrgKey", () => {
		it("should parse valid key into components", () => {
			const result = parseTenantOrgKey("acme:engineering");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: "engineering" });
		});

		it("should return undefined for key without colon", () => {
			expect(parseTenantOrgKey("invalid")).toBeUndefined();
		});

		it("should return undefined for empty string", () => {
			expect(parseTenantOrgKey("")).toBeUndefined();
		});

		it("should return undefined for key with multiple colons", () => {
			expect(parseTenantOrgKey("a:b:c")).toBeUndefined();
		});

		it("should return undefined for key with empty parts", () => {
			expect(parseTenantOrgKey(":org")).toBeUndefined();
			expect(parseTenantOrgKey("tenant:")).toBeUndefined();
		});
	});

	describe("buildTenantOrgModuleKey", () => {
		it("should combine tenant, org, and module with colon separators", () => {
			expect(buildTenantOrgModuleKey("acme", "engineering", "JobRouter")).toBe("acme:engineering:JobRouter");
		});

		it("should handle empty strings", () => {
			expect(buildTenantOrgModuleKey("", "", "")).toBe("::");
		});
	});

	describe("parseTenantOrgModuleKey", () => {
		it("should parse valid key into components", () => {
			const result = parseTenantOrgModuleKey("acme:engineering:JobRouter");
			expect(result).toEqual({ tenantSlug: "acme", orgSlug: "engineering", moduleName: "JobRouter" });
		});

		it("should return undefined for key without enough colons", () => {
			expect(parseTenantOrgModuleKey("invalid")).toBeUndefined();
			expect(parseTenantOrgModuleKey("tenant:org")).toBeUndefined();
		});

		it("should return undefined for empty string", () => {
			expect(parseTenantOrgModuleKey("")).toBeUndefined();
		});

		it("should return undefined for key with too many colons", () => {
			expect(parseTenantOrgModuleKey("a:b:c:d")).toBeUndefined();
		});

		it("should return undefined for key with empty parts", () => {
			expect(parseTenantOrgModuleKey(":org:module")).toBeUndefined();
			expect(parseTenantOrgModuleKey("tenant::module")).toBeUndefined();
			expect(parseTenantOrgModuleKey("tenant:org:")).toBeUndefined();
		});
	});

	describe("isValidLogLevel", () => {
		it("should return true for valid log levels", () => {
			expect(isValidLogLevel("trace")).toBe(true);
			expect(isValidLogLevel("debug")).toBe(true);
			expect(isValidLogLevel("info")).toBe(true);
			expect(isValidLogLevel("warn")).toBe(true);
			expect(isValidLogLevel("error")).toBe(true);
			expect(isValidLogLevel("fatal")).toBe(true);
		});

		it("should return false for invalid log levels", () => {
			expect(isValidLogLevel("invalid")).toBe(false);
			expect(isValidLogLevel("")).toBe(false);
			expect(isValidLogLevel("INFO")).toBe(false); // case sensitive
			expect(isValidLogLevel("verbose")).toBe(false);
		});
	});

	describe("register", () => {
		it("should register a logger by module name", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);

			expect(loggerRegistry.getLogger("TestModule")).toBe(mockLogger);
		});

		it("should replace existing logger with same name", () => {
			const mockLogger1 = createMockLogger();
			const mockLogger2 = createMockLogger();

			loggerRegistry.register("TestModule", mockLogger1);
			loggerRegistry.register("TestModule", mockLogger2);

			expect(loggerRegistry.getLogger("TestModule")).toBe(mockLogger2);
		});
	});

	describe("getLogger", () => {
		it("should return undefined for unregistered module", () => {
			expect(loggerRegistry.getLogger("NonExistent")).toBeUndefined();
		});
	});

	describe("getRegisteredModules", () => {
		it("should return empty array when no loggers registered", () => {
			expect(loggerRegistry.getRegisteredModules()).toEqual([]);
		});

		it("should return sorted list of registered module names", () => {
			loggerRegistry.register("Charlie", createMockLogger());
			loggerRegistry.register("Alpha", createMockLogger());
			loggerRegistry.register("Bravo", createMockLogger());

			expect(loggerRegistry.getRegisteredModules()).toEqual(["Alpha", "Bravo", "Charlie"]);
		});
	});

	describe("setGlobalLevel", () => {
		it("should update global level in state", () => {
			loggerRegistry.setGlobalLevel("debug");
			expect(loggerRegistry.getState().global).toBe("debug");
		});

		it("should update all registered loggers", () => {
			const logger1 = createMockLogger();
			const logger2 = createMockLogger();

			loggerRegistry.register("Module1", logger1);
			loggerRegistry.register("Module2", logger2);
			loggerRegistry.setGlobalLevel("warn");

			expect(logger1.level).toBe("warn");
			expect(logger2.level).toBe("warn");
		});

		it("should set loggers to most verbose level needed for tenant+org support", () => {
			const logger1 = createMockLogger();
			const logger2 = createMockLogger();

			loggerRegistry.register("Module1", logger1);
			loggerRegistry.register("Module2", logger2);
			loggerRegistry.setModuleLevel("Module1", "error");
			loggerRegistry.setGlobalLevel("debug");

			// Both loggers set to "debug" (most verbose) so tenant+org overrides can work.
			// TenantAwareLogger handles actual filtering based on module overrides.
			expect(logger1.level).toBe("debug");
			expect(logger2.level).toBe("debug");
		});
	});

	describe("setModuleLevel", () => {
		it("should set module-specific override", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);
			loggerRegistry.setModuleLevel("TestModule", "trace");

			expect(loggerRegistry.getState().modules.TestModule).toBe("trace");
			expect(mockLogger.level).toBe("trace");
		});

		it("should clear module override when level is null", () => {
			loggerRegistry.setModuleLevel("TestModule", "debug");
			expect(loggerRegistry.getState().modules.TestModule).toBe("debug");

			loggerRegistry.setModuleLevel("TestModule", null);
			expect(loggerRegistry.getState().modules.TestModule).toBeUndefined();
		});

		it("should handle setting level for unregistered module (state only)", () => {
			// Set override for a module that doesn't have a registered logger
			loggerRegistry.setModuleLevel("UnregisteredModule", "error");

			// State should be updated
			expect(loggerRegistry.getState().modules.UnregisteredModule).toBe("error");

			// No logger to update, but should not throw
			expect(loggerRegistry.getLogger("UnregisteredModule")).toBeUndefined();
		});

		it("should use module level when more verbose than global", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);
			loggerRegistry.setGlobalLevel("warn");
			loggerRegistry.setModuleLevel("TestModule", "trace"); // More verbose than global

			// Logger should be at "trace" because module override is more verbose
			expect(mockLogger.level).toBe("trace");
		});

		it("should revert to global when override is cleared", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);
			loggerRegistry.setGlobalLevel("warn");
			loggerRegistry.setModuleLevel("TestModule", "debug");
			expect(mockLogger.level).toBe("debug");

			// Clear the override
			loggerRegistry.setModuleLevel("TestModule", null);

			// Should revert to global level on next update
			loggerRegistry.setGlobalLevel("error");
			expect(mockLogger.level).toBe("error");
		});
	});

	describe("setTenantOrgLevel", () => {
		it("should set tenant+org specific override", () => {
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");

			const state = loggerRegistry.getState();
			expect(state.tenantOrg["acme:engineering"]).toBe("debug");
		});

		it("should clear tenant+org override when level is null", () => {
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");
			expect(loggerRegistry.getState().tenantOrg["acme:engineering"]).toBe("debug");

			loggerRegistry.setTenantOrgLevel("acme", "engineering", null);
			expect(loggerRegistry.getState().tenantOrg["acme:engineering"]).toBeUndefined();
		});

		it("should update logger levels to support more verbose tenant+org overrides", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);
			loggerRegistry.setGlobalLevel("info"); // Logger starts at info

			expect(mockLogger.level).toBe("info");

			// Set tenant+org override to debug (more verbose)
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");

			// Logger should now be at debug so it can emit debug logs for that tenant
			expect(mockLogger.level).toBe("debug");
		});

		it("should keep logger at most verbose level when clearing tenant+org override", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");

			expect(mockLogger.level).toBe("debug");

			// Clear the override
			loggerRegistry.setTenantOrgLevel("acme", "engineering", null);

			// Logger should revert to global level since no more verbose overrides exist
			expect(mockLogger.level).toBe("info");
		});
	});

	describe("setTenantOrgModuleLevel", () => {
		it("should set tenant+org+module specific override", () => {
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", "trace");

			const state = loggerRegistry.getState();
			expect(state.tenantOrgModule["acme:engineering:JobRouter"]).toBe("trace");
		});

		it("should clear tenant+org+module override when level is null", () => {
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", "debug");
			expect(loggerRegistry.getState().tenantOrgModule["acme:engineering:JobRouter"]).toBe("debug");

			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", null);
			expect(loggerRegistry.getState().tenantOrgModule["acme:engineering:JobRouter"]).toBeUndefined();
		});

		it("should update logger levels to support more verbose tenant+org+module overrides", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("JobRouter", mockLogger);
			loggerRegistry.setGlobalLevel("info");

			expect(mockLogger.level).toBe("info");

			// Set tenant+org+module override to trace (more verbose)
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", "trace");

			// Logger should now be at trace so it can emit trace logs for that tenant+module
			expect(mockLogger.level).toBe("trace");
		});

		it("should revert to correct level when clearing tenant+org+module override", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("JobRouter", mockLogger);
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", "trace");

			expect(mockLogger.level).toBe("trace");

			// Clear the override
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "JobRouter", null);

			// Logger should revert to global level since no more verbose overrides exist
			expect(mockLogger.level).toBe("info");
		});
	});

	describe("getEffectiveLevel", () => {
		it("should return global level when no overrides", () => {
			loggerRegistry.setGlobalLevel("warn");
			expect(loggerRegistry.getEffectiveLevel("TestModule")).toBe("warn");
		});

		it("should return module override when set", () => {
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setModuleLevel("TestModule", "debug");

			expect(loggerRegistry.getEffectiveLevel("TestModule")).toBe("debug");
			expect(loggerRegistry.getEffectiveLevel("OtherModule")).toBe("info");
		});

		it("should return tenant+org override over module override", () => {
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setModuleLevel("TestModule", "debug");
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "trace");

			// Tenant+org override takes priority over module
			expect(loggerRegistry.getEffectiveLevel("TestModule", "acme", "engineering")).toBe("trace");

			// Module override when tenant context doesn't match
			expect(loggerRegistry.getEffectiveLevel("TestModule", "other", "team")).toBe("debug");

			// Without tenant context, falls back to module override
			expect(loggerRegistry.getEffectiveLevel("TestModule")).toBe("debug");
		});

		it("should return tenant+org+module override with highest priority", () => {
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setModuleLevel("TestModule", "warn");
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "TestModule", "trace");

			// Tenant+org+module override takes highest priority
			expect(loggerRegistry.getEffectiveLevel("TestModule", "acme", "engineering")).toBe("trace");

			// Different module falls back to tenant+org override
			expect(loggerRegistry.getEffectiveLevel("OtherModule", "acme", "engineering")).toBe("debug");

			// Different tenant falls back to module override
			expect(loggerRegistry.getEffectiveLevel("TestModule", "other", "team")).toBe("warn");

			// Without tenant context, falls back to module override
			expect(loggerRegistry.getEffectiveLevel("TestModule")).toBe("warn");
		});

		it("should apply tenant+org+module override even without tenant+org override", () => {
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "TestModule", "trace");

			// Tenant+org+module override applies even without tenant+org base override
			expect(loggerRegistry.getEffectiveLevel("TestModule", "acme", "engineering")).toBe("trace");

			// Other modules for same tenant fall back to global (no tenant+org override set)
			expect(loggerRegistry.getEffectiveLevel("OtherModule", "acme", "engineering")).toBe("info");
		});

		it("should require both tenant and org for tenant-specific overrides", () => {
			loggerRegistry.setGlobalLevel("info");
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "TestModule", "trace");

			// Only tenant provided - should fall back to global
			expect(loggerRegistry.getEffectiveLevel("TestModule", "acme", undefined)).toBe("info");

			// Only org provided - should fall back to global
			expect(loggerRegistry.getEffectiveLevel("TestModule", undefined, "engineering")).toBe("info");
		});
	});

	describe("shouldLog", () => {
		it("should return true when method level >= effective level", () => {
			loggerRegistry.setGlobalLevel("info");

			expect(loggerRegistry.shouldLog("info", "TestModule")).toBe(true);
			expect(loggerRegistry.shouldLog("warn", "TestModule")).toBe(true);
			expect(loggerRegistry.shouldLog("error", "TestModule")).toBe(true);
		});

		it("should return false when method level < effective level", () => {
			loggerRegistry.setGlobalLevel("warn");

			expect(loggerRegistry.shouldLog("debug", "TestModule")).toBe(false);
			expect(loggerRegistry.shouldLog("info", "TestModule")).toBe(false);
			expect(loggerRegistry.shouldLog("trace", "TestModule")).toBe(false);
		});

		it("should consider tenant+org override", () => {
			loggerRegistry.setGlobalLevel("warn");
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");

			// With matching tenant context, debug should be allowed
			expect(loggerRegistry.shouldLog("debug", "TestModule", "acme", "engineering")).toBe(true);

			// Without matching context, debug should be blocked
			expect(loggerRegistry.shouldLog("debug", "TestModule")).toBe(false);
		});

		it("should consider tenant+org+module override", () => {
			loggerRegistry.setGlobalLevel("warn");
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "TestModule", "trace");

			// With matching tenant+module context, trace should be allowed
			expect(loggerRegistry.shouldLog("trace", "TestModule", "acme", "engineering")).toBe(true);

			// Different module for same tenant should be blocked at trace
			expect(loggerRegistry.shouldLog("trace", "OtherModule", "acme", "engineering")).toBe(false);

			// Without matching context, trace should be blocked
			expect(loggerRegistry.shouldLog("trace", "TestModule")).toBe(false);
		});
	});

	describe("getState", () => {
		it("should return a copy of the current state", () => {
			loggerRegistry.setGlobalLevel("debug");
			loggerRegistry.setModuleLevel("Module1", "trace");
			loggerRegistry.setTenantOrgLevel("tenant1", "org1", "info");
			loggerRegistry.setTenantOrgModuleLevel("tenant1", "org1", "JobRouter", "warn");

			const state = loggerRegistry.getState();

			expect(state.global).toBe("debug");
			expect(state.modules).toEqual({ Module1: "trace" });
			expect(state.tenantOrg).toEqual({ "tenant1:org1": "info" });
			expect(state.tenantOrgModule).toEqual({ "tenant1:org1:JobRouter": "warn" });

			// Verify it's a copy (modifying returned state doesn't affect registry)
			state.modules.Module2 = "error";
			state.tenantOrgModule["tenant1:org1:Other"] = "fatal";
			expect(loggerRegistry.getState().modules.Module2).toBeUndefined();
			expect(loggerRegistry.getState().tenantOrgModule["tenant1:org1:Other"]).toBeUndefined();
		});
	});

	describe("setState", () => {
		it("should bulk update state and all loggers", () => {
			const logger1 = createMockLogger();
			const logger2 = createMockLogger();

			loggerRegistry.register("Module1", logger1);
			loggerRegistry.register("Module2", logger2);

			loggerRegistry.setState({
				global: "debug",
				modules: { Module1: "error" },
				tenantOrg: { "acme:eng": "trace" },
				tenantOrgModule: { "acme:eng:Module1": "info" },
			});

			expect(loggerRegistry.getState().global).toBe("debug");
			expect(loggerRegistry.getState().modules).toEqual({ Module1: "error" });
			expect(loggerRegistry.getState().tenantOrg).toEqual({ "acme:eng": "trace" });
			expect(loggerRegistry.getState().tenantOrgModule).toEqual({ "acme:eng:Module1": "info" });
			// Both loggers set to "trace" (most verbose level from tenantOrg override)
			// so that tenant+org specific logging can work
			expect(logger1.level).toBe("trace");
			expect(logger2.level).toBe("trace");
		});
	});

	describe("reset", () => {
		it("should clear all overrides and reset to default", () => {
			const mockLogger = createMockLogger();
			loggerRegistry.register("TestModule", mockLogger);
			loggerRegistry.setGlobalLevel("trace");
			loggerRegistry.setModuleLevel("TestModule", "error");
			loggerRegistry.setTenantOrgLevel("acme", "engineering", "debug");
			loggerRegistry.setTenantOrgModuleLevel("acme", "engineering", "TestModule", "warn");

			loggerRegistry.reset();

			const state = loggerRegistry.getState();
			expect(state.global).toBe("info");
			expect(state.modules).toEqual({});
			expect(state.tenantOrg).toEqual({});
			expect(state.tenantOrgModule).toEqual({});
			expect(mockLogger.level).toBe("info");
		});

		it("should accept custom global level on reset", () => {
			loggerRegistry.reset("warn");
			expect(loggerRegistry.getState().global).toBe("warn");
		});
	});
});
