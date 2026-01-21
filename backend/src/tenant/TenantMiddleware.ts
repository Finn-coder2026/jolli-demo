import type { Database } from "../core/Database";
import { getLog } from "../util/Logger";
import { resolveCustomDomain, resolveSubdomain } from "./DomainUtils";
import { createTenantOrgContext, runWithTenantContext } from "./TenantContext";
import type { TenantOrgConnectionManager } from "./TenantOrgConnectionManager";
import type { TenantRegistryClient } from "./TenantRegistryClient";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Org, Tenant } from "jolli-common";

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
	/**
	 * Default database for the "jolli" tenant fallback.
	 * When accessing the base domain and "jolli" is not in the registry,
	 * this database is used with default Tenant/Org objects.
	 */
	defaultDatabase: Database;
}

/** Default tenant for base domain when "jolli" is not in registry */
const DEFAULT_JOLLI_TENANT: Tenant = {
	id: "00000000-0000-0000-0000-000000000000",
	slug: "jolli",
	displayName: "Jolli",
	status: "active",
	deploymentType: "shared",
	databaseProviderId: "default",
	configs: {},
	configsUpdatedAt: null,
	featureFlags: {},
	primaryDomain: null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
	provisionedAt: new Date(0),
};

/** Default org for base domain when "jolli" is not in registry */
const DEFAULT_JOLLI_ORG: Org = {
	id: "00000000-0000-0000-0000-000000000001",
	tenantId: "00000000-0000-0000-0000-000000000000",
	slug: "default",
	displayName: "Default",
	schemaName: "public",
	status: "active",
	isDefault: true,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

/**
 * Tenant resolution result from headers.
 */
interface TenantResolution {
	tenantSlug: string;
	orgSlug: string | undefined;
}

/**
 * Creates Express middleware that resolves tenant and org from custom domain, URL subdomain,
 * or request headers, establishes a database connection, and wraps the request in a TenantOrgContext.
 *
 * Request flow:
 * 1. Check if request is for a custom domain (verified domain in tenant_domains)
 * 2. If custom domain found, use that tenant/org
 * 3. Otherwise, try to extract tenant/org from URL subdomain (e.g., acme.jolli.app or engineering.acme.jolli.app)
 * 4. If no subdomain match, extract tenant slug from X-Tenant-Slug header and org from X-Org-Slug header
 * 5. Look up tenant from registry
 * 6. Look up org from registry (by slug or get default)
 * 7. Get database connection from connection manager
 * 8. Run remainder of request in TenantOrgContext
 *
 * Error responses:
 * - 404: Unable to determine tenant from URL, Tenant not found, Org not found, Custom domain not found
 * - 403: Tenant/Org not active
 */
export function createTenantMiddleware(config: TenantMiddlewareConfig): RequestHandler {
	const { registryClient, connectionManager, defaultDatabase } = config;
	const tenantHeader = config.tenantHeader ?? "x-tenant-slug";
	const orgHeader = config.orgHeader ?? "x-org-slug";
	const baseDomain = config.baseDomain;

	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			// 1. Check for custom domain first
			const customDomain = resolveCustomDomain(req, baseDomain);
			if (customDomain) {
				// Custom domain resolution
				const domainResult = await registryClient.getTenantByDomain(customDomain.domain);
				if (!domainResult) {
					log.warn("Custom domain not found or not verified: %s", customDomain.domain);
					res.status(404).json({ error: `Custom domain not configured: ${customDomain.domain}` });
					return;
				}

				const { tenant, org } = domainResult;

				// Verify org is active (tenant is already verified as active in the query)
				if (org.status !== "active") {
					log.warn("Org not active for custom domain: %s (status: %s)", org.slug, org.status);
					res.status(403).json({ error: `Org is not active: ${org.slug}` });
					return;
				}

				// Get database connection and create context
				const database = await connectionManager.getConnection(tenant, org);
				const context = createTenantOrgContext(tenant, org, database);

				log.debug(
					"Established tenant context via custom domain: domain=%s, tenant=%s, org=%s, schema=%s",
					customDomain.domain,
					tenant.slug,
					org.slug,
					org.schemaName,
				);

				runWithTenantContext(context, () => {
					next();
				});
				return;
			}

			// 2. Try subdomain resolution (e.g., acme.jolli.app or engineering.acme.jolli.app)
			const subdomain = resolveSubdomain(req, baseDomain);

			// 3. If subdomain resolved tenant but no org, check for X-Org-Slug header
			let resolution = subdomain;
			if (resolution && !resolution.orgSlug) {
				const orgSlugHeader = req.headers[orgHeader];
				if (typeof orgSlugHeader === "string") {
					resolution = { ...resolution, orgSlug: orgSlugHeader };
				}
			}

			// 4. Fall back to header-based resolution if subdomain resolution didn't match
			if (!resolution) {
				resolution = resolveTenantFromHeaders(req, tenantHeader, orgHeader);
			}
			if (!resolution) {
				log.debug("Unable to determine tenant from URL or headers");
				res.status(404).json({ error: "Unable to determine tenant from URL" });
				return;
			}

			const { tenantSlug, orgSlug } = resolution;

			// 5. Look up tenant
			const tenant = await registryClient.getTenantBySlug(tenantSlug);
			if (!tenant) {
				// Special case: "jolli" tenant can fall back to default database
				// This allows the base domain to work without a registry entry
				if (tenantSlug === "jolli") {
					const context = createTenantOrgContext(DEFAULT_JOLLI_TENANT, DEFAULT_JOLLI_ORG, defaultDatabase);
					runWithTenantContext(context, () => {
						next();
					});
					return;
				}

				log.warn("Tenant not found: %s", tenantSlug);
				res.status(404).json({ error: `Tenant not found: ${tenantSlug}` });
				return;
			}

			// 6. Verify tenant is active
			if (tenant.status !== "active") {
				log.warn("Tenant not active: %s (status: %s)", tenantSlug, tenant.status);
				res.status(403).json({ error: `Tenant is not active: ${tenantSlug}` });
				return;
			}

			// 7. Look up org
			const org = orgSlug
				? await registryClient.getOrgBySlug(tenant.id, orgSlug)
				: await registryClient.getDefaultOrg(tenant.id);

			if (!org) {
				const orgDesc = orgSlug ?? "default";
				log.warn("Org not found: %s for tenant %s", orgDesc, tenantSlug);
				res.status(404).json({ error: `Org not found: ${orgDesc}` });
				return;
			}

			// 8. Verify org is active
			if (org.status !== "active") {
				log.warn("Org not active: %s (status: %s)", org.slug, org.status);
				res.status(403).json({ error: `Org is not active: ${org.slug}` });
				return;
			}

			// 9. Get database connection
			const database = await connectionManager.getConnection(tenant, org);

			// 10. Create context and run request handler
			const context = createTenantOrgContext(tenant, org, database);

			log.debug(
				"Established tenant context: tenant=%s, org=%s, schema=%s",
				tenant.slug,
				org.slug,
				org.schemaName,
			);

			// Use runWithTenantContext to wrap the rest of the middleware chain
			runWithTenantContext(context, () => {
				next();
			});
		} catch (error) {
			log.error(error, "Error in tenant middleware");
			res.status(500).json({ error: "Internal server error" });
		}
	};
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
