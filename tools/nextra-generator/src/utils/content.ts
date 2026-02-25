import type { NavMeta } from "../templates/app-router/index.js";
import type { ArticleInput, ArticleMetadata, DeletedArticle, OpenApiSpec, OpenApiSpecInfo } from "../types.js";
import { sanitizeUrl } from "./sanitize.js";
import { extractApiInfo, extractBrainContent, isOpenApiContent, validateOpenApiSpec } from "jolli-common";
import { sanitizeMdToMdx } from "jolli-common/server";

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
 * Generates a base slug from text (without safety checks).
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
 * Returns "untitled" for empty strings.
 */
export function slugify(text: string): string {
	const base = generateBaseSlug(text);
	return base || "untitled";
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

<!-- Build timestamp: ${Date.now()} - Forces cache invalidation -->
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
 * Options for generating article content.
 */
export interface GenerateArticleContentOptions {
	/**
	 * Skip adding asIndexPage: true for folder documents.
	 * Used in tabs mode where folder content becomes an overview article instead of index.md.
	 */
	skipAsIndexPage?: boolean;
}

/**
 * Converts an article to markdown/MDX content with frontmatter and metadata.
 * For text/mdx contentType, sanitizes content for strict MDX compatibility.
 * For text/markdown (default), preserves content as-is for lenient MD parsing.
 */
export function generateArticleContent(article: ArticleInput, options?: GenerateArticleContentOptions): string {
	const metadata = article.contentMetadata as ArticleMetadata | undefined;
	const title = metadata?.title || "Untitled Article";
	const sourceName = metadata?.sourceName || "";
	const sourceUrl = metadata?.sourceUrl || "";
	const isMdx = article.contentType === "text/mdx";

	// Build frontmatter
	const frontmatter: Array<string> = ["---", `title: ${escapeYaml(title)}`];

	if (sourceName) {
		frontmatter.push(`description: From ${escapeYaml(sourceName)}`);
	}

	// For folder documents (index pages), add asIndexPage to make the folder clickable
	// while still showing children in the sidebar navigation
	// Skip this in tabs mode where folder content becomes an overview article
	if (article.isFolder && !options?.skipAsIndexPage) {
		frontmatter.push("asIndexPage: true");
	}

	frontmatter.push("---");
	frontmatter.push("");
	// Use appropriate comment syntax based on format
	if (isMdx) {
		frontmatter.push(`{/* Build timestamp: ${Date.now()} - Forces cache invalidation */}`);
	} else {
		frontmatter.push(`<!-- Build timestamp: ${Date.now()} - Forces cache invalidation -->`);
	}
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

	// Extract article body, discarding the brain frontmatter block entirely.
	// The generator builds its own Nextra frontmatter, so the brain block is
	// redundant and must not appear as visible text on the deployed site (JOLLI-574).
	const { articleContent } = extractBrainContent(article.content);

	// Only sanitize content for strict MDX compatibility when using .mdx extension
	// For .md files, preserve content as-is (lenient parsing handles HTML comments, etc.)
	const finalContent = isMdx ? sanitizeMdToMdx(articleContent) : articleContent;

	// Combine frontmatter, metadata, and content
	return [...frontmatter, ...metadataSection, finalContent].join("\n");
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

<!-- Build ID: ${Date.now()} - Forces cache invalidation on rebuild -->
`;
}

/**
 * Generates navigation meta entries from articles.
 * OpenAPI specs are added as page entries with href pointing to the API docs page (internal, uses type: 'page').
 * Header links are added as external link entries for navbar navigation (JOLLI-382).
 *
 * Per Nextra docs:
 * - type: 'page' with href is for internal pages that map to files
 * - External links just need title/href/newWindow (no type field)
 *
 * @param articles - Array of article inputs
 * @param openApiSpecs - Optional array of OpenAPI spec info for generating API page entries
 * @param headerLinks - Header links config to add as navbar page entries
 * @returns Navigation meta with hidden index, article entries, and API page entries
 */
export function generateNavMeta(
	articles: Array<ArticleInput>,
	openApiSpecs?: Array<OpenApiSpecInfo>,
	headerLinks?: import("jolli-common").HeaderLinksConfig,
): NavMeta {
	const meta: NavMeta = {};

	// Hidden index entry ensures Nextra doesn't auto-generate an "Index" nav item
	// The actual root redirect is handled by app/page.tsx (JOLLI-191)
	meta.index = { display: "hidden" };

	for (const article of articles) {
		// Skip OpenAPI specs from regular navigation - they'll be added as page entries below
		if (parseOpenApiSpec(article.content, article.contentType) !== null) {
			continue;
		}

		const metadata = article.contentMetadata as ArticleMetadata | undefined;
		const title = metadata?.title || "Untitled Article";
		// Use actual slug from database if provided, preserves unique suffixes
		const slug = article.slug || slugify(title);
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

	// JOLLI-382: Add header links as page entries in _meta.ts
	// Per Nextra docs: type: 'page' displays in navbar, href adds external link
	// Format: { title: '...', type: 'page', href: 'https://...' }
	// Note: Visual separation in navbar is handled by CSS (margin-left: auto)
	// Nextra separators only work in sidebar, not navbar
	if (headerLinks?.items && headerLinks.items.length > 0) {
		for (let i = 0; i < headerLinks.items.length; i++) {
			const item = headerLinks.items[i];
			const key = `nav-${i}`;

			if (item.items && item.items.length > 0) {
				// Dropdown menu with sub-items
				const menuItems: Record<string, { title: string; href: string }> = {};
				for (const subItem of item.items) {
					const subKey = subItem.label.toLowerCase().replace(/\s+/g, "-");
					menuItems[subKey] = {
						title: subItem.label,
						href: sanitizeUrl(subItem.url),
					};
				}
				meta[key] = {
					title: item.label,
					type: "menu",
					items: menuItems,
				};
			} else if (item.url) {
				// External link needs type: 'page' to appear in navbar (not sidebar)
				// Per Nextra 4 docs: { title: '...', type: 'page', href: 'https://...' }
				meta[key] = {
					title: item.label,
					type: "page",
					href: sanitizeUrl(item.url),
				};
			}
		}
	}

	return meta;
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
 * Returns folder paths that need to be deleted when switching to slugified folder names.
 * When folders have spaces or special characters (e.g., "Getting Started"), they are
 * now stored with slugified names (e.g., "getting-started"). The old non-slugified
 * folders should be deleted to avoid conflicts.
 *
 * @param folderPaths - Array of original folder paths (e.g., from allFolderMetas)
 * @returns Array of content folder paths to delete (non-slugified versions that differ from slugified)
 */
export function getNonSlugifiedFolderPaths(folderPaths: Array<string>): Array<string> {
	const pathsToDelete: Array<string> = [];

	for (const folderPath of folderPaths) {
		if (!folderPath) {
			continue;
		}

		// Slugify each part of the path
		const slugifiedPath = folderPath
			.split("/")
			.map(part => slugify(part))
			.join("/");

		// If the slugified path differs from the original, the original needs to be deleted
		if (slugifiedPath !== folderPath) {
			pathsToDelete.push(`content/${folderPath}`);
		}
	}

	return pathsToDelete;
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
			// Markdown files - try both .md (new default) and .mdx (legacy or explicit text/mdx)
			// The GitHub API ignores deletion requests for files that don't exist.
			paths.push(`content/${slug}.md`);
			paths.push(`content/${slug}.mdx`);

			// IMPORTANT: Also try to delete .yaml and .json variants in case the file
			// was previously saved with wrong extension due to faulty content detection.
			paths.push(`content/${slug}.yaml`);
			paths.push(`content/${slug}.json`);
		}
	}

	return paths;
}
