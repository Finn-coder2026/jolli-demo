import { env } from "../Config";
import { getLog } from "../util/Logger";
import { Redis } from "ioredis";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";

const log = getLog(import.meta.url);

/** Session payload stored in JWT and Redis */
export interface SessionPayload extends JWTPayload {
	userId: number;
	email: string;
	role: "super_admin" | "user";
}

/** Session data stored in Redis */
interface RedisSessionData {
	userId: number;
	email: string;
	role: "super_admin" | "user";
	createdAt: number;
	expiresAt: number;
}

/** Redis key prefix for Manager sessions */
const REDIS_KEY_PREFIX = "manager:session:";

/** Parse token expiry string (e.g., "7d", "24h") to milliseconds */
function parseExpiryToMs(expiry: string): number {
	const match = expiry.match(/^(\d+)([dhms])$/);
	if (!match) {
		return 7 * 24 * 60 * 60 * 1000; // Default: 7 days
	}

	const value = Number.parseInt(match[1], 10);
	const unit = match[2];

	switch (unit) {
		case "d":
			return value * 24 * 60 * 60 * 1000;
		case "h":
			return value * 60 * 60 * 1000;
		case "m":
			return value * 60 * 1000;
		case "s":
			return value * 1000;
		default:
			return 7 * 24 * 60 * 60 * 1000;
	}
}

/** In-memory session store (fallback when Redis is not configured) */
const inMemoryStore = new Map<string, RedisSessionData>();

export interface SessionService {
	/**
	 * Create a new session and return a JWT token.
	 */
	createSession(params: { userId: number; email: string; role: "super_admin" | "user" }): Promise<string>;

	/**
	 * Validate a JWT token and return the session payload if valid.
	 */
	validateSession(token: string): Promise<SessionPayload | null>;

	/**
	 * Destroy a session by invalidating it in Redis.
	 */
	destroySession(userId: number): Promise<void>;

	/**
	 * Check if authentication is configured.
	 */
	isAuthConfigured(): boolean;
}

/**
 * Create a SessionService instance.
 * Uses Redis if SESSION_REDIS_URL is configured, otherwise falls back to in-memory storage.
 */
export function createSessionService(): SessionService {
	let redis: Redis | null = null;

	if (env.SESSION_REDIS_URL) {
		redis = new Redis(env.SESSION_REDIS_URL);
		redis.on("error", (err: Error) => {
			log.error("Redis connection error: %s", err.message);
		});
	}

	const tokenSecret = env.TOKEN_SECRET;
	const tokenExpiresIn = env.TOKEN_EXPIRES_IN;
	const expiryMs = parseExpiryToMs(tokenExpiresIn);

	function isAuthConfigured(): boolean {
		return !!tokenSecret && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
	}

	async function createSession(params: {
		userId: number;
		email: string;
		role: "super_admin" | "user";
	}): Promise<string> {
		if (!tokenSecret) {
			throw new Error("TOKEN_SECRET is not configured");
		}

		const now = Date.now();
		const expiresAt = now + expiryMs;

		// Create JWT token using jose
		const secret = new TextEncoder().encode(tokenSecret);
		const token = await new SignJWT({
			userId: params.userId,
			email: params.email,
			role: params.role,
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime(Math.floor(expiresAt / 1000))
			.sign(secret);

		// Store session data
		const sessionData: RedisSessionData = {
			userId: params.userId,
			email: params.email,
			role: params.role,
			createdAt: now,
			expiresAt,
		};

		const sessionKey = `${REDIS_KEY_PREFIX}${params.userId}`;
		const ttlSeconds = Math.floor(expiryMs / 1000);

		if (redis) {
			await redis.setex(sessionKey, ttlSeconds, JSON.stringify(sessionData));
		} else {
			inMemoryStore.set(sessionKey, sessionData);
			// Set up expiry for in-memory store
			setTimeout(() => {
				inMemoryStore.delete(sessionKey);
			}, expiryMs);
		}

		log.info("Created session for user %d (%s)", params.userId, params.email);
		return token;
	}

	async function validateSession(token: string): Promise<SessionPayload | null> {
		if (!tokenSecret) {
			return null;
		}

		try {
			// Verify JWT token using jose
			const secret = new TextEncoder().encode(tokenSecret);
			const { payload } = await jwtVerify(token, secret);

			const sessionPayload = payload as SessionPayload;

			if (!sessionPayload.userId || !sessionPayload.email || !sessionPayload.role) {
				return null;
			}

			// Check if session exists in store
			const sessionKey = `${REDIS_KEY_PREFIX}${sessionPayload.userId}`;

			if (redis) {
				const sessionData = await redis.get(sessionKey);
				if (!sessionData) {
					return null;
				}
			} else {
				const sessionData = inMemoryStore.get(sessionKey);
				if (!sessionData || sessionData.expiresAt < Date.now()) {
					inMemoryStore.delete(sessionKey);
					return null;
				}
			}

			return sessionPayload;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			log.debug("Session validation failed: %s", message);
			return null;
		}
	}

	async function destroySession(userId: number): Promise<void> {
		const sessionKey = `${REDIS_KEY_PREFIX}${userId}`;

		if (redis) {
			await redis.del(sessionKey);
		} else {
			inMemoryStore.delete(sessionKey);
		}

		log.info("Destroyed session for user %d", userId);
	}

	return {
		createSession,
		validateSession,
		destroySession,
		isAuthConfigured,
	};
}

/** Singleton session service instance */
let sessionServiceInstance: SessionService | null = null;

/**
 * Get the singleton SessionService instance.
 */
export function getSessionService(): SessionService {
	if (!sessionServiceInstance) {
		sessionServiceInstance = createSessionService();
	}
	return sessionServiceInstance;
}
