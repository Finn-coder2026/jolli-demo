/**
 * Thin wrapper around the nextra-generator library.
 * Converts backend Doc models to ArticleInput and calls generateSiteToMemory.
 */

import type { Doc } from "../model/Doc";
import type { DocGeneratorOptions } from "./DocGeneratorFactory";
import {
	type ChangedArticle,
	type ImageReferenceError,
	type SiteBranding,
	validateImageReferences,
} from "jolli-common";
import { DEFAULT_NANOID_LENGTH } from "jolli-common/server";
import type { ArticleInput, DeletedArticle, FileTree, ThemeConfig } from "nextra-generator";
import {
	convertToNextra4Config,
	generateSiteToMemory,
	getDeletedFilePaths,
	getNextra3xFilesToDelete,
	getOrphanedContentFiles,
	MetaMerger,
	parseNextra3ThemeConfig,
	slugify,
} from "nextra-generator";

// Re-export FileTree for backwards compatibility
export type { ArticleInput, FileTree } from "nextra-generator";

// Re-export migration utilities
export { convertToNextra4Config, getNextra3xFilesToDelete, parseNextra3ThemeConfig };

// Re-export MetaMerger for _meta.ts validation and merging
export { MetaMerger };

// Re-export orphaned file detection
export { getOrphanedContentFiles };

// Re-export slugify for slug computation
export { slugify };

/**
 * Validation error for an article with invalid image references.
 */
export interface ArticleImageValidationError {
	/** Article JRN for identification */
	jrn: string;
	/** Article title for display */
	title: string;
	/** Image reference errors found in this article */
	errors: Array<ImageReferenceError>;
}

/**
 * Result of pre-generation image validation.
 */
export interface PreGenerationValidationResult {
	/** Whether all articles passed validation */
	isValid: boolean;
	/** Articles with validation errors */
	invalidArticles: Array<ArticleImageValidationError>;
}

/**
 * Validates all articles for invalid image references before site generation.
 *
 * This should be called before generateNextraFromArticles to catch articles
 * with relative image paths (./img/*, ../img/*, etc.) that would break the build.
 *
 * @param articles - Array of Doc models to validate
 * @returns Validation result with any errors found
 */
export function validateArticlesForGeneration(articles: Array<Doc>): PreGenerationValidationResult {
	const invalidArticles: Array<ArticleImageValidationError> = [];

	for (const article of articles) {
		const validation = validateImageReferences(article.content);
		if (!validation.isValid) {
			const title = (article.contentMetadata as { title?: string } | undefined)?.title ?? article.jrn;
			invalidArticles.push({
				jrn: article.jrn,
				title,
				errors: validation.errors,
			});
		}
	}

	return {
		isValid: invalidArticles.length === 0,
		invalidArticles,
	};
}

/**
 * Formats pre-generation validation errors into a human-readable error message.
 *
 * @param result - The validation result from validateArticlesForGeneration
 * @returns Formatted error message
 */
export function formatPreGenerationErrors(result: PreGenerationValidationResult): string {
	if (result.isValid) {
		return "";
	}

	const lines = ["Site generation failed: Invalid image references found"];

	for (const article of result.invalidArticles) {
		for (const error of article.errors) {
			lines.push(`- Article "${article.title}" (${article.jrn}): ${error.src} (${error.message})`);
		}
	}

	return lines.join("\n");
}

/** Key that exists on both SiteBranding and ThemeConfig, enabling safe direct copy. */
type SharedBrandingKey = keyof SiteBranding & keyof ThemeConfig;

/**
 * Maps SiteBranding (from jolli-common) to ThemeConfig (for nextra-generator).
 * SiteBranding uses 'footer' for FooterConfig, but ThemeConfig uses 'footerConfig'.
 */

function mapBrandingToThemeConfig(branding: SiteBranding): Partial<ThemeConfig> {
	const theme: Partial<ThemeConfig> = {};

	// Copy properties that share the same name on both SiteBranding and ThemeConfig
	const directKeys: ReadonlyArray<SharedBrandingKey> = [
		"logo",
		"logoUrl",
		"favicon",
		"primaryHue",
		"defaultTheme",
		"hideToc",
		"tocTitle",
		"sidebarDefaultCollapseLevel",
		"headerLinks",
		"fontFamily",
		"codeTheme",
		"borderRadius",
		"spacingDensity",
		"navigationMode",
		"logoDisplay",
		"pageWidth",
		"contentWidth",
		"sidebarWidth",
		"tocWidth",
		"headerAlignment",
	];
	for (const key of directKeys) {
		if (branding[key] !== undefined) {
			(theme as Record<SharedBrandingKey, unknown>)[key] = branding[key];
		}
	}

	// Map 'footer' (SiteBranding) to 'footerConfig' (ThemeConfig)
	if (branding.footer !== undefined) {
		theme.footerConfig = branding.footer;
	}

	return theme;
}

/** Strips the nanoid suffix from a database slug for clean URLs.
 * Uses DEFAULT_NANOID_LENGTH to stay in sync with slug generation.
 * Only strips if the result would be non-empty (avoids stripping the entire slug).
 * @internal - exported for testing */
export function stripSlugSuffix(slug: string): string {
	const stripped = slug.replace(new RegExp(`-[a-z0-9]{${DEFAULT_NANOID_LENGTH}}$`), "");
	return stripped || slug;
}

/**
 * Extracts the folder path from a document's path and strips nanoid suffixes.
 * The doc.path format is:
 * - Root level: "/my-article-abc1234" (just leading slash + slug with suffix)
 * - Nested: "/getting-started-gk4sp55/installation-xyz7890" (with suffixes)
 *
 * Returns the clean folder path without suffixes (e.g., "getting-started") or empty string for root.
 * @internal - exported for testing */
export function extractFolderPath(docPath: string): string {
	// Remove leading slash if present
	const normalizedPath = docPath.startsWith("/") ? docPath.substring(1) : docPath;

	const lastSlash = normalizedPath.lastIndexOf("/");
	if (lastSlash === -1) {
		// No more slashes means root level
		return "";
	}

	// Get parent path and strip nanoid suffixes from each segment for clean URLs
	const parentPath = normalizedPath.substring(0, lastSlash);
	const cleanSegments = parentPath.split("/").map(stripSlugSuffix);
	return cleanSegments.join("/");
}

/**
 * Converts a Doc model to an ArticleInput for the nextra-generator library.
 * Passes folderPath and isFolder to preserve Jolli's folder hierarchy.
 *
 * NOTE: We do NOT pass doc.slug to the generator. The generator derives clean
 * slugs from article titles, giving URLs like /getting-started/ide instead of
 * /getting-started-gk4sp55/ide-rzg8ofv. If two articles have the same title
 * in the same folder, the build will fail with a clear error.
 */
function docToArticleInput(doc: Doc): ArticleInput {
	const result: ArticleInput = {
		content: doc.content,
	};
	if (doc.contentType !== undefined) {
		result.contentType = doc.contentType;
	}
	if (doc.contentMetadata !== undefined) {
		result.contentMetadata = doc.contentMetadata;
	}
	if (doc.updatedAt !== undefined) {
		result.updatedAt = doc.updatedAt;
	}
	// Pass folder path from Jolli's hierarchy (with suffixes stripped for clean URLs)
	if (doc.path) {
		const folderPath = extractFolderPath(doc.path);
		if (folderPath) {
			result.folderPath = folderPath;
		}
	}
	// Mark if this is a folder document (becomes index.md inside its folder)
	if (doc.docType === "folder") {
		result.isFolder = true;
	}
	return result;
}

/**
 * Builds a mapping from old folder slugs (derived from doc.path) to new folder slugs
 * (derived from folder title). This handles the case where a folder is renamed in Jolli:
 * the folder document's title changes but its slug/path in the DB stays the same.
 *
 * When a folder "CICD" is renamed to "Workflows":
 * - Folder doc path: /cicd-gk4sp55 → old slug "cicd"
 * - Folder doc title: "Workflows" → new slug "workflows"
 * - Children's paths still reference /cicd-gk4sp55/... → folderPath "cicd"
 * - This mapping remaps "cicd" → "workflows" so children end up in the right folder.
 * @internal - exported for testing */
export function buildFolderSlugMapping(
	articles: Array<Pick<Doc, "docType" | "path" | "contentMetadata">>,
): Map<string, string> {
	const mapping = new Map<string, string>();
	for (const doc of articles) {
		if (doc.docType !== "folder" || !doc.path) {
			continue;
		}

		// Extract old slug from doc.path (last segment of the path, without nanoid suffix)
		const normalizedPath = doc.path.startsWith("/") ? doc.path.substring(1) : doc.path;
		const segments = normalizedPath.split("/");
		const lastSegment = segments[segments.length - 1];
		const oldSlug = stripSlugSuffix(lastSegment);

		// Derive new slug from the folder's current title
		const title = (doc.contentMetadata as { title?: string } | undefined)?.title;
		if (!title) {
			continue;
		}
		const newSlug = slugify(title);

		// Only add mapping if slugs differ (i.e., a rename happened)
		if (oldSlug && newSlug && oldSlug !== newSlug) {
			mapping.set(oldSlug, newSlug);
		}
	}
	return mapping;
}

/**
 * Remaps folder paths in article inputs using a slug mapping.
 * Each segment of the folder path is checked against the mapping and replaced if found.
 * This ensures child articles end up in the correct folder after a parent folder rename.
 * @internal - exported for testing */
export function remapFolderPaths(articleInputs: Array<ArticleInput>, slugMapping: Map<string, string>): void {
	for (const input of articleInputs) {
		if (!input.folderPath) {
			continue;
		}
		const remappedSegments = input.folderPath.split("/").map(segment => slugMapping.get(segment) ?? segment);
		input.folderPath = remappedSegments.join("/");
	}
}

/**
 * Result of generating a Nextra project
 */
export interface GenerateNextraResult {
	files: Array<FileTree>;
	removedNavEntries: Array<string>; // Navigation entries removed during merge
	foldersToDelete: Array<string>; // Content folders that became empty and should be deleted
	warnings: Array<string>; // Warnings about potential issues (e.g., slug collisions)
	relocatedFilePaths: Array<string>; // Old paths of articles moved by useSpaceFolderStructure
}

/**
 * Generates a complete Nextra project from a collection of Doc articles.
 * Uses the nextra-generator library for all generation logic.
 * Returns a FileTree array suitable for uploading to GitHub.
 *
 * @param articles - Array of Doc models to generate documentation from
 * @param siteName - Site name (used in package.json, GitHub repo, etc.)
 * @param displayName - Display name shown in UI
 * @param options - Optional generation options (auth, regeneration mode)
 * @returns Object with files array and removedNavEntries for logging
 */
export function generateNextraFromArticles(
	articles: Array<Doc>,
	siteName: string,
	displayName: string,
	options?: DocGeneratorOptions,
): GenerateNextraResult {
	// Convert Doc models to ArticleInput
	const articleInputs = articles.map(docToArticleInput);

	// Fix folder paths for renamed folders. When a folder's title changes but its DB
	// slug/path stays the same, child articles' folderPath (derived from doc.path)
	// still references the old slug. This remaps them to match the title-derived slug.
	const folderSlugMapping = buildFolderSlugMapping(articles);
	if (folderSlugMapping.size > 0) {
		remapFolderPaths(articleInputs, folderSlugMapping);
	}

	// Build options object, only including defined properties
	const generatorOptions: Parameters<typeof generateSiteToMemory>[1] = {
		siteName,
		displayName,
	};

	if (options?.allowedDomain) {
		generatorOptions.auth = { allowedDomain: options.allowedDomain };
	}

	if (options?.regenerationMode !== undefined) {
		generatorOptions.regenerationMode = options.regenerationMode;
	}

	if (options?.migrationMode !== undefined) {
		generatorOptions.migrationMode = options.migrationMode;
	}

	if (options?.migrationContext !== undefined) {
		generatorOptions.migrationContext = options.migrationContext;
	}

	// Pass theme/branding configuration to the generator
	if (options?.theme !== undefined) {
		generatorOptions.theme = mapBrandingToThemeConfig(options.theme);
	}

	// When auto-sync is off, preserve existing _meta.ts order so user nav customizations survive publish
	if (options?.preserveNavOrder) {
		generatorOptions.preserveNavOrder = true;
	}

	// When auto-nav is ON, force articles into their space-derived folders
	if (options?.useSpaceFolderStructure) {
		generatorOptions.useSpaceFolderStructure = true;
	}

	// Call the nextra-generator library
	return generateSiteToMemory(articleInputs, generatorOptions);
}

/**
 * Converts ChangedArticle objects to DeletedArticle for the nextra-generator.
 * Only processes articles with changeType "deleted".
 */
function changedArticleToDeletedArticle(article: ChangedArticle): DeletedArticle {
	return {
		title: article.title,
		contentType: article.contentType,
		// isOpenApi is undefined since we don't have the content to check
		// The getDeletedFilePaths function will return all possible paths
	};
}

/**
 * Computes file paths to delete based on changed articles.
 * Filters to only deleted articles and returns their corresponding file paths.
 *
 * @param changedArticles - Array of changed articles from SiteDao.getChangedArticles()
 * @returns Array of file paths to delete from the repository
 */
export function getDeletedFilePathsFromChangedArticles(changedArticles: Array<ChangedArticle>): Array<string> {
	const deletedArticles = changedArticles
		.filter(article => article.changeType === "deleted")
		.map(changedArticleToDeletedArticle);

	return getDeletedFilePaths(deletedArticles);
}
