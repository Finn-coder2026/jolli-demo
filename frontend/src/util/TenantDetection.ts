/**
 * Tenant detection utilities for multi-tenant architecture.
 *
 * Supports three modes:
 * 1. Path-based (free tier): https://jolli.me/tenant/dashboard
 * 2. Subdomain (pro tier): https://tenant.jolli.me/dashboard
 * 3. Custom domain (enterprise): https://docs.acme.com/dashboard
 */

export type TenantMode = "path" | "subdomain" | "custom";

export interface TenantDetectionResult {
	/** The detected tenant mode */
	mode: TenantMode;
	/** Tenant slug extracted from URL (null for custom domain, needs API call) */
	tenantSlug: string | null;
	/** React Router basename to use */
	basename: string;
	/** Whether API call is needed to resolve tenant */
	needsApiValidation: boolean;
}

/**
 * Detect tenant mode from the current URL.
 *
 * @param baseDomain The base domain (e.g., "jolli-local.me" or "jolli.app")
 * @returns Tenant detection result
 */
export function detectTenantMode(baseDomain: string): TenantDetectionResult {
	const hostname = window.location.hostname;
	const pathname = window.location.pathname;

	// Mode 1: Subdomain (tenant.jolli.me)
	if (hostname !== baseDomain && hostname.endsWith(`.${baseDomain}`)) {
		const parts = hostname.split(".");
		const tenantSlug = parts[0];

		return {
			mode: "subdomain",
			tenantSlug,
			basename: "", // No basename prefix for subdomain mode
			needsApiValidation: true, // Need to verify subdomain is enabled for this tenant
		};
	}

	// Mode 2: Custom domain (docs.acme.com)
	if (hostname !== baseDomain) {
		return {
			mode: "custom",
			tenantSlug: null, // Unknown, need API call to resolve
			basename: "", // No basename prefix for custom domain
			needsApiValidation: true, // Must call API to get tenant
		};
	}

	// Mode 3: Path-based (jolli.me/tenant/dashboard)
	const segments = pathname.split("/").filter(Boolean);
	const tenantSlug = segments[0] || null;

	return {
		mode: "path",
		tenantSlug,
		basename: tenantSlug ? `/${tenantSlug}` : "",
		needsApiValidation: true, // Need to verify tenant exists and user has access
	};
}

/**
 * Build API URL for tenant validation.
 * Includes the detected tenant slug as a header hint.
 */
export function buildValidationRequest(detection: TenantDetectionResult): RequestInit {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	// For path-based and subdomain modes, pass tenant slug as hint
	if (detection.tenantSlug) {
		headers["X-Tenant-Slug"] = detection.tenantSlug;
	}

	// For custom domain, backend will detect from hostname
	return {
		method: "GET",
		headers,
		credentials: "include", // Include cookies for JWT
	};
}

/**
 * Extract tenant slug from URL based on mode.
 * Used for constructing internal navigation URLs.
 */
export function extractTenantFromUrl(baseDomain: string): string | null {
	const detection = detectTenantMode(baseDomain);
	return detection.tenantSlug;
}
