/**
 * Integration tests for multi-tenant schema isolation.
 *
 * These tests verify that the schemaName-based isolation approach used by
 * TenantOrgConnectionManager correctly isolates data between orgs.
 * The search_path is set in the Sequelize pool's afterCreate hook
 * (via createTenantSequelize) to ensure ALL connections in the pool
 * have the correct search_path set.
 */

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

interface MockSequelizeInstance {
	query: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
	/** Schema name passed to createTenantSequelize (used for pool hook search_path setting) */
	schemaName: string;
}

function createMockSequelize(schemaName: string): MockSequelizeInstance & Sequelize {
	const instance: MockSequelizeInstance = {
		query: vi.fn().mockResolvedValue([[], {}]),
		close: vi.fn().mockResolvedValue(undefined),
		schemaName,
	};
	return instance as MockSequelizeInstance & Sequelize;
}

function createMockDatabase(schemaName: string): Database {
	// Include schema name in the mock for verification
	return { _schemaName: schemaName } as unknown as Database;
}

describe("TenantSchemaIsolation", () => {
	let manager: TenantOrgConnectionManager;
	let registryClient: TenantRegistryClient;
	let mockDbConfig: TenantDatabaseConfig;
	let decryptPassword: ReturnType<typeof vi.fn>;
	let createSequelizeFn: ReturnType<typeof vi.fn>;
	let createDatabaseFn: ReturnType<typeof vi.fn>;
	let _sequelizeInstances: Map<string, MockSequelizeInstance & Sequelize>;

	beforeEach(() => {
		_sequelizeInstances = new Map();
		mockDbConfig = createMockDatabaseConfig();
		decryptPassword = vi.fn().mockResolvedValue("decrypted_password");

		// Create a unique Sequelize instance per org for tracking
		// schemaName is now passed as the 3rd argument (used for pool hook search_path setting)
		createSequelizeFn = vi
			.fn()
			.mockImplementation((_dbConfig: TenantDatabaseConfig, _password: string, schemaName: string) => {
				const instance = createMockSequelize(schemaName);
				return instance;
			});

		createDatabaseFn = vi.fn().mockImplementation((sequelize: MockSequelizeInstance & Sequelize) => {
			// Return a database that carries the schema name for verification
			// schemaName is now set directly on the sequelize instance (passed to createSequelizeFn)
			const schemaName = sequelize.schemaName ?? "unknown";
			return Promise.resolve(createMockDatabase(schemaName));
		});

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
			maxConnections: 10,
			ttlMs: 60000,
		};

		manager = createTenantOrgConnectionManager(config);
	});

	afterEach(async () => {
		await manager.closeAll();
	});

	describe("search_path isolation", () => {
		it("passes schemaName to createSequelizeFn for pool hook search_path setting", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_engineering" });

			await manager.getConnection(tenant, org);

			expect(createSequelizeFn).toHaveBeenCalledTimes(1);
			// Verify schemaName was passed to createSequelizeFn (used by pool's afterCreate hook)
			expect(createSequelizeFn).toHaveBeenCalledWith(mockDbConfig, "decrypted_password", "org_engineering");
			// Verify the sequelize instance has the correct schema
			const sequelizeInstance = createSequelizeFn.mock.results[0].value as MockSequelizeInstance;
			expect(sequelizeInstance.schemaName).toBe("org_engineering");
		});

		it("uses different search_paths for different orgs in same tenant", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1", schemaName: "org_engineering" });
			const org2 = createMockOrg({ id: "org-2", schemaName: "org_marketing" });

			const db1 = await manager.getConnection(tenant, org1);
			const db2 = await manager.getConnection(tenant, org2);

			// Verify separate connections were created
			expect(createSequelizeFn).toHaveBeenCalledTimes(2);
			expect(manager.getCacheSize()).toBe(2);

			// Verify each database has the correct schema
			expect((db1 as unknown as { _schemaName: string })._schemaName).toBe("org_engineering");
			expect((db2 as unknown as { _schemaName: string })._schemaName).toBe("org_marketing");
		});

		it("maintains schema isolation when reusing cached connections", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1", schemaName: "org_engineering" });
			const org2 = createMockOrg({ id: "org-2", schemaName: "org_marketing" });

			// First access creates connections
			const db1First = await manager.getConnection(tenant, org1);
			const db2First = await manager.getConnection(tenant, org2);

			// Second access uses cached connections
			const db1Second = await manager.getConnection(tenant, org1);
			const db2Second = await manager.getConnection(tenant, org2);

			// Verify same instances are returned (cache hit)
			expect(db1First).toBe(db1Second);
			expect(db2First).toBe(db2Second);

			// Verify no additional connections were created
			expect(createSequelizeFn).toHaveBeenCalledTimes(2);

			// Verify schema isolation is maintained
			expect((db1Second as unknown as { _schemaName: string })._schemaName).toBe("org_engineering");
			expect((db2Second as unknown as { _schemaName: string })._schemaName).toBe("org_marketing");
		});

		it("creates separate connections for orgs in different tenants", async () => {
			const tenant1 = createMockTenant({ id: "tenant-1" });
			const tenant2 = createMockTenant({ id: "tenant-2" });
			const org = createMockOrg({ schemaName: "org_default" });

			await manager.getConnection(tenant1, org);
			await manager.getConnection(tenant2, org);

			// Verify separate connections for different tenants
			expect(createSequelizeFn).toHaveBeenCalledTimes(2);
			expect(manager.getCacheSize()).toBe(2);
		});

		it("evicts connection and creates new one with correct schema on reconnect", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_engineering" });

			// Get initial connection
			const db1 = await manager.getConnection(tenant, org);
			expect((db1 as unknown as { _schemaName: string })._schemaName).toBe("org_engineering");

			// Evict the connection
			await manager.evictConnection(tenant.id, org.id);
			expect(manager.getCacheSize()).toBe(0);

			// Get new connection - should recreate with same schema
			const db2 = await manager.getConnection(tenant, org);
			expect((db2 as unknown as { _schemaName: string })._schemaName).toBe("org_engineering");

			// Should be a different instance (new connection)
			expect(db1).not.toBe(db2);
			expect(createSequelizeFn).toHaveBeenCalledTimes(2);
		});
	});

	describe("data isolation verification", () => {
		it("separate orgs have independent database instances", async () => {
			const tenant = createMockTenant();
			const orgEngineering = createMockOrg({
				id: "org-eng",
				slug: "engineering",
				schemaName: "org_engineering",
			});
			const orgMarketing = createMockOrg({
				id: "org-mkt",
				slug: "marketing",
				schemaName: "org_marketing",
			});

			const dbEngineering = await manager.getConnection(tenant, orgEngineering);
			const dbMarketing = await manager.getConnection(tenant, orgMarketing);

			// Verify they are different database instances
			expect(dbEngineering).not.toBe(dbMarketing);

			// Verify each is associated with the correct schema
			expect((dbEngineering as unknown as { _schemaName: string })._schemaName).toBe("org_engineering");
			expect((dbMarketing as unknown as { _schemaName: string })._schemaName).toBe("org_marketing");
		});

		it("operations on one org do not affect another", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1", schemaName: "org_one" });
			const org2 = createMockOrg({ id: "org-2", schemaName: "org_two" });

			// Get connections - each has its own Sequelize instance with its own schemaName
			await manager.getConnection(tenant, org1);
			await manager.getConnection(tenant, org2);

			// Verify each Sequelize instance has the correct schemaName
			const sequelize1 = createSequelizeFn.mock.results[0].value as MockSequelizeInstance;
			const sequelize2 = createSequelizeFn.mock.results[1].value as MockSequelizeInstance;

			expect(sequelize1.schemaName).toBe("org_one");
			expect(sequelize2.schemaName).toBe("org_two");

			// Verify the schemaNames are different (data isolation)
			expect(sequelize1.schemaName).not.toBe(sequelize2.schemaName);
		});
	});

	describe("concurrent access", () => {
		it("handles concurrent requests to same org correctly", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_concurrent" });

			// Simulate concurrent requests
			const [db1, db2, db3] = await Promise.all([
				manager.getConnection(tenant, org),
				manager.getConnection(tenant, org),
				manager.getConnection(tenant, org),
			]);

			// All should get the same database instance
			expect(db1).toBe(db2);
			expect(db2).toBe(db3);

			// Only one connection should have been created
			expect(createSequelizeFn).toHaveBeenCalledTimes(1);
			expect(manager.getCacheSize()).toBe(1);
		});

		it("handles concurrent requests to different orgs correctly", async () => {
			const tenant = createMockTenant();
			const org1 = createMockOrg({ id: "org-1", schemaName: "org_one" });
			const org2 = createMockOrg({ id: "org-2", schemaName: "org_two" });
			const org3 = createMockOrg({ id: "org-3", schemaName: "org_three" });

			// Simulate concurrent requests to different orgs
			const [db1, db2, db3] = await Promise.all([
				manager.getConnection(tenant, org1),
				manager.getConnection(tenant, org2),
				manager.getConnection(tenant, org3),
			]);

			// Each should have its own database instance
			expect(db1).not.toBe(db2);
			expect(db2).not.toBe(db3);
			expect(db1).not.toBe(db3);

			// Three connections should have been created
			expect(createSequelizeFn).toHaveBeenCalledTimes(3);
			expect(manager.getCacheSize()).toBe(3);

			// Verify each has correct schema
			expect((db1 as unknown as { _schemaName: string })._schemaName).toBe("org_one");
			expect((db2 as unknown as { _schemaName: string })._schemaName).toBe("org_two");
			expect((db3 as unknown as { _schemaName: string })._schemaName).toBe("org_three");
		});
	});

	describe("schema naming", () => {
		it("passes schema names with special characters to createSequelizeFn", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_my-schema" });

			await manager.getConnection(tenant, org);

			// schemaName with special characters is passed to createSequelizeFn
			// The pool's afterCreate hook will properly quote it when setting search_path
			expect(createSequelizeFn).toHaveBeenCalledWith(mockDbConfig, "decrypted_password", "org_my-schema");
		});

		it("handles schema names with underscores", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_my_long_schema_name" });

			await manager.getConnection(tenant, org);

			const sequelizeInstance = createSequelizeFn.mock.results[0].value as MockSequelizeInstance;
			expect(sequelizeInstance.schemaName).toBe("org_my_long_schema_name");
		});
	});
});
