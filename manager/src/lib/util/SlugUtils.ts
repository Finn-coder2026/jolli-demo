/**
 * Utility functions for generating and validating slugs.
 */

const DEFAULT_MAX_LENGTH = 50;

/**
 * Generate a database-safe slug from a name.
 * Rules:
 * - Spaces become underscores
 * - Lowercase everything
 * - Only alphanumeric + underscore allowed
 * - Configurable max length (default 50)
 *
 * @param name - The name to generate a slug from
 * @param maxLength - Maximum length of the slug (default 50)
 * @returns A database-safe slug
 */
export function generateProviderSlug(name: string, maxLength = DEFAULT_MAX_LENGTH): string {
	return name
		.toLowerCase()
		.replace(/\s+/g, "_") // Spaces to underscores
		.replace(/[^a-z0-9_]/g, "") // Keep only alphanumeric + underscore
		.substring(0, maxLength);
}

/**
 * Validate that a slug is valid for use as a provider slug.
 *
 * @param slug - The slug to validate
 * @returns True if the slug is valid
 */
export function isValidProviderSlug(slug: string): boolean {
	return /^[a-z0-9_]+$/.test(slug) && slug.length > 0 && slug.length <= DEFAULT_MAX_LENGTH;
}
