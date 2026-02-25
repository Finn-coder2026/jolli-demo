import type { Request } from "express";

/**
 * Custom domain resolution result.
 */
export interface CustomDomainResolution {
	domain: string;
}

/**
 * Subdomain resolution result from URL.
 */
export interface SubdomainResolution {
	tenantSlug: string;
	orgSlug: string | undefined;
}

/**
 * Extract hostname from request, handling both req.hostname and host header.
 */
export function getHostname(req: Request): string | undefined {
	return req.hostname ?? req.headers.host?.split(":")[0];
}

/**
 * Check if the request is for a custom domain (not the base domain or its subdomains).
 *
 * @param req - Express request
 * @param baseDomain - The base domain for subdomain tenants (e.g., "jolli.app")
 * @returns Custom domain if detected, undefined if it's a subdomain request
 */
export function resolveCustomDomain(req: Request, baseDomain: string | undefined): CustomDomainResolution | undefined {
	if (!baseDomain) {
		// No base domain configured, so custom domain lookup is disabled
		return;
	}

	const host = getHostname(req);
	if (!host) {
		return;
	}

	// Check if this is a subdomain of the base domain (e.g., acme.jolli.app)
	// If so, it's not a custom domain - we use subdomain resolution
	if (host === baseDomain || host.endsWith(`.${baseDomain}`)) {
		return;
	}

	// This is a custom domain
	return { domain: host.toLowerCase() };
}

/**
 * Extract tenant and org slugs from the subdomain of a baseDomain URL.
 *
 * This function is called only after resolveCustomDomain returns undefined,
 * meaning the host is guaranteed to be either the base domain or a subdomain of it.
 *
 * If the host is the bare base domain (e.g., "jolli.app"), this returns undefined
 * since there is no subdomain to extract (path-based tenancy is handled by the frontend).
 *
 * Examples (with baseDomain = "jolli.app"):
 * - "jolli.app" -> undefined (bare base domain, no subdomain)
 * - "acme.jolli.app" -> { tenantSlug: "acme", orgSlug: undefined }
 * - "engineering.acme.jolli.app" -> { tenantSlug: "acme", orgSlug: "engineering" }
 * - "a.b.c.jolli.app" -> { tenantSlug: "c", orgSlug: "b" }
 *
 * @param req - Express request
 * @param baseDomain - The base domain (e.g., "jolli.app")
 * @returns Subdomain resolution if URL has a subdomain, undefined if bare base domain
 */
export function resolveSubdomain(req: Request, baseDomain: string | undefined): SubdomainResolution | undefined {
	if (!baseDomain) {
		return;
	}

	const host = getHostname(req)?.toLowerCase();
	if (!host) {
		return;
	}

	// Bare baseDomain (e.g., "jolli.app") -> no subdomain to extract
	if (host === baseDomain) {
		return;
	}

	// Check if host is a subdomain of baseDomain
	if (!host.endsWith(`.${baseDomain}`)) {
		return;
	}

	// Extract subdomain prefix (e.g., "acme" from "acme.jolli.app")
	const suffix = `.${baseDomain}`;
	const prefix = host.slice(0, -suffix.length);
	const parts = prefix.split(".");

	if (parts.length === 1) {
		// Skip reserved subdomains (auth gateway, API endpoints, etc.)
		const reservedSubdomains = ["auth", "api", "www"];
		if (reservedSubdomains.includes(parts[0])) {
			return;
		}
		// tenant.jolli.app
		return { tenantSlug: parts[0], orgSlug: undefined };
	}

	// org.tenant.jolli.app (or deeper nesting - use last two parts)
	return {
		tenantSlug: parts[parts.length - 1],
		orgSlug: parts[parts.length - 2],
	};
}

/**
 * Check if hostname is a valid subdomain of baseDomain (or equals baseDomain).
 *
 * @param hostname - The hostname to check
 * @param baseDomain - The base domain (e.g., "jolli.app")
 * @returns true if hostname equals baseDomain or ends with .baseDomain
 */
export function isSubdomainOf(hostname: string, baseDomain: string): boolean {
	return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
}

/**
 * Options for constructing a tenant origin URL.
 */
export interface TenantOriginOptions {
	/** The tenant's primary custom domain (e.g., "docs.acme.com") */
	primaryDomain: string | null;
	/** The tenant's slug (e.g., "acme") */
	tenantSlug: string;
	/** The base domain for subdomains (e.g., "jolli.app") */
	baseDomain: string | undefined;
	/** Whether to use HTTPS (gateway mode) */
	useHttps: boolean;
	/** Port to include when not using HTTPS (e.g., "8034"). Can be undefined or empty string to omit port. */
	port: string | undefined;
	/** Fallback origin if no domain can be constructed */
	fallbackOrigin: string;
}

/**
 * Construct the origin URL for a tenant.
 *
 * Priority:
 * 1. Custom primary domain (always HTTPS)
 * 2. Subdomain of baseDomain (protocol/port based on useHttps)
 * 3. Fallback origin
 *
 * @param options - Configuration for constructing the origin
 * @returns The origin URL (e.g., "https://docs.acme.com" or "https://acme.jolli.app")
 */
export function getTenantOrigin(options: TenantOriginOptions): string {
	const { primaryDomain, tenantSlug, baseDomain, useHttps, port, fallbackOrigin } = options;

	// Priority 1: Custom primary domain (always HTTPS)
	if (primaryDomain) {
		return `https://${primaryDomain}`;
	}

	// Priority 2: Subdomain of baseDomain
	if (baseDomain) {
		const protocol = useHttps ? "https" : "http";
		const portSuffix = useHttps ? "" : port ? `:${port}` : "";
		return `${protocol}://${tenantSlug}.${baseDomain}${portSuffix}`;
	}

	// Priority 3: Fallback origin
	return fallbackOrigin;
}
