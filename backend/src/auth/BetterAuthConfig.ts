import { getConfig } from "../config/Config";
import type { ManagerDatabase } from "../core/ManagerDatabase";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import type { VerificationDao } from "../dao/VerificationDao";
import { LoginSecurityService } from "../services/LoginSecurityService";
import type { PasswordAuthService } from "../services/PasswordAuthService";
import { buildAuthCookieValue, buildClearAuthCookieValue, resolveCookieDomain } from "../util/Cookies";
import { getLog } from "../util/Logger";
import { connectRedis, type RedisClientType } from "../util/RedisClient";
import type { TokenUtil } from "../util/TokenUtil";
import { generatePendingEmailAuthCode } from "./AuthCodeService";
import { fetchGitHubEmails, getVerifiedEmails, selectPrimaryEmail } from "./GitHubEmailService";
import { createHash } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import type { UserInfo } from "jolli-common";
import ms from "ms";
import { Pool } from "pg";

const log = getLog(import.meta);

/** Header name for remember-me signal between better-auth hooks and Express */
const REMEMBER_ME_HEADER = "x-remember-me";

/**
 * Temporary storage for pending email selections (GitHub OAuth with multiple verified emails)
 * Key: userId, Value: email selection data
 * This bridges databaseHooks.account.create.after and hooks.after
 */
/**
 * Argon2id options for password hashing
 * These settings provide a good balance between security and performance
 * Algorithm values: 0 = Argon2d, 1 = Argon2i, 2 = Argon2id
 */
const argon2Options = {
	algorithm: 2 as const, // Argon2id
	memoryCost: 1 << 16, // 65536 KiB = 64 MiB (2^16 KiB)
	timeCost: 3,
	parallelism: 4,
	outputLen: 32,
};

/**
 * Type for verification data in database hooks
 */
interface VerificationHookData {
	identifier: string;
	value?: string;
	type?: string;
	expiresAt?: Date;
	[key: string]: unknown;
}

/**
 * Hash a token using SHA256 for secure storage
 */
function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/**
 * Database hook to hash password reset tokens before storage
 * This prevents plaintext tokens from being stored in the database
 */
function hashPasswordResetToken(data: VerificationHookData): Promise<{ data: VerificationHookData }> {
	// Only hash password reset tokens
	if (data.identifier?.startsWith("reset-password:")) {
		const plainToken = data.identifier.replace("reset-password:", "");
		const hashedToken = hashToken(plainToken);

		log.info(
			{ originalIdentifier: data.identifier },
			"Hashing password reset token before storage (security enhancement)",
		);

		return Promise.resolve({
			data: {
				...data,
				identifier: `reset-password:${hashedToken}`,
			},
		});
	}

	// Return unchanged for other verification types
	return Promise.resolve({ data });
}

export type BetterAuthInstance = ReturnType<typeof betterAuth>;

export interface BetterAuthDeps {
	tokenUtil: TokenUtil<UserInfo>;
	globalUserDao: GlobalUserDao;
	verificationDao: VerificationDao;
	passwordAuthService: PasswordAuthService;
	managerDb: ManagerDatabase;
}

// Type for better-auth middleware context
interface AuthContext {
	path: string;
	method: string;
	request?: Request;
	context: {
		returned?: { error?: unknown };
		session?: { user?: { email?: string } };
		newSession?: { user?: { id: string; email?: string; image?: unknown } };
	};
	setHeader: (name: string, value: string) => void;
	/** Creates a 302 redirect APIError —throw the result to redirect the browser */
	redirect: (url: string) => APIError;
}

/** Result of JWT token generation attempt */
interface TokenGenerationResult {
	/** The Set-Cookie header value for the JWT token */
	cookie?: string;
	/** True if token generation was blocked because the user is inactive */
	inactive?: boolean;
}

/**
 * Handle login success - clear failure records
 */
async function handleLoginSuccess(ctx: AuthContext): Promise<void> {
	const email = ctx.context.newSession?.user?.email;
	if (!email) {
		return;
	}

	try {
		const loginSecurityService = new LoginSecurityService();
		await loginSecurityService.clearLoginFailures(email);
		log.debug({ email }, "Login successful, failures cleared");
	} catch (error) {
		log.error(error, "Failed to clear login failures");
	}
}

/**
 * Handle JWT token generation after successful authentication.
 * Returns a result indicating success (with cookie), inactive user, or no-op.
 */
async function handleAuthTokenGeneration(
	ctx: AuthContext,
	globalUserDao: GlobalUserDao,
	tokenUtil: TokenUtil<UserInfo>,
	appConfig: ReturnType<typeof getConfig>,
): Promise<TokenGenerationResult> {
	const newSession = ctx.context.newSession;
	if (!newSession?.user) {
		return {};
	}

	const userId = Number.parseInt(newSession.user.id);
	const user = await globalUserDao.findUserById(userId);

	if (!user) {
		return {};
	}

	// Block JWT generation for inactive users
	if (!user.isActive) {
		log.warn({ email: user.email, userId }, "Token generation blocked: user is inactive");
		return { inactive: true };
	}

	const userInfo: UserInfo = {
		userId: user.id,
		email: user.email,
		name: user.name,
		picture: newSession.user.image as string | undefined,
	};

	const jwtToken = tokenUtil.generateToken(userInfo);
	const maxAge = ms(appConfig.TOKEN_COOKIE_MAX_AGE);
	const isSecure = appConfig.ORIGIN.startsWith("https://");
	const cookieDomain = resolveCookieDomain();
	const cookieValue = buildAuthCookieValue(jwtToken, cookieDomain, maxAge, isSecure);

	log.debug({ email: user.email }, "JWT token generated");
	return { cookie: cookieValue };
}

/**
 * Create and configure better-auth instance
 * Uses Manager DB (MULTI_TENANT_REGISTRY_URL) for centralized authentication
 * Maps to existing global_users and global_auths tables
 */
export async function createBetterAuth(deps: BetterAuthDeps): Promise<BetterAuthInstance> {
	const { tokenUtil, globalUserDao, passwordAuthService, managerDb } = deps;
	const config = getConfig();

	// Connect to Manager DB (registry database)
	const pool = new Pool({
		connectionString: config.MULTI_TENANT_REGISTRY_URL,
	});

	// Test database connection
	pool.query("SELECT 1")
		.then(() => log.info("Better-auth: Database connection successful"))
		.catch(err => log.error({ err: err.message }, "Better-auth: Database connection failed"));

	// Setup Redis for session storage if available
	// Note: Redis is used as a secondary storage layer for better-auth sessions
	// When configured, sessions are stored in both database AND Redis for performance
	let redisClient: RedisClientType | undefined;
	if (config.REDIS_URL) {
		try {
			redisClient = await connectRedis(config.REDIS_URL, { name: "auth" });
			log.info("Auth Redis: Connection verified");
		} catch (error) {
			log.warn(error, "Failed to create Redis client for better-auth, using memory");
			redisClient = undefined;
		}
	}

	// Determine base URL and trusted origins
	// Better-auth needs a full URL (protocol://host:port)
	const baseDomain = config.BASE_DOMAIN;
	// Use AUTH_GATEWAY_ORIGIN if set, otherwise fall back to ORIGIN
	// Should be like "https://auth.jolli-local.me" or "http://localhost:8034"
	const baseURL = config.AUTH_GATEWAY_ORIGIN ?? config.ORIGIN;
	// Include both wildcard subdomains and bare domain to allow auth from all domains
	const trustedOrigins = baseDomain
		? [`https://*.${baseDomain}`, `http://*.${baseDomain}`, `https://${baseDomain}`, `http://${baseDomain}`]
		: ["http://localhost:*"];

	// Use BETTER_AUTH_SECRET if set, otherwise fall back to TOKEN_SECRET
	const secret = config.BETTER_AUTH_SECRET ?? config.TOKEN_SECRET;
	// Resolve cookie domain for cross-subdomain sharing (e.g., ".jolli.ai")
	const cookieDomain = resolveCookieDomain();

	return betterAuth({
		// Secret for signing session tokens (required for production security)
		secret,

		// basePath must be "/auth" because BetterAuthRouter passes req.originalUrl (full path)
		// Express mounts BetterAuthRouter at /auth
		// BetterAuthRouter uses req.originalUrl which includes the /auth prefix
		// OAuth callback format: /auth/callback/:provider
		basePath: "/auth",

		database: pool,

		// Rate limiting configuration
		// Uses Redis (secondary-storage) when available for distributed rate limiting
		// Falls back to memory storage if Redis is not configured
		rateLimit: {
			enabled: true,
			window: 60, // 60 second window
			max: 100, // 100 requests per window (general limit)
			storage: redisClient ? "secondary-storage" : "memory",
			// Custom rules for sensitive endpoints with stricter limits
			customRules: {
				"/sign-in/email": {
					window: 60,
					max: 20, // 5 login attempts per minute
				},
				"/sign-up/email": {
					window: 60,
					max: 30, // 3 sign-up attempts per minute
				},
				"/forgot-password": {
					window: 60,
					max: 10, // 3 password reset requests per minute
				},
				"/reset-password/*": {
					window: 60,
					max: 10, // 5 password reset attempts per minute
				},
				"/two-factor/*": {
					window: 60,
					max: 10, // 5 2FA attempts per minute
				},
				// Less restrictive for read-only session endpoints
				"/get-session": {
					window: 60,
					max: 300, // 60 session checks per minute
				},
			},
		},

		// Secondary storage for sessions (Redis) - used for high-performance session lookups
		// Sessions are stored in BOTH database AND Redis when this is configured
		// Keys are prefixed with "session:" for proper namespacing in Redis
		...(redisClient
			? {
					secondaryStorage: {
						get: async (key: string) => {
							try {
								const data = await redisClient.get(`session:${key}`);
								return data ?? null;
							} catch (error) {
								log.error(error, "Better-auth Redis get error");
								return null;
							}
						},
						set: async (key: string, value: string, ttl?: number) => {
							try {
								if (ttl) {
									await redisClient.setex(`session:${key}`, ttl, value);
								} else {
									await redisClient.set(`session:${key}`, value);
								}
							} catch (error) {
								log.error(error, "Better-auth Redis set error");
							}
						},
						delete: async (key: string) => {
							try {
								await redisClient.del(`session:${key}`);
							} catch (error) {
								log.error(error, "Better-auth Redis delete error");
							}
						},
					},
				}
			: {}),
		// Configure to use numeric auto-increment IDs (serial) instead of UUIDs
		advanced: {
			database: {
				generateId: "serial", // Use PostgreSQL serial/auto-increment for numeric IDs
			},
			// Enable cross-subdomain cookies for multi-tenant mode (e.g., ".jolli.ai")
			crossSubDomainCookies: {
				enabled: true,
				domain: cookieDomain || baseDomain || "localhost",
			},
			// Use secure cookies when served over HTTPS
			useSecureCookies: baseURL.startsWith("https://"),
			// Default cookie attributes for all better-auth cookies
			defaultCookieAttributes: {
				sameSite: "lax" as const,
			},
			// Custom cookie prefix - better-auth will create cookies like: JSID.session_token, JSID.session_data
			// Don't use individual cookie names - use cookiePrefix instead per GitHub issue #6435
			cookiePrefix: "JSID",
		},
		// Map better-auth tables and fields to our existing schema
		// Tables: global_users, global_auths (keeping original names)
		// Columns: snake_case (keeping original names, using field mapping)
		user: {
			modelName: "global_users",
			fields: {
				// Map better-auth fields (camelCase) to our columns (snake_case)
				emailVerified: "is_active", // Map emailVerified →is_active
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		account: {
			modelName: "global_auths",
			fields: {
				// Map better-auth fields to our columns
				userId: "user_id",
				accountId: "provider_id", // OAuth provider's user ID
				providerId: "provider", // OAuth provider name (google/github)
				accessToken: "access_token",
				refreshToken: "refresh_token",
				accessTokenExpiresAt: "token_expires_at",
				refreshTokenExpiresAt: "refresh_token_expires_at",
				scope: "scope",
				idToken: "id_token",
				password: "password_hash", // Map password →password_hash (existing column)
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		verification: {
			modelName: "verifications",
			fields: {
				// Map better-auth fields to our columns
				// Note: Only use identifier and value fields to ensure token stored in identifier
				// matches the token in the reset URL (fixes JOLLI-334 reset password link issue)
				identifier: "identifier",
				value: "value", // Stores userId for password reset
				expiresAt: "expires_at",
				createdAt: "created_at",
				updatedAt: "updated_at",
			},
		},
		// Session storage: Database + Cookie cache
		// Sessions are stored in the database 'sessions' table
		// Cookie cache is enabled for performance
		// Redis secondary storage is configured at the top level (secondaryStorage)
		session: {
			modelName: "sessions",
			// Session expiration: 2 hours (matches TOKEN_COOKIE_MAX_AGE)
			expiresIn: 60 * 60 * 2, // 2 hours in seconds
			// Update session expiry on each request (sliding window)
			updateAge: 60 * 15, // Update if session is older than 15 minutes
			// Enable cookie cache for performance (stores session data in encrypted cookie)
			cookieCache: {
				enabled: true,
				maxAge: 60 * 60 * 2, // 2 hours - matches session expiresIn
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false, // Disable email verification (no email sending configured)
			resetPasswordTokenExpiresIn: 3600, // 1 hour (in seconds)
			// Custom password hashing using argon2id
			password: {
				async hash(password: string) {
					return await hash(password, argon2Options);
				},
				async verify({ hash: hashValue, password }: { hash: string; password: string }) {
					try {
						return await verify(hashValue, password);
					} catch {
						return false;
					}
				},
			},
			passwordRules: {
				minLength: 8,
				maxLength: 36,
				requireUppercase: true,
				requireLowercase: true,
				requireNumbers: true,
				requireSpecialCharacters: true,
				blockCommonPasswords: true,
				blockEmailSubstring: true,
			},
			sendResetPassword({ user, url }) {
				// Fire-and-forget to prevent timing attacks
				// Return immediately to avoid timing side-channels
				void (async () => {
					try {
						// Extract token from URL
						// URL format: https://domain/auth/reset-password/{token}?callbackURL=...
						const tokenMatch = url.match(/\/reset-password\/([^?]+)/);
						const plainToken = tokenMatch ? tokenMatch[1] : "";

						if (!plainToken) {
							log.error("No reset token in URL");
							return;
						}

						// Hash the token (must match the databaseHooks hash)
						const hashedToken = hashToken(plainToken);

						// Delegate to PasswordAuthService with HASHED token
						// PasswordAuthService will send email with hashed token in URL
						await passwordAuthService.handlePasswordResetRequest(user, hashedToken);
					} catch (error) {
						log.error(error, "Failed to handle password reset request");
					}
				})();
				// Return immediately without waiting
				return Promise.resolve();
			},
		},
		// Database hooks for security enhancements
		databaseHooks: {
			verification: {
				create: {
					before: hashPasswordResetToken,
				},
			},
			// No account.create hook needed - we check emails in hooks.after for every login
		},
		// OAuth configuration
		// OAuth callback path format: /auth/callback/:provider (better-auth default)
		// Results in: /auth/callback/google, /auth/callback/github
		socialProviders: {
			google: {
				clientId: config.GOOGLE_CLIENT_ID || "",
				clientSecret: config.GOOGLE_CLIENT_SECRET || "",
				enabled: !!config.GOOGLE_CLIENT_ID,
				// prompt: "consent", // Disabled it per Luke's request
				request: {
					timeout: config.OAUTH_TOKEN_TIMEOUT_MS,
				},
			},
			github: {
				clientId: config.GITHUB_CLIENT_ID || "",
				clientSecret: config.GITHUB_CLIENT_SECRET || "",
				enabled: !!config.GITHUB_CLIENT_ID,
				request: {
					timeout: config.OAUTH_TOKEN_TIMEOUT_MS,
				},
			},
		},
		baseURL,
		trustedOrigins,
		// Disable email verification
		emailVerification: {
			sendOnSignUp: false,
			autoSignInAfterVerification: false,
		},
		// Hooks to generate JWT token after authentication
		// Note: Login security (rate limiting, account lockout, failure recording) is handled
		// in AppFactory.ts Express middleware, not here, because better-auth's after hook
		// doesn't run on authentication failures.
		hooks: {
			before: createAuthMiddleware(async ctx => {
				// Block sign-in for inactive users
				if (ctx.path === "/sign-in/email" && ctx.method === "POST") {
					const email = ctx.body?.email as string | undefined;
					if (email) {
						const user = await globalUserDao.findUserByEmail(email);
						if (user && !user.isActive) {
							log.warn({ email }, "Sign-in blocked: account inactive");
							throw new APIError("FORBIDDEN", { message: "ACCOUNT_INACTIVE" });
						}
					}
				}
			}),
			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Auth hooks require multiple conditional paths for OAuth and security
			after: createAuthMiddleware(async ctx => {
				const authCtx = ctx as unknown as AuthContext;

				// Handle successful login - clear failure records
				if (ctx.path === "/sign-in/email" && ctx.method === "POST") {
					await handleLoginSuccess(authCtx);
				}

				// Unified remember-me detection for all login methods
				let rememberMeRequested = false;
				// Note: better-auth uses parameterized route, so ctx.path is "/callback/:id" not "/callback/google"
				const isOAuthCallback = ctx.path === "/callback/:id" && ctx.method === "GET";
				const isEmailSignIn = ctx.path === "/sign-in/email" && ctx.method === "POST";

				if (isOAuthCallback) {
					// Log all OAuth callbacks for debugging
					const providerId = ctx.request?.url ? new URL(ctx.request.url).pathname.split("/").pop() : null;
					const userId = authCtx.context.newSession?.user?.id;
					log.info(
						{ providerId, userId, hasNewSession: !!authCtx.context.newSession },
						"OAuth callback detected in hooks.after",
					);

					// Check GitHub OAuth for multiple verified emails on FIRST login only
					if (providerId === "github" && userId) {
						try {
							// Use DAO to get GitHub auth info with creation time
							// IMPORTANT: Checks a.created_at (when GitHub was linked), not u.created_at (when user was created)
							// This handles cases where user exists but GitHub auth is new (e.g., user previously logged in via Google)
							const userIdNum = Number.parseInt(userId, 10);
							const authInfo = await managerDb.globalAuthDao.findGitHubAuthByUserId(userIdNum);

							if (authInfo) {
								const { accessToken, refreshToken, accountId, createdAt } = authInfo;
								const now = new Date();
								const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;

								// Check if this GitHub auth is NEW (created within last 10 seconds)
								// This indicates first-time GitHub login, not returning GitHub user
								const isNewUser = ageInSeconds < 10;

								log.info({ userId, ageInSeconds, isNewUser }, "GitHub OAuth user age check");

								// Only check for multiple emails on FIRST login (new users)
								if (isNewUser) {
									const allEmails = await fetchGitHubEmails(accessToken);
									const verifiedEmails = getVerifiedEmails(allEmails);

									log.info(
										{ emailCount: verifiedEmails.length, userId, isNewUser },
										"GitHub verified emails fetched for new user",
									);

									// If multiple verified emails exist, show email selection UI
									if (verifiedEmails.length > 1) {
										log.info(
											{ emailCount: verifiedEmails.length, userId },
											"Multiple GitHub verified emails detected for new user, redirecting to email selection",
										);

										// DO NOT delete the account - we'll update it after email selection

										// Generate encrypted auth code + set cookie for frontend redirect
										const primaryEmail = selectPrimaryEmail(verifiedEmails);
										const authCode = generatePendingEmailAuthCode(
											verifiedEmails.map(e => e.email),
											{ providerId: "github", accountId, accessToken, refreshToken },
											"github",
											"", // tenantSlug - will be extracted from request in POST /auth/select-email
											"", // returnTo - will be handled by frontend after selection
										);

										// Set custom header for AppFactory to set email_selection cookie
										// (better-auth's setHeader doesn't support cookies properly)
										const emailSelectionData = JSON.stringify({
											code: authCode,
											primary: primaryEmail,
										});
										authCtx.setHeader("x-email-selection", emailSelectionData);

										log.info({ emailSelectionData }, "Set email selection header for new user");
									} else {
										// Single verified email: continue normal flow
										log.debug(
											{ emailCount: verifiedEmails.length },
											"Single verified email for new user, continuing normal flow",
										);
									}
								} else {
									// Returning user: continue normal flow (use existing account)
									log.debug(
										{ userId, ageInSeconds },
										"Returning GitHub user, continuing normal flow with existing account",
									);
								}
							}
						} catch (error) {
							log.error(error, "Failed to check GitHub emails, continuing normal flow");
						}
					}

					// OAuth callback: extract from signed state (secure)
					try {
						const oauthState = await getOAuthState();
						rememberMeRequested = oauthState?.rememberMe === true;
						log.debug({ rememberMe: rememberMeRequested }, "OAuth remember-me check");
					} catch (stateError) {
						log.warn(stateError, "Failed to get OAuth state for remember-me");
					}
				} else if (isEmailSignIn) {
					// Email sign-in: check request header (passed from Express req.body)
					const reqHeader = authCtx.request?.headers?.get?.(REMEMBER_ME_HEADER);
					rememberMeRequested = reqHeader === "true";
					log.debug({ path: ctx.path, rememberMe: rememberMeRequested }, "Email sign-in remember-me check");
				}

				// Set unified header for AppFactory to read
				if (rememberMeRequested) {
					authCtx.setHeader(REMEMBER_ME_HEADER, "true");
				}

				// Handle JWT token generation for successful authentication
				// Note: Remember-me cookie is handled in AppFactory.ts using Express response
				// because better-auth's setHeader doesn't support multiple Set-Cookie headers
				const tokenResult = await handleAuthTokenGeneration(authCtx, globalUserDao, tokenUtil, config);
				if (tokenResult.inactive && isOAuthCallback) {
					// OAuth callback for inactive user: clear authToken cookie and redirect
					// to login with explicit error. Without this, the user would land on
					// the app with no JWT and no error message.
					const clearCookie = buildClearAuthCookieValue(
						resolveCookieDomain(),
						config.ORIGIN.startsWith("https://"),
					);
					authCtx.setHeader("Set-Cookie", clearCookie);
					log.warn("OAuth login blocked for inactive user, redirecting with error");
					throw authCtx.redirect(`${config.ORIGIN}/?error=user_inactive`);
				} else if (tokenResult.cookie) {
					authCtx.setHeader("Set-Cookie", tokenResult.cookie);
				}
			}),
		},
	});
}

// Export for testing
export { hashPasswordResetToken, hashToken };
