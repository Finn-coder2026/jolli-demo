import type { AllConnectionsHealthResult, TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import { setupHeartbeatService } from "./HeartbeatSetup";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the health module - but let createMultiTenantDatabaseCheck run for real
vi.mock("../health/index.js", async importOriginal => {
	const actual = await importOriginal<typeof import("../health/index.js")>();
	return {
		...actual,
		createHealthService: vi.fn(),
		createHeartbeatService: vi.fn(),
	};
});

import { createHealthService, createHeartbeatService } from "../health/index.js";

describe("HeartbeatSetup", () => {
	let mockConnectionManager: TenantOrgConnectionManager;
	let mockHealthService: { check: ReturnType<typeof vi.fn> };
	let mockHeartbeatService: {
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		isRunning: ReturnType<typeof vi.fn>;
		sendHeartbeat: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Set up mock return values
		mockHealthService = {
			check: vi.fn().mockResolvedValue({ status: "healthy" }),
		};

		mockHeartbeatService = {
			start: vi.fn(),
			stop: vi.fn(),
			isRunning: vi.fn().mockReturnValue(false),
			sendHeartbeat: vi.fn().mockResolvedValue(true),
		};

		vi.mocked(createHealthService).mockReturnValue(mockHealthService);
		vi.mocked(createHeartbeatService).mockReturnValue(mockHeartbeatService);

		const mockHealthResult: AllConnectionsHealthResult = {
			status: "healthy",
			latencyMs: 50,
			total: 2,
			healthy: 2,
			unhealthy: 0,
			connections: [
				{
					key: "tenant1:org1",
					tenantSlug: "tenant1",
					orgSlug: "default",
					schemaName: "org_tenant1",
					status: "healthy",
					latencyMs: 25,
				},
				{
					key: "tenant2:org2",
					tenantSlug: "tenant2",
					orgSlug: "default",
					schemaName: "org_tenant2",
					status: "healthy",
					latencyMs: 25,
				},
			],
		};

		mockConnectionManager = {
			getConnection: vi.fn(),
			evictConnection: vi.fn(),
			closeAll: vi.fn(),
			getCacheSize: vi.fn(),
			evictExpired: vi.fn(),
			checkAllConnectionsHealth: vi.fn().mockResolvedValue(mockHealthResult),
		};
	});

	describe("setupHeartbeatService", () => {
		it("creates health service with multi-tenant database check", () => {
			setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			expect(createHealthService).toHaveBeenCalledWith({
				checks: [
					expect.objectContaining({
						name: "multiTenantDatabases",
						critical: true,
					}),
				],
			});
		});

		it("creates heartbeat service with health service", () => {
			setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			expect(createHeartbeatService).toHaveBeenCalledWith({
				healthService: mockHealthService,
			});
		});

		it("returns heartbeat service", () => {
			const result = setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			expect(result).toBe(mockHeartbeatService);
		});

		it("health check uses connection manager checkAllConnectionsHealth", async () => {
			setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			// Get the health check that was passed to createHealthService
			const createHealthServiceCall = vi.mocked(createHealthService).mock.calls[0][0];
			const healthCheck = createHealthServiceCall.checks[0];

			// Run the health check
			const result = await healthCheck.check();

			expect(mockConnectionManager.checkAllConnectionsHealth).toHaveBeenCalled();
			expect(result.status).toBe("healthy");
			expect(result.message).toBe("All 2 tenant connections healthy");
		});

		it("health check uses default timeout of 5000ms", async () => {
			setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			const createHealthServiceCall = vi.mocked(createHealthService).mock.calls[0][0];
			const healthCheck = createHealthServiceCall.checks[0];

			await healthCheck.check();

			expect(mockConnectionManager.checkAllConnectionsHealth).toHaveBeenCalledWith(5000);
		});

		it("health check passes custom timeout to connection manager", async () => {
			setupHeartbeatService({
				connectionManager: mockConnectionManager,
				timeoutMs: 10000,
			});

			const createHealthServiceCall = vi.mocked(createHealthService).mock.calls[0][0];
			const healthCheck = createHealthServiceCall.checks[0];

			await healthCheck.check();

			expect(mockConnectionManager.checkAllConnectionsHealth).toHaveBeenCalledWith(10000);
		});

		it("health check reports unhealthy when connections fail", async () => {
			const unhealthyResult: AllConnectionsHealthResult = {
				status: "unhealthy",
				latencyMs: 100,
				total: 2,
				healthy: 1,
				unhealthy: 1,
				connections: [
					{
						key: "tenant1:org1",
						tenantSlug: "tenant1",
						orgSlug: "default",
						schemaName: "org_tenant1",
						status: "healthy",
						latencyMs: 25,
					},
					{
						key: "tenant2:org2",
						tenantSlug: "tenant2",
						orgSlug: "default",
						schemaName: "org_tenant2",
						status: "unhealthy",
						latencyMs: 75,
						error: "Connection refused",
					},
				],
			};

			mockConnectionManager.checkAllConnectionsHealth = vi.fn().mockResolvedValue(unhealthyResult);

			setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			const createHealthServiceCall = vi.mocked(createHealthService).mock.calls[0][0];
			const healthCheck = createHealthServiceCall.checks[0];

			const result = await healthCheck.check();

			expect(result.status).toBe("unhealthy");
			expect(result.message).toBe("1 of 2 tenant connections unhealthy");
		});

		it("health check handles no connections gracefully", async () => {
			const emptyResult: AllConnectionsHealthResult = {
				status: "healthy",
				latencyMs: 5,
				total: 0,
				healthy: 0,
				unhealthy: 0,
				connections: [],
			};

			mockConnectionManager.checkAllConnectionsHealth = vi.fn().mockResolvedValue(emptyResult);

			setupHeartbeatService({
				connectionManager: mockConnectionManager,
			});

			const createHealthServiceCall = vi.mocked(createHealthService).mock.calls[0][0];
			const healthCheck = createHealthServiceCall.checks[0];

			const result = await healthCheck.check();

			expect(result.status).toBe("healthy");
			expect(result.message).toBe("No active tenant connections to check");
		});
	});
});
