import type { UrlMode } from "../contexts/TenantContext";

/**
 * UrlBuilder - Utility class for generating URLs based on the current domain type.
 *
 * Handles three URL modes:
 * 1. Path-based: jolli.ai/tenant/path (default for free tier)
 * 2. Subdomain: tenant.jolli.ai/path (enterprise tier)
 * 3. Custom domain: docs.acme.com/path (enterprise tier with custom domain)
 *
 * @example
 * ```typescript
 * const builder = new UrlBuilder({
 *   urlMode: 'path',
 *   tenantSlug: 'acme',
 *   baseDomain: 'jolli.ai',
 *   isCustomDomain: false,
 *   isSubdomain: false,
 * });
 *
 * builder.buildUrl('/dashboard');
 * // Path mode: '/acme/dashboard'
 * // Subdomain mode: '/dashboard'
 * // Custom domain mode: '/dashboard'
 *
 * builder.buildAbsoluteUrl('/dashboard');
 * // Path mode: 'https://jolli.ai/acme/dashboard'
 * // Subdomain mode: 'https://acme.jolli.ai/dashboard'
 * // Custom domain mode: 'https://docs.acme.com/dashboard'
 * ```
 */

export interface UrlBuilderConfig {
	/** Current URL mode (path/subdomain/custom) */
	urlMode: UrlMode;
	/** Current tenant slug */
	tenantSlug: string | null;
	/** Base domain (e.g., "jolli.ai") */
	baseDomain: string | null;
	/** Whether the current domain is a custom domain */
	isCustomDomain: boolean;
	/** Whether the current domain is a subdomain */
	isSubdomain: boolean;
}

export class UrlBuilder {
	private config: UrlBuilderConfig;

	constructor(config: UrlBuilderConfig) {
		this.config = config;
	}

	/**
	 * Build a relative URL for the given path.
	 * Automatically adds tenant prefix for path-based mode.
	 *
	 * @param path - The path to build URL for (e.g., '/dashboard', '/api/docs')
	 * @returns The relative URL
	 */
	buildUrl(path: string): string {
		// Ensure path starts with /
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;

		// Path-based mode: add tenant prefix
		if (this.config.urlMode === "path" && this.config.tenantSlug) {
			return `/${this.config.tenantSlug}${normalizedPath}`;
		}

		// Subdomain and custom domain modes: no tenant prefix
		return normalizedPath;
	}

	/**
	 * Build an absolute URL for the given path.
	 * Useful for sharing links, redirects, or external navigation.
	 *
	 * @param path - The path to build URL for (e.g., '/dashboard', '/api/docs')
	 * @returns The absolute URL (e.g., 'https://jolli.ai/acme/dashboard')
	 */
	buildAbsoluteUrl(path: string): string {
		const origin = this.getOrigin();
		const relativePath = this.buildUrl(path);
		return `${origin}${relativePath}`;
	}

	/**
	 * Get the origin URL for the current domain type.
	 *
	 * @returns The origin (protocol + domain)
	 */
	private getOrigin(): string {
		const protocol = window.location.protocol;
		const hostname = window.location.hostname;

		// Custom domain: use current hostname
		if (this.config.isCustomDomain) {
			return `${protocol}//${hostname}`;
		}

		// Subdomain: use tenant.baseDomain
		if (this.config.isSubdomain && this.config.tenantSlug && this.config.baseDomain) {
			const port = window.location.port;
			const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
			return `${protocol}//${this.config.tenantSlug}.${this.config.baseDomain}${portSuffix}`;
		}

		// Path-based: use base domain
		if (this.config.baseDomain) {
			const port = window.location.port;
			const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";
			return `${protocol}//${this.config.baseDomain}${portSuffix}`;
		}

		// Fallback: use current origin
		return window.location.origin;
	}

	/**
	 * Build a URL for switching to a different tenant.
	 * Useful for tenant switcher functionality.
	 *
	 * @param targetTenantSlug - The slug of the tenant to switch to
	 * @param path - Optional path to navigate to after switching (defaults to '/dashboard')
	 * @returns The absolute URL for the target tenant
	 */
	buildTenantSwitchUrl(targetTenantSlug: string, path = "/dashboard"): string {
		const protocol = window.location.protocol;
		const port = window.location.port;
		const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";

		// Normalize path
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;

		// For path-based default, use path mode
		if (this.config.baseDomain) {
			return `${protocol}//${this.config.baseDomain}${portSuffix}/${targetTenantSlug}${normalizedPath}`;
		}

		// Fallback
		return `${protocol}//${window.location.hostname}${portSuffix}/${targetTenantSlug}${normalizedPath}`;
	}
}

/**
 * Create a UrlBuilder instance from TenantContext values.
 *
 * @param config - Configuration from TenantContext
 * @returns A new UrlBuilder instance
 */
export function createUrlBuilder(config: UrlBuilderConfig): UrlBuilder {
	return new UrlBuilder(config);
}
