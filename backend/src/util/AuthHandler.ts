import { isMultiTenantAuthEnabled } from "../auth/AuthGateway";
import { getConfig, parseRegexList } from "../config/Config";
import { getTenantContext } from "../tenant/TenantContext";
import { issueAuthCookie } from "./Cookies";
import { getLog } from "./Logger";
import type { TokenUtil } from "./TokenUtil";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserInfo } from "jolli-common";
import jwt from "jsonwebtoken";
import ms from "ms";

const log = getLog(import.meta);

export function createAuthHandler(tokenUtil: TokenUtil<UserInfo>): RequestHandler {
	return (req: Request, res: Response, next: NextFunction): void => {
		const userInfo = tokenUtil.decodePayload(req);
		if (!userInfo) {
			res.status(401).json({ error: "Not authorized" });
			return;
		}

		// Check email authorization
		if (!isEmailAuthorized(userInfo.email)) {
			res.status(401).json({ error: "Email not authorized" });
			return;
		}

		// Check if token needs to be refreshed
		refreshTokenIfNeeded(req, res, userInfo, tokenUtil);

		next();
	};
}

/**
 * Check if an email matches the given authorization patterns.
 * This is the core pattern matching logic used by all email authorization checks.
 * @param email The email to check
 * @param authEmails The authorization patterns (comma-separated regex, or "*" for all)
 * @returns true if email matches patterns, false otherwise
 */
export function isEmailMatchingPatterns(email: string, authEmails: string): boolean {
	// "*" means allow all emails
	if (authEmails === "*") {
		return true;
	}

	// Check email against patterns
	const emailPatterns = parseRegexList(authEmails);
	return emailPatterns.some(pattern => pattern.test(email));
}

/**
 * Check if an email is authorized for the current tenant/context.
 * - Checks tenant's AUTH_EMAILS config
 * - AUTH_EMAILS = "*" allows all emails
 */
export function isEmailAuthorized(email: string): boolean {
	const config = getConfig();
	const isAuthorized = isEmailMatchingPatterns(email, config.AUTH_EMAILS);

	if (!isAuthorized) {
		const multiTenantMode = isMultiTenantAuthEnabled();
		const tenantContext = getTenantContext();
		log.debug({ email, multiTenantMode, hasTenantContext: !!tenantContext }, "Email not authorized");
	}

	return isAuthorized;
}

/**
 * Refreshes the auth token if it's within the refresh window of expiration.
 * This allows active users to stay logged in indefinitely.
 */
function refreshTokenIfNeeded(req: Request, res: Response, userInfo: UserInfo, tokenUtil: TokenUtil<UserInfo>): void {
	try {
		const config = getConfig();
		const refreshWindowMs = ms(config.TOKEN_REFRESH_WINDOW);

		// Get the token from cookie or Authorization header
		const token = req.cookies?.authToken ?? req.headers.authorization?.slice(7);
		/* v8 ignore next 3 -- defensive check: token always exists here since decodePayload succeeded */
		if (!token) {
			return;
		}

		// Decode the token to check expiration (without verification, since we already verified it)
		const decoded = jwt.decode(token) as jwt.JwtPayload | null;
		if (!decoded?.exp) {
			return;
		}

		// Check if token expires within the refresh window
		const expiresInMs = decoded.exp * 1000 - Date.now();
		if (expiresInMs > 0 && expiresInMs < refreshWindowMs) {
			log.debug(`Refreshing auth token for user ${userInfo.userId}`);
			// Strip JWT-specific claims from userInfo before regenerating token
			// The decoded payload includes exp, iat, nbf which conflict with jwt.sign's expiresIn option
			const {
				exp: _exp,
				iat: _iat,
				nbf: _nbf,
				...cleanUserInfo
			} = userInfo as UserInfo & { exp?: number; iat?: number; nbf?: number };
			const newToken = tokenUtil.generateToken(cleanUserInfo as UserInfo);
			issueAuthCookie(res, newToken);
			res.setHeader("X-Token-Refreshed", "true");
		}
	} catch (error) {
		// Token refresh is best-effort - don't fail the request if config is unavailable
		log.warn(error, "Failed to refresh token");
	}
}
