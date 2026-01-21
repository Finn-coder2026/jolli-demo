import * as AuthCodeService from "../auth/AuthCodeService";
import type * as authGateway from "../auth/AuthGateway";
import * as AuthGateway from "../auth/AuthGateway";
import { resetConfig } from "../config/Config";
import type { Database } from "../core/Database";
import { mockDatabase } from "../core/Database.mock";
import { mockAuth } from "../model/Auth.mock";
import { mockUser } from "../model/User.mock";
import * as TenantContext from "../tenant/TenantContext";
import { createTokenUtil } from "../util/TokenUtil";
import { createAuthRouter } from "./AuthRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../audit", () => ({
	auditLog: vi.fn(),
}));

vi.mock("../auth/AuthGateway", async importOriginal => {
	const original = await importOriginal<typeof authGateway>();
	return {
		...original,
		isMultiTenantAuthEnabled: vi.fn(() => false),
	};
});

vi.mock("../tenant/TenantContext", async importOriginal => {
	const original = await importOriginal<typeof TenantContext>();
	return {
		...original,
		getTenantContext: vi.fn(),
	};
});
vi.mock("../auth/AuthGateway", () => ({
	isMultiTenantAuthEnabled: vi.fn(() => false),
}));

vi.mock("../auth/AuthCodeService", async () => {
	const actual = await vi.importActual<typeof AuthCodeService>("../auth/AuthCodeService");
	return {
		...actual,
		generateAuthCode: vi.fn(() => "mock-auth-code"),
		validateAuthCode: vi.fn(() => null),
		generatePendingEmailAuthCode: vi.fn(() => "mock-pending-code"),
	};
});

vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(() => null),
}));

// Helper to create a mock AuthCodePayload with required fields
function mockAuthCodePayload(overrides: {
	userInfo: { email: string; name: string; provider: string; subject: string; picture?: string };
	tenantSlug: string;
	returnTo: string;
	pendingEmailSelection?: { emails: Array<string>; authJson: Record<string, unknown>; providerName: string };
}) {
	return {
		...overrides,
		issuedAt: Date.now(),
		expiresAt: Date.now() + 300000, // 5 minutes from now
	};
}

// Helper to create a mock TenantOrgContext with all required fields
function mockTenantOrgContext(tenantSlug: string): TenantContext.TenantOrgContext {
	const tenant = {
		id: "t1",
		slug: tenantSlug,
		displayName: "Test Tenant",
		status: "active" as const,
		deploymentType: "shared" as const,
		databaseProviderId: "p1",
		configs: {},
		configsUpdatedAt: null,
		featureFlags: {},
		primaryDomain: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		provisionedAt: null,
	};
	const org = {
		id: "o1",
		tenantId: "t1",
		slug: "default",
		schemaName: "public",
		displayName: "Default",
		status: "active" as const,
		isDefault: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	return {
		tenant,
		org,
		schemaName: org.schemaName,
		database: mockDatabase(),
	};
}

describe("AuthRouter", () => {
	let db: Database;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Reset config cache to ensure fresh config for each test
		resetConfig();

		// Disable logging during tests to avoid logger initialization overhead
		process.env.DISABLE_LOGGING = "true";

		// Override ORIGIN to ensure consistent redirect URLs in tests
		// This overrides any value from .env.local (e.g., https://jolli-local.me)
		process.env.ORIGIN = "http://localhost:8034";

		// Ensure AUTH_EMAILS uses permissive default pattern
		// This overrides any restrictive pattern from previous tests
		process.env.AUTH_EMAILS = ".*";

		// Capture console.error to prevent stderr output in tests
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Intentionally empty to suppress console.error output
		});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
		// Reset config at end of each test to avoid affecting other tests
		resetConfig();
	});

	// Helper function to create app with optional session data
	function createTestApp(sessionData?: Record<string, unknown>): Express {
		const app = express();
		app.use(express.json());
		app.use(cookieParser());

		// If session data is provided, add middleware to set it BEFORE mounting router
		if (sessionData) {
			app.use((req, _res, next) => {
				req.session = sessionData;
				next();
			});
		}

		app.use(
			"/auth",
			createAuthRouter(
				db.authDaoProvider,
				db.userDaoProvider,
				createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" }),
			),
		);
		return app;
	}

	// Helper to extract cookie value from response
	function getCookie(response: request.Response, name: string): string | undefined {
		const cookies = response.headers["set-cookie"];
		if (!cookies) {
			return;
		}
		const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
		const cookie = cookieArray.find(c => c.startsWith(`${name}=`));
		if (!cookie) {
			return;
		}
		return cookie.split(";")[0].split("=")[1];
	}

	beforeEach(() => {
		db = mockDatabase();
	});

	describe("GET /callback", () => {
		it("should redirect with error when session is missing", async () => {
			const app = createTestApp();
			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=session_missing");
		});

		it("should redirect with error when access_token is missing", async () => {
			const app = createTestApp({});
			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=oauth_failed");
		});

		it("should redirect with error when grant exists but access_token is missing", async () => {
			const app = createTestApp({
				grant: {
					response: {}, // No access_token
				},
			});
			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=oauth_failed");
		});

		it("should redirect with error when provider is invalid", async () => {
			const app = createTestApp({
				grant: {
					response: { access_token: "test-token" },
					provider: "invalid-provider",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=invalid_provider");
		});

		it("should redirect with error when auth fetch fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				text: () => Promise.resolve("Auth failed"),
			});

			const app = createTestApp({
				grant: {
					response: { access_token: "test-token" },
					provider: "google",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=auth_fetch_failed");
		});

		it("should redirect with error when no verified emails exist", async () => {
			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([]), // Empty emails array
				});

			const app = createTestApp({
				grant: {
					response: { access_token: "test-token" },
					provider: "github",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=no_verified_emails");
		});

		it("should redirect with select_email when multiple emails exist", async () => {
			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve([
							{ email: "email1@example.com", verified: true, primary: true },
							{ email: "email2@example.com", verified: true, primary: false },
						]),
				});

			const app = createTestApp({
				grant: {
					response: { access_token: "test-token" },
					provider: "github",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("select_email=true");
		});

		it("should successfully login with Google (single email from provider)", async () => {
			const userData = {
				id: "google-123",
				email: "test@gmail.com",
				name: "Test User",
				picture: "https://example.com/photo.jpg",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(userData),
			});

			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "google",
					subject: "google-123",
					email: "test@gmail.com",
					name: "Test User",
					picture: "https://example.com/photo.jpg",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "test@gmail.com",
					name: "Test User",
					picture: "https://example.com/photo.jpg",
				}),
			);

			const app = createTestApp({
				grant: {
					response: { access_token: "google-token" },
					provider: "google",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/");
			expect(getCookie(response, "authToken")).toBeDefined();
			expect(db.authDao.createAuth).toHaveBeenCalled();
			expect(db.userDao.createUser).toHaveBeenCalled();
		});

		it("should successfully login with GitHub (single verified email)", async () => {
			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([{ email: "test@example.com", verified: true, primary: true }]),
				});

			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "github",
					subject: "12345",
					email: "test@example.com",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "test@example.com",
				}),
			);

			const app = createTestApp({
				grant: {
					response: { access_token: "github-token" },
					provider: "github",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/");
			expect(getCookie(response, "authToken")).toBeDefined();
		});

		it("should update existing auth and user on login", async () => {
			const userData = {
				id: "google-123",
				email: "test@gmail.com",
				name: "Updated Name",
				picture: "https://example.com/new-photo.jpg",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(userData),
			});

			vi.mocked(db.authDao.findAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "google",
					subject: "google-123",
					email: "test@gmail.com",
				}),
			);
			vi.mocked(db.authDao.updateAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "google",
					subject: "google-123",
					email: "test@gmail.com",
					name: "Updated Name",
					picture: "https://example.com/new-photo.jpg",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "test@gmail.com",
					name: "Old Name",
				}),
			);
			vi.mocked(db.userDao.updateUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "test@gmail.com",
					name: "Updated Name",
					picture: "https://example.com/new-photo.jpg",
				}),
			);

			const app = createTestApp({
				grant: {
					response: { access_token: "google-token" },
					provider: "google",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/");
			expect(getCookie(response, "authToken")).toBeDefined();
			expect(db.authDao.updateAuth).toHaveBeenCalled();
			expect(db.userDao.updateUser).toHaveBeenCalled();
		});

		it("should redirect with server_error on exception", async () => {
			// Mock fetch to throw an error
			global.fetch = vi.fn().mockRejectedValue(new Error("Unexpected error"));

			const app = createTestApp({
				grant: {
					response: { access_token: "test-token" },
					provider: "google",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("http://localhost:8034/?error=server_error");
		});

		it("should redirect to site auth login when pendingSiteAuth is in session", async () => {
			const userData = {
				id: "google-123",
				email: "test@gmail.com",
				name: "Test User",
				picture: "https://example.com/photo.jpg",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(userData),
			});

			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "google",
					subject: "google-123",
					email: "test@gmail.com",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "test@gmail.com",
				}),
			);

			const sessionData = {
				grant: {
					response: { access_token: "google-token" },
					provider: "google",
				},
				pendingSiteAuth: {
					siteId: "123",
					returnUrl: "/getting-started",
				},
			};
			const app = createTestApp(sessionData);

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/api/sites/123/auth/jwt?returnUrl=%2Fgetting-started");
			expect(getCookie(response, "authToken")).toBeDefined();
			// Verify pendingSiteAuth was deleted from session
			expect(sessionData.pendingSiteAuth).toBeUndefined();
		});

		it("should clean up oauthOrigin from session after successful callback", async () => {
			const userData = {
				id: "google-123",
				email: "test@gmail.com",
				name: "Test User",
				picture: "https://example.com/photo.jpg",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(userData),
			});

			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "google",
					subject: "google-123",
					email: "test@gmail.com",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "test@gmail.com",
				}),
			);

			const sessionData = {
				grant: {
					response: { access_token: "google-token" },
					provider: "google",
				},
				oauthOrigin: "https://custom-origin.example.com",
			};
			const app = createTestApp(sessionData);

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(getCookie(response, "authToken")).toBeDefined();
			// Verify oauthOrigin was deleted from session
			expect(sessionData.oauthOrigin).toBeUndefined();
		});
	});

	describe("GET /emails", () => {
		it("should return pending emails when available", async () => {
			const app = createTestApp({
				pendingAuth: {
					authJson: { id: "123" },
					emails: ["email1@example.com", "email2@example.com"],
				},
			});

			const response = await request(app).get("/auth/emails");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				emails: ["email1@example.com", "email2@example.com"],
			});
		});

		it("should return 400 when no pending authentication", async () => {
			const app = createTestApp({});

			const response = await request(app).get("/auth/emails");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "No pending authentication" });
		});

		it("should return 500 on exception", async () => {
			const app = createTestApp({
				get pendingAuth() {
					throw new Error("Unexpected error");
				},
			});

			const response = await request(app).get("/auth/emails");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "server_error" });
		});
	});

	describe("GET /login", () => {
		it("should return user info when authenticated", async () => {
			const tokenUtil = createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" });
			const token = tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const app = express();
			app.use((req, _res, next) => {
				req.cookies = { authToken: token };
				next();
			});
			app.use("/auth", createAuthRouter(db.authDaoProvider, db.userDaoProvider, tokenUtil));

			const response = await request(app).get("/auth/login");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				user: {
					email: "test@example.com",
					name: "Test User",
					picture: undefined,
					userId: 123,
					iat: expect.any(Number),
					exp: expect.any(Number),
				},
			});
		});

		it("should return undefined user when not authenticated", async () => {
			const app = createTestApp();
			const response = await request(app).get("/auth/login");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ user: undefined });
		});
	});

	describe("POST /logout", () => {
		it("should clear auth cookie and return success", async () => {
			const app = createTestApp();
			const response = await request(app).post("/auth/logout");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(response.headers["set-cookie"]).toBeDefined();
			expect(response.headers["set-cookie"][0]).toContain("authToken=;");
		});

		it("should audit log logout when userInfo is present", async () => {
			const audit = await import("../audit");
			vi.mocked(audit.auditLog).mockClear();

			const userInfo: UserInfo = {
				userId: 123,
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
			};

			// Create a token using the same tokenUtil from createTestApp
			const tokenUtil = createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" });
			const token = tokenUtil.generateToken(userInfo);

			const app = createTestApp();
			const response = await request(app)
				.post("/auth/logout")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(audit.auditLog).toHaveBeenCalledWith({
				action: "logout",
				resourceType: "session",
				resourceId: "123",
				resourceName: "test@example.com",
				actorId: 123,
				actorEmail: "test@example.com",
			});
		});

		it("should audit log logout when userInfo has no userId", async () => {
			const audit = await import("../audit");
			vi.mocked(audit.auditLog).mockClear();

			// Create a UserInfo-like object with undefined userId to test the ?? operators
			const userInfo = {
				userId: undefined as unknown as number,
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/pic.jpg",
			};

			// Create a token using the same tokenUtil from createTestApp
			const tokenUtil = createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" });
			const token = tokenUtil.generateToken(userInfo as UserInfo);

			const app = createTestApp();
			const response = await request(app)
				.post("/auth/logout")
				.set("Cookie", [`authToken=${token}`]);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(audit.auditLog).toHaveBeenCalledWith({
				action: "logout",
				resourceType: "session",
				resourceId: "test@example.com",
				resourceName: "test@example.com",
				actorId: null,
				actorEmail: "test@example.com",
			});
		});
	});

	describe("POST /select-email", () => {
		it("should return 400 when no pending authentication", async () => {
			const app = createTestApp({});

			const response = await request(app).post("/auth/select-email").send({ email: "test@example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "No pending authentication" });
		});

		it("should return 400 when email is missing", async () => {
			const app = createTestApp({
				pendingAuth: {
					authJson: { id: "123" },
					emails: ["email1@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid email" });
		});

		it("should return 400 when email is not a string", async () => {
			const app = createTestApp({
				pendingAuth: {
					authJson: { id: "123" },
					emails: ["email1@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid email" });
		});

		it("should return 400 when provider is invalid", async () => {
			const app = createTestApp({
				grant: {
					provider: "invalid-provider",
				},
				pendingAuth: {
					authJson: { id: "123" },
					emails: ["email1@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: "email1@example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid provider" });
		});

		it("should return 400 when email is not in pending emails list", async () => {
			const app = createTestApp({
				grant: {
					provider: "github",
				},
				pendingAuth: {
					authJson: { id: "123" },
					emails: ["email1@example.com", "email2@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: "notinlist@example.com" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid email selection" });
		});

		it("should successfully login with selected email", async () => {
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "github",
					subject: "12345",
					email: "email1@example.com",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "email1@example.com",
				}),
			);

			const app = createTestApp({
				grant: {
					provider: "github",
				},
				pendingAuth: {
					authJson: {
						id: 12345,
						login: "testuser",
						name: "Test User",
					},
					emails: ["email1@example.com", "email2@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: "email1@example.com" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ success: true });
			expect(getCookie(response, "authToken")).toBeDefined();
			expect(db.authDao.createAuth).toHaveBeenCalled();
			expect(db.userDao.createUser).toHaveBeenCalled();
		});

		it("should clear pendingAuth from session after successful login", async () => {
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "google",
					subject: "google-123",
					email: "email1@example.com",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "email1@example.com",
				}),
			);

			let sessionRef: Record<string, unknown> | undefined;
			const app = express();
			app.use(express.json());
			app.use((req, _res, next) => {
				req.session = {
					grant: {
						provider: "google",
					},
					pendingAuth: {
						authJson: {
							id: "google-123",
							name: "Test User",
						},
						emails: ["email1@example.com"],
					},
				};
				sessionRef = req.session;
				next();
			});
			app.use(
				"/auth",
				createAuthRouter(
					db.authDaoProvider,
					db.userDaoProvider,
					createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" }),
				),
			);

			await request(app).post("/auth/select-email").send({ email: "email1@example.com" });

			expect(sessionRef?.pendingAuth).toBeUndefined();
		});

		it("should return redirectTo for site auth when pendingSiteAuth is in session", async () => {
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({
					id: 1,
					provider: "github",
					subject: "12345",
					email: "email1@example.com",
				}),
			);

			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({
					id: 1,
					email: "email1@example.com",
				}),
			);

			const sessionData = {
				grant: {
					provider: "github",
				},
				pendingAuth: {
					authJson: {
						id: 12345,
						login: "testuser",
						name: "Test User",
					},
					emails: ["email1@example.com", "email2@example.com"],
				},
				pendingSiteAuth: {
					siteId: "456",
					returnUrl: "/docs/intro",
				},
			};
			const app = createTestApp(sessionData);

			const response = await request(app).post("/auth/select-email").send({ email: "email1@example.com" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				redirectTo: "/api/sites/456/auth/jwt?returnUrl=%2Fdocs%2Fintro",
			});
			expect(getCookie(response, "authToken")).toBeDefined();
			// Verify pendingSiteAuth was deleted from session
			expect(sessionData.pendingSiteAuth).toBeUndefined();
		});

		it("should return 500 on exception", async () => {
			const app = createTestApp({
				get pendingAuth() {
					throw new Error("Unexpected error");
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: "test@example.com" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "server_error" });
		});
	});

	describe("GET /cli-token", () => {
		it("should return auth token when authenticated", async () => {
			const tokenUtil = createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" });
			const token = tokenUtil.generateToken({
				email: "test@example.com",
				name: "Test User",
				picture: undefined,
				userId: 123,
			});

			const app = express();
			app.use((req, _res, next) => {
				req.cookies = { authToken: token };
				next();
			});
			app.use("/auth", createAuthRouter(db.authDaoProvider, db.userDaoProvider, tokenUtil));

			const response = await request(app).get("/auth/cli-token");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ token });
		});

		it("should return 401 when not authenticated", async () => {
			const app = createTestApp();
			const response = await request(app).get("/auth/cli-token");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});
	});

	describe("GET /gateway-info", () => {
		it("should return gateway auth info when present in session", async () => {
			const app = createTestApp({
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
			});

			const response = await request(app).get("/auth/gateway-info");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				tenantSlug: "test-tenant",
				returnTo: "https://test-tenant.example.com",
			});
		});

		it("should return 404 when no gateway auth in session", async () => {
			const app = createTestApp({});

			const response = await request(app).get("/auth/gateway-info");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "No gateway auth in session" });
		});
	});

	describe("GET /session-config", () => {
		it("should return session configuration with enabled providers", async () => {
			const app = createTestApp();

			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty("idleTimeoutMs");
			expect(response.body).toHaveProperty("enabledProviders");
			expect(Array.isArray(response.body.enabledProviders)).toBe(true);
		});

		it("should strip jolli_ prefix from provider names", async () => {
			const app = createTestApp();

			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			// Providers should not have jolli_ prefix in the response
			for (const provider of response.body.enabledProviders) {
				expect(provider).not.toMatch(/^jolli_/);
			}
		});

		it("should pass through providers without jolli_ prefix unchanged", async () => {
			// Set ENABLED_AUTH_PROVIDERS to include a provider without jolli_ prefix
			process.env.ENABLED_AUTH_PROVIDERS = "google,github";
			resetConfig();

			const app = createTestApp();

			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.enabledProviders).toContain("google");
			expect(response.body.enabledProviders).toContain("github");
		});

		it("should return siteEnv and jolliSiteDomain in session config", async () => {
			process.env.SITE_ENV = "dev";
			process.env.JOLLI_SITE_DOMAIN = "test.jolli.site";
			resetConfig();

			const app = createTestApp();

			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.siteEnv).toBe("dev");
			expect(response.body.jolliSiteDomain).toBe("test.jolli.site");
		});

		it("should return 'prod' siteEnv for production", async () => {
			process.env.SITE_ENV = "prod";
			resetConfig();

			const app = createTestApp();

			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.siteEnv).toBe("prod");
		});

		it("should return default jolliSiteDomain when not configured", async () => {
			delete process.env.JOLLI_SITE_DOMAIN;
			resetConfig();

			const app = createTestApp();

			const response = await request(app).get("/auth/session-config");

			expect(response.status).toBe(200);
			expect(response.body.jolliSiteDomain).toBe("jolli.site");
		});
	});

	describe("GET /complete (gateway auth)", () => {
		it("should redirect with error when auth code is missing", async () => {
			const app = createTestApp();

			const response = await request(app).get("/auth/complete");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=missing_auth_code");
		});

		it("should redirect with error when auth code is invalid", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(null);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=invalid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=invalid_auth_code");
		});

		it("should redirect with tenant_mismatch when tenant slug does not match", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "test@example.com",
						name: "Test User",
						provider: "jolli_google",
						subject: "123",
					},
					tenantSlug: "other-tenant",
					returnTo: "https://other-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=tenant_mismatch");
		});

		it("should redirect with provider_not_enabled when provider is not allowed", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "test@example.com",
						name: "Test User",
						provider: "jolli_linkedin", // Not in default ENABLED_AUTH_PROVIDERS
						subject: "123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=provider_not_enabled");
		});

		it("should redirect with email_not_authorized when email is not allowed", async () => {
			// Set AUTH_EMAILS to a specific pattern that won't match
			process.env.AUTH_EMAILS = "@allowed-domain.com$";

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "test@not-allowed.com",
						name: "Test User",
						provider: "jolli_google",
						subject: "123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=email_not_authorized");
			// Global setup handles env var restoration
		});

		it("should redirect with seat_limit_reached when max seats is reached", async () => {
			process.env.MAX_SEATS = "1";

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "new-user@example.com",
						name: "New User",
						provider: "jolli_google",
						subject: "new-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			// User doesn't exist (new user) but seat count is at limit
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.countUsers).mockResolvedValue(1);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=seat_limit_reached");
			// Global setup handles env var restoration
		});

		it("should allow existing user even when seat limit is reached", async () => {
			process.env.MAX_SEATS = "1";

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "existing@example.com",
						name: "Existing User",
						provider: "jolli_google",
						subject: "existing-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			// User already exists
			vi.mocked(db.userDao.findUser).mockResolvedValue(
				mockUser({ id: 1, email: "existing@example.com", name: "Existing User" }),
			);
			vi.mocked(db.userDao.updateUser).mockResolvedValue(
				mockUser({ id: 1, email: "existing@example.com", name: "Existing User" }),
			);
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({ id: 1, provider: "jolli_google", subject: "existing-123", email: "existing@example.com" }),
			);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/");
			expect(getCookie(response, "authToken")).toBeDefined();
			// Global setup handles env var restoration
		});

		it("should allow unlimited seats when MAX_SEATS is 'unlimited'", async () => {
			process.env.MAX_SEATS = "unlimited";

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "new@example.com",
						name: "New User",
						provider: "jolli_google",
						subject: "new-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(mockUser({ id: 1, email: "new@example.com" }));
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({ id: 1, provider: "jolli_google", subject: "new-123", email: "new@example.com" }),
			);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/");
			// Global setup handles env var restoration
		});

		it("should use default seat limit of 5 when MAX_SEATS is not set", async () => {
			// Don't set MAX_SEATS - test the default "5" value
			delete process.env.MAX_SEATS;
			resetConfig();

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "new-user@example.com",
						name: "New User",
						provider: "jolli_google",
						subject: "new-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			// User doesn't exist (new user) and seat count is at default limit of 5
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.countUsers).mockResolvedValue(5);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=seat_limit_reached");
		});

		it("should successfully complete auth and issue cookie", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "test@example.com",
						name: "Test User",
						provider: "jolli_google",
						subject: "google-123",
						picture: "https://example.com/photo.jpg",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({ id: 1, email: "test@example.com", name: "Test User" }),
			);
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({ id: 1, provider: "jolli_google", subject: "google-123", email: "test@example.com" }),
			);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/");
			expect(getCookie(response, "authToken")).toBeDefined();
			expect(db.authDao.createAuth).toHaveBeenCalled();
			expect(db.userDao.createUser).toHaveBeenCalled();
		});

		it("should redirect to site auth when pendingSiteAuth is in session", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "test@example.com",
						name: "Test User",
						provider: "jolli_google",
						subject: "google-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({ id: 1, email: "test@example.com", name: "Test User" }),
			);
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({ id: 1, provider: "jolli_google", subject: "google-123", email: "test@example.com" }),
			);

			const sessionData = {
				pendingSiteAuth: {
					siteId: "456",
					returnUrl: "/docs/getting-started",
				},
			};
			const app = createTestApp(sessionData);

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/api/sites/456/auth/jwt?returnUrl=%2Fdocs%2Fgetting-started");
			expect(getCookie(response, "authToken")).toBeDefined();
			// Verify pendingSiteAuth was deleted from session
			expect(sessionData.pendingSiteAuth).toBeUndefined();
		});

		it("should handle pending email selection from gateway", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: { email: "", name: "", provider: "", subject: "" },
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
					pendingEmailSelection: {
						emails: ["email1@example.com", "email2@example.com"],
						authJson: { id: "123", name: "Test" },
						providerName: "google",
					},
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));

			let sessionRef: Record<string, unknown> | undefined;
			const app = express();
			app.use(express.json());
			app.use((req, _res, next) => {
				req.session = {};
				sessionRef = req.session;
				next();
			});
			app.use(
				"/auth",
				createAuthRouter(
					db.authDaoProvider,
					db.userDaoProvider,
					createTokenUtil<UserInfo>("test-secret", { expiresIn: "1h", algorithm: "HS256" }),
				),
			);

			const response = await request(app).get("/auth/complete?code=pending-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?select_email=true");
			expect(sessionRef?.pendingAuth).toEqual({
				authJson: { id: "123", name: "Test" },
				emails: ["email1@example.com", "email2@example.com"],
			});
			expect(sessionRef?.grant).toEqual({ provider: "google" });
		});

		it("should redirect with provider_not_enabled for pending email selection with disabled provider", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: { email: "", name: "", provider: "", subject: "" },
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
					pendingEmailSelection: {
						emails: ["email1@example.com"],
						authJson: { id: "123" },
						providerName: "linkedin", // Not enabled
					},
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=pending-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=provider_not_enabled");
		});

		it("should redirect with server_error on exception", async () => {
			vi.mocked(AuthCodeService.validateAuthCode).mockImplementation(() => {
				throw new Error("Unexpected error");
			});

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=error-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/?error=server_error");
		});

		it("should authorize email matching super admin pattern", async () => {
			process.env.SUPER_ADMIN_EMAILS = "@admin.com$";
			process.env.AUTH_EMAILS = "@regular.com$"; // Regular users can't match

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "superadmin@admin.com",
						name: "Super Admin",
						provider: "jolli_google",
						subject: "admin-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({ id: 1, email: "superadmin@admin.com", name: "Super Admin" }),
			);
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({ id: 1, provider: "jolli_google", subject: "admin-123", email: "superadmin@admin.com" }),
			);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/");
			// Global setup handles env var restoration
		});

		it("should authorize all emails when AUTH_EMAILS is '*'", async () => {
			process.env.AUTH_EMAILS = "*";

			vi.mocked(AuthCodeService.validateAuthCode).mockReturnValue(
				mockAuthCodePayload({
					userInfo: {
						email: "anyone@any-domain.com",
						name: "Anyone",
						provider: "jolli_google",
						subject: "anyone-123",
					},
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				}),
			);
			vi.mocked(TenantContext.getTenantContext).mockReturnValue(mockTenantOrgContext("test-tenant"));
			vi.mocked(db.userDao.findUser).mockResolvedValue(undefined);
			vi.mocked(db.userDao.createUser).mockResolvedValue(
				mockUser({ id: 1, email: "anyone@any-domain.com", name: "Anyone" }),
			);
			vi.mocked(db.authDao.findAuth).mockResolvedValue(undefined);
			vi.mocked(db.authDao.createAuth).mockResolvedValue(
				mockAuth({ id: 1, provider: "jolli_google", subject: "anyone-123", email: "anyone@any-domain.com" }),
			);

			const app = createTestApp();

			const response = await request(app).get("/auth/complete?code=valid-code");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/");
			// Global setup handles env var restoration
		});
	});

	describe("GET /callback (gateway mode)", () => {
		it("should redirect to tenant complete endpoint with auth code in gateway mode", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			const userData = {
				id: "google-123",
				email: "test@gmail.com",
				name: "Test User",
				picture: "https://example.com/photo.jpg",
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(userData),
			});

			const app = createTestApp({
				grant: {
					response: { access_token: "google-token" },
					provider: "google",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://test-tenant.example.com/api/auth/complete");
			expect(response.headers.location).toContain("code=mock-auth-code");
			expect(AuthCodeService.generateAuthCode).toHaveBeenCalled();

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});

		it("should handle gateway mode with missing picture and subject fields", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			// GitHub user data without picture (avatar_url) and with numeric id (subject will be stringified)
			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				// No avatar_url - testing picture fallback
			};

			// GitHub provider needs to fetch emails when no email in userData
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([{ email: "test@example.com", verified: true, primary: true }]),
				});

			const app = createTestApp({
				grant: {
					response: { access_token: "github-token" },
					provider: "github",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://test-tenant.example.com/api/auth/complete");
			expect(response.headers.location).toContain("code=mock-auth-code");
			expect(AuthCodeService.generateAuthCode).toHaveBeenCalled();

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});

		it("should handle multiple emails in gateway mode by generating pending code", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve([
							{ email: "email1@example.com", verified: true, primary: true },
							{ email: "email2@example.com", verified: true, primary: false },
						]),
				});

			const app = createTestApp({
				grant: {
					response: { access_token: "github-token" },
					provider: "github",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://test-tenant.example.com/api/auth/complete");
			expect(response.headers.location).toContain("code=mock-pending-code");
			expect(AuthCodeService.generatePendingEmailAuthCode).toHaveBeenCalledWith(
				["email1@example.com", "email2@example.com"],
				expect.any(Object),
				"github",
				"test-tenant",
				"https://test-tenant.example.com",
			);

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});

		it("should handle single verified email in gateway mode (GitHub)", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([{ email: "single@example.com", verified: true, primary: true }]),
				});

			const app = createTestApp({
				grant: {
					response: { access_token: "github-token" },
					provider: "github",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://test-tenant.example.com/api/auth/complete");
			expect(response.headers.location).toContain("code=mock-auth-code");
			// Should use generateAuthCode (not generatePendingEmailAuthCode) since there's only 1 email
			expect(AuthCodeService.generateAuthCode).toHaveBeenCalled();

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});

		it("should redirect with no_verified_emails in gateway mode", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(userData),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve([]), // No verified emails
				});

			const app = createTestApp({
				grant: {
					response: { access_token: "github-token" },
					provider: "github",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
			});

			const response = await request(app).get("/auth/callback");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("https://test-tenant.example.com/?error=no_verified_emails");

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});
	});

	describe("POST /select-email (gateway mode)", () => {
		it("should return redirect URL in gateway mode", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			const app = createTestApp({
				grant: {
					provider: "google",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
				pendingAuth: {
					authJson: {
						id: "google-123",
						name: "Test User",
					},
					emails: ["email1@example.com", "email2@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: "email1@example.com" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.redirectTo).toContain("https://test-tenant.example.com/api/auth/complete");
			expect(response.body.redirectTo).toContain("code=mock-auth-code");

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});

		it("should handle gateway mode with missing name and picture in authJson", async () => {
			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(true);

			const app = createTestApp({
				grant: {
					provider: "github",
				},
				gatewayAuth: {
					tenantSlug: "test-tenant",
					returnTo: "https://test-tenant.example.com",
				},
				pendingAuth: {
					authJson: {
						id: 12345,
						login: "testuser",
						// No name or avatar_url - testing fallbacks
					},
					emails: ["email1@example.com", "email2@example.com"],
				},
			});

			const response = await request(app).post("/auth/select-email").send({ email: "email1@example.com" });

			expect(response.status).toBe(200);
			expect(response.body.success).toBe(true);
			expect(response.body.redirectTo).toContain("https://test-tenant.example.com/api/auth/complete");
			expect(response.body.redirectTo).toContain("code=mock-auth-code");

			vi.mocked(AuthGateway.isMultiTenantAuthEnabled).mockReturnValue(false);
		});
	});
});
