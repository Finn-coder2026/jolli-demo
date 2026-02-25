import type { AllConnectionsHealthResult, TenantOrgConnectionManager } from "../../tenant/TenantOrgConnectionManager";
import { createMultiTenantDatabaseCheck, type MultiTenantDatabaseCheckResult } from "./MultiTenantDatabaseCheck";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("MultiTenantDatabaseCheck", () => {
	let mockConnectionManager: TenantOrgConnectionManager;

	beforeEach(() => {
		vi.clearAllMocks();

		mockConnectionManager = {
			getConnection: vi.fn(),
			evictConnection: vi.fn(),
			closeAll: vi.fn(),
			getCacheSize: vi.fn(),
			evictExpired: vi.fn(),
			checkAllConnectionsHealth: vi.fn(),
		};
	});

	it("returns healthy when no active connections", async () => {
		const emptyResult: AllConnectionsHealthResult = {
			status: "healthy",
			latencyMs: 5,
			total: 0,
			healthy: 0,
			unhealthy: 0,
			connections: [],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(emptyResult);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		const result = (await check.check()) as MultiTenantDatabaseCheckResult;

		expect(result.status).toBe("healthy");
		expect(result.message).toBe("No active tenant connections to check");
	});

	it("returns healthy when all connections are healthy", async () => {
		const healthyResult: AllConnectionsHealthResult = {
			status: "healthy",
			latencyMs: 50,
			total: 3,
			healthy: 3,
			unhealthy: 0,
			connections: [
				{
					key: "t1:o1",
					tenantSlug: "acme",
					orgSlug: "default",
					schemaName: "org_acme",
					status: "healthy",
					latencyMs: 15,
				},
				{
					key: "t1:o2",
					tenantSlug: "acme",
					orgSlug: "eng",
					schemaName: "org_eng",
					status: "healthy",
					latencyMs: 20,
				},
				{
					key: "t2:o1",
					tenantSlug: "globex",
					orgSlug: "default",
					schemaName: "org_globex",
					status: "healthy",
					latencyMs: 15,
				},
			],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(healthyResult);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		const result = (await check.check()) as MultiTenantDatabaseCheckResult;

		expect(result.status).toBe("healthy");
		expect(result.message).toBe("All 3 tenant connections healthy");
		expect(result.details?.total).toBe(3);
		expect(result.details?.healthy).toBe(3);
		expect(result.details?.unhealthy).toBe(0);
		expect(result.details?.failures).toHaveLength(0);
	});

	it("returns unhealthy when some connections fail", async () => {
		const mixedResult: AllConnectionsHealthResult = {
			status: "unhealthy",
			latencyMs: 100,
			total: 3,
			healthy: 2,
			unhealthy: 1,
			connections: [
				{
					key: "t1:o1",
					tenantSlug: "acme",
					orgSlug: "default",
					schemaName: "org_acme",
					status: "healthy",
					latencyMs: 15,
				},
				{
					key: "t1:o2",
					tenantSlug: "acme",
					orgSlug: "eng",
					schemaName: "org_eng",
					status: "unhealthy",
					latencyMs: 50,
					error: "Connection refused",
				},
				{
					key: "t2:o1",
					tenantSlug: "globex",
					orgSlug: "default",
					schemaName: "org_globex",
					status: "healthy",
					latencyMs: 15,
				},
			],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(mixedResult);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		const result = (await check.check()) as MultiTenantDatabaseCheckResult;

		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("1 of 3 tenant connections unhealthy");
		expect(result.details?.total).toBe(3);
		expect(result.details?.healthy).toBe(2);
		expect(result.details?.unhealthy).toBe(1);
		expect(result.details?.failures).toHaveLength(1);
		expect(result.details?.failures[0]).toEqual({
			tenant: "acme",
			org: "eng",
			error: "Connection refused",
		});
	});

	it("returns unhealthy when all connections fail", async () => {
		const allFailedResult: AllConnectionsHealthResult = {
			status: "unhealthy",
			latencyMs: 100,
			total: 2,
			healthy: 0,
			unhealthy: 2,
			connections: [
				{
					key: "t1:o1",
					tenantSlug: "acme",
					orgSlug: "default",
					schemaName: "org_acme",
					status: "unhealthy",
					latencyMs: 50,
					error: "Connection timeout",
				},
				{
					key: "t2:o1",
					tenantSlug: "globex",
					orgSlug: "default",
					schemaName: "org_globex",
					status: "unhealthy",
					latencyMs: 50,
					error: "Auth failed",
				},
			],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(allFailedResult);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		const result = (await check.check()) as MultiTenantDatabaseCheckResult;

		expect(result.status).toBe("unhealthy");
		expect(result.message).toBe("2 of 2 tenant connections unhealthy");
		expect(result.details?.failures).toHaveLength(2);
	});

	it("has correct name and critical flag", () => {
		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });

		expect(check.name).toBe("multiTenantDatabases");
		expect(check.critical).toBe(true);
	});

	it("passes timeout to connection manager", async () => {
		const emptyResult: AllConnectionsHealthResult = {
			status: "healthy",
			latencyMs: 5,
			total: 0,
			healthy: 0,
			unhealthy: 0,
			connections: [],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(emptyResult);

		const check = createMultiTenantDatabaseCheck({
			connectionManager: mockConnectionManager,
			timeoutMs: 10000,
		});
		await check.check();

		expect(mockConnectionManager.checkAllConnectionsHealth).toHaveBeenCalledWith(10000);
	});

	it("uses default timeout of 5000ms", async () => {
		const emptyResult: AllConnectionsHealthResult = {
			status: "healthy",
			latencyMs: 5,
			total: 0,
			healthy: 0,
			unhealthy: 0,
			connections: [],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(emptyResult);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		await check.check();

		expect(mockConnectionManager.checkAllConnectionsHealth).toHaveBeenCalledWith(5000);
	});

	it("handles missing tenant/org slugs gracefully", async () => {
		const resultWithMissingSlugs: AllConnectionsHealthResult = {
			status: "unhealthy",
			latencyMs: 50,
			total: 1,
			healthy: 0,
			unhealthy: 1,
			connections: [
				{ key: "t1:o1", schemaName: "org_unknown", status: "unhealthy", latencyMs: 50, error: "DB down" },
			],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(resultWithMissingSlugs);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		const result = (await check.check()) as MultiTenantDatabaseCheckResult;

		expect(result.details?.failures[0]).toEqual({
			tenant: "unknown",
			org: "unknown",
			error: "DB down",
		});
	});

	it("handles missing error message gracefully", async () => {
		const resultWithMissingError: AllConnectionsHealthResult = {
			status: "unhealthy",
			latencyMs: 50,
			total: 1,
			healthy: 0,
			unhealthy: 1,
			connections: [
				{
					key: "t1:o1",
					tenantSlug: "acme",
					orgSlug: "default",
					schemaName: "org_acme",
					status: "unhealthy",
					latencyMs: 50,
				},
			],
		};
		vi.mocked(mockConnectionManager.checkAllConnectionsHealth).mockResolvedValue(resultWithMissingError);

		const check = createMultiTenantDatabaseCheck({ connectionManager: mockConnectionManager });
		const result = (await check.check()) as MultiTenantDatabaseCheckResult;

		expect(result.details?.failures[0]).toEqual({
			tenant: "acme",
			org: "default",
			error: "Unknown error",
		});
	});
});
