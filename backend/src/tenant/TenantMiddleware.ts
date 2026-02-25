import type { Database } from "../core/Database";
import { clearAuthCookie } from "../util/Cookies";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import { resolveCustomDomain, resolveSubdomain } from "./DomainUtils";
import { createTenantOrgContext, runWithTenantContext } from "./TenantContext";
import type { TenantOrgConnectionManager } from "./TenantOrgConnectionManager";
import type { TenantRegistryClient } from "./TenantRegistryClient";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Org, Tenant, UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Configuration for tenant middleware.
 */
export interface TenantMiddlewareConfig {
	/** Client for querying the tenant registry */
	registryClient: TenantRegistryClient;
	/** Manager for tenant-org database connections */
	connectionManager: TenantOrgConnectionManager;
	/** Header name for tenant slug (default: "x-tenant-slug") */
	tenantHeader?: string;
	/** Header name for org slug (default: "x-org-slug") */
	orgHeader?: string;
	/** Base domain for subdomain tenants (e.g., "jolli.app") - if host doesn't match, treat as custom domain */
	baseDomain?: string;
	/** Token utility for decoding JWT to extract tenantId/orgId */
	tokenUtil?: TokenUtil<UserInfo>;
	/**
	 * Auth gateway origin for redirect on tenant not found (e.g., "https://auth.jolli.app").
	 * When set, 404 responses for "tenant not found" will include a redirectTo field.
	 */
	authGatewayOrigin?: string;
}

/** Tenant resolution result from headers/subdomain */
interface TenantResolution {
	tenantSlug: string;
	orgSlug: string | undefined;
}

/** Parsed URL information (computed once per request) */
interface ParsedUrlInfo {
	customDomain: ReturnType<typeof resolveCustomDomain>;
	subdomain: ReturnType<typeof resolveSubdomain>;
}

/** Resolution result with tenant, org, and database */
interface ResolvedContext {
	tenant: Tenant;
	org: Org;
	database: Database;
}

/** Error result for resolution failures */
interface ResolutionError {
	status: number;
	message: string;
}

/** Error result for tenant mismatch (JWT tenant differs from URL tenant) */
interface TenantMismatchError {
	status: 403;
	message: string;
	redirectTo: string;
}

/** Union type for resolution results */
type ResolutionResult = ResolvedContext | ResolutionError | TenantMismatchError | undefined;

/** Type guard for ResolutionError (excludes TenantMismatchError) */
function isResolutionError(result: ResolutionResult): result is ResolutionError {
	return result !== undefined && "status" in result && "message" in result && !("redirectTo" in result);
}

/** Type guard for TenantMismatchError */
function isTenantMismatchError(result: ResolutionResult): result is TenantMismatchError {
	return result !== undefined && "status" in result && "redirectTo" in result;
}

/** Type guard for ResolvedContext */
function isResolvedContext(result: ResolutionResult): result is ResolvedContext {
	return result !== undefined && "tenant" in result && "org" in result && "database" in result;
}

/**
 * Creates Express middleware that resolves tenant and org from JWT token, custom domain,
 * URL subdomain, or request headers, establishes a database connection, and wraps
 * the request in a TenantOrgContext.
 *
 * Resolution priority:
 * 1. JWT token (tenantId/orgId from auth token)
 * 2. Custom domain (verified domain in tenant_domains)
 * 3. URL subdomain (e.g., acme.jolli.app or engineering.acme.jolli.app)
 * 4. Request headers (X-Tenant-Slug, X-Org-Slug)
 *
 * Error responses:
 * - 404: Unable to determine tenant from URL, Tenant not found, Org not found, Custom domain not found
 * - 403: Tenant/Org not active
 */
export function createTenantMiddleware(config: TenantMiddlewareConfig): RequestHandler {
	const { registryClient, connectionManager, tokenUtil, authGatewayOrigin } = config;
	const tenantHeader = config.tenantHeader ?? "x-tenant-slug";
	const orgHeader = config.orgHeader ?? "x-org-slug";
	const baseDomain = config.baseDomain;

	// Build auth gateway login URL if origin is configured
	const authGatewayLoginUrl = authGatewayOrigin ? `${authGatewayOrigin}/login` : undefined;

	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			// Parse URL information once at the beginning
			const urlInfo: ParsedUrlInfo = {
				customDomain: resolveCustomDomain(req, baseDomain),
				subdomain: resolveSubdomain(req, baseDomain),
			};

			// Try each resolution method in priority order:
			// 1. JWT token (authenticated user's tenant)
			// 2. Custom domain (verified domain with URL rewriting)
			// 3. Subdomain/headers (tenant.domain or X-Tenant-Slug header)
			// Note: Path-based tenant resolution (/{tenant}/path) is handled by the frontend;
			// the backend uses JWT for all authenticated requests and /api/tenant/validate
			// checks X-Tenant-Slug header for path-based tenant mismatch detection.
			const result =
				(await tryJwtResolution(req, urlInfo, baseDomain, tokenUtil, registryClient, connectionManager)) ??
				(await tryCustomDomainResolution(req, urlInfo, registryClient, connectionManager)) ??
				(await trySlugResolution(req, urlInfo, tenantHeader, orgHeader, registryClient, connectionManager));

			// Handle tenant mismatch (JWT tenant differs from URL tenant)
			if (isTenantMismatchError(result)) {
				res.status(result.status).json({ error: result.message, redirectTo: result.redirectTo });
				return;
			}

			// Handle resolution error
			if (isResolutionError(result)) {
				// Clear auth cookie for session_invalid errors to prevent redirect loops
				if (result.status === 401 && result.message === "session_invalid") {
					clearAuthCookie(res);
				}
				// Include redirectTo for 404 errors (tenant not found)
				if (result.status === 404 && authGatewayLoginUrl) {
					res.status(result.status).json({ error: result.message, redirectTo: authGatewayLoginUrl });
					return;
				}
				res.status(result.status).json({ error: result.message });
				return;
			}

			// Handle no resolution found
			if (!isResolvedContext(result)) {
				// If the request has no auth credentials (no JWT cookie, no Authorization header),
				// the real problem is "not authenticated", not "tenant not found". Return 401 so
				// the frontend's checkUnauthorized callback can trigger a login redirect.
				if (!hasAuthCredentials(req)) {
					log.debug("No tenant resolved and no auth credentials — returning 401");
					res.status(401).json({ error: "Not authorized" });
					return;
				}

				log.debug("Unable to determine tenant from URL or headers");
				if (authGatewayLoginUrl) {
					res.status(404).json({
						error: "Unable to determine tenant from URL",
						redirectTo: authGatewayLoginUrl,
					});
				} else {
					res.status(404).json({ error: "Unable to determine tenant from URL" });
				}
				return;
			}

			// Establish context and continue
			const { tenant, org, database } = result;
			const context = createTenantOrgContext(tenant, org, database);
			runWithTenantContext(context, () => next());
		} catch (error) {
			log.error(error, "Error in tenant middleware");
			res.status(500).json({ error: "Internal server error" });
		}
	};
}

/**
 * Try to resolve tenant/org from JWT token.
 *
 * If JWT tenant differs from URL tenant (subdomain or custom domain), returns a mismatch error
 * with redirect URL to the correct tenant domain.
 */
async function tryJwtResolution(
	req: Request,
	urlInfo: ParsedUrlInfo,
	baseDomain: string | undefined,
	tokenUtil: TokenUtil<UserInfo> | undefined,
	registryClient: TenantRegistryClient,
	connectionManager: TenantOrgConnectionManager,
): Promise<ResolutionResult> {
	if (!tokenUtil) {
		return;
	}

	const userInfo = tokenUtil.decodePayload(req);
	if (!userInfo?.tenantId || !userInfo?.orgId) {
		return;
	}

	const { tenantId, orgId } = userInfo;

	const tenant = await registryClient.getTenant(tenantId);
	if (!tenant) {
		log.warn("Tenant from JWT not found (deleted?): %s", tenantId);
		// Return special error to indicate session is invalid and user should re-login
		return { status: 401, message: "session_invalid" };
	}

	const org = await registryClient.getOrg(orgId);
	if (!org) {
		log.warn("Org from JWT not found (deleted?): %s", orgId);
		// Return special error to indicate session is invalid and user should re-login
		return { status: 401, message: "session_invalid" };
	}

	if (org.tenantId !== tenant.id) {
		log.warn("Org %s does not belong to tenant %s", orgId, tenantId);
		// Return special error to indicate session is invalid and user should re-login
		return { status: 401, message: "session_invalid" };
	}

	const activeCheck = checkTenantOrgActive(tenant, org);
	if (activeCheck) {
		return activeCheck;
	}

	// Check for tenant mismatch: JWT tenant vs URL tenant
	const mismatchError = checkTenantMismatch(req, urlInfo, tenant, baseDomain);
	if (mismatchError) {
		return mismatchError;
	}

	const database = await connectionManager.getConnection(tenant, org);
	log.debug(
		"Established tenant context via JWT: tenant=%s, org=%s, schema=%s",
		tenant.slug,
		org.slug,
		org.schemaName,
	);
	return { tenant, org, database };
}

/**
 * Try to resolve tenant/org from custom domain.
 * Implements URL rewriting: injects tenant slug into the request path.
 */
async function tryCustomDomainResolution(
	req: Request,
	urlInfo: ParsedUrlInfo,
	registryClient: TenantRegistryClient,
	connectionManager: TenantOrgConnectionManager,
): Promise<ResolutionResult> {
	const customDomain = urlInfo.customDomain;
	if (!customDomain) {
		return;
	}

	const domainResult = await registryClient.getTenantByDomain(customDomain.domain);
	if (!domainResult) {
		log.warn("Custom domain not found or not verified: %s", customDomain.domain);
		return { status: 404, message: `Custom domain not configured: ${customDomain.domain}` };
	}

	const { tenant, org } = domainResult;

	// Tenant is already verified as active in the query, only check org
	if (org.status !== "active") {
		log.warn("Org not active for custom domain: %s (status: %s)", org.slug, org.status);
		return { status: 403, message: `Org is not active: ${org.slug}` };
	}

	// 🔑 URL Rewriting: Inject tenant slug into request URL
	// External: https://docs.acme.com/article-123
	// Internal: /:tenant/article-123 (tenant auto-injected)
	// Note: Only modify req.url; req.path is read-only and derived from req.url
	const originalPath = req.path;
	const queryStart = req.url.indexOf("?");
	const queryString = queryStart !== -1 ? req.url.substring(queryStart) : "";
	const rewrittenPath = `/${tenant.slug}${originalPath}`;
	req.url = rewrittenPath + queryString;

	const database = await connectionManager.getConnection(tenant, org);
	log.debug(
		"Established tenant context via custom domain (URL rewritten): domain=%s, tenant=%s, org=%s, schema=%s, originalPath=%s, rewrittenPath=%s",
		customDomain.domain,
		tenant.slug,
		org.slug,
		org.schemaName,
		originalPath,
		rewrittenPath,
	);
	return { tenant, org, database };
}

/**
 * Try to resolve tenant/org from subdomain or headers.
 */
async function trySlugResolution(
	req: Request,
	urlInfo: ParsedUrlInfo,
	tenantHeader: string,
	orgHeader: string,
	registryClient: TenantRegistryClient,
	connectionManager: TenantOrgConnectionManager,
): Promise<ResolutionResult> {
	// Try subdomain resolution first
	let resolution = urlInfo.subdomain;

	// If subdomain resolved tenant but no org, check for X-Org-Slug header
	if (resolution && !resolution.orgSlug) {
		const orgSlugHeader = req.headers[orgHeader];
		if (typeof orgSlugHeader === "string") {
			resolution = { ...resolution, orgSlug: orgSlugHeader };
		}
	}

	// Fall back to header-based resolution
	if (!resolution) {
		resolution = resolveTenantFromHeaders(req, tenantHeader, orgHeader);
	}

	if (!resolution) {
		return;
	}

	return await resolveFromSlug(resolution, registryClient, connectionManager);
}

/**
 * Resolve tenant/org from slug resolution result.
 */
async function resolveFromSlug(
	resolution: TenantResolution,
	registryClient: TenantRegistryClient,
	connectionManager: TenantOrgConnectionManager,
): Promise<ResolutionResult> {
	const { tenantSlug, orgSlug } = resolution;

	// Look up tenant
	const tenant = await registryClient.getTenantBySlug(tenantSlug);
	if (!tenant) {
		log.warn("Tenant not found: %s", tenantSlug);
		return { status: 404, message: `Tenant not found: ${tenantSlug}` };
	}

	if (tenant.status !== "active") {
		log.warn("Tenant not active: %s (status: %s)", tenantSlug, tenant.status);
		return { status: 403, message: `Tenant is not active: ${tenantSlug}` };
	}

	// Look up org
	const org = orgSlug
		? await registryClient.getOrgBySlug(tenant.id, orgSlug)
		: await registryClient.getDefaultOrg(tenant.id);

	if (!org) {
		const orgDesc = orgSlug ?? "default";
		log.warn("Org not found: %s for tenant %s", orgDesc, tenantSlug);
		return { status: 404, message: `Org not found: ${orgDesc}` };
	}

	if (org.status !== "active") {
		log.warn("Org not active: %s (status: %s)", org.slug, org.status);
		return { status: 403, message: `Org is not active: ${org.slug}` };
	}

	const database = await connectionManager.getConnection(tenant, org);
	log.debug("Established tenant context: tenant=%s, org=%s, schema=%s", tenant.slug, org.slug, org.schemaName);
	return { tenant, org, database };
}

/**
 * Check if JWT tenant matches URL tenant.
 * Returns a mismatch error with redirect URL if they don't match, undefined otherwise.
 */
function checkTenantMismatch(
	req: Request,
	urlInfo: ParsedUrlInfo,
	jwtTenant: Tenant,
	baseDomain: string | undefined,
): TenantMismatchError | undefined {
	// Priority 1: Check custom domain (highest specificity)
	if (urlInfo.customDomain) {
		const tenantPrimaryDomain = jwtTenant.primaryDomain?.toLowerCase();
		if (tenantPrimaryDomain !== urlInfo.customDomain.domain) {
			const redirectTo = buildTenantRedirectUrl(jwtTenant, baseDomain, req);
			log.warn(
				"Tenant mismatch: JWT tenant=%s (domain=%s), URL domain=%s, redirecting to %s",
				jwtTenant.slug,
				tenantPrimaryDomain ?? "none",
				urlInfo.customDomain.domain,
				redirectTo,
			);
			return { status: 403, message: "tenant_mismatch", redirectTo };
		}
		return; // Custom domain matched, no mismatch
	}

	// Priority 2: Check subdomain
	if (urlInfo.subdomain) {
		if (urlInfo.subdomain.tenantSlug !== jwtTenant.slug) {
			const redirectTo = buildTenantRedirectUrl(jwtTenant, baseDomain, req);
			log.warn(
				"Tenant mismatch: JWT tenant=%s, URL subdomain tenant=%s, redirecting to %s",
				jwtTenant.slug,
				urlInfo.subdomain.tenantSlug,
				redirectTo,
			);
			return { status: 403, message: "tenant_mismatch", redirectTo };
		}
		return; // Subdomain matched, no mismatch
	}

	// No tenant resolution from URL - allow (might be accessing auth endpoints, etc.)
	return;
}

/**
 * Build a redirect URL for a tenant based on its feature flags.
 * Returns only the tenant base URL (no page path). Since this middleware is
 * mounted at /api, req.path is an API path — the frontend is responsible for
 * appending the correct page path from window.location.pathname.
 *
 * Priority (respecting feature flags):
 * 1. Custom domain (if customDomain feature enabled and primaryDomain set)
 * 2. Subdomain (if subdomain feature enabled)
 * 3. Path-based (default for free tier - returns base domain + tenant slug)
 *
 * @param tenant The tenant to build URL for
 * @param baseDomain The base domain for multi-tenant mode
 * @param req The Express request (used for protocol)
 * @returns Tenant base URL without page path
 */
function buildTenantRedirectUrl(tenant: Tenant, baseDomain: string | undefined, req: Request): string {
	const protocol = req.protocol || "https";

	// NOTE: Do NOT include req.path in the redirect URL. Since TenantMiddleware is
	// mounted at /api, req.path is always an API path (e.g. /tenant/validate), not
	// the user's page path. The frontend handles appending the correct page path
	// from window.location.pathname.

	// Check if custom domain is enabled AND tenant has a primary domain
	if (tenant.featureFlags?.customDomain === true && tenant.primaryDomain) {
		return `https://${tenant.primaryDomain}`;
	}

	// Check if subdomain is enabled (Pro+ tier)
	if (tenant.featureFlags?.subdomain === true && baseDomain) {
		return `${protocol}://${tenant.slug}.${baseDomain}`;
	}

	// Default: Path-based URL (Free tier) - tenant slug prefix only
	if (baseDomain) {
		return `${protocol}://${baseDomain}/${tenant.slug}`;
	}

	// Fallback - shouldn't happen in multi-tenant mode
	/* v8 ignore next 2 */
	return "";
}

/**
 * Check if tenant and org are active.
 * Returns an error if either is not active, undefined otherwise.
 */
function checkTenantOrgActive(tenant: Tenant, org: Org): ResolutionError | undefined {
	if (tenant.status !== "active") {
		log.warn("Tenant not active: %s (status: %s)", tenant.slug, tenant.status);
		return { status: 403, message: `Tenant is not active: ${tenant.slug}` };
	}
	if (org.status !== "active") {
		log.warn("Org not active: %s (status: %s)", org.slug, org.status);
		return { status: 403, message: `Org is not active: ${org.slug}` };
	}
	return;
}

/**
 * Check if the request carries any authentication credentials.
 * Returns true if an auth cookie or Authorization header is present.
 */
function hasAuthCredentials(req: Request): boolean {
	return !!(req.cookies?.authToken || req.headers?.authorization);
}

/**
 * Extract tenant and org slugs from request headers.
 */
function resolveTenantFromHeaders(req: Request, tenantHeader: string, orgHeader: string): TenantResolution | undefined {
	const tenantSlug = req.headers[tenantHeader];
	if (!tenantSlug || typeof tenantSlug !== "string") {
		return;
	}

	const orgSlug = req.headers[orgHeader];
	return {
		tenantSlug,
		orgSlug: typeof orgSlug === "string" ? orgSlug : undefined,
	};
}
