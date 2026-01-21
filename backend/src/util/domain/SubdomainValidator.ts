/**
 * Subdomain validation utilities.
 *
 * Rules:
 * - 3-63 characters
 * - Lowercase alphanumeric and hyphens only
 * - Cannot start or end with hyphen
 * - Cannot contain consecutive hyphens
 */

const MIN_LENGTH = 3;
const MAX_LENGTH = 63;
const VALID_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const CONSECUTIVE_HYPHENS = /--/;

export interface SubdomainValidationResult {
	valid: boolean;
	error?: string;
	sanitized?: string;
}

/**
 * Validate a subdomain string.
 */
export function validateSubdomain(subdomain: string): SubdomainValidationResult {
	if (!subdomain) {
		return { valid: false, error: "Subdomain is required" };
	}

	const trimmed = subdomain.trim().toLowerCase();

	if (trimmed.length < MIN_LENGTH) {
		return { valid: false, error: `Subdomain must be at least ${MIN_LENGTH} characters` };
	}

	if (trimmed.length > MAX_LENGTH) {
		return { valid: false, error: `Subdomain must be at most ${MAX_LENGTH} characters` };
	}

	if (!VALID_PATTERN.test(trimmed)) {
		if (trimmed.startsWith("-") || trimmed.endsWith("-")) {
			return { valid: false, error: "Subdomain cannot start or end with a hyphen" };
		}
		return { valid: false, error: "Subdomain can only contain lowercase letters, numbers, and hyphens" };
	}

	if (CONSECUTIVE_HYPHENS.test(trimmed)) {
		return { valid: false, error: "Subdomain cannot contain consecutive hyphens" };
	}

	return { valid: true, sanitized: trimmed };
}

/**
 * Sanitize a string to a valid subdomain.
 * Used to auto-generate subdomain from site name.
 */
export function sanitizeToSubdomain(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-") // Replace invalid chars with hyphen
		.replace(/--+/g, "-") // Collapse consecutive hyphens
		.replace(/^-|-$/g, "") // Remove leading/trailing hyphens
		.slice(0, MAX_LENGTH); // Truncate to max length
}

/**
 * Generate a unique subdomain suggestion when requested one is taken.
 * Appends incrementing number: my-site -> my-site-1 -> my-site-2
 */
export function generateSubdomainSuggestion(base: string, attempt: number): string {
	const sanitized = sanitizeToSubdomain(base);
	const suffix = `-${attempt}`;
	const maxBase = MAX_LENGTH - suffix.length;
	return `${sanitized.slice(0, maxBase)}${suffix}`;
}
