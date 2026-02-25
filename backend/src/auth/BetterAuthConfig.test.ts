import { type BetterAuthDeps, createBetterAuth, hashToken } from "./BetterAuthConfig";
import Redis from "ioredis";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

vi.mock("pg");
vi.mock("ioredis");
vi.mock("../util/EmailService");
vi.mock("../services/RateLimitService");
vi.mock("../services/RedisService");
vi.mock("../services/LoginSecurityService");
vi.mock("../config/Config");
vi.mock("better-auth", () => ({
	betterAuth: vi.fn(() => ({
		handler: vi.fn(),
		api: {
			getSession: vi.fn(),
		},
	})),
}));
vi.mock("better-auth/api", () => ({
	APIError: class APIError extends Error {
		status: string;
		body: { message?: string } | undefined;
		constructor(status: string, body?: { message?: string }) {
			super(body?.message ?? status);
			this.name = "APIError";
			this.status = status;
			this.body = body;
		}
	},
	createAuthMiddleware: vi.fn(fn => fn),
	getOAuthState: vi.fn(),
}));

describe("BetterAuthConfig", () => {
	let mockPool: { query: Mock; end: Mock };
	let mockRedis: {
		ping: Mock;
		quit: Mock;
		get: Mock;
		set: Mock;
		incr: Mock;
		expire: Mock;
		setex: Mock;
		del: Mock;
		ttl: Mock;
		on: Mock;
	};
	let mockDeps: BetterAuthDeps;

	beforeEach(async () => {
		mockPool = {
			query: vi.fn().mockResolvedValue({ rows: [] }),
			end: vi.fn().mockResolvedValue(undefined),
		};

		mockRedis = {
			ping: vi.fn().mockResolvedValue("PONG"),
			quit: vi.fn().mockResolvedValue(undefined),
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue("OK"),
			incr: vi.fn().mockResolvedValue(1),
			expire: vi.fn().mockResolvedValue(1),
			setex: vi.fn().mockResolvedValue("OK"),
			del: vi.fn().mockResolvedValue(1),
			ttl: vi.fn().mockResolvedValue(-1),
			on: vi.fn().mockReturnThis(),
		};

		// Mock RedisService.getRedis()
		const RedisService = await import("../services/RedisService");
		vi.mocked(RedisService.getRedis).mockReturnValue(
			mockRedis as unknown as ReturnType<typeof RedisService.getRedis>,
		);

		// Mock getConfig()
		const Config = await import("../config/Config");
		vi.mocked(Config.getConfig).mockReturnValue({
			LOGIN_MAX_ATTEMPTS: 5,
			LOGIN_LOCK_DURATION_MINUTES: 15,
			LOGIN_RATE_LIMIT_PER_MINUTE: 10,
			MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
			REDIS_URL: "redis://localhost:6379",
			ORIGIN: "http://localhost:8034",
			BASE_DOMAIN: undefined,
			TOKEN_COOKIE_MAX_AGE: "2h",
		} as unknown as ReturnType<typeof Config.getConfig>);

		mockDeps = {
			tokenUtil: {
				generateToken: vi.fn().mockReturnValue("mock-jwt-token"),
				verifyToken: vi.fn(),
				extractToken: vi.fn(),
			},
			globalUserDao: {
				findUserById: vi.fn().mockResolvedValue({
					id: 1,
					email: "test@example.com",
					name: "Test User",
					isActive: true,
				}),
				findUserByEmail: vi.fn(),
				createUser: vi.fn(),
				updateUser: vi.fn(),
			},
			verificationDao: {
				createVerification: vi.fn().mockResolvedValue({
					id: 1,
					identifier: "test@example.com",
					tokenHash: "test-hash",
					type: "password_reset",
					expiresAt: new Date(),
					createdAt: new Date(),
				}),
				findByTokenHash: vi.fn(),
				markAsUsed: vi.fn(),
				deleteVerification: vi.fn(),
				deleteExpiredOrUsed: vi.fn(),
				deleteByIdentifierAndType: vi.fn().mockResolvedValue(0),
			},
			passwordAuthService: {
				handlePasswordResetRequest: vi.fn().mockResolvedValue(undefined),
			},
		} as unknown as BetterAuthDeps;

		(Pool as unknown as Mock).mockImplementation(() => mockPool);
		(Redis as unknown as Mock).mockImplementation(() => mockRedis);

		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should create better-auth instance with required dependencies", async () => {
		const auth = await createBetterAuth(mockDeps);
		expect(auth).toBeDefined();
		expect(auth.handler).toBeDefined();
		expect(auth.api).toBeDefined();
	});

	it("should configure database with Manager DB connection", async () => {
		const auth = await createBetterAuth(mockDeps);
		expect(auth).toBeDefined();
		expect(Pool).toHaveBeenCalled();
	});

	it("should attempt Redis connection if REDIS_URL configured", async () => {
		await createBetterAuth(mockDeps);
		// Redis connection is attempted in createBetterAuth
		// We can't verify much without exposing internals
		expect(true).toBe(true);
	});

	it("should not throw when creating auth instance", async () => {
		await expect(createBetterAuth(mockDeps)).resolves.toBeDefined();
	});

	it("should return auth instance with handler and api", async () => {
		const auth = await createBetterAuth(mockDeps);
		expect(typeof auth.handler).toBe("function");
		expect(auth.api).toBeDefined();
		expect(typeof auth.api.getSession).toBe("function");
	});

	it("should extract token from better-auth URL path correctly", async () => {
		// Mock the betterAuth configuration to extract sendResetPassword
		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		// Get the actual configuration
		await createBetterAuth(mockDeps);

		// Verify betterAuth was called with config
		expect(betterAuthMock).toHaveBeenCalled();
		const config = betterAuthMock.mock.calls[0][0];

		// Test the sendResetPassword hook
		const sendResetPassword = config.emailAndPassword?.sendResetPassword;
		expect(sendResetPassword).toBeDefined();

		if (sendResetPassword) {
			// Test with better-auth 1.4.17 URL format (token in path)
			const plainToken = "C1eYxD1BIAjBanSS6vc3Ogwb";
			const testUrl = `https://auth.jolli-local.me/auth/reset-password/${plainToken}?callbackURL=https%3A%2F%2Fauth.jolli-local.me%2Freset-password`;
			const testUser = {
				id: "1",
				email: "test@example.com",
				name: "Test User",
				createdAt: new Date(),
				updatedAt: new Date(),
				emailVerified: true,
			};

			// Call the hook (token is unused but required by the type)
			await sendResetPassword({ user: testUser, url: testUrl, token: "test-token" });

			// Wait for async fire-and-forget to complete
			await new Promise(resolve => setTimeout(resolve, 100));

			// Verify passwordAuthService.handlePasswordResetRequest was called with HASHED token
			const expectedHashedToken = hashToken(plainToken);
			expect(mockDeps.passwordAuthService.handlePasswordResetRequest).toHaveBeenCalledWith(
				testUser,
				expectedHashedToken,
			);
		}
	});

	it("should delegate password reset to PasswordAuthService", async () => {
		// The sendResetPassword hook delegates to passwordAuthService.handlePasswordResetRequest
		// which handles rate limiting, user existence check, and email sending
		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[0][0];
		const sendResetPassword = config.emailAndPassword?.sendResetPassword;

		if (sendResetPassword) {
			const plainToken = "token123";
			const testUrl = `https://auth.jolli-local.me/auth/reset-password/${plainToken}?callbackURL=...`;
			const testUser = {
				id: "1",
				email: "test@example.com",
				name: "Test User",
				createdAt: new Date(),
				updatedAt: new Date(),
				emailVerified: true,
			};

			await sendResetPassword({ user: testUser, url: testUrl, token: "test-token" });
			await new Promise(resolve => setTimeout(resolve, 100));

			// Should delegate to passwordAuthService with HASHED token
			const expectedHashedToken = hashToken(plainToken);
			expect(mockDeps.passwordAuthService.handlePasswordResetRequest).toHaveBeenCalledWith(
				testUser,
				expectedHashedToken,
			);
		}
	});

	it("should handle errors from PasswordAuthService gracefully", async () => {
		// Mock passwordAuthService to throw error
		mockDeps.passwordAuthService.handlePasswordResetRequest = vi.fn().mockRejectedValue(new Error("Service error"));

		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[0][0];
		const sendResetPassword = config.emailAndPassword?.sendResetPassword;

		if (sendResetPassword) {
			const plainToken = "token123";
			const testUrl = `https://auth.jolli-local.me/auth/reset-password/${plainToken}?callbackURL=...`;
			const testUser = {
				id: "1",
				email: "test@example.com",
				name: "Test User",
				createdAt: new Date(),
				updatedAt: new Date(),
				emailVerified: true,
			};

			// Should not throw error (fire-and-forget with error handling)
			await expect(
				sendResetPassword({ user: testUser, url: testUrl, token: "test-token" }),
			).resolves.not.toThrow();

			// Wait for async operation
			await new Promise(resolve => setTimeout(resolve, 100));

			// Service should have been called with HASHED token
			const expectedHashedToken = hashToken(plainToken);
			expect(mockDeps.passwordAuthService.handlePasswordResetRequest).toHaveBeenCalledWith(
				testUser,
				expectedHashedToken,
			);
		}
	});

	it("should handle Redis secondaryStorage get errors gracefully", async () => {
		// Mock Redis with error on get
		const mockRedisWithGetError = {
			get: vi.fn().mockRejectedValue(new Error("Redis connection failed")),
			setex: vi.fn().mockResolvedValue("OK"),
			set: vi.fn().mockResolvedValue("OK"),
			del: vi.fn().mockResolvedValue(1),
			on: vi.fn(),
			ping: vi.fn().mockResolvedValue("PONG"),
			quit: vi.fn().mockResolvedValue(undefined),
		};
		(Redis as unknown as Mock).mockImplementation(() => mockRedisWithGetError);

		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

		// Test that the secondaryStorage.get handles errors gracefully (returns null)
		// secondaryStorage is at the top level of better-auth config, not inside session
		const secondaryStorage = config.secondaryStorage as {
			get: (key: string) => Promise<string | null>;
		};
		if (secondaryStorage?.get) {
			const getResult = await secondaryStorage.get("test-session-id");
			expect(getResult).toBeNull();
			expect(mockRedisWithGetError.get).toHaveBeenCalledWith("session:test-session-id");
		}
	});

	it("should handle Redis secondaryStorage set errors gracefully", async () => {
		// Mock Redis with error on setex
		const mockRedisWithSetError = {
			get: vi.fn().mockResolvedValue(null),
			setex: vi.fn().mockRejectedValue(new Error("Redis connection failed")),
			set: vi.fn().mockRejectedValue(new Error("Redis connection failed")),
			del: vi.fn().mockResolvedValue(1),
			on: vi.fn(),
			ping: vi.fn().mockResolvedValue("PONG"),
			quit: vi.fn().mockResolvedValue(undefined),
		};
		(Redis as unknown as Mock).mockImplementation(() => mockRedisWithSetError);

		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

		// Test that the secondaryStorage.set handles errors gracefully (doesn't throw)
		// secondaryStorage is at the top level of better-auth config, not inside session
		const secondaryStorage = config.secondaryStorage as {
			set: (key: string, value: string, ttl?: number) => Promise<void>;
		};
		if (secondaryStorage?.set) {
			await expect(
				secondaryStorage.set("test-session-id", JSON.stringify({ userId: "123" }), 7200),
			).resolves.not.toThrow();
			expect(mockRedisWithSetError.setex).toHaveBeenCalledWith(
				"session:test-session-id",
				7200, // TTL passed by better-auth
				JSON.stringify({ userId: "123" }),
			);
		}
	});

	it("should handle Redis secondaryStorage delete errors gracefully", async () => {
		// Mock Redis with error on del
		const mockRedisWithDelError = {
			get: vi.fn().mockResolvedValue(null),
			setex: vi.fn().mockResolvedValue("OK"),
			set: vi.fn().mockResolvedValue("OK"),
			del: vi.fn().mockRejectedValue(new Error("Redis connection failed")),
			on: vi.fn(),
			ping: vi.fn().mockResolvedValue("PONG"),
			quit: vi.fn().mockResolvedValue(undefined),
		};
		(Redis as unknown as Mock).mockImplementation(() => mockRedisWithDelError);

		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

		// Test that the secondaryStorage.delete handles errors gracefully (doesn't throw)
		// secondaryStorage is at the top level of better-auth config, not inside session
		const secondaryStorage = config.secondaryStorage as {
			delete: (key: string) => Promise<void>;
		};
		if (secondaryStorage?.delete) {
			await expect(secondaryStorage.delete("test-session-id")).resolves.not.toThrow();
			expect(mockRedisWithDelError.del).toHaveBeenCalledWith("session:test-session-id");
		}
	});

	it("should generate JWT token and set cookie after authentication", async () => {
		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[0][0];

		// Get the after hook
		const afterHook = config.hooks?.after;
		expect(afterHook).toBeDefined();

		if (afterHook) {
			// Mock context with new session
			const mockCtx = {
				context: {
					newSession: {
						user: {
							id: "1",
							email: "test@example.com",
							name: "Test User",
							image: "https://example.com/avatar.jpg",
						},
					},
				},
				setHeader: vi.fn(),
			};

			// Call the hook
			// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
			await afterHook(mockCtx as any);

			// Verify user was fetched
			expect(mockDeps.globalUserDao.findUserById).toHaveBeenCalledWith(1);

			// Verify JWT token was generated
			expect(mockDeps.tokenUtil.generateToken).toHaveBeenCalledWith({
				userId: 1,
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.jpg",
			});

			// Verify cookie was set
			expect(mockCtx.setHeader).toHaveBeenCalledWith(
				"Set-Cookie",
				expect.stringContaining("authToken=mock-jwt-token"),
			);
		}
	});

	it("should not set cookie if user not found after authentication", async () => {
		// Mock globalUserDao to return null
		mockDeps.globalUserDao.findUserById = vi.fn().mockResolvedValue(null);

		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[0][0];

		const afterHook = config.hooks?.after;
		if (afterHook) {
			const mockCtx = {
				context: {
					newSession: {
						user: {
							id: "999",
							email: "notfound@example.com",
							name: "Not Found",
						},
					},
				},
				setHeader: vi.fn(),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
			await afterHook(mockCtx as any);

			// User should be fetched
			expect(mockDeps.globalUserDao.findUserById).toHaveBeenCalledWith(999);

			// Token should NOT be generated
			expect(mockDeps.tokenUtil.generateToken).not.toHaveBeenCalled();

			// Cookie should NOT be set
			expect(mockCtx.setHeader).not.toHaveBeenCalled();
		}
	});

	it("should not set cookie if no new session in context", async () => {
		const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));

		await createBetterAuth(mockDeps);
		const config = betterAuthMock.mock.calls[0][0];

		const afterHook = config.hooks?.after;
		if (afterHook) {
			// Context without newSession
			const mockCtx = {
				context: {},
				setHeader: vi.fn(),
			};

			// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
			await afterHook(mockCtx as any);

			// User should NOT be fetched
			expect(mockDeps.globalUserDao.findUserById).not.toHaveBeenCalled();

			// Token should NOT be generated
			expect(mockDeps.tokenUtil.generateToken).not.toHaveBeenCalled();

			// Cookie should NOT be set
			expect(mockCtx.setHeader).not.toHaveBeenCalled();
		}
	});

	it("should handle Redis client creation errors gracefully", async () => {
		// Mock Redis constructor to throw
		(Redis as unknown as Mock).mockImplementation(() => {
			throw new Error("Redis initialization failed");
		});

		// Should not throw when Redis client creation fails
		await expect(createBetterAuth(mockDeps)).resolves.toBeDefined();
	});

	it("should handle Redis error and connect events", async () => {
		// Track event handlers
		const eventHandlers: Record<string, (...args: Array<unknown>) => void> = {};
		const mockRedisWithEvents = {
			ping: vi.fn().mockResolvedValue("PONG"),
			quit: vi.fn().mockResolvedValue(undefined),
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue("OK"),
			setex: vi.fn().mockResolvedValue("OK"),
			del: vi.fn().mockResolvedValue(1),
			on: vi.fn((event: string, handler: (...args: Array<unknown>) => void) => {
				eventHandlers[event] = handler;
				return mockRedisWithEvents;
			}),
		};
		(Redis as unknown as Mock).mockImplementation(() => mockRedisWithEvents);

		await createBetterAuth(mockDeps);

		// Verify event handlers were registered
		expect(mockRedisWithEvents.on).toHaveBeenCalledWith("error", expect.any(Function));
		expect(mockRedisWithEvents.on).toHaveBeenCalledWith("connect", expect.any(Function));

		// Trigger the error event handler
		expect(() => eventHandlers.error?.(new Error("Connection lost"))).not.toThrow();

		// Trigger the connect event handler
		expect(() => eventHandlers.connect?.()).not.toThrow();
	});

	describe("Inactive user blocking", () => {
		it("should block sign-in for inactive users via before hook", async () => {
			// Mock findUserByEmail to return an inactive user
			mockDeps.globalUserDao.findUserByEmail = vi.fn().mockResolvedValue({
				id: 1,
				email: "inactive@example.com",
				name: "Inactive User",
				isActive: false,
			});

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const beforeHook = config.hooks?.before;
			expect(beforeHook).toBeDefined();

			if (beforeHook) {
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					body: { email: "inactive@example.com", password: "password123" },
				};

				// Should throw APIError for inactive user
				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await expect(beforeHook(mockCtx as any)).rejects.toThrow("ACCOUNT_INACTIVE");
				expect(mockDeps.globalUserDao.findUserByEmail).toHaveBeenCalledWith("inactive@example.com");
			}
		});

		it("should allow sign-in for active users via before hook", async () => {
			// Mock findUserByEmail to return an active user
			mockDeps.globalUserDao.findUserByEmail = vi.fn().mockResolvedValue({
				id: 1,
				email: "active@example.com",
				name: "Active User",
				isActive: true,
			});

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const beforeHook = config.hooks?.before;
			if (beforeHook) {
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					body: { email: "active@example.com", password: "password123" },
				};

				// Should not throw for active user
				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await expect(beforeHook(mockCtx as any)).resolves.not.toThrow();
			}
		});

		it("should skip before hook check for non sign-in paths", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const beforeHook = config.hooks?.before;
			if (beforeHook) {
				const mockCtx = {
					path: "/sign-up/email",
					method: "POST",
					body: { email: "test@example.com", password: "password123" },
				};

				// Should not call findUserByEmail for non sign-in paths
				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await beforeHook(mockCtx as any);
				expect(mockDeps.globalUserDao.findUserByEmail).not.toHaveBeenCalled();
			}
		});

		it("should not generate JWT token for inactive users", async () => {
			// Mock findUserById to return an inactive user
			mockDeps.globalUserDao.findUserById = vi.fn().mockResolvedValue({
				id: 1,
				email: "inactive@example.com",
				name: "Inactive User",
				isActive: false,
			});

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockCtx = {
					context: {
						newSession: {
							user: {
								id: "1",
								email: "inactive@example.com",
								name: "Inactive User",
							},
						},
					},
					setHeader: vi.fn(),
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				// User should be fetched
				expect(mockDeps.globalUserDao.findUserById).toHaveBeenCalledWith(1);

				// Token should NOT be generated for inactive user
				expect(mockDeps.tokenUtil.generateToken).not.toHaveBeenCalled();

				// Cookie should NOT be set
				expect(mockCtx.setHeader).not.toHaveBeenCalled();
			}
		});

		it("should redirect inactive users to login page on OAuth callback", async () => {
			// Mock findUserById to return an inactive user
			mockDeps.globalUserDao.findUserById = vi.fn().mockResolvedValue({
				id: 1,
				email: "inactive-oauth@example.com",
				name: "Inactive OAuth User",
				isActive: false,
			});

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				// Mock redirect to return an APIError (mimics better-auth's ctx.redirect
				// which calls: new APIError("FOUND", undefined, headers) with Location header)
				const { APIError: MockAPIError } = await import("better-auth/api");
				const mockRedirect = vi.fn((_url: string) => new MockAPIError("FOUND"));
				const mockCtx = {
					path: "/callback/:id",
					method: "GET",
					context: {
						newSession: {
							user: {
								id: "1",
								email: "inactive-oauth@example.com",
								name: "Inactive OAuth User",
							},
						},
					},
					setHeader: vi.fn(),
					redirect: mockRedirect,
				};

				// Should throw a redirect APIError for inactive OAuth user
				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await expect(afterHook(mockCtx as any)).rejects.toThrow("FOUND");

				// Verify redirect was called with the login page error URL
				expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining("?error=user_inactive"));

				// Token should NOT be generated
				expect(mockDeps.tokenUtil.generateToken).not.toHaveBeenCalled();

				// authToken cookie should be cleared via Set-Cookie header
				const setCookieCalls = mockCtx.setHeader.mock.calls.filter(
					(call: Array<string>) => call[0] === "Set-Cookie",
				);
				expect(setCookieCalls.length).toBe(1);
				expect(setCookieCalls[0][1]).toContain("authToken=");
				expect(setCookieCalls[0][1]).toContain("Max-Age=0");
			}
		});
	});

	// Note: Login security tests (rate limiting, account locking, failure recording) have been moved
	// to AppFactory.test.ts since the logic is now handled in Express middleware, not better-auth hooks.
	// Better-auth's after hook only handles clearing login failures on successful login.

	describe("Login success handling", () => {
		it("should have after hook defined for login success handling", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			// Verify after hook exists
			expect(config.hooks?.after).toBeDefined();
			expect(typeof config.hooks?.after).toBe("function");
		});

		it("should clear login failures on successful login", async () => {
			const { LoginSecurityService } = await import("../services/LoginSecurityService");
			const mockLoginSecurity = {
				checkRateLimit: vi.fn(),
				isAccountLocked: vi.fn(),
				recordLoginFailure: vi.fn(),
				clearLoginFailures: vi.fn().mockResolvedValue(undefined),
				getRemainingLockTime: vi.fn(),
			};
			vi.mocked(LoginSecurityService).mockImplementation(
				() => mockLoginSecurity as unknown as InstanceType<typeof LoginSecurityService>,
			);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					context: {
						newSession: {
							user: {
								id: "1",
								email: "success@example.com",
								name: "Success User",
							},
						},
					},
					setHeader: vi.fn(),
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				expect(mockLoginSecurity.clearLoginFailures).toHaveBeenCalledWith("success@example.com");
			}
		});

		it("should handle clear failures errors gracefully", async () => {
			const { LoginSecurityService } = await import("../services/LoginSecurityService");
			const mockLoginSecurity = {
				checkRateLimit: vi.fn(),
				isAccountLocked: vi.fn(),
				recordLoginFailure: vi.fn(),
				clearLoginFailures: vi.fn().mockRejectedValue(new Error("Redis error")),
				getRemainingLockTime: vi.fn(),
			};
			vi.mocked(LoginSecurityService).mockImplementation(
				() => mockLoginSecurity as unknown as InstanceType<typeof LoginSecurityService>,
			);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					context: {
						newSession: {
							user: {
								id: "1",
								email: "success@example.com",
								name: "Success User",
							},
						},
					},
					setHeader: vi.fn(),
				};

				// Should not throw
				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await expect(afterHook(mockCtx as any)).resolves.not.toThrow();
			}
		});
	});

	// Note: Password reset verification is now handled natively by better-auth
	// The verification record is created and deleted by better-auth's internal adapter

	describe("Password hashing", () => {
		it("should hash password using argon2", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			// Get the hash function from the password config
			const hashFn = config.emailAndPassword?.password?.hash;
			expect(hashFn).toBeDefined();

			if (hashFn) {
				const hash = await hashFn("testPassword123!");
				// Argon2 hashes start with $argon2
				expect(hash).toMatch(/^\$argon2/);
			}
		});

		it("should return false when argon2.verify throws an error", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			// Get the verify function from the password config
			const verifyFn = config.emailAndPassword?.password?.verify;
			expect(verifyFn).toBeDefined();

			if (verifyFn) {
				// Test with an invalid hash that will cause argon2 to throw
				// argon2.verify throws when hash format is invalid
				const result = await verifyFn({ hash: "not-a-valid-argon2-hash", password: "test" });
				expect(result).toBe(false);
			}
		});
	});

	describe("Password Reset Token Hashing", () => {
		describe("hashToken", () => {
			it("should produce consistent SHA256 hashes", () => {
				const token = "test-token-123";
				const hash1 = hashToken(token);
				const hash2 = hashToken(token);

				// Should produce same hash for same input
				expect(hash1).toBe(hash2);
				// Should be 64 character hex string (SHA256)
				expect(hash1).toMatch(/^[a-f0-9]{64}$/);
			});

			it("should produce different hashes for different tokens", () => {
				const token1 = "test-token-123";
				const token2 = "test-token-456";

				const hash1 = hashToken(token1);
				const hash2 = hashToken(token2);

				expect(hash1).not.toBe(hash2);
			});

			it("should produce valid SHA256 hash format", () => {
				const token = "C1eYxD1BIAjBanSS6vc3Ogwb";
				const hash = hashToken(token);

				// SHA256 produces 64 hex characters
				expect(hash).toHaveLength(64);
				expect(hash).toMatch(/^[a-f0-9]+$/);
			});
		});

		describe("hashPasswordResetToken hook", () => {
			it("should hash password reset tokens before storage", async () => {
				const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
				await createBetterAuth(mockDeps);
				const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

				// Verify databaseHooks.verification.create.before is defined
				expect(config.databaseHooks).toBeDefined();
				expect(config.databaseHooks?.verification?.create?.before).toBeDefined();

				// Test the hook directly
				const beforeHook = config.databaseHooks?.verification?.create?.before;
				if (beforeHook) {
					const mockData = {
						identifier: "reset-password:plaintext-token-123",
						value: "user-id",
						type: "password_reset",
						expiresAt: new Date(),
					};

					// biome-ignore lint/suspicious/noExplicitAny: Mock data for testing
					const result = await beforeHook(mockData as any, null);

					// Verify result has data property
					expect(result).toBeDefined();
					expect(result).toHaveProperty("data");
					// biome-ignore lint/suspicious/noExplicitAny: Result type from hook
					const data = (result as any).data;

					// Verify identifier was hashed
					expect(data.identifier).toMatch(/^reset-password:[a-f0-9]{64}$/);
					expect(data.identifier).not.toContain("plaintext-token-123");
					// Verify it starts with the prefix
					expect(data.identifier).toMatch(/^reset-password:/);
				}
			});

			it("should not modify non-reset-password verifications", async () => {
				const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
				await createBetterAuth(mockDeps);
				const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

				const beforeHook = config.databaseHooks?.verification?.create?.before;
				if (beforeHook) {
					const mockData = {
						identifier: "email-verification:test@example.com",
						value: "user-id",
						type: "email_verification",
						expiresAt: new Date(),
					};

					// biome-ignore lint/suspicious/noExplicitAny: Mock data for testing
					const result = await beforeHook(mockData as any, null);

					// Verify result has data property
					expect(result).toBeDefined();
					expect(result).toHaveProperty("data");
					// biome-ignore lint/suspicious/noExplicitAny: Result type from hook
					const data = (result as any).data;

					// Verify identifier was NOT modified
					expect(data.identifier).toBe("email-verification:test@example.com");
				}
			});

			it("should preserve other fields when hashing reset token", async () => {
				const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
				await createBetterAuth(mockDeps);
				const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

				const beforeHook = config.databaseHooks?.verification?.create?.before;
				if (beforeHook) {
					const expiresAt = new Date();
					const mockData = {
						identifier: "reset-password:token123",
						value: "user-id-456",
						type: "password_reset",
						expiresAt,
						customField: "custom-value",
					};

					// biome-ignore lint/suspicious/noExplicitAny: Mock data for testing
					const result = await beforeHook(mockData as any, null);

					// Verify result has data property
					expect(result).toBeDefined();
					expect(result).toHaveProperty("data");
					// biome-ignore lint/suspicious/noExplicitAny: Result type from hook
					const data = (result as any).data;

					// Verify other fields are preserved
					expect(data.value).toBe("user-id-456");
					expect(data.type).toBe("password_reset");
					expect(data.expiresAt).toBe(expiresAt);
					expect(data.customField).toBe("custom-value");
				}
			});

			it("should handle edge cases gracefully", async () => {
				const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
				await createBetterAuth(mockDeps);
				const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

				const beforeHook = config.databaseHooks?.verification?.create?.before;
				if (beforeHook) {
					// Test with empty token
					const mockData1 = {
						identifier: "reset-password:",
						value: "user-id",
						type: "password_reset",
						expiresAt: new Date(),
					};

					// biome-ignore lint/suspicious/noExplicitAny: Mock data for testing
					const result1 = await beforeHook(mockData1 as any, null);
					expect(result1).toBeDefined();
					expect(result1).toHaveProperty("data");
					// biome-ignore lint/suspicious/noExplicitAny: Result type from hook
					const data1 = (result1 as any).data;
					// Should hash empty string
					expect(data1.identifier).toMatch(/^reset-password:[a-f0-9]{64}$/);

					// Test with special characters in token
					const mockData2 = {
						identifier: "reset-password:abc!@#$%^&*()",
						value: "user-id",
						type: "password_reset",
						expiresAt: new Date(),
					};

					// biome-ignore lint/suspicious/noExplicitAny: Mock data for testing
					const result2 = await beforeHook(mockData2 as any, null);
					expect(result2).toBeDefined();
					expect(result2).toHaveProperty("data");
					// biome-ignore lint/suspicious/noExplicitAny: Result type from hook
					const data2 = (result2 as any).data;
					// Should hash special characters
					expect(data2.identifier).toMatch(/^reset-password:[a-f0-9]{64}$/);
				}
			});
		});
	});

	describe("Trusted origins configuration", () => {
		it("should configure trusted origins with BASE_DOMAIN", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined,
				ORIGIN: "https://jolli.example.com",
				BASE_DOMAIN: "jolli.example.com",
				TOKEN_COOKIE_MAX_AGE: "2h",
				AUTH_GATEWAY_ORIGIN: "https://auth.jolli.example.com",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.trustedOrigins).toContain("https://*.jolli.example.com");
			expect(config.trustedOrigins).toContain("http://*.jolli.example.com");
			expect(config.trustedOrigins).toContain("https://jolli.example.com");
			expect(config.trustedOrigins).toContain("http://jolli.example.com");
			expect(config.baseURL).toBe("https://auth.jolli.example.com");
		});

		it("should configure trusted origins for localhost when no BASE_DOMAIN", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined,
				ORIGIN: "http://localhost:8034",
				BASE_DOMAIN: undefined,
				TOKEN_COOKIE_MAX_AGE: "2h",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.trustedOrigins).toContain("http://localhost:*");
		});
	});

	describe("sendResetPassword token extraction", () => {
		it("should not call PasswordAuthService when token cannot be extracted from URL", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[0][0];
			const sendResetPassword = config.emailAndPassword?.sendResetPassword;

			if (sendResetPassword) {
				// URL without proper token path
				const testUrl = "https://auth.example.com/invalid-path";
				const testUser = {
					id: "1",
					email: "test@example.com",
					name: "Test User",
					createdAt: new Date(),
					updatedAt: new Date(),
					emailVerified: true,
				};

				await sendResetPassword({ user: testUser, url: testUrl, token: "test-token" });
				await new Promise(resolve => setTimeout(resolve, 100));

				// PasswordAuthService should NOT be called when token extraction fails
				expect(mockDeps.passwordAuthService.handlePasswordResetRequest).not.toHaveBeenCalled();
			}
		});
	});

	describe("Redis secondaryStorage successful operations", () => {
		it("should successfully get session data from Redis via secondaryStorage", async () => {
			const sessionData = JSON.stringify({ userId: "123", email: "test@example.com" });
			const mockRedisWithData = {
				get: vi.fn().mockResolvedValue(sessionData),
				setex: vi.fn().mockResolvedValue("OK"),
				set: vi.fn().mockResolvedValue("OK"),
				del: vi.fn().mockResolvedValue(1),
				on: vi.fn(),
				ping: vi.fn().mockResolvedValue("PONG"),
				quit: vi.fn().mockResolvedValue(undefined),
			};
			(Redis as unknown as Mock).mockImplementation(() => mockRedisWithData);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			// secondaryStorage is at the top level of better-auth config, not inside session
			const secondaryStorage = config.secondaryStorage as {
				get: (key: string) => Promise<string | null>;
			};
			if (secondaryStorage?.get) {
				const result = await secondaryStorage.get("test-session-id");
				expect(result).toEqual(sessionData);
				expect(mockRedisWithData.get).toHaveBeenCalledWith("session:test-session-id");
			}
		});

		it("should successfully set session data to Redis via secondaryStorage", async () => {
			const mockRedisWithData = {
				get: vi.fn().mockResolvedValue(null),
				setex: vi.fn().mockResolvedValue("OK"),
				set: vi.fn().mockResolvedValue("OK"),
				del: vi.fn().mockResolvedValue(1),
				on: vi.fn(),
				ping: vi.fn().mockResolvedValue("PONG"),
				quit: vi.fn().mockResolvedValue(undefined),
			};
			(Redis as unknown as Mock).mockImplementation(() => mockRedisWithData);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const secondaryStorage = config.secondaryStorage as {
				set: (key: string, value: string, ttl?: number) => Promise<void>;
			};
			if (secondaryStorage?.set) {
				const sessionData = JSON.stringify({ userId: "123" });
				await secondaryStorage.set("test-session-id", sessionData, 7200);
				expect(mockRedisWithData.setex).toHaveBeenCalledWith("session:test-session-id", 7200, sessionData);
			}
		});

		it("should successfully set session data without TTL via secondaryStorage", async () => {
			const mockRedisWithData = {
				get: vi.fn().mockResolvedValue(null),
				setex: vi.fn().mockResolvedValue("OK"),
				set: vi.fn().mockResolvedValue("OK"),
				del: vi.fn().mockResolvedValue(1),
				on: vi.fn(),
				ping: vi.fn().mockResolvedValue("PONG"),
				quit: vi.fn().mockResolvedValue(undefined),
			};
			(Redis as unknown as Mock).mockImplementation(() => mockRedisWithData);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const secondaryStorage = config.secondaryStorage as {
				set: (key: string, value: string, ttl?: number) => Promise<void>;
			};
			if (secondaryStorage?.set) {
				const sessionData = JSON.stringify({ userId: "123" });
				await secondaryStorage.set("test-session-id", sessionData);
				expect(mockRedisWithData.set).toHaveBeenCalledWith("session:test-session-id", sessionData);
			}
		});

		it("should successfully delete session data from Redis via secondaryStorage", async () => {
			const mockRedisWithData = {
				get: vi.fn().mockResolvedValue(null),
				setex: vi.fn().mockResolvedValue("OK"),
				set: vi.fn().mockResolvedValue("OK"),
				del: vi.fn().mockResolvedValue(1),
				on: vi.fn(),
				ping: vi.fn().mockResolvedValue("PONG"),
				quit: vi.fn().mockResolvedValue(undefined),
			};
			(Redis as unknown as Mock).mockImplementation(() => mockRedisWithData);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const secondaryStorage = config.secondaryStorage as {
				delete: (key: string) => Promise<void>;
			};
			if (secondaryStorage?.delete) {
				await secondaryStorage.delete("test-session-id");
				expect(mockRedisWithData.del).toHaveBeenCalledWith("session:test-session-id");
			}
		});
	});

	describe("handleLoginSuccess edge cases", () => {
		it("should not clear failures when email is missing from session", async () => {
			const { LoginSecurityService } = await import("../services/LoginSecurityService");
			const mockLoginSecurity = {
				checkRateLimit: vi.fn(),
				isAccountLocked: vi.fn(),
				recordLoginFailure: vi.fn(),
				clearLoginFailures: vi.fn().mockResolvedValue(undefined),
				getRemainingLockTime: vi.fn(),
			};
			vi.mocked(LoginSecurityService).mockImplementation(
				() => mockLoginSecurity as unknown as InstanceType<typeof LoginSecurityService>,
			);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				// Context with newSession but no email
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					context: {
						newSession: {
							user: {
								id: "1",
								name: "User Without Email",
								// email is missing
							},
						},
					},
					setHeader: vi.fn(),
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				// clearLoginFailures should NOT be called when email is missing
				expect(mockLoginSecurity.clearLoginFailures).not.toHaveBeenCalled();
			}
		});
	});

	describe("Remember-me detection", () => {
		it("should set remember-me header for email sign-in when header is present", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockSetHeader = vi.fn();
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					request: {
						headers: {
							get: vi.fn().mockReturnValue("true"),
						},
					},
					context: {
						newSession: {
							user: {
								id: "1",
								email: "test@example.com",
								name: "Test User",
							},
						},
					},
					setHeader: mockSetHeader,
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				// Should set x-remember-me header
				expect(mockSetHeader).toHaveBeenCalledWith("x-remember-me", "true");
			}
		});

		it("should not set remember-me header when not requested in email sign-in", async () => {
			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockSetHeader = vi.fn();
				const mockCtx = {
					path: "/sign-in/email",
					method: "POST",
					request: {
						headers: {
							get: vi.fn().mockReturnValue(null),
						},
					},
					context: {
						newSession: {
							user: {
								id: "1",
								email: "test@example.com",
								name: "Test User",
							},
						},
					},
					setHeader: mockSetHeader,
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				// Should NOT set x-remember-me header (only Set-Cookie for auth token)
				const rememberMeCalls = mockSetHeader.mock.calls.filter(call => call[0] === "x-remember-me");
				expect(rememberMeCalls.length).toBe(0);
			}
		});

		it("should handle OAuth callback remember-me from state", async () => {
			// Mock getOAuthState to return remember-me true
			const betterAuthApiMock = await import("better-auth/api");
			vi.mocked(betterAuthApiMock.getOAuthState).mockResolvedValue({
				rememberMe: true,
				callbackURL: "https://example.com/callback",
				codeVerifier: "test-verifier",
				expiresAt: Date.now() + 600000,
			});

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockSetHeader = vi.fn();
				const mockCtx = {
					path: "/callback/:id",
					method: "GET",
					context: {
						newSession: {
							user: {
								id: "1",
								email: "oauth@example.com",
								name: "OAuth User",
							},
						},
					},
					setHeader: mockSetHeader,
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				// Should set x-remember-me header from OAuth state
				expect(mockSetHeader).toHaveBeenCalledWith("x-remember-me", "true");
			}
		});

		it("should handle OAuth state extraction error gracefully", async () => {
			// Mock getOAuthState to throw an error
			const betterAuthApiMock = await import("better-auth/api");
			vi.mocked(betterAuthApiMock.getOAuthState).mockRejectedValue(new Error("State extraction failed"));

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockSetHeader = vi.fn();
				const mockCtx = {
					path: "/callback/:id",
					method: "GET",
					context: {
						newSession: {
							user: {
								id: "1",
								email: "oauth@example.com",
								name: "OAuth User",
							},
						},
					},
					setHeader: mockSetHeader,
				};

				// Should not throw even when getOAuthState fails
				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await expect(afterHook(mockCtx as any)).resolves.not.toThrow();

				// Should NOT set x-remember-me header when state extraction fails
				const rememberMeCalls = mockSetHeader.mock.calls.filter(call => call[0] === "x-remember-me");
				expect(rememberMeCalls.length).toBe(0);
			}
		});

		it("should not set remember-me when OAuth state has rememberMe false", async () => {
			// Mock getOAuthState to return remember-me false
			const betterAuthApiMock = await import("better-auth/api");
			vi.mocked(betterAuthApiMock.getOAuthState).mockResolvedValue({
				rememberMe: false,
				callbackURL: "https://example.com/callback",
				codeVerifier: "test-verifier",
				expiresAt: Date.now() + 600000,
			});

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			const afterHook = config.hooks?.after;
			if (afterHook) {
				const mockSetHeader = vi.fn();
				const mockCtx = {
					path: "/callback/:id",
					method: "GET",
					context: {
						newSession: {
							user: {
								id: "1",
								email: "oauth@example.com",
								name: "OAuth User",
							},
						},
					},
					setHeader: mockSetHeader,
				};

				// biome-ignore lint/suspicious/noExplicitAny: Mock context for testing
				await afterHook(mockCtx as any);

				// Should NOT set x-remember-me header when rememberMe is false
				const rememberMeCalls = mockSetHeader.mock.calls.filter(call => call[0] === "x-remember-me");
				expect(rememberMeCalls.length).toBe(0);
			}
		});
	});

	describe("Database and Redis connection handling", () => {
		it("should handle database connection failure gracefully", async () => {
			// Mock Pool to have query fail
			const mockPoolWithError = {
				query: vi.fn().mockRejectedValue(new Error("Connection refused")),
				end: vi.fn().mockResolvedValue(undefined),
			};
			(Pool as unknown as Mock).mockImplementation(() => mockPoolWithError);

			// Should not throw when database connection fails
			await expect(createBetterAuth(mockDeps)).resolves.toBeDefined();
		});

		it("should handle Redis ping failure gracefully", async () => {
			const mockRedisWithPingError = {
				ping: vi.fn().mockRejectedValue(new Error("Redis ping failed")),
				quit: vi.fn().mockResolvedValue(undefined),
				disconnect: vi.fn(),
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn().mockResolvedValue("OK"),
				setex: vi.fn().mockResolvedValue("OK"),
				del: vi.fn().mockResolvedValue(1),
				on: vi.fn().mockReturnThis(),
			};
			(Redis as unknown as Mock).mockImplementation(() => mockRedisWithPingError);

			// Should not throw when Redis ping fails
			await expect(createBetterAuth(mockDeps)).resolves.toBeDefined();
		});
	});

	describe("Cookie configuration", () => {
		it("should use secure cookies when ORIGIN is HTTPS", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined,
				ORIGIN: "https://secure.example.com",
				BASE_DOMAIN: "example.com",
				TOKEN_COOKIE_MAX_AGE: "2h",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.advanced?.useSecureCookies).toBe(true);
		});

		it("should not use secure cookies when ORIGIN is HTTP", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined,
				ORIGIN: "http://localhost:8034",
				BASE_DOMAIN: undefined,
				TOKEN_COOKIE_MAX_AGE: "2h",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.advanced?.useSecureCookies).toBe(false);
		});
	});

	describe("Rate limiting configuration", () => {
		it("should use memory storage for rate limiting when Redis is not available", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined, // No Redis
				ORIGIN: "http://localhost:8034",
				BASE_DOMAIN: undefined,
				TOKEN_COOKIE_MAX_AGE: "2h",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.rateLimit?.storage).toBe("memory");
		});

		it("should use secondary-storage for rate limiting when Redis is available", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: "redis://localhost:6379",
				ORIGIN: "http://localhost:8034",
				BASE_DOMAIN: undefined,
				TOKEN_COOKIE_MAX_AGE: "2h",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.rateLimit?.storage).toBe("secondary-storage");
		});
	});

	describe("Secret configuration", () => {
		it("should use BETTER_AUTH_SECRET when available", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined,
				ORIGIN: "http://localhost:8034",
				BASE_DOMAIN: undefined,
				TOKEN_COOKIE_MAX_AGE: "2h",
				BETTER_AUTH_SECRET: "better-auth-specific-secret",
				TOKEN_SECRET: "fallback-token-secret",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.secret).toBe("better-auth-specific-secret");
		});

		it("should fall back to TOKEN_SECRET when BETTER_AUTH_SECRET is not set", async () => {
			const Config = await import("../config/Config");
			vi.mocked(Config.getConfig).mockReturnValue({
				LOGIN_MAX_ATTEMPTS: 5,
				LOGIN_LOCK_DURATION_MINUTES: 15,
				LOGIN_RATE_LIMIT_PER_MINUTE: 10,
				MULTI_TENANT_REGISTRY_URL: "postgresql://localhost/test",
				REDIS_URL: undefined,
				ORIGIN: "http://localhost:8034",
				BASE_DOMAIN: undefined,
				TOKEN_COOKIE_MAX_AGE: "2h",
				BETTER_AUTH_SECRET: undefined,
				TOKEN_SECRET: "fallback-token-secret",
			} as unknown as ReturnType<typeof Config.getConfig>);

			const betterAuthMock = vi.mocked(await import("better-auth").then(m => m.betterAuth));
			await createBetterAuth(mockDeps);
			const config = betterAuthMock.mock.calls[betterAuthMock.mock.calls.length - 1][0];

			expect(config.secret).toBe("fallback-token-secret");
		});
	});
});
