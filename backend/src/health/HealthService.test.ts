import { createHealthService } from "./HealthService";
import type { CheckResult, HealthCheck } from "./HealthTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../config/Config";

describe("HealthService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getConfig).mockReturnValue({
			NODE_ENV: "test",
			HEALTH_CHECK_TIMEOUT_MS: 2000,
		} as unknown as ReturnType<typeof getConfig>);
		// Mock GIT_COMMIT_SHA
		process.env.GIT_COMMIT_SHA = "abc1234567890";
	});

	afterEach(() => {
		delete process.env.GIT_COMMIT_SHA;
	});

	function createMockCheck(name: string, critical: boolean, result: CheckResult, delayMs = 0): HealthCheck {
		return {
			name,
			critical,
			check: vi.fn().mockImplementation(async () => {
				if (delayMs > 0) {
					await new Promise(resolve => setTimeout(resolve, delayMs));
				}
				return result;
			}),
		};
	}

	it("returns healthy when all checks pass", async () => {
		const checks = [
			createMockCheck("database", true, { status: "healthy", latencyMs: 10 }),
			createMockCheck("storage", true, { status: "healthy", latencyMs: 20 }),
			createMockCheck("git", false, { status: "healthy", latencyMs: 30 }),
		];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.status).toBe("healthy");
		expect(result.checks.database.status).toBe("healthy");
		expect(result.checks.storage.status).toBe("healthy");
		expect(result.checks.git.status).toBe("healthy");
	});

	it("returns unhealthy when critical check fails", async () => {
		const checks = [
			createMockCheck("database", true, { status: "unhealthy", message: "Connection refused" }),
			createMockCheck("storage", true, { status: "healthy", latencyMs: 20 }),
			createMockCheck("git", false, { status: "healthy", latencyMs: 30 }),
		];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.status).toBe("unhealthy");
		expect(result.checks.database.status).toBe("unhealthy");
	});

	it("returns healthy when only non-critical check fails", async () => {
		const checks = [
			createMockCheck("database", true, { status: "healthy", latencyMs: 10 }),
			createMockCheck("storage", true, { status: "healthy", latencyMs: 20 }),
			createMockCheck("git", false, { status: "unhealthy", message: "API unreachable" }),
		];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.status).toBe("healthy");
		expect(result.checks.git.status).toBe("unhealthy");
	});

	it("handles disabled statuses correctly", async () => {
		const checks = [
			createMockCheck("database", true, { status: "healthy", latencyMs: 10 }),
			createMockCheck("ai", false, { status: "healthy", latencyMs: 50 }),
			createMockCheck("realtime", false, { status: "disabled", message: "Not configured" }),
		];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.status).toBe("healthy");
		expect(result.checks.ai.status).toBe("healthy");
		expect(result.checks.realtime.status).toBe("disabled");
	});

	it("runs all checks in parallel", async () => {
		const startTime = Date.now();
		const checks = [
			createMockCheck("check1", false, { status: "healthy" }, 50),
			createMockCheck("check2", false, { status: "healthy" }, 50),
			createMockCheck("check3", false, { status: "healthy" }, 50),
		];

		const service = createHealthService({ checks });
		await service.check();

		const elapsed = Date.now() - startTime;
		// If parallel, should take ~50ms. If sequential, would take ~150ms
		expect(elapsed).toBeLessThan(100);
	});

	it("handles timeout on individual checks", async () => {
		const checks = [
			createMockCheck("fast", true, { status: "healthy", latencyMs: 10 }),
			createMockCheck("slow", true, { status: "healthy" }, 5000), // Will timeout
		];

		const service = createHealthService({ checks, timeoutMs: 100 });
		const result = await service.check();

		expect(result.status).toBe("unhealthy"); // slow is critical and timed out
		expect(result.checks.fast.status).toBe("healthy");
		expect(result.checks.slow.status).toBe("unhealthy");
		expect(result.checks.slow.message).toBe("Check timed out");
	});

	it("includes version from GIT_COMMIT_SHA (truncated to 7 chars)", async () => {
		const checks = [createMockCheck("database", true, { status: "healthy" })];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.version).toBe("abc1234");
	});

	it("returns 'unknown' version when GIT_COMMIT_SHA is not set", async () => {
		delete process.env.GIT_COMMIT_SHA;
		const checks = [createMockCheck("database", true, { status: "healthy" })];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.version).toBe("unknown");
	});

	it("includes environment from config", async () => {
		vi.mocked(getConfig).mockReturnValue({
			NODE_ENV: "production",
			HEALTH_CHECK_TIMEOUT_MS: 2000,
		} as unknown as ReturnType<typeof getConfig>);
		const checks = [createMockCheck("database", true, { status: "healthy" })];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.environment).toBe("production");
	});

	it("includes timestamp in ISO format", async () => {
		const checks = [createMockCheck("database", true, { status: "healthy" })];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
	});

	it("uses hardcoded default timeout when neither options nor config specifies timeout", async () => {
		vi.mocked(getConfig).mockReturnValue({
			NODE_ENV: "test",
			HEALTH_CHECK_TIMEOUT_MS: undefined,
		} as unknown as ReturnType<typeof getConfig>);
		const checks = [createMockCheck("fast", true, { status: "healthy", latencyMs: 10 })];

		const service = createHealthService({ checks });
		const result = await service.check();

		// Should succeed using the hardcoded 2000ms default
		expect(result.checks.fast.status).toBe("healthy");
	});

	it("uses config timeout when not specified in options", async () => {
		vi.mocked(getConfig).mockReturnValue({
			NODE_ENV: "test",
			HEALTH_CHECK_TIMEOUT_MS: 50, // Very short timeout
		} as unknown as ReturnType<typeof getConfig>);
		const checks = [
			createMockCheck("slow", true, { status: "healthy" }, 200), // Will timeout
		];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.checks.slow.status).toBe("unhealthy");
		expect(result.checks.slow.message).toBe("Check timed out");
	});

	it("uses default 2000ms timeout when neither options nor config provide timeout", async () => {
		vi.mocked(getConfig).mockReturnValue({
			NODE_ENV: "test",
			HEALTH_CHECK_TIMEOUT_MS: undefined,
		} as unknown as ReturnType<typeof getConfig>);
		const checks = [createMockCheck("fast", true, { status: "healthy" }, 10)];

		const service = createHealthService({ checks });
		const result = await service.check();

		expect(result.checks.fast.status).toBe("healthy");
	});
});
