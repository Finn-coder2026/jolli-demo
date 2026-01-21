import type { NavMeta } from "../templates/app-router/index.js";
import type { ArticleInput, ArticleMetadata, DeletedArticle, OpenApiSpec, OpenApiSpecInfo } from "../types.js";
import { isReservedSlug } from "./reserved-words.js";
import { extractApiInfo, isOpenApiContent, validateOpenApiSpec } from "jolli-common";

/**
 * Validates if a URL is well-formed and safe for use in markdown links.
 */
export function isValidUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		// Reject vscode:// URLs with Windows paths (invalid format)
		if (parsed.protocol === "vscode:" && url.includes("\\")) {
			return false;
		}
		// Only allow http, https, and ftp protocols
		return ["http:", "https:", "ftp:"].includes(parsed.protocol);
	} catch {
		return false;
	}
}

/**
 * Result of slugifying text with redirect tracking.
 */
export interface SlugResult {
	/** Safe slug for file naming */
	slug: string;
	/** What the slug would be without sanitization */
	originalSlug: string;
	/** True if slug was modified and needs a redirect */
	needsRedirect: boolean;
}

/**
 * Generates a base slug from text (without safety checks).
 * Used internally by slugify() and slugifyWithRedirect().
 */
function generateBaseSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "") // Remove special characters
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
		.replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Converts a title to a URL-safe slug.
 * If the slug is a reserved word, starts with a digit, or is empty,
 * appends "-doc" suffix to make it safe.
 */
export function slugify(text: string): string {
	const base = generateBaseSlug(text);

	// Check if unsafe (reserved word, starts with digit, or empty)
	if (isReservedSlug(base) || /^[0-9]/.test(base) || base === "") {
		return `${base || "untitled"}-doc`;
	}
	return base;
}

/**
 * Converts a title to a URL-safe slug and tracks whether a redirect is needed.
 * Returns both the safe slug and the original slug for redirect generation.
 */
export function slugifyWithRedirect(text: string): SlugResult {
	const originalSlug = generateBaseSlug(text);
	const safeSlug = slugify(text);

	return {
		slug: safeSlug,
		originalSlug,
		needsRedirect: safeSlug !== originalSlug,
	};
}

/**
 * Detects if content appears to be JSON based on its structure.
 * Handles content that may have been stored with incorrect contentType.
 */
export function detectsAsJson(content: string): boolean {
	const trimmed = content.trim();
	return trimmed.startsWith("{") && trimmed.endsWith("}");
}

/**
 * Detects if content appears to be YAML based on its structure.
 * Only returns true if it looks like YAML but NOT JSON.
 *
 * IMPORTANT: This function is intentionally conservative to avoid
 * misidentifying MDX/Markdown content as YAML. We only detect YAML
 * for OpenAPI/Swagger specs (which have specific markers).
 *
 * The previous implementation used /^[a-zA-Z_][a-zA-Z0-9_]*:/ which
 * incorrectly matched MDX content starting with "title:" or similar.
 */
export function detectsAsYaml(content: string): boolean {
	const trimmed = content.trim();
	// Exclude content that looks like JSON
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return false;
	}
	// Only detect as YAML if it starts with known API spec markers
	// Do NOT use generic "word:" pattern as it matches MDX frontmatter
	return trimmed.startsWith("openapi:") || trimmed.startsWith("swagger:");
}

/**
 * Determines the effective content type for an article.
 * If the declared contentType doesn't match the actual content structure,
 * attempts to detect the correct type based on content analysis.
 */
export function getEffectiveContentType(content: string, declaredContentType: string | undefined): string {
	// If already declared as JSON or YAML, trust it
	if (declaredContentType === "application/json" || declaredContentType === "application/yaml") {
		return declaredContentType;
	}

	// For markdown or undefined content types, check if content is actually JSON/YAML
	if (detectsAsJson(content)) {
		return "application/json";
	}
	if (detectsAsYaml(content)) {
		return "application/yaml";
	}

	// Default to markdown
	return declaredContentType || "text/markdown";
}

/**
 * Checks if content is a valid OpenAPI specification.
 * Supports both JSON and YAML content types.
 * Also handles content with incorrect contentType by detecting actual format.
 * Returns the parsed spec if valid, or null if not.
 */
export function parseOpenApiSpec(content: string, contentType: string | undefined): OpenApiSpec | null {
	// Get the effective content type (detects JSON/YAML even if contentType is wrong)
	const effectiveType = getEffectiveContentType(content, contentType);

	// Only check structured data types
	if (effectiveType !== "application/json" && effectiveType !== "application/yaml") {
		return null;
	}

	// Quick check if it looks like OpenAPI
	if (!isOpenApiContent(content, effectiveType)) {
		return null;
	}

	// Full validation
	const validationResult = validateOpenApiSpec(content, effectiveType);

	if (validationResult.isValid && validationResult.parsedSpec) {
		return validationResult.parsedSpec as OpenApiSpec;
	}

	return null;
}

/**
 * YAML special values that would be parsed as non-strings.
 * These need to be quoted to preserve string type.
 */
const YAML_SPECIAL_VALUES = new Set(["true", "false", "yes", "no", "on", "off", "null", "~"]);

/**
 * Escapes special characters in YAML strings.
 * Also quotes strings that would be parsed as non-string types:
 * - Strings starting with digits (would be parsed as numbers)
 * - YAML special values (true, false, null, yes, no, on, off, ~)
 */
export function escapeYaml(str: string): string {
	// Check if string contains special YAML characters
	const hasSpecialChars = /[:#[\]{}|>`]/.test(str) || str.includes('"') || str.includes("'");

	// Check if string starts with a digit (would be parsed as number)
	const startsWithDigit = /^[0-9]/.test(str);

	// Check if string is a YAML special value (case-insensitive)
	const isSpecialValue = YAML_SPECIAL_VALUES.has(str.toLowerCase());

	if (hasSpecialChars || startsWithDigit || isSpecialValue) {
		return `"${str.replace(/"/g, '\\"')}"`;
	}
	return str;
}

/**
 * Sanitizes content to be MDX-compatible by converting HTML syntax to MDX format.
 */
export function sanitizeContentForMdx(content: string): string {
	// Convert HTML comments to MDX comments
	// HTML: <!-- comment -->
	// MDX: {/* comment */}
	return content.replace(/<!--([\s\S]*?)-->/g, "{/*$1*/}");
}

/**
 * Generates an API overview MDX page from an OpenAPI spec.
 */
export function generateApiOverviewContent(spec: OpenApiSpec, title: string): string {
	const info = extractApiInfo(spec);

	const endpointTable = info.endpoints
		.map(
			(e: { method: string; path: string; summary?: string }) =>
				`| ${e.method} | \`${e.path}\` | ${e.summary || "-"} |`,
		)
		.join("\n");

	return `---
title: ${title}
---

# ${info.title}

${info.description || "API documentation."}

**Version:** ${info.version}

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
${endpointTable}

## Interactive Documentation

View the full OpenAPI specification below or use an interactive API tool.

{/* Build timestamp: ${Date.now()} - Forces cache invalidation */}
`;
}

/**
 * Generates the interactive API page with the ApiReference component.
 * @param title - The title of the API
 * @param specFileName - The filename of the OpenAPI spec in the public folder (e.g., "my-api.json")
 */
export function generateApiInteractiveContent(title: string, specFileName: string): string {
	return `import ApiReference from '../../components/ApiReference'

# ${title} - Interactive

Explore and test the API endpoints directly in your browser.

<ApiReference specUrl="/${specFileName}" />
`;
}

/**
 * Converts an article to MDX content with frontmatter and metadata.
 */
export function generateArticleContent(article: ArticleInput): string {
	const metadata = article.contentMetadata as ArticleMetadata | undefined;
	const title = metadata?.title || "Untitled Article";
	const sourceName = metadata?.sourceName || "";
	const sourceUrl = metadata?.sourceUrl || "";

	// Build frontmatter
	const frontmatter: Array<string> = ["---", `title: ${escapeYaml(title)}`];

	if (sourceName) {
		frontmatter.push(`description: From ${escapeYaml(sourceName)}`);
	}

	frontmatter.push("---");
	frontmatter.push("");
	frontmatter.push(`{/* Build timestamp: ${Date.now()} - Forces cache invalidation */}`);
	frontmatter.push("");

	// Add metadata if available
	const metadataSection: Array<string> = [];
	if (sourceUrl && isValidUrl(sourceUrl)) {
		metadataSection.push(`**Source:** [${sourceName || "View Source"}](${sourceUrl})`);
	} else if (sourceName) {
		metadataSection.push(`**Source:** ${sourceName}`);
	}
	if (article.updatedAt) {
		const date = new Date(article.updatedAt).toLocaleDateString();
		metadataSection.push(`**Last Updated:** ${date}`);
	}
	if (metadataSection.length > 0) {
		metadataSection.push("");
		metadataSection.push("---");
		metadataSection.push("");
	}

	// Sanitize content for MDX compatibility
	const sanitizedContent = sanitizeContentForMdx(article.content);

	// Combine frontmatter, metadata, and content
	return [...frontmatter, ...metadataSection, sanitizedContent].join("\n");
}

/**
 * Generates the index/landing page for the documentation site.
 */
export function generateIndexContent(articleCount: number, displayName: string): string {
	return `---
title: ${displayName}
---

# Welcome to ${displayName}

This documentation site contains ${articleCount} article${articleCount === 1 ? "" : "s"}.

## About

This site was automatically generated from your documentation articles using Jolli.

## Browse Documentation

Use the navigation menu to explore the available documentation.

---

*Last generated: ${new Date().toISOString()}*

{/* Build ID: ${Date.now()} - Forces cache invalidation on rebuild */}
`;
}

/**
 * Generates navigation meta entries from articles.
 * OpenAPI specs are added as page entries with href pointing to the API docs page (within Nextra layout).
 *
 * @param articles - Array of article inputs
 * @param openApiSpecs - Optional array of OpenAPI spec info for generating API page entries
 * @returns Navigation meta with hidden index, article entries, and API page entries
 */
export function generateNavMeta(articles: Array<ArticleInput>, openApiSpecs?: Array<OpenApiSpecInfo>): NavMeta {
	const meta: NavMeta = {};

	// JOLLI-191: Hide index from nav (root redirects to first article via app/page.tsx)
	meta.index = { display: "hidden" };

	for (const article of articles) {
		// Skip OpenAPI specs from regular navigation - they'll be added as page entries below
		if (parseOpenApiSpec(article.content, article.contentType) !== null) {
			continue;
		}

		const metadata = article.contentMetadata as ArticleMetadata | undefined;
		const title = metadata?.title || "Untitled Article";
		const slug = slugify(title);
		meta[slug] = title;
	}

	// JOLLI-192: Add consolidated "API Reference" entry for OpenAPI specs
	if (openApiSpecs && openApiSpecs.length > 0) {
		if (openApiSpecs.length === 1) {
			// Single spec: simple page link
			const spec = openApiSpecs[0];
			meta["api-reference"] = {
				title: "API Reference",
				type: "page",
				href: `/api-docs/${spec.name}`,
			};
		} else {
			// Multiple specs: menu dropdown with items
			const items: Record<string, { title: string; href: string }> = {};
			for (const spec of openApiSpecs) {
				const apiTitle = spec.title || `${spec.name.charAt(0).toUpperCase()}${spec.name.slice(1)} API`;
				items[spec.name] = {
					title: apiTitle,
					href: `/api-docs/${spec.name}`,
				};
			}
			meta["api-reference"] = {
				title: "API Reference",
				type: "menu",
				items,
			};
		}
	}

	return meta;
}

/**
 * Generates the _meta.global.js content for site-wide curated navigation.
 * This file allows users to customize the global navigation structure.
 *
 * The _meta.global.js file is used by Nextra 3.x for site-wide navigation
 * that appears across all pages (e.g., header navigation, footer links).
 *
 * @param displayName - The display name of the site
 * @returns The content of the _meta.global.js file
 */
export function generateMetaGlobal(displayName: string): string {
	return `/**
 * Global navigation configuration for ${displayName}
 *
 * This file controls site-wide navigation elements.
 * Users can customize this file to add header links, external references, etc.
 *
 * See: https://nextra.site/docs/docs-theme/page-configuration#_metaglobaljs
 */
export default {
  // Add global navigation items here
  // Example:
  // docs: {
  //   title: "Documentation",
  //   type: "page"
  // },
  // github: {
  //   title: "GitHub",
  //   type: "page",
  //   href: "https://github.com/your-org/your-repo",
  //   newWindow: true
  // }
}
`;
}

/**
 * Represents a grouped API endpoint
 */
export interface ApiEndpointInfo {
	method: string;
	path: string;
	summary: string;
	description: string;
	operationId?: string;
	tags: Array<string>;
}

/**
 * Represents a group of API endpoints by tag
 */
export interface ApiGroup {
	tag: string;
	slug: string;
	endpoints: Array<ApiEndpointInfo>;
}

/**
 * Extracts and groups API endpoints by their tags from an OpenAPI spec.
 * If no tags are defined, groups by the first path segment.
 */
export function groupEndpointsByTag(spec: OpenApiSpec): Array<ApiGroup> {
	const groups = new Map<string, Array<ApiEndpointInfo>>();

	if (!spec.paths) {
		return [];
	}

	for (const [path, methods] of Object.entries(spec.paths)) {
		if (!methods) {
			continue;
		}

		for (const [method, operation] of Object.entries(methods)) {
			if (!operation || typeof operation !== "object") {
				continue;
			}

			const op = operation as {
				summary?: string;
				description?: string;
				operationId?: string;
				tags?: Array<string>;
			};

			// Get tags from operation, or derive from path
			let tags = op.tags || [];
			if (tags.length === 0) {
				// Extract first meaningful segment from path
				const segments = path.split("/").filter(Boolean);
				// Skip path params like :id or {id}
				const firstSegment = segments.find(s => !s.startsWith(":") && !s.startsWith("{"));
				if (firstSegment) {
					// Convert to title case (e.g., "api" -> "API", "tenants" -> "Tenants")
					const tagName = firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
					tags = [tagName];
				} else {
					tags = ["General"];
				}
			}

			const endpoint: ApiEndpointInfo = {
				method: method.toUpperCase(),
				path,
				summary: op.summary || "",
				description: op.description || "",
				tags,
			};
			// Only include operationId if it's defined (for exactOptionalPropertyTypes)
			if (op.operationId !== undefined) {
				endpoint.operationId = op.operationId;
			}

			// Add to each tag group
			for (const tag of tags) {
				const existing = groups.get(tag) || [];
				existing.push(endpoint);
				groups.set(tag, existing);
			}
		}
	}

	// Convert to array and sort
	const result: Array<ApiGroup> = [];
	for (const [tag, endpoints] of groups) {
		result.push({
			tag,
			slug: slugify(tag),
			endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path)),
		});
	}

	return result.sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * Generates an MDX page for a specific API group (tag).
 * Shows all endpoints in that group with their methods.
 */
export function generateApiGroupPage(group: ApiGroup, _apiTitle: string): string {
	const endpointSections = group.endpoints.map(ep => {
		const methodBadge = getMethodBadge(ep.method);
		return `### ${methodBadge} \`${ep.path}\`

${ep.summary || ep.description || "No description available."}

${ep.operationId ? `**Operation ID:** \`${ep.operationId}\`` : ""}
`;
	});

	return `---
title: ${group.tag}
---

# ${group.tag}

API endpoints for ${group.tag.toLowerCase()} operations.

${endpointSections.join("\n---\n\n")}
`;
}

/**
 * Returns a styled method badge for display
 */
function getMethodBadge(method: string): string {
	return method;
}

/**
 * Generates the _meta.js content for API navigation with grouped endpoints.
 * Creates a collapsible navigation structure.
 */
export function generateApiNavigationMeta(
	groups: Array<ApiGroup>,
	includeOverview = true,
	includeInteractive = true,
): string {
	const entries: Array<string> = [];

	if (includeOverview) {
		entries.push(`  "index": "Overview"`);
	}

	// Add each group with its endpoints as a collapsible menu
	for (const group of groups) {
		entries.push(`  "${group.slug}": "${group.tag}"`);
	}

	if (includeInteractive) {
		entries.push(`  "interactive": "Interactive API"`);
	}

	return `export default {\n${entries.join(",\n")}\n}\n`;
}

/**
 * Generates an overview page listing all API groups and their endpoint counts.
 */
export function generateApiGroupOverviewPage(spec: OpenApiSpec, title: string, groups: Array<ApiGroup>): string {
	const info = spec.info || {};
	const groupLinks = groups
		.map(
			g => `- [**${g.tag}**](./${g.slug}) - ${g.endpoints.length} endpoint${g.endpoints.length === 1 ? "" : "s"}`,
		)
		.join("\n");

	const totalEndpoints = groups.reduce((sum, g) => sum + g.endpoints.length, 0);

	return `---
title: ${title}
---

# ${info.title || title}

${info.description || "API documentation."}

**Version:** ${info.version || "1.0.0"}

## API Groups

This API has **${totalEndpoints}** endpoints organized into **${groups.length}** groups:

${groupLinks}

## Quick Reference

| Group | Endpoints | Description |
|-------|-----------|-------------|
${groups.map(g => `| [${g.tag}](./${g.slug}) | ${g.endpoints.length} | ${g.tag} operations |`).join("\n")}

---

*Use the navigation menu on the left to explore each API group.*

{/* Build timestamp: ${Date.now()} - Forces cache invalidation */}
`;
}

/**
 * Detects orphaned content files in the repository that don't correspond to any current article.
 * An orphaned file is a file in the content/ folder that doesn't match any expected article slug.
 *
 * This is used during rebuild to clean up files that were incorrectly saved with the wrong
 * extension (e.g., a markdown article saved as .yaml due to faulty content detection).
 *
 * @param existingFilePaths - Array of file paths currently in the repository (from GitHub tree)
 * @param expectedSlugs - Array of article slugs that should exist in the content/ folder
 * @returns Array of orphaned file paths to delete from the repository
 */
export function getOrphanedContentFiles(existingFilePaths: Array<string>, expectedSlugs: Array<string>): Array<string> {
	const orphanedPaths: Array<string> = [];
	const slugSet = new Set(expectedSlugs);

	// Content file extensions we care about
	const contentExtensions = [".mdx", ".md", ".yaml", ".yml", ".json"];

	for (const filePath of existingFilePaths) {
		// Only look at files in content/ folder
		if (!filePath.startsWith("content/")) {
			continue;
		}

		// Get the filename without the content/ prefix
		const relativePath = filePath.slice("content/".length);

		// Skip _meta files and subdirectories
		if (relativePath.includes("/") || relativePath.startsWith("_")) {
			continue;
		}

		// Check if it's a content file
		const extension = contentExtensions.find(ext => relativePath.endsWith(ext));
		if (!extension) {
			continue;
		}

		// Extract the slug (filename without extension)
		const slug = relativePath.slice(0, -extension.length);

		// Skip index files
		if (slug === "index") {
			continue;
		}

		// If the slug doesn't match any expected article, it's orphaned
		if (!slugSet.has(slug)) {
			orphanedPaths.push(filePath);
		}
	}

	return orphanedPaths;
}

/**
 * Computes file paths that should be deleted from the repository
 * based on deleted article metadata. Uses Nextra 4.x App Router structure.
 *
 * For JSON/YAML OpenAPI specs: public/{slug}.json or public/{slug}.yaml
 * For JSON/YAML non-OpenAPI: content/{slug}.json or content/{slug}.yaml
 * For Markdown: content/{slug}.mdx
 *
 * Also includes the associated API docs HTML file for OpenAPI specs:
 * public/api-docs-{slug}.html
 *
 * When isOpenApi is undefined (e.g., for deleted articles where content is unavailable),
 * returns all possible paths for JSON/YAML files. The GitHub client will filter
 * non-existent files when performing the actual deletion.
 *
 * @param deletedArticles - Array of deleted article metadata
 * @returns Array of file paths to delete from the repository
 */
export function getDeletedFilePaths(deletedArticles: Array<DeletedArticle>): Array<string> {
	const paths: Array<string> = [];

	for (const article of deletedArticles) {
		const slug = slugify(article.title);
		const contentType = article.contentType;
		const isOpenApi = article.isOpenApi;

		if (contentType === "application/json" || contentType === "application/yaml") {
			const extension = contentType === "application/json" ? "json" : "yaml";

			if (isOpenApi === true) {
				// Known OpenAPI spec - stored in public/ folder
				paths.push(`public/${slug}.${extension}`);
				paths.push(`public/api-docs-${slug}.html`);
			} else if (isOpenApi === false) {
				// Known non-OpenAPI - stored in content/ folder (Nextra 4.x)
				paths.push(`content/${slug}.${extension}`);
			} else {
				// Unknown (deleted article) - include all possible paths
				// The GitHub client will filter non-existent files
				paths.push(`public/${slug}.${extension}`);
				paths.push(`public/api-docs-${slug}.html`);
				paths.push(`content/${slug}.${extension}`);
			}
		} else {
			// Markdown files are stored in content/ folder as .mdx (Nextra 4.x)
			paths.push(`content/${slug}.mdx`);

			// IMPORTANT: Also try to delete .yaml and .json variants in case the file
			// was previously saved with wrong extension due to faulty content detection.
			// The GitHub API ignores deletion requests for files that don't exist.
			paths.push(`content/${slug}.yaml`);
			paths.push(`content/${slug}.json`);
		}
	}

	return paths;
}
