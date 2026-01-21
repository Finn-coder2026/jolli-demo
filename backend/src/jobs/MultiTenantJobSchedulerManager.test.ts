import type { Database } from "../core/Database";
import type { JobDao } from "../dao/JobDao";
import * as TenantContextModule from "../tenant/TenantContext";
import type { JobDefinition } from "../types/JobTypes";
import { createMultiTenantJobSchedulerManager } from "./MultiTenantJobSchedulerManager";
import type { Org, Tenant } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock the JobScheduler module
vi.mock("./JobScheduler", () => ({
	createJobScheduler: vi.fn(() => ({
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		registerJob: vi.fn(),
		queueJob: vi.fn().mockResolvedValue({ jobId: "job-123" }),
		getEventEmitter: vi.fn().mockReturnValue({
			on: vi.fn(),
			off: vi.fn(),
			emit: vi.fn(),
		}),
	})),
}));

// Mock TenantContext
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(() => null),
}));

describe("MultiTenantJobSchedulerManager", () => {
	let mockJobDao: JobDao;
	let mockDatabase: Database;

	beforeEach(() => {
		mockJobDao = {
			createJobExecution: vi.fn(),
			updateJobExecutionStatus: vi.fn(),
			getJobExecution: vi.fn(),
			listJobExecutions: vi.fn(),
			deleteOldExecutions: vi.fn(),
		} as unknown as JobDao;

		mockDatabase = {
			jobDao: mockJobDao,
		} as unknown as Database;

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Single-tenant mode", () => {
		it("should throw error if defaultDatabase is not provided", () => {
			expect(() =>
				createMultiTenantJobSchedulerManager({
					workerMode: true,
				}),
			).toThrow("defaultDatabase is required for single-tenant mode");
		});

		it("should create manager in single-tenant mode when no registryClient", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			expect(manager).toBeDefined();
			expect(manager.getSingleTenantScheduler).toBeDefined();
		});

		it("should return single scheduler via getSingleTenantScheduler", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			const scheduler = manager.getSingleTenantScheduler();
			expect(scheduler).toBeDefined();
		});

		it("should return same scheduler on multiple getSingleTenantScheduler calls", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			const scheduler1 = manager.getSingleTenantScheduler();
			const scheduler2 = manager.getSingleTenantScheduler();
			expect(scheduler1).toBe(scheduler2);
		});

		it("should return single scheduler via getSchedulerForContext", async () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			const tenantOrgScheduler = await manager.getSchedulerForContext();
			expect(tenantOrgScheduler).toBeDefined();
			expect(tenantOrgScheduler.tenant.id).toBe("default");
			expect(tenantOrgScheduler.org.id).toBe("default");
		});

		it("should return empty array for listActiveSchedulers in single-tenant mode", async () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			const activeSchedulers = await manager.listActiveSchedulers();
			expect(activeSchedulers).toEqual([]);
		});

		it("should register job definitions", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			const definitions: Array<JobDefinition> = [
				{
					name: "test-job-1",
					description: "Test job 1",
					category: "test",
					schema: z.object({}),
					handler: vi.fn(),
				},
				{
					name: "test-job-2",
					description: "Test job 2",
					category: "test",
					schema: z.object({}),
					handler: vi.fn(),
				},
			];

			manager.registerJobDefinitions(definitions);

			// Get scheduler to trigger registration
			const scheduler = manager.getSingleTenantScheduler();
			expect(scheduler).toBeDefined();
		});

		it("should support setJobRegistrationCallback", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			const callback = vi.fn();
			manager.setJobRegistrationCallback(callback);

			// Get scheduler to trigger callback
			const scheduler = manager.getSingleTenantScheduler();
			expect(scheduler).toBeDefined();
			expect(callback).toHaveBeenCalled();
		});

		it("should call callback on existing scheduler when setting callback after creation", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			// Get scheduler first
			manager.getSingleTenantScheduler();

			// Then set callback
			const callback = vi.fn();
			manager.setJobRegistrationCallback(callback);

			expect(callback).toHaveBeenCalled();
		});

		it("should return 0 for getCacheSize in single-tenant mode", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			expect(manager.getCacheSize()).toBe(0);
		});

		it("should close scheduler when closeAll is called", async () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			// Create the scheduler
			manager.getSingleTenantScheduler();

			// Close all
			await manager.closeAll();

			// Scheduler should be cleared
			expect(manager.getSingleTenantScheduler()).toBeDefined(); // Creates new one
		});

		it("should evict expired - no-op in single-tenant mode", async () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			// Should not throw
			await manager.evictExpired();
		});
	});

	describe("Multi-tenant mode", () => {
		it("should throw error if connectionManager is not provided", () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
			};

			expect(() =>
				createMultiTenantJobSchedulerManager({
					registryClient: mockRegistryClient as never,
					workerMode: true,
				}),
			).toThrow("connectionManager is required for multi-tenant mode");
		});

		it("should throw error if decryptPassword is not provided", () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			expect(() =>
				createMultiTenantJobSchedulerManager({
					registryClient: mockRegistryClient as never,
					connectionManager: mockConnectionManager as never,
					workerMode: true,
				}),
			).toThrow("decryptPassword is required for multi-tenant mode");
		});

		it("should return undefined for getSingleTenantScheduler in multi-tenant mode", () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn(),
				workerMode: true,
			});

			expect(manager.getSingleTenantScheduler()).toBeUndefined();
		});

		it("should throw error for getSchedulerForContext without tenant context", async () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn(),
				workerMode: true,
			});

			await expect(manager.getSchedulerForContext()).rejects.toThrow("No tenant context available");
		});

		it("should list active schedulers", async () => {
			const mockRegistryClient = {
				listTenants: vi.fn().mockResolvedValue([
					{ id: "t1", slug: "tenant1", status: "active" },
					{ id: "t2", slug: "tenant2", status: "suspended" },
				]),
				listOrgs: vi.fn().mockResolvedValue([
					{ id: "o1", tenantId: "t1", slug: "org1", status: "active" },
					{ id: "o2", tenantId: "t1", slug: "org2", status: "suspended" },
				]),
				getTenantDatabaseConfig: vi.fn(),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn(),
				workerMode: true,
			});

			const activeSchedulers = await manager.listActiveSchedulers();

			// Only tenant1 is active, and only org1 within it is active
			expect(activeSchedulers).toHaveLength(1);
			expect(activeSchedulers[0].tenant.slug).toBe("tenant1");
			expect(activeSchedulers[0].org.slug).toBe("org1");
		});

		it("should register job definitions for future schedulers", () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn(),
				workerMode: true,
			});

			const definitions: Array<JobDefinition> = [
				{
					name: "test-job",
					description: "Test job",
					category: "test",
					schema: z.object({}),
					handler: vi.fn(),
				},
			];

			// Should not throw
			manager.registerJobDefinitions(definitions);
		});

		it("should get scheduler for tenant and org", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			const scheduler = await manager.getScheduler(mockTenant, mockOrg);

			expect(scheduler).toBeDefined();
			expect(scheduler.tenant).toEqual(mockTenant);
			expect(scheduler.org).toEqual(mockOrg);
			expect(manager.getCacheSize()).toBe(1);
		});

		it("should return cached scheduler on second call", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			const scheduler1 = await manager.getScheduler(mockTenant, mockOrg);
			const scheduler2 = await manager.getScheduler(mockTenant, mockOrg);

			expect(scheduler1).toBe(scheduler2);
			expect(mockRegistryClient.getTenantDatabaseConfig).toHaveBeenCalledTimes(1);
		});

		it("should throw error if database config not found", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue(undefined),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn(),
				workerMode: true,
			});

			await expect(manager.getScheduler(mockTenant, mockOrg)).rejects.toThrow(
				"No database config found for tenant",
			);
		});

		it("should evict LRU when cache is full", async () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			// Create manager with maxSchedulers: 2
			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
				maxSchedulers: 2,
			});

			const now = new Date();
			const createTenant = (id: string): Tenant => ({
				id,
				slug: `tenant-${id}`,
				displayName: `Tenant ${id}`,
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
			});

			const createOrg = (id: string, tenantId: string): Org => ({
				id,
				tenantId,
				slug: `org-${id}`,
				displayName: `Org ${id}`,
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: now,
				updatedAt: now,
			});

			// Add first scheduler
			await manager.getScheduler(createTenant("1"), createOrg("1", "1"));
			expect(manager.getCacheSize()).toBe(1);

			// Add second scheduler
			await manager.getScheduler(createTenant("2"), createOrg("2", "2"));
			expect(manager.getCacheSize()).toBe(2);

			// Add third scheduler - should trigger LRU eviction
			await manager.getScheduler(createTenant("3"), createOrg("3", "3"));
			expect(manager.getCacheSize()).toBe(2); // Still 2 due to LRU eviction
		});

		it("should evict expired entries", async () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			// Create manager with very short TTL
			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
				ttlMs: 1, // 1ms TTL
			});

			const now = new Date();
			const tenant: Tenant = {
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
			const org: Org = {
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

			await manager.getScheduler(tenant, org);
			expect(manager.getCacheSize()).toBe(1);

			// Wait for TTL to expire
			await new Promise(resolve => setTimeout(resolve, 10));

			// Evict expired entries
			await manager.evictExpired();
			expect(manager.getCacheSize()).toBe(0);
		});

		it("should close all cached schedulers", async () => {
			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			const now = new Date();
			const tenant: Tenant = {
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
			const org: Org = {
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

			await manager.getScheduler(tenant, org);
			expect(manager.getCacheSize()).toBe(1);

			await manager.closeAll();
			expect(manager.getCacheSize()).toBe(0);
		});

		it("should get scheduler for context with tenant context", async () => {
			const now = new Date();
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

			// Mock getTenantContext to return a valid context
			vi.mocked(TenantContextModule.getTenantContext).mockReturnValue({
				tenant: mockTenant,
				org: mockOrg,
				schemaName: mockOrg.schemaName,
				database: { jobDao: mockJobDao } as never,
			});

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			const scheduler = await manager.getSchedulerForContext();
			expect(scheduler).toBeDefined();
			expect(scheduler.tenant).toEqual(mockTenant);
			expect(scheduler.org).toEqual(mockOrg);
		});

		it("should handle concurrent getScheduler calls", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			// Call getScheduler concurrently
			const [scheduler1, scheduler2, scheduler3] = await Promise.all([
				manager.getScheduler(mockTenant, mockOrg),
				manager.getScheduler(mockTenant, mockOrg),
				manager.getScheduler(mockTenant, mockOrg),
			]);

			// All should return the same scheduler
			expect(scheduler1).toBe(scheduler2);
			expect(scheduler2).toBe(scheduler3);

			// Only one database config fetch should have happened
			expect(mockRegistryClient.getTenantDatabaseConfig).toHaveBeenCalledTimes(1);
		});

		it("should call job registration callback on new schedulers", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			const callback = vi.fn();
			manager.setJobRegistrationCallback(callback);

			await manager.getScheduler(mockTenant, mockOrg);

			expect(callback).toHaveBeenCalled();
		});

		it("should register job definitions on existing cached schedulers", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			// Create a scheduler first
			await manager.getScheduler(mockTenant, mockOrg);

			// Now register job definitions
			const definitions: Array<JobDefinition> = [
				{
					name: "test-job",
					description: "Test job",
					category: "test",
					schema: z.object({}),
					handler: vi.fn(),
				},
			];
			manager.registerJobDefinitions(definitions);

			// Definitions should be applied to the existing scheduler
			expect(manager.getCacheSize()).toBe(1);
		});

		it("should call registration callback on existing cached schedulers", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockResolvedValue({
					tenantId: "tenant-1",
					databaseHost: "localhost",
					databasePort: 5432,
					databaseName: "testdb",
					databaseUsername: "testuser",
					databasePasswordEncrypted: "encrypted-password",
					databaseSsl: false,
					databasePoolMax: 5,
				}),
			};
			const mockConnectionManager = {
				getConnection: vi.fn().mockResolvedValue({
					jobDao: mockJobDao,
				}),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn().mockResolvedValue("decrypted-password"),
				workerMode: true,
			});

			// Create a scheduler first
			await manager.getScheduler(mockTenant, mockOrg);

			// Set callback after scheduler exists
			const callback = vi.fn();
			manager.setJobRegistrationCallback(callback);

			// Callback should be called on existing scheduler
			expect(callback).toHaveBeenCalled();
		});

		it("should remove failed scheduler from cache on initialization error", async () => {
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
				createdAt: new Date(),
				updatedAt: new Date(),
				provisionedAt: new Date(),
			};

			const mockOrg: Org = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "test-org",
				displayName: "Test Org",
				schemaName: "public",
				isDefault: true,
				status: "active",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockRegistryClient = {
				listTenants: vi.fn(),
				listOrgs: vi.fn(),
				getTenantDatabaseConfig: vi.fn().mockRejectedValue(new Error("Database config fetch failed")),
			};
			const mockConnectionManager = {
				getConnection: vi.fn(),
			};

			const manager = createMultiTenantJobSchedulerManager({
				registryClient: mockRegistryClient as never,
				connectionManager: mockConnectionManager as never,
				decryptPassword: vi.fn(),
				workerMode: true,
			});

			await expect(manager.getScheduler(mockTenant, mockOrg)).rejects.toThrow("Database config fetch failed");

			// Cache should be empty after failed initialization
			expect(manager.getCacheSize()).toBe(0);
		});

		it("should register job definitions on single-tenant scheduler after creation", () => {
			const manager = createMultiTenantJobSchedulerManager({
				defaultDatabase: mockDatabase,
				workerMode: true,
			});

			// Create the scheduler first
			manager.getSingleTenantScheduler();

			// Now register job definitions
			const definitions: Array<JobDefinition> = [
				{
					name: "test-job",
					description: "Test job",
					category: "test",
					schema: z.object({}),
					handler: vi.fn(),
				},
			];
			manager.registerJobDefinitions(definitions);

			// Should not throw
			expect(manager.getSingleTenantScheduler()).toBeDefined();
		});
	});
});
