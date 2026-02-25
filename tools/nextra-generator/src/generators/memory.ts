import {
	generateApiDocsHtml,
	generateApiDocsPage,
	generateApiReferenceComponent,
	generateCatchAllPage,
	generateContentMeta,
	generateFaviconRoute,
	generateGlobalStyles,
	generateIconComponent,
	generateLayout,
	generateMdxComponents,
	generateNextConfig,
	generateNoArticlesPage,
	generateRootRedirectPage,
	generateTsConfig,
	type MenuItemWithHref,
	type MenuNavMeta,
	type NavMeta,
} from "../templates/app-router/index.js";
import { generateAuthLayout, generateAuthLib } from "../templates/auth.js";
import { generateJwtAuthCallback, generateJwtAuthLib, generateJwtMiddleware } from "../templates/JwtAuth.js";
import type {
	ApiPageMeta,
	ArticleInput,
	ArticleMetadata,
	FileTree,
	GenerateToMemoryOptions,
	OpenApiSpecInfo,
	ThemeConfig,
} from "../types.js";
import {
	generateArticleContent,
	generateNavMeta,
	getEffectiveContentType,
	parseOpenApiSpec,
	slugify,
} from "../utils/content.js";
import { MetaMerger } from "../utils/MetaMerger.js";
import {
	type ExistingNavMeta,
	isApiPageEntry,
	isExternalLink,
	isSeparator,
	isVirtualGroup,
} from "../utils/migration.js";
import { escapeJsString } from "../utils/sanitize.js";
import type { FolderMetaInfo } from "jolli-common";

export function getArticleSlug(article: ArticleInput): string {
	if (article.slug) {
		return article.slug;
	}
	const metadata = article.contentMetadata as ArticleMetadata | undefined;
	const title = metadata?.title || "Untitled Article";
	return slugify(title);
}

/** e.g., "Getting Started/Advanced" -> "getting-started/advanced" */
function slugifyPath(path: string): string {
	return path
		.split("/")
		.map(segment => slugify(segment))
		.join("/");
}

/**
 * Type guard for page type entries (e.g., { title: 'Guides', type: 'page' }).
 * These are used in tabs mode for folder navigation entries.
 * Unlike API page entries, they don't have an href property.
 */
function isPageTypeEntry(entry: unknown): entry is { type: "page"; title: string } {
	return (
		typeof entry === "object" &&
		entry !== null &&
		"type" in entry &&
		(entry as Record<string, unknown>).type === "page" &&
		!("href" in entry) // Distinguishes from API page entries which have href
	);
}

/** Key for optional ThemeConfig properties that can be copied from user-provided theme. */
type OptionalThemeKey = Exclude<keyof ThemeConfig, "logo" | "docsRepositoryBase">;

/**
 * Builds the theme configuration for in-memory generation.
 * Merges user-provided theme options with defaults.
 * Only includes properties that have defined values to satisfy exactOptionalPropertyTypes.
 */
function buildThemeConfig(displayName: string, siteName: string, userTheme?: Partial<ThemeConfig>): ThemeConfig {
	const config: ThemeConfig = {
		logo: userTheme?.logo ?? displayName,
		docsRepositoryBase: userTheme?.docsRepositoryBase ?? `https://github.com/Jolli-sample-repos/${siteName}`,
	};

	if (!userTheme) {
		return config;
	}

	// Copy optional properties that have defined values
	const optionalKeys: ReadonlyArray<OptionalThemeKey> = [
		"logoUrl",
		"logoDisplay",
		"favicon",
		"primaryHue",
		"footer",
		"defaultTheme",
		"projectLink",
		"chatLink",
		"chatIcon",
		"hideToc",
		"tocTitle",
		"sidebarDefaultCollapseLevel",
		"headerLinks",
		"footerConfig",
		"fontFamily",
		"codeTheme",
		"borderRadius",
		"spacingDensity",
		"navigationMode",
		"pageWidth",
		"contentWidth",
		"sidebarWidth",
		"tocWidth",
		"headerAlignment",
	];
	for (const key of optionalKeys) {
		if (userTheme[key] !== undefined) {
			(config as Record<OptionalThemeKey, unknown>)[key] = userTheme[key];
		}
	}

	return config;
}

/**
 * Builds a map from article slug to folder path from existing folder metadata.
 * Used to preserve article locations during site rebuild.
 *
 * @param allFolderMetas - Array of folder metadata with slugs in each folder
 * @returns Map from slug to folder path (empty string for root content folder)
 */
function buildSlugToFolderMap(allFolderMetas?: Array<FolderMetaInfo>): Map<string, string> {
	const map = new Map<string, string>();
	if (!allFolderMetas) {
		return map;
	}

	for (const folder of allFolderMetas) {
		// Empty folder path = root content folder, keep as empty string
		// Non-empty: slugify folder paths to avoid spaces and special characters in filesystem paths
		// e.g., "Getting Started" -> "getting-started"
		// Nested folders: "Guides/Advanced" -> "guides/advanced"
		const slugifiedPath = folder.folderPath ? slugifyPath(folder.folderPath) : "";
		for (const slug of folder.slugs) {
			map.set(slug, slugifiedPath);
		}
	}
	return map;
}

/**
 * Generates custom package.json with Jolli branding and optional auth (Nextra 4.x).
 * Includes pagefind for search functionality.
 * Note: The build script chains pagefind directly to ensure it runs on all platforms
 * (Vercel runs `next build` directly which skips npm postbuild hooks).
 */
function generateJolliPackageJson(siteName: string, allowedDomain?: string): string {
	const pkg: Record<string, unknown> = {
		name: siteName,
		version: "1.0.0",
		description: "Documentation generated by Jolli",
		type: "module",
		scripts: {
			dev: "next dev",
			build: "next build && pagefind --site .next/server/app --output-path public/_pagefind",
			start: "next start",
		},
		keywords: ["documentation", "nextra"],
		author: "Jolli",
		license: "MIT",
		dependencies: {
			next: "^15.0.0",
			nextra: "^4.6.1",
			"nextra-theme-docs": "^4.6.1",
			react: "^19.0.0",
			"react-dom": "^19.0.0",
		},
		devDependencies: {
			"@types/node": "^20.0.0",
			"@types/react": "^19.0.0",
			pagefind: "^1.3.0",
			typescript: "^5.0.0",
		},
	};

	// Add authentication dependencies if needed
	if (allowedDomain) {
		(pkg.dependencies as Record<string, string>)["@auth0/auth0-react"] = "^2.2.0";
	}

	// Always add JWT authentication dependencies (middleware checks env var at runtime)
	(pkg.dependencies as Record<string, string>).jose = "^5.2.0";

	return JSON.stringify(pkg, null, 2);
}

const VERCEL_JSON = JSON.stringify(
	{ buildCommand: "npm run build", outputDirectory: ".next", framework: "nextjs" },
	null,
	2,
);

const GITIGNORE = `# dependencies
node_modules
.pnp
.pnp.js

# testing
coverage

# next.js
.next/
out/
build

# pagefind search index (generated at build time)
public/_pagefind/

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
`;

/**
 * Builds folder metadata from articles' folderPath.
 * Used for initial generation when there's no existing GitHub repo.
 *
 * @param articles - Articles with folderPath from Jolli's hierarchy
 * @returns Array of FolderMetaInfo built from articles' folder paths
 */
function buildFolderMetasFromArticles(articles: Array<ArticleInput>): Array<FolderMetaInfo> {
	// Group articles by their slugified folder path
	const folderMap = new Map<string, Array<string>>();

	for (const article of articles) {
		const slug = getArticleSlug(article);

		// For folder documents, the slug IS the folder path (they create their own folder)
		// For regular documents, use their folderPath to determine parent folder
		let folderPath = "";
		if (article.isFolder) {
			// Folder documents: add to their parent's folder path (which may be empty for root)
			if (article.folderPath) {
				folderPath = slugifyPath(article.folderPath);
			}
			// Also register the folder itself so its children can be grouped
			const selfFolderPath = folderPath ? `${folderPath}/${slug}` : slug;
			if (!folderMap.has(selfFolderPath)) {
				folderMap.set(selfFolderPath, []);
			}
		} else if (article.folderPath) {
			// Regular documents: use their folderPath
			folderPath = slugifyPath(article.folderPath);
		}

		if (!folderMap.has(folderPath)) {
			folderMap.set(folderPath, []);
		}
		folderMap.get(folderPath)?.push(slug);
	}

	// Convert map to FolderMetaInfo array
	const folderMetas: Array<FolderMetaInfo> = [];
	for (const [folderPath, slugs] of folderMap) {
		folderMetas.push({
			folderPath,
			slugs,
			metaContent: "", // No existing content for initial generation
		});
	}

	return folderMetas;
}

/**
 * Reorders slugs to match a desired ordering (e.g., from space sortOrder).
 * Slugs not in the desired order are appended at the end.
 */
function reorderSlugs(slugs: Array<string>, desiredOrder: Array<string>): Array<string> {
	const orderIndex = new Map<string, number>();
	for (let i = 0; i < desiredOrder.length; i++) {
		orderIndex.set(desiredOrder[i], i);
	}
	return [...slugs].sort((a, b) => {
		const aIdx = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
		const bIdx = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
		return aIdx - bIdx;
	});
}

/**
 * Reorders a NavMeta object to match the desired entry order.
 * Entries in desiredOrder come first (in that order), followed by any remaining entries.
 * Preserves user customizations (titles, separators, virtual groups) while
 * applying the space's article ordering.
 */
function reorderNavMeta(meta: NavMeta, desiredOrder: Array<string>): NavMeta {
	const result: NavMeta = {};

	// First, add entries in the desired order (if they exist in meta)
	for (const slug of desiredOrder) {
		if (slug in meta) {
			result[slug] = meta[slug];
		}
	}

	// Then, add any remaining entries not in the desired order (separators, virtual groups, etc.)
	for (const [key, value] of Object.entries(meta)) {
		if (!(key in result)) {
			result[key] = value;
		}
	}

	return result;
}

/**
 * Ensures parent folders of active subfolders are included in the active list.
 * During regeneration, allFolderMetas (built from the repo) only tracks .md/.mdx file
 * slugs — not subfolder names. A parent folder that contains only subfolders (no direct
 * articles) would have empty slugs, fail the "hasChildren" check, and be excluded.
 * This causes the parent to be marked as empty and deleted, wiping out the subtree.
 *
 * Mutates `activeFolders` in place to add missing parents.
 */
function ensureParentFoldersIncluded(
	activeFolders: Array<FolderMetaInfo>,
	allFolderMetas: Array<FolderMetaInfo>,
	foldersFromArticles: Array<FolderMetaInfo>,
): void {
	const activePaths = new Set(
		activeFolders.map(f => (f.folderPath ? slugifyPath(f.folderPath) : "")).filter(Boolean),
	);

	// Collect all parent paths that need to exist
	const missingParents = new Set<string>();
	for (const path of activePaths) {
		const segments = path.split("/");
		for (let i = 1; i < segments.length; i++) {
			const parentPath = segments.slice(0, i).join("/");
			if (!activePaths.has(parentPath)) {
				missingParents.add(parentPath);
			}
		}
	}

	if (missingParents.size === 0) {
		return;
	}

	// Add missing parents from allFolderMetas (preserves metaContent) or foldersFromArticles
	const existingLookup = new Map<string, FolderMetaInfo>();
	for (const folder of allFolderMetas) {
		const sp = folder.folderPath ? slugifyPath(folder.folderPath) : "";
		if (sp) {
			existingLookup.set(sp, folder);
		}
	}
	const articleLookup = new Map<string, FolderMetaInfo>();
	for (const folder of foldersFromArticles) {
		if (folder.folderPath) {
			articleLookup.set(folder.folderPath, folder);
		}
	}

	for (const parentPath of missingParents) {
		const fromRepo = existingLookup.get(parentPath);
		if (fromRepo) {
			activeFolders.push({ ...fromRepo, slugs: [] });
		} else {
			const fromArticles = articleLookup.get(parentPath);
			activeFolders.push(fromArticles ?? { folderPath: parentPath, metaContent: "", slugs: [] });
		}
		activePaths.add(parentPath);
	}
}

function computeActiveFolders(
	articles: Array<ArticleInput>,
	foldersWithContent: Set<string>,
	allFolderMetas?: Array<FolderMetaInfo>,
	useSpaceFolderStructure?: boolean,
): Array<FolderMetaInfo> {
	// Always build folder info from current articles to discover new folders
	const foldersFromArticles = buildFolderMetasFromArticles(articles);

	// For initial generation (no existing folder metadata), use articles-derived folders
	// but filter out empty folders (no content AND no children)
	if (!allFolderMetas || allFolderMetas.length === 0) {
		return foldersFromArticles.filter(folder => {
			// Root folder is always included
			if (!folder.folderPath) {
				return true;
			}
			// Include if folder has children OR content
			return folder.slugs.length > 0 || foldersWithContent.has(folder.folderPath);
		});
	}

	// Build a map of folder paths from allFolderMetas for quick lookup
	const existingFolderMap = new Map<string, FolderMetaInfo>();
	for (const folder of allFolderMetas) {
		existingFolderMap.set(folder.folderPath, folder);
	}

	// Build folder-specific slug sets and ordering from current articles.
	// Using folder-specific sets (instead of a global slug set) ensures that when
	// a folder is renamed, the OLD folder path has no matching slugs and is excluded.
	const articleFolderSlugs = new Map<string, Set<string>>();
	const articleFolderOrder = new Map<string, Array<string>>();
	for (const folder of foldersFromArticles) {
		articleFolderSlugs.set(folder.folderPath, new Set(folder.slugs));
		articleFolderOrder.set(folder.folderPath, folder.slugs);
	}

	// Merge: start with existing folders filtered to active slugs, then add new folders from articles
	const activeFolders: Array<FolderMetaInfo> = [];

	// Process existing folders from repo (preserves metaContent for customizations)
	for (const folder of allFolderMetas) {
		// Slugify the folder path to match the format used by buildFolderMetasFromArticles
		const slugifiedPath = folder.folderPath ? slugifyPath(folder.folderPath) : "";

		// Filter slugs to only include those that exist in current articles FOR THIS FOLDER.
		// This is folder-specific (not global) so renamed folders correctly lose their slugs.
		const currentFolderSlugs = articleFolderSlugs.get(slugifiedPath);
		let activeSlugs: Array<string>;
		if (useSpaceFolderStructure && currentFolderSlugs) {
			// When auto-nav is ON, use the full article-derived slug list for this folder.
			// This ensures articles that were manually moved elsewhere in the repo are placed
			// back into their space-defined folder.
			activeSlugs = [...currentFolderSlugs];
		} else {
			activeSlugs = currentFolderSlugs ? folder.slugs.filter(slug => currentFolderSlugs.has(slug)) : [];
		}

		// Reorder active slugs to match current space ordering (not repo's existing order)
		const spaceOrder = articleFolderOrder.get(slugifiedPath);
		if (spaceOrder) {
			activeSlugs = reorderSlugs(activeSlugs, spaceOrder);
		}

		const isRootFolder = !folder.folderPath;
		const hasChildren = activeSlugs.length > 0;
		const hasContent = foldersWithContent.has(slugifiedPath);

		if (isRootFolder || hasChildren || hasContent) {
			activeFolders.push({
				...folder,
				slugs: activeSlugs,
			});
		}
	}

	// Add NEW folders discovered from articles that don't exist in repo yet
	// Also check slugified versions to avoid duplicating folders that differ only in casing
	const existingSlugifiedPaths = new Set<string>();
	for (const folder of allFolderMetas) {
		const sp = folder.folderPath ? slugifyPath(folder.folderPath) : "";
		existingSlugifiedPaths.add(sp);
	}

	for (const folder of foldersFromArticles) {
		// Skip if this folder already exists in allFolderMetas (already processed above)
		// Check both exact path and slugified path to avoid duplicates
		if (existingFolderMap.has(folder.folderPath) || existingSlugifiedPaths.has(folder.folderPath)) {
			continue;
		}
		// Only add if folder has content OR children (filter out empty folders)
		const isRootFolder = !folder.folderPath;
		const hasChildren = folder.slugs.length > 0;
		const hasContent = foldersWithContent.has(folder.folderPath);

		if (isRootFolder || hasChildren || hasContent) {
			activeFolders.push(folder);
		}
	}

	// Ensure parent folders of active subfolders are preserved.
	// A folder like "contributing-rename" that contains only subfolders (no direct article
	// files) would be missed above because allFolderMetas (from the repo) only tracks .md/.mdx
	// file slugs, not subfolder names. Without this pass, parent folders get incorrectly
	// marked as empty and deleted, wiping out the entire subtree.
	ensureParentFoldersIncluded(activeFolders, allFolderMetas, foldersFromArticles);

	return activeFolders;
}

/**
 * Extracts known folder paths from active folders.
 * Used to preserve folder entries during nav meta merge.
 *
 * Only includes folders that have active articles, not all folders from GitHub.
 */
function extractKnownFolders(activeFolders: Array<FolderMetaInfo>): Array<string> {
	const knownFolders: Array<string> = [];
	for (const folder of activeFolders) {
		// Only include top-level folders for the root _meta.ts merge.
		// The MetaMerger extracts just the last path segment (split("/").pop()),
		// so including nested folders like "guides/workflows" would incorrectly
		// preserve a root-level "workflows" entry even if it no longer exists.
		if (folder.folderPath && !folder.folderPath.includes("/")) {
			knownFolders.push(folder.folderPath);
		}
	}
	return knownFolders;
}

/**
 * Computes folders that have become empty and should be deleted.
 * Compares original folder structure with active folders (folders with current articles).
 *
 * A folder is considered empty if:
 * - It existed in the original allFolderMetas (had a folderPath)
 * - It is not present in activeFolders (has no current articles)
 *
 * Returns folder paths relative to content/ (e.g., "guides", "tutorials/advanced")
 */
function computeEmptyFolders(
	allFolderMetas: Array<FolderMetaInfo> | undefined,
	activeFolders: Array<FolderMetaInfo>,
): Array<string> {
	if (!allFolderMetas || allFolderMetas.length === 0) {
		return [];
	}

	// Build set of active folder paths (slugified)
	const activeFolderPaths = new Set<string>();
	for (const folder of activeFolders) {
		if (folder.folderPath) {
			activeFolderPaths.add(slugifyPath(folder.folderPath));
		}
	}

	// Find folders that exist in allFolderMetas but not in activeFolders
	const emptyFolders: Array<string> = [];
	for (const folder of allFolderMetas) {
		if (folder.folderPath) {
			const slugifiedPath = slugifyPath(folder.folderPath);

			// If this folder is not in active folders, it's now empty
			if (!activeFolderPaths.has(slugifiedPath)) {
				// Return the content/ prefixed path for deletion
				emptyFolders.push(`content/${slugifiedPath}`);
			}
		}
	}

	return emptyFolders;
}

/**
 * Detects content files that moved to a different folder when useSpaceFolderStructure is enabled.
 * Returns the old file paths (in the repo) that should be deleted since new files are generated
 * at the correct space-derived locations.
 */
function computeRelocatedFilePaths(
	articles: Array<ArticleInput>,
	allFolderMetas: Array<FolderMetaInfo> | undefined,
	useSpaceFolderStructure?: boolean,
): Array<string> {
	if (!useSpaceFolderStructure || !allFolderMetas || allFolderMetas.length === 0) {
		return [];
	}

	// Build the old slug-to-folder map from the repo structure
	const repoSlugToFolder = buildSlugToFolderMap(allFolderMetas);
	const relocated: Array<string> = [];

	for (const article of articles) {
		const slug = getArticleSlug(article);
		const spaceFolderPath = article.folderPath ? slugifyPath(article.folderPath) : "";
		const repoFolderPath = repoSlugToFolder.get(slug);

		// If the article exists in the repo at a different location, mark the old path for deletion
		if (repoFolderPath !== undefined && repoFolderPath !== spaceFolderPath) {
			const oldBasePath = repoFolderPath ? `content/${repoFolderPath}` : "content";

			if (article.isFolder) {
				// Folder articles generate index.md or overview.md inside their folder
				relocated.push(`${oldBasePath}/${slug}/index.md`);
				relocated.push(`${oldBasePath}/${slug}/index.mdx`);
				relocated.push(`${oldBasePath}/${slug}/overview.md`);
				relocated.push(`${oldBasePath}/${slug}/overview.mdx`);
			} else {
				// Regular articles - try all extensions since we don't know which was used
				relocated.push(`${oldBasePath}/${slug}.md`);
				relocated.push(`${oldBasePath}/${slug}.mdx`);
			}
		}
	}

	return relocated;
}

/**
 * Computes orphaned _meta.ts files that need deletion.
 * These are folders that had _meta.ts in the previous build but now have no articles
 * (though they may still have index.md folder content). Without deletion, the old
 * _meta.ts with stale article references causes validation errors.
 *
 * @param allFolderMetas - Previous folder state from repo
 * @param activeFolders - Current folders with articles
 * @param foldersWithContent - Folders that have index.md (folder documents)
 * @returns Array of _meta.ts file paths to delete
 */
function computeOrphanedMetaFiles(
	allFolderMetas: Array<FolderMetaInfo> | undefined,
	activeFolders: Array<FolderMetaInfo>,
): Array<string> {
	if (!allFolderMetas || allFolderMetas.length === 0) {
		return [];
	}

	const orphanedPaths: Array<string> = [];

	for (const oldFolder of allFolderMetas) {
		// Skip root folder (handled separately)
		if (!oldFolder.folderPath) {
			continue;
		}

		// Only process folders that had articles before
		if (oldFolder.slugs.length === 0) {
			continue;
		}

		const slugifiedPath = slugifyPath(oldFolder.folderPath);

		// Check if folder still has articles in activeFolders
		const stillActive = activeFolders.find(f => {
			const activePath = f.folderPath ? slugifyPath(f.folderPath) : "";
			return activePath === slugifiedPath;
		});

		// If folder no longer has articles (not in activeFolders), its _meta.ts is orphaned
		if (!stillActive) {
			orphanedPaths.push(`content/${slugifiedPath}/_meta.ts`);
		}
	}

	return orphanedPaths;
}

/**
 * Builds merge options for MetaMerger from generation context.
 *
 * @param baseNavMeta - Fresh nav meta generated from current articles
 * @param migrationContext - Context with existing nav meta and folder structure
 * @param activeFolders - Pre-computed active folders (folders with current articles)
 */
function buildMergeOptions(
	baseNavMeta: NavMeta,
	migrationContext: {
		existingNavMeta?: ExistingNavMeta;
		deletedSlugs?: Array<string>;
		allFolderMetas?: Array<FolderMetaInfo>;
	},
	activeFolders: Array<FolderMetaInfo>,
): Parameters<MetaMerger["mergeFromParsed"]>[0] {
	const newSlugs = Object.keys(baseNavMeta);
	const articleTitles = new Map<string, string>();
	for (const [slug, value] of Object.entries(baseNavMeta)) {
		if (typeof value === "string") {
			articleTitles.set(slug, value);
		}
	}

	// Use active folders (folders with current articles) instead of all folders from GitHub
	// This ensures deleted folders are removed from _meta.ts
	const knownFolders = extractKnownFolders(activeFolders);

	// Build merge options, only including defined values (exactOptionalPropertyTypes)
	const mergeOptions: Parameters<MetaMerger["mergeFromParsed"]>[0] = {
		existingMeta: migrationContext.existingNavMeta as ExistingNavMeta,
		newArticleSlugs: newSlugs,
		articleTitles,
	};
	if (migrationContext.deletedSlugs !== undefined) {
		mergeOptions.deletedSlugs = migrationContext.deletedSlugs;
	}
	if (baseNavMeta !== undefined) {
		mergeOptions.baseNavMeta = baseNavMeta;
	}
	if (knownFolders.length > 0) {
		mergeOptions.knownFolders = knownFolders;
	}
	return mergeOptions;
}

/**
 * Converts MetaMerger result back to NavMeta format.
 * Handles API page entries, virtual groups, and complex entries.
 *
 * For nav-* entries (header links), we skip old entries from the merge result
 * and add fresh ones from baseNavMeta. This ensures header links always have
 * the correct format (type: 'page' for navbar display in Nextra 4.x).
 */
function convertMergeResultToNavMeta(
	mergeResult: ReturnType<MetaMerger["mergeFromParsed"]>,
	baseNavMeta: NavMeta,
): NavMeta {
	const finalNavMeta: NavMeta = {};
	if (!mergeResult.meta) {
		return finalNavMeta;
	}

	for (const [slug, entry] of Object.entries(mergeResult.meta)) {
		// Skip nav-* entries from merge result - old entries may have wrong format
		// We'll add fresh ones from baseNavMeta below
		if (slug.startsWith("nav-")) {
			continue;
		}

		// Use the baseNavMeta's index entry (hidden index) if it exists
		// This ensures we always have the hidden index even during merge
		if (slug === "index") {
			if (baseNavMeta.index !== undefined) {
				finalNavMeta[slug] = baseNavMeta.index;
			}
			continue;
		}

		const baseEntry = baseNavMeta[slug];
		if (typeof entry === "string") {
			// Simple string entry - use API page entry from base if it exists
			if (typeof baseEntry === "object") {
				finalNavMeta[slug] = baseEntry;
			} else {
				finalNavMeta[slug] = entry;
			}
		} else if (isVirtualGroup(entry)) {
			// Virtual group - preserve it as-is (already filtered by MetaMerger)
			finalNavMeta[slug] = entry;
		} else if (isExternalLink(entry)) {
			// External link entries (e.g., mailto:, custom user links) - preserve as-is
			finalNavMeta[slug] = entry;
		} else if (isApiPageEntry(entry)) {
			// API page entry - only preserve if it exists in the new generation
			// This filters out stale API entries when OpenAPI specs are removed
			if (baseNavMeta[slug] !== undefined) {
				finalNavMeta[slug] = entry;
			}
		} else if (isSeparator(entry)) {
			// Separator entries are always preserved
			finalNavMeta[slug] = entry;
		} else if (isPageTypeEntry(entry)) {
			// Page type entries (e.g., { title: 'Guides', type: 'page' } for tabs mode)
			// Only preserve if the slug exists in baseNavMeta (current articles/folders)
			// This filters out orphaned folder tab entries from previous generations
			if (baseNavMeta[slug] !== undefined) {
				finalNavMeta[slug] = entry;
			}
		} else {
			// Other complex entries - preserve only if they exist in baseNavMeta
			// This prevents orphaned entries from sneaking through
			if (baseNavMeta[slug] !== undefined) {
				finalNavMeta[slug] = entry;
			}
		}
	}

	// Add fresh nav-* entries from baseNavMeta (header links with correct format)
	for (const [slug, entry] of Object.entries(baseNavMeta)) {
		if (slug.startsWith("nav-")) {
			finalNavMeta[slug] = entry;
		}
	}

	return finalNavMeta;
}

/**
 * Type guard for MenuNavMeta (multiple API specs as menu dropdown)
 */
function isMenuNavMeta(entry: unknown): entry is MenuNavMeta {
	return (
		typeof entry === "object" &&
		entry !== null &&
		"type" in entry &&
		(entry as MenuNavMeta).type === "menu" &&
		"items" in entry
	);
}

/** Single→Single: preserve the custom title on the page entry */
function preservePageToPage(existing: ApiPageMeta, base: ApiPageMeta): ApiPageMeta {
	if (existing.title && existing.title !== "API Reference") {
		return { ...base, title: existing.title };
	}
	return base;
}

/** Single→Menu: move custom title to the specific item in the menu */
function preservePageToMenu(existing: ApiPageMeta, base: MenuNavMeta): MenuNavMeta {
	const existingSlug = existing.href?.replace("/api-docs/", "");
	if (existingSlug && existing.title && existing.title !== "API Reference") {
		const updatedItems: Record<string, MenuItemWithHref> = { ...base.items };
		if (updatedItems[existingSlug]) {
			updatedItems[existingSlug] = { ...updatedItems[existingSlug], title: existing.title };
		}
		return { ...base, items: updatedItems };
	}
	return base;
}

/** Menu→Menu: preserve individual item titles and parent menu title */
function preserveMenuToMenu(existing: MenuNavMeta, base: MenuNavMeta): MenuNavMeta {
	const updatedItems: Record<string, MenuItemWithHref> = { ...base.items };
	// Preserve custom titles for items that still exist
	for (const [itemSlug, itemEntry] of Object.entries(existing.items)) {
		if (updatedItems[itemSlug] && typeof itemEntry === "object" && "title" in itemEntry) {
			const existingTitle = (itemEntry as MenuItemWithHref).title;
			const baseItemTitle = updatedItems[itemSlug].title;
			if (existingTitle !== baseItemTitle) {
				updatedItems[itemSlug] = { ...updatedItems[itemSlug], title: existingTitle };
			}
		}
	}
	// Preserve custom parent menu title if set
	if (existing.title && existing.title !== "API Reference") {
		return { ...base, title: existing.title, items: updatedItems };
	}
	return { ...base, items: updatedItems };
}

/** Menu→Single: if remaining spec had custom title in items, apply to single page */
function preserveMenuToPage(existing: MenuNavMeta, base: ApiPageMeta): ApiPageMeta {
	const remainingSlug = base.href?.replace("/api-docs/", "");
	if (remainingSlug && existing.items[remainingSlug]) {
		const existingItem = existing.items[remainingSlug];
		if (typeof existingItem === "object" && "title" in existingItem) {
			return { ...base, title: (existingItem as MenuItemWithHref).title };
		}
	}
	return base;
}

/**
 * Preserves custom API Reference titles during regeneration.
 * Handles page↔menu transitions correctly by delegating to specialized helpers.
 */
function preserveApiReferenceTitles(
	existingApiRef: unknown,
	baseApiRef: ApiPageMeta | MenuNavMeta,
): ApiPageMeta | MenuNavMeta {
	if (isApiPageEntry(existingApiRef) && isApiPageEntry(baseApiRef)) {
		return preservePageToPage(existingApiRef, baseApiRef);
	}
	if (isApiPageEntry(existingApiRef) && isMenuNavMeta(baseApiRef)) {
		return preservePageToMenu(existingApiRef, baseApiRef);
	}
	if (isMenuNavMeta(existingApiRef) && isMenuNavMeta(baseApiRef)) {
		return preserveMenuToMenu(existingApiRef, baseApiRef);
	}
	if (isMenuNavMeta(existingApiRef) && isApiPageEntry(baseApiRef)) {
		return preserveMenuToPage(existingApiRef, baseApiRef);
	}
	return baseApiRef;
}

/**
 * Result of generating navigation meta with removed entry tracking
 */
interface GenerateNavigationMetaResult {
	navMeta: NavMeta;
	removedNavEntries: Array<string>;
}

/**
 * Gets the first page slug from the nav meta for the root redirect.
 * In tabs mode, returns the first folder tab or article tab.
 * In sidebar mode, returns the first simple article or folder with content.
 * Skips API page entries (which have href), separators, virtual groups, and header links (nav-*).
 *
 * @param foldersWithContent - Folder paths that have content (index.md). These folders
 *   are valid redirect targets because Nextra serves their index.md at the folder path.
 * @param knownFolderSlugs - All known top-level folder slugs (including empty folders
 *   excluded from activeFolders). Ensures truly empty folders are skipped.
 */
/** Builds folder lookup maps used by getFirstArticleSlug for redirect resolution. */
function buildFolderLookupForRedirect(
	allFolderMetas: Array<FolderMetaInfo> | undefined,
	foldersWithOverview: Set<string> | undefined,
	knownFolderSlugs: Set<string> | undefined,
): { folderFirstChild: Map<string, string>; allFolderPaths: Set<string> } {
	const folderFirstChild = new Map<string, string>();
	const allFolderPaths = new Set<string>();
	if (allFolderMetas) {
		for (const folder of allFolderMetas) {
			if (folder.folderPath) {
				const slugifiedPath = slugifyPath(folder.folderPath);
				allFolderPaths.add(slugifiedPath);
				if (foldersWithOverview?.has(slugifiedPath)) {
					folderFirstChild.set(slugifiedPath, "overview");
				} else if (folder.slugs && folder.slugs.length > 0) {
					folderFirstChild.set(slugifiedPath, folder.slugs[0]);
				}
			}
		}
		// Second pass: for folders with empty slugs (e.g., parent folders that only contain
		// subfolders, not direct .md files), infer the first child from the folder hierarchy.
		// Without this, such folders get skipped during redirect resolution.
		inferFirstChildFromHierarchy(allFolderMetas, folderFirstChild);
	}
	if (knownFolderSlugs) {
		for (const slug of knownFolderSlugs) {
			allFolderPaths.add(slug);
		}
	}
	return { folderFirstChild, allFolderPaths };
}

/**
 * For folders with no direct file slugs, infer their first child by scanning
 * the folder hierarchy. A folder like "getting-started/" with slugs=[] but a
 * child folder "getting-started/workflows/" gets "workflows" as its first child.
 */
function inferFirstChildFromHierarchy(folders: Array<FolderMetaInfo>, folderFirstChild: Map<string, string>): void {
	for (const folder of folders) {
		if (!folder.folderPath || folderFirstChild.has(slugifyPath(folder.folderPath))) {
			continue;
		}
		const parentPath = slugifyPath(folder.folderPath);
		const prefix = `${parentPath}/`;
		// Find the first direct child folder (no nested slashes in the remainder)
		for (const other of folders) {
			if (!other.folderPath) {
				continue;
			}
			const otherPath = slugifyPath(other.folderPath);
			if (otherPath.startsWith(prefix) && !otherPath.slice(prefix.length).includes("/")) {
				folderFirstChild.set(parentPath, otherPath.slice(prefix.length));
				break;
			}
		}
	}
}

function getFirstArticleSlug(
	navMeta: NavMeta,
	allFolderMetas?: Array<FolderMetaInfo>,
	foldersWithOverview?: Set<string>,
	foldersWithContent?: Set<string>,
	knownFolderSlugs?: Set<string>,
): string | null {
	const { folderFirstChild, allFolderPaths } = buildFolderLookupForRedirect(
		allFolderMetas,
		foldersWithOverview,
		knownFolderSlugs,
	);

	for (const [slug, entry] of Object.entries(navMeta)) {
		// Skip header links, API reference, and index
		if (slug.startsWith("nav-") || slug === "api-reference" || slug === "index") {
			continue;
		}

		// Match either: string entry (sidebar mode) or page entry without href (tabs mode)
		const isStringEntry = typeof entry === "string";
		const isPageTab = typeof entry === "object" && "type" in entry && entry.type === "page" && !("href" in entry);
		if (!isStringEntry && !isPageTab) {
			continue;
		}

		// Tabs mode: folders with overview pages (index.md → overview.md) redirect
		// to /folder/overview. Check this BEFORE foldersWithContent so tabs mode
		// doesn't short-circuit to the folder path itself.
		if (foldersWithOverview?.has(slug) && folderFirstChild.has(slug)) {
			const resolved = resolveFirstLeafArticle(slug, folderFirstChild, allFolderPaths);
			if (resolved) {
				return resolved;
			}
		}

		// Folders with content (index.md) are valid redirect targets — Nextra serves
		// the index.md at the folder path (e.g., /getting-started → getting-started/index.md).
		if (foldersWithContent?.has(slug)) {
			return slug;
		}

		// Folders WITHOUT content: resolve to the first child/leaf article.
		if (folderFirstChild.has(slug)) {
			const resolved = resolveFirstLeafArticle(slug, folderFirstChild, allFolderPaths);
			if (resolved) {
				return resolved;
			}
		}

		// Skip empty folders (known folder slug but no articles inside)
		if (allFolderPaths.has(slug)) {
			continue;
		}
		return slug;
	}
	return null;
}

/**
 * Recursively resolves a folder path to its first leaf article.
 * Follows nested folders (e.g., "guides" → "guides/getting-started" → "guides/getting-started/intro")
 * until a non-folder slug is found.
 */
function resolveFirstLeafArticle(
	folderPath: string,
	folderFirstChild: Map<string, string>,
	allFolderPaths: Set<string>,
	depth = 0,
): string | null {
	// Guard against circular references or excessively deep nesting
	if (depth > 10) {
		return null;
	}
	const firstChild = folderFirstChild.get(folderPath);
	if (!firstChild) {
		return null;
	}
	const fullPath = `${folderPath}/${firstChild}`;
	// Check if the child is itself a folder — if so, recurse deeper
	if (folderFirstChild.has(fullPath) || allFolderPaths.has(fullPath)) {
		return resolveFirstLeafArticle(fullPath, folderFirstChild, allFolderPaths, depth + 1);
	}
	return fullPath;
}

/**
 * Reorders navMeta entries to match the key order of a source navMeta.
 * Entries present in the source appear first (in source order), followed by
 * any extra entries from navMeta that aren't in the source.
 *
 * This ensures article ordering from the space tree is preserved after
 * navigation mode transformations that may introduce repo-alphabetical
 * folder entries from allFolderMetas.
 */
function reorderNavMetaToMatchSource(navMeta: NavMeta, source: NavMeta): NavMeta {
	const result: NavMeta = {};
	// Add entries in source key order (preserves space tree article ordering)
	for (const key of Object.keys(source)) {
		if (key in navMeta) {
			result[key] = navMeta[key];
		}
	}
	// Append entries from navMeta not in source (e.g., folder entries added by applyNavigationMode)
	for (const key of Object.keys(navMeta)) {
		if (!(key in result)) {
			result[key] = navMeta[key];
		}
	}
	return result;
}

/**
 * Reorders navMeta entries to match a specific slug ordering.
 * Special keys (index, nav-*, etc.) stay at the front, then content entries
 * appear in the order specified by slugOrder, with any unrecognized entries appended.
 *
 * Unlike reorderNavMetaToMatchSource which uses another NavMeta as reference,
 * this uses an explicit slug list which can include entries that were filtered
 * from the navMeta source (e.g., empty folder articles excluded from rootFolderArticles
 * but re-added by applySidebarMode).
 */
function reorderNavMetaBySlugList(navMeta: NavMeta, slugOrder: Array<string>): NavMeta {
	const slugPosition = new Map(slugOrder.map((slug, i) => [slug, i]));
	const result: NavMeta = {};

	// Separate entries into special (index, nav-*), ordered (in slugOrder), and extra
	const special: Array<[string, NavMeta[string]]> = [];
	const ordered: Array<[string, NavMeta[string], number]> = [];
	const extra: Array<[string, NavMeta[string]]> = [];

	for (const [key, value] of Object.entries(navMeta)) {
		if (isSpecialNavKey(key)) {
			special.push([key, value]);
		} else if (slugPosition.has(key)) {
			const pos = slugPosition.get(key) ?? 0;
			ordered.push([key, value, pos]);
		} else {
			extra.push([key, value]);
		}
	}

	// Sort content entries by their position in the slug order
	ordered.sort((a, b) => a[2] - b[2]);

	// Rebuild: special first, then ordered content, then extras
	for (const [key, value] of special) {
		result[key] = value;
	}
	for (const [key, value] of ordered) {
		result[key] = value;
	}
	for (const [key, value] of extra) {
		result[key] = value;
	}
	return result;
}

/**
 * Builds a map of slugified folder names to display titles.
 * Only includes top-level folders (no "/" in path).
 */
function buildFolderLookupMaps(allFolderMetas?: Array<FolderMetaInfo>): { slugifiedToTitle: Map<string, string> } {
	const slugifiedToTitle = new Map<string, string>();

	if (!allFolderMetas) {
		return { slugifiedToTitle };
	}

	for (const folder of allFolderMetas) {
		if (folder.folderPath && !folder.folderPath.includes("/")) {
			const slugifiedName = slugify(folder.folderPath);
			const title = folderPathToTitle(folder.folderPath);
			slugifiedToTitle.set(slugifiedName, title);
		}
	}

	return { slugifiedToTitle };
}

/**
 * Converts a folder path to a display title.
 * Uses proper title case: capitalizes each word.
 * e.g., "introduction-to-product" -> "Introduction To Product"
 */
function folderPathToTitle(folderPath: string): string {
	return folderPath
		.replace(/-/g, " ")
		.split(" ")
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Checks if a nav entry key should be preserved as-is (special entries).
 */
function isSpecialNavKey(key: string): boolean {
	return key === "index" || key === "api-reference" || key.startsWith("nav-");
}

/**
 * Checks if an object entry has Nextra properties that should be preserved.
 * These include display, theme, etc. - anything beyond just type and title.
 */
function hasNextraProperties(value: Record<string, unknown>): boolean {
	const reservedKeys = new Set(["type", "title"]);
	for (const key of Object.keys(value)) {
		if (!reservedKeys.has(key)) {
			return true;
		}
	}
	return false;
}

/**
 * Processes a single nav entry for sidebar mode, converting tabs back to simple strings.
 * Preserves Nextra properties (display, theme, etc.) when present.
 */
function processSidebarEntry(
	key: string,
	value: NavMeta[string],
	slugifiedToTitle: Map<string, string>,
): { slugifiedKey: string; processedValue: NavMeta[string] } {
	const slugifiedKey = slugify(key);

	// Convert type: 'page' content entries back to simple strings
	// BUT preserve Nextra properties if present (display, theme, etc.)
	if (typeof value === "object" && "type" in value && value.type === "page" && !("href" in value)) {
		const entryTitle = "title" in value ? (value.title as string) : null;
		const title = entryTitle || slugifiedToTitle.get(slugifiedKey) || key;

		// Check if the entry has additional Nextra properties to preserve
		if (hasNextraProperties(value as unknown as Record<string, unknown>)) {
			// Create new object without type: 'page' but keep other properties
			const { type: _type, ...preserved } = value as unknown as Record<string, unknown>;
			// If title is the only remaining property, convert to string
			if (Object.keys(preserved).length === 1 && "title" in preserved) {
				return { slugifiedKey, processedValue: title };
			}
			// Otherwise keep the object with preserved properties (including title)
			return { slugifiedKey, processedValue: { ...preserved, title } as NavMeta[string] };
		}

		return { slugifiedKey, processedValue: title };
	}

	if (typeof value === "string") {
		const title = value || slugifiedToTitle.get(slugifiedKey) || key;
		return { slugifiedKey, processedValue: title };
	}

	// Complex entry (virtual group, etc.) - preserve
	return { slugifiedKey, processedValue: value };
}

/**
 * Applies sidebar mode transformation to navigation meta.
 * Strips type: 'page' from content entries and adds missing folder entries.
 */
function applySidebarMode(
	navMeta: NavMeta,
	slugifiedToTitle: Map<string, string>,
	allFolderMetas?: Array<FolderMetaInfo>,
): NavMeta {
	const result: NavMeta = {};
	const addedKeys = new Set<string>();

	// Process existing entries
	for (const [key, value] of Object.entries(navMeta)) {
		if (isSpecialNavKey(key)) {
			result[key] = value;
			continue;
		}

		const { slugifiedKey, processedValue } = processSidebarEntry(key, value, slugifiedToTitle);

		if (!addedKeys.has(slugifiedKey)) {
			result[slugifiedKey] = processedValue;
			addedKeys.add(slugifiedKey);
		}
	}

	// Add missing top-level folders with content
	if (allFolderMetas) {
		for (const folder of allFolderMetas) {
			const isTopLevel = folder.folderPath && !folder.folderPath.includes("/");
			const hasContent = folder.slugs && folder.slugs.length > 0;

			if (isTopLevel && hasContent) {
				const slugifiedName = slugify(folder.folderPath);
				if (!addedKeys.has(slugifiedName)) {
					result[slugifiedName] = folderPathToTitle(folder.folderPath);
					addedKeys.add(slugifiedName);
				}
			}
		}
	}

	return result;
}

/**
 * Applies tabs mode transformation to navigation meta.
 *
 * In tabs mode:
 * - Individual top-level articles become tabs in the navbar (`type: 'page'`)
 * - Folders also become tabs in the navbar (`type: 'page'`)
 *
 * The Nextra 4.x issue #4411 (type: 'page' + index.md breaks sidebar) is worked around
 * by generating folder content as `overview.md` instead of `index.md` in processArticle.
 * This allows folders to have `type: 'page'` for navbar display while sidebar works correctly.
 *
 * Preserves Nextra properties (display, theme, etc.) when converting entries.
 */
function applyTabsMode(navMeta: NavMeta, allFolderMetas: Array<FolderMetaInfo>): NavMeta {
	const result: NavMeta = {};

	// Process all navMeta entries in their original order (preserves space ordering).
	// Transform each entry to type: 'page' for navbar tabs, whether it's an article or folder.
	for (const [key, value] of Object.entries(navMeta)) {
		// Skip special entries - they're handled separately below
		if (isSpecialNavKey(key)) {
			if (key === "index") {
				result[key] = value;
			}
			continue;
		}

		// Transform entry to a page tab, preserving existing properties
		if (typeof value === "string") {
			result[key] = { title: value, type: "page" as const };
		} else if (typeof value === "object" && value !== null) {
			const title = "title" in value ? (value.title as string) : key;
			result[key] = { ...value, title, type: "page" as const };
		} else {
			result[key] = { title: key, type: "page" as const };
		}
	}

	// Add any top-level folders not already in navMeta (newly discovered folders)
	for (const folder of allFolderMetas) {
		if (!folder.folderPath || folder.folderPath.includes("/")) {
			continue; // Only top-level folders
		}
		const slugifiedName = slugify(folder.folderPath);
		if (!(slugifiedName in result)) {
			result[slugifiedName] = {
				title: folderPathToTitle(folder.folderPath),
				type: "page" as const,
			};
		}
	}

	// Add API reference (if exists)
	if (navMeta["api-reference"] !== undefined && !("api-reference" in result)) {
		result["api-reference"] = navMeta["api-reference"];
	}

	// Add header links (nav-*) last
	for (const [key, value] of Object.entries(navMeta)) {
		if (key.startsWith("nav-") && !(key in result)) {
			result[key] = value;
		}
	}

	return result;
}

/**
 * Transforms navigation meta entries based on navigation mode.
 *
 * Navigation mode behaviors:
 * - sidebar: Everything appears in the sidebar (default, no transformation)
 * - tabs: Top-level folders become tabs (type: 'page'), articles stay in sidebar
 *
 * @param navMeta - The navigation meta to transform
 * @param navigationMode - The navigation mode ('sidebar' or 'tabs')
 * @param allFolderMetas - Folder information for detecting top-level folders
 * @returns Transformed navigation meta with appropriate folder types
 */
function applyNavigationMode(
	navMeta: NavMeta,
	navigationMode?: import("jolli-common").NavigationMode,
	allFolderMetas?: Array<FolderMetaInfo>,
): NavMeta {
	const { slugifiedToTitle } = buildFolderLookupMaps(allFolderMetas);

	// Sidebar mode: strip type: 'page' from content entries
	if (!navigationMode || navigationMode === "sidebar") {
		return applySidebarMode(navMeta, slugifiedToTitle, allFolderMetas);
	}

	// Tabs mode: transform top-level folders to type: 'page'
	if (!allFolderMetas || allFolderMetas.length === 0) {
		return navMeta;
	}

	return applyTabsMode(navMeta, allFolderMetas);
}

/**
 * Generates navigation meta, handling existing nav meta if present.
 * Merges existing nav meta with new articles to preserve user customizations.
 *
 * This is used in two scenarios:
 * 1. Migration mode: Upgrading from Nextra 3.x to 4.x, preserving old config
 * 2. Regeneration with navigation changes: Adding/removing articles while preserving
 *    user customizations to existing article titles in _meta.ts
 *
 * Supports nested virtual groups in existing nav meta - articles inside groups
 * are preserved if they match new articles.
 *
 * Note: Header links ARE included in _meta.ts as nav-* entries for Nextra navbar rendering (JOLLI-382).
 *
 * @param rootArticles - Root-level articles for nav meta generation
 * @param activeFolders - Pre-computed active folders (folders with current articles)
 * @param navigationMode - Navigation mode: 'sidebar' (default), 'tabs', or 'dropdown'
 */
function generateNavigationMeta(
	rootArticles: Array<ArticleInput>,
	activeFolders: Array<FolderMetaInfo>,
	openApiSpecs: Array<OpenApiSpecInfo>,
	headerLinks?: import("jolli-common").HeaderLinksConfig,
	migrationContext?: {
		existingNavMeta?: ExistingNavMeta;
		deletedSlugs?: Array<string>;
		allFolderMetas?: Array<FolderMetaInfo>;
	},
	navigationMode?: import("jolli-common").NavigationMode,
	preserveNavOrder?: boolean,
	allRootSlugs?: Array<string>,
): GenerateNavigationMetaResult {
	const baseNavMeta = generateNavMeta(rootArticles, openApiSpecs, headerLinks);

	// When auto-sync is ON (preserveNavOrder=false), generate a fresh _meta.ts from the
	// current article order. No merge needed — the space tree ordering is the source of truth.
	// Merging with the existing _meta.ts is only needed when auto-sync is OFF to preserve
	// user customizations from the Navigation tab.
	if (!preserveNavOrder || !migrationContext?.existingNavMeta) {
		const finalNavMeta = applyNavigationMode(baseNavMeta, navigationMode, activeFolders);
		// Reorder to match space tree sortOrder. Use allRootSlugs (derived from ALL root-level
		// articles before filtering) because empty folder articles may be excluded from
		// rootArticles/baseNavMeta but re-added by applyNavigationMode's folder loop.
		// Without the full slug list, re-added folders get appended in repo-alphabetical order.
		const reordered = allRootSlugs
			? reorderNavMetaBySlugList(finalNavMeta, allRootSlugs)
			: reorderNavMetaToMatchSource(finalNavMeta, baseNavMeta);
		return { navMeta: reordered, removedNavEntries: [] };
	}

	// Merge with existing _meta.ts to preserve user customizations
	// (titles, separators, virtual groups from Navigation tab).
	// Note: entry ORDER is NOT preserved from the merge — it's always overridden
	// by the space tree's sortOrder via reorderNavMetaBySlugList below.
	const merger = new MetaMerger();
	const mergeOptions = buildMergeOptions(baseNavMeta, migrationContext, activeFolders);
	const mergeResult = merger.mergeFromParsed(mergeOptions);

	if (!mergeResult.success || !mergeResult.meta) {
		const transformedNavMeta = applyNavigationMode(baseNavMeta, navigationMode, activeFolders);
		return { navMeta: transformedNavMeta, removedNavEntries: [] };
	}

	let finalNavMeta = convertMergeResultToNavMeta(mergeResult, baseNavMeta);

	// Preserve custom API Reference titles from existing _meta.ts
	const existingApiRef = migrationContext.existingNavMeta["api-reference"];
	const baseApiRef = baseNavMeta["api-reference"];
	if (isApiPageEntry(baseApiRef)) {
		finalNavMeta["api-reference"] = preserveApiReferenceTitles(existingApiRef, baseApiRef);
	} else if (isMenuNavMeta(baseApiRef)) {
		finalNavMeta["api-reference"] = preserveApiReferenceTitles(existingApiRef, baseApiRef);
	}

	finalNavMeta = applyNavigationMode(finalNavMeta, navigationMode, activeFolders);

	// Note: we intentionally do NOT reorder here. This merge path is only reached
	// when preserveNavOrder=true (auto-sync OFF), meaning the user has manually
	// customized their navigation order. The merge preserves that custom order.
	// Auto-sync ON sites (preserveNavOrder=false) go through the fresh path above,
	// which applies reorderNavMetaBySlugList for space tree ordering.

	return { navMeta: finalNavMeta, removedNavEntries: mergeResult.report.removed };
}

/**
 * Processes an article and returns the file entries and potential redirect/OpenAPI info.
 */
interface ArticleProcessingContext {
	files: Array<FileTree>;
	openApiSpecs: Array<OpenApiSpecInfo>;
	/**
	 * Navigation mode for the site.
	 * In 'tabs' mode, folder content becomes an overview article instead of index.md
	 * to work around Nextra 4.x issue #4411.
	 */
	navigationMode: import("jolli-common").NavigationMode | undefined;
	/**
	 * Set of slugified folder paths that are top-level folders.
	 * Used to determine if a folder article should be treated specially in tabs mode.
	 */
	topLevelFolderSlugs: Set<string> | undefined;
}

/**
 * Determines the folder path for an article.
 * Priority:
 * 1. Article's explicit folderPath from Jolli (handles folder renames correctly)
 * 2. Existing GitHub repo folder placement (for articles without folderPath)
 * 3. Empty string (root level) if neither is available
 */
function getArticleFolderPath(slug: string, article: ArticleInput, slugToFolder: Map<string, string>): string {
	// If the article has an explicit folderPath from Jolli, use it.
	// This takes priority over the repo structure because the Jolli space is the
	// source of truth for folder assignments (handles folder renames correctly).
	if (article.folderPath) {
		return slugifyPath(article.folderPath);
	}
	// Fall back to existing GitHub repo folder placement (for articles without folderPath)
	const existingFolder = slugToFolder.get(slug);
	if (existingFolder !== undefined) {
		return existingFolder;
	}
	// Default to root level
	return "";
}

/**
 * Checks if a folder article has meaningful content that should be rendered.
 * Empty folders (no content or just whitespace) should not generate index.md files.
 */
function hasFolderContent(article: ArticleInput): boolean {
	if (!article.isFolder) {
		return true; // Non-folders always have content to render
	}
	// Check if content is empty or just whitespace
	const trimmed = article.content.trim();
	return trimmed.length > 0;
}

/**
 * Determines if a folder should use overview article instead of index.md.
 * This is needed in tabs mode for top-level folders with content, to avoid
 * the Nextra 4.x issue #4411 where type: 'page' + index.md breaks sidebar.
 */
function shouldUseOverviewArticle(
	article: ArticleInput,
	slug: string,
	folderPath: string,
	ctx: ArticleProcessingContext,
): boolean {
	// Only applies to folder articles with content in tabs mode
	if (!article.isFolder || !hasFolderContent(article)) {
		return false;
	}
	if (ctx.navigationMode !== "tabs") {
		return false;
	}
	// Only top-level folders (folderPath is empty = article is at root level)
	if (folderPath !== "") {
		return false;
	}
	// Check if this folder slug is in the top-level folders set
	return ctx.topLevelFolderSlugs?.has(slug) ?? false;
}

/**
 * Generates a file for a folder article if it has content.
 * Handles the overview vs index logic for tabs mode.
 * Computes basePath internally from folderPath.
 * Returns true if a file was generated, false if folder was empty.
 */
function generateFolderArticleFile(
	article: ArticleInput,
	slug: string,
	folderPath: string,
	extension: string,
	ctx: ArticleProcessingContext,
	useArticleContent: boolean,
): boolean {
	if (!hasFolderContent(article)) {
		return false;
	}

	const basePath = folderPath ? `content/${folderPath}` : "content";
	const useOverview = shouldUseOverviewArticle(article, slug, folderPath, ctx);
	const fileName = useOverview ? "overview" : "index";
	const content = useArticleContent
		? generateArticleContent(article, useOverview ? { skipAsIndexPage: true } : undefined)
		: article.content;

	ctx.files.push({
		path: `${basePath}/${slug}/${fileName}${extension}`,
		content,
	});
	return true;
}

function processArticle(article: ArticleInput, slugToFolder: Map<string, string>, ctx: ArticleProcessingContext): void {
	const metadata = article.contentMetadata as ArticleMetadata | undefined;
	const title = metadata?.title || "Untitled Article";
	const slug = getArticleSlug(article);

	// Get effective content type (detects JSON/YAML even if contentType is wrong)
	const effectiveType = getEffectiveContentType(article.content, article.contentType);

	// Check if this is an OpenAPI spec
	if (parseOpenApiSpec(article.content, article.contentType) !== null) {
		// For OpenAPI specs, store in public folder with unique name based on slug
		const specExtension = effectiveType === "application/yaml" ? "yaml" : "json";
		const specFileName = `${slug}.${specExtension}`;

		ctx.files.push({ path: `public/${specFileName}`, content: article.content });
		ctx.openApiSpecs.push({ name: slug, specPath: `/${specFileName}`, title });
	} else if (effectiveType === "application/json" || effectiveType === "application/yaml") {
		// Non-OpenAPI JSON/YAML - save as raw file (not MDX to avoid parsing errors)
		const extension = effectiveType === "application/json" ? ".json" : ".yaml";
		const folderPath = getArticleFolderPath(slug, article, slugToFolder);

		if (article.isFolder) {
			// Folder documents become index/overview files inside their folder
			generateFolderArticleFile(article, slug, folderPath, extension, ctx, false);
		} else {
			const basePath = folderPath ? `content/${folderPath}` : "content";
			ctx.files.push({ path: `${basePath}/${slug}${extension}`, content: article.content });
		}
	} else {
		// Regular markdown content - goes in content/ folder
		// Use .md extension for text/markdown (lenient parsing), .mdx for text/mdx (strict JSX)
		const extension = article.contentType === "text/mdx" ? ".mdx" : ".md";
		const folderPath = getArticleFolderPath(slug, article, slugToFolder);

		if (article.isFolder) {
			// Folder documents become index/overview files inside their folder
			generateFolderArticleFile(article, slug, folderPath, extension, ctx, true);
		} else {
			const basePath = folderPath ? `content/${folderPath}` : "content";
			ctx.files.push({ path: `${basePath}/${slug}${extension}`, content: generateArticleContent(article) });
		}
	}
}

/**
 * Generates the root page file based on available articles and API specs.
 */
function generateRootPageFile(firstArticleSlug: string | null, openApiSpecs: Array<OpenApiSpecInfo>): FileTree {
	if (firstArticleSlug) {
		const rootPage = generateRootRedirectPage(firstArticleSlug);
		return { path: rootPage.path, content: rootPage.content };
	}
	if (openApiSpecs.length > 0) {
		const firstApiSlug = openApiSpecs[0].name;
		const rootPage = generateRootRedirectPage(`api-docs/${firstApiSlug}`);
		return { path: rootPage.path, content: rootPage.content };
	}
	const noArticlesPage = generateNoArticlesPage();
	return { path: noArticlesPage.path, content: noArticlesPage.content };
}

/**
 * Generates OpenAPI documentation files (HTML and React components).
 */
function generateOpenApiDocsFiles(openApiSpecs: Array<OpenApiSpecInfo>): Array<FileTree> {
	const files: Array<FileTree> = [];
	if (openApiSpecs.length === 0) {
		return files;
	}

	// Generate API docs page component
	const apiDocsSlugs = openApiSpecs.map(spec => spec.name);
	const apiDocsPage = generateApiDocsPage(apiDocsSlugs);
	files.push({ path: apiDocsPage.path, content: apiDocsPage.content });

	// Generate API reference client component
	const apiReference = generateApiReferenceComponent();
	files.push({ path: apiReference.path, content: apiReference.content });

	// Generate HTML files for each spec
	for (const spec of openApiSpecs) {
		const apiDocsHtmlFile = generateApiDocsHtml(spec.specPath);
		files.push({ path: `public/api-docs-${spec.name}.html`, content: apiDocsHtmlFile.content });
	}

	return files;
}

/**
 * Generates config files for the Nextra project (layout, catch-all, etc.).
 */
function generateProjectConfigFiles(
	themeConfig: ThemeConfig,
	siteName: string,
	allowedDomain: string | undefined,
): Array<FileTree> {
	const files: Array<FileTree> = [];

	// Generate app/layout.tsx - with or without auth
	if (allowedDomain) {
		const authLayout = generateAuthLayout(themeConfig, siteName, allowedDomain);
		const authLib = generateAuthLib(allowedDomain);
		files.push({ path: authLayout.path, content: authLayout.content });
		files.push({ path: authLib.path, content: authLib.content });
	} else {
		const layoutFile = generateLayout(themeConfig, siteName);
		files.push({ path: layoutFile.path, content: layoutFile.content });
	}

	// Generate app/globals.css for branding styles
	const globalStyles = generateGlobalStyles(themeConfig);
	files.push({ path: globalStyles.path, content: globalStyles.content });

	// JOLLI-382: Header links are now in _meta.ts for native Nextra navbar rendering
	// No separate HeaderLinks component needed

	// Always generate JWT auth files (middleware checks JWT_AUTH_ENABLED env var at runtime)
	const middleware = generateJwtMiddleware();
	const authCallback = generateJwtAuthCallback();
	const authLib = generateJwtAuthLib();
	files.push({ path: middleware.path, content: middleware.content });
	files.push({ path: authCallback.path, content: authCallback.content });
	files.push({ path: authLib.path, content: authLib.content });

	// Generate app/[...mdxPath]/page.tsx (catch-all route for MDX)
	const catchAllPage = generateCatchAllPage();
	files.push({ path: catchAllPage.path, content: catchAllPage.content });

	// Generate mdx-components.tsx (root level)
	const mdxComponents = generateMdxComponents();
	files.push({ path: mdxComponents.path, content: mdxComponents.content });

	// Generate app/icon.tsx for dynamic favicon
	const iconComponent = generateIconComponent();
	files.push({ path: iconComponent.path, content: iconComponent.content });

	// Generate app/favicon.ico/route.ts
	const faviconRoute = generateFaviconRoute();
	files.push({ path: faviconRoute.path, content: faviconRoute.content });

	// Generate next.config.mjs
	const nextConfig = generateNextConfig(themeConfig.codeTheme);
	files.push({ path: nextConfig.path, content: nextConfig.content });

	// Generate tsconfig.json
	const tsConfig = generateTsConfig();
	files.push({ path: tsConfig.path, content: tsConfig.content });

	// Generate .gitignore
	files.push({ path: ".gitignore", content: GITIGNORE });

	return files;
}

/**
 * Result of generating a site to memory
 */
export interface GenerateSiteToMemoryResult {
	files: Array<FileTree>;
	removedNavEntries: Array<string>; // Navigation entries that were removed during merge
	foldersToDelete: Array<string>; // Content folders that became empty and should be deleted
	warnings: Array<string>; // Warnings about potential issues (e.g., slug collisions)
	/** Content file paths that were relocated due to useSpaceFolderStructure. Old paths should be deleted. */
	relocatedFilePaths: Array<string>;
}

/**
 * Information about a slug collision (multiple articles with same slug at same path).
 */
interface SlugCollision {
	slug: string;
	folderPath: string;
	titles: Array<string>;
}

/**
 * Detects slug collisions where multiple articles have the same slug at the same folder path.
 * This can happen when multiple spaces contribute articles with identical titles.
 *
 * @param articles - All articles being generated
 * @param slugToFolder - Map from slug to folder path (from existing repo structure)
 * @returns Array of collision info for warning messages
 */
function detectSlugCollisions(articles: Array<ArticleInput>, slugToFolder: Map<string, string>): Array<SlugCollision> {
	// Map: "folderPath/slug" -> array of article titles
	const slugLocationMap = new Map<string, Array<string>>();

	for (const article of articles) {
		const metadata = article.contentMetadata as ArticleMetadata | undefined;
		const title = metadata?.title || "Untitled Article";
		const slug = getArticleSlug(article);

		// Determine folder path for this article
		const folderPath = getArticleFolderPath(slug, article, slugToFolder);
		const locationKey = folderPath ? `${folderPath}/${slug}` : slug;

		const existing = slugLocationMap.get(locationKey);
		if (existing) {
			existing.push(title);
		} else {
			slugLocationMap.set(locationKey, [title]);
		}
	}

	// Find collisions (locations with more than one article)
	const collisions: Array<SlugCollision> = [];
	for (const [locationKey, titles] of slugLocationMap) {
		if (titles.length > 1) {
			const lastSlash = locationKey.lastIndexOf("/");
			const slug = lastSlash === -1 ? locationKey : locationKey.substring(lastSlash + 1);
			const folderPath = lastSlash === -1 ? "" : locationKey.substring(0, lastSlash);
			collisions.push({ slug, folderPath, titles });
		}
	}

	return collisions;
}

/**
 * Formats slug collision warnings for the result.
 */
function formatCollisionWarnings(collisions: Array<SlugCollision>): Array<string> {
	return collisions.map(collision => {
		const location = collision.folderPath ? `${collision.folderPath}/` : "";
		const titlesStr = collision.titles.map(t => `"${t}"`).join(", ");
		return `Slug collision: "${location}${collision.slug}" has ${collision.titles.length} articles with titles: ${titlesStr}. Last one wins.`;
	});
}

/**
 * Generates _meta.ts content string from a NavMeta object.
 * Used for both root and subfolder _meta.ts files.
 */
function generateMetaContentString(meta: NavMeta): string {
	const entries = Object.entries(meta)
		.map(([key, value]) => {
			if (typeof value === "string") {
				return `  '${escapeJsString(key)}': '${escapeJsString(value)}'`;
			}
			// Complex object - serialize as JSON (for display: hidden, etc.)
			return `  '${escapeJsString(key)}': ${JSON.stringify(value)}`;
		})
		.join(",\n");

	return `export default {\n${entries}\n}\n`;
}

/**
 * Builds a map of folder path → ordered slugs (including both article slugs
 * and child folder slugs interleaved in the space tree's sortOrder).
 *
 * This is needed because `computeActiveFolders` strips child folder names
 * from `folder.slugs` (they're directories, not files in the repo), losing
 * the interleaving order. This function reconstructs the full ordering from
 * the article inputs so that `generateFolderMetaContent` can produce
 * `desiredOrder` with child folders in the correct positions.
 */
function buildArticleSortOrder(articles: Array<ArticleInput>): Map<string, Array<string>> {
	const folderOrder = new Map<string, Array<string>>();
	for (const article of articles) {
		const slug = getArticleSlug(article);
		let folderPath = "";
		if (article.isFolder) {
			if (article.folderPath) {
				folderPath = slugifyPath(article.folderPath);
			}
		} else if (article.folderPath) {
			folderPath = slugifyPath(article.folderPath);
		}
		if (!folderOrder.has(folderPath)) {
			folderOrder.set(folderPath, []);
		}
		folderOrder.get(folderPath)?.push(slug);
	}
	return folderOrder;
}

/**
 * Options for generating subfolder meta files.
 */
interface SubfolderMetaOptions {
	/** Navigation mode - affects how folder content is represented */
	navigationMode?: import("jolli-common").NavigationMode | undefined;
	/** Set of top-level folder slugs that have overview articles (in tabs mode) */
	topLevelFoldersWithOverview?: Set<string> | undefined;
}

/**
 * Builds maps of slug -> title and folder slug -> title from articles.
 */
function buildSlugTitleMaps(articles: Array<ArticleInput>): {
	slugToTitle: Map<string, string>;
	folderSlugToTitle: Map<string, string>;
} {
	const slugToTitle = new Map<string, string>();
	const folderSlugToTitle = new Map<string, string>();
	for (const article of articles) {
		const metadata = article.contentMetadata as ArticleMetadata | undefined;
		const title = metadata?.title || "Untitled Article";
		const slug = getArticleSlug(article);
		slugToTitle.set(slug, title);
		if (article.isFolder) {
			folderSlugToTitle.set(slug, title);
		}
	}
	return { slugToTitle, folderSlugToTitle };
}

/**
 * Builds a set of folder paths that have content (index.md or overview.md files).
 */
function buildFoldersWithContentSet(articles: Array<ArticleInput>): Set<string> {
	const foldersWithContent = new Set<string>();
	for (const article of articles) {
		if (article.isFolder && hasFolderContent(article)) {
			const slug = getArticleSlug(article);
			const parentPath = article.folderPath ? slugifyPath(article.folderPath) : "";
			const folderPath = parentPath ? `${parentPath}/${slug}` : slug;
			foldersWithContent.add(folderPath);
		}
	}
	return foldersWithContent;
}

/**
 * Generates the _meta.ts content for a single folder.
 *
 * @param folder - Folder metadata
 * @param slugifiedPath - Slugified folder path
 * @param hasOverview - Whether this folder uses overview article (tabs mode)
 * @param slugToTitle - Map of article slugs to titles
 * @param folderSlugToTitle - Map of folder slugs to titles
 * @param merger - MetaMerger instance
 * @param childFolderNames - Array of immediate child folder names (for preserving nested folder entries)
 * @param fullSortOrder - Full interleaved ordering from space tree (articles + child folders in sortOrder)
 */
function generateFolderMetaContent(
	folder: FolderMetaInfo,
	slugifiedPath: string,
	hasOverview: boolean,
	slugToTitle: Map<string, string>,
	folderSlugToTitle: Map<string, string>,
	merger: MetaMerger,
	childFolderNames: Array<string>,
	fullSortOrder?: Array<string>,
): string {
	// Build the desired ordering that interleaves articles and child folders
	// in the space tree's sortOrder. If fullSortOrder is available, use it
	// to place child folders in the correct position relative to articles.
	// Otherwise fall back to appending child folders after articles.
	const childFolderSet = new Set(childFolderNames);
	const interleavedOrder = buildInterleavedOrder(folder.slugs, childFolderNames, childFolderSet, fullSortOrder);

	// Build NavMeta for this folder's articles and child folders
	const folderMeta: NavMeta = {};

	// In tabs mode, add overview as the first entry
	if (hasOverview) {
		const folderTitle = folderSlugToTitle.get(slugifiedPath) || folderPathToTitle(folder.folderPath);
		folderMeta.overview = folderTitle;
	}

	// Add entries in the interleaved order (articles and child folders together)
	for (const slug of interleavedOrder) {
		if (childFolderSet.has(slug)) {
			folderMeta[slug] = folderSlugToTitle.get(slug) || folderPathToTitle(slug);
		} else {
			folderMeta[slug] = slugToTitle.get(slug) || slug;
		}
	}

	if (!folder.metaContent) {
		return generateMetaContentString(folderMeta);
	}

	// Merge to preserve user customizations
	const slugsForMerge = hasOverview ? ["overview", ...folder.slugs] : folder.slugs;
	const titlesForMerge = new Map(slugToTitle);
	if (hasOverview) {
		const folderTitle = folderSlugToTitle.get(slugifiedPath) || folderPathToTitle(folder.folderPath);
		titlesForMerge.set("overview", folderTitle);
	}

	const mergeResult = merger.merge({
		existingContent: folder.metaContent,
		newArticleSlugs: slugsForMerge,
		articleTitles: titlesForMerge,
		deletedSlugs: [], // Deleted slugs are already filtered out of folder.slugs
		knownFolders: childFolderNames, // Pass child folders so they are preserved during merge
	});

	if (mergeResult.success && mergeResult.meta) {
		// Reorder to match the space tree's sortOrder with child folders interleaved.
		// The merge preserves user customizations (titles, separators) but ordering
		// follows the source of truth. "overview" is first in tabs mode.
		const desiredOrder = hasOverview ? ["overview", ...interleavedOrder] : interleavedOrder;
		const meta = reorderNavMeta(mergeResult.meta as NavMeta, desiredOrder);
		return generateMetaContentString(meta);
	}
	return generateMetaContentString(folderMeta);
}

/**
 * Builds an interleaved ordering of article slugs and child folder names
 * based on the space tree's sortOrder. If fullSortOrder is available, it
 * determines the position of child folders relative to articles. Otherwise
 * child folders are appended after articles.
 */
function buildInterleavedOrder(
	articleSlugs: Array<string>,
	childFolderNames: Array<string>,
	childFolderSet: Set<string>,
	fullSortOrder?: Array<string>,
): Array<string> {
	if (!fullSortOrder || childFolderNames.length === 0) {
		// No interleaving info available or no child folders — append folders after articles
		return [...articleSlugs, ...childFolderNames];
	}

	// Build the interleaved order from the full sort order, keeping only
	// entries that are either in articleSlugs or childFolderNames
	const articleSet = new Set(articleSlugs);
	const interleaved: Array<string> = [];
	for (const slug of fullSortOrder) {
		if (articleSet.has(slug) || childFolderSet.has(slug)) {
			interleaved.push(slug);
		}
	}

	// Append any articles or folders not present in fullSortOrder (safety net)
	for (const slug of articleSlugs) {
		if (!interleaved.includes(slug)) {
			interleaved.push(slug);
		}
	}
	for (const folder of childFolderNames) {
		if (!interleaved.includes(folder)) {
			interleaved.push(folder);
		}
	}

	return interleaved;
}

/**
 * Builds a map of folder paths to their immediate child folder names.
 * Used to preserve nested folder entries during merge.
 *
 * @param activeFolders - All active folders
 * @returns Map of slugified parent path -> array of immediate child folder names
 */
function buildChildFolderMap(activeFolders: Array<FolderMetaInfo>): Map<string, Array<string>> {
	const childMap = new Map<string, Array<string>>();

	for (const folder of activeFolders) {
		if (!folder.folderPath) {
			continue;
		}

		const slugifiedPath = slugifyPath(folder.folderPath);

		// Find the parent path (everything before the last segment)
		const lastSlash = slugifiedPath.lastIndexOf("/");
		const parentPath = lastSlash === -1 ? "" : slugifiedPath.substring(0, lastSlash);
		const childName = lastSlash === -1 ? slugifiedPath : slugifiedPath.substring(lastSlash + 1);

		const existing = childMap.get(parentPath);
		if (existing) {
			existing.push(childName);
		} else {
			childMap.set(parentPath, [childName]);
		}
	}

	return childMap;
}

/**
 * Generates _meta.ts files for subfolders to allow users to customize article ordering.
 * Uses MetaMerger to preserve user customizations during regeneration.
 *
 * In tabs mode, top-level folders with content have their content as "overview" article
 * instead of index.md. This is added as the first entry in _meta.ts.
 *
 * @param activeFolders - Active folders (folders with current articles, already filtered)
 * @param articles - All articles to get titles from
 * @param options - Optional settings for navigation mode handling
 * @returns Array of FileTree entries for subfolder _meta.ts files
 */
function generateSubfolderMetaFiles(
	activeFolders: Array<FolderMetaInfo>,
	articles: Array<ArticleInput>,
	foldersWithContent: Set<string>,
	options?: SubfolderMetaOptions,
): Array<FileTree> {
	if (activeFolders.length === 0) {
		return [];
	}

	const { slugToTitle, folderSlugToTitle } = buildSlugTitleMaps(articles);
	const childFolderMap = buildChildFolderMap(activeFolders);
	// Full interleaved ordering from articles (articles + child folders in space tree sortOrder)
	const articleSortOrder = buildArticleSortOrder(articles);
	const merger = new MetaMerger();
	const files: Array<FileTree> = [];

	for (const folder of activeFolders) {
		// Skip root folder (empty path) - it's handled separately
		if (!folder.folderPath) {
			continue;
		}

		const hasContent = foldersWithContent.has(folder.folderPath);
		const slugifiedPath = slugifyPath(folder.folderPath);
		const childFolderNames = childFolderMap.get(slugifiedPath) ?? [];

		// Check if this folder uses overview article (tabs mode, top-level folder with content)
		const isTopLevelFolder = !folder.folderPath.includes("/");
		const hasOverview =
			options?.navigationMode === "tabs" &&
			isTopLevelFolder &&
			hasContent &&
			(options?.topLevelFoldersWithOverview?.has(slugifiedPath) ?? false);

		// Skip folders with no articles, no child folders, and no overview entry.
		// Folders that only have an index.md (folder document) don't need _meta.ts —
		// Nextra auto-discovers index pages without it. Generating an empty _meta.ts
		// crashes Nextra's normalizePages (it receives an empty list and tries
		// "data" in undefined).
		const hasArticles = folder.slugs && folder.slugs.length > 0;
		if (!hasArticles && childFolderNames.length === 0 && !hasOverview) {
			continue;
		}

		const finalContent = generateFolderMetaContent(
			folder,
			slugifiedPath,
			hasOverview,
			slugToTitle,
			folderSlugToTitle,
			merger,
			childFolderNames,
			articleSortOrder.get(slugifiedPath),
		);

		files.push({
			path: `content/${slugifiedPath}/_meta.ts`,
			content: finalContent,
		});
	}

	return files;
}

/**
 * Generates a complete Nextra 4.x project from a collection of articles.
 * Returns a FileTree array suitable for uploading to GitHub.
 *
 * This is the main function that the backend will call to generate sites.
 * Uses Nextra 4.x App Router structure:
 * - content/ folder for MDX files
 * - content/_meta.ts for navigation (TypeScript)
 * - app/layout.tsx for theme configuration
 * - app/[...mdxPath]/page.tsx for catch-all route
 *
 * @param articles - Array of article inputs (content, metadata, etc.)
 * @param options - Generation options (siteName, displayName, auth, migrationMode, etc.)
 * Note: regenerationMode is accepted but ignored — all config files are always generated
 * to ensure self-healing if files are accidentally deleted.
 * @returns Object with files array and removedNavEntries for logging
 */
export function generateSiteToMemory(
	articles: Array<ArticleInput>,
	options: GenerateToMemoryOptions,
): GenerateSiteToMemoryResult {
	const { siteName, displayName, auth, migrationMode = false, migrationContext, useSpaceFolderStructure } = options;
	const allowedDomain = auth?.allowedDomain;

	// Build slug-to-folder map from existing repo structure (preserves article locations).
	// When useSpaceFolderStructure is enabled, skip the repo fallback so articles are placed
	// according to the space tree, not where they were manually moved in the repo.
	const slugToFolder = useSpaceFolderStructure
		? new Map<string, string>()
		: buildSlugToFolderMap(migrationContext?.allFolderMetas);

	// Build set of folders that have content files (index.md/overview.md from folder documents)
	// Computed once and passed to functions that need it to avoid redundant traversals
	const foldersWithContent = buildFoldersWithContentSet(articles);

	// Compute active folders - folders that have at least one article in the current set
	const activeFolders = computeActiveFolders(
		articles,
		foldersWithContent,
		migrationContext?.allFolderMetas,
		useSpaceFolderStructure,
	);

	// Build theme configuration early so we have navigationMode for article processing
	const mergedTheme =
		migrationMode && migrationContext?.themeConfig
			? { ...migrationContext.themeConfig, ...options.theme }
			: options.theme;
	const themeConfig = buildThemeConfig(displayName, siteName, mergedTheme);

	// Detect slug collisions (multiple articles with same slug at same path)
	// This can happen when multiple spaces contribute articles with identical titles
	const collisions = detectSlugCollisions(articles, slugToFolder);
	const warnings = formatCollisionWarnings(collisions);

	// Compute set of top-level folder slugs for tabs mode handling
	// These are folder articles that are at root level (no parent folder)
	const topLevelFolderSlugs = new Set<string>();
	for (const article of articles) {
		if (article.isFolder) {
			const articleSlug = getArticleSlug(article);
			// Check if this folder is at root level (no folderPath from Jolli hierarchy)
			// and not placed in a subfolder by existing repo structure
			const folderPath = getArticleFolderPath(articleSlug, article, slugToFolder);
			if (folderPath === "") {
				topLevelFolderSlugs.add(articleSlug);
			}
		}
	}

	// Process articles into files
	const ctx: ArticleProcessingContext = {
		files: [],
		openApiSpecs: [],
		navigationMode: themeConfig.navigationMode,
		topLevelFolderSlugs,
	};
	for (const article of articles) {
		processArticle(article, slugToFolder, ctx);
	}

	// Compute desired root-level slug ordering from ALL articles before any filtering.
	// This captures the space tree's sortOrder for every root-level entry (including empty
	// folders that may be filtered from rootFolderArticles but re-added by applySidebarMode).
	const allRootSlugs = articles
		.filter(article => {
			const slug = getArticleSlug(article);
			const folderPath = getArticleFolderPath(slug, article, slugToFolder);
			return folderPath === "";
		})
		.map(article => getArticleSlug(article));

	// Filter to only root-level articles for navigation.
	// Exclude empty folder articles (no content AND no children) since they produce
	// _meta.ts entries with no corresponding content file, creating broken nav links.
	const activeFolderSlugs = new Set(activeFolders.map(f => f.folderPath).filter(Boolean));
	const rootFolderArticles = articles.filter(article => {
		const slug = getArticleSlug(article);
		// Check both existing repo folder placement and Jolli's hierarchy
		const folderPath = getArticleFolderPath(slug, article, slugToFolder);
		if (folderPath !== "") {
			return false;
		}
		// Exclude empty folders (no content + no children in active folders)
		if (article.isFolder && !hasFolderContent(article) && !activeFolderSlugs.has(slug)) {
			return false;
		}
		return true;
	});

	// Generate navigation meta (header links are included as nav-* entries in _meta.ts)
	// Pass active folders for proper deletion handling
	const navMetaResult = generateNavigationMeta(
		rootFolderArticles,
		activeFolders,
		ctx.openApiSpecs,
		themeConfig.headerLinks,
		migrationContext,
		themeConfig.navigationMode,
		options.preserveNavOrder,
		allRootSlugs,
	);

	const metaFile = generateContentMeta(navMetaResult.navMeta);
	ctx.files.push({ path: metaFile.path, content: metaFile.content });

	// Generate subfolder _meta.ts files for article ordering within folders
	// Uses active folders to skip deleted folders
	// In tabs mode, pass info about which top-level folders have overview articles
	const subfolderMetaFiles = generateSubfolderMetaFiles(activeFolders, articles, foldersWithContent, {
		navigationMode: themeConfig.navigationMode,
		topLevelFoldersWithOverview: topLevelFolderSlugs,
	});
	ctx.files.push(...subfolderMetaFiles);

	// Generate OpenAPI docs files
	ctx.files.push(...generateOpenApiDocsFiles(ctx.openApiSpecs));

	// ALWAYS regenerate app/page.tsx since it contains the redirect to the first article.
	// If articles are added/removed/reordered, the redirect target may change.
	// In tabs mode, folders with content use overview pages as the landing page
	let foldersWithOverview: Set<string> | undefined;
	if (themeConfig.navigationMode === "tabs") {
		foldersWithOverview = new Set<string>();
		for (const slug of topLevelFolderSlugs) {
			if (foldersWithContent.has(slug)) {
				foldersWithOverview.add(slug);
			}
		}
	}
	const firstArticleSlug = getFirstArticleSlug(
		navMetaResult.navMeta,
		activeFolders,
		foldersWithOverview,
		foldersWithContent,
		topLevelFolderSlugs,
	);
	ctx.files.push(generateRootPageFile(firstArticleSlug, ctx.openApiSpecs));

	// Generate all config files (layout, auth, styles, tsconfig, etc.)
	// Always included in both initial generation and regeneration to ensure self-healing:
	// if config files are accidentally deleted (e.g., by navigation sync), regeneration restores them.
	ctx.files.push(...generateProjectConfigFiles(themeConfig, siteName, allowedDomain));

	// ALWAYS generate package.json and vercel.json (critical for build/deploy)
	ctx.files.push({ path: "package.json", content: generateJolliPackageJson(siteName, allowedDomain) });
	ctx.files.push({ path: "vercel.json", content: VERCEL_JSON });

	// Compute empty folders to delete (folders that had articles but now have none)
	// Compare allFolderMetas (original folders) with activeFolders (folders with current articles)
	const foldersToDelete = computeEmptyFolders(migrationContext?.allFolderMetas, activeFolders);

	// When useSpaceFolderStructure is ON, detect articles that moved from their old repo
	// locations and return the old file paths for deletion (prevents stale orphan files).
	const relocatedFilePaths = computeRelocatedFilePaths(
		articles,
		migrationContext?.allFolderMetas,
		useSpaceFolderStructure,
	);

	// Detect orphaned _meta.ts files: folders that exist but lost all their articles.
	// These folders still have index.md (folder content) but no articles, so we skipped
	// generating a new _meta.ts. The old _meta.ts needs to be deleted to avoid stale references.
	// Only applies in auto-sync mode (useSpaceFolderStructure) where articles move to space folders.
	const orphanedMetaFiles = useSpaceFolderStructure
		? computeOrphanedMetaFiles(migrationContext?.allFolderMetas, activeFolders)
		: [];

	return {
		files: ctx.files,
		removedNavEntries: navMetaResult.removedNavEntries,
		foldersToDelete,
		warnings,
		relocatedFilePaths: [...relocatedFilePaths, ...orphanedMetaFiles],
	};
}

/**
 * Returns file paths that need to be deleted when migrating from Nextra 3.x to 4.x.
 * These are the old Page Router files that are replaced by App Router structure.
 */
export function getNextra3xFilesToDelete(): Array<string> {
	return [
		// Page Router files (all possible extensions: .js, .jsx, .ts, .tsx)
		"pages/_app.js",
		"pages/_app.jsx",
		"pages/_app.ts",
		"pages/_app.tsx",
		"pages/_document.js",
		"pages/_document.jsx",
		"pages/_document.ts",
		"pages/_document.tsx",
		"pages/_error.js",
		"pages/_error.jsx",
		"pages/_error.ts",
		"pages/_error.tsx",
		"pages/404.js",
		"pages/404.jsx",
		"pages/404.ts",
		"pages/404.tsx",
		"pages/_meta.js",
		"pages/_meta.global.js",
		"pages/index.mdx",
		// Old auto-generated index page (now replaced by root redirect - JOLLI-191)
		"content/index.mdx",
		// Theme config (replaced by app/layout.tsx)
		"theme.config.js",
		"theme.config.jsx",
		"theme.config.ts",
		"theme.config.tsx",
		// Old Nextra 3.x OpenAPI components (not used in 4.x)
		"components/ViewContext.tsx",
		"components/NavbarApiButton.tsx",
		"components/LogoLink.tsx",
		// HeaderLinks.tsx is no longer used - header links are in _meta.ts (JOLLI-382)
		"components/HeaderLinks.tsx",
		// Old route handler version of auth callback (replaced by page component)
		"app/auth/callback/route.ts",
	];
}
