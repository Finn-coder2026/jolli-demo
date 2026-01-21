import type { SiteWithUpdate } from "jolli-common";

/**
 * Utility functions for URL formatting and manipulation.
 */

/**
 * Formats a domain into a full URL, adding https:// prefix if missing.
 * @param domain - The domain or URL to format
 * @returns A properly formatted URL with https:// prefix
 */
export function formatDomainUrl(domain: string): string {
	return domain.startsWith("http") ? domain : `https://${domain}`;
}

/**
 * Gets the verified custom domain for a docsite, if one exists.
 * @param docsite - The site to check
 * @returns The verified custom domain, or undefined if none
 */
export function getVerifiedCustomDomain(docsite: SiteWithUpdate): string | undefined {
	const customDomains = docsite.metadata?.customDomains ?? [];
	return customDomains.find(d => d.status === "verified")?.domain;
}

/**
 * Gets the default (non-custom) domain for a docsite.
 * @param docsite - The site to get the domain for
 * @returns The default domain (jolli.site, production, or vercel URL), or undefined
 */
export function getDefaultSiteDomain(docsite: SiteWithUpdate): string | undefined {
	return docsite.metadata?.jolliSiteDomain || docsite.metadata?.productionUrl || docsite.metadata?.vercelUrl;
}

/**
 * Gets the primary site URL for a docsite, following precedence:
 * 1. Verified custom domain
 * 2. Jolli.site subdomain
 * 3. Production URL
 * 4. Vercel URL
 * @param docsite - The site to get the URL for
 * @returns The primary URL domain (without protocol), or undefined if none available
 */
export function getPrimarySiteDomain(docsite: SiteWithUpdate): string | undefined {
	return getVerifiedCustomDomain(docsite) || getDefaultSiteDomain(docsite);
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
