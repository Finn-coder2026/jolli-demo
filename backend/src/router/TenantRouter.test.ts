import * as Config from "../config/Config";
import * as ManagerDatabase from "../core/ManagerDatabase";
import * as TenantContext from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import * as TokenUtil from "../util/TokenUtil";
import { createTenantRouter } from "./TenantRouter";
import express, { type Express } from "express";
import type { TenantSummary, UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("../tenant/TenantContext");
vi.mock("../config/Config");
vi.mock("../core/ManagerDatabase");
vi.mock("../util/TokenUtil");

describe("TenantRouter", () => {
	let app: Express;
	let getTenantContextMock: Mock;
	let getConfigMock: Mock;

	function setupApp(multiTenantEnabled: boolean, registryClient?: TenantRegistryClient): void {
		app = express();
		const config = registryClient ? { multiTenantEnabled, registryClient } : { multiTenantEnabled };
		app.use("/tenant", createTenantRouter(config));
	}

	beforeEach(() => {
		vi.clearAllMocks();
		getTenantContextMock = vi.mocked(TenantContext.getTenantContext);
		getConfigMock = vi.mocked(Config.getConfig);
		// Default config mock
		getConfigMock.mockReturnValue({
			USE_TENANT_SWITCHER: false,
			BASE_DOMAIN: "jolli.app",
		});
	});

	describe("GET /validate", () => {
		describe("when MULTI_TENANT_ENABLED=false", () => {
			it("should return valid=true with multiTenantEnabled=false", async () => {
				setupApp(false);

				const response = await request(app).get("/tenant/validate");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					valid: true,
					multiTenantEnabled: false,
				});
			});

			// Note: getTenantContext may be called by TenantAwareLogger for log level checks,
			// so we don't test that it's never called. The router logic itself doesn't call it
			// when multiTenantEnabled=false, which is verified by the response behavior above.

			it("should use MULTI_TENANT_ENABLED from config when not provided in router config", async () => {
				// Setup app without config to test the fallback to getConfig()
				getConfigMock.mockReturnValue({
					MULTI_TENANT_ENABLED: false,
					USE_TENANT_SWITCHER: false,
					BASE_DOMAIN: "jolli.app",
				});

				app = express();
				app.use("/tenant", createTenantRouter()); // No config passed

				const response = await request(app).get("/tenant/validate");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					valid: true,
					multiTenantEnabled: false,
				});
			});
		});

		describe("when MULTI_TENANT_ENABLED=true", () => {
			beforeEach(() => {
				setupApp(true);
			});

			it("should return valid=true with tenant info when context exists", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
					},
					org: {
						id: "org-1",
						slug: "default",
						displayName: "Default Org",
						status: "active",
					},
					database: {},
				});

				const response = await request(app).get("/tenant/validate");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					valid: true,
					multiTenantEnabled: true,
					tenant: {
						slug: "acme",
						displayName: "Acme Corp",
					},
				});
			});

			it("should return valid=true without tenant info when context is undefined", async () => {
				getTenantContextMock.mockReturnValue(undefined);

				const response = await request(app).get("/tenant/validate");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					valid: true,
					multiTenantEnabled: true,
				});
			});

			it("should return 403 with redirectTo when X-Tenant-Slug mismatches JWT tenant (primaryDomain)", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
						primaryDomain: "docs.acme.com",
						featureFlags: { customDomain: true },
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: false,
					NODE_ENV: "development",
					ORIGIN: "http://localhost:8034",
				});

				const response = await request(app).get("/tenant/validate").set("X-Tenant-Slug", "other-tenant");

				expect(response.status).toBe(403);
				expect(response.body.error).toBe("Tenant mismatch");
				expect(response.body.redirectTo).toBe("https://docs.acme.com");
			});

			it("should return 403 with path-based redirectTo when X-Tenant-Slug mismatches (no primaryDomain)", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
						primaryDomain: null,
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: false,
					NODE_ENV: "development",
					ORIGIN: "http://localhost:8034",
				});

				const response = await request(app).get("/tenant/validate").set("X-Tenant-Slug", "wrong-tenant");

				expect(response.status).toBe(403);
				expect(response.body.error).toBe("Tenant mismatch");
				expect(response.body.message).toBe("You are logged into a different workspace");
				expect(response.body.redirectTo).toBe("http://jolli.app:8034/acme");
			});

			it("should return 403 with origin fallback redirectTo when no BASE_DOMAIN", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
						primaryDomain: null,
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "",
					USE_GATEWAY: false,
					NODE_ENV: "development",
					ORIGIN: "http://localhost:8034",
				});

				const response = await request(app).get("/tenant/validate").set("X-Tenant-Slug", "wrong-tenant");

				expect(response.status).toBe(403);
				expect(response.body.error).toBe("Tenant mismatch");
				// Falls back to request origin
				expect(response.body.redirectTo).toContain("/acme");
			});

			it("should omit port suffix when ORIGIN has no port and not using gateway", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
						primaryDomain: null,
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: false,
					NODE_ENV: "development",
					ORIGIN: "http://jolli.app",
				});

				const response = await request(app).get("/tenant/validate").set("X-Tenant-Slug", "wrong-tenant");

				expect(response.status).toBe(403);
				expect(response.body.redirectTo).toBe("http://jolli.app/acme");
			});

			it("should use https protocol and no port when USE_GATEWAY is true", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
						primaryDomain: null,
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: true,
					NODE_ENV: "production",
					ORIGIN: "https://jolli.app",
				});

				const response = await request(app).get("/tenant/validate").set("X-Tenant-Slug", "wrong-tenant");

				expect(response.status).toBe(403);
				expect(response.body.redirectTo).toBe("https://jolli.app/acme");
			});

			it("should not return 403 when X-Tenant-Slug matches JWT tenant", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});

				const response = await request(app).get("/tenant/validate").set("X-Tenant-Slug", "acme");

				expect(response.status).toBe(200);
				expect(response.body.valid).toBe(true);
			});

			it("should return 403 with path-based redirectTo when subdomain access used for free-tier tenant", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "flyer6",
						displayName: "Flyer6",
						status: "active",
						primaryDomain: null,
						featureFlags: { tier: "free" },
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: false,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: true,
					NODE_ENV: "production",
					ORIGIN: "https://jolli.app",
				});

				const response = await request(app)
					.get("/tenant/validate")
					.set("Host", "flyer6.jolli.app")
					.set("X-Tenant-Slug", "flyer6");

				expect(response.status).toBe(403);
				expect(response.body.error).toBe("access_mode_redirect");
				expect(response.body.message).toBe("This workspace uses path-based URLs");
				expect(response.body.redirectTo).toBe("https://jolli.app/flyer6");
			});

			it("should allow subdomain access for pro-tier tenant with subdomain feature", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "procorp",
						displayName: "Pro Corp",
						status: "active",
						primaryDomain: null,
						featureFlags: { tier: "pro", subdomain: true },
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: false,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: true,
					NODE_ENV: "production",
					ORIGIN: "https://jolli.app",
				});

				const response = await request(app)
					.get("/tenant/validate")
					.set("Host", "procorp.jolli.app")
					.set("X-Tenant-Slug", "procorp");

				expect(response.status).toBe(200);
				expect(response.body.valid).toBe(true);
			});

			it("should not trigger subdomain check when accessing via base domain (path-based)", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "flyer6",
						displayName: "Flyer6",
						status: "active",
						primaryDomain: null,
						featureFlags: { tier: "free" },
					},
					org: { id: "org-1", slug: "default" },
					database: {},
				});
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: false,
					BASE_DOMAIN: "jolli.app",
					USE_GATEWAY: true,
					NODE_ENV: "production",
					ORIGIN: "https://jolli.app",
				});

				const response = await request(app)
					.get("/tenant/validate")
					.set("Host", "jolli.app")
					.set("X-Tenant-Slug", "flyer6");

				expect(response.status).toBe(200);
				expect(response.body.valid).toBe(true);
			});

			it("should use slug as displayName when displayName is null", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: {
						id: "tenant-1",
						slug: "acme",
						displayName: null,
						status: "active",
					},
					org: {
						id: "org-1",
						slug: "default",
						displayName: "Default Org",
						status: "active",
					},
					database: {},
				});

				const response = await request(app).get("/tenant/validate");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					valid: true,
					multiTenantEnabled: true,
					tenant: {
						slug: "acme",
						displayName: "acme",
					},
				});
			});
		});
	});

	describe("GET /list", () => {
		function createMockTenant(partial: Partial<TenantSummary>): TenantSummary {
			return {
				id: "tenant-1",
				slug: "acme",
				displayName: "Acme Corp",
				status: "active",
				deploymentType: "shared",
				primaryDomain: null,
				createdAt: new Date(),
				provisionedAt: new Date(),
				...partial,
			};
		}

		function createMockRegistryClient(tenants: Array<TenantSummary>): TenantRegistryClient {
			// Convert TenantSummary to TenantWithDefaultOrg format for listTenantsWithDefaultOrg
			const tenantsWithDefaultOrg = tenants
				.filter(t => t.status === "active")
				.map(t => ({
					id: t.id,
					slug: t.slug,
					displayName: t.displayName,
					primaryDomain: t.primaryDomain,
					defaultOrgId: "default-org-id",
				}));

			return {
				getTenant: vi.fn(),
				getTenantBySlug: vi.fn(),
				getTenantByDomain: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
				listTenants: vi.fn().mockResolvedValue(tenants),
				listTenantsWithDefaultOrg: vi.fn().mockResolvedValue(tenantsWithDefaultOrg),
				listAllActiveTenants: vi.fn(),
				getOrg: vi.fn(),
				getOrgBySlug: vi.fn(),
				getDefaultOrg: vi.fn().mockResolvedValue({
					id: "default-org-id",
					slug: "default",
					displayName: "Default Org",
					tenantId: "t1",
					schemaName: "public",
					status: "active",
					isDefault: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				}),
				listOrgs: vi.fn(),
				listAllActiveOrgs: vi.fn(),
				getTenantOrgByInstallationId: vi.fn(),
				createInstallationMapping: vi.fn(),
				ensureInstallationMapping: vi.fn(),
				deleteInstallationMapping: vi.fn(),
				close: vi.fn(),
			};
		}

		describe("when USE_TENANT_SWITCHER=false", () => {
			it("should return useTenantSwitcher=false with empty tenants", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: false,
					BASE_DOMAIN: "jolli.app",
				});
				setupApp(false);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					useTenantSwitcher: false,
					currentTenantId: null,
					baseDomain: "jolli.app",
					tenants: [],
				});
			});

			it("should return baseDomain as null when BASE_DOMAIN is empty string", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: false,
					BASE_DOMAIN: "",
				});
				setupApp(false);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					useTenantSwitcher: false,
					currentTenantId: null,
					baseDomain: null,
					tenants: [],
				});
			});
		});

		describe("when USE_TENANT_SWITCHER=true", () => {
			beforeEach(() => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
				});
			});

			it("should return empty tenants when no registryClient configured", async () => {
				setupApp(true); // No registryClient

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					useTenantSwitcher: true,
					currentTenantId: null,
					baseDomain: "jolli.app",
					tenants: [],
				});
			});

			it("should return empty list when no Manager DB or userInfo (security)", async () => {
				const mockTenants = [
					createMockTenant({
						id: "t1",
						slug: "acme",
						displayName: "Acme Corp",
						status: "active",
						primaryDomain: null,
					}),
					createMockTenant({
						id: "t2",
						slug: "beta",
						displayName: "Beta Inc",
						status: "active",
						primaryDomain: "beta.example.com",
					}),
					createMockTenant({ id: "t3", slug: "archived", displayName: "Archived Co", status: "archived" }),
				];
				const registryClient = createMockRegistryClient(mockTenants);
				setupApp(true, registryClient);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body.useTenantSwitcher).toBe(true);
				expect(response.body.baseDomain).toBe("jolli.app");
				// Should return empty for security when no user context
				expect(response.body.tenants).toHaveLength(0);
			});

			it("should include currentTenantId from tenant context", async () => {
				getTenantContextMock.mockReturnValue({
					tenant: { id: "current-tenant-id", slug: "current", displayName: "Current Tenant" },
					org: { id: "org-1", slug: "default" },
				});
				const registryClient = createMockRegistryClient([createMockTenant({ id: "t1", slug: "acme" })]);
				setupApp(true, registryClient);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body.currentTenantId).toBe("current-tenant-id");
			});

			it("should return empty list when no user context (security)", async () => {
				// With the new security-first approach, we don't return any tenants
				// when we cannot verify user access (no Manager DB or no userInfo).
				// This test verifies we return empty array instead of falling back
				// to registryClient which would leak tenant data.
				const registryClient = createMockRegistryClient([]);
				(registryClient.listTenantsWithDefaultOrg as Mock).mockResolvedValue([
					{
						id: "t1",
						slug: "acme",
						displayName: "Acme Corp",
						primaryDomain: null,
						defaultOrgId: "default-org-id",
					},
				]);
				setupApp(true, registryClient);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				// Should return empty for security when no user context
				expect(response.body.tenants).toHaveLength(0);
				// Verify registryClient was NOT called (no data leak)
				expect(registryClient.listTenantsWithDefaultOrg).not.toHaveBeenCalled();
			});

			it("should return 500 when Manager DB throws error", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
				});

				// Mock Manager DB that throws an error
				const mockManagerDb = {
					userOrgDao: {
						getUniqueTenants: vi.fn().mockRejectedValue(new Error("Database error")),
					},
				};
				vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

				// Mock user
				const mockUserInfo: UserInfo = {
					userId: 123,
					email: "user@example.com",
					name: "Test User",
					picture: undefined,
				};
				const mockTokenUtil = {
					decodePayload: vi.fn().mockReturnValue(mockUserInfo),
				};
				vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

				setupApp(true);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(500);
				expect(response.body).toEqual({ error: "Failed to fetch tenant list" });
			});

			it("should filter tenants by user access via Manager DB", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
				});

				// Mock Manager DB with unique tenants (using getUniqueTenants)
				const mockManagerDb = {
					userOrgDao: {
						getUniqueTenants: vi.fn().mockResolvedValue([
							{
								tenantId: "t1",
								tenantSlug: "tenant-one",
								tenantName: "Tenant One",
								defaultOrgId: "org-1",
							},
							{
								tenantId: "t2",
								tenantSlug: "tenant-two",
								tenantName: "Tenant Two",
								defaultOrgId: "org-2",
							},
						]),
					},
				};
				vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

				// Mock user
				const mockUserInfo: UserInfo = {
					userId: 123,
					email: "user@example.com",
					name: "Test User",
					picture: undefined,
				};
				const mockTokenUtil = {
					decodePayload: vi.fn().mockReturnValue(mockUserInfo),
				};
				vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

				setupApp(true);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body.useTenantSwitcher).toBe(true);
				expect(response.body.tenants).toHaveLength(2);
				expect(response.body.tenants[0].slug).toBe("tenant-one");
				expect(response.body.tenants[1].slug).toBe("tenant-two");
			});

			it("should handle user with multiple orgs per tenant and use default org", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
				});

				// Mock Manager DB - getUniqueTenants already returns one row per tenant with defaultOrgId
				// The SQL DISTINCT ON handles the grouping, so we just return one tenant with the default org
				const mockManagerDb = {
					userOrgDao: {
						getUniqueTenants: vi.fn().mockResolvedValue([
							{
								tenantId: "t1",
								tenantSlug: "multi-org-tenant",
								tenantName: "Multi Org Tenant",
								defaultOrgId: "org-default", // SQL picks the default org
							},
						]),
					},
				};
				vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

				const mockUserInfo: UserInfo = {
					userId: 456,
					email: "multi@example.com",
					name: "Multi Org User",
					picture: undefined,
				};
				const mockTokenUtil = {
					decodePayload: vi.fn().mockReturnValue(mockUserInfo),
				};
				vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

				setupApp(true);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body.tenants).toHaveLength(1);
				expect(response.body.tenants[0].slug).toBe("multi-org-tenant");
				// Should use the default org, not the first one
				expect(response.body.tenants[0].defaultOrgId).toBe("org-default");
			});

			it("should return empty list when Manager DB is not available (security)", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
				});

				// Mock getManagerDatabase to return null
				vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(null);

				const mockTenants = [
					createMockTenant({
						id: "t1",
						slug: "fallback-tenant",
						displayName: "Fallback Tenant",
						status: "active",
					}),
				];
				const registryClient = createMockRegistryClient(mockTenants);
				setupApp(true, registryClient);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body.tenants).toHaveLength(0);

				// Verify registryClient was NOT used (security - no data leak)
				expect(registryClient.listTenantsWithDefaultOrg).not.toHaveBeenCalled();
			});

			it("should return empty list when no userInfo available (security)", async () => {
				getConfigMock.mockReturnValue({
					USE_TENANT_SWITCHER: true,
					BASE_DOMAIN: "jolli.app",
				});

				// Mock Manager DB exists but no user
				const mockManagerDb = {
					userOrgDao: {
						getUniqueTenants: vi.fn(),
					},
				};
				vi.mocked(ManagerDatabase.getGlobalManagerDatabase).mockReturnValue(mockManagerDb as never);

				const mockTokenUtil = {
					decodePayload: vi.fn().mockReturnValue(undefined),
				};
				vi.mocked(TokenUtil.getGlobalTokenUtil).mockReturnValue(mockTokenUtil as never);

				const mockTenants = [
					createMockTenant({
						id: "t1",
						slug: "no-user-tenant",
						displayName: "No User Tenant",
						status: "active",
					}),
				];
				const registryClient = createMockRegistryClient(mockTenants);
				setupApp(true, registryClient);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(200);
				expect(response.body.tenants).toHaveLength(0);

				// Should not call Manager DB when no user
				expect(mockManagerDb.userOrgDao.getUniqueTenants).not.toHaveBeenCalled();
				// Should not call registryClient either (security - no data leak)
				expect(registryClient.listTenantsWithDefaultOrg).not.toHaveBeenCalled();
			});
		});
	});
});
