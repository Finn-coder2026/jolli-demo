import type { HealthResponse, HealthService } from "../health";
import { createCronRouter } from "./CronRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config", () => ({
	getConfig: vi.fn(),
}));

import { getConfig } from "../config/Config";

describe("CronRouter", () => {
	let app: Express;
	let mockHealthService: HealthService;
	let mockFetch: ReturnType<typeof vi.fn>;

	function setupApp(healthService: HealthService): void {
		app = express();
		app.use(express.json());
		app.use("/cron", createCronRouter({ healthService }));
	}

	beforeEach(() => {
		vi.clearAllMocks();
		mockFetch = vi.fn().mockResolvedValue({ ok: true });
		global.fetch = mockFetch;

		vi.mocked(getConfig).mockReturnValue({
			BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
		} as ReturnType<typeof getConfig>);

		mockHealthService = {
			check: vi.fn().mockResolvedValue({
				status: "healthy",
				timestamp: "2026-01-22T12:00:00.000Z",
				version: "abc1234",
				environment: "test",
				checks: {
					database: { status: "healthy", latencyMs: 10 },
					storage: { status: "healthy", latencyMs: 20 },
				},
			} satisfies HealthResponse),
		};

		setupApp(mockHealthService);
	});

	describe("GET /heartbeat", () => {
		it("should return 200 and ping Better Stack when healthy", async () => {
			const response = await request(app).get("/cron/heartbeat");

			expect(response.status).toBe(200);
			expect(response.body.pinged).toBe(true);
			expect(response.body.health).toBe("healthy");
			expect(mockFetch).toHaveBeenCalledWith("https://uptime.betterstack.com/api/v1/heartbeat/test123", {
				method: "GET",
			});
		});

		it("should return 200 and skip heartbeat when unhealthy", async () => {
			mockHealthService.check = vi.fn().mockResolvedValue({
				status: "unhealthy",
				timestamp: "2026-01-22T12:00:00.000Z",
				version: "abc1234",
				environment: "test",
				checks: {
					database: { status: "unhealthy", message: "Connection refused" },
					storage: { status: "healthy", latencyMs: 20 },
				},
			} satisfies HealthResponse);

			const response = await request(app).get("/cron/heartbeat");

			expect(response.status).toBe(200);
			expect(response.body.pinged).toBe(false);
			expect(response.body.reason).toBe("Health check failed");
			expect(response.body.health).toBe("unhealthy");
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should return 200 when healthy but no heartbeat URL configured", async () => {
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: undefined,
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/cron/heartbeat");

			expect(response.status).toBe(200);
			expect(response.body.pinged).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should return 200 even if Better Stack ping fails", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));

			const response = await request(app).get("/cron/heartbeat");

			expect(response.status).toBe(200);
			expect(response.body.pinged).toBe(true);
		});

		it("should return 200 even when health check throws", async () => {
			mockHealthService.check = vi.fn().mockRejectedValue(new Error("Health check failed"));

			const response = await request(app).get("/cron/heartbeat");

			expect(response.status).toBe(200);
			expect(response.body.pinged).toBe(false);
			expect(response.body.reason).toBe("Heartbeat endpoint error");
		});

		it("should return 401 when CRON_SECRET is configured but not provided", async () => {
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
				CRON_SECRET: "test-cron-secret",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/cron/heartbeat");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
			expect(mockHealthService.check).not.toHaveBeenCalled();
		});

		it("should return 401 when CRON_SECRET is configured but wrong secret provided", async () => {
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
				CRON_SECRET: "test-cron-secret",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/cron/heartbeat").set("Authorization", "Bearer wrong-secret");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("Unauthorized");
			expect(mockHealthService.check).not.toHaveBeenCalled();
		});

		it("should return 200 when CRON_SECRET is configured and correct secret provided", async () => {
			vi.mocked(getConfig).mockReturnValue({
				BETTER_STACK_HEARTBEAT_URL: "https://uptime.betterstack.com/api/v1/heartbeat/test123",
				CRON_SECRET: "test-cron-secret",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/cron/heartbeat").set("Authorization", "Bearer test-cron-secret");

			expect(response.status).toBe(200);
			expect(response.body.pinged).toBe(true);
			expect(mockHealthService.check).toHaveBeenCalled();
		});
	});
});
