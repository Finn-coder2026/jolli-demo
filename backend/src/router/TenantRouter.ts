import { getConfig } from "../config/Config";
import { getTenantContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { getLog } from "../util/Logger";
import express, { type Router } from "express";
import type { TenantSummary } from "jolli-common";

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
	 *
	 * In single-tenant mode (MULTI_TENANT_ENABLED=false):
	 *   - Always returns valid
	 *
	 * In multi-tenant mode (MULTI_TENANT_ENABLED=true):
	 *   - If this handler is reached, TenantMiddleware has already validated
	 *   - Returns tenant info from the TenantContext
	 */
	router.get("/validate", (_req, res) => {
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
	 * GET /api/tenant/list
	 *
	 * Returns the list of available tenants for the tenant switcher.
	 * Requires the registryClient to be configured.
	 *
	 * Response includes:
	 * - useTenantSwitcher: Whether the switcher feature is enabled
	 * - currentTenantId: The current tenant's ID (if in multi-tenant mode)
	 * - baseDomain: The base domain for constructing subdomain URLs
	 * - tenants: Array of available tenants with their domain info
	 */
	router.get("/list", async (_req, res) => {
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

		// If no registry client configured, return empty list
		if (!config?.registryClient) {
			log.warn("Tenant list requested but no registryClient configured");
			const response: TenantListResponse = {
				useTenantSwitcher,
				currentTenantId,
				baseDomain,
				tenants: [],
			};
			return res.json(response);
		}

		try {
			// Get all active tenants
			const allTenants = await config.registryClient.listTenants();

			// Filter to only active tenants and map to TenantListItem
			const tenants: Array<TenantListItem> = allTenants
				.filter((t: TenantSummary) => t.status === "active")
				.map((t: TenantSummary) => ({
					id: t.id,
					slug: t.slug,
					displayName: t.displayName,
					primaryDomain: t.primaryDomain,
				}));

			log.debug("Tenant list: returning %d active tenants", tenants.length);

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
