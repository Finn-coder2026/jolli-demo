import type { Database } from "../core/Database";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { createAdminRouter } from "./AdminRouter";
import express, { type Express } from "express";
import { type BootstrapAuthHeaders, createBootstrapAuthHeaders, createBootstrapSignature } from "jolli-common/server";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AdminRouter", () => {
	let app: Express;
	let mockRegistryClient: TenantRegistryClient;
	let mockConnectionManager: TenantOrgConnectionManager;
	const bootstrapSecret = "test-secret-12345";

	const mockTenant = {
		id: "tenant-123",
		slug: "acme",
		displayName: "Acme Corp",
		status: "active" as const,
		deploymentType: "shared" as const,
		databaseProviderId: "provider-1",
		databaseHost: "localhost",
		databasePort: 5432,
		databaseName: "jolli_acme",
		databaseUsername: "jolli_acme",
		databasePasswordEncrypted: "encrypted-password",
		databaseSsl: false,
		databasePoolMax: 5,
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		provisionedAt: new Date(),
	};

	const mockOrg = {
		id: "org-456",
		tenantId: "tenant-123",
		slug: "default",
		displayName: "Default Org",
		schemaName: "org_default",
		status: "active" as const,
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockDatabase = {} as Database;

	/**
	 * Helper to create valid auth headers for a request
	 */
	function getValidAuthHeaders(tenantId = "tenant-123", orgId = "org-456"): BootstrapAuthHeaders {
		return createBootstrapAuthHeaders(tenantId, orgId, bootstrapSecret);
	}

	function setupApp(): void {
		app = express();
		app.use(express.json());
		app.use(
			"/admin",
			createAdminRouter({
				registryClient: mockRegistryClient,
				connectionManager: mockConnectionManager,
				bootstrapSecret,
			}),
		);
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-17T12:00:00.000Z"));
		vi.clearAllMocks();

		mockRegistryClient = {
			getTenant: vi.fn(),
			getTenantBySlug: vi.fn(),
			getTenantByDomain: vi.fn(),
			getTenantDatabaseConfig: vi.fn(),
			listTenants: vi.fn(),
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

		mockConnectionManager = {
			getConnection: vi.fn(),
			closeAll: vi.fn(),
		} as unknown as TenantOrgConnectionManager;

		setupApp();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("POST /bootstrap", () => {
		describe("HMAC authentication", () => {
			it("should return 401 when signature header is missing", async () => {
				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Timestamp", new Date().toISOString())
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when timestamp header is missing", async () => {
				const timestamp = new Date().toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when timestamp is expired (older than 5 minutes)", async () => {
				// 10 minutes ago
				const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp: oldTimestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", oldTimestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when timestamp is too far in the future", async () => {
				// 10 minutes in the future
				const futureTimestamp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp: futureTimestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", futureTimestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when signature is invalid", async () => {
				const timestamp = new Date().toISOString();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", "sha256=invalid_signature_that_is_not_correct_length_hex")
					.set("X-Bootstrap-Timestamp", timestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when signature was made with wrong secret", async () => {
				const timestamp = new Date().toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp },
					"wrong-secret",
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", timestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when tenantId in body does not match signature", async () => {
				const timestamp = new Date().toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", timestamp)
					.send({
						tenantId: "different-tenant", // Different from what was signed
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when orgId in body does not match signature", async () => {
				const timestamp = new Date().toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", timestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "different-org", // Different from what was signed
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should accept valid signature with current timestamp", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(200);
			});

			it("should accept timestamp within tolerance window (2 minutes ago)", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);

				// 2 minutes ago (within 5 minute default window)
				const recentTimestamp = new Date(Date.now() - 2 * 60 * 1000).toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp: recentTimestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", recentTimestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(200);
			});

			it("should respect custom timestamp tolerance", async () => {
				// Create app with 1 minute tolerance
				const strictApp = express();
				strictApp.use(express.json());
				strictApp.use(
					"/admin",
					createAdminRouter({
						registryClient: mockRegistryClient,
						connectionManager: mockConnectionManager,
						bootstrapSecret,
						bootstrapTimestampToleranceMs: 60 * 1000, // 1 minute
					}),
				);

				// 2 minutes ago (outside 1 minute window)
				const oldTimestamp = new Date(Date.now() - 2 * 60 * 1000).toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp: oldTimestamp },
					bootstrapSecret,
				);

				const response = await request(strictApp)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", oldTimestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});
		});

		describe("validation", () => {
			it("should return 400 when tenantId is missing", async () => {
				// Body validation happens before auth, so no auth needed
				const response = await request(app).post("/admin/bootstrap").send({
					orgId: "org-456",
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId and orgId required" });
			});

			it("should return 400 when orgId is missing", async () => {
				const response = await request(app).post("/admin/bootstrap").send({
					tenantId: "tenant-123",
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId and orgId required" });
			});

			it("should return 400 when both tenantId and orgId are missing", async () => {
				const response = await request(app).post("/admin/bootstrap").send({});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId and orgId required" });
			});
		});

		describe("tenant/org lookup", () => {
			it("should return 404 when tenant is not found", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

				const headers = getValidAuthHeaders("nonexistent-tenant", "org-456");

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "nonexistent-tenant",
						orgId: "org-456",
					});

				expect(response.status).toBe(404);
				expect(response.body).toEqual({ error: "Tenant not found: nonexistent-tenant" });
			});

			it("should return 404 when org is not found", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(undefined);

				const headers = getValidAuthHeaders("tenant-123", "nonexistent-org");

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "nonexistent-org",
					});

				expect(response.status).toBe(404);
				expect(response.body).toEqual({ error: "Org not found: nonexistent-org" });
			});

			it("should return 400 when org does not belong to tenant", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue({
					...mockOrg,
					tenantId: "different-tenant", // Org belongs to different tenant
				});

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Org does not belong to specified tenant" });
			});
		});

		describe("successful bootstrap", () => {
			it("should call connectionManager.getConnection with tenant, org, and forceSync", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				// Bootstrap should force sync to create tables even in Vercel environment
				expect(mockConnectionManager.getConnection).toHaveBeenCalledWith(mockTenant, mockOrg, {
					forceSync: true,
				});
			});

			it("should return success response with schema name", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabase);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					success: true,
					tenantId: "tenant-123",
					orgId: "org-456",
					schemaName: "org_default",
				});
			});
		});

		describe("error handling", () => {
			it("should return 500 when connectionManager.getConnection fails", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockRejectedValue(
					new Error("Database connection failed"),
				);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(500);
				expect(response.body).toEqual({
					error: "Bootstrap failed",
					details: "Database connection failed",
				});
			});

			it("should return 500 when registry lookup fails", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockRejectedValue(new Error("Registry unavailable"));

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(500);
				expect(response.body).toEqual({
					error: "Bootstrap failed",
					details: "Registry unavailable",
				});
			});

			it("should handle non-Error exceptions with 'Unknown error' message", async () => {
				// Throw a non-Error value to test the error instanceof Error check
				vi.mocked(mockRegistryClient.getTenant).mockRejectedValue("String error instead of Error object");

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
					});

				expect(response.status).toBe(500);
				expect(response.body).toEqual({
					error: "Bootstrap failed",
					details: "Unknown error",
				});
			});
		});
	});
});
