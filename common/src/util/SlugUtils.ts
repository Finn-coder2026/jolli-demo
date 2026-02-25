import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import slugify from "slugify";

const CHINESE_REGEX = /[\u4e00-\u9fa5]/;
const SLUG_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Custom alphabet for nanoid: lowercase letters and digits only.
 * This ensures slugs are URL-safe and case-insensitive friendly.
 */
const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Default max length for generated slugs.
 * Set to 80 to leave room for unique suffixes (8 chars: "-" + 7-char nanoid)
 * when business code appends them for uniqueness.
 * Database slug columns are typically 100 chars, so 80 + 8 = 88 is safe.
 */
export const DEFAULT_SLUG_MAX_LENGTH = 80;

/**
 * Default length for nanoid suffix used in unique slug generation.
 */
export const DEFAULT_NANOID_LENGTH = 7;

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
 * Generate a unique slug with a short random suffix.
 * Uses slugify for better internationalization support and nanoid for compact unique suffix.
 *
 * @param text - The text to generate a slug from
 * @param suffixLength - Length of the nanoid suffix (default 6)
 * @param maxLength - Maximum length of the base slug before suffix (default 80)
 * @returns A unique slug like "getting-started-x7k9p2"
 *
 * @example
 * generateUniqueSlug("Getting Started") // "getting-started-x7k9p2"
 * generateUniqueSlug("我的文档") // "wo-de-wen-dang-a3b4c5" or "8chars-a3b4c5" if no transliteration
 */
export function generateUniqueSlug(
	text: string,
	suffixLength = DEFAULT_NANOID_LENGTH,
	maxLength = DEFAULT_SLUG_MAX_LENGTH,
): string {
	let baseSlug: string;

	if (CHINESE_REGEX.test(text)) {
		// Chinese text: use first 8 chars of UUID as base
		baseSlug = randomUUID().slice(0, 8);
	} else {
		// Use slugify for better handling of special characters
		baseSlug = slugify(text, {
			lower: true,
			strict: true, // Remove special characters
			trim: true,
		});

		// Fallback to basic slug if slugify returns empty
		if (!baseSlug) {
			baseSlug = text
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "");
		}

		// Truncate to max length
		baseSlug = baseSlug.substring(0, maxLength);
	}

	// Append nanoid suffix for uniqueness (lowercase letters and digits only)
	const nanoid = customAlphabet(SLUG_ALPHABET, suffixLength);
	const suffix = nanoid();
	return `${baseSlug}-${suffix}`;
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
