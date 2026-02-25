/**
 * Navigation meta types for Nextra _meta.ts files
 * Supports both simple string entries and complex nested structures (virtual groups)
 */

/**
 * Virtual group entry in _meta.ts - contains nested article items
 * Example: { title: 'Docs', type: 'page', items: { 'intro': 'Introduction' } }
 */
export interface VirtualGroupMeta {
	title: string;
	type: "page" | "menu";
	items: Record<string, string>;
}

/**
 * Page entry - can be a navbar tab (no href) or link to specific page (with href)
 * Without href: Appears as navbar tab pointing to corresponding content file by slug
 * With href: Appears as navbar tab pointing to specified internal/external page
 * Example (tab): { title: 'Guide', type: 'page' }
 * Example (link): { title: 'API', type: 'page', href: '/api-docs.html' }
 */
export interface ApiPageMetaEntry {
	title: string;
	type: "page";
	href?: string;
	newWindow?: boolean;
}

/**
 * External link entry - pure external URL (no type needed)
 * Per Nextra docs, external links just need href without type: 'page'
 * Example: { title: 'GitHub', href: 'https://github.com', newWindow: true }
 */
export interface ExternalLinkMetaEntry {
	title: string;
	href: string;
	newWindow?: boolean;
}

/**
 * Separator entry in _meta.ts
 * Can optionally have a title for labeled separators
 * Example: { type: 'separator', title: 'Docs' }
 */
export interface SeparatorMeta {
	type: "separator";
	title?: string;
}

/**
 * Menu item with href for API Reference dropdown
 * Example: { title: 'Pet Store API', href: '/api-docs/petstore' }
 */
export interface MenuItemWithHref {
	title: string;
	href: string;
}

/**
 * Menu entry with href items - for API Reference dropdown with multiple specs
 * Example: { title: 'API Reference', type: 'menu', items: { petstore: { title: 'Pet Store', href: '/api-docs/petstore' } } }
 */
export interface MenuNavMeta {
	title: string;
	type: "menu";
	items: Record<string, MenuItemWithHref>;
}

/**
 * Possible entry types in _meta.ts
 */
export type ExistingNavMetaEntry =
	| string
	| VirtualGroupMeta
	| ApiPageMetaEntry
	| ExternalLinkMetaEntry
	| SeparatorMeta
	| MenuNavMeta;

/**
 * Existing navigation meta from Nextra _meta.ts (supports nested virtual groups)
 */
export type ExistingNavMeta = Record<string, ExistingNavMetaEntry>;

/**
 * Simple flat navigation meta (string values only)
 * Used for compatibility with functions that expect flat structure
 */
export type FlatNavMeta = Record<string, string>;

// ===== Validation Types (for MetaMerger) =====

/**
 * Result of TypeScript syntax validation on _meta.ts content.
 * Used by backend to validate before saving, and by frontend to show error location.
 */
export interface SyntaxValidationResult {
	valid: boolean;
	/** Error message if validation failed */
	error?: string;
	/** 1-based line number where error occurred (for editor navigation) */
	line?: number;
	/** 1-based column number where error occurred (for editor navigation) */
	column?: number;
}

/**
 * Result of consistency validation between _meta.ts and content folder.
 * Used before rebuild to warn about orphaned or missing entries.
 */
export interface ConsistencyValidationResult {
	/** False if there are orphaned or missing entries */
	valid: boolean;
	/** Entries in _meta.ts but no matching article file in content folder */
	orphanedEntries: Array<string>;
	/** Article files in content folder but not listed in _meta.ts */
	missingEntries: Array<string>;
	/** Always true - warnings are non-blocking, user can proceed */
	canProceed: boolean;
}

// ===== Multi-Folder Meta Types =====

/**
 * Information about a folder's _meta.ts and its contents.
 * Used for merging multiple _meta.ts files during site rebuild.
 */
export interface FolderMetaInfo {
	/** Folder path relative to content root (e.g., "", "guides", "guides/advanced") */
	folderPath: string;
	/** Current _meta.ts content for this folder (empty string if doesn't exist) */
	metaContent: string;
	/** List of MDX file slugs in this folder */
	slugs: Array<string>;
}

/**
 * Options for merging all _meta.ts files in a content tree.
 */
export interface MergeAllMetaOptions {
	/** Information about each folder's _meta.ts and contents */
	folders: Array<FolderMetaInfo>;
	/** Map of slug -> title from article metadata (for all articles) */
	articleTitles: Map<string, string>;
	/** Optional: slugs being deleted across all folders */
	deletedSlugs?: Array<string>;
}
