import type { BetterAuthInstance } from "../auth/BetterAuthConfig";
import type { ManagerDatabase } from "../core/ManagerDatabase";
import type { TokenUtil } from "../util/TokenUtil";
import { type AuthEmailSelectionRouterDeps, createAuthEmailSelectionRouter } from "./AuthEmailSelectionRouter";
import express from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockValidateAuthCode = vi.fn();
const mockBuildAuthCookieValue = vi.fn();
const mockResolveCookieDomain = vi.fn();

vi.mock("../auth/AuthCodeService", () => ({
	validateAuthCode: (...args: Array<unknown>) => mockValidateAuthCode(...args),
}));

vi.mock("../util/Cookies", () => ({
	buildAuthCookieValue: (...args: Array<unknown>) => mockBuildAuthCookieValue(...args),
	resolveCookieDomain: (...args: Array<unknown>) => mockResolveCookieDomain(...args),
}));

interface TestDeps {
	managerDb: ManagerDatabase;
	tokenUtil: TokenUtil<UserInfo>;
	betterAuthUpdateSession: ReturnType<typeof vi.fn>;
	betterAuthGetSession: ReturnType<typeof vi.fn>;
	betterAuthUpdateUser: ReturnType<typeof vi.fn>;
}

interface TestAppOptions {
	origin?: string;
	tokenCookieMaxAge?: AuthEmailSelectionRouterDeps["tokenCookieMaxAge"];
}

function createTestApp(options?: TestAppOptions): { app: express.Express; deps: TestDeps } {
	const app = express();
	app.use(express.json());

	const managerDb = {
		globalAuthDao: {
			findAuthWithUserByProviderId: vi.fn(),
			reassignAuthByProviderId: vi.fn(),
			updateTokens: vi.fn(),
			updateTokensByProviderId: vi.fn(),
		},
		globalUserDao: {
			findUserByEmail: vi.fn(),
			createUser: vi.fn(),
			updateUserEmail: vi.fn(),
		},
	} as unknown as ManagerDatabase;

	const tokenUtil = {
		generateToken: vi.fn().mockReturnValue("jwt-token"),
	} as unknown as TokenUtil<UserInfo>;

	const betterAuthUpdateSession = vi.fn().mockResolvedValue({
		id: "session-id",
		token: "session-token-abc",
		userId: "42",
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		createdAt: new Date(Date.now() - 60 * 1000),
		updatedAt: new Date(),
	});
	const betterAuthUpdateUser = vi.fn().mockResolvedValue({
		id: "42",
		email: "hanthor@126.com",
		name: "Han Thor",
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	const betterAuthGetSession = vi
		.fn()
		.mockImplementation((args?: { headers?: Headers; query?: { disableRefresh?: boolean } }) => {
			const cookieHeader = args?.headers?.get("cookie") ?? "";
			const hasSessionToken = cookieHeader.includes("session_token=");
			if (!hasSessionToken) {
				return { response: null, headers: new Headers() };
			}

			if (args?.query?.disableRefresh) {
				return {
					response: {
						session: { token: "session-token-abc" },
					},
					headers: new Headers(),
				};
			}

			return {
				response: {
					session: { token: "session-token-abc" },
				},
				headers: new Headers({
					"set-cookie": "JSID.session_data=refreshed-cache; Path=/; HttpOnly; SameSite=Lax",
				}),
			};
		});
	const betterAuth = {
		api: {
			getSession: betterAuthGetSession,
		},
		$context: Promise.resolve({
			options: {
				secondaryStorage: {},
			},
			internalAdapter: {
				updateSession: betterAuthUpdateSession,
				updateUser: betterAuthUpdateUser,
			},
		}),
	} as unknown as BetterAuthInstance;

	app.use(
		createAuthEmailSelectionRouter({
			managerDb,
			betterAuth,
			tokenUtil,
			tokenCookieMaxAge: options?.tokenCookieMaxAge ?? "2h",
			origin: options?.origin ?? "http://localhost:8034",
		}),
	);

	return {
		app,
		deps: {
			managerDb,
			tokenUtil,
			betterAuthUpdateSession,
			betterAuthGetSession,
			betterAuthUpdateUser,
		},
	};
}

describe("AuthEmailSelectionRouter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockResolveCookieDomain.mockReturnValue(undefined);
		mockBuildAuthCookieValue.mockReturnValue("authToken=jwt-token; Path=/; HttpOnly; SameSite=Lax");
	});

	it("POST /auth/validate-code should return 400 when code is missing", async () => {
		const { app } = createTestApp();
		const response = await request(app).post("/auth/validate-code").send({});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: "Missing code" });
	});

	it("POST /auth/validate-code should return email list for valid code", async () => {
		const { app } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
			},
		});

		const response = await request(app).post("/auth/validate-code").send({ code: "valid-code" });

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
			},
		});
	});

	it("POST /auth/validate-code should return 400 for invalid code payload", async () => {
		const { app } = createTestApp();
		mockValidateAuthCode.mockReturnValue(null);

		const response = await request(app).post("/auth/validate-code").send({ code: "expired-code" });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: "Invalid or expired code" });
	});

	it("POST /auth/validate-code should return 400 when code validation throws", async () => {
		const { app } = createTestApp();
		mockValidateAuthCode.mockImplementation(() => {
			throw new Error("bad payload");
		});

		const response = await request(app).post("/auth/validate-code").send({ code: "broken-code" });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: "Invalid or expired code" });
	});

	it("POST /auth/select-email should return 400 when code or email is missing", async () => {
		const { app } = createTestApp();

		const response = await request(app).post("/auth/select-email").send({ code: "only-code" });

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: "Missing code or email" });
	});

	it("POST /auth/select-email should return 400 when auth code is invalid", async () => {
		const { app } = createTestApp();
		mockValidateAuthCode.mockReturnValue(null);

		const response = await request(app).post("/auth/select-email").send({
			code: "invalid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(400);
		expect(response.body).toEqual({ error: "Invalid or expired code" });
	});

	it("POST /auth/select-email should return 403 when selected email is not in allowed list", async () => {
		const { app } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accountId: "github-123",
				},
			},
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(403);
		expect(response.body).toEqual({ error: "Invalid email selection" });
	});

	it("POST /auth/select-email should return 500 when provider id is missing in auth data", async () => {
		const { app } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accessToken: "access-token",
				},
			},
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "foster.han@jolli.ai",
		});

		expect(response.status).toBe(500);
		expect(response.body).toEqual({ error: "Missing GitHub account information" });
	});

	it("POST /auth/select-email should fallback to authJson.providerId when accountId is missing", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					providerId: "github-provider-only",
					accessToken: "access-token",
					refreshToken: 42,
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(200);
		expect(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).toHaveBeenCalledWith(
			"github",
			"github-provider-only",
		);
		expect(deps.managerDb.globalAuthDao.updateTokensByProviderId).toHaveBeenCalledWith(
			"github",
			"github-provider-only",
			"access-token",
			null,
		);
	});

	it("POST /auth/select-email should return 500 when auth record is missing", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue(undefined);

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "foster.han@jolli.ai",
		});

		expect(response.status).toBe(500);
		expect(response.body).toEqual({ error: "Authentication state lost" });
	});

	it("POST /auth/select-email should return 403 for inactive user", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: false,
			authCount: 1,
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "foster.han@jolli.ai",
		});

		expect(response.status).toBe(403);
		expect(response.body).toEqual({ error: "Account is inactive" });
	});

	it("POST /auth/select-email should keep current user when selected email matches current email", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "foster.han@jolli.ai",
		});

		expect(response.status).toBe(200);
		expect(deps.managerDb.globalUserDao.findUserByEmail).not.toHaveBeenCalled();
		expect(deps.managerDb.globalUserDao.createUser).not.toHaveBeenCalled();
		expect(deps.managerDb.globalUserDao.updateUserEmail).not.toHaveBeenCalled();
		expect(deps.managerDb.globalAuthDao.reassignAuthByProviderId).not.toHaveBeenCalled();
		expect(deps.tokenUtil.generateToken).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 42,
				email: "foster.han@jolli.ai",
			}),
		);
	});

	it("POST /auth/select-email should parse authCount when returned as string", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: "2" as unknown as number,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);
		vi.mocked(deps.managerDb.globalUserDao.createUser).mockResolvedValue({
			id: 77,
			email: "hanthor@126.com",
			name: "Foster Han",
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(200);
		expect(deps.managerDb.globalUserDao.createUser).toHaveBeenCalledOnce();
		expect(deps.managerDb.globalAuthDao.reassignAuthByProviderId).toHaveBeenCalledWith("github", "github-123", 77);
	});

	it("POST /auth/select-email should treat missing authCount as zero", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: undefined as unknown as number,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(200);
		expect(deps.managerDb.globalUserDao.updateUserEmail).toHaveBeenCalledWith(42, "hanthor@126.com");
		expect(deps.managerDb.globalUserDao.createUser).not.toHaveBeenCalled();
	});

	it("POST /auth/select-email should use empty access token when authJson.accessToken is not a string", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accountId: "github-123",
					accessToken: 123,
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "foster.han@jolli.ai",
		});

		expect(response.status).toBe(200);
		expect(deps.managerDb.globalAuthDao.updateTokensByProviderId).toHaveBeenCalledWith(
			"github",
			"github-123",
			"",
			null,
		);
	});

	it("POST /auth/select-email should include secure cookie attributes for https origin", async () => {
		const { app, deps } = createTestApp({ origin: "https://auth.jolli.ai" });
		mockResolveCookieDomain.mockReturnValue(".jolli.ai");
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "foster.han@jolli.ai",
		});

		expect(response.status).toBe(200);
		expect(mockBuildAuthCookieValue).toHaveBeenCalledWith("jwt-token", ".jolli.ai", 7200000, true);
		const setCookies = ([] as Array<string>).concat(response.headers["set-cookie"] ?? []);
		expect(setCookies.some(cookie => cookie.includes("Secure"))).toBe(true);
		expect(setCookies.some(cookie => cookie.includes("Domain=.jolli.ai"))).toBe(true);
	});

	it("POST /auth/select-email should synchronize better-auth session user when session token exists", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);

		const response = await request(app)
			.post("/auth/select-email")
			.set("Cookie", "JSID.session_token=session-token-abc")
			.send({
				code: "valid-code",
				email: "hanthor@126.com",
			});

		expect(response.status).toBe(200);
		expect(deps.betterAuthUpdateSession).toHaveBeenCalledWith(
			"session-token-abc",
			expect.objectContaining({
				userId: "42",
				updatedAt: expect.any(Date),
			}),
		);
		expect(deps.betterAuthUpdateUser).toHaveBeenCalledWith(
			"42",
			expect.objectContaining({
				updatedAt: expect.any(Date),
			}),
		);
		const setCookies = ([] as Array<string>).concat(response.headers["set-cookie"] ?? []);
		expect(setCookies.some(cookie => cookie.includes("JSID.session_data=refreshed-cache"))).toBe(true);
	});

	it("POST /auth/select-email should synchronize better-auth session user with secure-prefixed session cookie", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);

		const response = await request(app)
			.post("/auth/select-email")
			.set("Cookie", "__Secure-JSID.session_token=session-token-secure")
			.send({
				code: "valid-code",
				email: "hanthor@126.com",
			});

		expect(response.status).toBe(200);
		expect(deps.betterAuthUpdateSession).toHaveBeenCalledWith(
			"session-token-abc",
			expect.objectContaining({
				userId: "42",
				updatedAt: expect.any(Date),
			}),
		);
	});

	it("POST /auth/select-email should ignore better-auth session sync errors", async () => {
		const { app, deps } = createTestApp();
		deps.betterAuthUpdateSession.mockRejectedValue(new Error("session update failed"));
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);

		const response = await request(app)
			.post("/auth/select-email")
			.set("Cookie", "JSID.session_token=session-token-abc")
			.send({
				code: "valid-code",
				email: "hanthor@126.com",
			});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			redirectTo: "/select-tenant",
			effectiveEmail: "hanthor@126.com",
		});
	});

	it("POST /auth/select-email should return 500 when downstream operation throws", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);
		vi.mocked(deps.managerDb.globalUserDao.updateUserEmail).mockRejectedValue(new Error("db unavailable"));

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(500);
		expect(response.body).toEqual({ error: "Login failed" });
	});

	it("POST /auth/select-email should create user and reassign GitHub auth for linked accounts", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 2,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);
		vi.mocked(deps.managerDb.globalUserDao.createUser).mockResolvedValue({
			id: 77,
			email: "hanthor@126.com",
			name: "Foster Han",
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			redirectTo: "/select-tenant",
			effectiveEmail: "hanthor@126.com",
		});
		expect(deps.managerDb.globalUserDao.createUser).toHaveBeenCalledWith({
			email: "hanthor@126.com",
			name: "Foster Han",
			isActive: true,
		});
		expect(deps.managerDb.globalAuthDao.reassignAuthByProviderId).toHaveBeenCalledWith("github", "github-123", 77);
		expect(deps.managerDb.globalUserDao.updateUserEmail).not.toHaveBeenCalled();
		expect(deps.managerDb.globalAuthDao.updateTokensByProviderId).toHaveBeenCalledWith(
			"github",
			"github-123",
			"access-token",
			"refresh-token",
		);
		expect(deps.tokenUtil.generateToken).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 77,
				email: "hanthor@126.com",
			}),
		);
	});

	it("POST /auth/select-email should reassign GitHub auth to existing selected-email user", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 17,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 2,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue({
			id: 99,
			email: "hanthor@126.com",
			name: "Han Thor",
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			redirectTo: "/select-tenant",
			effectiveEmail: "hanthor@126.com",
		});
		expect(deps.managerDb.globalAuthDao.reassignAuthByProviderId).toHaveBeenCalledWith("github", "github-123", 99);
		expect(deps.managerDb.globalAuthDao.updateTokensByProviderId).toHaveBeenCalledWith(
			"github",
			"github-123",
			"access-token",
			"refresh-token",
		);
		expect(deps.tokenUtil.generateToken).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 99,
				email: "hanthor@126.com",
				name: "Han Thor",
			}),
		);
		expect(deps.managerDb.globalUserDao.updateUserEmail).not.toHaveBeenCalled();
	});

	it("POST /auth/select-email should update email for first auth and return success", async () => {
		const { app, deps } = createTestApp();
		mockValidateAuthCode.mockReturnValue({
			pendingEmailSelection: {
				emails: ["foster.han@jolli.ai", "hanthor@126.com"],
				authJson: {
					accountId: "github-123",
					accessToken: "access-token",
					refreshToken: "refresh-token",
					picture: "https://example.com/avatar.png",
				},
			},
		});
		vi.mocked(deps.managerDb.globalAuthDao.findAuthWithUserByProviderId).mockResolvedValue({
			userId: 42,
			userEmail: "foster.han@jolli.ai",
			userName: "Foster Han",
			isActive: true,
			authCount: 1,
		});
		vi.mocked(deps.managerDb.globalUserDao.findUserByEmail).mockResolvedValue(undefined);

		const response = await request(app).post("/auth/select-email").send({
			code: "valid-code",
			email: "hanthor@126.com",
		});

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			redirectTo: "/select-tenant",
			effectiveEmail: "hanthor@126.com",
		});
		expect(deps.managerDb.globalUserDao.updateUserEmail).toHaveBeenCalledWith(42, "hanthor@126.com");
		expect(deps.managerDb.globalAuthDao.updateTokensByProviderId).toHaveBeenCalledWith(
			"github",
			"github-123",
			"access-token",
			"refresh-token",
		);
		expect(response.headers["set-cookie"]).toBeDefined();
		const setCookies = ([] as Array<string>).concat(response.headers["set-cookie"] ?? []);
		expect(setCookies.some((cookie: string) => cookie.includes("authToken=jwt-token"))).toBe(true);
		expect(setCookies.some((cookie: string) => cookie.includes("email_selection="))).toBe(true);
	});
});
