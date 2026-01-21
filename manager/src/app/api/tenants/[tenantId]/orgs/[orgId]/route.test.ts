import { getDatabase } from "../../../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../../../lib/providers";
import { DELETE } from "./route";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("../../../../../../lib/Config", () => ({
	env: {
		ADMIN_POSTGRES_URL: "postgresql://admin:password@localhost:5432/postgres",
		ALLOW_HARD_DELETE: true,
	},
}));

vi.mock("../../../../../../lib/db/getDatabase");
vi.mock("../../../../../../lib/providers");
vi.mock("next/server", () => ({
	NextResponse: {
		json: vi.fn((data, init) => ({ data, init })),
	},
}));

describe("DELETE /api/tenants/[tenantId]/orgs/[orgId]", () => {
	const mockTenantDao = {
		getTenant: vi.fn(),
	};

	const mockOrgDao = {
		getOrg: vi.fn(),
		listOrgs: vi.fn(),
		archiveOrg: vi.fn(),
		softDeleteOrg: vi.fn(),
		deleteOrg: vi.fn(),
	};

	const mockProviderDao = {
		getProvider: vi.fn(),
	};

	const mockAdapter = {
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
			const request = new Request("http://localhost/api/tenants/tenant-1/orgs/org-1");
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("Missing or invalid 'mode' parameter") },
				{ status: 400 },
			);
		});

		it("returns 400 when mode parameter is invalid", async () => {
			const request = new Request("http://localhost/api/tenants/tenant-1/orgs/org-1?mode=invalid");
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("Missing or invalid 'mode' parameter") },
				{ status: 400 },
			);
		});
	});

	describe("archive mode", () => {
		it("archives org without confirmation", async () => {
			const mockTenant = { id: "tenant-1", status: "active" };
			const mockOrg = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "engineering",
				isDefault: false,
				status: "active",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockOrgDao.getOrg.mockResolvedValue(mockOrg);
			mockOrgDao.listOrgs.mockResolvedValue([mockOrg, { id: "org-2", status: "active", isDefault: false }]);
			mockOrgDao.archiveOrg.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1/orgs/org-1?mode=archive");
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(mockOrgDao.archiveOrg).toHaveBeenCalledWith("org-1");
			expect(NextResponse.json).toHaveBeenCalledWith({
				success: true,
				message: expect.stringContaining("archived successfully"),
			});
		});

		it("blocks archiving default org when it is the only active org", async () => {
			const mockTenant = { id: "tenant-1", status: "active" };
			const mockOrg = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "default",
				isDefault: true,
				status: "active",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockOrgDao.getOrg.mockResolvedValue(mockOrg);
			mockOrgDao.listOrgs.mockResolvedValue([mockOrg]);

			const request = new Request("http://localhost/api/tenants/tenant-1/orgs/org-1?mode=archive");
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				{ error: expect.stringContaining("Cannot delete or archive the default org") },
				{ status: 400 },
			);
			expect(mockOrgDao.archiveOrg).not.toHaveBeenCalled();
		});
	});

	describe("hard delete mode", () => {
		it("requires confirmation and deprovisions schema", async () => {
			const mockTenant = {
				id: "tenant-1",
				status: "active",
				databaseProviderId: "provider-1",
			};

			const mockOrg = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "engineering",
				schemaName: "org_engineering",
				isDefault: false,
				status: "active",
			};

			// Credentials are now on the provider, not the tenant
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

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockOrgDao.getOrg.mockResolvedValue(mockOrg);
			mockOrgDao.listOrgs.mockResolvedValue([mockOrg, { id: "org-2", status: "active" }]);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.deleteOrg.mockResolvedValue(true);

			const request = new Request(
				"http://localhost/api/tenants/tenant-1/orgs/org-1?mode=hard&confirm=engineering",
			);
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(mockAdapter.deprovisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({
					host: "localhost",
					database: "jolli_test",
				}),
				"org_engineering",
				"drop",
			);
			expect(mockOrgDao.deleteOrg).toHaveBeenCalledWith("org-1");
			expect(NextResponse.json).toHaveBeenCalledWith({
				success: true,
				message: expect.stringContaining("permanently deleted"),
			});
		});

		it("skips schema deprovisioning if tenant not active", async () => {
			const mockTenant = {
				id: "tenant-1",
				status: "provisioning",
				databaseHost: null,
			};

			const mockOrg = {
				id: "org-1",
				tenantId: "tenant-1",
				slug: "engineering",
				schemaName: "org_engineering",
				isDefault: false,
				status: "active",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockOrgDao.getOrg.mockResolvedValue(mockOrg);
			mockOrgDao.listOrgs.mockResolvedValue([mockOrg, { id: "org-2", status: "active" }]);
			mockOrgDao.deleteOrg.mockResolvedValue(true);

			const request = new Request(
				"http://localhost/api/tenants/tenant-1/orgs/org-1?mode=hard&confirm=engineering",
			);
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(mockAdapter.deprovisionSchema).not.toHaveBeenCalled();
			expect(mockOrgDao.deleteOrg).toHaveBeenCalled();
		});
	});

	describe("org not found", () => {
		it("returns 404 when org does not exist", async () => {
			mockTenantDao.getTenant.mockResolvedValue({ id: "tenant-1" });
			mockOrgDao.getOrg.mockResolvedValue(undefined);

			const request = new Request("http://localhost/api/tenants/tenant-1/orgs/nonexistent?mode=archive");
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "nonexistent" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Org not found" }, { status: 404 });
		});

		it("returns 404 when org belongs to different tenant", async () => {
			mockTenantDao.getTenant.mockResolvedValue({ id: "tenant-1" });
			mockOrgDao.getOrg.mockResolvedValue({ id: "org-1", tenantId: "tenant-2" });

			const request = new Request("http://localhost/api/tenants/tenant-1/orgs/org-1?mode=archive");
			const params = { params: Promise.resolve({ tenantId: "tenant-1", orgId: "org-1" }) };

			await DELETE(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Org not found" }, { status: 404 });
		});
	});
});
