import type { HealthService } from "./HealthService";
import type { HealthResponse } from "./HealthTypes";
import { createHeartbeatService } from "./HeartbeatService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../config/Config";

describe("HeartbeatService", () => {
	let mockHealthService: HealthService;
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockFetch = vi.fn().mockResolvedValue({ ok: true });
		global.fetch = mockFetch;

		vi.mocked(getConfig).mockReturnValue({
			BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
			HEARTBEAT_INTERVAL_MS: 60000, // 1 minute for tests
		} as ReturnType<typeof getConfig>);

		mockHealthService = {
			check: vi.fn().mockResolvedValue({
				status: "healthy",
				timestamp: "2026-01-22T12:00:00.000Z",
				version: "abc1234",
				environment: "test",
				checks: {
					database: { status: "healthy", latencyMs: 10 },
				},
			} satisfies HealthResponse),
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("sendHeartbeat", () => {
		it("sends heartbeat when health check passes", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			const result = await service.sendHeartbeat();

			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith("https://uptime.betterstack.com/api/v1/heartbeat/test123", {
				method: "GET",
			});
		});

		it("skips heartbeat when health check fails", async () => {
			mockHealthService.check = vi.fn().mockResolvedValue({
				status: "unhealthy",
				timestamp: "2026-01-22T12:00:00.000Z",
				version: "abc1234",
				environment: "test",
				checks: {
					database: { status: "unhealthy", message: "Connection refused" },
				},
			} satisfies HealthResponse);

			const service = createHeartbeatService({ healthService: mockHealthService });

			const result = await service.sendHeartbeat();

			expect(result).toBe(false);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("returns true when healthy but no heartbeat URL configured", async () => {
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: undefined,
			} as ReturnType<typeof getConfig>);

			const service = createHeartbeatService({ healthService: mockHealthService });

			const result = await service.sendHeartbeat();

			expect(result).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("returns false when Better Stack ping fails", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));

			const service = createHeartbeatService({ healthService: mockHealthService });

			const result = await service.sendHeartbeat();

			expect(result).toBe(false);
		});

		it("returns false when Better Stack returns non-ok status", async () => {
			mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

			const service = createHeartbeatService({ healthService: mockHealthService });

			const result = await service.sendHeartbeat();

			expect(result).toBe(false);
		});

		it("returns false when health check throws", async () => {
			mockHealthService.check = vi.fn().mockRejectedValue(new Error("Health check failed"));

			const service = createHeartbeatService({ healthService: mockHealthService });

			const result = await service.sendHeartbeat();

			expect(result).toBe(false);
		});

		it("uses provided heartbeat URL over config", async () => {
			const service = createHeartbeatService({
				healthService: mockHealthService,
				heartbeatUrl: "https://custom.heartbeat.url/test",
			});

			await service.sendHeartbeat();

			expect(mockFetch).toHaveBeenCalledWith("https://custom.heartbeat.url/test", { method: "GET" });
		});

		it("logs state transition from unhealthy to healthy (recovery)", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			// First call: unhealthy state
			mockHealthService.check = vi.fn().mockResolvedValue({
				status: "unhealthy",
				timestamp: "2026-01-22T12:00:00.000Z",
				version: "abc1234",
				environment: "test",
				checks: { database: { status: "unhealthy", message: "Connection refused" } },
			} satisfies HealthResponse);
			await service.sendHeartbeat();

			// Second call: healthy state (recovery)
			mockHealthService.check = vi.fn().mockResolvedValue({
				status: "healthy",
				timestamp: "2026-01-22T12:00:01.000Z",
				version: "abc1234",
				environment: "test",
				checks: { database: { status: "healthy", latencyMs: 10 } },
			} satisfies HealthResponse);
			const result = await service.sendHeartbeat();

			// Should return true and send heartbeat after recovery
			expect(result).toBe(true);
			expect(mockFetch).toHaveBeenCalled();
		});

		it("logs state transition from healthy to unhealthy", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			// First call: healthy state
			await service.sendHeartbeat();

			// Second call: unhealthy state
			mockHealthService.check = vi.fn().mockResolvedValue({
				status: "unhealthy",
				timestamp: "2026-01-22T12:00:01.000Z",
				version: "abc1234",
				environment: "test",
				checks: { database: { status: "unhealthy", message: "Connection lost" } },
			} satisfies HealthResponse);
			const result = await service.sendHeartbeat();

			// Should return false and skip heartbeat
			expect(result).toBe(false);
		});
	});

	describe("start/stop", () => {
		it("starts and sends initial heartbeat", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			service.start(60000);

			// Initial heartbeat should be triggered (but async)
			expect(service.isRunning()).toBe(true);

			// Flush microtasks to allow initial heartbeat to complete
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalled();

			service.stop();
		});

		it("sends heartbeat on interval", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			service.start(60000);

			// Flush initial heartbeat
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// Advance time by one interval
			await vi.advanceTimersByTimeAsync(60000);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// Advance time by another interval
			await vi.advanceTimersByTimeAsync(60000);
			expect(mockFetch).toHaveBeenCalledTimes(3);

			service.stop();
		});

		it("stops the interval", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			service.start(60000);
			expect(service.isRunning()).toBe(true);

			// Flush initial heartbeat
			await vi.advanceTimersByTimeAsync(0);
			const callsBeforeStop = mockFetch.mock.calls.length;

			service.stop();
			expect(service.isRunning()).toBe(false);

			// Advance time - should not trigger more calls
			await vi.advanceTimersByTimeAsync(60000);
			expect(mockFetch).toHaveBeenCalledTimes(callsBeforeStop);
		});

		it("warns when start is called while already running", async () => {
			const service = createHeartbeatService({ healthService: mockHealthService });

			service.start(60000);
			expect(service.isRunning()).toBe(true);

			// Flush initial heartbeat
			await vi.advanceTimersByTimeAsync(0);

			// Call start again while already running - should be ignored
			service.start(30000);
			expect(service.isRunning()).toBe(true);

			// Interval should still be 60000, not 30000
			await vi.advanceTimersByTimeAsync(30000);
			// Should still be at 1 call (initial) since we're at 30s not 60s
			expect(mockFetch).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(30000);
			// Now at 60s, should trigger second call
			expect(mockFetch).toHaveBeenCalledTimes(2);

			service.stop();
		});

		it("uses config interval when not provided", async () => {
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
				HEARTBEAT_INTERVAL_MS: 30000, // 30 seconds
			} as ReturnType<typeof getConfig>);

			const service = createHeartbeatService({ healthService: mockHealthService });

			service.start();

			// Flush initial heartbeat
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// 30 seconds should trigger another
			await vi.advanceTimersByTimeAsync(30000);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			service.stop();
		});

		it("uses config schema default of 5 minutes", async () => {
			// Config schema provides default of 5 minutes (5 * 60 * 1000)
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
				HEARTBEAT_INTERVAL_MS: 5 * 60 * 1000, // Config schema default
			} as ReturnType<typeof getConfig>);

			const service = createHeartbeatService({ healthService: mockHealthService });

			service.start();

			// Flush initial heartbeat
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// 4 minutes should not trigger
			await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// 5 minutes should trigger
			await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			service.stop();
		});
	});
});
