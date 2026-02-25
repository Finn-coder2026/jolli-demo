import { getConfig } from "../config/Config";
import {
	buildAuthCookieValue,
	buildClearAuthCookieValue,
	buildClearRememberMeCookieValue,
	buildRememberMeCookieValue,
	clearAuthCookie,
	clearRememberMeCookie,
	issueAuthCookie,
	issueRememberMeCookie,
	issueVisitorCookie,
	RedisStore,
} from "./Cookies";
import type { Request, Response } from "express-serve-static-core";
import type { SessionData } from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./Env", () => ({
	getEnvOrError: vi.fn((key: string) => {
		if (key === "SESSION_SECRET") {
			return "test-session-secret";
		}
		if (key === "ORIGIN") {
			return "https://localhost:8034";
		}
		return "";
	}),
}));

vi.mock("../config/Config");

describe("RedisStore", () => {
	let mockRedis: {
		get: ReturnType<typeof vi.fn>;
		setex: ReturnType<typeof vi.fn>;
		del: ReturnType<typeof vi.fn>;
		expire: ReturnType<typeof vi.fn>;
	};
	let store: RedisStore;

	beforeEach(() => {
		mockRedis = {
			get: vi.fn(),
			setex: vi.fn(),
			del: vi.fn(),
			expire: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Test mock
		store = new RedisStore(mockRedis as any, { prefix: "test:", ttl: 3600 });
	});

	describe("constructor defaults", () => {
		it("should use default prefix and ttl when options are empty", async () => {
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			const storeWithDefaults = new RedisStore(mockRedis as any, {});
			const sessionData: Partial<SessionData> = { userId: 123 };
			const callback = vi.fn();

			mockRedis.setex.mockResolvedValue("OK");

			await storeWithDefaults.set("test-session-id", sessionData as SessionData, callback);

			// Default prefix is "session:" and default ttl is 86400
			expect(mockRedis.setex).toHaveBeenCalledWith("session:test-session-id", 86400, JSON.stringify(sessionData));
		});

		it("should use default prefix when prefix is not provided", async () => {
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			const storeWithDefaultPrefix = new RedisStore(mockRedis as any, { ttl: 1800 });
			const sessionData: Partial<SessionData> = { userId: 123 };
			const callback = vi.fn();

			mockRedis.setex.mockResolvedValue("OK");

			await storeWithDefaultPrefix.set("test-session-id", sessionData as SessionData, callback);

			// Default prefix is "session:", custom ttl is 1800
			expect(mockRedis.setex).toHaveBeenCalledWith("session:test-session-id", 1800, JSON.stringify(sessionData));
		});

		it("should use default ttl when ttl is not provided", async () => {
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			const storeWithDefaultTtl = new RedisStore(mockRedis as any, { prefix: "custom:" });
			const sessionData: Partial<SessionData> = { userId: 123 };
			const callback = vi.fn();

			mockRedis.setex.mockResolvedValue("OK");

			await storeWithDefaultTtl.set("test-session-id", sessionData as SessionData, callback);

			// Custom prefix is "custom:", default ttl is 86400
			expect(mockRedis.setex).toHaveBeenCalledWith("custom:test-session-id", 86400, JSON.stringify(sessionData));
		});
	});

	describe("get", () => {
		it("should retrieve session data from Redis", async () => {
			const sessionData: Partial<SessionData> = { userId: 123 };
			const callback = vi.fn();

			mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));

			await store.get("test-session-id", callback);

			expect(mockRedis.get).toHaveBeenCalledWith("test:test-session-id");
			expect(callback).toHaveBeenCalledWith(null, sessionData);
		});

		it("should return null when session does not exist", async () => {
			const callback = vi.fn();

			mockRedis.get.mockResolvedValue(null);

			await store.get("test-session-id", callback);

			expect(callback).toHaveBeenCalledWith(null, null);
		});

		it("should call callback with error when get fails", async () => {
			const callback = vi.fn();
			const error = new Error("Redis error");

			mockRedis.get.mockRejectedValue(error);

			await store.get("test-session-id", callback);

			expect(callback).toHaveBeenCalledWith(error);
		});
	});

	describe("set", () => {
		it("should store session data in Redis", async () => {
			const sessionData: Partial<SessionData> = {
				userId: 123,
				// biome-ignore lint/suspicious/noExplicitAny: Partial cookie object for testing
				cookie: { maxAge: 7200000, originalMaxAge: 7200000 } as any,
			};
			const callback = vi.fn();

			mockRedis.setex.mockResolvedValue("OK");

			await store.set("test-session-id", sessionData as SessionData, callback);

			expect(mockRedis.setex).toHaveBeenCalledWith("test:test-session-id", 7200, JSON.stringify(sessionData));
			expect(callback).toHaveBeenCalledWith();
		});

		it("should use default TTL when session cookie has no maxAge", async () => {
			const sessionData: Partial<SessionData> = { userId: 123 };
			const callback = vi.fn();

			mockRedis.setex.mockResolvedValue("OK");

			await store.set("test-session-id", sessionData as SessionData, callback);

			expect(mockRedis.setex).toHaveBeenCalledWith("test:test-session-id", 3600, JSON.stringify(sessionData));
			expect(callback).toHaveBeenCalledWith();
		});

		it("should call callback with error when setex fails", async () => {
			const sessionData: Partial<SessionData> = { userId: 123 };
			const callback = vi.fn();
			const error = new Error("Redis error");

			mockRedis.setex.mockRejectedValue(error);

			await store.set("test-session-id", sessionData as SessionData, callback);

			expect(callback).toHaveBeenCalledWith(error);
		});
	});

	describe("destroy", () => {
		it("should delete session from Redis", async () => {
			const callback = vi.fn();

			mockRedis.del.mockResolvedValue(1);

			await store.destroy("test-session-id", callback);

			expect(mockRedis.del).toHaveBeenCalledWith("test:test-session-id");
			expect(callback).toHaveBeenCalledWith();
		});

		it("should call callback with error when delete fails", async () => {
			const callback = vi.fn();
			const error = new Error("Redis error");

			mockRedis.del.mockRejectedValue(error);

			await store.destroy("test-session-id", callback);

			expect(callback).toHaveBeenCalledWith(error);
		});
	});

	describe("touch", () => {
		it("should update session expiration time", async () => {
			const sessionData: Partial<SessionData> = {
				// biome-ignore lint/suspicious/noExplicitAny: Partial cookie object for testing
				cookie: { maxAge: 7200000, originalMaxAge: 7200000 } as any, // 2 hours in milliseconds
			};
			const callback = vi.fn();

			mockRedis.expire.mockResolvedValue(1);

			await store.touch("test-session-id", sessionData as SessionData, callback);

			expect(mockRedis.expire).toHaveBeenCalledWith("test:test-session-id", 7200); // 2 hours in seconds
			expect(callback).toHaveBeenCalledWith();
		});

		it("should use default TTL when session cookie has no maxAge", async () => {
			const sessionData: Partial<SessionData> = {
				// biome-ignore lint/suspicious/noExplicitAny: Partial cookie object for testing
				cookie: { originalMaxAge: null } as any,
			};
			const callback = vi.fn();

			mockRedis.expire.mockResolvedValue(1);

			await store.touch("test-session-id", sessionData as SessionData, callback);

			expect(mockRedis.expire).toHaveBeenCalledWith("test:test-session-id", 3600); // default TTL
			expect(callback).toHaveBeenCalledWith();
		});

		it("should call callback with error when expire fails", async () => {
			const sessionData: Partial<SessionData> = {
				// biome-ignore lint/suspicious/noExplicitAny: Partial cookie object for testing
				cookie: { maxAge: 7200000, originalMaxAge: 7200000 } as any,
			};
			const callback = vi.fn();
			const error = new Error("Redis error");

			mockRedis.expire.mockRejectedValue(error);

			await store.touch("test-session-id", sessionData as SessionData, callback);

			expect(callback).toHaveBeenCalledWith(error);
		});
	});
});

describe("issueVisitorCookie", () => {
	let mockRequest: Request;
	let mockResponse: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		// Set default mock return for getConfig
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		mockRequest = {
			cookies: {},
		} as Request;

		mockResponse = {
			cookie: vi.fn(),
		} as unknown as Response;
	});

	it("should create a new visitor ID when no cookie exists", () => {
		const visitorId = issueVisitorCookie(mockRequest, mockResponse);

		expect(visitorId).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(mockResponse.cookie).toHaveBeenCalledWith("visitorId", visitorId, {
			httpOnly: true,
			maxAge: 365 * 24 * 60 * 60 * 1000,
			path: "/",
			sameSite: "strict",
			secure: true,
		});
	});

	it("should reuse existing visitor ID from cookie", () => {
		mockRequest.cookies = { visitorId: "existing-visitor-id" };

		const visitorId = issueVisitorCookie(mockRequest, mockResponse);

		expect(visitorId).toBe("existing-visitor-id");
		expect(mockResponse.cookie).toHaveBeenCalledWith("visitorId", "existing-visitor-id", {
			httpOnly: true,
			maxAge: 365 * 24 * 60 * 60 * 1000,
			path: "/",
			sameSite: "strict",
			secure: true,
		});
	});

	it("should set correct cookie options", () => {
		issueVisitorCookie(mockRequest, mockResponse);

		const expectedOptions = {
			httpOnly: true,
			maxAge: 31536000000,
			path: "/",
			sameSite: "strict",
			secure: true,
		};

		expect(mockResponse.cookie).toHaveBeenCalledWith("visitorId", expect.any(String), expectedOptions);
	});
});

describe("issueAuthCookie", () => {
	let mockResponse: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		mockResponse = {
			cookie: vi.fn(),
		} as unknown as Response;
	});

	it("should issue auth cookie without domain when neither COOKIE_DOMAIN nor BASE_DOMAIN is set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		issueAuthCookie(mockResponse, "test-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("authToken", "test-token", {
			httpOnly: true,
			maxAge: 7200000,
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: undefined,
		});
	});

	it("should issue auth cookie with domain derived from BASE_DOMAIN when COOKIE_DOMAIN is not set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		issueAuthCookie(mockResponse, "test-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("authToken", "test-token", {
			httpOnly: true,
			maxAge: 7200000,
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: ".jolli-local.me",
		});
	});

	it("should issue auth cookie with explicit COOKIE_DOMAIN when set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: ".custom-domain.com",
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		issueAuthCookie(mockResponse, "test-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("authToken", "test-token", {
			httpOnly: true,
			maxAge: 7200000,
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: ".custom-domain.com",
		});
	});

	it("should prioritize COOKIE_DOMAIN over BASE_DOMAIN", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: ".override-domain.com",
			BASE_DOMAIN: "base-domain.com",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		issueAuthCookie(mockResponse, "test-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("authToken", "test-token", {
			httpOnly: true,
			maxAge: 7200000,
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: ".override-domain.com",
		});
	});
});

describe("clearAuthCookie", () => {
	let mockResponse: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		mockResponse = {
			clearCookie: vi.fn(),
		} as unknown as Response;
	});

	it("should clear auth cookie without domain when neither COOKIE_DOMAIN nor BASE_DOMAIN is set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		clearAuthCookie(mockResponse);

		expect(mockResponse.clearCookie).toHaveBeenCalledWith("authToken", {
			path: "/",
			domain: undefined,
		});
	});

	it("should clear auth cookie with domain derived from BASE_DOMAIN when COOKIE_DOMAIN is not set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		clearAuthCookie(mockResponse);

		expect(mockResponse.clearCookie).toHaveBeenCalledWith("authToken", {
			path: "/",
			domain: ".jolli-local.me",
		});
	});

	it("should clear auth cookie with explicit COOKIE_DOMAIN when set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: ".custom-domain.com",
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		clearAuthCookie(mockResponse);

		expect(mockResponse.clearCookie).toHaveBeenCalledWith("authToken", {
			path: "/",
			domain: ".custom-domain.com",
		});
	});
});

describe("buildAuthCookieValue", () => {
	it("should build cookie value with all options for secure connection", () => {
		const result = buildAuthCookieValue("test-jwt-token", ".example.com", 7200000, true);

		expect(result).toContain("authToken=test-jwt-token");
		expect(result).toContain("Max-Age=7200");
		expect(result).toContain("Path=/");
		expect(result).toContain("HttpOnly");
		expect(result).toContain("SameSite=Lax");
		expect(result).toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build cookie value without Secure flag for non-secure connection", () => {
		const result = buildAuthCookieValue("test-jwt-token", ".example.com", 7200000, false);

		expect(result).toContain("authToken=test-jwt-token");
		expect(result).toContain("Max-Age=7200");
		expect(result).not.toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build cookie value without Domain when cookieDomain is undefined", () => {
		const result = buildAuthCookieValue("test-jwt-token", undefined, 7200000, true);

		expect(result).toContain("authToken=test-jwt-token");
		expect(result).not.toContain("Domain=");
	});

	it("should correctly convert maxAge from milliseconds to seconds", () => {
		const result = buildAuthCookieValue("test-jwt-token", undefined, 3600000, true);

		expect(result).toContain("Max-Age=3600");
	});
});

describe("buildClearAuthCookieValue", () => {
	it("should build clear cookie value with Secure flag and Domain", () => {
		const result = buildClearAuthCookieValue(".example.com", true);

		expect(result).toContain("authToken=");
		expect(result).toContain("Max-Age=0");
		expect(result).toContain("Path=/");
		expect(result).toContain("HttpOnly");
		expect(result).toContain("SameSite=Lax");
		expect(result).toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build clear cookie value without Secure flag or Domain", () => {
		const result = buildClearAuthCookieValue(undefined, false);

		expect(result).toContain("authToken=");
		expect(result).toContain("Max-Age=0");
		expect(result).not.toContain("Secure");
		expect(result).not.toContain("Domain=");
	});
});

describe("issueRememberMeCookie", () => {
	let mockResponse: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		mockResponse = {
			cookie: vi.fn(),
		} as unknown as Response;
	});

	it("should issue remember-me cookie without domain when neither COOKIE_DOMAIN nor BASE_DOMAIN is set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
			REMEMBER_ME_DURATION: "30d",
		} as never);

		issueRememberMeCookie(mockResponse, "test-remember-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("remember_me_token", "test-remember-token", {
			httpOnly: true,
			maxAge: 2592000000, // 30 days in ms
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: undefined,
		});
	});

	it("should issue remember-me cookie with domain derived from BASE_DOMAIN when COOKIE_DOMAIN is not set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
			REMEMBER_ME_DURATION: "30d",
		} as never);

		issueRememberMeCookie(mockResponse, "test-remember-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("remember_me_token", "test-remember-token", {
			httpOnly: true,
			maxAge: 2592000000,
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: ".jolli-local.me",
		});
	});

	it("should issue remember-me cookie with explicit COOKIE_DOMAIN when set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: ".custom-domain.com",
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
			REMEMBER_ME_DURATION: "7d",
		} as never);

		issueRememberMeCookie(mockResponse, "test-remember-token");

		expect(mockResponse.cookie).toHaveBeenCalledWith("remember_me_token", "test-remember-token", {
			httpOnly: true,
			maxAge: 604800000, // 7 days in ms
			path: "/",
			sameSite: "lax",
			secure: true,
			domain: ".custom-domain.com",
		});
	});
});

describe("clearRememberMeCookie", () => {
	let mockResponse: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		mockResponse = {
			clearCookie: vi.fn(),
		} as unknown as Response;
	});

	it("should clear remember-me cookie without domain when neither COOKIE_DOMAIN nor BASE_DOMAIN is set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		clearRememberMeCookie(mockResponse);

		expect(mockResponse.clearCookie).toHaveBeenCalledWith("remember_me_token", {
			path: "/",
			domain: undefined,
		});
	});

	it("should clear remember-me cookie with domain derived from BASE_DOMAIN when COOKIE_DOMAIN is not set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		clearRememberMeCookie(mockResponse);

		expect(mockResponse.clearCookie).toHaveBeenCalledWith("remember_me_token", {
			path: "/",
			domain: ".jolli-local.me",
		});
	});

	it("should clear remember-me cookie with explicit COOKIE_DOMAIN when set", () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: ".custom-domain.com",
			BASE_DOMAIN: "jolli-local.me",
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as never);

		clearRememberMeCookie(mockResponse);

		expect(mockResponse.clearCookie).toHaveBeenCalledWith("remember_me_token", {
			path: "/",
			domain: ".custom-domain.com",
		});
	});
});

describe("buildRememberMeCookieValue", () => {
	it("should build cookie value with all options for secure connection", () => {
		const result = buildRememberMeCookieValue("test-remember-token", ".example.com", 2592000000, true);

		expect(result).toContain("remember_me_token=test-remember-token");
		expect(result).toContain("Max-Age=2592000");
		expect(result).toContain("Path=/");
		expect(result).toContain("HttpOnly");
		expect(result).toContain("SameSite=Lax");
		expect(result).toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build cookie value without Secure flag for non-secure connection", () => {
		const result = buildRememberMeCookieValue("test-remember-token", ".example.com", 2592000000, false);

		expect(result).toContain("remember_me_token=test-remember-token");
		expect(result).toContain("Max-Age=2592000");
		expect(result).not.toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build cookie value without Domain when cookieDomain is undefined", () => {
		const result = buildRememberMeCookieValue("test-remember-token", undefined, 2592000000, true);

		expect(result).toContain("remember_me_token=test-remember-token");
		expect(result).not.toContain("Domain=");
	});

	it("should correctly convert maxAge from milliseconds to seconds", () => {
		const result = buildRememberMeCookieValue("test-remember-token", undefined, 604800000, true);

		expect(result).toContain("Max-Age=604800"); // 7 days in seconds
	});
});

describe("buildClearAuthCookieValue", () => {
	it("should build clear auth cookie with Secure flag and domain", () => {
		const result = buildClearAuthCookieValue(".example.com", true);

		expect(result).toContain("authToken=");
		expect(result).toContain("Max-Age=0");
		expect(result).toContain("Path=/");
		expect(result).toContain("HttpOnly");
		expect(result).toContain("SameSite=Lax");
		expect(result).toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build clear auth cookie without Secure flag when not secure", () => {
		const result = buildClearAuthCookieValue(".example.com", false);

		expect(result).toContain("authToken=");
		expect(result).toContain("Max-Age=0");
		expect(result).not.toContain("Secure");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build clear auth cookie without Domain when cookieDomain is undefined", () => {
		const result = buildClearAuthCookieValue(undefined, true);

		expect(result).toContain("authToken=");
		expect(result).toContain("Secure");
		expect(result).not.toContain("Domain=");
	});
});

describe("buildClearRememberMeCookieValue", () => {
	it("should build clear cookie value with domain", () => {
		const result = buildClearRememberMeCookieValue(".example.com");

		expect(result).toContain("remember_me_token=");
		expect(result).toContain("Max-Age=0");
		expect(result).toContain("Path=/");
		expect(result).toContain("HttpOnly");
		expect(result).toContain("SameSite=Lax");
		expect(result).toContain("Domain=.example.com");
	});

	it("should build clear cookie value without Domain when cookieDomain is undefined", () => {
		const result = buildClearRememberMeCookieValue(undefined);

		expect(result).toContain("remember_me_token=");
		expect(result).toContain("Max-Age=0");
		expect(result).toContain("Path=/");
		expect(result).toContain("HttpOnly");
		expect(result).toContain("SameSite=Lax");
		expect(result).not.toContain("Domain=");
	});

	it("should not include Secure flag in clear cookie", () => {
		const result = buildClearRememberMeCookieValue(".example.com");

		expect(result).not.toContain("Secure");
	});
});

describe("expressSessionHandler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Set default mock return for getConfig
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
			REDIS_URL: undefined,
		} as never);
	});

	it("should create session handler with in-memory storage when Redis is not configured", async () => {
		const { expressSessionHandler } = await import("./Cookies");

		const handler = await expressSessionHandler();

		expect(handler).toBeDefined();
		expect(typeof handler).toBe("function");
	});

	it("should fall back to in-memory storage when Redis connection fails", async () => {
		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
			REDIS_URL: "redis://invalid-host:6379",
		} as never);

		const { expressSessionHandler } = await import("./Cookies");

		// Should not throw even if Redis connection fails
		const handler = await expressSessionHandler();

		expect(handler).toBeDefined();
		expect(typeof handler).toBe("function");
	}, 10000); // 10 second timeout for Redis connection attempt

	it("should use Redis for session storage when connection succeeds", async () => {
		// Mock RedisClient module before importing Cookies
		const mockRedisClient = {
			get: vi.fn(),
			setex: vi.fn(),
			del: vi.fn(),
			expire: vi.fn(),
		};

		const mockConnectRedis = vi.fn().mockResolvedValue(mockRedisClient);

		vi.doMock("./RedisClient", () => ({
			connectRedis: mockConnectRedis,
		}));

		vi.mocked(getConfig).mockReturnValue({
			COOKIE_DOMAIN: undefined,
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
			REDIS_URL: "redis://localhost:6379",
		} as never);

		// Re-import to get fresh module with mocked RedisClient
		vi.resetModules();
		const { expressSessionHandler } = await import("./Cookies");

		const handler = await expressSessionHandler();

		expect(handler).toBeDefined();
		expect(typeof handler).toBe("function");
		// Verify connectRedis was called with correct params
		expect(mockConnectRedis).toHaveBeenCalledWith("redis://localhost:6379", { name: "session" });
	});
});
