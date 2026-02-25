import type { MultiTenantJobSchedulerManager } from "../jobs/MultiTenantJobSchedulerManager";
import type { TenantOrgJobScheduler } from "../jobs/TenantOrgJobScheduler";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type { WorkerPollingConfig } from "./WorkerPolling";
import { startWorkerPolling } from "./WorkerPolling";
import type { Org, OrgSummary, Tenant, TenantSummary } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Default retry config for tests */
const DEFAULT_RETRY_CONFIG = {
	retryMaxRetries: 5,
	retryBaseDelayMs: 1000,
	retryMaxDelayMs: 30000,
	retryResetAfterMs: 60000,
} as const;

/** Creates a test polling config with optional overrides */
function createTestConfig(overrides: Partial<WorkerPollingConfig> = {}): WorkerPollingConfig {
	return {
		pollIntervalMs: 10000,
		maxConcurrentSchedulers: 100,
		...DEFAULT_RETRY_CONFIG,
		...overrides,
	};
}

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
			listTenantsWithDefaultOrg: vi.fn(),
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
			ensureInstallationMapping: vi.fn(),
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
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			expect(mockRegistryClient.listTenants).toHaveBeenCalled();
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-1");
			// getScheduler handles starting the scheduler internally
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledWith(mockTenant, mockOrg);

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

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

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

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

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

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({ maxConcurrentSchedulers: 3 }),
			);

			// Should stop after reaching limit
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(3);

			await stopPolling();
		});

		it("should skip tenant-orgs that are already active", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

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

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			// Should not create scheduler if tenant details not found
			expect(mockSchedulerManager.getScheduler).not.toHaveBeenCalled();

			await stopPolling();
		});

		it("should handle errors when getting scheduler", async () => {
			// getScheduler handles starting internally, so errors come from there
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue(
				new Error("Scheduler initialization failed"),
			);

			// Should not throw
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			await stopPolling();
		});

		it("should handle assertion-style errors from scheduler initialization", async () => {
			const assertionError = Object.assign(new Error("database unavailable"), {
				code: "ERR_ASSERTION",
			});
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue(assertionError);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);
			await stopPolling();
		});

		it("should handle non-assertion coded errors from scheduler initialization", async () => {
			const codedError = Object.assign(new Error("scheduler failed"), {
				code: "E_SCHEDULER",
			});
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue(codedError);

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);
			await stopPolling();
		});

		it("should handle non-error thrown values from scheduler initialization", async () => {
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue("unexpected string failure");

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);
			await stopPolling();
		});

		it("should stop all schedulers when stopPolling is called", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			await stopPolling();

			expect(mockScheduler.stop).toHaveBeenCalled();
		});

		it("should handle errors when stopping schedulers", async () => {
			vi.mocked(mockScheduler.stop).mockRejectedValue(new Error("Stop failed"));

			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

			// Should not throw
			await stopPolling();
		});

		it("should not refresh schedulers after shutdown", async () => {
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

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
			const stopPolling = await startWorkerPolling(mockSchedulerManager, mockRegistryClient, createTestConfig());

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

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({ pollIntervalMs: 100 }),
			);

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

		it("should return early when an interval callback runs after shutdown", async () => {
			const capturedCallbacks: Array<() => void> = [];
			const originalSetInterval = globalThis.setInterval;
			const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockImplementation(((
				callback: TimerHandler,
				delay?: number,
				...args: Array<unknown>
			) => {
				if (typeof callback === "function") {
					capturedCallbacks.push(callback as () => void);
				}
				return originalSetInterval(callback, delay, ...args);
			}) as typeof setInterval);

			try {
				const stopPolling = await startWorkerPolling(
					mockSchedulerManager,
					mockRegistryClient,
					createTestConfig({ pollIntervalMs: 100 }),
				);

				expect(capturedCallbacks).toHaveLength(1);
				await stopPolling();

				vi.mocked(mockRegistryClient.listTenants).mockClear();
				capturedCallbacks[0]?.();
				await Promise.resolve();

				expect(mockRegistryClient.listTenants).not.toHaveBeenCalled();
			} finally {
				setIntervalSpy.mockRestore();
			}
		});

		it("should handle errors in periodic refresh callback", async () => {
			// First call succeeds, subsequent calls throw
			vi.mocked(mockRegistryClient.listTenants)
				.mockResolvedValueOnce([mockTenantSummary])
				.mockRejectedValue(new Error("Periodic refresh error"));

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({ pollIntervalMs: 100 }),
			);

			// Trigger the interval callback which will fail
			await vi.advanceTimersByTimeAsync(100);

			// Should not throw, error should be caught and logged
			await stopPolling();
		});

		it("should apply exponential backoff after scheduler initialization failure", async () => {
			// First call to getScheduler fails
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValueOnce(new Error("Initialization failed"));

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({ pollIntervalMs: 500 }), // Shorter than base backoff delay (1000ms)
			);

			// First attempt failed
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			// Advance by poll interval (500ms) - should skip due to backoff (base delay is 1000ms)
			vi.mocked(mockSchedulerManager.getScheduler).mockClear();
			await vi.advanceTimersByTimeAsync(500);

			// Should skip the tenant-org because it's in backoff period (500ms < 1000ms backoff)
			expect(mockSchedulerManager.getScheduler).not.toHaveBeenCalled();

			// Advance timer to exceed backoff period (another 500ms = total 1000ms since failure)
			vi.mocked(mockSchedulerManager.getScheduler).mockResolvedValueOnce(mockScheduler);
			await vi.advanceTimersByTimeAsync(500);

			// Now it should retry (1000ms elapsed >= 1000ms backoff)
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			await stopPolling();
		});

		it("should reset failure count after successful initialization", async () => {
			// First call fails, second succeeds
			vi.mocked(mockSchedulerManager.getScheduler)
				.mockRejectedValueOnce(new Error("Initialization failed"))
				.mockResolvedValue(mockScheduler);

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({ pollIntervalMs: 500 }),
			);

			// First attempt failed
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			// Advance past the backoff period and poll interval
			vi.mocked(mockSchedulerManager.getScheduler).mockClear();
			await vi.advanceTimersByTimeAsync(2000);

			// Should have succeeded on retry
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalled();

			await stopPolling();
		});

		it("should stop retrying after maxRetries consecutive failures", async () => {
			// Set up getScheduler to always fail
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue(new Error("Initialization failed"));

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({
					pollIntervalMs: 100,
					retryMaxRetries: 2, // Give up after 2 failures
					retryBaseDelayMs: 50,
					retryMaxDelayMs: 200,
				}),
			);

			// First attempt fails
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			// Advance past backoff (50ms) and poll interval (100ms) to trigger 2nd attempt
			vi.mocked(mockSchedulerManager.getScheduler).mockClear();
			await vi.advanceTimersByTimeAsync(100);
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			// Advance past backoff (100ms for 2nd failure) and poll interval - should NOT retry (hit maxRetries)
			vi.mocked(mockSchedulerManager.getScheduler).mockClear();
			await vi.advanceTimersByTimeAsync(500);
			expect(mockSchedulerManager.getScheduler).not.toHaveBeenCalled();

			await stopPolling();
		});

		it("should retry after reset period even if maxRetries was exceeded", async () => {
			// Set up getScheduler to always fail initially
			vi.mocked(mockSchedulerManager.getScheduler).mockRejectedValue(new Error("Initialization failed"));

			const stopPolling = await startWorkerPolling(
				mockSchedulerManager,
				mockRegistryClient,
				createTestConfig({
					pollIntervalMs: 100,
					retryMaxRetries: 1, // Give up after 1 failure
					retryBaseDelayMs: 50,
					retryMaxDelayMs: 200,
					retryResetAfterMs: 500, // Reset after 500ms
				}),
			);

			// First attempt fails, maxRetries reached
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			// Advance less than reset period - should still be skipped
			vi.mocked(mockSchedulerManager.getScheduler).mockClear();
			await vi.advanceTimersByTimeAsync(300);
			expect(mockSchedulerManager.getScheduler).not.toHaveBeenCalled();

			// Advance past reset period (total > 500ms) - should retry
			vi.mocked(mockSchedulerManager.getScheduler).mockClear();
			await vi.advanceTimersByTimeAsync(300);
			expect(mockSchedulerManager.getScheduler).toHaveBeenCalledTimes(1);

			await stopPolling();
		});
	});
});
