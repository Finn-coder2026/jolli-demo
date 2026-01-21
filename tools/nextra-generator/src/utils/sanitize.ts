/**
 * Sanitization utilities for preventing XSS and injection attacks
 * in generated Nextra site templates.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 *
 * Converts potentially dangerous characters to their HTML entity equivalents:
 * - & becomes &amp;
 * - < becomes &lt;
 * - > becomes &gt;
 * - " becomes &quot;
 * - ' becomes &#039;
 *
 * @param str - The string to escape
 * @returns The escaped string safe for HTML insertion
 */
export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * Escapes characters for use in JavaScript string literals.
 * Handles single quotes, backslashes, and control characters.
 *
 * Note: This is for single-quoted JS strings ('...'). For template
 * literals, additional escaping of backticks and ${} would be needed.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for JS string insertion
 */
export function escapeJsString(str: string): string {
	return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/**
 * Validates and sanitizes URLs - only allows http/https protocols.
 * Returns a safe fallback for invalid URLs.
 *
 * @param url - The URL to sanitize
 * @param fallback - The fallback value if URL is invalid (default: "#")
 * @returns The original URL if valid, otherwise the fallback
 */
export function sanitizeUrl(url: string, fallback = "#"): string {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return fallback;
		}
		return url;
	} catch {
		return fallback;
	}
}

/**
 * Validates a number is within a specified range.
 * Returns the default value if the number is invalid or out of range.
 *
 * @param value - The value to validate
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @param defaultValue - The default value if validation fails
 * @returns The original value if valid, otherwise the default
 */
export function validateNumberRange(value: number | undefined, min: number, max: number, defaultValue: number): number {
	if (value === undefined || Number.isNaN(value) || value < min || value > max) {
		return defaultValue;
	}
	return value;
}

/**
 * Sanitizes a site name for use in URLs (e.g., GitHub repo paths).
 * Only allows alphanumeric characters, hyphens, and underscores.
 *
 * @param name - The site name to sanitize
 * @returns The sanitized name safe for URL paths
 */
export function sanitizeSiteName(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, "-");
}
