import { mockActiveUserDao } from "../dao/ActiveUserDao.mock";
import { mockArchivedUserDao } from "../dao/ArchivedUserDao.mock";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { RoleDao } from "../dao/RoleDao";
import { mockSpaceDao } from "../dao/SpaceDao.mock";
import { mockUserInvitationDao } from "../dao/UserInvitationDao.mock";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { VerificationDao } from "../dao/VerificationDao";
import { mockActiveUser } from "../model/ActiveUser.mock";
import { mockArchivedUser } from "../model/ArchivedUser.mock";
import { mockRole } from "../model/Role.mock";
import { mockUserInvitation } from "../model/UserInvitation.mock";
import { sendInvitationEmail } from "../util/EmailService";
import type { InvitationTokenUtil } from "../util/InvitationTokenUtil";
import type { TokenUtil } from "../util/TokenUtil";
import { createUserManagementRouter, type UserManagementRouterDependencies } from "./UserManagementRouter";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock tenant context
vi.mock("../tenant/TenantContext", () => {
	const mockContext = {
		tenant: { id: "test-tenant-id" },
		org: { id: "test-org-id", displayName: "Test Organization" },
	};
	return {
		getTenantContext: vi.fn(() => mockContext),
	};
});

// Mock EmailService
vi.mock("../util/EmailService", () => ({
	sendInvitationEmail: vi.fn(() => Promise.resolve()),
}));

// Mock Config
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		AUTH_EMAILS: ".*",
	})),
}));

// Mock AuthHandler - by default allow all emails
vi.mock("../util/AuthHandler", () => ({
	isEmailAuthorized: vi.fn(() => true),
}));

// Mock RateLimitService - must mock the entire module including Redis dependency
// Use shared mock state to control behavior in tests
const mockRateLimitState = {
	checkResult: { allowed: true, current: 0, limit: 3, remaining: 3, resetInSeconds: 3600 },
};
vi.mock("../services/RateLimitService", () => {
	class MockRateLimitService {
		checkInvitationEmailLimit = vi.fn().mockImplementation(() => Promise.resolve(mockRateLimitState.checkResult));
		recordInvitationEmail = vi
			.fn()
			.mockResolvedValue({ allowed: true, current: 1, limit: 3, remaining: 2, resetInSeconds: 3600 });
		createRateLimitError = vi.fn().mockReturnValue("Too many requests");
	}
	return {
		RateLimitService: MockRateLimitService,
		RATE_LIMIT_CONFIGS: {
			EMAIL_INVITATION: { maxAttempts: 3, windowSeconds: 3600, resourceName: "invitation email" },
		},
	};
});

describe("UserManagementRouter", () => {
	let app: express.Application;
	let activeUserDao: ReturnType<typeof mockActiveUserDao>;
	let archivedUserDao: ReturnType<typeof mockArchivedUserDao>;
	let userInvitationDao: ReturnType<typeof mockUserInvitationDao>;
	let roleDao: RoleDao;
	let verificationDao: VerificationDao;
	let userOrgDao: UserOrgDao;
	let globalUserDao: GlobalUserDao;
	let tokenUtil: TokenUtil<UserInfo>;
	let invitationTokenUtil: InvitationTokenUtil;
	let mockDeps: UserManagementRouterDependencies;

	beforeEach(() => {
		activeUserDao = mockActiveUserDao();
		archivedUserDao = mockArchivedUserDao();
		userInvitationDao = mockUserInvitationDao();

		roleDao = {
			listAll: vi
				.fn()
				.mockResolvedValue([
					mockRole({ id: 1, name: "Owner", slug: "owner", priority: 100 }),
					mockRole({ id: 2, name: "Admin", slug: "admin", priority: 80 }),
					mockRole({ id: 3, name: "Member", slug: "member", priority: 50 }),
				]),
			findById: vi.fn().mockResolvedValue(mockRole()),
			findBySlug: vi.fn().mockImplementation((slug: string) => {
				const roles: Record<string, ReturnType<typeof mockRole>> = {
					owner: mockRole({ id: 1, name: "Owner", slug: "owner", priority: 100 }),
					admin: mockRole({ id: 2, name: "Admin", slug: "admin", priority: 80 }),
					member: mockRole({ id: 3, name: "Member", slug: "member", priority: 50 }),
				};
				return Promise.resolve(roles[slug] || undefined);
			}),
			getRoleWithPermissions: vi.fn().mockResolvedValue(undefined),
			getRoleWithPermissionsBySlug: vi.fn().mockResolvedValue(undefined),
			create: vi.fn().mockResolvedValue(mockRole()),
			update: vi.fn().mockResolvedValue(mockRole()),
			delete: vi.fn().mockResolvedValue(true),
			getPermissions: vi.fn().mockResolvedValue([]),
			setPermissions: vi.fn().mockResolvedValue(undefined),
			cloneRole: vi.fn().mockResolvedValue(mockRole()),
			getDefaultRole: vi.fn().mockResolvedValue(mockRole({ id: 3, slug: "member", isDefault: true })),
		};

		verificationDao = {
			createVerification: vi.fn().mockResolvedValue({ id: 1 }),
			findById: vi.fn().mockResolvedValue(undefined),
			findByTokenHash: vi.fn().mockResolvedValue(undefined),
			findByResetPasswordToken: vi.fn().mockResolvedValue(undefined),
			markAsUsed: vi.fn().mockResolvedValue(undefined),
			deleteVerification: vi.fn().mockResolvedValue(undefined),
			deleteExpiredOrUsed: vi.fn().mockResolvedValue(0),
			deleteByIdentifierAndType: vi.fn().mockResolvedValue(1),
		};

		tokenUtil = {
			generateToken: vi.fn().mockReturnValue("jwt-token"),
			decodePayload: vi.fn().mockReturnValue({
				userId: 1,
				email: "inviter@example.com",
				name: "Inviter",
				picture: undefined,
			}),
			decodePayloadFromToken: vi.fn().mockReturnValue({
				userId: 1,
				email: "inviter@example.com",
				name: "Inviter",
				picture: undefined,
			}),
		};

		invitationTokenUtil = {
			generateToken: vi.fn().mockReturnValue({
				token: "invitation-jwt-token",
				tokenHash: "test-token-hash",
				jti: "test-jti",
			}),
			verifyToken: vi.fn().mockReturnValue(undefined),
			hashToken: vi.fn().mockReturnValue("test-token-hash"),
		};

		// Mock userOrgDao - default: user belongs to one tenant
		userOrgDao = {
			getUserOrgs: vi.fn().mockResolvedValue([]),
			getUserTenants: vi.fn().mockResolvedValue([]),
			getUniqueTenants: vi.fn().mockResolvedValue([]),
			getOrgsForTenant: vi.fn().mockResolvedValue([]),
			createUserOrg: vi.fn().mockResolvedValue({ userId: 1, tenantId: "test-tenant-id", orgId: "test-org-id" }),
			updateLastAccessed: vi.fn().mockResolvedValue(undefined),
			setDefaultTenant: vi.fn().mockResolvedValue(undefined),
			deleteUserOrg: vi.fn().mockResolvedValue(undefined),
			updateRole: vi.fn().mockResolvedValue(undefined),
		};

		// Mock globalUserDao
		globalUserDao = {
			findUserByEmail: vi.fn().mockResolvedValue(undefined),
			findUserById: vi.fn().mockResolvedValue({ id: 1, email: "test@example.com", name: "Test User" }),
			createUser: vi.fn().mockResolvedValue({ id: 1, email: "test@example.com", name: "Test User" }),
			updateUser: vi.fn().mockResolvedValue(undefined),
			deleteUser: vi.fn().mockResolvedValue(undefined),
			updateUserEmail: vi.fn().mockResolvedValue(undefined),
		};

		// Mock permission middleware - no-op passthrough for tests
		const mockPermissionMiddleware = {
			requireAuth: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
			requirePermission: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
			requireAllPermissions: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
			requireRole: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
			loadPermissions: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
		};

		const mockPermissionService = {
			hasPermission: vi.fn().mockResolvedValue(false),
			hasAnyPermission: vi.fn().mockResolvedValue(false),
		};

		mockDeps = {
			activeUserDaoProvider: { getDao: () => activeUserDao },
			archivedUserDaoProvider: { getDao: () => archivedUserDao },
			userInvitationDaoProvider: { getDao: () => userInvitationDao },
			roleDaoProvider: { getDao: () => roleDao },
			verificationDao,
			tokenUtil,
			invitationTokenUtil,
			permissionMiddleware: mockPermissionMiddleware as never,
			permissionService: mockPermissionService as never,
			getInvitationExpirySeconds: vi.fn().mockReturnValue(7 * 24 * 60 * 60),
			getOrigin: vi.fn().mockReturnValue("http://localhost:3000"),
			userOrgDao,
			globalUserDao,
			spaceDaoProvider: { getDao: () => mockSpaceDao() },
		};

		app = express();
		app.use(express.json());
		app.use("/user-management", createUserManagementRouter(mockDeps));
	});

	describe("GET /active", () => {
		it("should return all users (including deactivated) with pagination", async () => {
			const users = [mockActiveUser({ id: 1 }), mockActiveUser({ id: 2, isActive: false })];
			vi.mocked(activeUserDao.listAll).mockResolvedValue(users);
			vi.mocked(activeUserDao.countAll).mockResolvedValue(2);

			const response = await request(app).get("/user-management/active?limit=10&offset=0");

			expect(response.status).toBe(200);
			expect(response.body.data).toHaveLength(2);
			expect(response.body.total).toBe(2);
			expect(activeUserDao.listAll).toHaveBeenCalledWith({ limit: 10, offset: 0 });
		});

		it("should use default pagination when not provided", async () => {
			vi.mocked(activeUserDao.listAll).mockResolvedValue([]);
			vi.mocked(activeUserDao.countAll).mockResolvedValue(0);

			const response = await request(app).get("/user-management/active");

			expect(response.status).toBe(200);
			expect(activeUserDao.listAll).toHaveBeenCalledWith({ limit: 20, offset: 0 });
		});

		it("should cap limit at 100", async () => {
			vi.mocked(activeUserDao.listAll).mockResolvedValue([]);
			vi.mocked(activeUserDao.countAll).mockResolvedValue(0);

			const response = await request(app).get("/user-management/active?limit=500");

			expect(response.status).toBe(200);
			expect(activeUserDao.listAll).toHaveBeenCalledWith({ limit: 100, offset: 0 });
		});

		it("should handle errors", async () => {
			vi.mocked(activeUserDao.listAll).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/user-management/active");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list active users" });
		});
	});

	describe("GET /pending", () => {
		it("should return pending invitations with pagination", async () => {
			const invitations = [mockUserInvitation({ id: 1 }), mockUserInvitation({ id: 2 })];
			vi.mocked(userInvitationDao.listPending).mockResolvedValue(invitations);
			vi.mocked(userInvitationDao.countPending).mockResolvedValue(2);

			const response = await request(app).get("/user-management/pending?limit=10&offset=5");

			expect(response.status).toBe(200);
			expect(response.body.data).toHaveLength(2);
			expect(response.body.total).toBe(2);
			expect(userInvitationDao.listPending).toHaveBeenCalledWith({ limit: 10, offset: 5 });
		});

		it("should handle errors", async () => {
			vi.mocked(userInvitationDao.listPending).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/user-management/pending");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list pending invitations" });
		});
	});

	describe("GET /archived", () => {
		it("should return archived users with pagination", async () => {
			const archived = [mockArchivedUser({ id: 1 }), mockArchivedUser({ id: 2 })];
			vi.mocked(archivedUserDao.listAll).mockResolvedValue(archived);
			vi.mocked(archivedUserDao.count).mockResolvedValue(2);

			const response = await request(app).get("/user-management/archived?limit=15&offset=10");

			expect(response.status).toBe(200);
			expect(response.body.data).toHaveLength(2);
			expect(response.body.total).toBe(2);
			expect(archivedUserDao.listAll).toHaveBeenCalledWith({ limit: 15, offset: 10 });
		});

		it("should handle errors", async () => {
			vi.mocked(archivedUserDao.listAll).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/user-management/archived");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list archived users" });
		});
	});

	describe("POST /invite", () => {
		it("should create a new invitation and send email", async () => {
			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "new@example.com", name: "New User", role: "member" });

			expect(response.status).toBe(201);
			expect(response.body.email).toBe("new@example.com");
			expect(userInvitationDao.create).toHaveBeenCalledWith(
				expect.objectContaining({
					email: "new@example.com",
					name: "New User",
					role: "member",
					status: "pending",
					invitedBy: 1,
					verificationId: null,
				}),
			);
			expect(invitationTokenUtil.generateToken).toHaveBeenCalled();
			// Verification is created to get verification ID (tokenHash stored in verification record)
			expect(verificationDao.createVerification).toHaveBeenCalledWith(
				expect.objectContaining({
					identifier: "new@example.com",
					tokenHash: "test-token-hash",
					type: "invitation",
				}),
			);
			// Invitation is updated with verification ID
			expect(userInvitationDao.updateVerificationId).toHaveBeenCalledWith(1, 1);
		});

		it("should include tenant slug prefix in invitation URL for path-based mode", async () => {
			vi.mocked(sendInvitationEmail).mockClear();
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				AUTH_EMAILS: ".*",
				BASE_DOMAIN: "jolli-local.me",
			} as ReturnType<typeof getConfig>);

			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			// Path-based: Host matches BASE_DOMAIN, tenant slug in header
			const response = await request(app)
				.post("/user-management/invite")
				.set("Host", "jolli-local.me")
				.set("X-Tenant-Slug", "acme")
				.send({ email: "new@example.com", name: "New User", role: "member" });

			expect(response.status).toBe(201);
			expect(sendInvitationEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					invitationUrl: expect.stringContaining("/acme/invite/accept?token="),
				}),
			);
		});

		it("should not include tenant slug prefix in invitation URL for subdomain mode", async () => {
			vi.mocked(sendInvitationEmail).mockClear();
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				AUTH_EMAILS: ".*",
				BASE_DOMAIN: "jolli-local.me",
			} as ReturnType<typeof getConfig>);

			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			// Subdomain mode: Host is tenant.baseDomain, slug also sent in header
			const response = await request(app)
				.post("/user-management/invite")
				.set("Host", "main.jolli-local.me")
				.set("X-Tenant-Slug", "main")
				.send({ email: "new@example.com", name: "New User", role: "member" });

			expect(response.status).toBe(201);
			// In subdomain mode, tenant is already in the hostname — no slug prefix in URL
			const callArgs = vi.mocked(sendInvitationEmail).mock.calls[0][0];
			expect(callArgs.invitationUrl).toMatch(/\/invite\/accept\?token=/);
			expect(callArgs.invitationUrl).not.toMatch(/\/main\/invite\/accept/);
		});

		it("should return 401 if not authenticated", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Authentication required" });
		});

		it("should reject if email is missing", async () => {
			const response = await request(app).post("/user-management/invite").send({ role: "member" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "email is required" });
		});

		it("should reject if role is missing", async () => {
			const response = await request(app).post("/user-management/invite").send({ email: "test@example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "role is required" });
		});

		it("should reject invalid role", async () => {
			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "test@example.com", role: "invalid" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role: invalid" });
			expect(roleDao.findBySlug).toHaveBeenCalledWith("invalid");
		});

		it("should reject if user already exists", async () => {
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(mockActiveUser({ email: "existing@example.com" }));

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "existing@example.com", role: "member" });

			expect(response.status).toBe(409);
			expect(response.body).toEqual({ error: "User with this email already exists" });
		});

		it("should reject if pending invitation exists", async () => {
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(
				mockUserInvitation({ email: "pending@example.com" }),
			);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "pending@example.com", role: "member" });

			expect(response.status).toBe(409);
			expect(response.body).toEqual({ error: "Pending invitation for this email already exists" });
		});

		it("should reject email that does not match authorized patterns", async () => {
			// Import the mock to control it
			const { isEmailAuthorized } = await import("../util/AuthHandler");
			vi.mocked(isEmailAuthorized).mockReturnValue(false);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "unauthorized@external.com", role: "member" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				error: "Email does not match authorized patterns for this organization",
			});

			// Restore default behavior for other tests
			vi.mocked(isEmailAuthorized).mockReturnValue(true);
		});

		it("should return 429 when rate limit is exceeded", async () => {
			// Modify the shared mock state to simulate rate limit exceeded
			mockRateLimitState.checkResult = {
				allowed: false,
				current: 3,
				limit: 3,
				remaining: 0,
				resetInSeconds: 3600,
			};

			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "rate-limited@example.com", role: "member" });

			expect(response.status).toBe(429);
			expect(response.body).toEqual({ error: "Too many requests" });

			// Reset the mock state for other tests
			mockRateLimitState.checkResult = {
				allowed: true,
				current: 0,
				limit: 3,
				remaining: 3,
				resetInSeconds: 3600,
			};
		});

		it("should return 500 when tenant context is not available", async () => {
			const { getTenantContext } = await import("../tenant/TenantContext");
			// Mock to return null on first call (explicit tenant context check at start of handler)
			vi.mocked(getTenantContext).mockReturnValueOnce(null as never);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Tenant context not available" });
		});

		it("should handle errors and return 500", async () => {
			vi.mocked(activeUserDao.findByEmail).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to create invitation" });
		});

		it("should use currentUser name when inviter record is not found", async () => {
			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			// Simulate inviter not found - falls back to currentUser.name
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(201);
			// The inviterName should fall back to currentUser.name ("Inviter")
		});

		it("should use currentUser email when both inviter and currentUser name are unavailable", async () => {
			// Temporarily change tokenUtil to return user without name (empty string)
			vi.mocked(tokenUtil.decodePayload).mockReturnValueOnce({
				userId: 1,
				email: "inviter@example.com",
				name: "", // Empty string to trigger fallback to email
				picture: undefined,
			});

			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			// Simulate inviter not found - falls back to currentUser.email
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.post("/user-management/invite")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(201);
			// The inviterName should fall back to currentUser.email ("inviter@example.com")
		});

		it("should use request origin header when available", async () => {
			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			const response = await request(app)
				.post("/user-management/invite")
				.set("Origin", "https://custom-origin.example.com")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(201);
		});

		it("should use host header when origin is not available", async () => {
			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			const response = await request(app)
				.post("/user-management/invite")
				.set("Host", "custom-host.example.com")
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(201);
		});

		it("should fall back to configured origin when neither origin nor host headers are available", async () => {
			const invitation = mockUserInvitation({ id: 1, email: "new@example.com", role: "member" });
			vi.mocked(activeUserDao.findByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.findPendingByEmail).mockResolvedValue(undefined);
			vi.mocked(userInvitationDao.create).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			const response = await request(app)
				.post("/user-management/invite")
				.set("Host", "") // Empty host header to trigger fallback
				.send({ email: "new@example.com", role: "member" });

			expect(response.status).toBe(201);
		});
	});

	describe("GET /config", () => {
		it("should return authorized email patterns", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				AUTH_EMAILS: "@example\\.com$,@company\\.org$",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/user-management/config");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				authorizedEmailPatterns: "@example\\.com$,@company\\.org$",
			});
		});

		it("should return wildcard pattern when all emails are allowed", async () => {
			const { getConfig } = await import("../config/Config");
			vi.mocked(getConfig).mockReturnValue({
				AUTH_EMAILS: "*",
			} as ReturnType<typeof getConfig>);

			const response = await request(app).get("/user-management/config");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				authorizedEmailPatterns: "*",
			});
		});
	});

	describe("DELETE /invitation/:id", () => {
		it("should delete an invitation and clean up verification", async () => {
			const invitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				verificationId: 100,
			});
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.delete).mockResolvedValue(true);

			const response = await request(app).delete("/user-management/invitation/1");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			// Verification cleanup uses verificationId
			expect(verificationDao.deleteVerification).toHaveBeenCalledWith(100);
			expect(userInvitationDao.delete).toHaveBeenCalledWith(1);
		});

		it("should delete an invitation without verification cleanup if verificationId is null", async () => {
			const invitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				verificationId: null,
			});
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.delete).mockResolvedValue(true);

			const response = await request(app).delete("/user-management/invitation/1");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			// Should not attempt to delete verification if verificationId is null
			expect(verificationDao.deleteVerification).not.toHaveBeenCalled();
			expect(userInvitationDao.delete).toHaveBeenCalledWith(1);
		});

		it("should return 404 if invitation not found", async () => {
			vi.mocked(userInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).delete("/user-management/invitation/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Invitation not found" });
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).delete("/user-management/invitation/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid invitation ID" });
		});

		it("should return 404 when delete returns false after invitation was found", async () => {
			const invitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				verificationId: 100,
			});
			vi.mocked(userInvitationDao.findById).mockResolvedValue(invitation);
			vi.mocked(userInvitationDao.delete).mockResolvedValue(false);

			const response = await request(app).delete("/user-management/invitation/1");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Invitation not found" });
		});

		it("should handle errors and return 500", async () => {
			vi.mocked(userInvitationDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/user-management/invitation/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete invitation" });
		});
	});

	describe("POST /invitation/:id/resend", () => {
		it("should resend an invitation with new token and send email", async () => {
			const existingInvitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				status: "pending",
				invitedBy: 1,
				verificationId: 50,
			});
			const newInvitation = mockUserInvitation({
				id: 2,
				email: "test@example.com",
				verificationId: 51,
			});
			vi.mocked(userInvitationDao.findById)
				.mockResolvedValueOnce(existingInvitation)
				.mockResolvedValue(newInvitation);
			vi.mocked(userInvitationDao.delete).mockResolvedValue(true);
			vi.mocked(userInvitationDao.create).mockResolvedValue(newInvitation);
			vi.mocked(userInvitationDao.updateVerificationId).mockResolvedValue(true);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(200);
			expect(response.body.email).toBe("test@example.com");
			// Verification cleanup uses verificationId
			expect(verificationDao.deleteVerification).toHaveBeenCalledWith(50);
			expect(userInvitationDao.delete).toHaveBeenCalledWith(1);
			expect(invitationTokenUtil.generateToken).toHaveBeenCalled();
			expect(userInvitationDao.updateVerificationId).toHaveBeenCalled();
			expect(verificationDao.createVerification).toHaveBeenCalled();
		});

		it("should resend an invitation even if verificationId is null", async () => {
			const existingInvitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				status: "pending",
				invitedBy: 1,
				verificationId: null,
			});
			const newInvitation = mockUserInvitation({
				id: 2,
				email: "test@example.com",
				verificationId: 51,
			});
			vi.mocked(userInvitationDao.findById)
				.mockResolvedValueOnce(existingInvitation)
				.mockResolvedValue(newInvitation);
			vi.mocked(userInvitationDao.delete).mockResolvedValue(true);
			vi.mocked(userInvitationDao.create).mockResolvedValue(newInvitation);
			vi.mocked(userInvitationDao.updateVerificationId).mockResolvedValue(true);
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 1, name: "Inviter Name" }));

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(200);
			// Should not attempt to delete verification if verificationId is null
			expect(verificationDao.deleteVerification).not.toHaveBeenCalled();
			expect(userInvitationDao.delete).toHaveBeenCalledWith(1);
		});

		it("should return 404 if invitation not found", async () => {
			vi.mocked(userInvitationDao.findById).mockResolvedValue(undefined);

			const response = await request(app).post("/user-management/invitation/999/resend");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Invitation not found" });
		});

		it("should reject non-pending invitations", async () => {
			const expiredInvitation = mockUserInvitation({ id: 1, status: "expired" });
			vi.mocked(userInvitationDao.findById).mockResolvedValue(expiredInvitation);

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Can only resend pending invitations" });
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).post("/user-management/invitation/invalid/resend");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid invitation ID" });
		});

		it("should return 429 when rate limit is exceeded", async () => {
			const existingInvitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				status: "pending",
			});
			vi.mocked(userInvitationDao.findById).mockResolvedValue(existingInvitation);

			// Modify the shared mock state to simulate rate limit exceeded
			mockRateLimitState.checkResult = {
				allowed: false,
				current: 3,
				limit: 3,
				remaining: 0,
				resetInSeconds: 3600,
			};

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(429);
			expect(response.body).toEqual({ error: "Too many requests" });

			// Reset the mock state for other tests
			mockRateLimitState.checkResult = {
				allowed: true,
				current: 0,
				limit: 3,
				remaining: 3,
				resetInSeconds: 3600,
			};
		});

		it("should return 500 when tenant context is not available", async () => {
			const existingInvitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				status: "pending",
			});
			vi.mocked(userInvitationDao.findById).mockResolvedValue(existingInvitation);

			const { getTenantContext } = await import("../tenant/TenantContext");
			// Mock to return null for the tenant context check (after DAO calls)
			vi.mocked(getTenantContext)
				.mockReturnValueOnce({ tenant: { id: "test" }, org: { id: "test", displayName: "Test" } } as never) // For userInvitationDaoProvider.getDao
				.mockReturnValueOnce({ tenant: { id: "test" }, org: { id: "test", displayName: "Test" } } as never) // For activeUserDaoProvider.getDao
				.mockReturnValueOnce(null as never); // For tenant context check

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Tenant context not available" });
		});

		it("should handle errors and return 500", async () => {
			vi.mocked(userInvitationDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to resend invitation" });
		});

		it("should use fallback inviter name when inviter is not found", async () => {
			const existingInvitation = mockUserInvitation({
				id: 1,
				email: "test@example.com",
				status: "pending",
				invitedBy: 1,
				verificationId: null,
			});
			const newInvitation = mockUserInvitation({
				id: 2,
				email: "test@example.com",
				verificationId: 51,
			});
			vi.mocked(userInvitationDao.findById)
				.mockResolvedValueOnce(existingInvitation)
				.mockResolvedValue(newInvitation);
			vi.mocked(userInvitationDao.delete).mockResolvedValue(true);
			vi.mocked(userInvitationDao.create).mockResolvedValue(newInvitation);
			vi.mocked(userInvitationDao.updateVerificationId).mockResolvedValue(true);
			// Simulate inviter not found - should fall back to "A team member"
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app).post("/user-management/invitation/1/resend");

			expect(response.status).toBe(200);
			// Email should still be sent with fallback inviter name
		});
	});

	describe("GET /roles", () => {
		it("should return all roles", async () => {
			const response = await request(app).get("/user-management/roles");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(3);
			expect(response.body[0]).toMatchObject({ slug: "owner", name: "Owner" });
			expect(response.body[1]).toMatchObject({ slug: "admin", name: "Admin" });
			expect(response.body[2]).toMatchObject({ slug: "member", name: "Member" });
			expect(roleDao.listAll).toHaveBeenCalled();
		});

		it("should handle errors when listing roles", async () => {
			vi.mocked(roleDao.listAll).mockRejectedValueOnce(new Error("Database error"));

			const response = await request(app).get("/user-management/roles");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list roles" });
		});
	});

	describe("PUT /user/:id/role", () => {
		it("should update user role by slug (no roleId)", async () => {
			const existingUser = mockActiveUser({ id: 2, role: "member" });
			const updatedUser = mockActiveUser({ id: 2, role: "admin" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(existingUser);
			vi.mocked(activeUserDao.update).mockResolvedValue(updatedUser);

			const response = await request(app).put("/user-management/user/2/role").send({ role: "admin" });

			expect(response.status).toBe(200);
			expect(response.body.role).toBe("admin");
			expect(roleDao.findBySlug).toHaveBeenCalledWith("admin");
			expect(activeUserDao.update).toHaveBeenCalledWith(2, { role: "admin" });
		});

		it("should return 403 when trying to change own role", async () => {
			const response = await request(app).put("/user-management/user/1/role").send({ role: "admin" });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot change your own role" });
			expect(activeUserDao.update).not.toHaveBeenCalled();
		});

		it("should reject missing role", async () => {
			const response = await request(app).put("/user-management/user/2/role").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "role is required" });
		});

		it("should reject invalid role", async () => {
			const response = await request(app).put("/user-management/user/2/role").send({ role: "superadmin" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role: superadmin" });
		});

		it("should return 404 if user not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app).put("/user-management/user/999/role").send({ role: "admin" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should return 403 when trying to change owner role", async () => {
			const ownerUser = mockActiveUser({ id: 2, email: "owner@example.com", role: "owner" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(ownerUser);

			const response = await request(app).put("/user-management/user/2/role").send({ role: "admin" });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot change the owner's role" });
			expect(activeUserDao.update).not.toHaveBeenCalled();
		});

		it("should allow owner to remain owner", async () => {
			const ownerUser = mockActiveUser({ id: 2, email: "owner@example.com", role: "owner" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(ownerUser);
			vi.mocked(activeUserDao.update).mockResolvedValue(ownerUser);

			const response = await request(app).put("/user-management/user/2/role").send({ role: "owner" });

			expect(response.status).toBe(200);
			expect(roleDao.findBySlug).toHaveBeenCalledWith("owner");
			expect(activeUserDao.update).toHaveBeenCalledWith(2, { role: "owner" });
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).put("/user-management/user/invalid/role").send({ role: "admin" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid user ID" });
		});

		it("should return 404 when update returns undefined", async () => {
			const existingUser = mockActiveUser({ id: 2, role: "member" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(existingUser);
			vi.mocked(activeUserDao.update).mockResolvedValue(undefined);

			const response = await request(app).put("/user-management/user/2/role").send({ role: "admin" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should handle errors and return 500", async () => {
			vi.mocked(activeUserDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/user-management/user/2/role").send({ role: "admin" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update user role" });
		});

		it("should reject role that does not exist in database", async () => {
			vi.mocked(roleDao.findBySlug).mockResolvedValueOnce(undefined);

			const response = await request(app).put("/user-management/user/2/role").send({ role: "nonexistent" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role: nonexistent" });
			expect(activeUserDao.update).not.toHaveBeenCalled();
		});
	});

	describe("DELETE /user/:id", () => {
		it("should archive a user and delete global user when user belongs to only this tenant", async () => {
			// Note: current user has id=1, so we archive user id=2 to avoid self-removal
			const user = mockActiveUser({ id: 2, email: "test@example.com", name: "Test User", role: "member" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(user);
			vi.mocked(archivedUserDao.create).mockResolvedValue(mockArchivedUser({ userId: 2 }));
			vi.mocked(activeUserDao.delete).mockResolvedValue(true);
			// User has no remaining orgs after removal (single tenant)
			vi.mocked(userOrgDao.getUserOrgs).mockResolvedValue([]);

			const response = await request(app).delete("/user-management/user/2").send({ reason: "Left the company" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(archivedUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 2,
					email: "test@example.com",
					name: "Test User",
					role: "member",
					reason: "Left the company",
					removedBy: 1, // current user id
				}),
			);
			expect(activeUserDao.delete).toHaveBeenCalledWith(2);
			// Should remove user from this tenant/org
			expect(userOrgDao.deleteUserOrg).toHaveBeenCalledWith(2, "test-tenant-id", "test-org-id");
			// Should delete global user since no remaining tenant memberships
			expect(globalUserDao.deleteUser).toHaveBeenCalledWith(2);
		});

		it("should archive a user without deleting global user when user belongs to multiple tenants", async () => {
			const user = mockActiveUser({ id: 2, email: "test@example.com", name: "Test User", role: "member" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(user);
			vi.mocked(archivedUserDao.create).mockResolvedValue(mockArchivedUser({ userId: 2 }));
			vi.mocked(activeUserDao.delete).mockResolvedValue(true);
			// User still belongs to another tenant after removal
			vi.mocked(userOrgDao.getUserOrgs).mockResolvedValue([
				{
					id: 1,
					userId: 2,
					tenantId: "other-tenant-id",
					orgId: "other-org-id",
					role: "member",
					isDefault: false,
					createdAt: new Date(),
				},
			]);

			const response = await request(app).delete("/user-management/user/2").send({ reason: "Left the company" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(archivedUserDao.create).toHaveBeenCalled();
			expect(activeUserDao.delete).toHaveBeenCalledWith(2);
			// Should remove user from this tenant/org
			expect(userOrgDao.deleteUserOrg).toHaveBeenCalledWith(2, "test-tenant-id", "test-org-id");
			// Should NOT delete global user since user still has other tenant memberships
			expect(globalUserDao.deleteUser).not.toHaveBeenCalled();
		});

		it("should archive a user without reason", async () => {
			const user = mockActiveUser({ id: 2 });
			vi.mocked(activeUserDao.findById).mockResolvedValue(user);
			vi.mocked(archivedUserDao.create).mockResolvedValue(mockArchivedUser({ userId: 2 }));
			vi.mocked(activeUserDao.delete).mockResolvedValue(true);
			vi.mocked(userOrgDao.getUserOrgs).mockResolvedValue([]);

			const response = await request(app).delete("/user-management/user/2");

			expect(response.status).toBe(200);
			expect(archivedUserDao.create).toHaveBeenCalledWith(
				expect.objectContaining({
					reason: null,
					removedBy: 1, // current user id
				}),
			);
			expect(userOrgDao.deleteUserOrg).toHaveBeenCalledWith(2, "test-tenant-id", "test-org-id");
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValueOnce(undefined);

			const response = await request(app).delete("/user-management/user/2");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Authentication required" });
			expect(archivedUserDao.create).not.toHaveBeenCalled();
		});

		it("should return 403 when trying to remove yourself", async () => {
			// Current user has id=1, try to remove user with id=1
			const response = await request(app).delete("/user-management/user/1");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot remove yourself" });
			expect(activeUserDao.findById).not.toHaveBeenCalled();
			expect(archivedUserDao.create).not.toHaveBeenCalled();
			expect(activeUserDao.delete).not.toHaveBeenCalled();
		});

		it("should return 404 if user not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app).delete("/user-management/user/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should return 403 when trying to remove the owner", async () => {
			const ownerUser = mockActiveUser({ id: 2, email: "owner@example.com", role: "owner" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(ownerUser);

			const response = await request(app).delete("/user-management/user/2");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot remove the owner user" });
			expect(archivedUserDao.create).not.toHaveBeenCalled();
			expect(activeUserDao.delete).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).delete("/user-management/user/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid user ID" });
		});

		it("should handle errors and return 500", async () => {
			vi.mocked(activeUserDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/user-management/user/2");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to archive user" });
		});

		it("should orphan personal space during user deletion", async () => {
			const spaceDaoInstance = mockSpaceDao();
			mockDeps.spaceDaoProvider = { getDao: () => spaceDaoInstance };
			app = express();
			app.use(express.json());
			app.use("/user-management", createUserManagementRouter(mockDeps));

			const user = mockActiveUser({ id: 2, email: "test@example.com", name: "Test User", role: "member" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(user);
			vi.mocked(archivedUserDao.create).mockResolvedValue(mockArchivedUser({ userId: 2 }));
			vi.mocked(activeUserDao.delete).mockResolvedValue(true);
			vi.mocked(userOrgDao.getUserOrgs).mockResolvedValue([]);

			const response = await request(app).delete("/user-management/user/2");

			expect(response.status).toBe(200);
			expect(spaceDaoInstance.orphanPersonalSpace).toHaveBeenCalledWith(2);
		});

		it("should succeed with user deletion even if orphan personal space fails", async () => {
			const spaceDaoInstance = mockSpaceDao({
				orphanPersonalSpace: vi.fn().mockRejectedValue(new Error("Space error")),
			});
			mockDeps.spaceDaoProvider = { getDao: () => spaceDaoInstance };
			app = express();
			app.use(express.json());
			app.use("/user-management", createUserManagementRouter(mockDeps));

			const user = mockActiveUser({ id: 2, email: "test@example.com", name: "Test User", role: "member" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(user);
			vi.mocked(archivedUserDao.create).mockResolvedValue(mockArchivedUser({ userId: 2 }));
			vi.mocked(activeUserDao.delete).mockResolvedValue(true);
			vi.mocked(userOrgDao.getUserOrgs).mockResolvedValue([]);

			const response = await request(app).delete("/user-management/user/2");

			// Deletion should still succeed despite orphan failure
			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(activeUserDao.delete).toHaveBeenCalledWith(2);
		});
	});

	describe("parsePaginationParams edge cases", () => {
		it("should sanitize negative offset to 0", async () => {
			vi.mocked(activeUserDao.listAll).mockResolvedValue([]);
			vi.mocked(activeUserDao.countAll).mockResolvedValue(0);

			const response = await request(app).get("/user-management/active?offset=-10");

			expect(response.status).toBe(200);
			expect(activeUserDao.listAll).toHaveBeenCalledWith({ limit: 20, offset: 0 });
		});

		it("should cap limit to minimum of 1 when less than 1", async () => {
			vi.mocked(activeUserDao.listAll).mockResolvedValue([]);
			vi.mocked(activeUserDao.countAll).mockResolvedValue(0);

			const response = await request(app).get("/user-management/active?limit=0");

			expect(response.status).toBe(200);
			expect(activeUserDao.listAll).toHaveBeenCalledWith({ limit: 1, offset: 0 });
		});
	});

	describe("PUT /user/:id/name", () => {
		it("should return 400 for invalid user ID", async () => {
			const response = await request(app).put("/user-management/user/invalid/name").send({ name: "New Name" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid user ID" });
		});

		it("should return 400 when name is missing", async () => {
			const response = await request(app).put("/user-management/user/1/name").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name is required" });
		});

		it("should return 400 when name is not a string", async () => {
			const response = await request(app).put("/user-management/user/1/name").send({ name: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "name is required" });
		});

		it("should return 404 when user not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app).put("/user-management/user/99/name").send({ name: "New Name" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should update user name successfully", async () => {
			const existingUser = mockActiveUser({ id: 1, name: "Old Name" });
			const updatedUser = mockActiveUser({ id: 1, name: "New Name" });
			vi.mocked(activeUserDao.findById).mockResolvedValue(existingUser);
			vi.mocked(activeUserDao.update).mockResolvedValue(updatedUser);

			const response = await request(app).put("/user-management/user/1/name").send({ name: "New Name" });

			expect(response.status).toBe(200);
			expect(activeUserDao.update).toHaveBeenCalledWith(1, { name: "New Name" });
			expect(response.body.name).toBe("New Name");
		});

		it("should trim whitespace and convert empty string to null", async () => {
			const existingUser = mockActiveUser({ id: 1, name: "Old Name" });
			const updatedUser = mockActiveUser({ id: 1, name: null });
			vi.mocked(activeUserDao.findById).mockResolvedValue(existingUser);
			vi.mocked(activeUserDao.update).mockResolvedValue(updatedUser);

			const response = await request(app).put("/user-management/user/1/name").send({ name: "   " });

			expect(response.status).toBe(200);
			expect(activeUserDao.update).toHaveBeenCalledWith(1, { name: null });
		});

		it("should return 404 when update returns undefined", async () => {
			const existingUser = mockActiveUser({ id: 1 });
			vi.mocked(activeUserDao.findById).mockResolvedValue(existingUser);
			vi.mocked(activeUserDao.update).mockResolvedValue(undefined);

			const response = await request(app).put("/user-management/user/1/name").send({ name: "New Name" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should handle database errors", async () => {
			vi.mocked(activeUserDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/user-management/user/1/name").send({ name: "New Name" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update user name" });
		});
	});

	describe("PUT /user/:id/deactivate", () => {
		it("should return 400 for invalid user ID", async () => {
			const response = await request(app).put("/user-management/user/invalid/deactivate");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid user ID" });
		});

		it("should return 401 when not authenticated", async () => {
			// Mock decodePayload to return undefined for unauthenticated
			vi.mocked(tokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).put("/user-management/user/1/deactivate");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Authentication required" });
		});

		it("should return 403 when trying to deactivate yourself", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).put("/user-management/user/1/deactivate");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot deactivate yourself" });
		});

		it("should return 404 when user not found", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app).put("/user-management/user/2/deactivate");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should return 403 when trying to deactivate the owner", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 2, role: "owner" }));

			const response = await request(app).put("/user-management/user/2/deactivate");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot deactivate the owner" });
		});

		it("should return 400 when user is already deactivated", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 2, isActive: false }));

			const response = await request(app).put("/user-management/user/2/deactivate");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "User is already deactivated" });
		});

		it("should deactivate user successfully", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});
			const activeUser = mockActiveUser({ id: 2, isActive: true });
			const deactivatedUser = mockActiveUser({ id: 2, isActive: false });
			vi.mocked(activeUserDao.findById).mockResolvedValueOnce(activeUser).mockResolvedValueOnce(deactivatedUser);
			vi.mocked(activeUserDao.deactivate).mockResolvedValue(true);

			const response = await request(app).put("/user-management/user/2/deactivate");

			expect(response.status).toBe(200);
			expect(activeUserDao.deactivate).toHaveBeenCalledWith(2);
			expect(response.body.isActive).toBe(false);
		});

		it("should return 500 when deactivation fails", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 2, isActive: true }));
			vi.mocked(activeUserDao.deactivate).mockResolvedValue(false);

			const response = await request(app).put("/user-management/user/2/deactivate");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to deactivate user" });
		});

		it("should handle database errors", async () => {
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});
			vi.mocked(activeUserDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/user-management/user/2/deactivate");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to deactivate user" });
		});
	});

	describe("PUT /user/:id/activate", () => {
		it("should return 400 for invalid user ID", async () => {
			const response = await request(app).put("/user-management/user/invalid/activate");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid user ID" });
		});

		it("should return 404 when user not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const response = await request(app).put("/user-management/user/99/activate");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "User not found" });
		});

		it("should return 400 when user is already active", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 2, isActive: true }));

			const response = await request(app).put("/user-management/user/2/activate");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "User is already active" });
		});

		it("should activate user successfully", async () => {
			const deactivatedUser = mockActiveUser({ id: 2, isActive: false });
			const activatedUser = mockActiveUser({ id: 2, isActive: true });
			vi.mocked(activeUserDao.findById)
				.mockResolvedValueOnce(deactivatedUser)
				.mockResolvedValueOnce(activatedUser);
			vi.mocked(activeUserDao.reactivate).mockResolvedValue(true);
			vi.mocked(tokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "admin@example.com",
				name: "Admin",
				picture: undefined,
			});

			const response = await request(app).put("/user-management/user/2/activate");

			expect(response.status).toBe(200);
			expect(activeUserDao.reactivate).toHaveBeenCalledWith(2);
			expect(response.body.isActive).toBe(true);
		});

		it("should return 500 when activation fails", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockActiveUser({ id: 2, isActive: false }));
			vi.mocked(activeUserDao.reactivate).mockResolvedValue(false);

			const response = await request(app).put("/user-management/user/2/activate");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to activate user" });
		});

		it("should handle database errors", async () => {
			vi.mocked(activeUserDao.findById).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/user-management/user/2/activate");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to activate user" });
		});
	});
});
