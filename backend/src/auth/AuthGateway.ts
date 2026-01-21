import { getConfig } from "../config/Config";
import { getLog } from "../util/Logger";
import { getRequestHost, getRequestProtocol } from "../util/RequestUtil";
import type express from "express";

const log = getLog(import.meta);

/**
 * Check if the given host is the auth gateway domain.
 * The auth gateway is at `auth.{BASE_DOMAIN}` (e.g., auth.jolli.ai).
 *
 * @param host - The host header (may include port)
 * @param baseDomain - The base domain (e.g., "jolli.ai")
 * @returns true if this is the auth gateway domain
 */
export function isAuthGateway(host: string, baseDomain: string): boolean {
	const hostname = host.split(":")[0]; // Remove port
	return hostname === `auth.${baseDomain}`;
}

/**
 * Get the auth gateway URL for the current environment.
 * Derived from BASE_DOMAIN config.
 *
 * @returns The auth gateway URL (e.g., "https://auth.jolli.ai")
 */
export function getAuthGatewayUrl(): string {
	const config = getConfig();
	const baseDomain = config.BASE_DOMAIN;
	if (!baseDomain) {
		// Fallback for local development
		return config.ORIGIN;
	}
	return `https://auth.${baseDomain}`;
}

/**
 * Get the subdomain from a host header.
 *
 * @param host - The host header (may include port)
 * @param baseDomain - The base domain (e.g., "jolli.ai")
 * @returns The subdomain, or "jolli" for base domain, or null if no subdomain
 */
export function getSubdomain(host: string, baseDomain: string): string | null {
	const hostname = host.split(":")[0]; // Remove port

	// Base domain itself uses "jolli" as the default tenant
	if (hostname === baseDomain) {
		return "jolli";
	}

	// Check if it ends with the base domain
	const suffix = `.${baseDomain}`;
	if (!hostname.endsWith(suffix)) {
		return null;
	}

	// Extract subdomain
	const subdomain = hostname.slice(0, -suffix.length);
	return subdomain || null;
}

/**
 * Check if multi-tenant auth mode is enabled.
 *
 * @returns true if USE_MULTI_TENANT_AUTH is enabled
 */
export function isMultiTenantAuthEnabled(): boolean {
	const config = getConfig();
	return config.USE_MULTI_TENANT_AUTH;
}

/**
 * Build the auth gateway redirect URL for a tenant.
 *
 * @param provider - The OAuth provider (e.g., "google", "github")
 * @param tenantSlug - The tenant slug
 * @param returnTo - The URL to return to after auth
 * @returns The full auth gateway URL with query params
 */
export function buildAuthGatewayRedirectUrl(provider: string, tenantSlug: string, returnTo: string): string {
	const gatewayUrl = getAuthGatewayUrl();
	const url = new URL(`/connect/${provider}`, gatewayUrl);
	url.searchParams.set("tenant", tenantSlug);
	url.searchParams.set("returnTo", returnTo);
	return url.toString();
}

/**
 * Validate that a returnTo URL is a valid tenant subdomain.
 * Prevents open redirect attacks.
 *
 * @param returnTo - The returnTo URL to validate
 * @param baseDomain - The base domain (e.g., "jolli.ai")
 * @returns true if the returnTo URL is valid
 */
export function isValidReturnToUrl(returnTo: string, baseDomain: string): boolean {
	try {
		const url = new URL(returnTo);
		const hostname = url.hostname;

		// Must use HTTPS in production
		if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
			return false;
		}

		// Must be a subdomain of BASE_DOMAIN (but not the auth gateway itself)
		const subdomain = getSubdomain(hostname, baseDomain);
		return !(!subdomain || subdomain === "auth");
	} catch {
		return false;
	}
}

/**
 * Handle OAuth connect requests on the auth gateway.
 * Validates tenant/returnTo, stores session data, and sets up OAuth redirect.
 */
function handleAuthGatewayConnect(
	req: express.Request,
	res: express.Response,
	next: express.NextFunction,
	host: string,
	domain: string,
	provider: string,
	isCallback: boolean,
): void {
	if (isCallback || !provider) {
		next();
		return;
	}

	const tenant = req.query.tenant as string | undefined;
	const returnTo = req.query.returnTo as string | undefined;

	// Validate tenant and returnTo are provided
	if (!tenant || !returnTo) {
		log.warn({ tenant, returnTo }, "Auth gateway missing tenant or returnTo");
		res.status(400).json({ error: "Missing tenant or returnTo parameter" });
		return;
	}

	// Validate returnTo URL to prevent open redirect attacks
	if (!isValidReturnToUrl(returnTo, domain)) {
		log.warn({ returnTo }, "Auth gateway invalid returnTo URL");
		res.status(400).json({ error: "Invalid returnTo URL" });
		return;
	}

	// Store in session for callback
	if (req.session) {
		req.session.gatewayAuth = { tenantSlug: tenant, returnTo };
	}

	const protocol = getRequestProtocol(req);
	const gatewayOrigin = `${protocol}://${host}`;

	// Store the gateway origin for callback
	if (req.session) {
		req.session.oauthOrigin = gatewayOrigin;
	}

	// Set up redirect_uri to come back to gateway
	if (!req.query.redirect_uri) {
		const redirectUri = `${gatewayOrigin}/connect/${provider}/callback`;
		const redirectUrl = `/connect/${provider}?tenant=${encodeURIComponent(tenant)}&returnTo=${encodeURIComponent(returnTo)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
		log.debug({ gatewayOrigin, redirectUri, tenant }, "Auth gateway redirecting with OAuth config");
		res.redirect(redirectUrl);
		return;
	}

	next();
}

/**
 * Redirect a tenant subdomain OAuth request to the auth gateway.
 */
function redirectTenantToGateway(
	req: express.Request,
	res: express.Response,
	host: string,
	domain: string,
	provider: string,
	subdomain: string,
): void {
	const protocol = getRequestProtocol(req);
	const tenantOrigin = `${protocol}://${host}`;
	const gatewayOrigin = `${protocol}://auth.${domain}`;

	const gatewayUrl = new URL(`/connect/${provider}`, gatewayOrigin);
	gatewayUrl.searchParams.set("tenant", subdomain);
	gatewayUrl.searchParams.set("returnTo", tenantOrigin);

	log.debug({ subdomain, gatewayUrl: gatewayUrl.toString() }, "Redirecting tenant to auth gateway");
	res.redirect(gatewayUrl.toString());
}

/**
 * Create middleware for multi-tenant OAuth connect flow.
 * Handles both auth gateway requests and tenant subdomain redirects.
 *
 * @param domain - The base domain (e.g., "jolli.ai")
 * @returns Express middleware that routes OAuth requests appropriately
 */
export function createMultiTenantConnectMiddleware(domain: string): express.RequestHandler {
	return (req, res, next) => {
		const host = getRequestHost(req);
		if (!host) {
			return next();
		}

		const provider = req.path.split("/")[1]; // e.g., /google -> google
		const isCallback = req.path.includes("/callback");

		// Handle auth gateway requests
		if (isAuthGateway(host, domain)) {
			return handleAuthGatewayConnect(req, res, next, host, domain, provider, isCallback);
		}

		// Handle tenant subdomain redirects to gateway
		const subdomain = getSubdomain(host, domain);
		if (subdomain && provider && !isCallback) {
			return redirectTenantToGateway(req, res, host, domain, provider, subdomain);
		}

		next();
	};
}
