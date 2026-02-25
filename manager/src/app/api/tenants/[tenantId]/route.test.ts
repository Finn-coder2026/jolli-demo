import { getDatabase } from "../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../lib/providers";
import { DELETE } from "./route";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("server-only", () => ({}));

// Mock auth module - returns a SuperAdmin user by default
vi.mock("@/lib/auth", () => ({
	getUserFromRequest: vi.fn(() => ({
		userId: 1,
		email: "admin@test.com",
		role: "super_admin",
	})),
	unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "Unauthorized" }, { status: 401 })),
	forbiddenResponse: vi.fn((msg: string) => NextResponse.json({ error: msg }, { status: 403 })),
	isSuperAdmin: vi.fn((role: string) => role === "super_admin"),
}));

vi.mock("../../../../lib/Config", () => ({
	env: {
		ADMIN_POSTGRES_URL: "postgresql://admin:password@localhost:5432/postgres",
		ALLOW_HARD_DELETE: true,
	},
}));

vi.mock("../../../../lib/db/getDatabase");
vi.mock("../../../../lib/providers");
vi.mock("next/server", () => ({
	NextResponse: {
		json: vi.fn((data, init) => ({ data, init })),
	},
}));

describe("DELETE /api/tenants/[tenantId]", () => {
	const mockTenantDao = {
		getTenant: vi.fn(),
		archiveTenant: vi.fn(),
		softDeleteTenant: vi.fn(),
		deleteTenant: vi.fn(),
		countActiveOrgs: vi.fn(),
	};

	const mockOrgDao = {
		listOrgs: vi.fn(),
		archiveOrg: vi.fn(),
		softDeleteOrg: vi.fn(),
		deleteOrgsByTenant: vi.fn(),
	};

	const mockProviderDao = {
		getProvider: vi.fn(),
	};

	const mockAdapter = {
		deprovision: vi.fn(),
		deprovisionSchema: vi.fn(),
	};

	const mockDb = {
		tenantDao: mockTenantDao,
		orgDao: mockOrgDao,
		providerDao: mockProviderDao,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDatabase>>);
		vi.mocked(createProviderAdapter).mockReturnValue(
			mockAdapter as unknown as ReturnType<typeof createProviderAdapter>,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("mode validation", () => {
		it("returns 400 when mode parameter is missing", async () => {
			const request = new Request("http://localhost/api/tenants/tenant-1");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("Missing or invalid 'mode' parameter") },
				{ status: 400 },
			);
		});

		it("returns 400 when mode parameter is invalid", async () => {
			const request = new Request("http://localhost/api/tenants/tenant-1?mode=invalid");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("Missing or invalid 'mode' parameter") },
				{ status: 400 },
			);
		});
	});

	describe("archive mode", () => {
		it("archives tenant and all orgs without confirmation", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
			};

			const mockOrgs = [
				{ id: "org-1", status: "active" },
				{ id: "org-2", status: "active" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockOrgDao.archiveOrg.mockResolvedValue(true);
			mockTenantDao.archiveTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=archive");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(mockOrgDao.listOrgs).toHaveBeenCalledWith("tenant-1");
			expect(mockOrgDao.archiveOrg).toHaveBeenCalledWith("org-1");
			expect(mockOrgDao.archiveOrg).toHaveBeenCalledWith("org-2");
			expect(mockTenantDao.archiveTenant).toHaveBeenCalledWith("tenant-1");
			expect(NextResponse.json).toHaveBeenCalledWith({
				success: true,
				message: expect.stringContaining("2 organization(s) archived successfully"),
			});
		});
	});

	describe("soft delete mode", () => {
		it("requires confirmation matching tenant slug", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=soft&confirm=wrong-slug");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("test-tenant") },
				{ status: 400 },
			);
			expect(mockTenantDao.softDeleteTenant).not.toHaveBeenCalled();
		});

		it("soft deletes tenant with correct confirmation", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
			};

			const mockOrgs = [
				{ id: "org-1", status: "active" },
				{ id: "org-2", status: "active" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockOrgDao.deleteOrgsByTenant.mockResolvedValue(undefined);
			mockTenantDao.deleteTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=soft&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(mockOrgDao.listOrgs).toHaveBeenCalledWith("tenant-1");
			expect(mockOrgDao.deleteOrgsByTenant).toHaveBeenCalledWith("tenant-1");
			expect(mockTenantDao.deleteTenant).toHaveBeenCalledWith("tenant-1");
			expect(NextResponse.json).toHaveBeenCalledWith({
				success: true,
				message: expect.stringContaining("2 organization(s) removed from registry"),
			});
		});
	});

	describe("hard delete mode", () => {
		it("requires confirmation matching tenant slug", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("test-tenant") },
				{ status: 400 },
			);
		});

		it("hard deletes tenant with org schema deprovisioning", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "connection_string",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "jolli_test",
				databaseUsername: "jolli_test",
				databasePasswordEncrypted: "password",
				databaseSsl: true,
			};

			const mockOrgs = [
				{ id: "org-1", status: "active", schemaName: "org_test_tenant" },
				{ id: "org-2", status: "active", schemaName: "org_test_tenant_secondary" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockTenantDao.deleteTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			// Should deprovision each org's schema
			expect(mockAdapter.deprovisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({
					host: "localhost",
					database: "jolli_test",
				}),
				"org_test_tenant",
				"drop",
			);
			expect(mockAdapter.deprovisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({
					host: "localhost",
					database: "jolli_test",
				}),
				"org_test_tenant_secondary",
				"drop",
			);
			expect(mockOrgDao.deleteOrgsByTenant).toHaveBeenCalledWith("tenant-1");
			expect(mockTenantDao.deleteTenant).toHaveBeenCalledWith("tenant-1");
			expect(NextResponse.json).toHaveBeenCalledWith({
				success: true,
				message: expect.stringContaining("permanently deleted"),
				details: expect.objectContaining({
					schemasDropped: 2,
					schemasFailed: 0,
				}),
			});
		});

		it("attempts schema drops for non-active tenants", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "connection_string",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "jolli_test",
				databaseUsername: "jolli_test",
				databasePasswordEncrypted: "password",
				databaseSsl: true,
			};

			const mockOrgs = [{ id: "org-1", status: "provisioning", schemaName: "org_test_tenant" }];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockTenantDao.deleteTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			// Should still attempt to drop schema even though tenant is not active
			expect(mockAdapter.deprovisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({ host: "localhost" }),
				"org_test_tenant",
				"drop",
			);
			expect(mockOrgDao.deleteOrgsByTenant).toHaveBeenCalled();
			expect(mockTenantDao.deleteTenant).toHaveBeenCalled();
		});

		it("attempts schema drops for non-active orgs", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "connection_string",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "jolli_test",
				databaseUsername: "jolli_test",
				databasePasswordEncrypted: "password",
				databaseSsl: true,
			};

			const mockOrgs = [
				{ id: "org-1", status: "archived", schemaName: "org_archived" },
				{ id: "org-2", status: "suspended", schemaName: "org_suspended" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockTenantDao.deleteTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			// Should drop schemas regardless of org status
			expect(mockAdapter.deprovisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({ host: "localhost" }),
				"org_archived",
				"drop",
			);
			expect(mockAdapter.deprovisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({ host: "localhost" }),
				"org_suspended",
				"drop",
			);
		});

		it("returns error and does NOT delete registry when schema drop fails", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "connection_string",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "jolli_test",
				databaseUsername: "jolli_test",
				databasePasswordEncrypted: "password",
				databaseSsl: true,
			};

			const mockOrgs = [
				{ id: "org-1", status: "active", schemaName: "org_success" },
				{ id: "org-2", status: "active", schemaName: "org_fail" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);

			// First call succeeds, second fails
			mockAdapter.deprovisionSchema
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error("Connection refused"));

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			// Should NOT delete registry entries
			expect(mockOrgDao.deleteOrgsByTenant).not.toHaveBeenCalled();
			expect(mockTenantDao.deleteTenant).not.toHaveBeenCalled();

			// Should return error with details
			expect(NextResponse.json).toHaveBeenCalledWith(
				{
					success: false,
					error: expect.stringContaining("Failed to drop 1 schema(s)"),
					details: expect.objectContaining({
						schemasAttempted: 2,
						schemasDropped: 1,
						schemasFailed: 1,
						failedSchemas: [{ schema: "org_fail", error: "Connection refused" }],
					}),
				},
				{ status: 500 },
			);
		});

		it("includes detailed counts in success response", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "connection_string",
				databaseHost: "localhost",
				databasePort: 5432,
				databaseName: "jolli_test",
				databaseUsername: "jolli_test",
				databasePasswordEncrypted: "password",
				databaseSsl: true,
			};

			const mockOrgs = [
				{ id: "org-1", status: "active", schemaName: "org_drop1" },
				{ id: "org-2", status: "active", schemaName: "org_drop2" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockTenantDao.deleteTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({
				success: true,
				message: expect.stringContaining("2 org schema(s) permanently deleted"),
				details: {
					schemasAttempted: 2,
					schemasDropped: 2,
					schemasFailed: 0,
					schemasSkipped: 0,
				},
			});
		});

		it("proceeds with registry deletion when provider is missing", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "active",
				databaseProviderId: "provider-1",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(null);
			mockOrgDao.listOrgs.mockResolvedValue([]);
			mockTenantDao.deleteTenant.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1?mode=hard&confirm=test-tenant");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await DELETE(request, params);

			// Should still delete registry entries when provider is missing
			expect(mockOrgDao.deleteOrgsByTenant).toHaveBeenCalled();
			expect(mockTenantDao.deleteTenant).toHaveBeenCalled();
			expect(NextResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
		});
	});

	describe("tenant not found", () => {
		it("returns 404 when tenant does not exist", async () => {
			mockTenantDao.getTenant.mockResolvedValue(undefined);

			const request = new Request("http://localhost/api/tenants/nonexistent?mode=archive");
			const params = { params: Promise.resolve({ tenantId: "nonexistent" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Tenant not found" }, { status: 404 });
		});
	});
});
