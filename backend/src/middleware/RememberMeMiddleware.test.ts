import * as Config from "../config/Config";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { UserOrgDao } from "../dao/UserOrgDao";
import type { RememberMeService, TokenValidationResult } from "../services/RememberMeService";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getTenantContext } from "../tenant/TenantContext";
import * as Cookies from "../util/Cookies";
import type { TokenUtil } from "../util/TokenUtil";
import { createRememberMeMiddleware } from "./RememberMeMiddleware";
import type { NextFunction, Request, Response } from "express";
import type { UserInfo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/Config");
vi.mock("../util/Cookies");
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

describe("RememberMeMiddleware", () => {
	let mockRememberMeService: RememberMeService;
	let mockGlobalUserDao: GlobalUserDao;
	let mockUserOrgDao: UserOrgDao;
	let mockTokenUtil: TokenUtil<UserInfo>;
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let mockNext: NextFunction;

	const mockUser = {
		id: 123,
		email: "test@example.com",
		name: "Test User",
		image: "https://example.com/avatar.png",
		emailVerified: true,
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockRememberMeService = {
			createToken: vi.fn(),
			validateToken: vi.fn(),
			revokeToken: vi.fn(),
			revokeAllTokensForUser: vi.fn(),
			cleanupExpiredTokens: vi.fn(),
		} as unknown as RememberMeService;

		mockGlobalUserDao = {
			findUserById: vi.fn(),
			findUserByEmail: vi.fn(),
			createUser: vi.fn(),
			updateUser: vi.fn(),
			deleteUser: vi.fn(),
		} as unknown as GlobalUserDao;

		mockUserOrgDao = {
			getUserOrgs: vi.fn().mockResolvedValue([]),
			getUserTenants: vi.fn().mockResolvedValue([]),
			createUserOrg: vi.fn(),
			updateLastAccessed: vi.fn(),
			setDefaultTenant: vi.fn(),
			deleteUserOrg: vi.fn(),
		} as unknown as UserOrgDao;

		mockTokenUtil = {
			decodePayload: vi.fn(),
			generateToken: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		mockRequest = {
			cookies: {},
			headers: {},
			ip: "192.168.1.1",
			socket: { remoteAddress: "192.168.1.1" },
		} as Partial<Request>;

		mockResponse = {
			setHeader: vi.fn().mockReturnThis(),
			getHeader: vi.fn(),
			redirect: vi.fn(),
		} as Partial<Response>;

		mockNext = vi.fn();

		vi.mocked(Config.getConfig).mockReturnValue({
			REMEMBER_ME_ENABLED: true,
			REMEMBER_ME_DURATION: "30d",
			NODE_ENV: "development",
		} as never);

		vi.mocked(Cookies.clearRememberMeCookie).mockImplementation(() => {
			// Mock implementation - no-op
		});
		vi.mocked(Cookies.issueAuthCookie).mockImplementation(() => {
			// Mock implementation - no-op
		});
		vi.mocked(Cookies.resolveCookieDomain).mockReturnValue(undefined);
		vi.mocked(Cookies.buildRememberMeCookieValue).mockReturnValue("remember_me_token=newtoken");
	});

	describe("when remember-me is disabled", () => {
		it("should call next without processing", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: false,
			} as never);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
			expect(mockRememberMeService.validateToken).not.toHaveBeenCalled();
		});
	});

	describe("when request is for login endpoint", () => {
		it("should skip remember-me processing for /auth/sign-in/email", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithSignIn = {
				...mockRequest,
				path: "/auth/sign-in/email",
				cookies: { remember_me_token: "validtoken" },
			} as unknown as Request;

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithSignIn, mockResponse as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
			expect(mockRememberMeService.validateToken).not.toHaveBeenCalled();
		});

		it("should NOT skip for other auth endpoints like /auth/callback", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({ valid: false });
			const reqWithCallback = {
				...mockRequest,
				path: "/auth/callback",
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
			} as unknown as Request;

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithCallback, mockResponse as Response, mockNext);

			// validateToken should be called because /auth/callback is not skipped
			expect(mockRememberMeService.validateToken).toHaveBeenCalled();
		});
	});

	describe("when user is already authenticated", () => {
		it("should call next without processing when user has valid authToken and remember_me_token", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue({
				userId: 123,
				email: "test@example.com",
				name: "Test",
				picture: undefined,
			});
			// Must have remember_me_token cookie to reach the "already authenticated" check
			mockRequest.cookies = { remember_me_token: "existingtoken" };

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
			expect(mockRememberMeService.validateToken).not.toHaveBeenCalled();
		});
	});

	describe("when no remember-me cookie is present", () => {
		it("should call next without processing", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = {};

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
			expect(mockRememberMeService.validateToken).not.toHaveBeenCalled();
		});
	});

	describe("when remember-me token is invalid", () => {
		it("should clear cookie and call next", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "invalidtoken" };
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: false,
			});

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(Cookies.clearRememberMeCookie).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});
	});

	describe("when user is not found for valid token", () => {
		it("should clear cookie and call next", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			mockRequest.headers = { "user-agent": "Mozilla/5.0" };
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(undefined);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(Cookies.clearRememberMeCookie).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});
	});

	describe("when user is inactive for valid token", () => {
		it("should clear cookie and call next when user isActive is false", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			mockRequest.headers = { "user-agent": "Mozilla/5.0" };
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			// User exists but is inactive
			const inactiveUser = {
				...mockUser,
				isActive: false,
			};
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(inactiveUser);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(Cookies.clearRememberMeCookie).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
			// Should not generate auth token for inactive user
			expect(mockTokenUtil.generateToken).not.toHaveBeenCalled();
		});
	});

	describe("tenant-level isActive check", () => {
		function setupValidRememberMe(): void {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			mockRequest.headers = { "user-agent": "Mozilla/5.0" };
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
		}

		it("should block auto-login when user is inactive in tenant", async () => {
			setupValidRememberMe();
			const mockActiveUserDao = { findById: vi.fn().mockResolvedValue({ id: 123, isActive: false }) };
			vi.mocked(getTenantContext).mockReturnValue({
				database: { activeUserDao: mockActiveUserDao },
			} as unknown as TenantOrgContext);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(Cookies.clearRememberMeCookie).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
			expect(mockTokenUtil.generateToken).not.toHaveBeenCalled();
			expect(mockActiveUserDao.findById).toHaveBeenCalledWith(123);
		});

		it("should allow auto-login when user is active in tenant", async () => {
			setupValidRememberMe();
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
			const mockActiveUserDao = { findById: vi.fn().mockResolvedValue({ id: 123, isActive: true }) };
			vi.mocked(getTenantContext).mockReturnValue({
				database: { activeUserDao: mockActiveUserDao },
			} as unknown as TenantOrgContext);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.generateToken).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should allow auto-login when user has no tenant record", async () => {
			setupValidRememberMe();
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
			const mockActiveUserDao = { findById: vi.fn().mockResolvedValue(undefined) };
			vi.mocked(getTenantContext).mockReturnValue({
				database: { activeUserDao: mockActiveUserDao },
			} as unknown as TenantOrgContext);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.generateToken).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should skip tenant check when no tenant context", async () => {
			setupValidRememberMe();
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
			vi.mocked(getTenantContext).mockReturnValue(undefined);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.generateToken).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});
	});

	describe("when remember-me token is valid", () => {
		it("should create auth session and call next", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			mockRequest.headers = { "user-agent": "Mozilla/5.0" };
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.generateToken).toHaveBeenCalledWith({
				userId: 123,
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.png",
				tenantId: undefined,
				orgId: undefined,
			});
			expect(Cookies.issueAuthCookie).toHaveBeenCalledWith(mockResponse, "newAuthToken");
			// Should also set authToken in request cookies for downstream handlers
			expect(mockRequest.cookies?.authToken).toBe("newAuthToken");
			expect(mockNext).toHaveBeenCalled();
		});

		it("should set authToken in request cookies even when req.cookies is initially empty", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			// Create request with cookies property that returns remember_me_token but no authToken
			const reqWithPartialCookies = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithPartialCookies, mockResponse as Response, mockNext);

			// Verify authToken is set in request cookies for downstream handlers
			expect(reqWithPartialCookies.cookies?.authToken).toBe("newAuthToken");
		});

		it("should initialize req.cookies when it is undefined and set authToken", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			// Create request where cookies is undefined (simulating scenario where cookie-parser hasn't run)
			// But remember_me_token is readable from headers or other means
			const reqWithNoCookies = {
				...mockRequest,
				cookies: undefined as unknown as Record<string, string>,
				headers: { "user-agent": "Mozilla/5.0", cookie: "remember_me_token=validtoken" },
			} as unknown as Request;

			// Mock the cookie reading to return the token from the raw header
			// In reality, the middleware reads from req.cookies which we'll set after decodePayload
			// For this test, we simulate a request where cookies object gets created
			Object.defineProperty(reqWithNoCookies, "cookies", {
				get() {
					return this._cookies;
				},
				set(value) {
					this._cookies = value;
				},
				configurable: true,
			});
			reqWithNoCookies.cookies = { remember_me_token: "validtoken" };

			// Now simulate that during middleware execution, cookies becomes undefined
			// This tests line 242-244: if (!req.cookies) { req.cookies = {}; }
			const originalCookies = reqWithNoCookies.cookies;
			vi.mocked(mockRememberMeService.validateToken).mockImplementation(() => {
				// During validation, we reset cookies to simulate the scenario
				reqWithNoCookies.cookies = undefined as unknown as Record<string, string>;
				return Promise.resolve({ valid: true, userId: 123 });
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			// Temporarily set cookies back for the middleware to read remember_me_token
			reqWithNoCookies.cookies = originalCookies;

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithNoCookies, mockResponse as Response, mockNext);

			// Verify that req.cookies was initialized and authToken was set
			expect(reqWithNoCookies.cookies).toBeDefined();
			expect(reqWithNoCookies.cookies?.authToken).toBe("newAuthToken");
		});

		it("should include last accessed tenant/org in token", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			mockRequest.headers = { "user-agent": "Mozilla/5.0" };
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.generateToken).toHaveBeenCalledWith({
				userId: 123,
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.png",
				tenantId: "tenant-123",
				orgId: "org-456",
			});
			expect(Cookies.issueAuthCookie).toHaveBeenCalledWith(mockResponse, "newAuthToken");
			expect(mockNext).toHaveBeenCalled();
		});

		it("should redirect to tenant subdomain when BASE_DOMAIN is set and not on tenant subdomain", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithHost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("example.com"),
				protocol: "https",
				originalUrl: "/dashboard",
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithHost, mockResponse as Response, mockNext);

			expect(mockResponse.redirect).toHaveBeenCalledWith(302, "https://acme.example.com/dashboard");
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should redirect using default protocol and root path when request values are missing", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithMissingProtocolAndPath = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("example.com"),
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithMissingProtocolAndPath, mockResponse as Response, mockNext);

			expect(mockResponse.redirect).toHaveBeenCalledWith(302, "https://acme.example.com/");
			expect(mockNext).not.toHaveBeenCalled();
		});

		it("should not redirect when host is not part of BASE_DOMAIN (e.g., localhost)", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqFromLocalhost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("localhost:7034"),
				protocol: "http",
				originalUrl: "/dashboard",
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqFromLocalhost, mockResponse as Response, mockNext);

			// Should NOT redirect because localhost is not part of example.com
			// (cookies wouldn't be shared across domains)
			expect(mockResponse.redirect).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
			// Should still issue auth cookie (auto-login works, just no redirect)
			expect(Cookies.issueAuthCookie).toHaveBeenCalledWith(mockResponse, "newAuthToken");
		});

		it("should not redirect when host header is missing", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithoutHost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue(undefined),
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithoutHost, mockResponse as Response, mockNext);

			expect(mockResponse.redirect).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should not redirect when already on tenant subdomain", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqOnTenantDomain = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("acme.example.com"),
				protocol: "https",
				originalUrl: "/dashboard",
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqOnTenantDomain, mockResponse as Response, mockNext);

			expect(mockResponse.redirect).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should set rotated token cookie when rotation is enabled", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			// Mock resolveCookieDomain to return domain based on BASE_DOMAIN
			vi.mocked(Cookies.resolveCookieDomain).mockReturnValue(".example.com");
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithHost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("example.com"),
			} as unknown as Request;
			const validationResult: TokenValidationResult = {
				valid: true,
				userId: 123,
				newToken: "rotatedtoken",
			};
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue(validationResult);
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
			const getHeaderMock = vi.fn().mockReturnValue("authToken=abc");
			mockResponse.getHeader = getHeaderMock;

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithHost, mockResponse as Response, mockNext);

			expect(Cookies.buildRememberMeCookieValue).toHaveBeenCalledWith(
				"rotatedtoken",
				".example.com",
				expect.any(Number),
				false,
			);
			expect(mockResponse.setHeader).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should append to existing Set-Cookie headers when they exist as array", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(Cookies.resolveCookieDomain).mockReturnValue(".example.com");
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithHost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("example.com"),
			} as unknown as Request;
			const validationResult: TokenValidationResult = {
				valid: true,
				userId: 123,
				newToken: "rotatedtoken",
			};
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue(validationResult);
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
			// Mock getHeader to return an array of existing cookies
			mockResponse.getHeader = vi.fn().mockReturnValue(["session=abc", "tracking=xyz"]);

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithHost, mockResponse as Response, mockNext);

			// Verify setHeader was called with array containing both old and new cookies
			expect(mockResponse.setHeader).toHaveBeenCalledWith(
				"Set-Cookie",
				expect.arrayContaining(["session=abc", "tracking=xyz", "remember_me_token=newtoken"]),
			);
		});

		it("should set rotated token cookie without domain when on localhost", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithLocalhost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("localhost:7034"),
			} as unknown as Request;
			const validationResult: TokenValidationResult = {
				valid: true,
				userId: 123,
				newToken: "rotatedtoken",
			};
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue(validationResult);
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
			mockResponse.getHeader = vi.fn().mockReturnValue("authToken=abc");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithLocalhost, mockResponse as Response, mockNext);

			// Cookie should be set without domain (host-only cookie for localhost)
			expect(Cookies.buildRememberMeCookieValue).toHaveBeenCalledWith(
				"rotatedtoken",
				undefined,
				expect.any(Number),
				false,
			);
			expect(mockResponse.setHeader).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should handle user without image", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			// Create user without image property (not null/undefined, just omitted)
			const userWithoutImage = {
				id: 123,
				email: "test@example.com",
				name: "Test User",
				emailVerified: true,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(userWithoutImage);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(mockTokenUtil.generateToken).toHaveBeenCalledWith({
				userId: 123,
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				tenantId: undefined,
				orgId: undefined,
			});
		});
	});

	describe("error handling", () => {
		it("should clear cookie and call next on validation error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			mockRequest.cookies = { remember_me_token: "validtoken" };
			vi.mocked(mockRememberMeService.validateToken).mockRejectedValue(new Error("Database error"));

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(mockRequest as Request, mockResponse as Response, mockNext);

			expect(Cookies.clearRememberMeCookie).toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});
	});

	describe("tenant redirect edge cases", () => {
		function setupRedirectScenario(): void {
			vi.mocked(Config.getConfig).mockReturnValue({
				REMEMBER_ME_ENABLED: true,
				REMEMBER_ME_DURATION: "30d",
				NODE_ENV: "development",
				BASE_DOMAIN: "example.com",
			} as never);
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: true,
				userId: 123,
			});
			vi.mocked(mockGlobalUserDao.findUserById).mockResolvedValue(mockUser);
			vi.mocked(mockUserOrgDao.getUserTenants).mockResolvedValue([
				{
					tenantId: "tenant-123",
					orgId: "org-456",
					tenantSlug: "acme",
					tenantName: "Acme Corp",
					orgSlug: "main",
					orgName: "Main Org",
					role: "admin",
					isDefault: true,
					lastAccessedAt: new Date(),
					url: "https://acme.example.com/dashboard",
				},
			]);
			vi.mocked(mockTokenUtil.generateToken).mockReturnValue("newAuthToken");
		}

		it("should use fallback empty host when req.get('host') returns undefined", async () => {
			setupRedirectScenario();
			const reqNoHost = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue(undefined),
				protocol: "https",
				originalUrl: "/dashboard",
			} as unknown as Request;

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqNoHost, mockResponse as Response, mockNext);

			// Empty host is not part of BASE_DOMAIN, so no redirect
			expect(mockResponse.redirect).not.toHaveBeenCalled();
			expect(mockNext).toHaveBeenCalled();
		});

		it("should use fallback protocol and path when req.protocol and req.originalUrl are missing", async () => {
			setupRedirectScenario();
			const reqWithoutProtocol = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				headers: { "user-agent": "Mozilla/5.0" },
				get: vi.fn().mockReturnValue("example.com"),
				protocol: "",
				originalUrl: "",
			} as unknown as Request;

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithoutProtocol, mockResponse as Response, mockNext);

			// Should redirect using fallback protocol "https" and path "/"
			expect(mockResponse.redirect).toHaveBeenCalledWith(302, "https://acme.example.com/");
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe("IP address extraction", () => {
		it("should use req.ip when available", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithIp = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				ip: "10.0.0.1",
			} as Partial<Request>;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: false,
			});

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithIp as Request, mockResponse as Response, mockNext);

			expect(mockRememberMeService.validateToken).toHaveBeenCalledWith("validtoken", undefined, "10.0.0.1");
		});

		it("should fallback to socket.remoteAddress when req.ip is not available", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			const reqWithSocket = {
				...mockRequest,
				cookies: { remember_me_token: "validtoken" },
				ip: undefined,
				socket: { remoteAddress: "10.0.0.2" },
			} as unknown as Request;

			vi.mocked(mockRememberMeService.validateToken).mockResolvedValue({
				valid: false,
			});

			const middleware = createRememberMeMiddleware({
				rememberMeService: mockRememberMeService,
				globalUserDao: mockGlobalUserDao,
				userOrgDao: mockUserOrgDao,
				tokenUtil: mockTokenUtil,
			});

			await middleware(reqWithSocket, mockResponse as Response, mockNext);

			expect(mockRememberMeService.validateToken).toHaveBeenCalledWith("validtoken", undefined, "10.0.0.2");
		});
	});
});
