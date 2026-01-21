import { randomUUID } from "node:crypto";

const CHINESE_REGEX = /[\u4e00-\u9fa5]/;
const SLUG_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Default max length for generated slugs.
 * Set to 80 to leave room for timestamps (14 chars: "-" + 13-digit timestamp)
 * when business code appends them for uniqueness.
 * Database slug columns are typically 100 chars, so 80 + 14 = 94 is safe.
 */
export const DEFAULT_SLUG_MAX_LENGTH = 80;

/**
 * Generate a URL-friendly slug from text.
 * - English: converts to lowercase, replaces spaces/special chars with hyphens
 * - Chinese: generates a short random ID (UUID prefix)
 *
 * @param text - The text to generate a slug from
 * @param maxLength - Maximum length of the slug (default 80, to leave room for timestamps)
 * @returns A URL-friendly slug
 */
export function generateSlug(text: string, maxLength = DEFAULT_SLUG_MAX_LENGTH): string {
	if (CHINESE_REGEX.test(text)) {
		// Chinese text: use first 8 chars of UUID
		return randomUUID().slice(0, 8);
	}
	// English text: lowercase, replace non-alphanumeric with hyphens
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, maxLength);
}

/**
 * Validate slug format.
 * Allows: letters, numbers, dots, underscores, hyphens.
 * Must start with letter or number.
 *
 * @param slug - The slug to validate
 * @returns True if the slug is valid
 */
export function isValidSlug(slug: string): boolean {
	return SLUG_REGEX.test(slug) && slug.length > 0;
}

/**
 * Build a materialized path from parent path and slug.
 * The path format is: /folder-slug/doc-slug (without space-slug prefix).
 *
 * @param parentPath - Parent document's path (or null/empty for root level)
 * @param slug - Current document's slug
 * @returns The full path, e.g., "/folder-slug/doc-slug"
 */
export function buildPath(parentPath: string | null | undefined, slug: string): string {
	if (!parentPath) {
		return `/${slug}`;
	}
	return `${parentPath}/${slug}`;
}
