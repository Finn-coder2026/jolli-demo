import { getConfig } from "../config/Config";
import { getGlobalManagerDatabase } from "../core/ManagerDatabase";
import { getTenantContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import { getGlobalTokenUtil } from "../util/TokenUtil";
import type { Request } from "express";
import express, { type Router } from "express";
import type { Tenant, UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Configuration for the tenant router.
 */
export interface TenantRouterConfig {
	/** Whether multi-tenant mode is enabled */
	multiTenantEnabled?: boolean;
	/** Registry client for tenant operations (optional, required for /list endpoint) */
	registryClient?: TenantRegistryClient;
}

/**
 * Tenant validation response.
 */
export interface TenantValidateResponse {
	valid: boolean;
	multiTenantEnabled: boolean;
	tenant?: {
		slug: string;
		displayName: string;
	};
}

/**
 * Item in the tenant list for the switcher.
 */
export interface TenantListItem {
	id: string;
	slug: string;
	displayName: string;
	primaryDomain: string | null;
	/** Default organization ID for this tenant */
	defaultOrgId: string;
}

/**
 * Tenant list response for the tenant switcher.
 */
export interface TenantListResponse {
	/** Whether the tenant switcher feature is enabled */
	useTenantSwitcher: boolean;
	/** Current tenant ID (null if not in multi-tenant mode) */
	currentTenantId: string | null;
	/** Base domain for constructing subdomain URLs */
	baseDomain: string | null;
	/** List of available tenants */
	tenants: Array<TenantListItem>;
}

/**
 * Builds a redirect URL for a tenant mismatch scenario.
 * Used when the URL tenant slug doesn't match the JWT tenant.
 */
function buildTenantRedirectUrl(tenant: Tenant, req: Request): string {
	const appConfig = getConfig();
	const useHttps = appConfig.USE_GATEWAY || appConfig.NODE_ENV === "production";
	const originPort = new URL(appConfig.ORIGIN).port;
	const protocol = useHttps ? "https" : "http";
	const portSuffix = useHttps ? "" : originPort ? `:${originPort}` : "";

	// Priority 1: Custom domain (if feature enabled and domain configured)
	if (tenant.featureFlags?.customDomain === true && tenant.primaryDomain) {
		return `https://${tenant.primaryDomain}`;
	}

	// Priority 2: Subdomain (if feature enabled and base domain configured)
	if (tenant.featureFlags?.subdomain === true && appConfig.BASE_DOMAIN) {
		return `${protocol}://${tenant.slug}.${appConfig.BASE_DOMAIN}${portSuffix}`;
	}

	// Priority 3: Path-based (free tier default)
	if (appConfig.BASE_DOMAIN) {
		return `${protocol}://${appConfig.BASE_DOMAIN}${portSuffix}/${tenant.slug}`;
	}

	// Fallback to current origin with tenant prefix
	const origin = `${req.protocol}://${req.get("host")}`;
	return `${origin}/${tenant.slug}`;
}

/**
 * Creates the tenant router with validation endpoint.
 *
 * When MULTI_TENANT_ENABLED=false:
 *   - Returns 200 with { valid: true, multiTenantEnabled: false }
 *   - No tenant validation performed
 *
 * When MULTI_TENANT_ENABLED=true:
 *   - This router should be mounted AFTER TenantMiddleware
 *   - If request reaches the handler, TenantMiddleware already validated the tenant
 *   - Returns 200 with tenant info from context
 *   - TenantMiddleware handles 404/403 for invalid/inactive tenants
 */
export function createTenantRouter(config?: TenantRouterConfig): Router {
	const router = express.Router();

	// Use provided config or read from environment
	const multiTenantEnabled = config?.multiTenantEnabled ?? getConfig().MULTI_TENANT_ENABLED;

	/**
	 * GET /api/tenant/validate
	 *
	 * Validates whether the current request is for a valid tenant.
	 * Also verifies that the URL tenant matches the JWT tenant for path-based mode.
	 *
	 * In single-tenant mode (MULTI_TENANT_ENABLED=false):
	 *   - Always returns valid
	 *
	 * In multi-tenant mode (MULTI_TENANT_ENABLED=true):
	 *   - If this handler is reached, TenantMiddleware has already validated
	 *   - Additionally checks X-Tenant-Slug header (for path-based mode)
	 *   - Returns 403 with redirectTo if URL tenant doesn't match JWT tenant
	 *   - Returns tenant info from the TenantContext
	 */
	router.get("/validate", (req, res) => {
		if (!multiTenantEnabled) {
			// Single-tenant mode - always valid
			log.debug("Tenant validation: single-tenant mode, returning valid");
			const response: TenantValidateResponse = {
				valid: true,
				multiTenantEnabled: false,
			};
			return res.json(response);
		}

		// Multi-tenant mode - if we reach here, TenantMiddleware passed
		const context = getTenantContext();
		if (!context) {
			// This shouldn't happen if TenantMiddleware is properly mounted
			log.warn("Tenant validation: multi-tenant enabled but no tenant context");
			const response: TenantValidateResponse = {
				valid: true,
				multiTenantEnabled: true,
			};
			return res.json(response);
		}

		// Check X-Tenant-Slug header (sent by frontend for path-based mode)
		// Verify it matches the JWT tenant; redirect if mismatched
		const urlTenantSlug = req.headers["x-tenant-slug"] as string | undefined;
		if (urlTenantSlug && urlTenantSlug !== context.tenant.slug) {
			log.warn("Tenant mismatch: URL tenant=%s, JWT tenant=%s", urlTenantSlug, context.tenant.slug);

			const redirectTo = buildTenantRedirectUrl(context.tenant, req);
			return res.status(403).json({
				error: "Tenant mismatch",
				message: "You are logged into a different workspace",
				redirectTo,
			});
		}

		// Check if accessed via subdomain but tenant doesn't have subdomain feature.
		// Free-tier tenants should use path-based URLs; redirect them accordingly.
		const appConfig = getConfig();
		const hostname = req.hostname ?? req.headers.host?.split(":")[0];
		if (
			hostname &&
			appConfig.BASE_DOMAIN &&
			hostname !== appConfig.BASE_DOMAIN &&
			hostname.endsWith(`.${appConfig.BASE_DOMAIN}`) &&
			!context.tenant.featureFlags?.subdomain
		) {
			const redirectTo = buildTenantRedirectUrl(context.tenant, req);
			log.info(
				"Subdomain access redirect: tenant=%s lacks subdomain feature, redirecting to %s",
				context.tenant.slug,
				redirectTo,
			);
			return res.status(403).json({
				error: "access_mode_redirect",
				message: "This workspace uses path-based URLs",
				redirectTo,
			});
		}

		log.debug("Tenant validation: valid tenant=%s, org=%s", context.tenant.slug, context.org.slug);

		const response: TenantValidateResponse = {
			valid: true,
			multiTenantEnabled: true,
			tenant: {
				slug: context.tenant.slug,
				displayName: context.tenant.displayName ?? context.tenant.slug,
			},
		};
		return res.json(response);
	});

	/**
	 * Get available tenants for user, filtered by user access via user_orgs table.
	 * Falls back to all tenants if user access filtering is not available.
	 */
	async function getAvailableTenantsForUser(userInfo: UserInfo | undefined): Promise<Array<TenantListItem>> {
		const managerDb = getGlobalManagerDatabase();

		if (managerDb && userInfo?.userId) {
			// Get unique tenants with default org (grouping done in SQL for efficiency).
			// Note: primaryDomain is not available from the user_orgs query.
			// This is safe because the TenantSwitcher UI constructs URLs using the tenant slug
			// and baseDomain (e.g., {slug}.{baseDomain}), not primaryDomain.
			const uniqueTenants = await managerDb.userOrgDao.getUniqueTenants(userInfo.userId);
			return uniqueTenants.map(ut => ({
				id: ut.tenantId,
				slug: ut.tenantSlug,
				displayName: ut.tenantName,
				primaryDomain: null,
				defaultOrgId: ut.defaultOrgId,
			}));
		}

		// Fallback: return all tenants (single-tenant mode or no user context)
		if (!config?.registryClient) {
			return [];
		}

		// Single query to get active tenants with their default org (avoids N+1 problem)
		//return config.registryClient.listTenantsWithDefaultOrg();
		return [];
	}

	/**
	 * GET /api/tenant/list
	 *
	 * Returns the list of available tenants for the tenant switcher.
	 * Tenants are filtered by user access via user_orgs table.
	 *
	 * Response includes:
	 * - useTenantSwitcher: Whether the switcher feature is enabled
	 * - currentTenantId: The current tenant's ID (if in multi-tenant mode)
	 * - baseDomain: The base domain for constructing subdomain URLs
	 * - tenants: Array of available tenants with their domain info
	 */
	router.get("/list", async (req, res) => {
		const appConfig = getConfig();
		const useTenantSwitcher = appConfig.USE_TENANT_SWITCHER;
		const baseDomain = appConfig.BASE_DOMAIN || null;

		// If tenant switcher is disabled, return early
		if (!useTenantSwitcher) {
			const response: TenantListResponse = {
				useTenantSwitcher: false,
				currentTenantId: null,
				baseDomain,
				tenants: [],
			};
			return res.json(response);
		}

		// Get current tenant ID if in multi-tenant mode
		const context = getTenantContext();
		const currentTenantId = context?.tenant.id ?? null;

		try {
			// Get tenants filtered by user access
			const tokenUtil = getGlobalTokenUtil();
			const userInfo = tokenUtil?.decodePayload(req);
			const tenants = await getAvailableTenantsForUser(userInfo);
			log.debug("Tenant list: returning %d tenants for user", tenants.length);

			const response: TenantListResponse = {
				useTenantSwitcher,
				currentTenantId,
				baseDomain,
				tenants,
			};
			return res.json(response);
		} catch (error) {
			log.error("Error fetching tenant list: %s", error);
			return res.status(500).json({ error: "Failed to fetch tenant list" });
		}
	});

	return router;
}
