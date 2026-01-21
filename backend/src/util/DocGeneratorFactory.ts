import type { FileTree } from "../github/DocsiteGitHub";
import type { Doc } from "../model/Doc";
import { generateDocusaurusFromArticles } from "./DocusaurusGenerationUtil";
import { generateNextraFromArticles, getDeletedFilePathsFromChangedArticles } from "./NextraGenerationUtil";
import type { ChangedArticle, ExistingNavMeta, FolderMetaInfo } from "jolli-common";

export type DocFramework = "docusaurus-2" | "nextra";

/**
 * Migration context for Nextra 3.x to 4.x upgrade
 */
export interface MigrationContext {
	/** Existing theme config parsed from theme.config.jsx */
	themeConfig?: Record<string, unknown>;
	/** Existing navigation meta from _meta.ts (supports nested virtual groups) */
	existingNavMeta?: ExistingNavMeta;
	/** Slugs of deleted articles */
	deletedSlugs?: Array<string>;
	/** All folder _meta.ts files for multi-folder support */
	allFolderMetas?: Array<FolderMetaInfo>;
}

export interface DocGeneratorOptions {
	allowedDomain?: string; // For internal sites: domain-based authentication
	regenerationMode?: boolean; // If true, only generate MD/MDX files (exclude config files)
	/** @deprecated No longer used. _meta.ts is always regenerated to ensure consistency. */
	navigationChanged?: boolean;
	migrationMode?: boolean; // If true, force full regeneration (upgrade from Nextra 3.x to 4.x)
	migrationContext?: MigrationContext; // Context for 3.x to 4.x migration
}

/**
 * Result of generating documentation from articles
 */
export interface DocGeneratorResult {
	files: Array<FileTree>;
	removedNavEntries: Array<string>; // Navigation entries removed during _meta.ts merge
}

export interface DocGenerator {
	generateFromArticles(
		articles: Array<Doc>,
		siteName: string,
		displayName: string,
		options?: DocGeneratorOptions,
	): DocGeneratorResult;
	getFrameworkIdentifier(): DocFramework;
	/**
	 * Computes file paths to delete based on changed articles.
	 * Filters to only deleted articles and returns their corresponding file paths.
	 * @param changedArticles - Array of changed articles (includes new, updated, deleted)
	 * @returns Array of file paths to delete from the repository
	 */
	getDeletedFilePaths(changedArticles: Array<ChangedArticle>): Array<string>;
}

/**
 * Docusaurus generator implementation
 */
class DocusaurusGenerator implements DocGenerator {
	generateFromArticles(
		articles: Array<Doc>,
		siteName: string,
		displayName: string,
		options?: DocGeneratorOptions,
	): DocGeneratorResult {
		const files = generateDocusaurusFromArticles(articles, siteName, displayName, options);
		// Docusaurus doesn't have _meta.ts merge, so no removed entries
		return { files, removedNavEntries: [] };
	}

	getFrameworkIdentifier(): DocFramework {
		return "docusaurus-2";
	}

	getDeletedFilePaths(_changedArticles: Array<ChangedArticle>): Array<string> {
		// Docusaurus generator doesn't support JSON/YAML article deletion
		// MD/MDX files are already handled by the GitHub client
		return [];
	}
}

/**
 * Nextra generator implementation
 */
class NextraGenerator implements DocGenerator {
	generateFromArticles(
		articles: Array<Doc>,
		siteName: string,
		displayName: string,
		options?: DocGeneratorOptions,
	): DocGeneratorResult {
		return generateNextraFromArticles(articles, siteName, displayName, options);
	}

	getFrameworkIdentifier(): DocFramework {
		return "nextra";
	}

	getDeletedFilePaths(changedArticles: Array<ChangedArticle>): Array<string> {
		return getDeletedFilePathsFromChangedArticles(changedArticles);
	}
}

/**
 * Factory for creating documentation generators based on framework type
 */
export function createDocGenerator(framework: DocFramework): DocGenerator {
	switch (framework) {
		case "docusaurus-2":
			return new DocusaurusGenerator();
		case "nextra":
			return new NextraGenerator();
		default:
			throw new Error(`Unsupported framework: ${framework}`);
	}
}

/**
 * Gets a list of all supported frameworks
 */
export function getSupportedFrameworks(): Array<DocFramework> {
	return ["docusaurus-2", "nextra"];
}

/**
 * Validates if a framework is supported
 */
export function isValidFramework(framework: string): framework is DocFramework {
	return getSupportedFrameworks().includes(framework as DocFramework);
}
