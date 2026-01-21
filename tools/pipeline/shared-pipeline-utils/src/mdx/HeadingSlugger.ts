/**
 * Generate stable, URL-friendly slugs from heading text.
 */

/**
 * Convert heading text to a URL-friendly slug.
 *
 * Rules:
 * - Convert to lowercase
 * - Replace spaces with hyphens
 * - Remove special characters (keep alphanumeric and hyphens)
 * - Collapse multiple hyphens
 * - Trim leading/trailing hyphens
 *
 * Examples:
 * - "Rate Limit Structure" → "rate-limit-structure"
 * - "API Reference (v2)" → "api-reference-v2"
 * - "What's New?" → "whats-new"
 *
 * @param heading - Heading text
 * @returns URL-friendly slug
 */
export function slugify(heading: string): string {
	return heading
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "") // Remove special chars
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/-+/g, "-") // Collapse multiple hyphens
		.replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
}

/**
 * Generate a stable section_id from document path and heading.
 *
 * Format: "<doc_path>::<heading_slug>"
 *
 * Examples:
 * - "api/rate-limit/get-limits.mdx", "Rate Limit Structure"
 *   → "api/rate-limit/get-limits::rate-limit-structure"
 *
 * - "guides/quickstart.mdx", "Getting Started"
 *   → "guides/quickstart::getting-started"
 *
 * @param docPath - Relative path to MDX file (without leading slash)
 * @param heading - Heading text
 * @returns Stable section_id
 */
export function generateSectionId(docPath: string, heading: string): string {
	// Remove .mdx extension if present
	const pathWithoutExt = docPath.replace(/\.mdx$/, "");
	const headingSlug = slugify(heading);

	return `${pathWithoutExt}::${headingSlug}`;
}
