import type { Database } from "../core/Database";
import * as ManagerDatabase from "../core/ManagerDatabase";
import type { DaoProvider } from "../dao/DaoProvider";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import { createTenantOrgContext, runWithTenantContext, type TenantOrgContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import * as TokenUtil from "../util/TokenUtil";
import { type CurrentOrgResponse, createOrgRouter, type OrgListResponse } from "./OrgRouter";
import express from "express";
import type { Org, OrgSummary, Tenant, UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/ManagerDatabase");
vi.mock("../util/TokenUtil");

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

function createMockUserPreferenceDaoProvider(): DaoProvider<UserPreferenceDao> {
	const mockDao: UserPreferenceDao = {
		getPreference: vi.fn(),
		getHash: vi.fn().mockResolvedValue("EMPTY"),
		upsertPreference: vi.fn(),
	};
	return {
		getDao: (_context: TenantOrgContext | undefined) => mockDao,
	};
}

function createMockRegistryClient(overrides: Partial<TenantRegistryClient> = {}): TenantRegistryClient {
	return {
		getTenant: vi.fn(),
		getTenantBySlug: vi.fn(),
		getTenantByDomain: vi.fn(),
		getTenantDatabaseConfig: vi.fn(),
		listTenants: vi.fn(),
		listTenantsWithDefaultOrg: vi.fn().mockResolvedValue([]),
		listAllActiveTenants: vi.fn(),
		getOrg: vi.fn(),
		getOrgBySlug: vi.fn(),
		getDefaultOrg: vi.fn(),
		listOrgs: vi.fn().mockResolvedValue([]),
		listAllActiveOrgs: vi.fn(),
		getTenantOrgByInstallationId: vi.fn(),
		createInstallationMapping: vi.fn(),
		ensureInstallationMapping: vi.fn(),
		deleteInstallationMapping: vi.fn(),
		close: vi.fn(),
		...overrides,
	};
}

describe("OrgRouter", () => {
	let app: express.Application;
	let mockRegistryClient: TenantRegistryClient;
	let mockUserPreferenceDaoProvider: DaoProvider<UserPreferenceDao>;

	beforeEach(() => {
		mockRegistryClient = createMockRegistryClient();
		mockUserPreferenceDaoProvider = createMockUserPreferenceDaoProvider();
		const router = createOrgRouter({
			registryClient: mockRegistryClient,
			userPreferenceDaoProvider: mockUserPreferenceDaoProvider,
		});

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
				favoritesHash: "EMPTY",
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
			expect(body.favoritesHash).toBe("EMPTY");
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-123");
		});

		it("returns EMPTY favorites hash when getHash throws an error", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Mock getHash to throw - the router should catch and return EMPTY
			const failingDao: UserPreferenceDao = {
				getPreference: vi.fn(),
				getHash: vi.fn().mockRejectedValue(new Error("DB connection lost")),
				upsertPreference: vi.fn(),
			};
			const failingProvider: DaoProvider<UserPreferenceDao> = {
				getDao: () => failingDao,
			};

			// Mock tokenUtil to return a userId so getFavoritesHash tries to fetch
			const mockTokenUtil = {
				decodePayload: vi.fn().mockReturnValue({ userId: 42, email: "user@example.com" }),
			};
			vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

			// Rebuild router with failing dao provider
			const router = createOrgRouter({
				registryClient: mockRegistryClient,
				userPreferenceDaoProvider: failingProvider,
			});
			const testApp = express();
			testApp.use(express.json());
			testApp.use("/org", router);

			let response: request.Response | undefined;
			await runWithTenantContext(context, async () => {
				response = await request(testApp).get("/org/current");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);
			// Should gracefully degrade to EMPTY hash
			expect(response?.body.favoritesHash).toBe("EMPTY");
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

	describe("GET /current with user access filtering via Manager DB", () => {
		it("should filter orgs by user access when Manager DB is available", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Mock Manager DB with user org filtering (using getOrgsForTenant)
			const mockManagerDb = {
				userOrgDao: {
					getOrgsForTenant: vi.fn().mockResolvedValue([
						{
							orgId: "org-1",
							orgSlug: "engineering",
							orgName: "Engineering Org",
							isDefault: true,
						},
						{
							orgId: "org-2",
							orgSlug: "marketing",
							orgName: "Marketing Org",
							isDefault: false,
						},
					]),
				},
			};

			vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

			// Mock TokenUtil to return a user
			const mockUserInfo: UserInfo = {
				userId: 42,
				email: "user@example.com",
				name: "Test User",
				picture: undefined,
			};
			const mockTokenUtil = {
				decodePayload: vi.fn().mockReturnValue(mockUserInfo),
			};
			vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/current");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as CurrentOrgResponse;
			expect(body.availableOrgs).toHaveLength(2);
			expect(body.availableOrgs[0].slug).toBe("engineering");
			expect(body.availableOrgs[1].slug).toBe("marketing");

			// Verify Manager DB was called with correct userId and tenantId
			expect(mockManagerDb.userOrgDao.getOrgsForTenant).toHaveBeenCalledWith(42, "tenant-123");
		});

		it("should fall back to registryClient when Manager DB returns null", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Mock getManagerDatabase to return null (single-tenant mode)
			vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(null);

			const availableOrgs = [createMockOrgSummary({ id: "org-1", slug: "all-org-1", displayName: "All Org 1" })];
			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockResolvedValue(availableOrgs);

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/current");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as CurrentOrgResponse;
			expect(body.availableOrgs).toHaveLength(1);
			expect(body.availableOrgs[0].slug).toBe("all-org-1");

			// Verify registryClient was called as fallback
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-123");
		});

		it("should fall back to registryClient when no userInfo available", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Mock Manager DB exists
			const mockManagerDb = {
				userOrgDao: {
					getOrgsForTenant: vi.fn(),
				},
			};
			vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

			// Mock TokenUtil to return undefined (no user)
			const mockTokenUtil = {
				decodePayload: vi.fn().mockReturnValue(undefined),
			};
			vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

			const availableOrgs = [
				createMockOrgSummary({ id: "org-1", slug: "fallback-org", displayName: "Fallback Org" }),
			];
			(mockRegistryClient.listOrgs as ReturnType<typeof vi.fn>).mockResolvedValue(availableOrgs);

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/current");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as CurrentOrgResponse;
			expect(body.availableOrgs).toHaveLength(1);
			expect(body.availableOrgs[0].slug).toBe("fallback-org");

			// Verify registryClient was called, not Manager DB
			expect(mockRegistryClient.listOrgs).toHaveBeenCalledWith("tenant-123");
			expect(mockManagerDb.userOrgDao.getOrgsForTenant).not.toHaveBeenCalled();
		});
	});

	describe("GET /list with user access filtering via Manager DB", () => {
		it("should filter orgs by user access in list endpoint", async () => {
			const tenant = createMockTenant();
			const org = createMockOrg();
			const database = createMockDatabase();
			const context = createTenantOrgContext(tenant, org, database);

			// Mock Manager DB (using getOrgsForTenant)
			const mockManagerDb = {
				userOrgDao: {
					getOrgsForTenant: vi.fn().mockResolvedValue([
						{
							orgId: "org-sales",
							orgSlug: "sales",
							orgName: "Sales Department",
							isDefault: false,
						},
					]),
				},
			};
			vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

			// Mock user
			const mockUserInfo: UserInfo = {
				userId: 99,
				email: "sales@example.com",
				name: "Sales User",
				picture: undefined,
			};
			const mockTokenUtil = {
				decodePayload: vi.fn().mockReturnValue(mockUserInfo),
			};
			vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

			let response: request.Response | undefined;

			await runWithTenantContext(context, async () => {
				response = await request(app).get("/org/list");
			});

			expect(response).toBeDefined();
			expect(response?.status).toBe(200);

			const body = response?.body as OrgListResponse;
			expect(body.orgs).toHaveLength(1);
			expect(body.orgs[0].slug).toBe("sales");
			expect(body.orgs[0].displayName).toBe("Sales Department");
		});
	});
});
