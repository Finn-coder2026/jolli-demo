/**
 * MetaMerger - Centralized _meta.ts validation and merge logic
 *
 * This class provides:
 * 1. TypeScript syntax validation with line/column error reporting
 * 2. Consistency validation between _meta.ts and content folder
 * 3. Safe merge of existing _meta.ts with new articles
 *
 * Key behavior: On ANY error, keeps _meta.ts untouched (no fallback)
 */

import type { NavMeta } from "../templates/app-router/index.js";
import { isApiPageEntry, isExternalLink, isSeparator, isVirtualGroup } from "./migration.js";
import { runInNewContext } from "node:vm";
import type {
	ApiPageMetaEntry,
	ConsistencyValidationResult,
	ExistingNavMeta,
	ExistingNavMetaEntry,
	FolderMetaInfo,
	MenuItemWithHref,
	MenuNavMeta,
	MergeAllMetaOptions,
	SeparatorMeta,
	SyntaxValidationResult,
	VirtualGroupMeta,
} from "jolli-common";
import ts from "typescript";

// Re-export validation types from jolli-common for consumers of this module
export type {
	ConsistencyValidationResult,
	FolderMetaInfo,
	MergeAllMetaOptions,
	SyntaxValidationResult,
} from "jolli-common";

// ===== Merge Types =====

/**
 * Options for merging _meta.ts with new articles
 */
export interface MergeOptions {
	existingContent: string; // Raw _meta.ts content
	newArticleSlugs: Array<string>; // Selected article slugs
	articleTitles: Map<string, string>; // slug -> title from article metadata
	deletedSlugs?: Array<string>; // Articles being removed
	baseNavMeta?: NavMeta; // Fresh nav meta for API page entries
	knownFolders?: Array<string>; // Folder paths relative to content/ (e.g., "guides", "guides/advanced")
}

/**
 * Report of what changed during merge
 */
export interface MergeReport {
	added: Array<string>; // New entries added
	removed: Array<string>; // Orphaned entries removed
	preserved: Array<string>; // User customizations kept
	warnings: Array<string>; // Issues encountered
}

/**
 * Result of merge operation
 */
export interface MetaMergeResult {
	success: boolean;
	skipRegeneration: boolean; // If true, keep _meta.ts untouched
	meta?: ExistingNavMeta; // Merged result (only if success)
	report: MergeReport;
	error?: string; // Error message if failed
}

/**
 * Result for a single folder's merge operation
 */
export interface FolderMergeResult {
	/** Folder path relative to content root */
	folderPath: string;
	/** The merge result for this folder */
	result: MetaMergeResult;
	/** Generated _meta.ts content (if successful) */
	metaContent?: string;
}

/**
 * Result of merging all _meta.ts files in a content tree
 */
export interface MergeAllResult {
	/** True if all folders merged successfully */
	success: boolean;
	/** Individual results for each folder */
	results: Array<FolderMergeResult>;
	/** Folder paths that succeeded */
	succeeded: Array<string>;
	/** Folder paths that failed or were skipped */
	failed: Array<string>;
}

// ===== Type Guards =====

/**
 * Checks if an href points to an external resource.
 * External hrefs start with http://, https://, or mailto:
 * These are user-added links that should be preserved even if no corresponding article exists.
 */
function isExternalHref(href: string): boolean {
	return href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:");
}

/**
 * Type guard to check if an entry is a display modifier (e.g., { display: 'hidden' })
 * These special entries are used by Nextra for navigation control and should always be preserved.
 */
function isDisplayEntry(entry: ExistingNavMetaEntry): boolean {
	return typeof entry === "object" && "display" in entry;
}

/**
 * Checks if an item value is a MenuItemWithHref (has title and href strings)
 */
function isMenuItemWithHref(value: unknown): value is MenuItemWithHref {
	return (
		typeof value === "object" &&
		value !== null &&
		"title" in value &&
		typeof (value as MenuItemWithHref).title === "string" &&
		"href" in value &&
		typeof (value as MenuItemWithHref).href === "string"
	);
}

/**
 * Checks if all items in an object are MenuItemWithHref (for API Reference dropdown)
 */
function hasMenuItemsWithHref(items: Record<string, unknown>): boolean {
	const values = Object.values(items);
	return values.length > 0 && values.every(isMenuItemWithHref);
}

// ===== MetaMerger Class =====

/**
 * Centralized class for _meta.ts validation and merge operations
 */
export class MetaMerger {
	/**
	 * Validate TypeScript syntax using TS compiler API
	 * Returns line/column for editor navigation on error
	 */
	validateSyntax(content: string): SyntaxValidationResult {
		// Use TypeScript compiler to get accurate syntax errors
		const sourceFile = ts.createSourceFile("_meta.ts", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

		// Check for syntax errors
		// biome-ignore lint/suspicious/noExplicitAny: TypeScript internal API
		const diagnostics = (sourceFile as any).parseDiagnostics || [];
		if (diagnostics.length > 0) {
			const diag = diagnostics[0];
			const { line, character } = sourceFile.getLineAndCharacterOfPosition(diag.start);
			return {
				valid: false,
				error: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
				line: line + 1, // Convert to 1-based
				column: character + 1,
			};
		}

		// Also validate it's a valid export default object
		try {
			const exportMatch = content.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/);
			if (!exportMatch) {
				return { valid: false, error: "Missing 'export default { ... }' structure" };
			}
			// Evaluate the object literal in a sandboxed context (no access to require, process, etc.)
			runInNewContext(`(${exportMatch[1]})`, Object.create(null), { timeout: 1000 });
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}

		return { valid: true };
	}

	/**
	 * Parse _meta.ts content and return ExistingNavMeta structure.
	 * This is the public parsing method that replaces the deprecated parseNavMeta().
	 *
	 * @param content - The raw _meta.ts content
	 * @returns ExistingNavMeta structure, or empty object on parse failure
	 */
	parse(content: string): ExistingNavMeta {
		try {
			const parsed = this.parseMetaContent(content);
			return this.validateAndConvertNavMeta(parsed);
		} catch {
			// Return empty meta on parse failure
			return {};
		}
	}

	/**
	 * Validate consistency between _meta.ts and content folder
	 * Non-blocking - returns warnings but allows proceed
	 */
	validateConsistency(metaContent: string, contentFolderSlugs: Array<string>): ConsistencyValidationResult {
		const syntaxResult = this.validateSyntax(metaContent);
		if (!syntaxResult.valid) {
			// Can't validate consistency if syntax is invalid
			return { valid: false, orphanedEntries: [], missingEntries: [], canProceed: true };
		}

		const metaSlugs = this.extractSlugsFromMeta(metaContent);
		const contentSet = new Set(contentFolderSlugs);
		const metaSet = new Set(metaSlugs);

		// Entries in _meta.ts but not in content folder (orphaned)
		const orphanedEntries = metaSlugs.filter(s => !contentSet.has(s));

		// Entries in content folder but not in _meta.ts (missing)
		const missingEntries = contentFolderSlugs.filter(s => !metaSet.has(s));

		return {
			valid: orphanedEntries.length === 0 && missingEntries.length === 0,
			orphanedEntries,
			missingEntries,
			canProceed: true, // Always allow proceed - warnings only
		};
	}

	/**
	 * Extract article slugs from _meta.ts content
	 * Includes slugs from virtual groups
	 */
	extractSlugsFromMeta(content: string): Array<string> {
		const slugs: Array<string> = [];

		try {
			const parsed = this.parseMetaContent(content);

			for (const [key, value] of Object.entries(parsed)) {
				if (typeof value === "string") {
					// Simple string entry - it's an article slug
					slugs.push(key);
				} else if (typeof value === "object" && value !== null) {
					const obj = value as Record<string, unknown>;
					// Check if it's a virtual group with items
					if ("items" in obj && typeof obj.items === "object" && obj.items !== null) {
						const items = obj.items as Record<string, unknown>;
						// Check if items are string values (article titles, not MenuItemWithHref)
						for (const [itemKey, itemValue] of Object.entries(items)) {
							if (typeof itemValue === "string") {
								slugs.push(itemKey);
							}
						}
					}
					// Skip separators, API pages, and menu entries (they're not article slugs)
				}
			}
		} catch {
			// Return empty array if parsing fails
		}

		return slugs;
	}

	/**
	 * Merge existing _meta.ts with new articles
	 * On ANY error: keeps _meta.ts untouched (NO fallback to legacy parser)
	 */
	merge(options: MergeOptions): MetaMergeResult {
		const report: MergeReport = { added: [], removed: [], preserved: [], warnings: [] };

		try {
			// Step 1: Validate syntax (strict - no fallback)
			const syntaxResult = this.validateSyntax(options.existingContent);
			if (!syntaxResult.valid) {
				report.warnings.push(`Syntax error: ${syntaxResult.error}`);
				return {
					success: false,
					skipRegeneration: true, // KEEP _meta.ts UNTOUCHED
					report,
					error: `Cannot merge: ${syntaxResult.error}. Keeping existing _meta.ts.`,
				};
			}

			// Step 2: Parse the content (no fallback)
			const parsed = this.parseMetaContent(options.existingContent);
			const existingMeta = this.validateAndConvertNavMeta(parsed);

			// Step 3: Merge with new articles
			const result = this.performMerge(existingMeta, options, report);

			return { success: true, skipRegeneration: false, meta: result, report };
		} catch (error) {
			// ANY unexpected error: keep _meta.ts untouched
			report.warnings.push(`Unexpected error: ${error}`);
			return {
				success: false,
				skipRegeneration: true,
				report,
				error: "Merge failed unexpectedly. Keeping existing _meta.ts.",
			};
		}
	}

	/**
	 * Parse _meta.ts content to object - no fallback on error.
	 * Uses vm.runInNewContext for sandboxed evaluation (no access to require, process, etc.)
	 */
	private parseMetaContent(content: string): Record<string, unknown> {
		const exportMatch = content.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/);
		if (!exportMatch) {
			throw new Error("Invalid _meta.ts structure");
		}
		return runInNewContext(`(${exportMatch[1]})`, Object.create(null), { timeout: 1000 }) as Record<
			string,
			unknown
		>;
	}

	/**
	 * Validates and converts a parsed object to ExistingNavMeta type.
	 */
	private validateAndConvertNavMeta(parsed: Record<string, unknown>): ExistingNavMeta {
		const result: ExistingNavMeta = {};

		for (const [key, value] of Object.entries(parsed)) {
			const converted = this.convertNavMetaEntry(key, value);
			if (converted !== undefined) {
				result[key] = converted;
			}
		}

		return result;
	}

	/**
	 * Converts a single parsed entry to the appropriate meta entry type.
	 */
	private convertNavMetaEntry(key: string, value: unknown): ExistingNavMetaEntry | undefined {
		if (typeof value === "string") {
			return value;
		}

		if (typeof value !== "object" || value === null) {
			return;
		}

		const obj = value as Record<string, unknown>;

		// Check for entries with items (could be MenuNavMeta or VirtualGroupMeta)
		if ("items" in obj && typeof obj.items === "object" && obj.items !== null) {
			const items = obj.items as Record<string, unknown>;
			// If items contain objects with href (MenuItemWithHref), it's a MenuNavMeta
			if (hasMenuItemsWithHref(items)) {
				return this.convertToMenuNavMeta(key, obj);
			}
			// Otherwise it's a VirtualGroupMeta (article grouping)
			return this.convertToVirtualGroup(key, obj);
		}

		// Check for API page (has type: 'page' AND href)
		if ("type" in obj && obj.type === "page" && "href" in obj && typeof obj.href === "string") {
			return this.convertToApiPageEntry(key, obj);
		}

		// Check for external link (has href but no type field) - preserve as-is
		if (!("type" in obj) && "href" in obj && typeof obj.href === "string") {
			return value as ExistingNavMetaEntry;
		}

		// Check for separator (may have optional title)
		if (obj.type === "separator") {
			const separator: SeparatorMeta = { type: "separator" };
			if (typeof obj.title === "string") {
				separator.title = obj.title;
			}
			return separator;
		}

		// Check for hidden entry
		if (obj.display === "hidden") {
			// Return as-is for hidden entries
			return { display: "hidden" } as unknown as ExistingNavMetaEntry;
		}

		// Unknown entry type - preserve as-is
		return value as ExistingNavMetaEntry;
	}

	/**
	 * Converts a menu object to MenuNavMeta type
	 */
	private convertToMenuNavMeta(key: string, obj: Record<string, unknown>): MenuNavMeta {
		const items: Record<string, MenuItemWithHref> = {};
		const rawItems = obj.items as Record<string, unknown>;
		for (const [itemKey, itemValue] of Object.entries(rawItems)) {
			if (isMenuItemWithHref(itemValue)) {
				items[itemKey] = { title: itemValue.title, href: itemValue.href };
			}
		}
		return {
			title: typeof obj.title === "string" ? obj.title : key,
			type: "menu",
			items,
		};
	}

	/**
	 * Converts a virtual group object to VirtualGroupMeta type
	 */
	private convertToVirtualGroup(key: string, obj: Record<string, unknown>): VirtualGroupMeta {
		const items: Record<string, string> = {};
		const rawItems = obj.items as Record<string, unknown>;
		for (const [itemKey, itemValue] of Object.entries(rawItems)) {
			if (typeof itemValue === "string") {
				items[itemKey] = itemValue;
			}
		}
		return {
			title: typeof obj.title === "string" ? obj.title : key,
			type: obj.type === "menu" ? "menu" : "page",
			items,
		};
	}

	/**
	 * Converts an API page object to ApiPageMetaEntry type
	 */
	private convertToApiPageEntry(key: string, obj: Record<string, unknown>): ApiPageMetaEntry {
		return {
			title: typeof obj.title === "string" ? obj.title : key,
			type: "page",
			href: obj.href as string,
		};
	}

	/**
	 * Process a virtual group entry, filtering out removed items.
	 * Preserves only items matching current article slugs.
	 *
	 * Note: External link items inside virtual groups are NOT preserved.
	 * Users should use top-level external links instead (which ARE preserved).
	 */
	private processVirtualGroup(
		key: string,
		value: VirtualGroupMeta,
		newSlugSet: Set<string>,
		deletedSet: Set<string>,
		usedSlugs: Set<string>,
		report: MergeReport,
	): VirtualGroupMeta | null {
		const filteredItems: Record<string, string> = {};
		for (const [itemKey, itemValue] of Object.entries(value.items)) {
			if (newSlugSet.has(itemKey) && !deletedSet.has(itemKey)) {
				// Item matches an article slug - preserve it
				filteredItems[itemKey] = itemValue;
				usedSlugs.add(itemKey);
				report.preserved.push(`${key}/${itemKey}`);
			} else {
				report.removed.push(`${key}/${itemKey}`);
			}
		}

		if (Object.keys(filteredItems).length > 0) {
			return { ...value, items: filteredItems };
		}
		report.removed.push(`${key} (empty group)`);
		return null;
	}

	/**
	 * Perform the actual merge operation
	 */
	private performMerge(existingMeta: ExistingNavMeta, options: MergeOptions, report: MergeReport): ExistingNavMeta {
		const result: ExistingNavMeta = {};
		const deletedSet = new Set(options.deletedSlugs ?? []);
		const newSlugSet = new Set(options.newArticleSlugs);
		const usedSlugs = new Set<string>();

		// Build folder name set from known folders (extract immediate folder names)
		// e.g., "guides" from "guides", "advanced" from "guides/advanced"
		const folderNameSet = new Set<string>();
		for (const folderPath of options.knownFolders ?? []) {
			const folderName = folderPath.split("/").pop() || folderPath;
			folderNameSet.add(folderName);
		}

		// Step 1: Process existing entries, preserving structure but removing orphans
		for (const [key, value] of Object.entries(existingMeta)) {
			this.processExistingEntry(
				key,
				value,
				result,
				newSlugSet,
				deletedSet,
				usedSlugs,
				folderNameSet,
				options,
				report,
			);
		}

		// Step 2: Add new articles that weren't found in existing meta (at top level)
		for (const slug of options.newArticleSlugs) {
			if (!usedSlugs.has(slug) && !deletedSet.has(slug)) {
				result[slug] = options.articleTitles.get(slug) ?? slug;
				report.added.push(slug);
			}
		}

		// Step 3: Ensure index is always first
		if ("index" in result) {
			const indexEntry = result.index;
			delete result.index;
			return { index: indexEntry, ...result };
		}

		return result;
	}

	/**
	 * Process a single existing entry during merge
	 */
	private processExistingEntry(
		key: string,
		value: ExistingNavMetaEntry,
		result: ExistingNavMeta,
		newSlugSet: Set<string>,
		deletedSet: Set<string>,
		usedSlugs: Set<string>,
		folderNameSet: Set<string>,
		options: MergeOptions,
		report: MergeReport,
	): void {
		if (typeof value === "string") {
			// Check if key matches an article slug
			if (newSlugSet.has(key) && !deletedSet.has(key)) {
				result[key] = value;
				usedSlugs.add(key);
				report.preserved.push(key);
			} else if (folderNameSet.has(key)) {
				// Key matches a known folder - preserve it
				result[key] = value;
				report.preserved.push(`${key} (folder)`);
			} else if (key !== "index") {
				report.removed.push(key);
			}
		} else if (isVirtualGroup(value)) {
			const filtered = this.processVirtualGroup(key, value, newSlugSet, deletedSet, usedSlugs, report);
			if (filtered) {
				result[key] = filtered;
			}
		} else if (isExternalLink(value)) {
			// External link entries (e.g., { title: 'Contact', href: 'mailto:...' }) are always preserved
			result[key] = value;
			report.preserved.push(key);
		} else if (isApiPageEntry(value)) {
			// API page entries: preserve if either:
			// 1. They exist in the new generation (baseNavMeta), OR
			// 2. They have an external href (user-added external links)
			const baseEntry = options.baseNavMeta?.[key];
			const hasExternalHref = value.href ? isExternalHref(value.href) : false;
			if (baseEntry !== undefined || hasExternalHref) {
				result[key] = value;
				report.preserved.push(hasExternalHref ? `${key} (external link)` : key);
			} else {
				report.removed.push(key);
			}
		} else if (isSeparator(value)) {
			result[key] = value;
			report.preserved.push(key);
		} else if (isDisplayEntry(value)) {
			// Display modifier entries (e.g., { display: 'hidden' }) are always preserved
			result[key] = value;
			report.preserved.push(key);
		} else {
			// Complex entry (e.g., { title: 'API', type: 'page' }) - check if it matches an article
			if (newSlugSet.has(key) && !deletedSet.has(key)) {
				result[key] = value;
				usedSlugs.add(key); // Prevent Step 2 from overwriting
				report.preserved.push(key);
			} else if (folderNameSet.has(key)) {
				// Key matches a known folder - preserve it
				result[key] = value;
				report.preserved.push(`${key} (folder)`);
			} else {
				// No matching article or folder - remove as orphaned
				report.removed.push(key);
			}
		}
	}

	/**
	 * Merge from already-parsed ExistingNavMeta (for backward compatibility)
	 *
	 * Use this when you already have a parsed ExistingNavMeta object.
	 * This bypasses syntax validation since the content is already parsed.
	 *
	 * @param options.existingMeta - Already-parsed navigation meta object
	 * @param options.newArticleSlugs - Array of article slugs to include
	 * @param options.articleTitles - Map of slug -> title
	 * @param options.deletedSlugs - Optional array of slugs to remove
	 * @param options.baseNavMeta - Fresh nav meta for API page entries
	 * @param options.knownFolders - Optional folder paths to preserve during merge
	 */
	mergeFromParsed(options: {
		existingMeta: ExistingNavMeta;
		newArticleSlugs: Array<string>;
		articleTitles: Map<string, string>;
		deletedSlugs?: Array<string>;
		baseNavMeta?: NavMeta;
		knownFolders?: Array<string>;
	}): MetaMergeResult {
		const report: MergeReport = { added: [], removed: [], preserved: [], warnings: [] };

		try {
			// Convert options to match internal MergeOptions format
			const mergeOptions: MergeOptions = {
				existingContent: "", // Not used in performMerge
				newArticleSlugs: options.newArticleSlugs,
				articleTitles: options.articleTitles,
			};
			// Only add optional properties if they are defined (exactOptionalPropertyTypes)
			if (options.deletedSlugs !== undefined) {
				mergeOptions.deletedSlugs = options.deletedSlugs;
			}
			if (options.baseNavMeta !== undefined) {
				mergeOptions.baseNavMeta = options.baseNavMeta;
			}
			if (options.knownFolders !== undefined) {
				mergeOptions.knownFolders = options.knownFolders;
			}

			// Perform merge directly on parsed meta
			const result = this.performMerge(options.existingMeta, mergeOptions, report);

			return { success: true, skipRegeneration: false, meta: result, report };
		} catch (error) {
			report.warnings.push(`Unexpected error: ${error}`);
			return {
				success: false,
				skipRegeneration: true,
				report,
				error: "Merge failed unexpectedly. Keeping existing _meta.ts.",
			};
		}
	}

	/**
	 * Merge all _meta.ts files in a content tree.
	 * Processes each folder independently, preserving user customizations.
	 *
	 * @param options - Contains folder info, article titles, and optional deleted slugs
	 * @returns Results for all folders with generated _meta.ts content
	 */
	mergeAllMetaFiles(options: MergeAllMetaOptions): MergeAllResult {
		const results: Array<FolderMergeResult> = [];
		const succeeded: Array<string> = [];
		const failed: Array<string> = [];

		for (const folder of options.folders) {
			const folderResult = this.mergeFolder(folder, options);
			results.push(folderResult);

			if (folderResult.result.success) {
				succeeded.push(folder.folderPath);
			} else {
				failed.push(folder.folderPath);
			}
		}

		return {
			success: failed.length === 0,
			results,
			succeeded,
			failed,
		};
	}

	/**
	 * Merge a single folder's _meta.ts with its slugs.
	 */
	private mergeFolder(folder: FolderMetaInfo, options: MergeAllMetaOptions): FolderMergeResult {
		// If folder has no slugs and no existing meta, skip it
		if (folder.slugs.length === 0 && !folder.metaContent) {
			return {
				folderPath: folder.folderPath,
				result: {
					success: true,
					skipRegeneration: true,
					report: { added: [], removed: [], preserved: [], warnings: [] },
				},
			};
		}

		// If folder has no existing meta, generate fresh one
		if (!folder.metaContent) {
			const meta: ExistingNavMeta = {};
			for (const slug of folder.slugs) {
				meta[slug] = options.articleTitles.get(slug) ?? slug;
			}
			return {
				folderPath: folder.folderPath,
				result: {
					success: true,
					skipRegeneration: false,
					meta,
					report: { added: folder.slugs, removed: [], preserved: [], warnings: [] },
				},
				metaContent: this.serializeNavMeta(meta),
			};
		}

		// Merge existing meta with folder slugs
		const mergeOptions: MergeOptions = {
			existingContent: folder.metaContent,
			newArticleSlugs: folder.slugs,
			articleTitles: options.articleTitles,
		};
		// Only add deletedSlugs if defined (exactOptionalPropertyTypes)
		if (options.deletedSlugs !== undefined) {
			mergeOptions.deletedSlugs = options.deletedSlugs;
		}
		const mergeResult = this.merge(mergeOptions);

		const result: FolderMergeResult = {
			folderPath: folder.folderPath,
			result: mergeResult,
		};

		if (mergeResult.success && mergeResult.meta) {
			result.metaContent = this.serializeNavMeta(mergeResult.meta);
		}

		return result;
	}

	/**
	 * Serialize ExistingNavMeta back to _meta.ts content string.
	 * Produces properly formatted TypeScript with single quotes.
	 */
	serializeNavMeta(meta: ExistingNavMeta): string {
		const lines: Array<string> = ["export default {"];

		const entries = Object.entries(meta);
		for (let i = 0; i < entries.length; i++) {
			const [key, value] = entries[i];
			const isLast = i === entries.length - 1;
			const comma = isLast ? "" : ",";
			const serialized = this.serializeEntry(key, value);
			lines.push(`  ${serialized}${comma}`);
		}

		lines.push("};");
		return lines.join("\n");
	}

	/**
	 * Serialize a single entry to string format.
	 */
	private serializeEntry(key: string, value: ExistingNavMetaEntry): string {
		const quotedKey = this.quoteKey(key);

		if (typeof value === "string") {
			return `${quotedKey}: '${this.escapeString(value)}'`;
		}

		// Handle complex objects
		return `${quotedKey}: ${this.serializeObject(value)}`;
	}

	/**
	 * Quote a key if it contains special characters.
	 */
	private quoteKey(key: string): string {
		// Keys with hyphens or special chars need quotes
		if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
			return key;
		}
		return `'${this.escapeString(key)}'`;
	}

	/**
	 * Escape a string for use in single quotes.
	 */
	private escapeString(str: string): string {
		return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
	}

	/**
	 * Serialize a complex object (separator, virtual group, API page, etc.)
	 */
	private serializeObject(obj: ExistingNavMetaEntry): string {
		if (typeof obj !== "object" || obj === null) {
			return "{}";
		}

		const parts: Array<string> = [];
		// Use unknown first to safely convert to Record<string, unknown>
		const record = obj as unknown as Record<string, unknown>;

		for (const [key, value] of Object.entries(record)) {
			if (value === undefined) {
				continue;
			}

			const quotedKey = this.quoteKey(key);

			if (typeof value === "string") {
				parts.push(`${quotedKey}: '${this.escapeString(value)}'`);
			} else if (typeof value === "object" && value !== null) {
				// Handle nested items object (for virtual groups or menus)
				const nested = this.serializeNestedItems(value as Record<string, unknown>);
				parts.push(`${quotedKey}: ${nested}`);
			}
		}

		return `{ ${parts.join(", ")} }`;
	}

	/**
	 * Serialize nested items (for virtual groups or menus).
	 */
	private serializeNestedItems(items: Record<string, unknown>): string {
		const parts: Array<string> = [];

		for (const [key, value] of Object.entries(items)) {
			const quotedKey = this.quoteKey(key);

			if (typeof value === "string") {
				parts.push(`${quotedKey}: '${this.escapeString(value)}'`);
			} else if (typeof value === "object" && value !== null) {
				const item = value as Record<string, unknown>;
				// Check if it's a MenuItemWithHref (has title and/or href)
				if ("title" in item || "href" in item) {
					// MenuItemWithHref - serialize title and href only
					const itemParts: Array<string> = [];
					if (typeof item.title === "string") {
						itemParts.push(`title: '${this.escapeString(item.title)}'`);
					}
					if (typeof item.href === "string") {
						itemParts.push(`href: '${this.escapeString(item.href)}'`);
					}
					parts.push(`${quotedKey}: { ${itemParts.join(", ")} }`);
				} else {
					// Generic nested object - recursively serialize
					const nested = this.serializeNestedItems(item);
					parts.push(`${quotedKey}: ${nested}`);
				}
			}
		}

		return `{ ${parts.join(", ")} }`;
	}
}
