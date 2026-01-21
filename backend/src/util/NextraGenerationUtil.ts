/**
 * Thin wrapper around the nextra-generator library.
 * Converts backend Doc models to ArticleInput and calls generateSiteToMemory.
 */

import type { Doc } from "../model/Doc";
import type { DocGeneratorOptions } from "./DocGeneratorFactory";
import type { ChangedArticle } from "jolli-common";
import type { ArticleInput, DeletedArticle, FileTree } from "nextra-generator";
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
export type { FileTree } from "nextra-generator";

// Re-export migration utilities
export { convertToNextra4Config, getNextra3xFilesToDelete, parseNextra3ThemeConfig };

// Re-export MetaMerger for _meta.ts validation and merging
export { MetaMerger };

// Re-export orphaned file detection
export { getOrphanedContentFiles };

// Re-export slugify for slug computation
export { slugify };

/**
 * Converts a Doc model to an ArticleInput for the nextra-generator library.
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
	return result;
}

/**
 * Result of generating a Nextra project
 */
export interface GenerateNextraResult {
	files: Array<FileTree>;
	removedNavEntries: Array<string>; // Navigation entries removed during merge
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

	// Note: navigationChanged is deprecated and no longer passed.
	// _meta.ts is always regenerated to ensure it matches article content files.

	if (options?.migrationMode !== undefined) {
		generatorOptions.migrationMode = options.migrationMode;
	}

	if (options?.migrationContext !== undefined) {
		generatorOptions.migrationContext = options.migrationContext;
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
