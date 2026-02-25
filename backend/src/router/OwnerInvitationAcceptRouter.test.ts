import { auditLog } from "../audit";
import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { OwnerInvitationDao } from "../dao/OwnerInvitationDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { Verification } from "../model/Verification";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type { OwnerInvitationTokenPayload, OwnerInvitationTokenUtil } from "../util/OwnerInvitationTokenUtil";
import {
	createOwnerInvitationAcceptRouter,
	type OwnerInvitationAcceptRouterDependencies,
} from "./OwnerInvitationAcceptRouter";
import * as argon2 from "@node-rs/argon2";
import express, { type Express } from "express";
import type { Sequelize } from "sequelize";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @node-rs/argon2 for both static import (hash) and dynamic import (verify)
vi.mock("@node-rs/argon2", () => ({
	hash: vi.fn().mockResolvedValue("mocked-password-hash"),
	verify: vi.fn().mockResolvedValue(true),
}));

vi.mock("../audit", () => ({
	auditLog: vi.fn(),
}));

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("OwnerInvitationAcceptRouter", () => {
	let app: Express;
	let mockOwnerInvitationTokenUtil: OwnerInvitationTokenUtil;
	let mockVerificationDao: VerificationDao;
	let mockOwnerInvitationDao: OwnerInvitationDao;
	let mockGlobalUserDao: GlobalUserDao;
	let mockGlobalAuthDao: GlobalAuthDao;
	let mockUserOrgDao: UserOrgDao;
	let mockActiveUserDao: ActiveUserDao;
	let mockSpaceDao: SpaceDao;
	let mockRegistryClient: TenantRegistryClient;
	let mockConnectionManager: TenantOrgConnectionManager;
	let mockManagerSequelize: Sequelize;
	let mockTenantContext: TenantOrgContext;
	let mockGetSessionFromRequest: ReturnType<typeof vi.fn>;

	const validPayload: OwnerInvitationTokenPayload = {
		jti: "test-jti-123",
		type: "owner_invitation",
		email: "owner@example.com",
		tenantId: "tenant-123",
		orgId: "org-456",
		invitedBy: 1,
		name: "Test Owner",
		previousOwnerId: null,
		invitationId: 100,
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 3600,
	};

	const validVerification = {
		id: 1,
		identifier: "owner@example.com",
		tokenHash: "valid-token-hash",
		type: "owner_invitation",
		expiresAt: new Date(Date.now() + 3600000),
		createdAt: new Date(),
		updatedAt: new Date(),
	} as Verification;

	const mockTenant = {
		id: "tenant-123",
		slug: "test-tenant",
		displayName: "Test Tenant",
		status: "active" as const,
		deploymentType: "shared" as const,
		databaseProviderId: "default",
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
		slug: "test-org",
		displayName: "Test Org",
		schemaName: "test_schema",
		status: "active" as const,
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	/** Helper to create a mock GlobalUser with all required properties */
	function mockGlobalUser(overrides: { id: number; email: string; name: string }) {
		return {
			...overrides,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	/** Helper to create a mock GlobalAuth with all required properties */
	function mockGlobalAuth(overrides: { id: number; userId: number; provider: string; passwordHash?: string }) {
		return {
			...overrides,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	beforeEach(() => {
		// Create mock token util
		mockOwnerInvitationTokenUtil = {
			generateToken: vi.fn(),
			verifyToken: vi.fn(),
			hashToken: vi.fn().mockReturnValue("valid-token-hash"),
		};

		// Create mock verification dao
		mockVerificationDao = {
			createVerification: vi.fn(),
			findById: vi.fn(),
			findByTokenHash: vi.fn(),
			findByResetPasswordToken: vi.fn(),
			markAsUsed: vi.fn(),
			deleteVerification: vi.fn(),
			deleteExpiredOrUsed: vi.fn(),
			deleteByIdentifierAndType: vi.fn(),
		};

		// Create mock owner invitation dao
		mockOwnerInvitationDao = {
			create: vi.fn(),
			findById: vi.fn(),
			findPendingByOrg: vi.fn(),
			updateVerificationId: vi.fn(),
			cancelByOrg: vi.fn(),
			delete: vi.fn(),
		};

		// Create mock global user dao
		mockGlobalUserDao = {
			findUserByEmail: vi.fn(),
			findUserById: vi.fn(),
			createUser: vi.fn(),
			updateUser: vi.fn(),
		} as unknown as GlobalUserDao;

		// Create mock global auth dao
		mockGlobalAuthDao = {
			findAuthByUserIdAndProvider: vi.fn(),
			createAuth: vi.fn(),
		} as unknown as GlobalAuthDao;

		// Create mock user org dao
		mockUserOrgDao = {
			createUserOrg: vi.fn(),
			updateRole: vi.fn(),
			getOrgsForTenant: vi.fn().mockResolvedValue([]),
		} as unknown as UserOrgDao;

		// Create mock active user dao
		mockActiveUserDao = {
			findByEmail: vi.fn(),
			findById: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		} as unknown as ActiveUserDao;

		// Create mock space dao
		mockSpaceDao = {
			createDefaultSpaceIfNeeded: vi.fn(),
		} as unknown as SpaceDao;

		// Create mock registry client
		mockRegistryClient = {
			getTenant: vi.fn().mockResolvedValue(mockTenant),
			getOrg: vi.fn().mockResolvedValue(mockOrg),
		} as unknown as TenantRegistryClient;

		// Create mock tenant context
		const mockTenantSequelize = {
			transaction: vi.fn().mockResolvedValue({
				commit: vi.fn(),
				rollback: vi.fn(),
			}),
		};

		mockTenantContext = {
			tenant: mockTenant,
			org: mockOrg,
			schemaName: "test_schema",
			database: {
				sequelize: mockTenantSequelize,
			},
		} as unknown as TenantOrgContext;

		// Create mock connection manager
		mockConnectionManager = {
			getConnection: vi.fn().mockResolvedValue(mockTenantContext.database),
		} as unknown as TenantOrgConnectionManager;

		// Create mock manager sequelize
		mockManagerSequelize = {
			transaction: vi.fn().mockResolvedValue({
				commit: vi.fn(),
				rollback: vi.fn(),
			}),
		} as unknown as Sequelize;

		// Create mock session getter
		mockGetSessionFromRequest = vi.fn();

		// Create dependencies
		const deps: OwnerInvitationAcceptRouterDependencies = {
			ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
			verificationDao: mockVerificationDao,
			ownerInvitationDao: mockOwnerInvitationDao,
			globalUserDao: mockGlobalUserDao,
			globalAuthDao: mockGlobalAuthDao,
			userOrgDao: mockUserOrgDao,
			activeUserDaoProvider: mockDaoProvider(mockActiveUserDao),
			spaceDaoProvider: mockDaoProvider(mockSpaceDao),
			registryClient: mockRegistryClient,
			connectionManager: mockConnectionManager,
			managerSequelize: mockManagerSequelize,
			getSessionFromRequest: mockGetSessionFromRequest,
		};

		// Create Express app
		app = express();
		app.use(express.json());
		app.use("/owner-invitation", createOwnerInvitationAcceptRouter(deps));
	});

	describe("GET /validate", () => {
		it("should return error for missing token", async () => {
			const response = await request(app).get("/owner-invitation/validate");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "missing_token",
			});
		});

		it("should return error for invalid JWT token", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(undefined);

			const response = await request(app).get("/owner-invitation/validate?token=invalid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "invalid_token",
			});
		});

		it("should return error when invitation not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "invitation_not_found",
			});
		});

		it("should return error when verification record not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "invalid_token",
			});
		});

		it("should return error for expired token", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue({
				...validVerification,
				expiresAt: new Date(Date.now() - 1000), // Expired
			});

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "expired_token",
			});
		});

		it("should return error for already used token", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue({
				...validVerification,
				usedAt: new Date(),
			});

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "used_token",
			});
		});

		it("should return error when tenant not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "invalid_token",
			});
		});

		it("should return error when org not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue(undefined);

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "invalid_token",
			});
		});

		it("should return valid response for new user", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: true,
				invitation: {
					email: "owner@example.com",
					name: "Test Owner",
					tenantName: "Test Tenant",
					organizationName: "Test Org",
					userExists: false,
				},
			});
		});

		it("should return valid response for existing user", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(true);
			expect(response.body.invitation.userExists).toBe(true);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/owner-invitation/validate?token=valid-token");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({
				valid: false,
				error: "server_error",
			});
		});
	});

	describe("POST /accept-password", () => {
		const validPassword = "SecurePass123!";

		it("should return error for missing fields", async () => {
			const response = await request(app).post("/owner-invitation/accept-password").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "missing_fields",
				message: "Token and password are required",
			});
		});

		it("should return error for invalid JWT token", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "invalid", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invalid_token",
				message: "Invalid invitation link",
			});
		});

		it("should return error for weak password - too short", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: "Short1!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at least 8 characters");
		});

		it("should return error for weak password - too long", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: `${"A".repeat(37)}aaa1!` }); // Over 36 chars

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at most 36 characters");
		});

		it("should return error for password without uppercase", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: "lowercase123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("uppercase");
		});

		it("should return error for password without lowercase", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: "UPPERCASE123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("lowercase");
		});

		it("should return error for password without number", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: "NoNumbers!!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("number");
		});

		it("should return error for password without special character", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: "NoSpecial123" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("special character");
		});

		it("should return error for password containing email", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: "Owner123!@#" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("email address");
		});

		it("should return error when invitation not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invitation_not_found",
				message: "Invitation not found or already used",
			});
		});

		it("should return error when verification not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invitation_not_found",
				message: "Invitation not found or already used",
			});
		});

		it("should return error for expired verification", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue({
				...validVerification,
				expiresAt: new Date(Date.now() - 1000),
			});

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return error when tenant context not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error when org does not belong to tenant", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(mockTenant);
			// Org exists but belongs to different tenant
			vi.mocked(mockRegistryClient.getOrg).mockResolvedValue({
				...mockOrg,
				tenantId: "different-tenant-id",
			});

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error when existing user already has password", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential" }),
			);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.message).toContain("already have an account");
		});

		it("should create new user and return success", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Test Owner" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				tenantSlug: "test-tenant",
			});

			expect(mockGlobalUserDao.createUser).toHaveBeenCalled();
			expect(mockGlobalAuthDao.createAuth).toHaveBeenCalled();
			expect(mockUserOrgDao.createUserOrg).toHaveBeenCalled();
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1);
			expect(mockOwnerInvitationDao.delete).toHaveBeenCalledWith(100);
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "owner_invitation",
				}),
			);
		});

		it("should add password to existing OAuth user", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing OAuth User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(undefined);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockGlobalAuthDao.createAuth).toHaveBeenCalled();
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "owner_invitation",
				}),
			);
		});

		it("should promote existing member to owner when accepting invitation (password flow)", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing OAuth User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(undefined);
			// User already exists in tenant as member
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue({
				id: 1,
				email: "owner@example.com",
				name: "Existing User",
				role: "member",
			} as never);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Should update existing user's role to owner
			expect(mockActiveUserDao.update).toHaveBeenCalledWith(1, { role: "owner" });
			// Should delete verification and invitation records
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1);
			expect(mockOwnerInvitationDao.delete).toHaveBeenCalledWith(100);
			// Active user creation should NOT be called since user exists
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should always set roleId to null (deprecated field)", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Test Owner" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({ roleId: null, role: "owner" }),
				expect.anything(),
			);
		});

		it("should update existing user_org binding to owner role instead of creating", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Test Owner" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);
			// User already has a binding for this org (e.g., as "member")
			vi.mocked(mockUserOrgDao.getOrgsForTenant).mockResolvedValue([
				{ orgId: "org-456", orgSlug: "default", orgName: "Default Org", isDefault: true },
			]);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			// Should succeed by updating instead of creating
			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Should update existing binding's role to "owner"
			expect(mockUserOrgDao.updateRole).toHaveBeenCalledWith(
				1,
				"tenant-123",
				"org-456",
				"owner",
				expect.anything(),
			);
			// Should NOT attempt to create a new binding
			expect(mockUserOrgDao.createUserOrg).not.toHaveBeenCalled();
		});

		it("should handle space creation failure gracefully", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Test Owner" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);
			// Space creation fails
			vi.mocked(mockSpaceDao.createDefaultSpaceIfNeeded).mockRejectedValue(new Error("Space creation failed"));

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			// Should still succeed - space creation failure is not fatal
			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should use parseNameFromEmail when no name is provided", async () => {
			// Use payload without name
			const payloadWithoutName = { ...validPayload, name: null };
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(payloadWithoutName);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: null,
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Owner" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword }); // No name in request

			expect(response.status).toBe(200);
			// User should be created with name derived from email (parseNameFromEmail capitalizes)
			expect(mockGlobalUserDao.createUser).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "owner@example.com",
					name: "Owner", // parseNameFromEmail("owner@example.com") = "Owner" (capitalized)
				}),
				expect.anything(),
			);
		});

		it("should rollback transaction on error during user creation", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockRejectedValue(new Error("DB error"));

			const mockTransaction = {
				commit: vi.fn(),
				rollback: vi.fn(),
			};
			vi.mocked(mockManagerSequelize.transaction).mockResolvedValue(mockTransaction as never);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(500);
			expect(mockTransaction.rollback).toHaveBeenCalled();
		});

		it("should propagate errors from createUserOrg", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Test Owner" }),
			);
			vi.mocked(mockGlobalAuthDao.createAuth).mockResolvedValue(undefined as never);
			// No existing binding (default mock returns [])
			// Throw a database error from createUserOrg
			vi.mocked(mockUserOrgDao.createUserOrg).mockRejectedValue(new Error("Connection timeout"));

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should rollback tenant transaction on error during active user creation", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);
			vi.mocked(mockGlobalUserDao.createUser).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Test Owner" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);
			// Active user creation fails
			vi.mocked(mockActiveUserDao.create).mockRejectedValue(new Error("Tenant DB error"));

			const mockTenantTransaction = {
				commit: vi.fn(),
				rollback: vi.fn(),
			};
			const mockTenantSequelize = {
				transaction: vi.fn().mockResolvedValue(mockTenantTransaction),
			};
			vi.mocked(mockConnectionManager.getConnection).mockResolvedValue({
				sequelize: mockTenantSequelize,
			} as never);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "valid-token", password: validPassword });

			expect(response.status).toBe(500);
			expect(mockTenantTransaction.rollback).toHaveBeenCalled();
		});
	});

	describe("POST /accept-existing-password", () => {
		it("should return error for missing fields", async () => {
			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return error for invalid JWT token", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "invalid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error when user not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error when user has no password auth", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("social login");
		});

		it("should return error for invalid password", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(false);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "WrongPassword123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should accept invitation with valid password for new tenant user", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.tenantSlug).toBe("test-tenant");
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "owner_invitation",
				}),
			);
		});

		it("should promote existing tenant member to owner", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			// User already exists in tenant as member
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue({
				id: 1,
				email: "owner@example.com",
				name: "Existing User",
				role: "member",
			} as never);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Verify user was promoted, not created
			expect(mockActiveUserDao.update).toHaveBeenCalled();
		});

		it("should return error when invitation not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return error when verification not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return error when verification already used", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue({
				...validVerification,
				usedAt: new Date(),
			});

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return error when verification token expired", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue({
				...validVerification,
				expiresAt: new Date(Date.now() - 1000),
			});

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return error when tenant context not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			// Make tenant lookup fail
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 500 on server error", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockImplementation(() => {
				throw new Error("Unexpected error");
			});

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should demote previous owner when accepting invitation", async () => {
			const payloadWithPreviousOwner = {
				...validPayload,
				previousOwnerId: 42,
			};
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(payloadWithPreviousOwner);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: 42,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);
			// Previous owner exists in tenant active_users
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 42,
				email: "previous@example.com",
				name: "Previous Owner",
				role: "owner",
			} as never);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Verify previous owner was demoted in manager DB via updateRole
			expect(mockUserOrgDao.updateRole).toHaveBeenCalledWith(
				42,
				"tenant-123",
				"org-456",
				"member",
				expect.anything(),
			);
			// Verify previous owner was demoted in tenant DB
			expect(mockActiveUserDao.update).toHaveBeenCalledWith(42, { role: "member" });
		});

		it("should handle demotePreviousOwnerInTenant error gracefully", async () => {
			const payloadWithPreviousOwner = {
				...validPayload,
				previousOwnerId: 42,
			};
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(payloadWithPreviousOwner);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: 42,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);
			// Make demotePreviousOwnerInTenant fail (findById throws)
			vi.mocked(mockActiveUserDao.findById).mockRejectedValue(new Error("Tenant DB error"));

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			// Should still succeed - demote in tenant is best-effort
			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should return 500 when demotePreviousOwner fails due to updateRole error", async () => {
			const payloadWithPreviousOwner = {
				...validPayload,
				previousOwnerId: 42,
			};
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(payloadWithPreviousOwner);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: 42,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			// Make updateRole throw to trigger the catch block in demotePreviousOwner
			vi.mocked(mockUserOrgDao.updateRole).mockRejectedValue(new Error("DB connection lost"));

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			// The error should propagate and cause a 500
			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should handle cleanup failure after creating tenant owner", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "Existing User" }),
			);
			vi.mocked(mockGlobalAuthDao.findAuthByUserIdAndProvider).mockResolvedValue(
				mockGlobalAuth({ id: 1, userId: 1, provider: "credential", passwordHash: "hashed-password" }),
			);
			vi.mocked(argon2.verify).mockResolvedValue(true);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);
			// Make Phase 2 cleanup fail
			vi.mocked(mockVerificationDao.deleteVerification).mockRejectedValue(new Error("Cleanup failed"));

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "valid-token", password: "TestPass123!" });

			// Should still succeed - cleanup is best-effort
			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});
	});

	describe("POST /accept-social", () => {
		const mockSession = {
			user: {
				id: "1",
				email: "owner@example.com",
				name: "OAuth User",
			},
		};

		it("should return 401 when not authenticated", async () => {
			mockGetSessionFromRequest.mockResolvedValue(null);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(401);
			expect(response.body.message).toContain("Not authenticated");
		});

		it("should return error for missing token", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);

			const response = await request(app).post("/owner-invitation/accept-social").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return error for invalid JWT token", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error for email mismatch", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "1", email: "different@example.com", name: "Other User" },
			});
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("email_mismatch");
			expect(response.body.message).toContain(validPayload.email);
		});

		it("should return error when invitation not found (OAuth flow)", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return error when verification not found", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return error for expired verification", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue({
				...validVerification,
				expiresAt: new Date(Date.now() - 1000),
			});

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("expired_token");
		});

		it("should accept invitation for OAuth user", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "OAuth User" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				tenantSlug: "test-tenant",
			});

			expect(mockUserOrgDao.createUserOrg).toHaveBeenCalled();
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1);
			expect(mockOwnerInvitationDao.delete).toHaveBeenCalledWith(100);
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "owner_invitation",
				}),
			);
		});

		it("should return error when tenant context not found in OAuth flow", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockRegistryClient.getTenant).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error when global user not found for OAuth user", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			// Global user not found (OAuth should have created it but didn't)
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
			expect(response.body.message).toContain("User account not found");
		});

		it("should promote existing member to owner when accepting invitation (OAuth flow)", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "OAuth User" }),
			);
			// User already exists in tenant as member
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue({
				id: 1,
				email: "owner@example.com",
				name: "Existing User",
				role: "member",
			} as never);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Should update existing user's role to owner
			expect(mockActiveUserDao.update).toHaveBeenCalledWith(1, { role: "owner" });
			// Should delete verification and invitation records
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1);
			expect(mockOwnerInvitationDao.delete).toHaveBeenCalledWith(100);
			// Active user creation should NOT be called
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
		});

		it("should use session name when payload name is null (OAuth flow)", async () => {
			const payloadWithoutName = { ...validPayload, name: null };
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(payloadWithoutName);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: null,
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "owner@example.com", name: "OAuth User" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// User should be created with name from session
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "OAuth User", // from session.user.name
				}),
				expect.anything(),
			);
		});

		it("should handle case-insensitive email matching", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "1", email: "OWNER@EXAMPLE.COM", name: "OAuth User" },
			});
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(
				mockGlobalUser({ id: 1, email: "OWNER@EXAMPLE.COM", name: "OAuth User" }),
			);
			vi.mocked(mockActiveUserDao.findByEmail).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should return 500 on database error", async () => {
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/owner-invitation/accept-social").send({ token: "valid-token" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /decline", () => {
		it("should return error for missing token", async () => {
			const response = await request(app).post("/owner-invitation/decline").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return error for invalid JWT token", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(undefined);

			const response = await request(app).post("/owner-invitation/decline").send({ token: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return error when invitation not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/decline").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return error when verification not found", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).post("/owner-invitation/decline").send({ token: "valid-token" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should decline invitation successfully", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);

			const response = await request(app).post("/owner-invitation/decline").send({ token: "valid-token" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1);
			expect(mockOwnerInvitationDao.delete).toHaveBeenCalledWith(100);
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "decline",
					resourceType: "owner_invitation",
				}),
			);
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("valid-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/owner-invitation/decline").send({ token: "valid-token" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("tokenHash tampering detection", () => {
		// Tests for security-critical tokenHash verification.
		// These tests cover the v8-ignore blocks that detect token tampering.

		it("should return invalid_token when tokenHash mismatches in /validate", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			// Return a DIFFERENT hash than what's stored in verification
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("tampered-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			// Verification record has "valid-token-hash" but hashToken returns "tampered-token-hash"
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);

			const response = await request(app).get("/owner-invitation/validate?token=tampered-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				valid: false,
				error: "invalid_token",
			});
		});

		it("should return invalid_token when tokenHash mismatches in /accept-password", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("tampered-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);

			const response = await request(app)
				.post("/owner-invitation/accept-password")
				.send({ token: "tampered-token", password: "SecurePass123!" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invalid_token",
				message: "Invalid invitation link",
			});
		});

		it("should return invalid_token when tokenHash mismatches in /accept-existing-password", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("tampered-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);

			const response = await request(app)
				.post("/owner-invitation/accept-existing-password")
				.send({ token: "tampered-token", password: "TestPass123!" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invalid_token",
				message: "Invalid invitation link",
			});
		});

		it("should return invalid_token when tokenHash mismatches in /accept-social", async () => {
			const mockSession = {
				user: { id: "1", email: "owner@example.com", name: "OAuth User" },
			};
			mockGetSessionFromRequest.mockResolvedValue(mockSession);
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("tampered-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);

			const response = await request(app)
				.post("/owner-invitation/accept-social")
				.send({ token: "tampered-token" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invalid_token",
				message: "Invalid invitation link",
			});
		});

		it("should return invalid_token when tokenHash mismatches in /decline", async () => {
			vi.mocked(mockOwnerInvitationTokenUtil.verifyToken).mockReturnValue(validPayload);
			vi.mocked(mockOwnerInvitationTokenUtil.hashToken).mockReturnValue("tampered-token-hash");
			vi.mocked(mockOwnerInvitationDao.findById).mockResolvedValue({
				id: 100,
				email: "owner@example.com",
				name: "Test Owner",
				tenantId: "tenant-123",
				orgId: "org-456",
				invitedBy: 1,
				previousOwnerId: null,
				verificationId: 1,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			vi.mocked(mockVerificationDao.findById).mockResolvedValue(validVerification);

			const response = await request(app).post("/owner-invitation/decline").send({ token: "tampered-token" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				success: false,
				error: "invalid_token",
				message: "Invalid invitation link",
			});
		});
	});

	describe("OAuth flow without getSessionFromRequest configured", () => {
		it("should return 500 when getSessionFromRequest is not configured", async () => {
			// Create new app without getSessionFromRequest
			const depsWithoutSession: OwnerInvitationAcceptRouterDependencies = {
				ownerInvitationTokenUtil: mockOwnerInvitationTokenUtil,
				verificationDao: mockVerificationDao,
				ownerInvitationDao: mockOwnerInvitationDao,
				globalUserDao: mockGlobalUserDao,
				globalAuthDao: mockGlobalAuthDao,
				userOrgDao: mockUserOrgDao,
				activeUserDaoProvider: mockDaoProvider(mockActiveUserDao),
				spaceDaoProvider: mockDaoProvider(mockSpaceDao),
				registryClient: mockRegistryClient,
				connectionManager: mockConnectionManager,
				managerSequelize: mockManagerSequelize,
				// getSessionFromRequest is undefined
			};

			const appWithoutSession = express();
			appWithoutSession.use(express.json());
			appWithoutSession.use("/owner-invitation", createOwnerInvitationAcceptRouter(depsWithoutSession));

			const response = await request(appWithoutSession)
				.post("/owner-invitation/accept-social")
				.send({ token: "valid-token" });

			expect(response.status).toBe(500);
			expect(response.body.message).toContain("not configured");
		});
	});
});
