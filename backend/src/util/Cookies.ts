import { getConfig } from "../config/Config";
import { getEnvOrError } from "./Env";
import { getLog } from "./Logger";
import { connectRedis, type RedisClientType } from "./RedisClient";
import { randomBytes } from "node:crypto";
import type { CookieOptions, RequestHandler } from "express";
import type { Request, Response } from "express-serve-static-core";
import session from "express-session";
import ms from "ms";

const log = getLog(import.meta);
const origin = getEnvOrError("ORIGIN");

/**
 * Resolves the cookie domain from configuration.
 * Priority: COOKIE_DOMAIN > ".{BASE_DOMAIN}" > undefined
 */
export function resolveCookieDomain(): string | undefined {
	const config = getConfig();
	// Use explicit COOKIE_DOMAIN if set
	if (config.COOKIE_DOMAIN) {
		return config.COOKIE_DOMAIN;
	}
	// Fall back to .{BASE_DOMAIN} for multi-tenant mode
	return config.BASE_DOMAIN ? `.${config.BASE_DOMAIN}` : undefined;
}

/** Default TTL for session in seconds (24 hours) - used by Redis session store */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Default TTL for session cookies in milliseconds (24 hours) - matches Redis session store TTL */
const SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

/** Default TTL for visitor cookies in milliseconds (1 year) */
const VISITOR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function createCookieOptions(partial?: Partial<CookieOptions>): CookieOptions {
	const cookieDomain = resolveCookieDomain();

	return {
		httpOnly: true,
		path: "/",
		secure: origin.startsWith("https://"),
		domain: cookieDomain,
		...partial,
	};
}

export function issueVisitorCookie(req: Request, res: Response): string {
	const visitorId = req.cookies.visitorId ?? randomBytes(16).toString("base64url").slice(0, 22);
	res.cookie("visitorId", visitorId, createCookieOptions({ sameSite: "strict", maxAge: VISITOR_COOKIE_MAX_AGE_MS }));
	return visitorId;
}

export function issueAuthCookie(res: Response, token: string): void {
	const config = getConfig();
	const maxAge = ms(config.TOKEN_COOKIE_MAX_AGE);
	// Use "lax" to allow cookie on redirects from OAuth providers (strict blocks these)
	res.cookie("authToken", token, createCookieOptions({ sameSite: "lax", maxAge }));
}

export function clearAuthCookie(res: Response): void {
	const cookieDomain = resolveCookieDomain();
	res.clearCookie("authToken", { path: "/", domain: cookieDomain });
}

/**
 * Build auth cookie value string for Set-Cookie header.
 * Used by better-auth hooks to set JWT token cookie manually.
 */
export function buildAuthCookieValue(
	jwtToken: string,
	cookieDomain: string | undefined,
	maxAge: number,
	isSecure: boolean,
): string {
	return [
		`authToken=${jwtToken}`,
		`Max-Age=${Math.floor(maxAge / 1000)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		isSecure ? "Secure" : "",
		cookieDomain ? `Domain=${cookieDomain}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

/**
 * Build a Set-Cookie header value that clears the authToken cookie.
 * Used by better-auth hooks where Express res.clearCookie() is unavailable.
 */
export function buildClearAuthCookieValue(cookieDomain: string | undefined, isSecure: boolean): string {
	return [
		"authToken=",
		"Max-Age=0",
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		isSecure ? "Secure" : "",
		cookieDomain ? `Domain=${cookieDomain}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

/**
 * Issue a remember-me cookie to keep the user signed in.
 * Token is stored as HttpOnly cookie with 30-day expiry.
 */
export function issueRememberMeCookie(res: Response, token: string): void {
	const config = getConfig();
	const maxAge = ms(config.REMEMBER_ME_DURATION);
	res.cookie("remember_me_token", token, createCookieOptions({ sameSite: "lax", maxAge }));
}

/**
 * Clear the remember-me cookie.
 */
export function clearRememberMeCookie(res: Response): void {
	const cookieDomain = resolveCookieDomain();
	res.clearCookie("remember_me_token", { path: "/", domain: cookieDomain });
}

/**
 * Build remember-me cookie value string for Set-Cookie header.
 * Used by better-auth hooks to set remember-me token cookie manually.
 */
export function buildRememberMeCookieValue(
	token: string,
	cookieDomain: string | undefined,
	maxAge: number,
	isSecure: boolean,
): string {
	return [
		`remember_me_token=${token}`,
		`Max-Age=${Math.floor(maxAge / 1000)}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		isSecure ? "Secure" : "",
		cookieDomain ? `Domain=${cookieDomain}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

/**
 * Build cookie value string to clear the remember-me cookie.
 */
export function buildClearRememberMeCookieValue(cookieDomain: string | undefined): string {
	return [
		"remember_me_token=",
		"Max-Age=0",
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		cookieDomain ? `Domain=${cookieDomain}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

/**
 * Custom Redis Store for express-session.
 * Implements the Store interface to save sessions to Redis.
 * Works with both standalone Redis and MemoryDB cluster mode.
 */
export class RedisStore extends session.Store {
	private client: RedisClientType;
	private prefix: string;
	private ttl: number;

	constructor(client: RedisClientType, options: { prefix?: string; ttl?: number } = {}) {
		super();
		this.client = client;
		this.prefix = options.prefix || "session:";
		this.ttl = options.ttl || SESSION_TTL_SECONDS;
	}

	private getKey(sid: string): string {
		return this.prefix + sid;
	}

	async get(
		sid: string,
		callback: (err?: Error | null, session?: session.SessionData | null) => void,
	): Promise<void> {
		try {
			const data = await this.client.get(this.getKey(sid));
			if (!data) {
				return callback(null, null);
			}
			const session = JSON.parse(data) as session.SessionData;
			callback(null, session);
		} catch (error) {
			callback(error as Error);
		}
	}

	async set(sid: string, sessionData: session.SessionData, callback?: (err?: Error) => void): Promise<void> {
		try {
			const data = JSON.stringify(sessionData);
			const ttl = sessionData.cookie?.maxAge ? Math.floor(sessionData.cookie.maxAge / 1000) : this.ttl;
			await this.client.setex(this.getKey(sid), ttl, data);
			callback?.();
		} catch (error) {
			callback?.(error as Error);
		}
	}

	async destroy(sid: string, callback?: (err?: Error) => void): Promise<void> {
		try {
			await this.client.del(this.getKey(sid));
			callback?.();
		} catch (error) {
			callback?.(error as Error);
		}
	}

	async touch(sid: string, sessionData: session.SessionData, callback?: (err?: Error) => void): Promise<void> {
		try {
			const ttl = sessionData.cookie?.maxAge ? Math.floor(sessionData.cookie.maxAge / 1000) : this.ttl;
			await this.client.expire(this.getKey(sid), ttl);
			callback?.();
		} catch (error) {
			callback?.(error as Error);
		}
	}
}

export async function expressSessionHandler(): Promise<RequestHandler> {
	const config = getConfig();
	const redisUrl = config.REDIS_URL;

	let store: session.Store | undefined;

	// If REDIS_URL is configured, use Redis for session storage
	if (redisUrl) {
		try {
			const redisClient = await connectRedis(redisUrl, { name: "session" });

			store = new RedisStore(redisClient, {
				prefix: "session:",
				ttl: SESSION_TTL_SECONDS,
			});

			log.info("Using Redis for session storage");
		} catch (error) {
			log.warn(error, "Failed to connect to Redis, falling back to in-memory storage");
			// store remains undefined, will use memory store
		}
	}

	// If no Redis or Redis connection failed, use in-memory storage
	// In-memory storage is the default for express-session when no store is provided
	if (!store) {
		log.info("Using in-memory session storage (not recommended for production)");
	}

	return session({
		cookie: createCookieOptions({ sameSite: "lax", maxAge: SESSION_COOKIE_MAX_AGE_MS }), // Use "lax" to allow OAuth redirects from external providers
		name: "sessionId",
		resave: false,
		saveUninitialized: false,
		secret: getEnvOrError("SESSION_SECRET"),
		store,
	});
}
