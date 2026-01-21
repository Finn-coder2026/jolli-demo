import type { Database } from "../core/Database";
import type { DaoProvider } from "../dao/DaoProvider";
import type { UserDao } from "../dao/UserDao";
import type { User } from "../model/User";
import { createTenantOrgContext, runWithTenantContext, type TenantOrgContext } from "../tenant/TenantContext";
import { createTokenUtil } from "./TokenUtil";
import { createUserProvisioningMiddleware, getOrgUserId } from "./UserProvisioningMiddleware";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { Org, Tenant, UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("UserProvisioningMiddleware", () => {
	let app: Express;
	let mockUserDao: UserDao;
	let mockUserDaoProvider: DaoProvider<UserDao>;
	let authToken: string;
	let mockTenant: Tenant;
	let mockOrg: Org;
	let mockDatabase: Database;
	let mockContext: TenantOrgContext;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	function createMockTenant(overrides: Partial<Tenant> = {}): Tenant {
		return {
			id: "tenant-123",
			slug: "test-tenant",
			displayName: "Test Tenant",
			status: "active",
			deploymentType: "shared",
			databaseProviderId: "provider-123",
			configs: {},
			configsUpdatedAt: null,
			featureFlags: {},
			primaryDomain: null,
			createdAt: new Date("2024-01-01"),
			updatedAt: new Date("2024-01-01"),
			provisionedAt: new Date("2024-01-01"),
			...overrides,
		};
	}

	function createMockOrg(overrides: Partial<Org> = {}): Org {
		return {
			id: "org-123",
			tenantId: "tenant-123",
			slug: "engineering",
			displayName: "Engineering",
			schemaName: "org_engineering",
			status: "active",
			isDefault: false,
			createdAt: new Date("2024-01-01"),
			updatedAt: new Date("2024-01-01"),
			...overrides,
		};
	}

	function createMockDatabase(userDao: UserDao): Database {
		return { userDao } as Database;
	}

	beforeEach(() => {
		// Set up mock UserDao
		mockUserDao = {
			countUsers: vi.fn(),
			findUser: vi.fn(),
			findUserById: vi.fn(),
			createUser: vi.fn(),
			updateUser: vi.fn(),
		};

		mockUserDaoProvider = {
			getDao: vi.fn().mockReturnValue(mockUserDao),
		};

		// Set up tenant context
		mockTenant = createMockTenant();
		mockOrg = createMockOrg();
		mockDatabase = createMockDatabase(mockUserDao);
		mockContext = createTenantOrgContext(mockTenant, mockOrg, mockDatabase);

		// Generate valid auth token
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});

		// Set up express app without tenant context by default
		app = express();
		app.use(cookieParser());
		app.use(express.json());
	});

	describe("without tenant context (single-tenant mode)", () => {
		it("should skip provisioning and call next", async () => {
			app.use(createUserProvisioningMiddleware(mockUserDaoProvider, tokenUtil));
			app.get("/test", (req, res) => {
				res.json({
					hasOrgUser: !!req.orgUser,
				});
			});

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(false);
			expect(mockUserDaoProvider.getDao).not.toHaveBeenCalled();
		});
	});

	describe("without JWT token (unauthenticated)", () => {
		it("should skip provisioning and call next", async () => {
			// Set up app with tenant context
			app.use((req, res, next) => {
				runWithTenantContext(mockContext, () => {
					createUserProvisioningMiddleware(mockUserDaoProvider, tokenUtil)(req, res, next);
				});
			});
			app.get("/test", (req, res) => {
				res.json({
					hasOrgUser: !!req.orgUser,
				});
			});

			// No auth token
			const response = await request(app).get("/test");

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(false);
			expect(mockUserDaoProvider.getDao).not.toHaveBeenCalled();
		});
	});

	describe("with tenant context and JWT token", () => {
		beforeEach(() => {
			// Set up app with tenant context
			app.use((req, res, next) => {
				runWithTenantContext(mockContext, () => {
					createUserProvisioningMiddleware(mockUserDaoProvider, tokenUtil)(req, res, next);
				});
			});
			app.get("/test", (req, res) => {
				res.json({
					hasOrgUser: !!req.orgUser,
					orgUserId: req.orgUser?.id,
					orgUserEmail: req.orgUser?.email,
				});
			});
		});

		it("should create user if not found in org schema", async () => {
			vi.mocked(mockUserDao.findUser).mockResolvedValue(undefined);
			vi.mocked(mockUserDao.createUser).mockResolvedValue({
				id: 42, // Different from JWT userId (1)
				email: "test@jolli.ai",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
				isAgent: false,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			});

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
			expect(response.body.orgUserId).toBe(42);
			expect(response.body.orgUserEmail).toBe("test@jolli.ai");
			expect(mockUserDao.findUser).toHaveBeenCalledWith("test@jolli.ai");
			expect(mockUserDao.createUser).toHaveBeenCalledWith({
				email: "test@jolli.ai",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
			});
		});

		it("should use existing user if found in org schema", async () => {
			const existingUser: User = {
				id: 99,
				email: "test@jolli.ai",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
				isAgent: false,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};
			vi.mocked(mockUserDao.findUser).mockResolvedValue(existingUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.hasOrgUser).toBe(true);
			expect(response.body.orgUserId).toBe(99);
			expect(mockUserDao.findUser).toHaveBeenCalledWith("test@jolli.ai");
			expect(mockUserDao.createUser).not.toHaveBeenCalled();
		});

		it("should update user info if name/picture changed", async () => {
			const existingUser: User = {
				id: 99,
				email: "test@jolli.ai",
				name: "Old Name",
				picture: "https://example.com/old-pic.jpg",
				isAgent: false,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};
			const updatedUser: User = {
				id: 99,
				email: "test@jolli.ai",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
				isAgent: false,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};
			vi.mocked(mockUserDao.findUser).mockResolvedValue(existingUser);
			vi.mocked(mockUserDao.updateUser).mockResolvedValue(updatedUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(response.body.orgUserId).toBe(99);
			expect(mockUserDao.updateUser).toHaveBeenCalledWith({
				...existingUser,
				name: "Test User",
				picture: "https://example.com/pic.jpg",
			});
		});

		it("should not update user if info unchanged", async () => {
			const existingUser: User = {
				id: 99,
				email: "test@jolli.ai",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
				isAgent: false,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			};
			vi.mocked(mockUserDao.findUser).mockResolvedValue(existingUser);

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(200);
			expect(mockUserDao.updateUser).not.toHaveBeenCalled();
		});

		it("should return 500 if database error occurs", async () => {
			vi.mocked(mockUserDao.findUser).mockRejectedValue(new Error("DB connection failed"));

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to provision user" });
		});

		it("should use email as stable identifier across schemas", async () => {
			// User has ID 1 in default schema (from JWT), but ID 42 in engineering schema
			vi.mocked(mockUserDao.findUser).mockResolvedValue(undefined);
			vi.mocked(mockUserDao.createUser).mockResolvedValue({
				id: 42,
				email: "test@jolli.ai",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
				isAgent: false,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-01"),
			});

			const response = await request(app).get("/test").set("Cookie", `authToken=${authToken}`);

			// req.orgUser should have the org-specific ID (42), not the JWT ID (1)
			expect(response.body.orgUserId).toBe(42);
			expect(mockUserDao.findUser).toHaveBeenCalledWith("test@jolli.ai");
		});
	});

	describe("getOrgUserId helper", () => {
		it("should return orgUser.id when available (multi-tenant)", () => {
			const req = {
				orgUser: { id: 42, email: "test@jolli.ai", name: "Test", picture: undefined },
				cookies: { authToken },
			} as unknown as express.Request;

			const userId = getOrgUserId(req, tokenUtil);
			expect(userId).toBe(42);
		});

		it("should fall back to JWT userId when orgUser not set (single-tenant)", () => {
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
