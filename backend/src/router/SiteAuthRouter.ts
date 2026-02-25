import type { DaoProvider } from "../dao/DaoProvider";
import type { SiteDao } from "../dao/SiteDao";
import type { Site, SiteMetadata } from "../model/Site";
import { getTenantContext } from "../tenant/TenantContext";
import { isEmailAuthorized } from "../util/AuthHandler";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import type { UserInfo } from "jolli-common";
import jwt from "jsonwebtoken";
import "../types/SessionTypes";

const log = getLog(import.meta);

/**
 * Determines the appropriate URL for a site, using proper domain priority:
 * 1. Verified custom domain (if configured)
 * 2. jolli.site subdomain (if configured)
 * 3. null if neither is available
 *
 * Note: This intentionally ignores Vercel deployment URLs to ensure users
 * are redirected to their proper domain, not the raw .vercel.app URL.
 */
function getSiteUrl(metadata: SiteMetadata | undefined): string | null {
	if (!metadata) {
		return null;
	}

	// Priority 1: Verified custom domain
	const verifiedCustomDomain = metadata.customDomains?.find(d => d.status === "verified");
	if (verifiedCustomDomain) {
		return `https://${verifiedCustomDomain.domain}`;
	}

	// Priority 2: jolli.site subdomain
	if (metadata.jolliSiteDomain) {
		return `https://${metadata.jolliSiteDomain}`;
	}

	return null;
}

/**
 * Validates and sanitizes return URL to prevent open redirect attacks.
 * Only allows relative paths starting with a single slash.
 */
function sanitizeReturnUrl(url: string): string {
	// Must start with exactly one slash and not contain protocol indicators
	if (url.startsWith("/") && !url.startsWith("//") && !url.includes("://")) {
		return url;
	}
	return "/";
}

/** Result of successful site auth token generation */
export interface SiteTokenResult {
	redirectUrl: string;
}

/** Error result from site auth token generation */
export interface SiteTokenError {
	error: string;
	status: number;
}

/**
 * Generates a site-specific JWT token and returns the redirect URL.
 */
function generateSiteAuthToken(site: Site, userInfo: UserInfo, returnUrl: string): SiteTokenResult | SiteTokenError {
	const metadata = site.metadata as SiteMetadata | undefined;

	// Get site URL to redirect to (custom domain or jolli.site subdomain)
	const siteUrl = getSiteUrl(metadata);
	if (!siteUrl) {
		return { error: "Site has no domain configured", status: 400 };
	}

	// Check that site has auth keys configured
	if (!metadata?.jwtAuth?.privateKey) {
		return { error: "Site auth keys not configured", status: 400 };
	}

	// Sign JWT for the site using ES256 with site's private key
	const customClaims = {
		email: userInfo.email,
		groups: [], // TODO: Populate when groups system exists
		siteId: site.id.toString(),
	};
	const token = jwt.sign(customClaims, metadata.jwtAuth.privateKey, {
		algorithm: "ES256",
		issuer: "jolli.ai",
		subject: userInfo.userId?.toString(),
		audience: site.id.toString(),
		expiresIn: "24h",
	});

	// Build redirect URL with JWT in hash
	const redirectUrl = `${siteUrl}/auth/callback#jwt=${token}&returnUrl=${encodeURIComponent(returnUrl)}`;
	log.info({ siteId: site.id, email: userInfo.email }, "Issued site auth token");

	return { redirectUrl };
}

/**
 * Creates the site authentication router.
 * Handles JWT token generation for accessing protected documentation sites.
 */
export function createSiteAuthRouter(siteDaoProvider: DaoProvider<SiteDao>, tokenUtil: TokenUtil<UserInfo>): Router {
	const router = express.Router({ mergeParams: true });

	/**
	 * GET /sites/:id/auth/jwt
	 * Entry point for doc site JWT authentication.
	 * If user is logged in, generates JWT token and redirects to doc site.
	 * If not logged in, stores pending auth in session and redirects to Jolli login.
	 *
	 * Query params:
	 * - returnUrl: The path on the docs site to redirect to after auth (default: "/")
	 */
	router.get("/:id/auth/jwt", async (req: Request, res) => {
		try {
			const returnUrl = sanitizeReturnUrl((req.query.returnUrl as string) || "/");
			const id = Number.parseInt(req.params.id, 10);

			if (Number.isNaN(id)) {
				res.status(400).json({ error: "Invalid site ID" });
				return;
			}

			// Validate site exists before starting OAuth
			const siteDao = siteDaoProvider.getDao(getTenantContext());
			const site = await siteDao.getSite(id);
			if (!site) {
				res.status(404).json({ error: "Site not found" });
				return;
			}

			const userInfo = tokenUtil.decodePayload(req);
			if (!userInfo) {
				// Session is required to store pending site auth
				if (!req.session) {
					log.error("Session not available for site auth login");
					res.status(500).json({ error: "Session not available" });
					return;
				}

				// Store pending site auth in session, redirect to login page
				req.session.pendingSiteAuth = { siteId: req.params.id, returnUrl };
				// Explicitly save session before redirect to ensure it's persisted
				(req.session as unknown as { save: (cb: (err?: Error) => void) => void }).save(err => {
					if (err) {
						log.error(err, "Failed to save session for site auth");
					}
					res.redirect("/login");
				});
				return;
			}

			// Check if user is authorized for this tenant
			if (!isEmailAuthorized(userInfo.email)) {
				log.warn({ email: userInfo.email, siteId: id }, "Site auth: email not authorized for tenant");
				const siteUrl = getSiteUrl(site.metadata as SiteMetadata | undefined);
				if (siteUrl) {
					res.redirect(`${siteUrl}/auth/callback#error=unauthorized`);
				} else {
					res.status(403).json({ error: "Not authorized for this tenant" });
				}
				return;
			}

			// User is logged in and authorized - generate token and redirect to doc site
			const result = generateSiteAuthToken(site, userInfo, returnUrl);
			if ("error" in result) {
				res.status(result.status).json({ error: result.error });
				return;
			}
			res.redirect(result.redirectUrl);
		} catch (error) {
			log.error(error, "Failed to process site auth login");
			res.status(500).json({ error: "Failed to process site auth login" });
		}
	});

	return router;
}
