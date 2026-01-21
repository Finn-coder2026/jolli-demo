/**
 * Custom domain validation utilities.
 */

// Basic domain validation pattern
// Allows subdomains, requires valid TLD
const DOMAIN_PATTERN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

// Reserved/blocked domains that users cannot add
const BLOCKED_DOMAINS = ["jolli.site", "jolli.ai", "vercel.app", "vercel.com", "localhost"];

export interface DomainValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate a custom domain.
 */
export function validateCustomDomain(domain: string): DomainValidationResult {
	if (!domain) {
		return { valid: false, error: "Domain is required" };
	}

	const trimmed = domain.trim().toLowerCase();

	if (trimmed.length > 253) {
		return { valid: false, error: "Domain is too long" };
	}

	if (!DOMAIN_PATTERN.test(trimmed)) {
		return { valid: false, error: "Invalid domain format" };
	}

	// Check against blocked domains
	for (const blocked of BLOCKED_DOMAINS) {
		if (trimmed === blocked || trimmed.endsWith(`.${blocked}`)) {
			return { valid: false, error: `Cannot use ${blocked} domains` };
		}
	}

	return { valid: true };
}
