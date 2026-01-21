import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager";
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { startWorkerPolling } from "./WorkerPolling";
import type { Org, OrgSummary, Tenant, TenantSummary } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("WorkerPolling", () => {
	let mockSchedulerManager: MultiTenantJobSchedulerManager;
	let mockRegistryClient: TenantRegistryClient;
	let mockScheduler: TenantOrgJobScheduler;

	const now = new Date();

	const mockTenantSummary: TenantSummary = {
		id: "tenant-1",
		slug: "test-tenant",
		displayName: "Test Tenant",
		status: "active",
		deploymentType: "shared",
		primaryDomain: null,
		createdAt: now,
		provisionedAt: now,
	};

	const mockTenant: Tenant = {
		id: "tenant-1",
		slug: "test-tenant",
		displayName: "Test Tenant",
		status: "active",
		deploymentType: "shared",
		databaseProviderId: "default",
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: now,
		updatedAt: now,
		provisionedAt: now,
	};

	const mockOrgSummary: OrgSummary = {
		id: "org-1",
		tenantId: "tenant-1",
		slug: "test-org",
		displayName: "Test Org",
		schemaName: "public",
		status: "active",
		isDefault: true,
		createdAt: now,
	};

	const mockOrg: Org = {
		id: "org-1",
		tenantId: "tenant-1",
		slug: "test-org",
		displayName: "Test Org",
		schemaName: "public",
		isDefault: true,
		status: "active",
		createdAt: now,
		updatedAt: now,
	};

	beforeEach(() => {
		vi.useFakeTimers();

		mockScheduler = {
			tenant: mockTenant,
			org: mockOrg,
			scheduler: {} as never,
			queueJob: vi.fn(),
			getJobExecution: vi.fn().mockResolvedValue(undefined),
			registerJob: vi.fn(),
			start: vi.fn().mockResolvedValue(undefined),
			stop: vi.fn().mockResolvedValue(undefined),
		};

		mockSchedulerManager = {
			getScheduler: vi.fn().mockResolvedValue(mockScheduler),
			getSchedulerForContext: vi.fn(),
			registerJobDefinitions: vi.fn(),
			setJobRegistrationCallback: vi.fn(),
			listActiveSchedulers: vi.fn(),
			getSingleTenantScheduler: vi.fn(),
			closeAll: vi.fn(),
			getCacheSize: vi.fn(),
			evictExpired: vi.fn(),
		};

		mockRegistryClient = {
			getTenant: vi.fn().mockResolvedValue(mockTenant),
			getTenantBySlug: vi.fn(),
			listTenants: vi.fn().mockResolvedValue([mockTenantSummary]),
			listAllActiveTenants: vi.fn(),
			getTenantByDomain: vi.fn(),
			getTenantDatabaseConfig: vi.fn(),
			getOrg: vi.fn().mockResolvedValue(mockOrg),
			getOrgBySlug: vi.fn(),
			getDefaultOrg: vi.fn(),
			listOrgs: vi.fn().mockResolvedValue([mockOrgSummary]),
			listAllActiveOrgs: vi.fn(),
			getTenantOrgByInstallationId: vi.fn(),
			createInstallationMapping: vi.fn(),
			deleteInstallationMapping: vi.fn(),
			close: vi.fn(),
		};
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	describe("startWorkerPolling", () => {
		it("should start polling and create schedulers for active tenant-orgs", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			expect(mockRegistryClient.listTenants).toHaveBeenCalled();
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-1");
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledWith(mockTenant, mockOrg);
			expect(mockScheduler.start).toHaveBeenCalled();

			await stopPolling();
		});

		it("should filter out suspended tenants", async () => {
			const suspendedTenantSummary: TenantSummary = {
				...mockTenantSummary,
				id: "tenant-2",
				slug: "suspended-tenant",
				status: "suspended",
			};

			vi.mocked(mockRegistryClient.listTenants).mockResolvedValue([mockTenantSummary, suspendedTenantSummary]);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			// Should only get orgs for active tenant
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledTimes(1);
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-1");

			await stopPolling();
		});

		it("should filter out suspended orgs", async () => {
			const suspendedOrgSummary: OrgSummary = {
				...mockOrgSummary,
				id: "org-2",
				slug: "suspended-org",
				status: "suspended",
			};

			vi.mocked(mockRegistryClient.listOrgs).mockResolvedValue([mockOrgSummary, suspendedOrgSummary]);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			// Should only create scheduler for active org
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			await stopPolling();
		});

		it("should respect maxConcurrentSchedulers limit", async () => {
			const tenantSummaries: Array<TenantSummary> = [];
			for (let i = 0; i < 10; i++) {
				tenantSummaries.push({
					...mockTenantSummary,
					id: `tenant-${i}`,
					slug: `tenant-${i}`,
				});
			}

			vi.mocked(mockRegistryClient.listTenants).mockResolvedValue(tenantSummaries);
			vi.mocked(mockRegistryClient.listOrgs).mockResolvedValue([mockOrgSummary]);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 3, // Limit to 3
			});

			// Should stop after reaching limit
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(3);

			await stopPolling();
		});

		it("should skip tenant-orgs that are already active", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			// First call creates scheduler
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			// Advance timer to trigger refresh
			await vi.advanceTimersByTimeAsync(10000);

			// Should not create another scheduler for the same tenant-org
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			await stopPolling();
		});

		it("should handle errors when fetching tenant/org details", async () => {
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			// Should not create scheduler if tenant details not found
			expect(mockSchedulerManager.getScheduler).not.toHaveBeenCalled();

			await stopPolling();
		});

		it("should handle errors when starting scheduler", async () => {
			vi.mocked(mockScheduler.start).mockRejectedValue(new Error("Start failed"));

			// Should not throw
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			await stopPolling();
		});

		it("should stop all schedulers when stopPolling is called", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			await stopPolling();

			expect(mockScheduler.stop).toHaveBeenCalled();
		});

		it("should handle errors when stopping schedulers", async () => {
			vi.mocked(mockScheduler.stop).mockRejectedValue(new Error("Stop failed"));

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			// Should not throw
			await stopPolling();
		});

		it("should not refresh schedulers after shutdown", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			// Stop polling
			await stopPolling();

			// Clear mock calls
			vi.mocked(mockRegistryClient.listTenants).mockClear();

			// Advance timer (should not trigger refresh)
			await vi.advanceTimersByTimeAsync(10000);

			expect(mockRegistryClient.listTenants).not.toHaveBeenCalled();
		});

		it("should handle errors during scheduler refresh", async () => {
			vi.mocked(mockRegistryClient.listTenants).mockRejectedValue(new Error("Registry error"));

			// Should not throw
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 10000,
				maxConcurrentSchedulers: 100,
			});

			await stopPolling();
		});

		it("should skip refresh when shutting down during interval callback", async () => {
			// Set up a scenario where the refresh will be called via interval
			// but we'll trigger shutdown before it completes
			let resolveListTenants: (() => void) | undefined;
			const listTenantsPromise = new Promise<Array<TenantSummary>>(resolve => {
				resolveListTenants = () => resolve([mockTenantSummary]);
			});

			// First call returns immediately, subsequent calls wait
			vi.mocked(mockRegistryClient.listTenants)
				.mockResolvedValueOnce([mockTenantSummary])
				.mockImplementation(() => listTenantsPromise);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 100,
				maxConcurrentSchedulers: 100,
			});

			// First call completed, now trigger interval
			await vi.advanceTimersByTimeAsync(100);

			// Stop polling while listTenants is pending
			const stopPromise = stopPolling();

			// Now resolve the pending call (but it should be in shutdown state)
			resolveListTenants?.();

			await stopPromise;

			// The scheduler should have been created only once (from initial call)
			// The interval call should have returned early due to shutdown
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);
		});

		it("should handle errors in periodic refresh callback", async () => {
			// First call succeeds, subsequent calls throw
			vi.mocked(mockRegistryClient.listTenants)
				.mockResolvedValueOnce([mockTenantSummary])
				.mockRejectedValue(new Error("Periodic refresh error"));

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, {
				pollIntervalMs: 100,
				maxConcurrentSchedulers: 100,
			});

			// Trigger the interval callback which will fail
			await vi.advanceTimersByTimeAsync(100);

			// Should not throw, error should be caught and logged
			await stopPolling();
		});
	});
});
