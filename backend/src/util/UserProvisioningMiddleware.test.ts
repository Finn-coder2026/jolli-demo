import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { GlobalUser } from "../model/GlobalUser";
import { clearAuthCookie, clearRememberMeCookie } from "./Cookies";
import { createTokenUtil } from "./TokenUtil";
import { createUserProvisioningMiddleware, getOrgUserId } from "./UserProvisioningMiddleware";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

vi.mock("./Cookies", () => ({
	clearAuthCookie: vi.fn(),
	clearRememberMeCookie: vi.fn(),
}));

describe("UserProvisioningMiddleware", () => {
	let app: Express;
	let mockGlobalUserDao: GlobalUserDao;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	function createMockGlobalUser(overrides: Partial<GlobalUser> = {}): GlobalUser {
		return {
			id: 42,
			email: "test@jolli.ai",
			name: "Test User",
			isActive: true,
			image: "https://example.com/pic.jpg",
			createdAt: new Date("2024-01-01"),
			updatedAt: new Date("2024-01-01"),
			...overrides,
		};
	}

	beforeEach(() => {
		// Set up mock GlobalUserDao
		mockGlobalUserDao = {
			findUserByEmail: vi.fn(),
			findUserById: vi.fn(),
			createUser: vi.fn(),
			updateUser: vi.fn(),
			deleteUser: vi.fn(),
			updateUserEmail: vi.fn(),
		};

		// Generate valid auth token
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "JWT User",
			email: "test@jolli.ai",
			picture: "https://example.com/jwt-pic.jpg",
		});

		// Set up express app
		app = express();
		app.use(cookieParser());
		app.use(express.json());
	});

	describe("without GlobalUserDao (single-tenant mode)", () => {
		it("should skip and call next without setting orgUser", async () => {
			app.use(createUserProvisioningMiddleware(tokenUtil));
			app.get("/test", (req, res) => {
				res.json({
					hasOrgUser: !!req.orgUser,
				});
			});

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(false);
		});
	});

	describe("without JWT token (unauthenticated)", () => {
		it("should skip and call next without setting orgUser", async () => {
			app.use(createUserProvisioningMiddleware(tokenUtil, mockGlobalUserDao));
			app.get("/test", (req, res) => {
				res.json({
					hasOrgUser: !!req.orgUser,
				});
			});

			// No auth token
			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(false);
			expect(mockGlobalUserDao.findUserByEmail).not.toHaveBeenCalled();
		});
	});

	describe("with GlobalUserDao and JWT token", () => {
		beforeEach(() => {
			app.use(createUserProvisioningMiddleware(tokenUtil, mockGlobalUserDao));
			app.get("/test", (req, res) => {
				res.json({
					hasOrgUser: !!req.orgUser,
					orgUserId: req.orgUser?.id,
					orgUserEmail: req.orgUser?.email,
					orgUserName: req.orgUser?.name,
					orgUserPicture: req.orgUser?.picture,
				});
			});
		});

		it("should attach global user info to request when user found", async () => {
			const globalUser = createMockGlobalUser();
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
			expect(response.body.orgUserId).toBe(42);
			expect(response.body.orgUserEmail).toBe("test@jolli.ai");
			expect(response.body.orgUserName).toBe("Test User");
			expect(response.body.orgUserPicture).toBe("https://example.com/pic.jpg");
			expect(mockGlobalUserDao.findUserByEmail).toHaveBeenCalledWith("test@jolli.ai");
		});

		it("should use global_users.image as picture", async () => {
			const globalUser = createMockGlobalUser({
				image: "https://example.com/global-image.png",
			});
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			// image field from global_users should map to picture
			expect(response.body.orgUserPicture).toBe("https://example.com/global-image.png");
		});

		it("should handle undefined image field", async () => {
			// Create user without image field (omit it from the mock)
			const { image: _unused, ...userWithoutImage } = createMockGlobalUser();
			const globalUser = userWithoutImage as GlobalUser;
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.orgUserPicture).toBeUndefined();
		});

		it("should return 401 and clear cookies when user account is inactive", async () => {
			const inactiveUser = createMockGlobalUser({ isActive: false });
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(inactiveUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Account is inactive" });
			expect(clearAuthCookie).toHaveBeenCalled();
			expect(clearRememberMeCookie).toHaveBeenCalled();
		});

		it("should not set orgUser when global user not found", async () => {
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(false);
			expect(mockGlobalUserDao.findUserByEmail).toHaveBeenCalledWith("test@jolli.ai");
		});

		it("should return 500 if database error occurs", async () => {
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockRejectedValue(new Error("DB connection failed"));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to look up user" });
		});

		it("should use email from JWT to look up global user", async () => {
			// Create token with different email
			const differentEmailToken = tokenUtil.generateToken({
				userId: 99,
				name: "Different User",
				email: "different@jolli.ai",
				picture: "https://example.com/different.jpg",
			});

			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(undefined);

			await request(app).get("/test").set("Cookie", `authToken=${differentEmailToken}`);

			// Should look up by the email in the JWT
			expect(mockGlobalUserDao.findUserByEmail).toHaveBeenCalledWith("different@jolli.ai");
		});
	});

	describe("tenant-level isActive check", () => {
		let mockActiveUserDao: Pick<ActiveUserDao, "findById">;
		let mockActiveUserDaoProvider: DaoProvider<ActiveUserDao>;

		beforeEach(async () => {
			mockActiveUserDao = {
				findById: vi.fn(),
			};
			mockActiveUserDaoProvider = {
				getDao: vi.fn().mockReturnValue(mockActiveUserDao),
			};

			// Mock getTenantContext to return a valid context
			const { getTenantContext } = await import("../tenant/TenantContext");
			vi.mocked(getTenantContext).mockReturnValue({} as ReturnType<typeof getTenantContext>);
		});

		it("should return 401 when user is inactive in tenant", async () => {
			const globalUser = createMockGlobalUser();
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 42,
				email: "test@jolli.ai",
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: false,
				name: "Test User",
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			app.use(
				createUserProvisioningMiddleware(
					tokenUtil,
					mockGlobalUserDao,
					mockActiveUserDaoProvider as DaoProvider<ActiveUserDao>,
				),
			);
			app.get("/test", (req, res) => res.json({ hasOrgUser: !!req.orgUser }));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Account is inactive" });
			expect(mockActiveUserDao.findById).toHaveBeenCalledWith(42);
			expect(clearAuthCookie).toHaveBeenCalled();
			expect(clearRememberMeCookie).toHaveBeenCalled();
		});

		it("should allow request when user is active in tenant", async () => {
			const globalUser = createMockGlobalUser();
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue({
				id: 42,
				email: "test@jolli.ai",
				role: "member",
				roleId: null,
				isAgent: false,
				isActive: true,
				name: "Test User",
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			app.use(
				createUserProvisioningMiddleware(
					tokenUtil,
					mockGlobalUserDao,
					mockActiveUserDaoProvider as DaoProvider<ActiveUserDao>,
				),
			);
			app.get("/test", (req, res) => res.json({ hasOrgUser: !!req.orgUser }));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
		});

		it("should allow request when user has no tenant record", async () => {
			const globalUser = createMockGlobalUser();
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);
			vi.mocked(mockActiveUserDao.findById).mockResolvedValue(undefined);

			app.use(
				createUserProvisioningMiddleware(
					tokenUtil,
					mockGlobalUserDao,
					mockActiveUserDaoProvider as DaoProvider<ActiveUserDao>,
				),
			);
			app.get("/test", (req, res) => res.json({ hasOrgUser: !!req.orgUser }));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
		});

		it("should skip tenant check when no activeUserDaoProvider", async () => {
			const globalUser = createMockGlobalUser();
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);

			// No activeUserDaoProvider passed
			app.use(createUserProvisioningMiddleware(tokenUtil, mockGlobalUserDao));
			app.get("/test", (req, res) => res.json({ hasOrgUser: !!req.orgUser }));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
			expect(mockActiveUserDao.findById).not.toHaveBeenCalled();
		});

		it("should skip tenant check when no tenant context", async () => {
			const { getTenantContext } = await import("../tenant/TenantContext");
			vi.mocked(getTenantContext).mockReturnValue(undefined);

			const globalUser = createMockGlobalUser();
			vi.mocked(mockGlobalUserDao.findUserByEmail).mockResolvedValue(globalUser);

			app.use(
				createUserProvisioningMiddleware(
					tokenUtil,
					mockGlobalUserDao,
					mockActiveUserDaoProvider as DaoProvider<ActiveUserDao>,
				),
			);
			app.get("/test", (req, res) => res.json({ hasOrgUser: !!req.orgUser }));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
			expect(mockActiveUserDao.findById).not.toHaveBeenCalled();
		});
	});

	describe("getOrgUserId helper", () => {
		it("should return orgUser.id when available", () => {
			const req = {
				orgUser: { id: 42, email: "test@jolli.ai", name: "Test", picture: undefined },
				cookies: { authToken },
			} as unknown as express.Request;

			const userId = getOrgUserId(req, tokenUtil);
			expect(userId).toBe(42);
		});

		it("should fall back to JWT userId when orgUser not set", () => {
			const req = {
				cookies: { authToken },
				headers: {},
			} as unknown as express.Request;

			const userId = getOrgUserId(req, tokenUtil);
			expect(userId).toBe(1); // From JWT
		});

		it("should return undefined when not authenticated", () => {
			const req = {
				cookies: {},
			} as unknown as express.Request;

			const userId = getOrgUserId(req, tokenUtil);
			expect(userId).toBeUndefined();
		});
	});
});
