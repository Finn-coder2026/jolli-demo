import type { Database } from "../core/Database";
import {
	createTenantOrgContext,
	getTenantContext,
	requireDatabase,
	requireSchemaName,
	requireTenantContext,
	runWithTenantContext,
} from "./TenantContext";
import type { Org, Tenant } from "jolli-common";
import { describe, expect, it } from "vitest";

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

function createMockDatabase(): Database {
	return {} as Database;
}

describe("TenantContext", () => {
	describe("getTenantContext", () => {
		it("returns undefined when not in a tenant context", () => {
			expect(getTenantContext()).toBeUndefined();
		});

		it("returns the context when inside runWithTenantContext", () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			runWithTenantContext(context, () => {
				const ctx = getTenantContext();
				expect(ctx).toBeDefined();
				expect(ctx?.tenant.id).toBe("tenant-123");
				expect(ctx?.org.id).toBe("org-123");
				expect(ctx?.schemaName).toBe("org_default");
			});
		});

		it("returns undefined after exiting tenant context", () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			runWithTenantContext(context, () => {
				expect(getTenantContext()).toBeDefined();
			});

			expect(getTenantContext()).toBeUndefined();
		});
	});

	describe("requireTenantContext", () => {
		it("throws when not in a tenant context", () => {
			expect(() => requireTenantContext()).toThrow("Tenant context not initialized");
		});

		it("returns the context when inside runWithTenantContext", () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			runWithTenantContext(context, () => {
				const ctx = requireTenantContext();
				expect(ctx.tenant.id).toBe("tenant-123");
				expect(ctx.org.id).toBe("org-123");
			});
		});
	});

	describe("requireSchemaName", () => {
		it("throws when not in a tenant context", () => {
			expect(() => requireSchemaName()).toThrow("Tenant context not initialized");
		});

		it("returns the schema name when inside runWithTenantContext", () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_engineering" });
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			runWithTenantContext(context, () => {
				const schemaName = requireSchemaName();
				expect(schemaName).toBe("org_engineering");
			});
		});
	});

	describe("requireDatabase", () => {
		it("throws when not in a tenant context", () => {
			expect(() => requireDatabase()).toThrow("Tenant context not initialized");
		});

		it("returns the database when inside runWithTenantContext", () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			runWithTenantContext(context, () => {
				const db = requireDatabase();
				expect(db).toBe(database);
			});
		});
	});

	describe("runWithTenantContext", () => {
		it("returns the value from the function", () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const result = runWithTenantContext(context, () => {
				return "test-result";
			});

			expect(result).toBe("test-result");
		});

		it("propagates context to nested async functions", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const result = await runWithTenantContext(context, async () => {
				// Simulate async operation
				await Promise.resolve();

				const ctx = getTenantContext();
				return ctx?.tenant.slug;
			});

			expect(result).toBe("test-tenant");
		});

		it("maintains separate contexts for nested runs", () => {
			const tenant1 = createMockTenant({ id: "tenant-1", slug: "tenant-1" });
			const tenant2 = createMockTenant({ id: "tenant-2", slug: "tenant-2" });
			const org = createMockOrg();
			const database = createMockDatabase();

			const context1 = createTenantOrgContext(tenant1, org, database);
			const context2 = createTenantOrgContext(tenant2, org, database);

			runWithTenantContext(context1, () => {
				expect(getTenantContext()?.tenant.slug).toBe("tenant-1");

				runWithTenantContext(context2, () => {
					expect(getTenantContext()?.tenant.slug).toBe("tenant-2");
				});

				// Should restore to original context
				expect(getTenantContext()?.tenant.slug).toBe("tenant-1");
			});
		});
	});

	describe("createTenantOrgContext", () => {
		it("creates a context with correct schemaName", () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ schemaName: "org_engineering" });
			const database = createMockDatabase();

			const context = createTenantOrgContext(tenant, org, database);

			expect(context.tenant).toBe(tenant);
			expect(context.org).toBe(org);
			expect(context.database).toBe(database);
			expect(context.schemaName).toBe("org_engineering");
		});
	});
});
