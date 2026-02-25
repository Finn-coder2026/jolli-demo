import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalAuthDao } from "../dao/GlobalAuthDao";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { PasswordHistoryDao } from "../dao/PasswordHistoryDao";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import * as CacheService from "../services/CacheService";
import * as TenantContext from "../tenant/TenantContext";
import * as Cookies from "../util/Cookies";
import type { TokenUtil } from "../util/TokenUtil";
import { createProfileRouter } from "./ProfileRouter";
import * as argon2 from "@node-rs/argon2";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @node-rs/argon2
vi.mock("@node-rs/argon2", () => ({
	verify: vi.fn(),
	hash: vi.fn(),
}));

// Mock TenantContext
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

// Mock Cookies module
vi.mock("../util/Cookies", () => ({
	clearAuthCookie: vi.fn(),
	clearRememberMeCookie: vi.fn(),
}));

// Mock CacheService
vi.mock("../services/CacheService", () => ({
	getCache: vi.fn(),
}));

describe("ProfileRouter", () => {
	let app: express.Application;
	let mockGlobalUserDao: {
		findUserById: ReturnType<typeof vi.fn>;
		updateUser: ReturnType<typeof vi.fn>;
	};
	let mockGlobalAuthDao: {
		findAuthByUserIdAndProvider: ReturnType<typeof vi.fn>;
		createAuth: ReturnType<typeof vi.fn>;
		updateAuth: ReturnType<typeof vi.fn>;
	};
	let mockPasswordHistoryDao: {
		isPasswordReused: ReturnType<typeof vi.fn>;
		addPasswordHistory: ReturnType<typeof vi.fn>;
		cleanupOldPasswords: ReturnType<typeof vi.fn>;
	};
	let mockTokenUtil: TokenUtil<UserInfo>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockGlobalUserDao = {
			findUserById: vi.fn(),
			updateUser: vi.fn(),
		};

		mockGlobalAuthDao = {
			findAuthByUserIdAndProvider: vi.fn(),
			createAuth: vi.fn(),
			updateAuth: vi.fn(),
		};

		mockPasswordHistoryDao = {
			isPasswordReused: vi.fn(),
			addPasswordHistory: vi.fn(),
			cleanupOldPasswords: vi.fn(),
		};

		mockTokenUtil = {
			decodePayload: vi.fn(),
			generateToken: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		app = express();
		app.use(express.json());
		app.use(
			"/api/profile",
			createProfileRouter({
				globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
				globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
				passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
				tokenUtil: mockTokenUtil,
			}),
		);
	});

	describe("GET /", () => {
		it("should return user profile when authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: "https://example.com/avatar.jpg",
				isActive: true,
			});

			const response = await request(app).get("/api/profile");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				image: "https://example.com/avatar.jpg",
			});
		});

		it("should return profile with null image when user has no image", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Test User",
				image: undefined,
				isActive: true,
			});

			const response = await request(app).get("/api/profile");

			expect(response.status).toBe(200);
			expect(response.body.image).toBeNull();
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/profile");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 401 when userId is missing from token", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			} as UserInfo);

			const response = await request(app).get("/api/profile");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 404 when user not found", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 999,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.findUserById.mockResolvedValue(undefined);

			const response = await request(app).get("/api/profile");

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("user_not_found");
		});

		it("should return 500 on server error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.findUserById.mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/api/profile");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("PUT /", () => {
		it("should update user name successfully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockResolvedValue(undefined);
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "New Name",
				image: null,
				isActive: true,
			});

			const response = await request(app).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(200);
			expect(response.body.name).toBe("New Name");
			expect(mockGlobalUserDao.updateUser).toHaveBeenCalledWith(1, { name: "New Name" });
		});

		it("should trim whitespace from name", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockResolvedValue(undefined);
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "Trimmed Name",
				image: null,
				isActive: true,
			});

			const response = await request(app).put("/api/profile").send({ name: "  Trimmed Name  " });

			expect(response.status).toBe(200);
			expect(mockGlobalUserDao.updateUser).toHaveBeenCalledWith(1, { name: "Trimmed Name" });
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 400 when name is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).put("/api/profile").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_name");
		});

		it("should return 400 when name is not a string", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).put("/api/profile").send({ name: 123 });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_name");
		});

		it("should return 400 when name is empty after trim", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).put("/api/profile").send({ name: "   " });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_name");
		});

		it("should return 400 when name exceeds 255 characters", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const longName = "a".repeat(256);
			const response = await request(app).put("/api/profile").send({ name: longName });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_name");
			expect(response.body.message).toContain("1-255");
		});

		it("should return 404 when user not found after update", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockResolvedValue(undefined);
			mockGlobalUserDao.findUserById.mockResolvedValue(undefined);

			const response = await request(app).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(404);
			expect(response.body.error).toBe("user_not_found");
		});

		it("should return 500 on server error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should also update name in tenant active_users when in tenant context", async () => {
			const mockActiveUserDao = {
				findByEmail: vi.fn().mockResolvedValue({ id: 42, email: "test@example.com", name: "Test User" }),
				update: vi.fn().mockResolvedValue(undefined),
			};
			const mockActiveUserDaoProvider = {
				getDao: vi.fn().mockReturnValue(mockActiveUserDao),
			} as unknown as DaoProvider<ActiveUserDao>;

			// Mock tenant context to return a valid context
			const mockTenantContext = { tenantId: "tenant-123", orgId: "org-456" };
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantContext as never);

			// Create app with activeUserDaoProvider
			const appWithTenant = express();
			appWithTenant.use(express.json());
			appWithTenant.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					activeUserDaoProvider: mockActiveUserDaoProvider,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockResolvedValue(undefined);
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "New Name",
				image: null,
				isActive: true,
			});

			const response = await request(appWithTenant).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(200);
			expect(mockActiveUserDaoProvider.getDao).toHaveBeenCalledWith(mockTenantContext);
			expect(mockActiveUserDao.findByEmail).toHaveBeenCalledWith("test@example.com");
			expect(mockActiveUserDao.update).toHaveBeenCalledWith(42, { name: "New Name" });
		});

		it("should not fail when active_users update fails in tenant context", async () => {
			const mockActiveUserDao = {
				findByEmail: vi.fn().mockRejectedValue(new Error("Database error")),
				update: vi.fn(),
			};
			const mockActiveUserDaoProvider = {
				getDao: vi.fn().mockReturnValue(mockActiveUserDao),
			} as unknown as DaoProvider<ActiveUserDao>;

			// Mock tenant context to return a valid context
			const mockTenantContext = { tenantId: "tenant-123", orgId: "org-456" };
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantContext as never);

			// Create app with activeUserDaoProvider
			const appWithTenant = express();
			appWithTenant.use(express.json());
			appWithTenant.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					activeUserDaoProvider: mockActiveUserDaoProvider,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockResolvedValue(undefined);
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "test@example.com",
				name: "New Name",
				image: null,
				isActive: true,
			});

			// Should still succeed even though active_users update fails
			const response = await request(appWithTenant).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(200);
			expect(response.body.name).toBe("New Name");
		});

		it("should skip active_users update when user not found in tenant", async () => {
			const mockActiveUserDao = {
				findByEmail: vi.fn().mockResolvedValue(undefined), // User not found
				update: vi.fn(),
			};
			const mockActiveUserDaoProvider = {
				getDao: vi.fn().mockReturnValue(mockActiveUserDao),
			} as unknown as DaoProvider<ActiveUserDao>;

			// Mock tenant context to return a valid context
			const mockTenantContext = { tenantId: "tenant-123", orgId: "org-456" };
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantContext as never);

			// Create app with activeUserDaoProvider
			const appWithTenant = express();
			appWithTenant.use(express.json());
			appWithTenant.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					activeUserDaoProvider: mockActiveUserDaoProvider,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "notintenant@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalUserDao.updateUser.mockResolvedValue(undefined);
			mockGlobalUserDao.findUserById.mockResolvedValue({
				id: 1,
				email: "notintenant@example.com",
				name: "New Name",
				image: null,
				isActive: true,
			});

			const response = await request(appWithTenant).put("/api/profile").send({ name: "New Name" });

			expect(response.status).toBe(200);
			expect(mockActiveUserDao.findByEmail).toHaveBeenCalledWith("notintenant@example.com");
			expect(mockActiveUserDao.update).not.toHaveBeenCalled();
		});
	});

	describe("GET /has-password", () => {
		it("should return hasPassword: true when user has password auth", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "some-hash",
			});

			const response = await request(app).get("/api/profile/has-password");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasPassword: true });
		});

		it("should return hasPassword: false when user has no password auth", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app).get("/api/profile/has-password");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasPassword: false });
		});

		it("should return hasPassword: false when credential auth has no passwordHash", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: null,
			});

			const response = await request(app).get("/api/profile/has-password");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ hasPassword: false });
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).get("/api/profile/has-password");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 500 on server error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockRejectedValue(new Error("DB error"));

			const response = await request(app).get("/api/profile/has-password");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /set-password", () => {
		const validPassword = "NewPass@123";

		it("should set password successfully for user without password", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);
			vi.mocked(argon2.hash).mockResolvedValue("new-hash");
			mockGlobalAuthDao.createAuth.mockResolvedValue({ id: "auth-1" });

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockGlobalAuthDao.createAuth).toHaveBeenCalledWith({
				userId: 1,
				provider: "credential",
				passwordHash: "new-hash",
			});
		});

		it("should update existing credential auth without passwordHash", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: null,
			});
			vi.mocked(argon2.hash).mockResolvedValue("new-hash");
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockGlobalAuthDao.updateAuth).toHaveBeenCalledWith("auth-1", {
				passwordHash: "new-hash",
			});
			expect(mockGlobalAuthDao.createAuth).not.toHaveBeenCalled();
		});

		it("should return 400 when user already has password", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "existing-hash",
			});

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("password_already_set");
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: validPassword });

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 400 when newPassword is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app).post("/api/profile/set-password").send({});

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return 400 when password is too short", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: "Ab@1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at least 8");
		});

		it("should return 400 when password lacks uppercase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: "newpass@123" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("uppercase");
		});

		it("should return 400 when password lacks lowercase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: "NEWPASS@123" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("lowercase");
		});

		it("should return 400 when password lacks number", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: "NewPass@abc" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("number");
		});

		it("should return 400 when password lacks special character", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: "NewPass1234" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("special character");
		});

		it("should return 500 on server error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockRejectedValue(new Error("DB error"));

			const response = await request(app).post("/api/profile/set-password").send({ newPassword: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});
	});

	describe("POST /change-password", () => {
		const validPassword = "NewPass@123";

		it("should change password successfully", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			vi.mocked(argon2.hash).mockResolvedValue("new-hash");
			mockPasswordHistoryDao.addPasswordHistory.mockResolvedValue(undefined);
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockPasswordHistoryDao.addPasswordHistory).toHaveBeenCalledWith(1, "old-hash");
			expect(mockGlobalAuthDao.updateAuth).toHaveBeenCalledWith("auth-1", { passwordHash: "new-hash" });
			expect(mockPasswordHistoryDao.cleanupOldPasswords).toHaveBeenCalledWith(1, 5);
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 400 when currentPassword is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return 400 when newPassword is missing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("missing_fields");
		});

		it("should return 400 when no password auth record exists", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue(null);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("no_password_auth");
		});

		it("should return 400 when auth record has no passwordHash", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: null,
			});

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("no_password_auth");
		});

		it("should return 401 when current password is incorrect", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(false);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "WrongPass@123", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_current_password");
		});

		it("should return 400 when new password is too short", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: "Ab@1" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("at least 8");
		});

		it("should return 400 when new password is too long", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: `${"A".repeat(30)}bcdef@1` });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
		});

		it("should return 400 when new password lacks uppercase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: "newpass@123" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("uppercase");
		});

		it("should return 400 when new password lacks lowercase", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: "NEWPASS@123" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("lowercase");
		});

		it("should return 400 when new password lacks number", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: "NewPass@abc" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("number");
		});

		it("should return 400 when new password lacks special character", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: "NewPass1234" });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("invalid_password");
			expect(response.body.message).toContain("special character");
		});

		it("should return 400 when password was recently used", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(true);

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(400);
			expect(response.body.error).toBe("password_reused");
		});

		it("should return 500 on server error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should succeed even when revoking remember-me tokens fails", async () => {
			const mockRememberMeService = {
				revokeAllTokensForUser: vi.fn().mockRejectedValue(new Error("Token revocation failed")),
			};

			// Create app with rememberMeService
			const appWithService = express();
			appWithService.use(express.json());
			appWithService.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					rememberMeService: mockRememberMeService as never,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			vi.mocked(argon2.hash).mockResolvedValue("new-hash");
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockPasswordHistoryDao.addPasswordHistory.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);

			const response = await request(appWithService)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			// Password change should succeed even if token revocation fails
			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Verify the token revocation was attempted
			expect(mockRememberMeService.revokeAllTokensForUser).toHaveBeenCalledWith(1);
		});

		it("should revoke remember-me tokens successfully after password change", async () => {
			const mockRememberMeService = {
				revokeAllTokensForUser: vi.fn().mockResolvedValue(undefined),
			};

			// Create app with rememberMeService
			const appWithService = express();
			appWithService.use(express.json());
			appWithService.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					rememberMeService: mockRememberMeService as never,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});
			mockGlobalAuthDao.findAuthByUserIdAndProvider.mockResolvedValue({
				id: "auth-1",
				userId: 1,
				provider: "credential",
				passwordHash: "old-hash",
			});
			vi.mocked(argon2.verify).mockResolvedValue(true);
			mockPasswordHistoryDao.isPasswordReused.mockResolvedValue(false);
			vi.mocked(argon2.hash).mockResolvedValue("new-hash");
			mockGlobalAuthDao.updateAuth.mockResolvedValue(undefined);
			mockPasswordHistoryDao.addPasswordHistory.mockResolvedValue(undefined);
			mockPasswordHistoryDao.cleanupOldPasswords.mockResolvedValue(undefined);

			const response = await request(appWithService)
				.post("/api/profile/change-password")
				.send({ currentPassword: "OldPass@123", newPassword: validPassword });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			// Verify the token revocation was called
			expect(mockRememberMeService.revokeAllTokensForUser).toHaveBeenCalledWith(1);
		});
	});

	describe("POST /logout-all-sessions", () => {
		it("should revoke all tokens and return success", async () => {
			const mockRememberMeService = {
				revokeAllTokensForUser: vi.fn().mockResolvedValue(undefined),
			};

			// Create app with rememberMeService
			const appWithService = express();
			appWithService.use(express.json());
			appWithService.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					rememberMeService: mockRememberMeService as never,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(appWithService).post("/api/profile/logout-all-sessions");

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(mockRememberMeService.revokeAllTokensForUser).toHaveBeenCalledWith(1);
		});

		it("should return 401 when not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

			const response = await request(app).post("/api/profile/logout-all-sessions");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should return 401 when userId is missing from token", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			} as UserInfo);

			const response = await request(app).post("/api/profile/logout-all-sessions");

			expect(response.status).toBe(401);
			expect(response.body.error).toBe("unauthorized");
		});

		it("should succeed even when rememberMeService is not provided", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			// Default app has no rememberMeService
			const response = await request(app).post("/api/profile/logout-all-sessions");

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
		});

		it("should return 500 when revokeAllTokensForUser fails", async () => {
			const mockRememberMeService = {
				revokeAllTokensForUser: vi.fn().mockRejectedValue(new Error("Database error")),
			};

			// Create app with rememberMeService
			const appWithService = express();
			appWithService.use(express.json());
			appWithService.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					rememberMeService: mockRememberMeService as never,
				}),
			);

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			const response = await request(appWithService).post("/api/profile/logout-all-sessions");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");
		});

		it("should return 500 when clearAuthCookie throws an error", async () => {
			// Make clearAuthCookie throw to trigger the outer catch block
			vi.mocked(Cookies.clearAuthCookie).mockImplementation(() => {
				throw new Error("Cookie clearing failed");
			});

			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
			});

			// Default app has no rememberMeService, so the inner try-catch won't run
			const response = await request(app).post("/api/profile/logout-all-sessions");

			expect(response.status).toBe(500);
			expect(response.body.error).toBe("server_error");

			// Reset mock to not affect other tests
			vi.mocked(Cookies.clearAuthCookie).mockReset();
		});
	});

	describe("preferences endpoints", () => {
		let prefApp: express.Application;
		let mockUserPreferenceDao: {
			getPreference: ReturnType<typeof vi.fn>;
			upsertPreference: ReturnType<typeof vi.fn>;
			getHash: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockUserPreferenceDao = {
				getPreference: vi.fn(),
				upsertPreference: vi.fn(),
				getHash: vi.fn(),
			};

			const mockUserPreferenceDaoProvider: DaoProvider<UserPreferenceDao> = {
				getDao: () => mockUserPreferenceDao as unknown as UserPreferenceDao,
			};

			vi.mocked(TenantContext.getTenantContext).mockReturnValue({
				tenant: { slug: "test-tenant" },
				org: { slug: "test-org" },
			} as never);

			vi.mocked(CacheService.getCache).mockReturnValue(
				undefined as unknown as ReturnType<typeof CacheService.getCache>,
			);

			prefApp = express();
			prefApp.use(express.json());
			prefApp.use(
				"/api/profile",
				createProfileRouter({
					globalUserDao: mockGlobalUserDao as unknown as GlobalUserDao,
					globalAuthDao: mockGlobalAuthDao as unknown as GlobalAuthDao,
					passwordHistoryDao: mockPasswordHistoryDao as unknown as PasswordHistoryDao,
					tokenUtil: mockTokenUtil,
					userPreferenceDaoProvider: mockUserPreferenceDaoProvider,
				}),
			);
		});

		describe("GET /preferences", () => {
			it("should return existing preferences", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				mockUserPreferenceDao.getPreference.mockResolvedValue({
					userId: 1,
					favoriteSpaces: [1, 2],
					favoriteSites: [3],
					hash: "abc123",
					updatedAt: new Date(),
				});

				const response = await request(prefApp).get("/api/profile/preferences");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					favoriteSpaces: [1, 2],
					favoriteSites: [3],
					hash: "abc123",
				});
			});

			it("should return empty defaults when no preferences exist", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				mockUserPreferenceDao.getPreference.mockResolvedValue(undefined);

				const response = await request(prefApp).get("/api/profile/preferences");

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					favoriteSpaces: [],
					favoriteSites: [],
					hash: "EMPTY",
				});
			});

			it("should return 401 when not authenticated", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

				const response = await request(prefApp).get("/api/profile/preferences");

				expect(response.status).toBe(401);
				expect(response.body.error).toBe("unauthorized");
			});

			it("should return 400 when no tenant context", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				vi.mocked(TenantContext.getTenantContext).mockReturnValue(undefined);

				const response = await request(prefApp).get("/api/profile/preferences");

				expect(response.status).toBe(400);
				expect(response.body.error).toBe("tenant_context_required");
			});

			it("should return 500 on server error", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				mockUserPreferenceDao.getPreference.mockRejectedValue(new Error("Database error"));

				const response = await request(prefApp).get("/api/profile/preferences");

				expect(response.status).toBe(500);
				expect(response.body.error).toBe("server_error");
			});
		});

		describe("PUT /preferences", () => {
			it("should update preferences successfully", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				mockUserPreferenceDao.upsertPreference.mockResolvedValue({
					userId: 1,
					favoriteSpaces: [1, 2],
					favoriteSites: [3],
					hash: "newhash",
					updatedAt: new Date(),
				});

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSpaces: [1, 2], favoriteSites: [3] });

				expect(response.status).toBe(200);
				expect(response.body).toEqual({
					favoriteSpaces: [1, 2],
					favoriteSites: [3],
					hash: "newhash",
				});
			});

			it("should return 401 when not authenticated", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSpaces: [1] });

				expect(response.status).toBe(401);
				expect(response.body.error).toBe("unauthorized");
			});

			it("should return 400 when no tenant context", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				vi.mocked(TenantContext.getTenantContext).mockReturnValue(undefined);

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSpaces: [1] });

				expect(response.status).toBe(400);
				expect(response.body.error).toBe("tenant_context_required");
			});

			it("should return 400 when favoriteSpaces is not an array", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSpaces: "not-an-array" });

				expect(response.status).toBe(400);
				expect(response.body.error).toBe("invalid_favorite_spaces");
			});

			it("should return 400 when favoriteSites is not an array", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});

				const response = await request(prefApp).put("/api/profile/preferences").send({ favoriteSites: 123 });

				expect(response.status).toBe(400);
				expect(response.body.error).toBe("invalid_favorite_sites");
			});

			it("should return 400 when favoriteSpaces contains non-positive integers", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSpaces: [1, -2, 3] });

				expect(response.status).toBe(400);
				expect(response.body.error).toBe("invalid_favorite_spaces");
			});

			it("should return 400 when favoriteSites contains non-positive integers", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSites: [0] });

				expect(response.status).toBe(400);
				expect(response.body.error).toBe("invalid_favorite_sites");
			});

			it("should return 500 on server error", async () => {
				vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
					userId: 1,
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
				});
				mockUserPreferenceDao.upsertPreference.mockRejectedValue(new Error("Database error"));

				const response = await request(prefApp)
					.put("/api/profile/preferences")
					.send({ favoriteSpaces: [1] });

				expect(response.status).toBe(500);
				expect(response.body.error).toBe("server_error");
			});
		});
	});
});
