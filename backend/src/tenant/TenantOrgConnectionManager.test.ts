import type { Database } from "../core/Database";
import type { TenantDatabaseConfig } from "./TenantDatabaseConfig";
import {
	createTenantOrgConnectionManager,
	type TenantOrgConnectionManager,
	type TenantOrgConnectionManagerInternalConfig,
} from "./TenantOrgConnectionManager";
import type { TenantRegistryClient } from "./TenantRegistryClient";
import type { Org, Tenant } from "jolli-common";
import type { Sequelize } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createMockTenant(overrides: Partial<Tenant> = {}): Tenant {
	return {
		id: "tenant-123",
		slug: "test-tenant",
		displayName: "Test Tenant",
		status: "active",
		deploymentType: "shared",
		databaseProviderId: "provider-123",
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		provisionedAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockDatabaseConfig(overrides: Partial<TenantDatabaseConfig> = {}): TenantDatabaseConfig {
	return {
		tenantId: "tenant-123",
		databaseHost: "localhost",
		databasePort: 5432,
		databaseName: "test_db",
		databaseUsername: "test_user",
		databasePasswordEncrypted: "encrypted_password",
		databaseSsl: false,
		databasePoolMax: 5,
		...overrides,
	};
}

function createMockOrg(overrides: Partial<Org> = {}): Org {
	return {
		id: "org-123",
		tenantId: "tenant-123",
		slug: "default",
		displayName: "Default Org",
		schemaName: "org_default",
		status: "active",
		isDefault: true,
		createdAt: new Date("2024-01-01"),
		updatedAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockSequelize(): Sequelize {
	return {
		query: vi.fn().mockResolvedValue([[], {}]),
		close: vi.fn().mockResolvedValue(undefined),
	} as unknown as Sequelize;
}

function createMockDatabase(): Database {
	return {} as Database;
}

describe("TenantOrgConnectionManager", () => {
	let manager: TenantOrgConnectionManager;
	let mockSequelize: Sequelize;
	let mockDatabase: Database;
	let mockDbConfig: TenantDatabaseConfig;
	let registryClient: TenantRegistryClient;
	let decryptPassword: ReturnType<typeof vi.fn>;
	let createSequelizeFn: ReturnType<typeof vi.fn>;
	let createDatabaseFn: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockSequelize = createMockSequelize();
		mockDatabase = createMockDatabase();
		mockDbConfig = createMockDatabaseConfig();
		decryptPassword = vi.fn().mockResolvedValue("decrypted_password");
		createSequelizeFn = vi.fn().mockReturnValue(mockSequelize);
		createDatabaseFn = vi.fn().mockResolvedValue(mockDatabase);

		registryClient = {
			getTenant: vi.fn(),
			getTenantBySlug: vi.fn(),
			getTenantByDomain: vi.fn(),
			getTenantDatabaseConfig: vi.fn().mockResolvedValue(mockDbConfig),
			listTenants: vi.fn(),
			listAllActiveTenants: vi.fn(),
			getOrg: vi.fn(),
			getOrgBySlug: vi.fn(),
			getDefaultOrg: vi.fn(),
			listOrgs: vi.fn(),
			listAllActiveOrgs: vi.fn(),
			getTenantOrgByInstallationId: vi.fn(),
			createInstallationMapping: vi.fn(),
			deleteInstallationMapping: vi.fn(),
			close: vi.fn(),
		};

		const config: TenantOrgConnectionManagerInternalConfig = {
			registryClient,
			decryptPassword,
			createSequelizeFn,
			createDatabaseFn,
			maxConnections: 3,
			ttlMs: 1000, // 1 second for testing
		};

		manager = createTenantOrgConnectionManager(config);
	});

	afterEach(async () => {
		await manager.closeAll();
	});

	describe("getConnection", () => {
		it("creates a new connection on cache miss", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			const database = await manager.getConnection(tenant, org);

			expect(database).toBe(mockDatabase);
			expect(registryClient.getTenantDatabaseConfig).toHaveBeenCalledWith(tenant.id);
			expect(decryptPassword).toHaveBeenCalledWith("encrypted_password");
			// schemaName is passed to createSequelizeFn so connection options set search_path
			expect(createSequelizeFn).toHaveBeenCalledWith(mockDbConfig, "decrypted_password", "org_default");
			// No options passed when forceSync is not specified
			expect(createDatabaseFn).toHaveBeenCalledWith(mockSequelize, undefined);
			// search_path is set via PostgreSQL connection options, not via explicit query
			expect(manager.getCacheSize()).toBe(1);
		});

		it("passes forceSync option to createDatabaseFn", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			await manager.getConnection(tenant, org, { forceSync: true });

			// forceSync should be passed through to createDatabaseFn
			expect(createDatabaseFn).toHaveBeenCalledWith(mockSequelize, { forceSync: true });
		});

		it("returns cached connection on cache hit", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			const database1 = await manager.getConnection(tenant, org);
			const database2 = await manager.getConnection(tenant, org);

			expect(database1).toBe(database2);
			expect(createSequelizeFn).toHaveBeenCalledTimes(1);
			expect(createDatabaseFn).toHaveBeenCalledTimes(1);
		});

		it("creates separate connections for different orgs", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1", schemaName: "org_one" });
			const org2 = createMockOrg({ id: "org-2", schemaName: "org_two" });

			await manager.getConnection(tenant, org1);
			await manager.getConnection(tenant, org2);

			expect(createSequelizeFn).toHaveBeenCalledTimes(2);
			expect(manager.getCacheSize()).toBe(2);
		});

		it("creates separate connections for different tenants", async () => {
			const tenant1 = createMockTenant({ id: "tenant-1" });
			const tenant2 = createMockTenant({ id: "tenant-2" });
			const org = createMockOrg();

			await manager.getConnection(tenant1, org);
			await manager.getConnection(tenant2, org);

			expect(createSequelizeFn).toHaveBeenCalledTimes(2);
			expect(manager.getCacheSize()).toBe(2);
		});

		it("evicts LRU entry when at capacity", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1" });
			const org2 = createMockOrg({ id: "org-2" });
			const org3 = createMockOrg({ id: "org-3" });
			const org4 = createMockOrg({ id: "org-4" });

			// Create three connections (at capacity)
			await manager.getConnection(tenant, org1);
			await manager.getConnection(tenant, org2);
			await manager.getConnection(tenant, org3);

			expect(manager.getCacheSize()).toBe(3);

			// Access org1 to make it recently used
			await manager.getConnection(tenant, org1);

			// Create fourth connection - should evict org2 (least recently used)
			await manager.getConnection(tenant, org4);

			expect(manager.getCacheSize()).toBe(3);
			// org2's sequelize should have been closed
			expect(mockSequelize.close).toHaveBeenCalled();
		});

		it("handles LRU eviction close errors gracefully", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1" });
			const org2 = createMockOrg({ id: "org-2" });
			const org3 = createMockOrg({ id: "org-3" });
			const org4 = createMockOrg({ id: "org-4" });

			// Create three connections (at capacity)
			await manager.getConnection(tenant, org1);
			await manager.getConnection(tenant, org2);
			await manager.getConnection(tenant, org3);

			// Make close fail for LRU eviction
			(mockSequelize.close as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LRU close failed"));

			// Create fourth connection - should evict and handle error gracefully
			await manager.getConnection(tenant, org4);

			expect(manager.getCacheSize()).toBe(3);
		});

		it("handles concurrent requests for the same connection", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			// Create a delay in database creation to simulate slow initialization
			let resolveDb!: (db: Database) => void;
			const dbPromise = new Promise<Database>(resolve => {
				resolveDb = resolve;
			});
			createDatabaseFn.mockReturnValue(dbPromise);

			// Start two concurrent requests
			const promise1 = manager.getConnection(tenant, org);
			const promise2 = manager.getConnection(tenant, org);

			// Resolve the database creation
			resolveDb(mockDatabase);

			const [db1, db2] = await Promise.all([promise1, promise2]);

			// Both should get the same database
			expect(db1).toBe(db2);
			// Should only create one connection
			expect(createSequelizeFn).toHaveBeenCalledTimes(1);
		});

		it("removes failed entry from cache on error", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			createDatabaseFn.mockRejectedValueOnce(new Error("Database creation failed"));

			await expect(manager.getConnection(tenant, org)).rejects.toThrow("Database creation failed");
			expect(manager.getCacheSize()).toBe(0);

			// Second attempt should try again
			createDatabaseFn.mockResolvedValueOnce(mockDatabase);
			const database = await manager.getConnection(tenant, org);
			expect(database).toBe(mockDatabase);
			expect(manager.getCacheSize()).toBe(1);
		});

		it("passes public schema to createSequelizeFn", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "public" });

			await manager.getConnection(tenant, org);

			// schemaName "public" is passed to createSequelizeFn
			// Connection options will skip setting search_path for public schema
			expect(createSequelizeFn).toHaveBeenCalledWith(mockDbConfig, "decrypted_password", "public");
		});

		it("passes non-public schema to createSequelizeFn", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_engineering" });

			await manager.getConnection(tenant, org);

			// schemaName is passed to createSequelizeFn so connection options can set search_path
			expect(createSequelizeFn).toHaveBeenCalledWith(mockDbConfig, "decrypted_password", "org_engineering");
		});

		it("throws error when database config not found", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			// Return undefined for database config
			(registryClient.getTenantDatabaseConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			await expect(manager.getConnection(tenant, org)).rejects.toThrow(
				`No database config found for tenant: ${tenant.slug} (${tenant.id})`,
			);
			expect(manager.getCacheSize()).toBe(0);
		});
	});

	describe("evictConnection", () => {
		it("removes and closes a specific connection", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			await manager.getConnection(tenant, org);
			expect(manager.getCacheSize()).toBe(1);

			await manager.evictConnection(tenant.id, org.id);

			expect(manager.getCacheSize()).toBe(0);
			expect(mockSequelize.close).toHaveBeenCalled();
		});

		it("does nothing for non-existent connection", async () => {
			await manager.evictConnection("non-existent", "non-existent");
			expect(manager.getCacheSize()).toBe(0);
		});

		it("waits for initialization before evicting", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			let resolveDb!: (db: Database) => void;
			const dbPromise = new Promise<Database>(resolve => {
				resolveDb = resolve;
			});
			createDatabaseFn.mockReturnValue(dbPromise);

			// Start connection creation
			const connectionPromise = manager.getConnection(tenant, org);

			// Start eviction while still initializing (this will wait for initialization)
			const evictPromise = manager.evictConnection(tenant.id, org.id);

			// Resolve the database creation
			resolveDb(mockDatabase);

			// Wait for both to complete
			await connectionPromise;
			await evictPromise;

			// After eviction completes, cache should be empty (eviction deletes the key first)
			expect(mockSequelize.close).toHaveBeenCalled();
		});

		it("handles eviction when initialization fails", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			let rejectDb!: (err: Error) => void;
			const dbPromise = new Promise<Database>((_resolve, reject) => {
				rejectDb = reject;
			});
			createDatabaseFn.mockReturnValue(dbPromise);

			// Start connection creation
			const connectionPromise = manager.getConnection(tenant, org);

			// Start eviction while still initializing
			const evictPromise = manager.evictConnection(tenant.id, org.id);

			// Reject the database creation
			rejectDb(new Error("Initialization failed"));

			// Wait for eviction to complete (should not throw)
			await evictPromise;

			// Connection promise should reject
			await expect(connectionPromise).rejects.toThrow("Initialization failed");

			expect(manager.getCacheSize()).toBe(0);
		});
	});

	describe("closeAll", () => {
		it("closes all cached connections", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1" });
			const org2 = createMockOrg({ id: "org-2" });

			await manager.getConnection(tenant, org1);
			await manager.getConnection(tenant, org2);

			expect(manager.getCacheSize()).toBe(2);

			await manager.closeAll();

			expect(manager.getCacheSize()).toBe(0);
			expect(mockSequelize.close).toHaveBeenCalledTimes(2);
		});

		it("handles empty cache", async () => {
			await manager.closeAll();
			expect(manager.getCacheSize()).toBe(0);
		});

		it("handles close errors gracefully", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			await manager.getConnection(tenant, org);

			(mockSequelize.close as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Close failed"));

			// Should not throw
			await manager.closeAll();
			expect(manager.getCacheSize()).toBe(0);
		});

		it("closes initializing connections", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			let resolveDb!: (db: Database) => void;
			const dbPromise = new Promise<Database>(resolve => {
				resolveDb = resolve;
			});
			createDatabaseFn.mockReturnValue(dbPromise);

			// Start initialization
			const connectionPromise = manager.getConnection(tenant, org);

			// Start closeAll while initializing
			const closePromise = manager.closeAll();

			// Resolve database creation
			resolveDb(mockDatabase);

			// Wait for both to complete
			await connectionPromise;
			await closePromise;

			expect(mockSequelize.close).toHaveBeenCalled();
			expect(manager.getCacheSize()).toBe(0);
		});
	});

	describe("evictExpired", () => {
		it("removes entries older than TTL", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			await manager.getConnection(tenant, org);
			expect(manager.getCacheSize()).toBe(1);

			// Wait for TTL to expire (1 second)
			await new Promise(resolve => setTimeout(resolve, 1100));

			await manager.evictExpired();

			expect(manager.getCacheSize()).toBe(0);
			expect(mockSequelize.close).toHaveBeenCalled();
		});

		it("does not evict recently used entries", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			await manager.getConnection(tenant, org);

			// Access again to refresh lastUsed
			await manager.getConnection(tenant, org);

			await manager.evictExpired();

			expect(manager.getCacheSize()).toBe(1);
		});

		it("does not evict initializing entries", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			let resolveDb!: (db: Database) => void;
			const dbPromise = new Promise<Database>(resolve => {
				resolveDb = resolve;
			});
			createDatabaseFn.mockReturnValue(dbPromise);

			// Start initialization but don't complete
			const connectionPromise = manager.getConnection(tenant, org);

			// Wait past TTL
			await new Promise(resolve => setTimeout(resolve, 1100));

			// Try to evict
			await manager.evictExpired();

			// Should still be in cache (initializing)
			expect(manager.getCacheSize()).toBe(1);

			// Complete initialization
			resolveDb(mockDatabase);
			await connectionPromise;
		});

		it("handles close errors gracefully in evictExpired", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();

			await manager.getConnection(tenant, org);

			// Make close fail
			(mockSequelize.close as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Expired close failed"));

			// Wait for TTL to expire
			await new Promise(resolve => setTimeout(resolve, 1100));

			// Should not throw
			await manager.evictExpired();

			expect(manager.getCacheSize()).toBe(0);
		});
	});

	describe("getCacheSize", () => {
		it("returns 0 for empty cache", () => {
			expect(manager.getCacheSize()).toBe(0);
		});

		it("returns correct count", async () => {
			const tenant = createMockTenant();

			await manager.getConnection(tenant, createMockOrg({ id: "org-1" }));
			expect(manager.getCacheSize()).toBe(1);

			await manager.getConnection(tenant, createMockOrg({ id: "org-2" }));
			expect(manager.getCacheSize()).toBe(2);
		});
	});

	describe("default configuration", () => {
		it("uses default values when not specified", () => {
			const minimalConfig: TenantOrgConnectionManagerInternalConfig = {
				registryClient,
				decryptPassword,
				createSequelizeFn,
				createDatabaseFn,
			};

			const minimalManager = createTenantOrgConnectionManager(minimalConfig);
			expect(minimalManager.getCacheSize()).toBe(0);
		});
	});

	describe("production code paths", () => {
		it("calls factory functions when no injections provided", async () => {
			// Import the factory functions to mock them
			const factory = await import("./TenantSequelizeFactory");
			const createTenantSequelizeSpy = vi.spyOn(factory, "createTenantSequelize").mockReturnValue(mockSequelize);
			const createTenantDatabaseSpy = vi.spyOn(factory, "createTenantDatabase").mockResolvedValue(mockDatabase);

			const productionConfig: TenantOrgConnectionManagerInternalConfig = {
				registryClient,
				decryptPassword,
				// No createSequelizeFn or createDatabaseFn
			};

			const productionManager = createTenantOrgConnectionManager(productionConfig);

			const tenant = createMockTenant();
			const org = createMockOrg();

			await productionManager.getConnection(tenant, org);

			// Now includes schemaName as 5th parameter for pool hook search_path setting
			expect(createTenantSequelizeSpy).toHaveBeenCalledWith(
				mockDbConfig,
				"decrypted_password",
				5,
				false,
				"org_default",
			);
			// createTenantDatabase is called with undefined options when forceSync not specified
			expect(createTenantDatabaseSpy).toHaveBeenCalledWith(mockSequelize, undefined);

			createTenantSequelizeSpy.mockRestore();
			createTenantDatabaseSpy.mockRestore();
			await productionManager.closeAll();
		});

		it("passes forceSync to createTenantDatabase in production", async () => {
			// Import the factory functions to mock them
			const factory = await import("./TenantSequelizeFactory");
			const createTenantSequelizeSpy = vi.spyOn(factory, "createTenantSequelize").mockReturnValue(mockSequelize);
			const createTenantDatabaseSpy = vi.spyOn(factory, "createTenantDatabase").mockResolvedValue(mockDatabase);

			const productionConfig: TenantOrgConnectionManagerInternalConfig = {
				registryClient,
				decryptPassword,
			};

			const productionManager = createTenantOrgConnectionManager(productionConfig);

			const tenant = createMockTenant();
			const org = createMockOrg();

			await productionManager.getConnection(tenant, org, { forceSync: true });

			// createTenantDatabase should be called with forceSync: true
			expect(createTenantDatabaseSpy).toHaveBeenCalledWith(mockSequelize, { forceSync: true });

			createTenantSequelizeSpy.mockRestore();
			createTenantDatabaseSpy.mockRestore();
			await productionManager.closeAll();
		});
	});
});
