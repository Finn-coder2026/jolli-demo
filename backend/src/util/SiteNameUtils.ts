import { getConfig } from "../config/Config";
import { getTenantContext } from "../tenant/TenantContext";
import os from "node:os";

/**
 * Sanitizes a hostname to be a valid GitHub repository name component.
 * - Converts to lowercase
 * - Removes any characters that aren't alphanumeric or hyphens
 * - Trims leading/trailing hyphens
 * - Collapses multiple consecutive hyphens
 *
 * @param hostname - The hostname to sanitize (e.g., "DESKTOP-ABC123")
 * @returns Sanitized string suitable for use in GitHub repo names (e.g., "desktop-abc123")
 */
export function sanitizeHostname(hostname: string): string {
	return hostname
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "")
		.replace(/^-+|-+$/g, "") // Trim leading/trailing hyphens
		.replace(/-+/g, "-"); // Collapse multiple hyphens
}

/**
 * Gets the local machine's hostname.
 *
 * @returns The local machine hostname (e.g., "DESKTOP-ABC123", "aidans-macbook")
 */
export function getLocalHostname(): string {
	return os.hostname();
}

/** Fallback slug when hostname sanitizes to empty string */
const FALLBACK_SLUG = "no-hostname";

/**
 * Gets the tenant slug for use in GitHub repo names.
 *
 * Priority:
 * 1. Tenant slug from TenantContext (when multi-tenancy is active) - sanitized for safety
 * 2. Sanitized local machine hostname (fallback for single-tenant/dev)
 * 3. "no-hostname" fallback if hostname sanitizes to empty
 *
 * @returns The tenant slug to use in GitHub repo names
 */
export function getTenantSlug(): string {
	// 1. Check TenantContext for multi-tenant mode
	const tenantContext = getTenantContext();
	if (tenantContext?.tenant?.slug) {
		// Sanitize tenant slug for safety (in case of malformed data upstream)
		const sanitized = sanitizeHostname(tenantContext.tenant.slug);
		return sanitized || FALLBACK_SLUG;
	}

	// 2. Fall back to sanitized local machine hostname
	const hostname = getLocalHostname();
	const sanitized = sanitizeHostname(hostname);

	// 3. Use fallback if hostname sanitizes to empty (edge case)
	return sanitized || FALLBACK_SLUG;
}

/** Maximum length for GitHub repository names */
const GITHUB_REPO_NAME_MAX_LENGTH = 100;

/**
 * Generates a globally unique GitHub repository name using the tenant-aware format.
 *
 * Format: {envPrefix}{tenantSlug}-{siteName}-{siteId}
 * - Non-prod (local/dev/preview): "local-acme-docs-42", "dev-acme-docs-42"
 * - Prod: "acme-docs-42" (no prefix)
 *
 * This format guarantees global uniqueness because:
 * - tenantSlug is unique across all tenants (or derived from unique hostname)
 * - siteId is unique within the tenant's database
 * - Combined = globally unique, no collision checking needed
 *
 * @param siteName - The user-chosen site name (e.g., "docs")
 * @param siteId - The database ID of the site (e.g., 42)
 * @returns Globally unique GitHub repo name (e.g., "acme-docs-42" or "local-acme-docs-42")
 * @throws Error if the generated name exceeds GitHub's 100 character limit
 */
export function generateGitHubRepoName(siteName: string, siteId: number): string {
	const config = getConfig();
	const tenantSlug = getTenantSlug();
	// Non-prod environments get a prefix, prod gets no prefix
	const envPrefix = config.SITE_ENV !== "prod" ? `${config.SITE_ENV}-` : "";

	// Calculate effective max length for content portion (excluding env prefix)
	const effectiveMaxLength = GITHUB_REPO_NAME_MAX_LENGTH - envPrefix.length;
	const contentPortion = `${tenantSlug}-${siteName}-${siteId}`;

	if (contentPortion.length > effectiveMaxLength) {
		throw new Error(
			`Generated repo name exceeds GitHub's ${GITHUB_REPO_NAME_MAX_LENGTH} character limit: ` +
				`content is ${contentPortion.length} chars, max ${effectiveMaxLength} allowed ` +
				`(env prefix "${envPrefix}" uses ${envPrefix.length} chars)`,
		);
	}

	return `${envPrefix}${contentPortion}`;
}

/**
 * Generates the jolli.site domain for a site.
 *
 * Format: {siteName}-{tenantSlug}.{envSubdomain}{baseDomain}
 * - Non-prod (local/dev/preview): "my-docs-acme.local.jolli.site", "my-docs-acme.dev.jolli.site"
 * - Prod: "my-docs-acme.jolli.site" (no env subdomain)
 *
 * This mirrors the tenant-aware structure used in GitHub repo names,
 * but with siteName first for nicer URLs.
 *
 * @param siteName - The user-chosen site name (e.g., "my-docs")
 * @param baseDomain - The base domain from config (e.g., "jolli.site")
 * @returns The full jolli.site domain (e.g., "my-docs-acme.jolli.site" or "my-docs-acme.local.jolli.site")
 */
export function generateJolliSiteDomain(siteName: string, baseDomain: string): string {
	const config = getConfig();
	const tenantSlug = getTenantSlug();
	// Non-prod environments get a subdomain, prod gets none
	const envSubdomain = config.SITE_ENV !== "prod" ? `${config.SITE_ENV}.` : "";
	return `${siteName}-${tenantSlug}.${envSubdomain}${baseDomain}`;
}
