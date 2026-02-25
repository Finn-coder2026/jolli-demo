import { resetConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { SpaceDao } from "../dao/SpaceDao";
import type { RememberMeService } from "../services/RememberMeService";
import { createTokenUtil } from "../util/TokenUtil";
import { createAuthRouter } from "./AuthRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TestAppDeps {
	spaceDao: SpaceDao;
	spaceDaoProvider: DaoProvider<SpaceDao>;
	tokenUtil: ReturnType<typeof createTokenUtil<UserInfo>>;
	rememberMeService: RememberMeService | undefined;
}

interface TestAppOverrides {
	spaceDao?: SpaceDao;
	rememberMeService?: RememberMeService;
}

function createTestApp(
	sessionData?: Record<string, unknown>,
	overrides?: TestAppOverrides,
): { app: Express; deps: TestAppDeps } {
	const app = express();
	app.use(express.json());
	app.use(cookieParser());

	if (sessionData) {
		app.use((req, _res, next) => {
			req.session = sessionData as unknown as typeof req.session;
			next();
		});
	}

	const spaceDao =
		overrides?.spaceDao ??
		({
			getDefaultSpace: vi.fn(),
		} as unknown as SpaceDao);
	const rememberMeService = overrides?.rememberMeService;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" });

	app.use(
		"/auth",
		createAuthRouter({
			spaceDaoProvider: { getDao: () => spaceDao },
			tokenUtil,
			rememberMeService,
		}),
	);

	return {
		app,
		deps: {
			spaceDao,
			spaceDaoProvider: { getDao: () => spaceDao },
			tokenUtil,
			rememberMeService,
		},
	};
}

describe("AuthRouter", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		resetConfig();
		process.env.DISABLE_LOGGING = "true";
		process.env.ORIGIN = "http://localhost:8034";
		process.env.AUTH_EMAILS = ".*";
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress expected error logs in tests.
		});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
		resetConfig();
		delete process.env.MAX_SEATS;
		delete process.env.BASE_DOMAIN;
	});

	describe("GET /login", () => {
		it("should return user info when authenticated", async () => {
			const { app, deps } = createTestApp();
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.get("/auth/login")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				user: {
					email: "test@example.com",
					name: "Test User",
					userId: 123,
					iat: expect.any(Number),
					exp: expect.any(Number),
				},
			});
		});

		it("should return undefined user when not authenticated", async () => {
			const { app } = createTestApp();
			const response = await request(app).get("/auth/login");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ user: undefined });
		});

		it("should capture gateway auth from referer returnTo on auth gateway", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login")
				.set("Host", "auth.jolli.ai")
				.set("Referer", "https://auth.jolli.ai/login?returnTo=https%3A%2F%2Facme.jolli.ai%2Fdashboard");

			expect(response.status).toBe(200);
			expect((sessionData.gatewayAuth as { tenantSlug: string; returnTo: string } | undefined)?.tenantSlug).toBe(
				"acme",
			);
			expect((sessionData.gatewayAuth as { tenantSlug: string; returnTo: string } | undefined)?.returnTo).toBe(
				"https://acme.jolli.ai/dashboard",
			);
		});

		it("should ignore invalid gateway returnTo domains", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login")
				.set("Host", "auth.jolli.ai")
				.set("Referer", "https://auth.jolli.ai/login?returnTo=https%3A%2F%2Fevil.com");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});
	});

	describe("POST /logout", () => {
		it("should clear auth cookie and return success", async () => {
			const { app } = createTestApp();
			const response = await request(app).post("/auth/logout");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(response.headers["set-cookie"]).toBeDefined();
			const setCookies = ([] as Array<string>).concat(response.headers["set-cookie"] ?? []);
			expect(setCookies.some((cookie: string) => cookie.includes("authToken=;"))).toBe(true);
			expect(setCookies.some((cookie: string) => cookie.includes("email_selection=;"))).toBe(true);
		});
	});

	describe("GET /gateway-info", () => {
		it("should return 404 when no gateway auth in session", async () => {
			const { app } = createTestApp();
			const response = await request(app).get("/auth/gateway-info");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "No gateway auth in session" });
		});

		it("should return gateway auth when present", async () => {
			const { app } = createTestApp({
				gatewayAuth: { tenantSlug: "test-tenant", returnTo: "https://test.example.com" },
			});
			const response = await request(app).get("/auth/gateway-info");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				tenantSlug: "test-tenant",
				returnTo: "https://test.example.com",
			});
		});
	});

	describe("GET /session-config", () => {
		it("should return session configuration", async () => {
			const { app } = createTestApp();
			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("idleTimeoutMs");
			expect(response.body).toHaveProperty("enabledProviders");
		});
	});

	describe("GET /cli-token", () => {
		it("should return 401 when not authenticated", async () => {
			const { app } = createTestApp();
			const response = await request(app).get("/auth/cli-token");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return auth token and default space when authenticated", async () => {
			const spaceDao = {
				getDefaultSpace: vi.fn().mockResolvedValue({ id: 1, name: "Default Space", slug: "default" }),
			} as unknown as SpaceDao;

			const { app, deps } = createTestApp(undefined, { spaceDao });
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.get("/auth/cli-token")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ token, space: "default" });
		});

		it("should return token without space when no default space exists", async () => {
			const spaceDao = {
				getDefaultSpace: vi.fn().mockResolvedValue(null),
			} as unknown as SpaceDao;

			const { app, deps } = createTestApp(undefined, { spaceDao });
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.get("/auth/cli-token")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ token, space: undefined });
		});

		it("should return token without space when space lookup throws", async () => {
			const spaceDao = {
				getDefaultSpace: vi.fn().mockRejectedValue(new Error("DB error")),
			} as unknown as SpaceDao;

			const { app, deps } = createTestApp(undefined, { spaceDao });
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.get("/auth/cli-token")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ token, space: undefined });
		});
	});

	describe("POST /logout with rememberMeService", () => {
		it("should revoke remember-me token on logout", async () => {
			const rememberMeService = {
				revokeToken: vi.fn().mockResolvedValue(undefined),
			} as unknown as RememberMeService;

			const { app, deps } = createTestApp(undefined, { rememberMeService });
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.post("/auth/logout")
				.set("Cookie", [`authToken=${token}`, "remember_me_token=series:token"]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(rememberMeService.revokeToken).toHaveBeenCalledWith("series:token");
		});

		it("should handle remember-me token revocation failure gracefully", async () => {
			const rememberMeService = {
				revokeToken: vi.fn().mockRejectedValue(new Error("DB error")),
			} as unknown as RememberMeService;

			const { app, deps } = createTestApp(undefined, { rememberMeService });
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.post("/auth/logout")
				.set("Cookie", [`authToken=${token}`, "remember_me_token=series:token"]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
		});

		it("should not revoke when no remember-me cookie is present", async () => {
			const rememberMeService = {
				revokeToken: vi.fn(),
			} as unknown as RememberMeService;

			const { app } = createTestApp(undefined, { rememberMeService });

			const response = await request(app).post("/auth/logout");

			expect(response.status).toBe(200);
			expect(rememberMeService.revokeToken).not.toHaveBeenCalled();
		});

		it("should audit log the logout event with user info", async () => {
			const { app, deps } = createTestApp();
			const token = deps.tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const response = await request(app)
				.post("/auth/logout")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
		});
	});

	describe("captureGatewayAuthFromRequest", () => {
		it("should capture gateway auth from returnTo query parameter", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=https%3A%2F%2Facme.jolli.ai%2Fdashboard")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect((sessionData.gatewayAuth as { tenantSlug: string; returnTo: string } | undefined)?.tenantSlug).toBe(
				"acme",
			);
		});

		it("should use bare base domain as 'jolli' tenant slug", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=https%3A%2F%2Fjolli.ai%2Fdashboard")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect((sessionData.gatewayAuth as { tenantSlug: string; returnTo: string } | undefined)?.tenantSlug).toBe(
				"jolli",
			);
		});

		it("should not capture when host is not auth gateway", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=https%3A%2F%2Facme.jolli.ai")
				.set("Host", "acme.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should not capture when no BASE_DOMAIN is configured", async () => {
			// No BASE_DOMAIN set
			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=https%3A%2F%2Facme.jolli.ai")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should reject returnTo pointing to auth gateway itself", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=https%3A%2F%2Fauth.jolli.ai%2Fmypage")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should reject non-http/https returnTo protocols", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=ftp%3A%2F%2Facme.jolli.ai%2Ffiles")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should handle malformed returnTo URL gracefully", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=not-a-valid-url")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should handle malformed referer URL gracefully", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login")
				.set("Host", "auth.jolli.ai")
				.set("Referer", "not-a-valid-url");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should reject http returnTo in production", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			process.env.NODE_ENV = "production";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login?returnTo=http%3A%2F%2Facme.jolli.ai%2Fdashboard")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();

			delete process.env.NODE_ENV;
		});

		it("should not capture when no returnTo and no referer", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app).get("/auth/login").set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});
	});

	describe("GET /gateway-info - additional", () => {
		it("should capture gateway auth from request when no session data", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/gateway-info?returnTo=https%3A%2F%2Facme.jolli.ai%2Fpage")
				.set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				tenantSlug: "acme",
				returnTo: "https://acme.jolli.ai/page",
			});
		});
	});

	describe("GET /session-config - provider detection", () => {
		it("should return providers from ENABLED_AUTH_PROVIDERS with jolli_ prefix stripped", async () => {
			process.env.ENABLED_AUTH_PROVIDERS = "jolli_google,jolli_github";
			resetConfig();

			const { app } = createTestApp();
			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.enabledProviders).toEqual(["google", "github"]);

			delete process.env.ENABLED_AUTH_PROVIDERS;
		});

		it("should detect providers from client ID/secret when ENABLED_AUTH_PROVIDERS parses empty", async () => {
			// Use comma-only value so it parses to empty after filtering
			// (empty string becomes undefined via emptyStringAsUndefined, reverting to default)
			process.env.ENABLED_AUTH_PROVIDERS = " , ";
			process.env.GOOGLE_CLIENT_ID = "google-id";
			process.env.GOOGLE_CLIENT_SECRET = "google-secret";
			delete process.env.GITHUB_CLIENT_ID;
			delete process.env.GITHUB_CLIENT_SECRET;
			resetConfig();

			const { app } = createTestApp();
			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.enabledProviders).toEqual(["google"]);

			delete process.env.ENABLED_AUTH_PROVIDERS;
			delete process.env.GOOGLE_CLIENT_ID;
			delete process.env.GOOGLE_CLIENT_SECRET;
		});

		it("should detect GitHub provider from client ID/secret", async () => {
			process.env.ENABLED_AUTH_PROVIDERS = " , ";
			delete process.env.GOOGLE_CLIENT_ID;
			delete process.env.GOOGLE_CLIENT_SECRET;
			process.env.GITHUB_CLIENT_ID = "github-id";
			process.env.GITHUB_CLIENT_SECRET = "github-secret";
			resetConfig();

			const { app } = createTestApp();
			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.enabledProviders).toEqual(["github"]);

			delete process.env.ENABLED_AUTH_PROVIDERS;
			delete process.env.GITHUB_CLIENT_ID;
			delete process.env.GITHUB_CLIENT_SECRET;
		});

		it("should default to google and github when no providers configured", async () => {
			process.env.ENABLED_AUTH_PROVIDERS = " , ";
			delete process.env.GOOGLE_CLIENT_ID;
			delete process.env.GOOGLE_CLIENT_SECRET;
			delete process.env.GITHUB_CLIENT_ID;
			delete process.env.GITHUB_CLIENT_SECRET;
			resetConfig();

			const { app } = createTestApp();
			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.enabledProviders).toEqual(["google", "github"]);

			delete process.env.ENABLED_AUTH_PROVIDERS;
		});

		it("should pass through providers without jolli_ prefix unchanged", async () => {
			process.env.ENABLED_AUTH_PROVIDERS = "google,github";
			resetConfig();

			const { app } = createTestApp();
			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.enabledProviders).toEqual(["google", "github"]);

			delete process.env.ENABLED_AUTH_PROVIDERS;
		});
	});

	describe("captureGatewayAuthFromRequest - additional branches", () => {
		it("should skip capture when session exists but no BASE_DOMAIN", async () => {
			// Ensure no BASE_DOMAIN is set
			delete process.env.BASE_DOMAIN;
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app).get("/auth/login").set("Host", "auth.jolli.ai");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});

		it("should handle referer without returnTo param", async () => {
			process.env.BASE_DOMAIN = "jolli.ai";
			resetConfig();

			const sessionData: Record<string, unknown> = {};
			const { app } = createTestApp(sessionData);

			const response = await request(app)
				.get("/auth/login")
				.set("Host", "auth.jolli.ai")
				.set("Referer", "https://auth.jolli.ai/login");

			expect(response.status).toBe(200);
			expect(sessionData.gatewayAuth).toBeUndefined();
		});
	});
});
