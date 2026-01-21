import type { Database } from "../core/Database";
import { createTenantOrgContext, runWithTenantContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { type CurrentOrgResponse, createOrgRouter, type OrgListResponse } from "./OrgRouter";
import express from "express";
import type { Org, OrgSummary, Tenant } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function createMockOrgSummary(overrides: Partial<OrgSummary> = {}): OrgSummary {
	return {
		id: "org-123",
		tenantId: "tenant-123",
		slug: "default",
		displayName: "Default Org",
		schemaName: "org_default",
		status: "active",
		isDefault: true,
		createdAt: new Date("2024-01-01"),
		...overrides,
	};
}

function createMockDatabase(): Database {
	return {} as Database;
}

function createMockRegistryClient(overrides: Partial<TenantRegistryClient> = {}): TenantRegistryClient {
	return {
		getTenant: vi.fn(),
		getTenantBySlug: vi.fn(),
		getTenantByDomain: vi.fn(),
		getTenantDatabaseConfig: vi.fn(),
		listTenants: vi.fn(),
		listAllActiveTenants: vi.fn(),
		getOrg: vi.fn(),
		getOrgBySlug: vi.fn(),
		getDefaultOrg: vi.fn(),
		listOrgs: vi.fn().mockResolvedValue([]),
		listAllActiveOrgs: vi.fn(),
		getTenantOrgByInstallationId: vi.fn(),
		createInstallationMapping: vi.fn(),
		deleteInstallationMapping: vi.fn(),
		close: vi.fn(),
		...overrides,
	};
}

describe("OrgRouter", () => {
	let app: express.Application;
	let mockRegistryClient: TenantRegistryClient;

	beforeEach(() => {
		mockRegistryClient = createMockRegistryClient();
		const router = createOrgRouter({ registryClient: mockRegistryClient });

		app = express();
		app.use(express.json());
		app.use("/org", router);
	});

	describe("GET /current", () => {
		it("returns null values when not in multi-tenant mode", async () => {
			const response = await request(app).get("/org/current");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				tenant: null,
				org: null,
				availableOrgs: [],
			});
		});

		it("returns current tenant and org when in multi-tenant mode", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg({ displayName: "Engineering Org" });
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const availableOrgs = [
				createMockOrgSummary({ id: "org-1", slug: "engineering", displayName: "Engineering" }),
				createMockOrgSummary({ id: "org-2", slug: "marketing", displayName: "Marketing" }),
			];
			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockResolvedValue(availableOrgs);

			// Wrap the request in tenant context
			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/current");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as CurrentOrgResponse;
			expect(body.tenant.id).toBe("tenant-123");
			expect(body.tenant.slug).toBe("test-tenant");
			expect(body.org.id).toBe("org-123");
			expect(body.org.displayName).toBe("Engineering Org");
			expect(body.availableOrgs).toHaveLength(2);
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-123");
		});

		it("returns 500 when registry client fails", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Database error"));

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/current");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(500);
			expect(response?.body.error).toBe("Failed to fetch org context");
		});
	});

	describe("GET /list", () => {
		it("returns 400 when not in multi-tenant mode", async () => {
			const response = await request(app).get("/org/list");

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("Multi-tenant mode not active");
			expect(response.body.orgs).toEqual([]);
		});

		it("returns list of orgs when in multi-tenant mode", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			const orgs = [
				createMockOrgSummary({ id: "org-1", slug: "engineering", displayName: "Engineering" }),
				createMockOrgSummary({ id: "org-2", slug: "marketing", displayName: "Marketing" }),
				createMockOrgSummary({ id: "org-3", slug: "sales", displayName: "Sales" }),
			];
			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockResolvedValue(orgs);

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/list");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as OrgListResponse;
			expect(body.orgs).toHaveLength(3);
			expect(body.orgs[0].slug).toBe("engineering");
			expect(body.orgs[1].slug).toBe("marketing");
			expect(body.orgs[2].slug).toBe("sales");
		});

		it("returns empty list when tenant has no orgs", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/list");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as OrgListResponse;
			expect(body.orgs).toEqual([]);
		});

		it("returns 500 when registry client fails", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Database error"));

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/list");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(500);
			expect(response?.body.error).toBe("Failed to list orgs");
		});
	});
});
