import { auditLog } from "../audit";
import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { SpaceDao } from "../dao/SpaceDao";
import type { RememberMeService } from "../services/RememberMeService";
import { getTenantContext } from "../tenant/TenantContext";
import { clearAuthCookie, clearRememberMeCookie, resolveCookieDomain } from "../util/Cookies";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import type { UserInfo } from "jolli-common";
import ms from "ms";
import "../types/SessionTypes";

const log = getLog(import.meta);

export interface AuthRouterDeps {
	spaceDaoProvider: DaoProvider<SpaceDao>;
	tokenUtil: TokenUtil<UserInfo>;
	// RememberMeService for clearing tokens on logout (optional for backwards compatibility)
	rememberMeService?: RememberMeService | undefined;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
	const { spaceDaoProvider, tokenUtil, rememberMeService } = deps;
	const router = express.Router();

	router.get("/login", (req, res) => {
		captureGatewayAuthFromRequest(req);
		const userInfo = tokenUtil.decodePayload(req);
		log.info({ userInfo }, "GET /login - decodePayload result");
		// Note: favoritesHash is now obtained from /api/org/current endpoint
		res.json({ user: userInfo ?? undefined });
	});

	router.get("/cli-token", async (req, res) => {
		const token = req.cookies?.authToken;
		if (!token) {
			return res.status(401).json({ error: "Not authorized" });
		}

		// Get user info to fetch their default space
		const userInfo = tokenUtil.decodePayload(req);
		let space: string | undefined;
		if (userInfo?.userId) {
			try {
				const spaceDao = spaceDaoProvider.getDao(getTenantContext());
				// Try to get default space (should exist from bootstrap)
				const defaultSpace = await spaceDao.getDefaultSpace();
				if (defaultSpace) {
					space = defaultSpace.slug;
				} else {
					log.warn(
						{ userId: userInfo.userId },
						"No default space found for CLI token - org may not be bootstrapped",
					);
				}
			} catch (error) {
				log.warn(error, "Failed to get default space for CLI token");
			}
		}

		res.json({ token, space });
	});

	router.post("/logout", async (req, res) => {
		const userInfo = tokenUtil.decodePayload(req);

		// Get the current remember-me token from cookie before clearing
		const rememberMeToken = req.cookies?.remember_me_token as string | undefined;

		// Clear both auth and remember-me cookies
		clearAuthCookie(res);
		clearRememberMeCookie(res);
		// Clear pending GitHub email selection cookie as well.
		// Clear both host-only and configured-domain variants to cover legacy states.
		const cookieDomain = resolveCookieDomain();
		res.clearCookie("email_selection", { path: "/" });
		if (cookieDomain) {
			res.clearCookie("email_selection", { path: "/", domain: cookieDomain });
		}

		// Revoke only the current session's remember-me token (not all devices)
		// Use revokeAllTokensForUser() for "logout from all devices" feature
		if (rememberMeService && rememberMeToken) {
			try {
				await rememberMeService.revokeToken(rememberMeToken);
				log.info({ userId: userInfo?.userId }, "Remember-me token revoked on logout");
			} catch (error) {
				log.warn(error, "Failed to revoke remember-me token on logout");
			}
		}

		// Audit log the logout event
		if (userInfo) {
			auditLog({
				action: "logout",
				resourceType: "session",
				resourceId: userInfo.userId?.toString() ?? userInfo.email,
				resourceName: userInfo.email,
				actorId: userInfo.userId ?? null,
				actorEmail: userInfo.email,
			});
		}

		res.json({ success: true });
	});

	/**
	 * Returns gateway auth info from session.
	 * Used by the frontend on the auth gateway to get the tenant returnTo URL
	 * for redirecting errors back to the tenant.
	 */
	router.get("/gateway-info", (req, res) => {
		const gatewayAuth = req.session?.gatewayAuth ?? captureGatewayAuthFromRequest(req);
		if (!gatewayAuth) {
			return res.status(404).json({ error: "No gateway auth in session" });
		}
		res.json({
			tenantSlug: gatewayAuth.tenantSlug,
			returnTo: gatewayAuth.returnTo,
		});
	});

	/**
	 * Returns session configuration for the frontend.
	 * This is a public endpoint (no auth required) so the frontend can fetch
	 * the idle timeout value before the user logs in.
	 */
	router.get("/session-config", (req, res) => {
		captureGatewayAuthFromRequest(req);
		const config = getConfig();

		const enabledProviders = getEnabledAuthProviders(config);

		res.json({
			// @deprecated Frontend idle timeout removed, kept for backwards compatibility
			idleTimeoutMs: ms(config.SESSION_IDLE_TIMEOUT),
			// @deprecated OAuth provider selection UI removed (AuthElement), kept for backwards compatibility
			enabledProviders,
			siteEnv: config.SITE_ENV,
			jolliSiteDomain: config.JOLLI_SITE_DOMAIN,
			authGatewayOrigin: config.AUTH_GATEWAY_ORIGIN,
			cookieDomain: resolveCookieDomain(),
		});
	});

	/**
	 * Recover gateway auth context from login page URL when on auth gateway.
	 * This preserves /gateway-info behavior after removing legacy /connect OAuth flow.
	 */
	function captureGatewayAuthFromRequest(req: Request): { tenantSlug: string; returnTo: string } | undefined {
		if (!req.session) {
			return;
		}

		const config = getConfig();
		const baseDomain = config.BASE_DOMAIN;
		if (!baseDomain) {
			return;
		}

		const host = req.get("host")?.split(":")[0];
		if (host !== `auth.${baseDomain}`) {
			return;
		}

		const returnToRaw = getReturnToParam(req);
		if (!returnToRaw) {
			return;
		}

		try {
			const returnToUrl = new URL(returnToRaw);
			if (!isValidGatewayReturnTo(returnToUrl, baseDomain)) {
				log.warn({ returnTo: returnToRaw }, "Ignoring invalid gateway returnTo");
				return;
			}

			const hostname = returnToUrl.hostname;
			const tenantSuffix = `.${baseDomain}`;
			const tenantSlug = hostname === baseDomain ? "jolli" : hostname.slice(0, -tenantSuffix.length);

			const gatewayAuth = {
				tenantSlug,
				returnTo: returnToUrl.toString(),
			};
			req.session.gatewayAuth = gatewayAuth;
			return gatewayAuth;
		} catch (error) {
			log.debug({ error }, "Failed to capture gateway auth from request");
		}
	}

	function getReturnToParam(req: Request): string | undefined {
		const queryValue = req.query.returnTo;
		if (typeof queryValue === "string" && queryValue.length > 0) {
			return queryValue;
		}

		const referer = req.get("referer");
		if (!referer) {
			return;
		}

		try {
			const refererUrl = new URL(referer);
			const returnToRaw = refererUrl.searchParams.get("returnTo");
			return returnToRaw ?? undefined;
		} catch {
			return;
		}
	}

	function isValidGatewayReturnTo(returnToUrl: URL, baseDomain: string): boolean {
		if (!["http:", "https:"].includes(returnToUrl.protocol)) {
			return false;
		}

		if (process.env.NODE_ENV === "production" && returnToUrl.protocol !== "https:") {
			return false;
		}

		const hostname = returnToUrl.hostname;
		if (hostname === `auth.${baseDomain}`) {
			return false;
		}

		return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
	}

	function getEnabledAuthProviders(config: ReturnType<typeof getConfig>): Array<string> {
		const raw = config.ENABLED_AUTH_PROVIDERS;
		const parsed = raw
			.split(",")
			.map(p => p.trim())
			.filter(p => p.length > 0)
			.map(p => (p.startsWith("jolli_") ? p.slice(6) : p));

		if (parsed.length > 0) {
			return parsed;
		}

		const providers: Array<string> = [];
		if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
			providers.push("google");
		}
		if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET) {
			providers.push("github");
		}

		return providers.length > 0 ? providers : ["google", "github"];
	}

	return router;
}
