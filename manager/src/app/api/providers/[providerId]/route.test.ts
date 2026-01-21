import { PRECONFIGURED_PROVIDER_SLUG } from "../../../../lib/db/Database";
import { getDatabase } from "../../../../lib/db/getDatabase";
import { DELETE, GET, PATCH } from "./route";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("../../../../lib/Config", () => ({
	env: {
		ENCRYPTION_KEY: "test-encryption-key-32bytes-long!",
		DISABLE_DEFAULT_PROVIDER: false,
	},
}));

vi.mock("../../../../lib/db/Database", () => ({
	PRECONFIGURED_PROVIDER_SLUG: "preconfigured_postgresql",
}));

vi.mock("../../../../lib/db/getDatabase");
vi.mock("next/server", () => ({
	NextResponse: {
		json: vi.fn((data, init) => ({ data, init })),
	},
}));

describe("Provider API routes", () => {
	const mockProviderDao = {
		getProvider: vi.fn(),
		updateProvider: vi.fn(),
		deleteProvider: vi.fn(),
		setDefault: vi.fn(),
	};

	const mockTenantDao = {
		getTenantsByProviderId: vi.fn(),
	};

	const mockDb = {
		providerDao: mockProviderDao,
		tenantDao: mockTenantDao,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getDatabase).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDatabase>>);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("GET /api/providers/[providerId]", () => {
		it("returns provider with region and hasConfig flag", async () => {
			const mockProvider = {
				id: "provider-1",
				name: "Test Neon",
				type: "neon",
				slug: "test-neon",
				region: "us-west-2",
				isDefault: false,
				configEncrypted: "encrypted-config",
				databasePasswordEncrypted: null,
				connectionTemplate: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockTenantDao.getTenantsByProviderId.mockResolvedValue([]);

			const request = new Request("http://localhost/api/providers/provider-1");
			const params = { params: Promise.resolve({ providerId: "provider-1" }) };

			await GET(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: expect.objectContaining({
						id: "provider-1",
						region: "us-west-2",
						hasConfig: true,
						hasCredentials: false,
					}),
					tenants: [],
				}),
			);
		});

		it("returns 404 when provider not found", async () => {
			mockProviderDao.getProvider.mockResolvedValue(null);

			const request = new Request("http://localhost/api/providers/nonexistent");
			const params = { params: Promise.resolve({ providerId: "nonexistent" }) };

			await GET(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Provider not found" }, { status: 404 });
		});
	});

	describe("PATCH /api/providers/[providerId]", () => {
		it("sets provider as default", async () => {
			const mockProvider = {
				id: "provider-1",
				name: "Test Provider",
				type: "neon",
				slug: "test-provider",
				region: "us-west-2",
				isDefault: false,
				configEncrypted: "encrypted-config",
				databasePasswordEncrypted: null,
				connectionTemplate: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const updatedProvider = {
				...mockProvider,
				isDefault: true,
			};

			mockProviderDao.getProvider.mockResolvedValueOnce(mockProvider).mockResolvedValueOnce(updatedProvider);
			mockProviderDao.setDefault.mockResolvedValue(undefined);

			const request = new Request("http://localhost/api/providers/provider-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isDefault: true }),
			});
			const params = { params: Promise.resolve({ providerId: "provider-1" }) };

			await PATCH(request, params);

			expect(mockProviderDao.setDefault).toHaveBeenCalledWith("provider-1");
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: expect.objectContaining({
						id: "provider-1",
						isDefault: true,
					}),
				}),
			);
		});

		it("clears default flag", async () => {
			const mockProvider = {
				id: "provider-1",
				name: "Test Provider",
				type: "neon",
				slug: "test-provider",
				region: "us-west-2",
				isDefault: true,
				configEncrypted: "encrypted-config",
				databasePasswordEncrypted: null,
				connectionTemplate: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const updatedProvider = {
				...mockProvider,
				isDefault: false,
			};

			mockProviderDao.getProvider.mockResolvedValueOnce(mockProvider).mockResolvedValueOnce(updatedProvider);
			mockProviderDao.updateProvider.mockResolvedValue(updatedProvider);

			const request = new Request("http://localhost/api/providers/provider-1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isDefault: false }),
			});
			const params = { params: Promise.resolve({ providerId: "provider-1" }) };

			await PATCH(request, params);

			expect(mockProviderDao.updateProvider).toHaveBeenCalledWith("provider-1", { isDefault: false });
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: expect.objectContaining({
						id: "provider-1",
						isDefault: false,
					}),
				}),
			);
		});

		it("returns 404 when provider not found", async () => {
			mockProviderDao.getProvider.mockResolvedValue(undefined);

			const request = new Request("http://localhost/api/providers/nonexistent", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isDefault: true }),
			});
			const params = { params: Promise.resolve({ providerId: "nonexistent" }) };

			await PATCH(request, params);

			expect(NextResponse.json).toHaveBeenCalledWith({ error: "Provider not found" }, { status: 404 });
		});
	});

	describe("DELETE /api/providers/[providerId]", () => {
		it("deletes provider with no tenants", async () => {
			const mockProvider = {
				id: "provider-1",
				name: "Test",
				type: "neon",
				slug: "test-provider",
				region: "us-west-2",
				isDefault: false,
			};

			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockTenantDao.getTenantsByProviderId.mockResolvedValue([]);
			mockProviderDao.deleteProvider.mockResolvedValue(true);

			const request = new Request("http://localhost/api/providers/provider-1", {
				method: "DELETE",
			});
			const params = { params: Promise.resolve({ providerId: "provider-1" }) };

			await DELETE(request, params);

			expect(mockProviderDao.deleteProvider).toHaveBeenCalledWith("provider-1");
			expect(NextResponse.json).toHaveBeenCalledWith({ success: true, databaseDropped: false });
		});

		it("prevents deletion of preconfigured provider when DISABLE_DEFAULT_PROVIDER is false", async () => {
			const mockProvider = {
				id: "provider-1",
				name: "Preconfigured PostgreSQL",
				type: "connection_string",
				slug: PRECONFIGURED_PROVIDER_SLUG,
				region: "us-west-2",
				isDefault: true,
			};

			mockProviderDao.getProvider.mockResolvedValue(mockProvider);

			const request = new Request("http://localhost/api/providers/provider-1", {
				method: "DELETE",
			});
			const params = { params: Promise.resolve({ providerId: "provider-1" }) };

			await DELETE(request, params);

			expect(mockProviderDao.deleteProvider).not.toHaveBeenCalled();
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: expect.stringContaining("pre-configured") }),
				{ status: 400 },
			);
		});

		it("prevents deletion of provider with associated tenants", async () => {
			const mockProvider = {
				id: "provider-1",
				name: "Test",
				type: "neon",
				slug: "test-provider",
				region: "us-west-2",
				isDefault: false,
			};

			const mockTenants = [
				{ id: "tenant-1", displayName: "Tenant 1" },
				{ id: "tenant-2", displayName: "Tenant 2" },
			];

			mockProviderDao.getProvider.mockResolvedValue(mockProvider);
			mockTenantDao.getTenantsByProviderId.mockResolvedValue(mockTenants);

			const request = new Request("http://localhost/api/providers/provider-1", {
				method: "DELETE",
			});
			const params = { params: Promise.resolve({ providerId: "provider-1" }) };

			await DELETE(request, params);

			expect(mockProviderDao.deleteProvider).not.toHaveBeenCalled();
			expect(NextResponse.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: expect.stringContaining("2 associated tenants") }),
				{ status: 400 },
			);
		});
	});
});
