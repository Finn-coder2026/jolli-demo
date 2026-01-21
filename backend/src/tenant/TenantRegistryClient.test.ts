import { createTenantRegistryClient, type TenantRegistryClient } from "./TenantRegistryClient";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("TenantRegistryClient", () => {
	let client: TenantRegistryClient;
	let mockSequelize: Sequelize;
	let mockQuery: ReturnType<typeof vi.fn>;
	let mockClose: ReturnType<typeof vi.fn>;

	const tenantRow = {
		id: "tenant-123",
		slug: "test-tenant",
		display_name: "Test Tenant",
		status: "active",
		deployment_type: "shared",
		database_provider_id: "provider-123",
		database_host: "localhost",
		database_port: 5432,
		database_name: "test_db",
		database_username: "test_user",
		database_password_encrypted: "encrypted_password",
		database_ssl: true,
		database_pool_max: 10,
		configs: { key: "value" },
		configs_updated_at: "2024-01-01T10:00:00.000Z",
		feature_flags: { feature1: true },
		primary_domain: "docs.example.com",
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-02T00:00:00.000Z",
		provisioned_at: "2024-01-01T12:00:00.000Z",
	};

	const orgRow = {
		id: "org-123",
		tenant_id: "tenant-123",
		slug: "default",
		display_name: "Default Org",
		schema_name: "org_default",
		status: "active",
		is_default: true,
		created_at: "2024-01-01T00:00:00.000Z",
		updated_at: "2024-01-02T00:00:00.000Z",
	};

	beforeEach(() => {
		mockQuery = vi.fn();
		mockClose = vi.fn();
		mockSequelize = {
			query: mockQuery,
			close: mockClose,
		} as unknown as Sequelize;

		client = createTenantRegistryClient({
			registryDatabaseUrl: "postgres://test",
			sequelize: mockSequelize,
		});
	});

	describe("getTenant", () => {
		it("returns tenant when found (without database fields)", async () => {
			mockQuery.mockResolvedValue([[tenantRow]]);

			const tenant = await client.getTenant("tenant-123");

			expect(tenant).toBeDefined();
			expect(tenant?.id).toBe("tenant-123");
			expect(tenant?.slug).toBe("test-tenant");
			expect(tenant?.displayName).toBe("Test Tenant");
			expect(tenant?.status).toBe("active");
			expect(tenant?.databaseProviderId).toBe("provider-123");
			// Database connection fields should NOT be on Tenant anymore
			expect((tenant as unknown as { databaseHost?: string }).databaseHost).toBeUndefined();
			expect(tenant?.configs).toEqual({ key: "value" });
			expect(tenant?.configsUpdatedAt).toBeInstanceOf(Date);
			expect(tenant?.featureFlags).toEqual({ feature1: true });
			expect(tenant?.primaryDomain).toBe("docs.example.com");
			expect(tenant?.createdAt).toBeInstanceOf(Date);
			expect(tenant?.provisionedAt).toBeInstanceOf(Date);
		});

		it("returns undefined when tenant not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const tenant = await client.getTenant("non-existent");

			expect(tenant).toBeUndefined();
		});

		it("handles null provisionedAt", async () => {
			mockQuery.mockResolvedValue([[{ ...tenantRow, provisioned_at: null }]]);

			const tenant = await client.getTenant("tenant-123");

			expect(tenant?.provisionedAt).toBeNull();
		});

		it("handles null configs and feature_flags", async () => {
			mockQuery.mockResolvedValue([
				[{ ...tenantRow, configs: null, configs_updated_at: null, feature_flags: null, primary_domain: null }],
			]);

			const tenant = await client.getTenant("tenant-123");

			expect(tenant?.configs).toEqual({});
			expect(tenant?.configsUpdatedAt).toBeNull();
			expect(tenant?.featureFlags).toEqual({});
			expect(tenant?.primaryDomain).toBeNull();
		});
	});

	describe("getTenantBySlug", () => {
		it("returns tenant when found by slug", async () => {
			mockQuery.mockResolvedValue([[tenantRow]]);

			const tenant = await client.getTenantBySlug("test-tenant");

			expect(tenant).toBeDefined();
			expect(tenant?.slug).toBe("test-tenant");
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM tenants t"), {
				bind: ["test-tenant"],
			});
		});

		it("returns undefined when tenant not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const tenant = await client.getTenantBySlug("non-existent");

			expect(tenant).toBeUndefined();
		});
	});

	describe("getTenantDatabaseConfig", () => {
		// Database config row now comes from JOIN with provider table
		const dbConfigRow = {
			tenant_id: "tenant-123", // From tenant table (aliased)
			// These fields come from the provider table
			database_host: "localhost",
			database_port: 5432,
			database_name: "test_db",
			database_username: "test_user",
			database_password_encrypted: "encrypted_password",
			database_ssl: true,
			database_pool_max: 10,
		};

		it("returns database config for a tenant (from provider via JOIN)", async () => {
			mockQuery.mockResolvedValue([[dbConfigRow]]);

			const dbConfig = await client.getTenantDatabaseConfig("tenant-123");

			expect(dbConfig).toBeDefined();
			expect(dbConfig?.tenantId).toBe("tenant-123");
			expect(dbConfig?.databaseHost).toBe("localhost");
			expect(dbConfig?.databasePort).toBe(5432);
			expect(dbConfig?.databaseName).toBe("test_db");
			expect(dbConfig?.databaseUsername).toBe("test_user");
			expect(dbConfig?.databasePasswordEncrypted).toBe("encrypted_password");
			expect(dbConfig?.databaseSsl).toBe(true);
			expect(dbConfig?.databasePoolMax).toBe(10);
			// Verify the query uses JOIN with database_providers
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("JOIN database_providers p"),
				expect.anything(),
			);
		});

		it("returns undefined when tenant not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const dbConfig = await client.getTenantDatabaseConfig("non-existent");

			expect(dbConfig).toBeUndefined();
		});
	});

	describe("getTenantByDomain", () => {
		const domainJoinedRow = {
			// Tenant fields
			id: "tenant-123",
			slug: "test-tenant",
			display_name: "Test Tenant",
			status: "active",
			deployment_type: "shared",
			database_provider_id: "provider-123",
			database_host: "localhost",
			database_port: 5432,
			database_name: "test_db",
			database_username: "test_user",
			database_password_encrypted: "encrypted_password",
			database_ssl: true,
			database_pool_max: 10,
			configs: { key: "value" },
			configs_updated_at: "2024-01-01T10:00:00.000Z",
			feature_flags: { feature1: true },
			primary_domain: "docs.example.com",
			created_at: "2024-01-01T00:00:00.000Z",
			updated_at: "2024-01-02T00:00:00.000Z",
			provisioned_at: "2024-01-01T12:00:00.000Z",
			// Org fields with prefix
			org_id: "org-123",
			org_tenant_id: "tenant-123",
			org_slug: "default",
			org_display_name: "Default Org",
			org_schema_name: "org_default",
			org_status: "active",
			org_is_default: true,
			org_created_at: "2024-01-01T00:00:00.000Z",
			org_updated_at: "2024-01-02T00:00:00.000Z",
		};

		it("returns tenant and org when domain is found and verified", async () => {
			mockQuery.mockResolvedValue([[domainJoinedRow]]);

			const result = await client.getTenantByDomain("docs.example.com");

			expect(result).toBeDefined();
			expect(result?.tenant.id).toBe("tenant-123");
			expect(result?.tenant.slug).toBe("test-tenant");
			expect(result?.org.id).toBe("org-123");
			expect(result?.org.schemaName).toBe("org_default");
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM tenant_domains"), {
				bind: ["docs.example.com"],
			});
		});

		it("returns undefined when domain not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const result = await client.getTenantByDomain("unknown.example.com");

			expect(result).toBeUndefined();
		});

		it("lowercases domain before lookup", async () => {
			mockQuery.mockResolvedValue([[]]);

			await client.getTenantByDomain("Docs.EXAMPLE.com");

			expect(mockQuery).toHaveBeenCalledWith(expect.anything(), {
				bind: ["docs.example.com"],
			});
		});
	});

	describe("listTenants", () => {
		it("returns list of tenant summaries", async () => {
			const summaryRow = {
				id: "tenant-123",
				slug: "test-tenant",
				display_name: "Test Tenant",
				status: "active",
				deployment_type: "shared",
				created_at: "2024-01-01T00:00:00.000Z",
				provisioned_at: "2024-01-01T12:00:00.000Z",
			};
			mockQuery.mockResolvedValue([[summaryRow]]);

			const tenants = await client.listTenants();

			expect(tenants).toHaveLength(1);
			expect(tenants[0].id).toBe("tenant-123");
			expect(tenants[0].displayName).toBe("Test Tenant");
			expect(tenants[0].createdAt).toBeInstanceOf(Date);
		});

		it("returns empty array when no tenants", async () => {
			mockQuery.mockResolvedValue([[]]);

			const tenants = await client.listTenants();

			expect(tenants).toEqual([]);
		});

		it("handles null provisionedAt in tenant summary", async () => {
			const summaryRow = {
				id: "tenant-123",
				slug: "test-tenant",
				display_name: "Test Tenant",
				status: "active",
				deployment_type: "shared",
				created_at: "2024-01-01T00:00:00.000Z",
				provisioned_at: null,
			};
			mockQuery.mockResolvedValue([[summaryRow]]);

			const tenants = await client.listTenants();

			expect(tenants).toHaveLength(1);
			expect(tenants[0].provisionedAt).toBeNull();
		});
	});

	describe("getOrg", () => {
		it("returns org when found", async () => {
			mockQuery.mockResolvedValue([[orgRow]]);

			const org = await client.getOrg("org-123");

			expect(org).toBeDefined();
			expect(org?.id).toBe("org-123");
			expect(org?.tenantId).toBe("tenant-123");
			expect(org?.slug).toBe("default");
			expect(org?.displayName).toBe("Default Org");
			expect(org?.schemaName).toBe("org_default");
			expect(org?.status).toBe("active");
			expect(org?.isDefault).toBe(true);
			expect(org?.createdAt).toBeInstanceOf(Date);
		});

		it("returns undefined when org not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const org = await client.getOrg("non-existent");

			expect(org).toBeUndefined();
		});
	});

	describe("getOrgBySlug", () => {
		it("returns org when found by tenant and slug", async () => {
			mockQuery.mockResolvedValue([[orgRow]]);

			const org = await client.getOrgBySlug("tenant-123", "default");

			expect(org).toBeDefined();
			expect(org?.slug).toBe("default");
			expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM orgs WHERE tenant_id = $1 AND slug = $2", {
				bind: ["tenant-123", "default"],
			});
		});

		it("returns undefined when org not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const org = await client.getOrgBySlug("tenant-123", "non-existent");

			expect(org).toBeUndefined();
		});
	});

	describe("getDefaultOrg", () => {
		it("returns default org for tenant", async () => {
			mockQuery.mockResolvedValue([[orgRow]]);

			const org = await client.getDefaultOrg("tenant-123");

			expect(org).toBeDefined();
			expect(org?.isDefault).toBe(true);
			expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM orgs WHERE tenant_id = $1 AND is_default = true", {
				bind: ["tenant-123"],
			});
		});

		it("returns undefined when no default org", async () => {
			mockQuery.mockResolvedValue([[]]);

			const org = await client.getDefaultOrg("tenant-123");

			expect(org).toBeUndefined();
		});
	});

	describe("listOrgs", () => {
		it("returns list of org summaries for tenant", async () => {
			const summaryRow = {
				id: "org-123",
				tenant_id: "tenant-123",
				slug: "default",
				display_name: "Default Org",
				schema_name: "org_default",
				status: "active",
				is_default: true,
				created_at: "2024-01-01T00:00:00.000Z",
			};
			mockQuery.mockResolvedValue([[summaryRow]]);

			const orgs = await client.listOrgs("tenant-123");

			expect(orgs).toHaveLength(1);
			expect(orgs[0].id).toBe("org-123");
			expect(orgs[0].schemaName).toBe("org_default");
			expect(orgs[0].isDefault).toBe(true);
		});

		it("returns empty array when no orgs", async () => {
			mockQuery.mockResolvedValue([[]]);

			const orgs = await client.listOrgs("tenant-123");

			expect(orgs).toEqual([]);
		});
	});

	describe("close", () => {
		it("closes the sequelize connection", async () => {
			mockClose.mockResolvedValue(undefined);

			await client.close();

			expect(mockClose).toHaveBeenCalled();
		});
	});

	describe("listAllActiveTenants", () => {
		it("returns all active tenants", async () => {
			mockQuery.mockResolvedValue([[tenantRow, { ...tenantRow, id: "tenant-456", slug: "tenant-2" }]]);

			const tenants = await client.listAllActiveTenants();

			expect(tenants).toHaveLength(2);
			expect(tenants[0].id).toBe("tenant-123");
			expect(tenants[1].id).toBe("tenant-456");
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("WHERE t.status = 'active'"));
		});

		it("returns empty array when no active tenants", async () => {
			mockQuery.mockResolvedValue([[]]);

			const tenants = await client.listAllActiveTenants();

			expect(tenants).toEqual([]);
		});
	});

	describe("listAllActiveOrgs", () => {
		it("returns all active orgs for a tenant", async () => {
			mockQuery.mockResolvedValue([[orgRow, { ...orgRow, id: "org-456", slug: "secondary", is_default: false }]]);

			const orgs = await client.listAllActiveOrgs("tenant-123");

			expect(orgs).toHaveLength(2);
			expect(orgs[0].id).toBe("org-123");
			expect(orgs[1].id).toBe("org-456");
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("WHERE tenant_id = $1 AND status = 'active'"),
				{ bind: ["tenant-123"] },
			);
		});

		it("returns empty array when tenant has no active orgs", async () => {
			mockQuery.mockResolvedValue([[]]);

			const orgs = await client.listAllActiveOrgs("tenant-123");

			expect(orgs).toEqual([]);
		});
	});

	describe("getTenantOrgByInstallationId", () => {
		const installationJoinedRow = {
			// Tenant fields
			id: "tenant-123",
			slug: "test-tenant",
			display_name: "Test Tenant",
			status: "active",
			deployment_type: "shared",
			database_provider_id: "provider-123",
			database_host: "localhost",
			database_port: 5432,
			database_name: "test_db",
			database_username: "test_user",
			database_password_encrypted: "encrypted_password",
			database_ssl: true,
			database_pool_max: 10,
			configs: { key: "value" },
			configs_updated_at: "2024-01-01T10:00:00.000Z",
			feature_flags: { feature1: true },
			primary_domain: "docs.example.com",
			created_at: "2024-01-01T00:00:00.000Z",
			updated_at: "2024-01-02T00:00:00.000Z",
			provisioned_at: "2024-01-01T12:00:00.000Z",
			// Org fields with prefix
			org_id: "org-123",
			org_tenant_id: "tenant-123",
			org_slug: "default",
			org_display_name: "Default Org",
			org_schema_name: "org_default",
			org_status: "active",
			org_is_default: true,
			org_created_at: "2024-01-01T00:00:00.000Z",
			org_updated_at: "2024-01-02T00:00:00.000Z",
		};

		it("returns tenant and org when installation mapping is found", async () => {
			mockQuery.mockResolvedValue([[installationJoinedRow]]);

			const result = await client.getTenantOrgByInstallationId(12345);

			expect(result).toBeDefined();
			expect(result?.tenant.id).toBe("tenant-123");
			expect(result?.tenant.slug).toBe("test-tenant");
			expect(result?.org.id).toBe("org-123");
			expect(result?.org.schemaName).toBe("org_default");
			expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("FROM github_installation_mappings"), {
				bind: [12345],
			});
		});

		it("returns undefined when installation mapping not found", async () => {
			mockQuery.mockResolvedValue([[]]);

			const result = await client.getTenantOrgByInstallationId(99999);

			expect(result).toBeUndefined();
		});
	});

	describe("createInstallationMapping", () => {
		it("creates a new installation mapping", async () => {
			mockQuery.mockResolvedValue([[], undefined]);

			await client.createInstallationMapping({
				installationId: 12345,
				tenantId: "tenant-123",
				orgId: "org-123",
				githubAccountLogin: "my-org",
				githubAccountType: "Organization",
			});

			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("INSERT INTO github_installation_mappings"),
				expect.objectContaining({
					bind: expect.arrayContaining([12345, "tenant-123", "org-123", "my-org", "Organization"]),
				}),
			);
		});

		it("handles upsert for existing installation", async () => {
			mockQuery.mockResolvedValue([[], undefined]);

			await client.createInstallationMapping({
				installationId: 12345,
				tenantId: "tenant-456",
				orgId: "org-456",
				githubAccountLogin: "updated-org",
				githubAccountType: "User",
			});

			// Should use ON CONFLICT DO UPDATE
			expect(mockQuery).toHaveBeenCalledWith(
				expect.stringContaining("ON CONFLICT (installation_id)"),
				expect.anything(),
			);
		});
	});

	describe("deleteInstallationMapping", () => {
		it("deletes an installation mapping", async () => {
			mockQuery.mockResolvedValue([[], undefined]);

			await client.deleteInstallationMapping(12345);

			expect(mockQuery).toHaveBeenCalledWith(
				"DELETE FROM github_installation_mappings WHERE installation_id = $1",
				{
					bind: [12345],
				},
			);
		});
	});

	describe("production code paths", () => {
		it("calls factory function when no sequelize injection provided", async () => {
			const factory = await import("./TenantSequelizeFactory");
			const createRegistrySequelizeSpy = vi
				.spyOn(factory, "createRegistrySequelize")
				.mockReturnValue(mockSequelize);

			const { createTenantRegistryClient: createClient } = await import("./TenantRegistryClient");

			const productionClient = createClient({
				registryDatabaseUrl: "postgres://localhost/test",
				// No sequelize injection
			});

			expect(createRegistrySequelizeSpy).toHaveBeenCalledWith("postgres://localhost/test", 5);

			createRegistrySequelizeSpy.mockRestore();
			await productionClient.close();
		});
	});
});
