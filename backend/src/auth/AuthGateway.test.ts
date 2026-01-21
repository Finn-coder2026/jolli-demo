import * as Config from "../config/Config";
import {
	buildAuthGatewayRedirectUrl,
	createMultiTenantConnectMiddleware,
	getAuthGatewayUrl,
	getSubdomain,
	isAuthGateway,
	isMultiTenantAuthEnabled,
	isValidReturnToUrl,
} from "./AuthGateway";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("AuthGateway", () => {
	describe("isAuthGateway", () => {
		it("should return true for auth gateway domain", () => {
			expect(isAuthGateway("auth.jolli.ai", "jolli.ai")).toBe(true);
		});

		it("should return true for auth gateway domain with port", () => {
			expect(isAuthGateway("auth.jolli.ai:443", "jolli.ai")).toBe(true);
		});

		it("should return false for tenant subdomain", () => {
			expect(isAuthGateway("acme.jolli.ai", "jolli.ai")).toBe(false);
		});

		it("should return false for base domain", () => {
			expect(isAuthGateway("jolli.ai", "jolli.ai")).toBe(false);
		});

		it("should return false for unrelated domain", () => {
			expect(isAuthGateway("example.com", "jolli.ai")).toBe(false);
		});
	});

	describe("getSubdomain", () => {
		it("should extract subdomain from host", () => {
			expect(getSubdomain("acme.jolli.ai", "jolli.ai")).toBe("acme");
		});

		it("should extract subdomain from host with port", () => {
			expect(getSubdomain("acme.jolli.ai:443", "jolli.ai")).toBe("acme");
		});

		it("should return 'jolli' for base domain (default tenant)", () => {
			expect(getSubdomain("jolli.ai", "jolli.ai")).toBe("jolli");
		});

		it("should return null for unrelated domain", () => {
			expect(getSubdomain("example.com", "jolli.ai")).toBe(null);
		});

		it("should handle multi-level subdomains", () => {
			expect(getSubdomain("dev.acme.jolli.ai", "jolli.ai")).toBe("dev.acme");
		});

		it("should return auth for auth gateway", () => {
			expect(getSubdomain("auth.jolli.ai", "jolli.ai")).toBe("auth");
		});

		it("should return null for empty subdomain (edge case)", () => {
			// Edge case: hostname is exactly ".baseDomain" which produces empty subdomain
			expect(getSubdomain(".jolli.ai", "jolli.ai")).toBe(null);
		});
	});

	describe("isValidReturnToUrl", () => {
		const originalNodeEnv = process.env.NODE_ENV;

		it("should accept valid tenant subdomain URL", () => {
			expect(isValidReturnToUrl("https://acme.jolli.ai", "jolli.ai")).toBe(true);
		});

		it("should accept valid tenant subdomain URL with path", () => {
			expect(isValidReturnToUrl("https://acme.jolli.ai/dashboard", "jolli.ai")).toBe(true);
		});

		it("should reject auth gateway URL", () => {
			expect(isValidReturnToUrl("https://auth.jolli.ai", "jolli.ai")).toBe(false);
		});

		it("should accept base domain URL (jolli tenant)", () => {
			expect(isValidReturnToUrl("https://jolli.ai", "jolli.ai")).toBe(true);
		});

		it("should reject unrelated domain URL", () => {
			expect(isValidReturnToUrl("https://example.com", "jolli.ai")).toBe(false);
		});

		it("should reject invalid URL", () => {
			expect(isValidReturnToUrl("not-a-url", "jolli.ai")).toBe(false);
		});

		it("should reject HTTP URLs in production", () => {
			process.env.NODE_ENV = "production";
			try {
				expect(isValidReturnToUrl("http://acme.jolli.ai", "jolli.ai")).toBe(false);
			} finally {
				process.env.NODE_ENV = originalNodeEnv;
			}
		});

		it("should accept HTTP URLs in development", () => {
			process.env.NODE_ENV = "development";
			try {
				expect(isValidReturnToUrl("http://acme.jolli.ai", "jolli.ai")).toBe(true);
			} finally {
				process.env.NODE_ENV = originalNodeEnv;
			}
		});
	});

	describe("getAuthGatewayUrl", () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it("should return auth gateway URL when BASE_DOMAIN is set", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
				ORIGIN: "http://localhost:7034",
			} as ReturnType<typeof Config.getConfig>);

			expect(getAuthGatewayUrl()).toBe("https://auth.jolli.ai");
		});

		it("should fall back to ORIGIN when BASE_DOMAIN is not set", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				BASE_DOMAIN: undefined,
				ORIGIN: "http://localhost:7034",
			} as ReturnType<typeof Config.getConfig>);

			expect(getAuthGatewayUrl()).toBe("http://localhost:7034");
		});
	});

	describe("isMultiTenantAuthEnabled", () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it("should return true when USE_MULTI_TENANT_AUTH is enabled", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				USE_MULTI_TENANT_AUTH: true,
			} as ReturnType<typeof Config.getConfig>);

			expect(isMultiTenantAuthEnabled()).toBe(true);
		});

		it("should return false when USE_MULTI_TENANT_AUTH is disabled", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				USE_MULTI_TENANT_AUTH: false,
			} as ReturnType<typeof Config.getConfig>);

			expect(isMultiTenantAuthEnabled()).toBe(false);
		});
	});

	describe("buildAuthGatewayRedirectUrl", () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it("should build correct auth gateway URL", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
				ORIGIN: "http://localhost:7034",
			} as ReturnType<typeof Config.getConfig>);

			const url = buildAuthGatewayRedirectUrl("google", "acme", "https://acme.jolli.ai");

			expect(url).toBe("https://auth.jolli.ai/connect/google?tenant=acme&returnTo=https%3A%2F%2Facme.jolli.ai");
		});

		it("should encode special characters in parameters", () => {
			vi.spyOn(Config, "getConfig").mockReturnValue({
				BASE_DOMAIN: "jolli.ai",
				ORIGIN: "http://localhost:7034",
			} as ReturnType<typeof Config.getConfig>);

			const url = buildAuthGatewayRedirectUrl("google", "my-tenant", "https://my-tenant.jolli.ai/path?foo=bar");

			expect(url).toContain("tenant=my-tenant");
			expect(url).toContain("returnTo=https%3A%2F%2Fmy-tenant.jolli.ai%2Fpath%3Ffoo%3Dbar");
		});
	});

	describe("createMultiTenantConnectMiddleware", () => {
		let mockReq: Partial<Request>;
		let mockRes: Partial<Response>;
		let mockNext: NextFunction;

		function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
			return {
				headers: {},
				path: "/google",
				query: {},
				session: {} as Request["session"],
				...overrides,
			} as unknown as Partial<Request>;
		}

		beforeEach(() => {
			mockReq = createMockReq();
			mockRes = {
				status: vi.fn().mockReturnThis(),
				json: vi.fn().mockReturnThis(),
				redirect: vi.fn(),
			};
			mockNext = vi.fn();
		});

		it("should call next when no host is present", () => {
			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
		});

		it("should redirect tenant subdomain to auth gateway", () => {
			mockReq.headers = { host: "tenant.example.com", "x-forwarded-proto": "https" };

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockRes.redirect).toHaveBeenCalledWith(
				"https://auth.example.com/connect/google?tenant=tenant&returnTo=https%3A%2F%2Ftenant.example.com",
			);
		});

		it("should not redirect callback requests", () => {
			mockReq = createMockReq({
				headers: { host: "tenant.example.com" },
				path: "/google/callback",
			});

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
			expect(mockRes.redirect).not.toHaveBeenCalled();
		});

		it("should return 400 when auth gateway request is missing tenant", () => {
			mockReq.headers = { host: "auth.example.com" };
			mockReq.query = { returnTo: "https://tenant.example.com" };

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockRes.status).toHaveBeenCalledWith(400);
			expect(mockRes.json).toHaveBeenCalledWith({ error: "Missing tenant or returnTo parameter" });
		});

		it("should return 400 when auth gateway request is missing returnTo", () => {
			mockReq.headers = { host: "auth.example.com" };
			mockReq.query = { tenant: "acme" };

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockRes.status).toHaveBeenCalledWith(400);
			expect(mockRes.json).toHaveBeenCalledWith({ error: "Missing tenant or returnTo parameter" });
		});

		it("should return 400 when returnTo URL is invalid", () => {
			mockReq.headers = { host: "auth.example.com" };
			mockReq.query = { tenant: "acme", returnTo: "https://evil.com" };

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockRes.status).toHaveBeenCalledWith(400);
			expect(mockRes.json).toHaveBeenCalledWith({ error: "Invalid returnTo URL" });
		});

		it("should store gateway auth in session and redirect with OAuth config", () => {
			mockReq.headers = { host: "auth.example.com", "x-forwarded-proto": "https" };
			mockReq.query = { tenant: "acme", returnTo: "https://acme.example.com" };

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockReq.session?.gatewayAuth).toEqual({
				tenantSlug: "acme",
				returnTo: "https://acme.example.com",
			});
			expect(mockReq.session?.oauthOrigin).toBe("https://auth.example.com");
			expect(mockRes.redirect).toHaveBeenCalledWith(
				expect.stringContaining("/connect/google?tenant=acme&returnTo="),
			);
		});

		it("should call next on auth gateway callback", () => {
			mockReq = createMockReq({
				headers: { host: "auth.example.com" },
				path: "/google/callback",
				query: { tenant: "acme", returnTo: "https://acme.example.com" },
			});

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
		});

		it("should call next when redirect_uri is already set", () => {
			mockReq.headers = { host: "auth.example.com" };
			mockReq.query = {
				tenant: "acme",
				returnTo: "https://acme.example.com",
				redirect_uri: "https://auth.example.com/connect/google/callback",
			};

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
		});

		it("should call next for unrecognized hosts", () => {
			mockReq.headers = { host: "other.domain.com" };

			const middleware = createMultiTenantConnectMiddleware("example.com");
			middleware(mockReq as Request, mockRes as Response, mockNext);

			expect(mockNext).toHaveBeenCalled();
		});
	});
});
