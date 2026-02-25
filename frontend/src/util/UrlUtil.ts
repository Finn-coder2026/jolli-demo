import type { SiteWithUpdate } from "jolli-common";

/** Utility functions for URL formatting and manipulation. */

/** Allowed URL schemes for link insertion — prevents javascript: XSS. */
const ALLOWED_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Validates that a URL uses a safe scheme before setting it as a link.
 * Blocks javascript:, data:, vbscript:, and other potentially dangerous schemes.
 */
export function isAllowedLinkUrl(url: string): boolean {
	try {
		const parsed = new URL(url, "https://placeholder.invalid");
		return ALLOWED_LINK_SCHEMES.has(parsed.protocol);
	} catch {
		return false;
	}
}

/** Formats a domain into a full URL, adding https:// prefix if missing. */
export function formatDomainUrl(domain: string): string {
	return domain.startsWith("http") ? domain : `https://${domain}`;
}

/** Gets the verified custom domain for a docsite, if one exists. */
export function getVerifiedCustomDomain(docsite: SiteWithUpdate): string | undefined {
	const customDomains = docsite.metadata?.customDomains ?? [];
	return customDomains.find(d => d.status === "verified")?.domain;
}

/** Gets the default (non-custom) domain for a docsite (jolli.site > productionUrl > vercelUrl). */
export function getDefaultSiteDomain(docsite: SiteWithUpdate): string | undefined {
	return docsite.metadata?.jolliSiteDomain || docsite.metadata?.productionUrl || docsite.metadata?.vercelUrl;
}

/**
 * Gets the primary site domain following precedence:
 * 1. Verified custom domain → 2. Jolli.site subdomain → 3. Production URL → 4. Vercel URL
 */
export function getPrimarySiteDomain(docsite: SiteWithUpdate): string | undefined {
	return getVerifiedCustomDomain(docsite) || getDefaultSiteDomain(docsite);
}

/**
 * Gets the full URL for a site using proper domain priority.
 * Returns undefined if no domain is available.
 */
export function getSiteUrl(site: SiteWithUpdate): string | undefined {
	const domain = getPrimarySiteDomain(site);
	return domain ? formatDomainUrl(domain) : undefined;
}

/**
 * Safely copies text to the clipboard with error handling.
 * @param value - The text to copy
 * @returns Promise that resolves when copy is complete (or fails silently)
 */
export async function copyToClipboard(value: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		// Clipboard API may fail in certain environments (e.g., non-secure contexts)
		return false;
	}
}
