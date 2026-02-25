import type { HealthResponse, HealthService } from "../health";
import { createStatusRouter } from "./StatusRouter";
import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("StatusRouter", () => {
	let app: Express;

	function setupApp(healthService?: HealthService): void {
		app = express();
		app.use("/status", createStatusRouter(healthService ? { healthService } : undefined));
	}

	beforeEach(() => {
		setupApp();
	});

	describe("GET /check", () => {
		it("should return 'OK' on GET /check", async () => {
			const response = await request(app).get("/status/check");

			expect(response.status).toBe(200);
			expect(response.text).toBe("OK");
		});

		it("should have correct content-type header", async () => {
			const response = await request(app).get("/status/check");

			expect(response.headers["content-type"]).toMatch(/text\/html/);
		});
	});

	describe("GET /health (without HealthService)", () => {
		it("should return healthy status with timestamp (backward compatible)", async () => {
			const response = await request(app).get("/status/health");

			expect(response.status).toBe(200);
			expect(response.body.status).toBe("healthy");
			expect(response.body.timestamp).toBeDefined();
			// Verify timestamp is a valid ISO date string
			expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
		});

		it("should have JSON content-type header", async () => {
			const response = await request(app).get("/status/health");

			expect(response.headers["content-type"]).toMatch(/application\/json/);
		});
	});

	describe("GET /health (with HealthService)", () => {
		it("should return 200 when all critical checks pass", async () => {
			const mockHealthService: HealthService = {
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

			const response = await request(app).get("/status/health");

			expect(response.status).toBe(200);
			expect(response.body.status).toBe("healthy");
			expect(response.body.version).toBe("abc1234");
			expect(response.body.checks.database.status).toBe("healthy");
		});

		it("should return 503 when critical check fails", async () => {
			const mockHealthService: HealthService = {
				check: vi.fn().mockResolvedValue({
					status: "unhealthy",
					timestamp: "2026-01-22T12:00:00.000Z",
					version: "abc1234",
					environment: "test",
					checks: {
						database: { status: "unhealthy", message: "Connection refused" },
						storage: { status: "healthy", latencyMs: 20 },
					},
				} satisfies HealthResponse),
			};
			setupApp(mockHealthService);

			const response = await request(app).get("/status/health");

			expect(response.status).toBe(503);
			expect(response.body.status).toBe("unhealthy");
			expect(response.body.checks.database.status).toBe("unhealthy");
		});

		it("should return 200 when only non-critical checks fail", async () => {
			const mockHealthService: HealthService = {
				check: vi.fn().mockResolvedValue({
					status: "healthy", // Overall healthy because only non-critical failed
					timestamp: "2026-01-22T12:00:00.000Z",
					version: "abc1234",
					environment: "test",
					checks: {
						database: { status: "healthy", latencyMs: 10 },
						git: { status: "unhealthy", message: "API unreachable" },
					},
				} satisfies HealthResponse),
			};
			setupApp(mockHealthService);

			const response = await request(app).get("/status/health");

			expect(response.status).toBe(200);
			expect(response.body.status).toBe("healthy");
			expect(response.body.checks.git.status).toBe("unhealthy");
		});

		it("should include all check results in response", async () => {
			const mockHealthService: HealthService = {
				check: vi.fn().mockResolvedValue({
					status: "healthy",
					timestamp: "2026-01-22T12:00:00.000Z",
					version: "abc1234",
					environment: "production",
					checks: {
						database: { status: "healthy", latencyMs: 8 },
						storage: { status: "healthy", latencyMs: 45 },
						git: { status: "healthy", latencyMs: 120 },
						ai: { status: "healthy", latencyMs: 100 },
						auth: { status: "healthy", latencyMs: 80 },
						realtime: { status: "disabled", message: "Realtime not enabled" },
					},
				} satisfies HealthResponse),
			};
			setupApp(mockHealthService);

			const response = await request(app).get("/status/health");

			expect(response.body.environment).toBe("production");
			expect(response.body.checks.ai.status).toBe("healthy");
			expect(response.body.checks.auth.status).toBe("healthy");
			expect(response.body.checks.realtime.status).toBe("disabled");
		});

		it("should return 503 when health service throws an error", async () => {
			const mockHealthService: HealthService = {
				check: vi.fn().mockRejectedValue(new Error("Unexpected error")),
			};
			setupApp(mockHealthService);

			const response = await request(app).get("/status/health");

			expect(response.status).toBe(503);
			expect(response.body.status).toBe("unhealthy");
			expect(response.body.message).toBe("Health check failed unexpectedly");
			expect(response.body.timestamp).toBeDefined();
		});
	});
});
