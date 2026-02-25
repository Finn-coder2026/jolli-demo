import { auditLog } from "../audit";
import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { UserInvitationDao } from "../dao/UserInvitationDao";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { VerificationDao } from "../dao/VerificationDao";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { InvitationTokenUtil } from "../util/InvitationTokenUtil";
import { createInvitationAcceptRouter } from "./InvitationAcceptRouter";
import express from "express";
import type { Sequelize } from "sequelize";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../audit", () => ({
	auditLog: vi.fn(),
}));

vi.mock("@node-rs/argon2", async () => {
	const actual = await vi.importActual<typeof import("@node-rs/argon2")>("@node-rs/argon2");
	return {
		...actual,
		verify: vi.fn().mockResolvedValue(true),
	};
});

/**
 * Create a mock transaction object for testing.
 */
function createMockTransaction() {
	return {
		commit: vi.fn().mockResolvedValue(undefined),
		rollback: vi.fn().mockResolvedValue(undefined),
	};
}

/**
 * Create a mock Sequelize instance for testing.
 */
function createMockSequelize() {
	return {
		transaction: vi.fn().mockImplementation(() => Promise.resolve(createMockTransaction())),
	} as unknown as Sequelize;
}

describe("InvitationAcceptRouter", () => {
	let app: express.Application;
	let mockInvitationTokenUtil: {
		verifyToken: ReturnType<typeof vi.fn>;
		hashToken: ReturnType<typeof vi.fn>;
	};
	let mockVerificationDao: {
		findById: ReturnType<typeof vi.fn>;
		deleteVerification: ReturnType<typeof vi.fn>;
	};
	let mockGlobalUserDao: {
		findUserByEmail: ReturnType<typeof vi.fn>;
		createUser: ReturnType<typeof vi.fn>;
	};
	let mockGlobalAuthDao: {
		findAuthByUserIdAndProvider: ReturnType<typeof vi.fn>;
		createAuth: ReturnType<typeof vi.fn>;
	};
	let mockUserOrgDao: {
		createUserOrg: ReturnType<typeof vi.fn>;
	};
	let mockUserInvitationDao: {
		findById: ReturnType<typeof vi.fn>;
		markAccepted: ReturnType<typeof vi.fn>;
	};
	let mockActiveUserDao: {
		findByEmail: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
	};
	let mockGetTenantContextByTenantId: ReturnType<typeof vi.fn>;
	let mockTenantContext: TenantOrgContext;
	let mockManagerSequelize: Sequelize;
	let mockTenantSequelize: Sequelize;

	beforeEach(() => {
		mockInvitationTokenUtil = {
			verifyToken: vi.fn(),
			hashToken: vi.fn(),
		};

		mockVerificationDao = {
			findById: vi.fn(),
			deleteVerification: vi.fn(),
		};

		mockGlobalUserDao = {
			findUserByEmail: vi.fn(),
			createUser: vi.fn(),
		};

		mockGlobalAuthDao = {
			findAuthByUserIdAndProvider: vi.fn(),
			createAuth: vi.fn(),
		};

		mockUserOrgDao = {
			createUserOrg: vi.fn().mockResolvedValue({}),
		};

		mockUserInvitationDao = {
			findById: vi.fn(),
			markAccepted: vi.fn(),
		};

		mockActiveUserDao = {
			findByEmail: vi.fn(),
			create: vi.fn(),
		};

		mockManagerSequelize = createMockSequelize();
		mockTenantSequelize = createMockSequelize();

		mockTenantContext = {
			tenant: { id: "tenant-1", slug: "test-tenant", displayName: "Test Tenant" },
			org: { id: "org-1", schemaName: "org_test", displayName: "Test Org" },
			schemaName: "org_test",
			database: {
				sequelize: mockTenantSequelize,
			} as TenantOrgContext["database"],
		} as TenantOrgContext;

		mockGetTenantContextByTenantId = vi.fn();

		const mockUserInvitationDaoProvider: DaoProvider<UserInvitationDao> = {
			getDao: () => mockUserInvitationDao as unknown as UserInvitationDao,
		};

		const mockActiveUserDaoProvider: DaoProvider<ActiveUserDao> = {
			getDao: () => mockActiveUserDao as unknown as ActiveUserDao,
		};

		app = express();
		app.use(express.json());
		app.use(
			"/api/invitation",
			createInvitationAcceptRouter({
				invitationTokenUtil: mockInvitationTokenUtil as unknown as InvitationTokenUtil,
				verificationDao: mockVerificationDao as unknown as VerificationDao,
				globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
				globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
				userOrgDao: mockUserOrgDao as unknown as UserOrgDao,
				userInvitationDaoProvider: mockUserInvitationDaoProvider,
				activeUserDaoProvider: mockActiveUserDaoProvider,
				getTenantContextByTenantId: mockGetTenantContextByTenantId,
				managerSequelize: mockManagerSequelize,
			}),
		);
	});

	describe("GET /validate", () => {
		it("should return invalid when token is missing", async () => {
			const response = await request(app).get("/api/invitation/validate");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("missing_token");
		});

		it("should return invalid when JWT token is invalid", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue(undefined);

			const response = await request(app).get("/api/invitation/validate?token=invalid-token");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return invalid when verification record not found", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue(null);

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return invalid when token is expired", async () => {
			const expiredDate = new Date();
			expiredDate.setHours(expiredDate.getHours() - 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: expiredDate,
				usedAt: null,
			});

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return invalid when token has been used", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: new Date(),
			});

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("used_token");
		});

		it("should return invalid when tenant not found", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(undefined);

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return invalid when invitation not found", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue(null);

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return invalid when invitation is not pending", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "accepted",
				name: "Test User",
				verificationId: 1,
			});

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("used_token");
		});

		it("should return valid with invitation details", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(true);
			expect(response.body.invitation).toEqual({
				email: "test@example.com",
				role: "member",
				name: "Test User",
				organizationName: "Test Org",
				userExists: false,
				hasCredential: false,
			});
		});

		it("should return userExists and hasCredential for existing user with password", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			// Mock existing user with credential auth
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: "user-123",
				email: "test@example.com",
				name: "Test User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-123",
				userId: "user-123",
				provider: "credential",
				passwordHash: "hashed-password",
			});

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(200);
			expect(response.body.valid).toBe(true);
			expect(response.body.invitation).toEqual({
				email: "test@example.com",
				role: "member",
				name: "Test User",
				organizationName: "Test Org",
				userExists: true,
				hasCredential: true,
			});
		});

		it("should return 500 on server error", async () => {
			mockInvitationTokenUtil.verifyToken.mockImplementation(() => {
				throw new Error("Unexpected error");
			});

			const response = await request(app).get("/api/invitation/validate?token=valid-jwt");

			expect(response.status).toBe(500);
			expect(response.body.valid).toBe(false);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /accept-password", () => {
		// Note: password must not contain the email prefix (e.g., "test" from test@example.com)
		const validPassword = "SecurePass@123";

		it("should return 400 when token is missing", async () => {
			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return 400 when password is missing", async () => {
			const response = await request(app).post("/api/invitation/accept-password").send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return 400 when JWT token is invalid", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "invalid-jwt", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when password is whitespace-only", async () => {
			// Whitespace-only password passes the initial !password check but fails length validation
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "   " });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at least 8");
		});

		it("should return 400 when password is too short", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "Ab@1" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when password is too long", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			// Password > 36 characters (37 chars)
			const longPassword = "Abcdefghijklmnop@12345678901234567890";

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: longPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at most 36");
		});

		it("should return 400 when password lacks uppercase", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "test@1234" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when password lacks lowercase", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "TEST@1234" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when password lacks number", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "Test@abcd" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when password lacks special character", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "Test1234abc" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when password contains email prefix", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "testuser@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: "Testuser@1234" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when verification record not found", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when token is expired", async () => {
			const expiredDate = new Date();
			expiredDate.setHours(expiredDate.getHours() - 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: expiredDate,
				usedAt: null,
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return 400 when token has been used", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: new Date(),
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("used_token");
		});

		it("should return 409 when user already exists with password", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Existing User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: 1,
				userId: 1,
				provider: "credential",
				passwordHash: "existing-hash",
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(409);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("user_exists");
		});

		it("should create new user and accept invitation", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);
			mockGlobalUserDao.createUser.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "Test User",
			});
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword, name: "Custom Name" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockGlobalUserDao.createUser).toHaveBeenCalled();
			expect(mockGlobalAuthDao.createAuth).toHaveBeenCalled();
			expect(mockActiveUserDao.create).toHaveBeenCalled();
			expect(mockUserInvitationDao.markAccepted).toHaveBeenCalledWith(1, expect.anything());
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1, expect.anything());
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "user_invitation",
				}),
			);
		});

		it("should add password to existing OAuth user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "OAuth User",
			});
			// No credential auth - OAuth user only
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockGlobalUserDao.createUser).not.toHaveBeenCalled();
			expect(mockGlobalAuthDao.createAuth).toHaveBeenCalled();
			expect(mockActiveUserDao.create).toHaveBeenCalled();
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "user_invitation",
				}),
			);
		});

		it("should return 500 on server error", async () => {
			mockInvitationTokenUtil.verifyToken.mockImplementation(() => {
				throw new Error("Unexpected error");
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should return 400 when tenant context is not found", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when invitation is not found or not pending", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "accepted", // Not pending
				name: "Test User",
				verificationId: 1,
			});

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should rollback tenant transaction when error occurs for existing OAuth user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "OAuth User",
			});
			// No credential auth - OAuth user only
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			// Force error during tenant transaction to trigger rollback
			mockActiveUserDao.create.mockRejectedValue(new Error("Tenant database error"));
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should rollback manager transaction when error occurs for new user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);
			// Force error during manager transaction to trigger rollback
			mockGlobalUserDao.createUser.mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should rollback tenant transaction when error occurs creating tenant user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);
			mockGlobalUserDao.createUser.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "Test User",
			});
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);
			// Force error during tenant transaction (createTenantUserAndAcceptInvitation)
			mockActiveUserDao.create.mockRejectedValue(new Error("Tenant database error"));

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should handle user_orgs unique constraint violation gracefully", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "OAuth User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			// Simulate unique constraint violation for user_orgs (binding already exists)
			const uniqueConstraintError = new Error("Unique constraint violation") as Error & {
				name: string;
				parent?: { code?: string };
			};
			uniqueConstraintError.name = "SequelizeUniqueConstraintError";
			mockUserOrgDao.createUserOrg.mockRejectedValue(uniqueConstraintError);
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should handle user_orgs unique constraint violation with postgres code", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "OAuth User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			// Simulate unique constraint violation using postgres error code
			const postgresUniqueError = new Error("Unique constraint violation") as Error & {
				name: string;
				parent?: { code?: string };
			};
			postgresUniqueError.name = "SomeOtherError";
			postgresUniqueError.parent = { code: "23505" }; // Postgres unique violation code
			mockUserOrgDao.createUserOrg.mockRejectedValue(postgresUniqueError);
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should always set roleId to null (deprecated field)", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "admin",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);
			mockGlobalUserDao.createUser.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "Test User",
			});
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({ roleId: null, role: "admin" }),
				expect.anything(),
			);
		});

		it("should skip creating active user when OAuth user already exists in tenant", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "OAuth User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			// User already exists in tenant
			mockActiveUserDao.findByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "Existing User",
			});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Should not create a new active user since one already exists
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
		});

		it("should use existing user name as fallback for OAuth user when no request name or invitation name is provided", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: null, // No name on invitation
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "OAuth User Name",
			});
			// No credential auth - OAuth user only
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				// No name provided in request, invitation.name is null, so falls through to existingUser.name
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Name should fall through to existingUser.name
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "OAuth User Name" }),
				expect.anything(),
			);
		});

		it("should use email prefix as fallback name when no name is provided", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "testuser@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "testuser@example.com",
				status: "pending",
				name: null, // No name on invitation
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);
			mockGlobalUserDao.createUser.mockResolvedValue({
				id: 99,
				email: "testuser@example.com",
				name: "testuser",
			});
			mockGlobalAuthDao.createAuth.mockResolvedValue({});
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);

			const response = await request(app)
				.post("/api/invitation/accept-password")
				// No name provided in request
				.send({ token: "valid-jwt", password: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Name should be derived from email prefix
			expect(mockGlobalUserDao.createUser).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Testuser" }),
				expect.anything(),
			);
		});
	});

	describe("POST /accept-social", () => {
		let appWithOAuth: express.Application;
		let mockGetSessionFromRequest: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			mockGetSessionFromRequest = vi.fn();

			const mockUserInvitationDaoProvider: DaoProvider<UserInvitationDao> = {
				getDao: () => mockUserInvitationDao as unknown as UserInvitationDao,
			};

			const mockActiveUserDaoProvider: DaoProvider<ActiveUserDao> = {
				getDao: () => mockActiveUserDao as unknown as ActiveUserDao,
			};

			appWithOAuth = express();
			appWithOAuth.use(express.json());
			appWithOAuth.use(
				"/api/invitation",
				createInvitationAcceptRouter({
					invitationTokenUtil: mockInvitationTokenUtil as unknown as InvitationTokenUtil,
					verificationDao: mockVerificationDao as unknown as VerificationDao,
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					userOrgDao: mockUserOrgDao as unknown as UserOrgDao,
					userInvitationDaoProvider: mockUserInvitationDaoProvider,
					activeUserDaoProvider: mockActiveUserDaoProvider,
					getTenantContextByTenantId: mockGetTenantContextByTenantId,
					getSessionFromRequest: mockGetSessionFromRequest,
					managerSequelize: mockManagerSequelize,
				}),
			);
		});

		it("should return 500 when getSessionFromRequest is not configured", async () => {
			// Use the original app without OAuth support
			const response = await request(app).post("/api/invitation/accept-social").send({ token: "valid-jwt" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
			expect(response.body.message).toContain("not configured");
		});

		it("should return 401 when no authenticated session", async () => {
			mockGetSessionFromRequest.mockResolvedValue(null);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(401);
			expect(response.body.success).toBe(false);
			expect(response.body.message).toContain("Not authenticated");
		});

		it("should return 400 when token is missing", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});

			const response = await request(appWithOAuth).post("/api/invitation/accept-social").send({});

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return 400 when JWT token is invalid", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue(undefined);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "invalid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when email does not match invitation", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "different@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("email_mismatch");
			expect(response.body.message).toContain("test@example.com");
		});

		it("should return 400 when verification record not found", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue(null);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when token is expired", async () => {
			const expiredDate = new Date();
			expiredDate.setHours(expiredDate.getHours() - 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: expiredDate,
				usedAt: null,
			});

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("expired_token");
		});

		it("should return 400 when token has been used", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: new Date(),
			});

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("used_token");
		});

		it("should return 400 when tenant not found", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(null);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when invitation not found", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue(null);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invitation_not_found");
		});

		it("should return 500 when global user not found", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should successfully accept invitation for new tenant user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "OAuth User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Invited User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "OAuth User",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockActiveUserDao.create).toHaveBeenCalled();
			expect(mockUserInvitationDao.markAccepted).toHaveBeenCalledWith(1, expect.anything());
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1, expect.anything());
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "user_invitation",
				}),
			);
		});

		it("should successfully accept invitation for existing tenant user", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "OAuth User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Invited User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "OAuth User",
			});
			// User already exists in tenant
			mockActiveUserDao.findByEmail.mockResolvedValue({
				id: 99,
				email: "test@example.com",
			});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockActiveUserDao.create).not.toHaveBeenCalled();
			expect(mockUserInvitationDao.markAccepted).toHaveBeenCalledWith(1, expect.anything());
			expect(mockVerificationDao.deleteVerification).toHaveBeenCalledWith(1, expect.anything());
		});

		it("should handle case-insensitive email matching", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "TEST@EXAMPLE.COM", name: "OAuth User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Invited User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 99,
				email: "TEST@EXAMPLE.COM",
				name: "OAuth User",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should return 500 on server error", async () => {
			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "Test User" },
			});
			mockInvitationTokenUtil.verifyToken.mockImplementation(() => {
				throw new Error("Unexpected error");
			});

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should rollback manager transaction on error and return 500", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "OAuth User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Invited User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "OAuth User",
			});
			// Force error during manager transaction to trigger rollback
			mockUserOrgDao.createUserOrg.mockRejectedValue(new Error("Database error"));

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should rollback tenant transaction on error and return 500", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "test@example.com", name: "OAuth User" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Invited User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 99,
				email: "test@example.com",
				name: "OAuth User",
			});
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			// Force error during tenant transaction to trigger rollback
			mockActiveUserDao.create.mockRejectedValue(new Error("Tenant database error"));

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should use fallback name when invitation name and session name are missing", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockGetSessionFromRequest.mockResolvedValue({
				user: { id: "user-1", email: "testuser@example.com", name: "" },
			});
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "testuser@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "testuser@example.com",
				status: "pending",
				name: null, // No name on invitation
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 99,
				email: "testuser@example.com",
				name: "OAuth User",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(appWithOAuth)
				.post("/api/invitation/accept-social")
				.send({ token: "valid-jwt" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// The fallback name should be derived from email prefix
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Testuser" }),
				expect.anything(),
			);
		});
	});

	describe("POST /accept-existing-password", () => {
		it("should return 400 when token is missing", async () => {
			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ password: "ValidPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should accept invitation when password is valid", async () => {
			const { verify } = await import("@node-rs/argon2");
			vi.mocked(verify).mockResolvedValueOnce(true);

			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "Existing User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: 99,
				userId: 50,
				provider: "credential",
				passwordHash: "hashed-password",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockUserInvitationDao.markAccepted).toHaveBeenCalledWith(1, expect.anything());
			expect(auditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "accept",
					resourceType: "user_invitation",
				}),
			);
		});

		it("should use existing user name as fallback when invitation name is null", async () => {
			const { verify } = await import("@node-rs/argon2");
			vi.mocked(verify).mockResolvedValueOnce(true);

			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: null, // No name on invitation
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "Existing User Fallback",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: 99,
				userId: 50,
				provider: "credential",
				passwordHash: "hashed-password",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Name should fall through to existingUser.name since invitation.name is null
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Existing User Fallback" }),
				expect.anything(),
			);
		});

		it("should use email prefix as fallback when both invitation name and user name are falsy", async () => {
			const { verify } = await import("@node-rs/argon2");
			vi.mocked(verify).mockResolvedValueOnce(true);

			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "testuser@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "testuser@example.com",
				status: "pending",
				name: null, // No name on invitation
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "testuser@example.com",
				name: "", // Empty name on existing user
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: 99,
				userId: 50,
				provider: "credential",
				passwordHash: "hashed-password",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockUserInvitationDao.markAccepted.mockResolvedValue(true);
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Name should fall through to parseNameFromEmail since both invitation.name and existingUser.name are falsy
			expect(mockActiveUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Testuser" }),
				expect.anything(),
			);
		});

		it("should return 400 when password is invalid", async () => {
			const { verify } = await import("@node-rs/argon2");
			vi.mocked(verify).mockResolvedValueOnce(false);

			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "Existing User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: 99,
				userId: 50,
				provider: "credential",
				passwordHash: "hashed-password",
			});

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "WrongPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when no password auth exists", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "Existing User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 500 when tenant transaction fails", async () => {
			const { verify } = await import("@node-rs/argon2");
			vi.mocked(verify).mockResolvedValueOnce(true);

			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			mockGlobalUserDao.findUserByEmail.mockResolvedValue({
				id: 50,
				email: "test@example.com",
				name: "Existing User",
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: 99,
				userId: 50,
				provider: "credential",
				passwordHash: "hashed-password",
			});
			mockActiveUserDao.findByEmail.mockResolvedValue(null);
			mockActiveUserDao.create.mockResolvedValue({});
			mockVerificationDao.deleteVerification.mockResolvedValue(undefined);
			// Make markAccepted throw an error to trigger tenant transaction rollback
			mockUserInvitationDao.markAccepted.mockRejectedValueOnce(new Error("Database error"));

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should return 500 when unexpected error occurs", async () => {
			// Make verifyToken throw an unexpected error
			mockInvitationTokenUtil.verifyToken.mockImplementationOnce(() => {
				throw new Error("Unexpected error");
			});

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(500);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("server_error");
		});

		it("should return 400 when JWT token is invalid or expired", async () => {
			// Return null to simulate invalid/expired token
			mockInvitationTokenUtil.verifyToken.mockReturnValue(null);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "invalid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when tenant context is not found", async () => {
			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "nonexistent-tenant",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			// Return null to simulate tenant not found
			mockGetTenantContextByTenantId.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});

		it("should return 400 when invitation validation fails", async () => {
			const pastDate = new Date();
			pastDate.setHours(pastDate.getHours() - 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			// Return expired verification to trigger validation failure
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: pastDate,
				usedAt: null,
			});

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
		});

		it("should return 400 when user does not exist", async () => {
			const futureDate = new Date();
			futureDate.setHours(futureDate.getHours() + 1);

			mockInvitationTokenUtil.verifyToken.mockReturnValue({
				email: "test@example.com",
				tenantId: "tenant-1",
				orgId: "org-1",
				invitationId: 1,
				role: "member",
			});
			mockInvitationTokenUtil.hashToken.mockReturnValue("hashed-token");
			mockGetTenantContextByTenantId.mockResolvedValue(mockTenantContext);
			mockUserInvitationDao.findById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				status: "pending",
				name: "Test User",
				verificationId: 1,
			});
			mockVerificationDao.findById.mockResolvedValue({
				id: 1,
				tokenHash: "hashed-token",
				expiresAt: futureDate,
				usedAt: null,
			});
			// Return null to simulate user not found
			mockGlobalUserDao.findUserByEmail.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/invitation/accept-existing-password")
				.send({ token: "valid-jwt", password: "ValidPass123!" });

			expect(response.status).toBe(400);
			expect(response.body.success).toBe(false);
			expect(response.body.error).toBe("invalid_token");
		});
	});
});
