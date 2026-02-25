import { getConfig } from "../config/Config.js";
import type { GlobalUserDao } from "../dao/GlobalUserDao.js";
import type { UserOrgDao, UserTenantInfo } from "../dao/UserOrgDao.js";
import type { RememberMeService } from "../services/RememberMeService.js";
import { getTenantContext } from "../tenant/TenantContext.js";
import {
	buildRememberMeCookieValue,
	clearRememberMeCookie,
	issueAuthCookie,
	resolveCookieDomain,
} from "../util/Cookies.js";
// TODO: Re-enable when email infrastructure is ready
// import { sendSecurityAlertEmail } from "../util/EmailService.js";
import { getLog } from "../util/Logger.js";
import type { TokenUtil } from "../util/TokenUtil.js";
import type { NextFunction, Request, Response } from "express";
import type { UserInfo } from "jolli-common";
import ms from "ms";

const log = getLog(import.meta);

/**
 * Check if a host is part of the base domain (subdomain or exact match).
 * @param host - The host to check (e.g., "san-4.jolli.app" or "localhost:7034")
 * @param baseDomain - The base domain (e.g., "jolli.app")
 * @returns true if host is part of base domain
 */
function isHostPartOfBaseDomain(host: string, baseDomain: string): boolean {
	// Remove port if present
	const hostWithoutPort = host.split(":")[0];
	// Check if it's a subdomain of base domain or exact match
	return hostWithoutPort === baseDomain || hostWithoutPort.endsWith(`.${baseDomain}`);
}

/**
 * Sets the rotated remember-me token cookie on the response.
 * Properly handles existing Set-Cookie headers.
 */
function setRotatedTokenCookie(res: Response, newToken: string): void {
	const config = getConfig();
	const cookieDomain = resolveCookieDomain();
	const maxAge = ms(config.REMEMBER_ME_DURATION);
	const isSecure = config.NODE_ENV === "production";
	const cookieValue = buildRememberMeCookieValue(newToken, cookieDomain, maxAge, isSecure);

	// Properly handle existing Set-Cookie header (can be string, string[], or undefined)
	const existingCookies = res.getHeader("Set-Cookie");
	const allCookies: Array<string> = [];
	if (existingCookies) {
		if (Array.isArray(existingCookies)) {
			allCookies.push(...existingCookies.map(String));
		} else {
			allCookies.push(String(existingCookies));
		}
	}
	allCookies.push(cookieValue);
	res.setHeader("Set-Cookie", allCookies);
	log.debug({ cookieDomain: cookieDomain ?? "(host-only)" }, "Set rotated remember-me token cookie");
}

/**
 * Handles tenant subdomain redirect logic after auto-login.
 * Returns true if a redirect was performed, false otherwise.
 */
function handleTenantRedirect(req: Request, res: Response, lastAccessedTenant: UserTenantInfo): boolean {
	const config = getConfig();
	const baseDomain = config.BASE_DOMAIN;
	if (!baseDomain) {
		return false;
	}

	const host = req.get("host") || "";
	const expectedHost = `${lastAccessedTenant.tenantSlug}.${baseDomain}`;
	const isOnCorrectSubdomain = host.startsWith(`${lastAccessedTenant.tenantSlug}.`);
	const isPartOfBaseDomain = isHostPartOfBaseDomain(host, baseDomain);

	// Only redirect if we're already on a subdomain of BASE_DOMAIN but not the correct one.
	// If accessing via localhost or a different domain, cookies won't be shared
	// across domains, so redirect would fail (user would land on login page).
	if (!isOnCorrectSubdomain && isPartOfBaseDomain) {
		const protocol = req.protocol || "https";
		const redirectUrl = `${protocol}://${expectedHost}${req.originalUrl || "/"}`;
		log.info(
			{ redirectUrl, currentHost: host, expectedHost },
			"Redirecting to tenant subdomain after remember-me auto-login",
		);
		res.redirect(302, redirectUrl);
		return true;
	}

	// Log when skipping redirect due to domain mismatch (e.g., accessing via localhost)
	if (!isOnCorrectSubdomain && !isPartOfBaseDomain) {
		log.info(
			{ currentHost: host, baseDomain, expectedHost },
			"Skipping tenant subdomain redirect - current host is not part of BASE_DOMAIN (cookies would not be shared)",
		);
	}

	return false;
}

export interface RememberMeMiddlewareConfig {
	rememberMeService: RememberMeService;
	globalUserDao: GlobalUserDao;
	userOrgDao: UserOrgDao;
	tokenUtil: TokenUtil<UserInfo>;
}

/**
 * Check if the user is inactive in the current tenant.
 * Returns true if user is tenant-inactive and should be blocked.
 */
async function isUserInactiveInTenant(userId: number): Promise<boolean> {
	const tenantContext = getTenantContext();
	if (!tenantContext) {
		return false;
	}
	const activeUser = await tenantContext.database.activeUserDao.findById(userId);
	return !!activeUser && !activeUser.isActive;
}

// TODO: Re-enable when email infrastructure is ready
// /**
//  * Send security alert email for token theft detection.
//  * This function runs in the background (via setImmediate) to avoid blocking the response.
//  */
// async function notifyTokenTheft(
// 	globalUserDao: GlobalUserDao,
// 	userId: number,
// 	ipAddress: string | undefined,
// 	userAgent: string | undefined,
// ): Promise<void> {
// 	const theftUser = await globalUserDao.findUserById(userId);
// 	if (!theftUser?.email) {
// 		log.warn({ userId }, "Cannot send token theft alert - user not found or no email");
// 		return;
// 	}
//
// 	const config = getConfig();
// 	const securityReviewUrl = `${config.AUTH_GATEWAY_ORIGIN || config.ORIGIN}/settings/security`;
//
// 	await sendSecurityAlertEmail({
// 		toEmail: theftUser.email,
// 		toName: theftUser.name,
// 		alertType: "token_theft",
// 		securityReviewUrl,
// 		...(ipAddress && { ipAddress }),
// 		...(userAgent && { userAgent }),
// 	});
//
// 	log.info({ userId, email: theftUser.email }, "Token theft security alert sent");
// }

/**
 * Middleware to handle remember-me auto-login.
 *
 * If the user has a valid remember_me_token cookie but no authToken,
 * this middleware validates the remember-me token and creates a new session.
 */
export function createRememberMeMiddleware(config: RememberMeMiddlewareConfig) {
	const { rememberMeService, globalUserDao, userOrgDao, tokenUtil } = config;

	return async function rememberMeMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
		const appConfig = getConfig();

		// Log all incoming cookies for debugging
		log.debug(
			{
				path: req.path,
				hasRememberMeToken: !!req.cookies?.remember_me_token,
				hasAuthToken: !!req.cookies?.authToken,
			},
			"RememberMeMiddleware invoked",
		);

		// Skip if remember-me is disabled
		if (!appConfig.REMEMBER_ME_ENABLED) {
			log.debug("Remember-me is disabled, skipping");
			return next();
		}

		// Skip for login endpoints - login will create its own fresh token
		// This prevents duplicate tokens when user with existing remember_me_token logs in again
		// Only skip sign-in endpoints, not other auth endpoints like /auth/callback
		if (req.path?.startsWith("/auth/sign-in")) {
			log.debug({ path: req.path }, "Skipping remember-me for login endpoint");
			return next();
		}

		// Check for remember_me_token cookie
		const rememberMeToken = req.cookies?.remember_me_token;
		if (!rememberMeToken) {
			return next();
		}

		// Skip if user is already authenticated (has valid authToken)
		const existingUserInfo = tokenUtil.decodePayload(req);
		if (existingUserInfo?.userId) {
			log.debug({ userId: existingUserInfo.userId }, "User already authenticated, skipping remember-me");
			return next();
		}

		try {
			// Validate the remember-me token
			const userAgent = req.headers["user-agent"];
			const ipAddress = req.ip || req.socket?.remoteAddress;
			const validationResult = await rememberMeService.validateToken(rememberMeToken, userAgent, ipAddress);

			if (!validationResult.valid || !validationResult.userId) {
				// Invalid or expired token - clear the cookie
				log.info("Invalid remember-me token, clearing cookie");
				clearRememberMeCookie(res);

				// TODO: Re-enable token theft email notification when email infrastructure is ready
				// Send security alert email if token theft was detected
				// Note: This adds ~20-50ms latency only in the rare case of token theft detection
				// We await here to ensure the notification is sent in serverless environments (Vercel)
				// if (validationResult.possibleTheft && validationResult.userId) {
				// 	await notifyTokenTheft(globalUserDao, validationResult.userId, ipAddress, userAgent).catch(
				// 		(err: unknown) => log.error(err, "Failed to process token theft notification"),
				// 	);
				// }

				return next();
			}

			// Fetch user info from database and verify user is still active
			const user = await globalUserDao.findUserById(validationResult.userId);
			if (!user || !user.isActive) {
				log.warn(
					{ userId: validationResult.userId, userExists: !!user, isActive: user?.isActive },
					"User not found or inactive for remember-me token",
				);
				clearRememberMeCookie(res);
				return next();
			}

			// Check tenant-level isActive (catches deactivation by tenant admin)
			if (await isUserInactiveInTenant(user.id)) {
				log.warn({ userId: user.id }, "Remember-me blocked: user is inactive in tenant");
				clearRememberMeCookie(res);
				return next();
			}

			// Get user's last accessed tenant/org with tenant slug (sorted by isDefault DESC, lastAccessedAt DESC)
			const userTenants = await userOrgDao.getUserTenants(validationResult.userId);
			const lastAccessedTenant = userTenants.length > 0 ? userTenants[0] : undefined;

			// Create new auth token (session) with last accessed tenant/org if available
			const tokenPayload: UserInfo = {
				userId: user.id,
				email: user.email,
				name: user.name,
				picture: user.image ?? undefined,
				tenantId: lastAccessedTenant?.tenantId,
				orgId: lastAccessedTenant?.orgId,
			};
			const newAuthToken = tokenUtil.generateToken(tokenPayload);
			issueAuthCookie(res, newAuthToken);

			// Also set the token in request cookies so downstream handlers can read it immediately
			// (the response Set-Cookie header won't be available to the current request's cookie parser)
			if (!req.cookies) {
				req.cookies = {};
			}
			req.cookies.authToken = newAuthToken;
			log.debug({ userId: user.id, path: req.path }, "Set authToken in request cookies for downstream handlers");

			// Set rotated remember-me token if rotation is enabled
			// IMPORTANT: This must happen BEFORE any redirect to ensure browser stores the new token
			if (validationResult.newToken) {
				setRotatedTokenCookie(res, validationResult.newToken);
			}

			if (lastAccessedTenant) {
				log.info(
					{
						tenantId: lastAccessedTenant.tenantId,
						orgId: lastAccessedTenant.orgId,
						tenantSlug: lastAccessedTenant.tenantSlug,
					},
					"Auto-login restored last accessed tenant/org",
				);

				// Check if we need to redirect to the tenant subdomain
				if (handleTenantRedirect(req, res, lastAccessedTenant)) {
					return; // Redirect was performed, exit middleware
				}
			}

			log.info({ userId: user.id, email: user.email }, "Auto-login via remember-me token");
		} catch (error) {
			log.error(error, "Error validating remember-me token");
			// Clear potentially corrupted cookie
			clearRememberMeCookie(res);
		}

		next();
	};
}
