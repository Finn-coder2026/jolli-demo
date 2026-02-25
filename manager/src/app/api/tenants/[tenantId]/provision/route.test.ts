import { getDatabase } from "../../../../../lib/db/getDatabase";
import { createProviderAdapter } from "../../../../../lib/providers";
import { bootstrapDatabaseWithSuperuser } from "../../../../../lib/util/BootstrapUtil";
import { POST } from "./route";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("../../../../../lib/Config", () => ({
	env: {
		ADMIN_POSTGRES_URL: "postgresql://admin:password@localhost:5432/postgres",
		BACKEND_INTERNAL_URL: "http://localhost:3001",
		BOOTSTRAP_SECRET: "test-secret",
		ENCRYPTION_KEY: "test-encryption-key-32bytes-long!",
	},
}));

vi.mock("../../../../../lib/db/getDatabase");
vi.mock("../../../../../lib/providers");
vi.mock("../../../../../lib/util/BootstrapUtil");
vi.mock("jolli-common/server", () => ({
	decryptPassword: vi.fn(password => password),
}));
vi.mock("next/server", () => ({
	NextResponse: {
		json: vi.fn((data, init) => ({ data, init })),
	},
}));

describe("POST /api/tenants/[tenantId]/provision", () => {
	const mockTenantDao = {
		getTenant: vi.fn(),
		markProvisioned: vi.fn(),
	};

	const mockOrgDao = {
		listOrgs: vi.fn(),
		updateOrgStatus: vi.fn(),
	};

	const mockProviderDao = {
		getProvider: vi.fn(),
	};

	const mockUserOrgDao = {
		findOwnerByOrg: vi.fn(),
	};

	const mockGlobalUserDao = {
		findById: vi.fn(),
	};

	const mockAdapter = {
		provisionSchema: vi.fn(),
		checkSchemaExists: vi.fn(),
	};

	const mockDb = {
		tenantDao: mockTenantDao,
		orgDao: mockOrgDao,
		providerDao: mockProviderDao,
		userOrgDao: mockUserOrgDao,
		globalUserDao: mockGlobalUserDao,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDatabase>>);
		vi.mocked(createProviderAdapter).mockReturnValue(
			mockAdapter as unknown as ReturnType<typeof createProviderAdapter>,
		);
		vi.mocked(bootstrapDatabaseWithSuperuser).mockResolvedValue(undefined);
		// Default: schema doesn't exist, provisionSchema creates it
		mockAdapter.checkSchemaExists.mockResolvedValue(false);
		mockAdapter.provisionSchema.mockResolvedValue({ created: true, existed: false });
		// Default: no owner user for orgs
		mockUserOrgDao.findOwnerByOrg.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("successful provisioning", () => {
		it("provisions org schemas using provider credentials", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "neon",
				status: "active",
				databaseHost: "test.neon.tech",
				databasePort: 5432,
				databaseName: "jolli_provider",
				databaseUsername: "test_user",
				databasePasswordEncrypted: "test_password",
				databaseSsl: true,
			};

			const mockOrgs = [{ id: "org-1", slug: "default", schemaName: "org_test_tenant", status: "provisioning" }];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			// Should provision schema with provider credentials
			expect(mockAdapter.provisionSchema).toHaveBeenCalledWith(
				expect.objectContaining({
					host: "test.neon.tech",
					port: 5432,
					database: "jolli_provider",
					username: "test_user",
					password: "test_password",
					ssl: true,
				}),
				"org_test_tenant",
				{ reuseExisting: false, force: false },
			);
			expect(mockOrgDao.updateOrgStatus).toHaveBeenCalledWith("org-1", "active");
			expect(mockTenantDao.markProvisioned).toHaveBeenCalledWith("tenant-1");
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					orgsProvisioned: 1,
				}),
			);
		});

		it("provisions multiple orgs", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "neon",
				status: "active",
				databaseHost: "test.neon.tech",
				databasePort: 5432,
				databaseName: "jolli_provider",
				databaseUsername: "test_user",
				databasePasswordEncrypted: "test_password",
				databaseSsl: true,
			};

			const mockOrgs = [
				{ id: "org-1", slug: "default", schemaName: "org_test_tenant", status: "provisioning" },
				{ id: "org-2", slug: "extra", schemaName: "org_test_tenant_extra", status: "provisioning" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(mockAdapter.provisionSchema).toHaveBeenCalledTimes(2);
			expect(mockOrgDao.updateOrgStatus).toHaveBeenCalledTimes(2);
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					orgsProvisioned: 2,
				}),
			);
		});

		it("skips already active orgs", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "neon",
				status: "active",
				databaseHost: "test.neon.tech",
				databasePort: 5432,
				databaseName: "jolli_provider",
				databaseUsername: "test_user",
				databasePasswordEncrypted: "test_password",
				databaseSsl: true,
			};

			const mockOrgs = [
				{ id: "org-1", slug: "default", schemaName: "org_test_tenant", status: "active" }, // Already active
				{ id: "org-2", slug: "extra", schemaName: "org_test_tenant_extra", status: "provisioning" },
			];

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			// Should only provision the provisioning org, not the active one
			expect(mockAdapter.provisionSchema).toHaveBeenCalledTimes(1);
			expect(mockAdapter.provisionSchema).toHaveBeenCalledWith(expect.anything(), "org_test_tenant_extra", {
				reuseExisting: false,
				force: false,
			});
			expect(mockOrgDao.updateOrgStatus).toHaveBeenCalledTimes(1);
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					orgsProvisioned: 1,
				}),
			);
		});
	});

	describe("error cases", () => {
		it("returns 404 when tenant not found", async () => {
			mockTenantDao.getTenant.mockResolvedValue(undefined);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Tenant not found" }, { status: 404 });
		});

		it("returns 400 when tenant not in provisioning state", async () => {
			mockTenantDao.getTenant.mockResolvedValue({
				id: "tenant-1",
				status: "active",
			});

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: expect.stringContaining("active") }),
				{ status: 400 },
			);
		});

		it("returns 400 when provider not active", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "neon",
				status: "provisioning", // Not active
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: expect.stringContaining("provisioning") }),
				{ status: 400 },
			);
		});

		it("returns 400 when provider missing database credentials", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			const mockProvider = {
				id: "provider-1",
				type: "neon",
				status: "active",
				databaseHost: null, // Missing host
				databasePasswordEncrypted: null, // Missing password
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: expect.stringContaining("not configured") }),
				{ status: 400 },
			);
		});

		it("returns 500 when provider not found", async () => {
			const mockTenant = {
				id: "tenant-1",
				slug: "test-tenant",
				status: "provisioning",
				databaseProviderId: "provider-1",
			};

			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(undefined);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Database provider not found" }, { status: 500 });
		});
	});

	describe("schema conflict handling", () => {
		const mockTenant = {
			id: "tenant-1",
			slug: "test-tenant",
			status: "provisioning",
			databaseProviderId: "provider-1",
		};

		const mockProvider = {
			id: "provider-1",
			type: "neon",
			status: "active",
			databaseHost: "test.neon.tech",
			databasePort: 5432,
			databaseName: "jolli_provider",
			databaseUsername: "test_user",
			databasePasswordEncrypted: "test_password",
			databaseSsl: true,
		};

		const mockOrgs = [{ id: "org-1", slug: "default", schemaName: "org_test_tenant", status: "provisioning" }];

		it("returns 409 when schema exists and no reuseExisting or force flags", async () => {
			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockAdapter.checkSchemaExists.mockResolvedValue(true);

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					error: expect.stringContaining("already exists"),
					schemaExists: true,
				}),
				{ status: 409 },
			);
			expect(mockAdapter.provisionSchema).not.toHaveBeenCalled();
			expect(mockTenantDao.markProvisioned).not.toHaveBeenCalled();
		});

		it("reuses existing schema when reuseExisting=true", async () => {
			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockAdapter.checkSchemaExists.mockResolvedValue(true);
			// Schema exists, so provisionSchema returns created=false
			mockAdapter.provisionSchema.mockResolvedValue({ created: false, existed: true });

			const request = new Request("http://localhost/api/tenants/tenant-1/provision?reuseExisting=true");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(mockAdapter.provisionSchema).toHaveBeenCalledWith(expect.anything(), "org_test_tenant", {
				reuseExisting: true,
				force: false,
			});
			// Should NOT bootstrap when reusing existing schema
			expect(bootstrapDatabaseWithSuperuser).not.toHaveBeenCalled();
			expect(mockOrgDao.updateOrgStatus).toHaveBeenCalledWith("org-1", "active");
			expect(mockTenantDao.markProvisioned).toHaveBeenCalledWith("tenant-1");
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					orgsReused: 1,
					orgsProvisioned: 0,
				}),
			);
		});

		it("drops and recreates schema when force=true", async () => {
			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockAdapter.checkSchemaExists.mockResolvedValue(true);
			// Force drops and recreates, so created=true
			mockAdapter.provisionSchema.mockResolvedValue({ created: true, existed: true });

			const request = new Request("http://localhost/api/tenants/tenant-1/provision?force=true");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(mockAdapter.provisionSchema).toHaveBeenCalledWith(expect.anything(), "org_test_tenant", {
				reuseExisting: false,
				force: true,
			});
			// Should bootstrap when force recreating
			expect(bootstrapDatabaseWithSuperuser).toHaveBeenCalled();
			expect(mockOrgDao.updateOrgStatus).toHaveBeenCalledWith("org-1", "active");
			expect(mockTenantDao.markProvisioned).toHaveBeenCalledWith("tenant-1");
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					orgsProvisioned: 1,
				}),
			);
		});

		it("creates new schema and bootstraps when schema does not exist", async () => {
			mockTenantDao.getTenant.mockResolvedValue(mockTenant);
			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockOrgDao.listOrgs.mockResolvedValue(mockOrgs);
			mockAdapter.checkSchemaExists.mockResolvedValue(false);
			mockAdapter.provisionSchema.mockResolvedValue({ created: true, existed: false });

			const request = new Request("http://localhost/api/tenants/tenant-1/provision");
			const params = { params: Promise.resolve({ tenantId: "tenant-1" }) };

			await POST(request, params);

			expect(mockAdapter.provisionSchema).toHaveBeenCalledWith(expect.anything(), "org_test_tenant", {
				reuseExisting: false,
				force: false,
			});
			// Should bootstrap new schema
			expect(bootstrapDatabaseWithSuperuser).toHaveBeenCalled();
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					success: true,
					orgsProvisioned: 1,
				}),
			);
		});
	});
});
