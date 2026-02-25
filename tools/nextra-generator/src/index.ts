/**
 * Nextra Site Generator
 *
 * A portable library for generating Nextra 4.x documentation sites
 * with App Router support.
 */

// CLI
export { main as cli } from "./Cli.js";
// Generators - file-based
export { generateAppRouterSite, generateSite, getNextra3xFilesToDelete } from "./generators/index.js";
export type { GenerateSiteToMemoryResult } from "./generators/memory.js";
// Generators - in-memory (main API for backend integration)
export { generateSiteToMemory, getArticleSlug } from "./generators/memory.js";
// Auth templates
export { generateAuthLayout, generateAuthLib } from "./templates/auth.js";
// Types
export type {
	// Re-exported from jolli-common
	ApiEndpoint,
	ApiInfo,
	// New types for in-memory generation
	ArticleInput,
	ArticleMetadata,
	AuthConfig,
	// Theme-related types
	ChatIconType,
	DefaultThemeType,
	// Deleted article type for file deletion
	DeletedArticle,
	// Migration types
	ExistingRepoFile,
	FileTree,
	GenerateToMemoryOptions,
	// Existing types
	GeneratorConfig,
	GeneratorResult,
	InputFile,
	InputFileType,
	MigrationContext,
	NavigationConfig,
	OpenApiConfig,
	OpenApiParsedSpec,
	OpenApiSpec,
	OpenApiValidationError,
	OpenApiValidationResult,
	PageConfig,
	PageMeta,
	RouterType,
	TemplateFile,
	ThemeConfig,
} from "./types.js";
// Content utilities
export {
	detectsAsJson,
	detectsAsYaml,
	escapeYaml,
	generateApiInteractiveContent,
	generateApiOverviewContent,
	generateArticleContent,
	generateIndexContent,
	generateNavMeta,
	getDeletedFilePaths,
	getEffectiveContentType,
	getNonSlugifiedFolderPaths,
	getOrphanedContentFiles,
	isValidUrl,
	parseOpenApiSpec,
	slugify,
} from "./utils/content.js";
// File utilities
export { copyFile, ensureDir, exists, readFile, writeFile } from "./utils/file.js";
// Input file utilities
export {
	buildNavigationMeta,
	extractTitleFromContent,
	extractTitleFromFilename,
	getFileType,
	processInputFiles,
	scanDirectory,
} from "./utils/input-files.js";
// Multi-folder meta types
export type { FolderMetaInfo, MergeAllMetaOptions } from "./utils/MetaMerger.js";
// MetaMerger - centralized _meta.ts validation and merge logic (replaces deprecated migration functions)
export {
	type FolderMergeResult,
	type MergeAllResult,
	type MergeOptions,
	type MergeReport,
	type MetaMergeResult,
	MetaMerger,
} from "./utils/MetaMerger.js";
export type { ExistingNavMeta, MigrationParseResult, Nextra3Config } from "./utils/migration.js";
// Migration utilities (Nextra 3.x to 4.x)
export {
	convertToNextra4Config,
	isNextra3xFile,
	NEXTRA_3X_FILES_TO_DELETE,
	parseNextra3ThemeConfig,
} from "./utils/migration.js";
// OpenAPI utilities
export { extractApiInfo, loadOpenApiSpec } from "./utils/openapi.js";
// Reserved words utilities (safe slug generation)
export { getAllReservedWords, isReservedSlug } from "./utils/reserved-words.js";
// Validation types are imported from jolli-common and re-exported for convenience
export type { ConsistencyValidationResult, SyntaxValidationResult } from "jolli-common";

import { generateSite } from "./generators/index.js";
// Main class-based API
import type { GeneratorConfig, GeneratorResult, InputFile, OpenApiConfig, PageConfig, ThemeConfig } from "./types.js";
import { copyFile, resolvePath, writeFile } from "./utils/file.js";
import { processInputFiles, scanDirectory } from "./utils/input-files.js";

/**
 * NextraGenerator - Main class for generating Nextra 4.x sites
 *
 * @example
 * ```typescript
 * const generator = new NextraGenerator({
 *   router: 'app',
 *   outputDir: './my-docs',
 *   theme: { logo: 'My Docs' }
 * })
 *
 * await generator.init()
 * await generator.addPage('guide', '# Guide\n\nContent here...')
 * await generator.addOpenApiSpec('./openapi.json')
 *
 * // Or with input files
 * const generator = new NextraGenerator({
 *   router: 'app',
 *   outputDir: './my-docs',
 *   inputFiles: [
 *     { sourcePath: './docs/guide.md' },
 *     { sourcePath: './docs/api.mdx', targetPath: 'api-reference/overview' },
 *     { sourcePath: './openapi.json' }
 *   ]
 * })
 * await generator.init()
 * ```
 */
export class NextraGenerator {
	private config: GeneratorConfig;
	private initialized = false;

	constructor(
		config: Omit<GeneratorConfig, "pages" | "openApi" | "inputFiles"> & {
			pages?: Array<PageConfig>;
			openApi?: Array<OpenApiConfig>;
			inputFiles?: Array<InputFile>;
		},
	) {
		this.config = {
			...config,
			pages: config.pages || [],
			openApi: config.openApi || [],
			inputFiles: config.inputFiles || [],
		};
	}

	/**
	 * Initialize the Nextra site with base templates
	 */
	async init(): Promise<GeneratorResult> {
		const result = await generateSite(this.config);
		this.initialized = true;
		return result;
	}

	/**
	 * Add a new page to the site
	 */
	async addPage(pagePath: string, content: string, _title?: string): Promise<void> {
		// Nextra 4.x uses content/ folder for MD files (lenient parsing)
		const filePath = resolvePath(this.config.outputDir, `content/${pagePath}.md`);
		await writeFile(filePath, content);
	}

	/**
	 * Add an OpenAPI specification to the site
	 */
	async addOpenApiSpec(specPath: string, _outputPath = "api-reference"): Promise<void> {
		const destPath = resolvePath(this.config.outputDir, "public/openapi.json");
		await copyFile(specPath, destPath);
	}

	/**
	 * Add input files (mdx, md, json) to the site
	 */
	async addInputFiles(inputFiles: Array<InputFile>): Promise<{ added: Array<string>; errors: Array<string> }> {
		const { pages, jsonFiles, errors } = await processInputFiles(inputFiles, this.config.router);
		const added: Array<string> = [];

		// Nextra 4.x uses content/ folder for MD files (lenient parsing)
		const basePath = "content";

		for (const page of pages) {
			const filePath = resolvePath(this.config.outputDir, `${basePath}/${page.path}.md`);
			await writeFile(filePath, page.content);
			added.push(`${basePath}/${page.path}.md`);
		}

		// Handle OpenAPI JSON files
		for (const jsonFile of jsonFiles) {
			const jsonData = jsonFile.data as Record<string, unknown>;
			if ("openapi" in jsonData || "swagger" in jsonData) {
				const specDestPath = resolvePath(this.config.outputDir, "public/openapi.json");
				await writeFile(specDestPath, JSON.stringify(jsonData, null, 2));
				added.push("public/openapi.json");
			}
		}

		return { added, errors };
	}

	/**
	 * Add all files from a directory
	 */
	async addFromDirectory(dirPath: string): Promise<{ added: Array<string>; errors: Array<string> }> {
		const inputFiles = await scanDirectory(dirPath);
		return this.addInputFiles(inputFiles);
	}

	/**
	 * Add a single file by path
	 */
	async addFile(sourcePath: string, targetPath?: string, title?: string): Promise<void> {
		const inputFile: InputFile = { sourcePath };
		if (targetPath !== undefined) {
			inputFile.targetPath = targetPath;
		}
		if (title !== undefined) {
			inputFile.title = title;
		}
		await this.addInputFiles([inputFile]);
	}

	/**
	 * Update theme configuration
	 */
	updateTheme(theme: Partial<ThemeConfig>): void {
		if (this.config.theme) {
			this.config.theme = { ...this.config.theme, ...theme } as ThemeConfig;
		} else {
			this.config.theme = theme as ThemeConfig;
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): GeneratorConfig {
		return { ...this.config };
	}

	/**
	 * Check if site has been initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}
}

export default NextraGenerator;
