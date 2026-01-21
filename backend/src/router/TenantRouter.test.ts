import * as Config from "../config/Config";
import * as TenantContext from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { createTenantRouter } from "./TenantRouter";
import express, { type Express } from "express";
import type { TenantSummary } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("../tenant/TenantContext");
vi.mock("../config/Config");

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

			it("should not call getTenantContext", async () => {
				setupApp(false);

				await request(app).get("/tenant/validate");

				expect(getTenantContextMock).not.toHaveBeenCalled();
			});

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
			return {
				getTenant: vi.fn(),
				getTenantBySlug: vi.fn(),
				getTenantByDomain: vi.fn(),
				getTenantDatabaseConfig: vi.fn(),
				listTenants: vi.fn().mockResolvedValue(tenants),
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

			it("should return list of active tenants with domain info", async () => {
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
				// Should filter out archived tenant
				expect(response.body.tenants).toHaveLength(2);
				expect(response.body.tenants[0]).toEqual({
					id: "t1",
					slug: "acme",
					displayName: "Acme Corp",
					primaryDomain: null,
				});
				expect(response.body.tenants[1]).toEqual({
					id: "t2",
					slug: "beta",
					displayName: "Beta Inc",
					primaryDomain: "beta.example.com",
				});
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

			it("should return 500 when registry client throws", async () => {
				const registryClient = createMockRegistryClient([]);
				(registryClient.listTenants as Mock).mockRejectedValue(new Error("Database error"));
				setupApp(true, registryClient);

				const response = await request(app).get("/tenant/list");

				expect(response.status).toBe(500);
				expect(response.body).toEqual({ error: "Failed to fetch tenant list" });
			});
		});
	});
});
