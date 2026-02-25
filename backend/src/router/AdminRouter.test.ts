import type { Database } from "../core/Database";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { OwnerInvitationDao } from "../dao/OwnerInvitationDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import * as EmailService from "../util/EmailService";
import type { OwnerInvitationTokenUtil } from "../util/OwnerInvitationTokenUtil";
import { createAdminRouter } from "./AdminRouter";
import express, { type Express } from "express";
import { type BootstrapAuthHeaders, createBootstrapAuthHeaders, createBootstrapSignature } from "jolli-common/server";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../util/EmailService", () => ({
	sendOwnerInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

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
			listTenantsWithDefaultOrg: vi.fn(),
			listAllActiveTenants: vi.fn(),
			getOrg: vi.fn(),
			getOrgBySlug: vi.fn(),
			getDefaultOrg: vi.fn(),
			listOrgs: vi.fn(),
			listAllActiveOrgs: vi.fn(),
			getTenantOrgByInstallationId: vi.fn(),
			createInstallationMapping: vi.fn(),
			ensureInstallationMapping: vi.fn(),
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
					ownerCreated: false,
				});
			});

			it("should create owner user when ownerUser is provided", async () => {
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue(undefined),
					create: vi.fn().mockResolvedValue({
						id: 123,
						email: "owner@example.com",
						name: "Owner",
						role: "owner",
						isActive: true,
					}),
				};
				const mockDatabaseWithDao = {
					activeUserDao: mockActiveUserDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDao);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					success: true,
					tenantId: "tenant-123",
					orgId: "org-456",
					schemaName: "org_default",
					ownerCreated: true,
				});

				expect(mockActiveUserDao.findById).toHaveBeenCalledWith(123);
				expect(mockActiveUserDao.create).toHaveBeenCalledWith({
					id: 123,
					email: "owner@example.com",
					name: "Owner",
					role: "owner",
					roleId: null,
					isActive: true,
					image: null,
					jobTitle: null,
					phone: null,
					language: "en",
					timezone: "UTC",
					location: null,
				});
			});

			it("should skip owner creation when user already exists", async () => {
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue({
						id: 123,
						email: "owner@example.com",
						name: "Existing Owner",
						role: "owner",
						isActive: true,
					}),
					create: vi.fn(),
				};
				const mockDatabaseWithDao = {
					activeUserDao: mockActiveUserDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDao);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				expect(response.status).toBe(200);
				expect(response.body.ownerCreated).toBe(false);
				expect(mockActiveUserDao.findById).toHaveBeenCalledWith(123);
				expect(mockActiveUserDao.create).not.toHaveBeenCalled();
			});

			it("should create default space after creating owner user", async () => {
				const mockSpaceDao = {
					createDefaultSpaceIfNeeded: vi.fn().mockResolvedValue({ id: 1, slug: "default-space-12345" }),
					migrateOrphanedDocs: vi.fn().mockResolvedValue(undefined),
				};
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue(undefined),
					create: vi.fn().mockResolvedValue({
						id: 123,
						email: "owner@example.com",
						name: "Owner",
						role: "owner",
						isActive: true,
					}),
				};
				const mockDatabaseWithDaos = {
					activeUserDao: mockActiveUserDao,
					spaceDao: mockSpaceDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDaos);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				expect(response.status).toBe(200);
				expect(mockSpaceDao.createDefaultSpaceIfNeeded).toHaveBeenCalledWith(123);
			});

			it("should migrate orphaned docs after creating default space", async () => {
				const mockSpaceDao = {
					createDefaultSpaceIfNeeded: vi.fn().mockResolvedValue({ id: 42, slug: "default-space-12345" }),
					migrateOrphanedDocs: vi.fn().mockResolvedValue(undefined),
				};
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue(undefined),
					create: vi.fn().mockResolvedValue({
						id: 123,
						email: "owner@example.com",
						name: "Owner",
						role: "owner",
						isActive: true,
					}),
				};
				const mockDatabaseWithDaos = {
					activeUserDao: mockActiveUserDao,
					spaceDao: mockSpaceDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDaos);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				expect(response.status).toBe(200);
				// migrateOrphanedDocs should be called with the default space ID
				expect(mockSpaceDao.migrateOrphanedDocs).toHaveBeenCalledWith(42);
			});

			it("should not fail bootstrap if orphaned docs migration fails", async () => {
				const mockSpaceDao = {
					createDefaultSpaceIfNeeded: vi.fn().mockResolvedValue({ id: 1, slug: "default-space-12345" }),
					migrateOrphanedDocs: vi.fn().mockRejectedValue(new Error("Migration error")),
				};
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue(undefined),
					create: vi.fn().mockResolvedValue({
						id: 123,
						email: "owner@example.com",
						name: "Owner",
						role: "owner",
						isActive: true,
					}),
				};
				const mockDatabaseWithDaos = {
					activeUserDao: mockActiveUserDao,
					spaceDao: mockSpaceDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDaos);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				// Bootstrap should still succeed even if orphaned docs migration fails
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
			});

			it("should not fail bootstrap if space creation fails", async () => {
				const mockSpaceDao = {
					createDefaultSpaceIfNeeded: vi.fn().mockRejectedValue(new Error("Database error")),
				};
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue(undefined),
					create: vi.fn().mockResolvedValue({
						id: 123,
						email: "owner@example.com",
						name: "Owner",
						role: "owner",
						isActive: true,
					}),
				};
				const mockDatabaseWithDaos = {
					activeUserDao: mockActiveUserDao,
					spaceDao: mockSpaceDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDaos);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				// Bootstrap should still succeed even if space creation fails
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
			});

			it("should not fail bootstrap if owner user creation fails", async () => {
				const mockActiveUserDao = {
					findById: vi.fn().mockResolvedValue(undefined),
					create: vi.fn().mockRejectedValue(new Error("Database error during owner creation")),
				};
				const mockDatabaseWithDaos = {
					activeUserDao: mockActiveUserDao,
				} as unknown as Database;

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockConnectionManager.getConnection).mockResolvedValue(mockDatabaseWithDaos);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/bootstrap")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						ownerUser: {
							id: 123,
							email: "owner@example.com",
							name: "Owner",
						},
					});

				// Bootstrap should still succeed even if owner creation fails
				expect(response.status).toBe(200);
				expect(response.body.success).toBe(true);
				expect(response.body.ownerCreated).toBe(false);
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

	describe("POST /send-owner-invitation-email", () => {
		let mockVerificationDao: VerificationDao;
		let mockOwnerInvitationDao: OwnerInvitationDao;
		let mockGlobalUserDao: GlobalUserDao;
		let mockOwnerInvitationTokenUtil: OwnerInvitationTokenUtil;
		const gatewayDomain = "jolli.app";

		function setupAppWithEmailDependencies(): void {
			app = express();
			app.use(express.json());
			app.use(
				"/admin",
				createAdminRouter({
					registryClient: mockRegistryClient,
					connectionManager: mockConnectionManager,
					bootstrapSecret,
					verificationDao: mockVerificationDao,
					ownerInvitationDao: mockOwnerInvitationDao,
					globalUserDao: mockGlobalUserDao,
					ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
					gatewayDomain,
				}),
			);
		}

		beforeEach(() => {
			mockVerificationDao = {
				createVerification: vi.fn().mockResolvedValue({ id: 1 }),
				findById: vi.fn(),
				findByTokenHash: vi.fn(),
				findByResetPasswordToken: vi.fn(),
				markAsUsed: vi.fn(),
				deleteVerification: vi.fn(),
				deleteExpiredOrUsed: vi.fn(),
				deleteByIdentifierAndType: vi.fn(),
			} as unknown as VerificationDao;

			mockOwnerInvitationDao = {
				create: vi.fn().mockResolvedValue({ id: 100 }),
				findById: vi.fn(),
				findPendingByOrg: vi.fn(),
				updateVerificationId: vi.fn(),
				cancelByOrg: vi.fn().mockResolvedValue(0),
				delete: vi.fn(),
			} as unknown as OwnerInvitationDao;

			mockGlobalUserDao = {
				findUserByEmail: vi.fn(),
			} as unknown as GlobalUserDao;

			mockOwnerInvitationTokenUtil = {
				generateToken: vi.fn().mockReturnValue({
					token: "test-jwt-token",
					tokenHash: "abc123hash",
					jti: "uuid-123",
				}),
				verifyToken: vi.fn(),
				hashToken: vi.fn(),
			} as unknown as OwnerInvitationTokenUtil;

			vi.mocked(EmailService.sendOwnerInvitationEmail).mockResolvedValue(undefined);
		});

		describe("validation", () => {
			beforeEach(setupAppWithEmailDependencies);

			it("should return 400 when tenantId is missing", async () => {
				const response = await request(app).post("/admin/send-owner-invitation-email").send({
					orgId: "org-456",
					email: "owner@example.com",
					invitedBy: 1,
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId, orgId, email, and invitedBy are required" });
			});

			it("should return 400 when orgId is missing", async () => {
				const response = await request(app).post("/admin/send-owner-invitation-email").send({
					tenantId: "tenant-123",
					email: "owner@example.com",
					invitedBy: 1,
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId, orgId, email, and invitedBy are required" });
			});

			it("should return 400 when email is missing", async () => {
				const response = await request(app).post("/admin/send-owner-invitation-email").send({
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId, orgId, email, and invitedBy are required" });
			});

			it("should return 400 when invitedBy is missing", async () => {
				const response = await request(app).post("/admin/send-owner-invitation-email").send({
					tenantId: "tenant-123",
					orgId: "org-456",
					email: "owner@example.com",
				});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "tenantId, orgId, email, and invitedBy are required" });
			});
		});

		describe("HMAC authentication", () => {
			beforeEach(setupAppWithEmailDependencies);

			it("should return 401 when timestamp header is missing", async () => {
				const timestamp = new Date().toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", signature)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when timestamp is expired", async () => {
				const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
				const signature = createBootstrapSignature(
					{ tenantId: "tenant-123", orgId: "org-456", timestamp: oldTimestamp },
					bootstrapSecret,
				);

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", signature)
					.set("X-Bootstrap-Timestamp", oldTimestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});

			it("should return 401 when signature is invalid", async () => {
				const timestamp = new Date().toISOString();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", "sha256=invalid_signature")
					.set("X-Bootstrap-Timestamp", timestamp)
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(401);
				expect(response.body).toEqual({ error: "invalid_request" });
			});
		});

		describe("dependency checks", () => {
			it("should return 400 when verificationDao is not configured", async () => {
				// Setup app without verificationDao
				app = express();
				app.use(express.json());
				app.use(
					"/admin",
					createAdminRouter({
						registryClient: mockRegistryClient,
						connectionManager: mockConnectionManager,
						bootstrapSecret,
						// No verificationDao
						ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
						gatewayDomain,
					}),
				);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Owner invitation feature not configured" });
			});

			it("should return 400 when ownerInvitationTokenUtil is not configured", async () => {
				app = express();
				app.use(express.json());
				app.use(
					"/admin",
					createAdminRouter({
						registryClient: mockRegistryClient,
						connectionManager: mockConnectionManager,
						bootstrapSecret,
						verificationDao: mockVerificationDao,
						// No ownerInvitationTokenUtil
						gatewayDomain,
					}),
				);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Owner invitation feature not configured" });
			});

			it("should return 400 when gatewayDomain is not configured", async () => {
				app = express();
				app.use(express.json());
				app.use(
					"/admin",
					createAdminRouter({
						registryClient: mockRegistryClient,
						connectionManager: mockConnectionManager,
						bootstrapSecret,
						verificationDao: mockVerificationDao,
						ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
						// No gatewayDomain
					}),
				);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(400);
				expect(response.body).toEqual({ error: "Owner invitation feature not configured" });
			});
		});

		describe("tenant/org lookup", () => {
			beforeEach(setupAppWithEmailDependencies);

			it("should return 404 when tenant is not found", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(404);
				expect(response.body).toEqual({ error: "Tenant not found: tenant-123" });
			});

			it("should return 404 when org is not found", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(undefined);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(404);
				expect(response.body).toEqual({ error: "Org not found: org-456" });
			});
		});

		describe("successful invitation email", () => {
			beforeEach(setupAppWithEmailDependencies);

			it("should send invitation email for new user", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						name: "New Owner",
						invitedBy: 1,
					});

				expect(response.status).toBe(200);
				expect(response.body).toEqual({ success: true, invitationId: 100 });

				expect(mockOwnerInvitationDao.create).toHaveBeenCalledWith(
					expect.objectContaining({
						email: "owner@example.com",
						tenantId: "tenant-123",
						orgId: "org-456",
					}),
				);

				expect(mockVerificationDao.createVerification).toHaveBeenCalledWith(
					expect.objectContaining({
						identifier: "owner@example.com",
						tokenHash: "abc123hash",
						type: "owner_invitation",
						value: null,
					}),
				);

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						toEmail: "owner@example.com",
						toName: "New Owner",
						tenantName: "Acme Corp",
						organizationName: "Default Org",
						userExists: false,
					}),
				);
			});

			it("should send invitation email for existing user", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue({
					id: 99,
					email: "existing@example.com",
					name: "Existing User",
				} as never);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "existing@example.com",
						name: "Existing User",
						invitedBy: 1,
					});

				expect(response.status).toBe(200);

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						userExists: true,
					}),
				);
			});

			it("should cancel existing pending invitations before creating new one", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				// Mock an existing pending invitation
				vi.mocked(mockOwnerInvitationDao.findPendingByOrg).mockResolvedValue({
					id: 50,
					verificationId: 99,
					email: "old-owner@example.com",
					name: null,
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 1,
					previousOwnerId: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				});

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				// Should find and delete existing pending invitation
				expect(mockOwnerInvitationDao.findPendingByOrg).toHaveBeenCalledWith("tenant-123", "org-456");
				expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(99);
				expect(mockOwnerInvitationDao.delete).toHaveBeenCalledWith(50);
			});

			it("should generate token with correct parameters", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						name: "Owner Name",
						invitedBy: 5,
						previousOwnerId: 10,
					});

				expect(mockOwnerInvitationTokenUtil.generateToken).toHaveBeenCalledWith({
					email: "owner@example.com",
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 5,
					name: "Owner Name",
					previousOwnerId: 10,
					invitationId: 100, // From mockOwnerInvitationDao.create
					expiresInSeconds: 7 * 24 * 60 * 60, // 7 days default
				});
			});

			it("should use tenant primary domain for invitation URL when customDomain feature enabled", async () => {
				const tenantWithPrimaryDomain = {
					...mockTenant,
					primaryDomain: "acme.custom.com",
					featureFlags: { customDomain: true },
				};
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(tenantWithPrimaryDomain);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						invitationUrl: expect.stringContaining("https://acme.custom.com/owner-invite/accept"),
					}),
				);
			});

			it("should use subdomain URL for invitation when subdomain feature enabled", async () => {
				const subdomainTenant = {
					...mockTenant,
					featureFlags: { subdomain: true },
				};
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(subdomainTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						invitationUrl: expect.stringContaining("https://acme.jolli.app/owner-invite/accept"),
					}),
				);
			});

			it("should use path-based URL for invitation when free tier (no subdomain feature)", async () => {
				// mockTenant has featureFlags: {} (free tier default)
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						invitationUrl: expect.stringContaining("https://jolli.app/acme/owner-invite/accept"),
					}),
				);
			});

			it("should handle null name", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						name: null,
						invitedBy: 1,
					});

				expect(mockOwnerInvitationTokenUtil.generateToken).toHaveBeenCalledWith(
					expect.objectContaining({
						name: null,
					}),
				);

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						toName: null,
					}),
				);
			});

			it("should handle missing name (undefined)", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						// name not provided
						invitedBy: 1,
					});

				expect(mockOwnerInvitationTokenUtil.generateToken).toHaveBeenCalledWith(
					expect.objectContaining({
						name: null,
					}),
				);
			});

			it("should handle null previousOwnerId", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
						previousOwnerId: null,
					});

				expect(mockOwnerInvitationTokenUtil.generateToken).toHaveBeenCalledWith(
					expect.objectContaining({
						previousOwnerId: null,
					}),
				);
			});

			it("should store invitation metadata in owner_invitations table (not verification.value)", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						name: "Test Owner",
						invitedBy: 5,
						previousOwnerId: 10,
					});

				// Metadata is stored in owner_invitations table, not verification.value
				expect(mockOwnerInvitationDao.create).toHaveBeenCalledWith({
					email: "owner@example.com",
					name: "Test Owner",
					tenantId: "tenant-123",
					orgId: "org-456",
					invitedBy: 5,
					previousOwnerId: 10,
				});

				// Verification only stores token hash and expiry, value is null
				expect(mockVerificationDao.createVerification).toHaveBeenCalledWith(
					expect.objectContaining({
						value: null,
					}),
				);
			});

			it("should use custom expiry days when configured", async () => {
				// Setup app with custom expiry
				app = express();
				app.use(express.json());
				app.use(
					"/admin",
					createAdminRouter({
						registryClient: mockRegistryClient,
						connectionManager: mockConnectionManager,
						bootstrapSecret,
						verificationDao: mockVerificationDao,
						ownerInvitationDao: mockOwnerInvitationDao,
						globalUserDao: mockGlobalUserDao,
						ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
						gatewayDomain,
						ownerInvitationExpiryDays: 14, // Custom 14 days
					}),
				);

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(mockOwnerInvitationTokenUtil.generateToken).toHaveBeenCalledWith(
					expect.objectContaining({
						expiresInSeconds: 14 * 24 * 60 * 60, // 14 days
					}),
				);

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						expiresInDays: 14,
					}),
				);
			});

			it("should work without globalUserDao (userExists defaults to false)", async () => {
				// Setup app without globalUserDao
				app = express();
				app.use(express.json());
				app.use(
					"/admin",
					createAdminRouter({
						registryClient: mockRegistryClient,
						connectionManager: mockConnectionManager,
						bootstrapSecret,
						verificationDao: mockVerificationDao,
						ownerInvitationDao: mockOwnerInvitationDao,
						// No globalUserDao
						ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
						gatewayDomain,
					}),
				);

				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(200);

				expect(EmailService.sendOwnerInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({
						userExists: false,
					}),
				);
			});
		});

		describe("error handling", () => {
			beforeEach(setupAppWithEmailDependencies);

			it("should return 500 when email sending fails", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(EmailService.sendOwnerInvitationEmail).mockRejectedValue(new Error("SendGrid API error"));

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(500);
				expect(response.body).toEqual({
					error: "Failed to send email",
					details: "SendGrid API error",
				});
			});

			it("should return 500 when verification creation fails", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
				vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(mockOrg);
				vi.mocked(mockVerificationDao.createVerification).mockRejectedValue(new Error("Database error"));

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(500);
				expect(response.body).toEqual({
					error: "Failed to send email",
					details: "Database error",
				});
			});

			it("should handle non-Error exceptions with 'Unknown error' message", async () => {
				vi.mocked(mockRegistryClient.getTenant).mockRejectedValue("String error");

				const headers = getValidAuthHeaders();

				const response = await request(app)
					.post("/admin/send-owner-invitation-email")
					.set("X-Bootstrap-Signature", headers["X-Bootstrap-Signature"])
					.set("X-Bootstrap-Timestamp", headers["X-Bootstrap-Timestamp"])
					.send({
						tenantId: "tenant-123",
						orgId: "org-456",
						email: "owner@example.com",
						invitedBy: 1,
					});

				expect(response.status).toBe(500);
				expect(response.body).toEqual({
					error: "Failed to send email",
					details: "Unknown error",
				});
			});
		});
	});
});
