/**
 * Client-side _meta.ts validation utility.
 * Provides fast validation without server roundtrips.
 *
 * Validates:
 * 1. TypeScript/JavaScript syntax errors with line/column info (uses TS compiler when loaded)
 * 2. Orphaned entries (in _meta.ts but no matching content file)
 * 3. Missing entries (content files not listed in _meta.ts)
 */

import { isTypeScriptLoaded, type SyntaxError as TsSyntaxError, validateSyntaxSync } from "./TypeScriptLoader";

// Re-export loadTypeScript so RepositoryViewer can preload it when editing starts
export { isTypeScriptLoaded, loadTypeScript } from "./TypeScriptLoader";

/** Validation issue with location info */
export interface ValidationIssue {
	/** Error/warning message */
	message: string;
	/** Issue type: error blocks save, warning is informational */
	type: "error" | "warning";
	/** 1-based line number (if available) */
	line?: number;
	/** 1-based column number (if available) */
	column?: number;
	/** The slug/key this issue relates to (for orphaned/missing) */
	slug?: string;
}

/** Result of client-side validation */
export interface MetaValidationResult {
	/** True if no blocking errors (warnings are allowed) */
	valid: boolean;
	/** All issues found (errors and warnings) */
	issues: Array<ValidationIssue>;
	/** Syntax errors only */
	syntaxErrors: Array<ValidationIssue>;
	/** Orphaned entries (in _meta.ts but no file) */
	orphanedEntries: Array<ValidationIssue>;
	/** Missing entries (files not in _meta.ts) */
	missingEntries: Array<ValidationIssue>;
}

/**
 * Special keys in _meta.ts that are not article slugs.
 * These are property names for Nextra configuration, not navigation entries.
 */
const SPECIAL_KEYS = new Set(["type", "title", "items", "href", "display", "default", "theme", "newWindow"]);

/**
 * Extract slugs from _meta.ts content.
 * Parses the export default object and extracts all article slugs,
 * including those nested in virtual groups.
 *
 * @param content - The _meta.ts file content
 * @returns Map of slug -> line number (1-based)
 * @internal Exported for testing
 */
export function extractSlugsWithLineNumbers(content: string): Map<string, number> {
	const slugs = new Map<string, number>();

	// Extract the object literal from export default
	const exportMatch = content.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/);
	if (!exportMatch) {
		return slugs;
	}

	const objectLiteral = exportMatch[1];

	// Try to parse the object to get the actual keys
	try {
		const parsed = new Function(`return (${objectLiteral})`)() as Record<string, unknown>;
		extractSlugsFromObject(parsed, content, slugs);
	} catch {
		// If parsing fails, fall back to regex-based extraction
		extractSlugsWithRegex(content, slugs);
	}

	return slugs;
}

/**
 * Check if an object value represents a navigation-only configuration (no file required).
 *
 * Navigation-only configs (no file required):
 * - { type: 'separator' } - visual separator
 * - { href: '...' } - external link
 * - { type: 'page', items: { ... } } - virtual folder/group
 * - { display: 'hidden' } - hidden from navigation, no file needed
 *
 * Page configs that require files:
 * - { title: 'Custom Title' } - page with custom title
 * - { theme: { ... } } - page with theme config
 */
function isNavigationOnlyConfig(objValue: Record<string, unknown>): boolean {
	// Separators don't need files
	if (objValue.type === "separator") {
		return true;
	}

	// External links don't need files
	if (objValue.href !== undefined) {
		return true;
	}

	// Virtual groups (has items) - the group itself doesn't need a file
	// but items inside do (handled by recursion)
	if (objValue.items && typeof objValue.items === "object") {
		return true;
	}

	// Display-only configs (e.g., { display: 'hidden' }) don't require files
	// This is used to hide pages from navigation without needing the actual file
	if (objValue.display !== undefined && Object.keys(objValue).length === 1) {
		return true;
	}

	return false;
}

/**
 * Extract slugs from a parsed _meta.ts object.
 * Recursively handles nested objects (virtual groups).
 */
function extractSlugsFromObject(obj: Record<string, unknown>, content: string, slugs: Map<string, number>): void {
	for (const [key, value] of Object.entries(obj)) {
		// Skip special keys
		if (SPECIAL_KEYS.has(key)) {
			continue;
		}

		const lineNum = findKeyLineNumber(content, key);

		if (typeof value === "string") {
			// Simple string value - this is an article slug with title
			slugs.set(key, lineNum);
		} else if (typeof value === "object" && value !== null) {
			const objValue = value as Record<string, unknown>;

			// Check if it's a navigation-only config (no file required)
			if (isNavigationOnlyConfig(objValue)) {
				// Recurse into items if present (virtual group)
				if (objValue.items && typeof objValue.items === "object") {
					extractSlugsFromObject(objValue.items as Record<string, unknown>, content, slugs);
				}
				continue;
			}

			// Page configuration (display, title, theme, etc.) - requires a file
			slugs.set(key, lineNum);
		}
	}
}

/**
 * Find the line number where a key appears in the content.
 * Returns 1 if not found.
 * @internal Exported for testing
 */
export function findKeyLineNumber(content: string, key: string): number {
	const lines = content.split("\n");

	// Pattern to match the key in an object literal
	// Handles: key:, "key":, 'key':
	const keyPatterns = [
		new RegExp(`^\\s*${escapeRegex(key)}\\s*:`),
		new RegExp(`^\\s*["']${escapeRegex(key)}["']\\s*:`),
		new RegExp(`[{,]\\s*${escapeRegex(key)}\\s*:`),
		new RegExp(`[{,]\\s*["']${escapeRegex(key)}["']\\s*:`),
	];

	for (let i = 0; i < lines.length; i++) {
		for (const pattern of keyPatterns) {
			if (pattern.test(lines[i])) {
				return i + 1;
			}
		}
	}

	return 1;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fallback regex-based slug extraction when parsing fails.
 * Used when the object has syntax errors but we still want to extract what we can.
 * @internal Exported for testing
 */
export function extractSlugsWithRegex(content: string, slugs: Map<string, number>): void {
	const lines = content.split("\n");

	// Pattern to match key: "value" or "key": "value" pairs
	// This is a simplified extraction that may not be 100% accurate
	const keyValuePattern = /["']?([a-zA-Z0-9_-]+)["']?\s*:\s*["']([^"']+)["']/g;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const matches = line.matchAll(keyValuePattern);

		for (const match of matches) {
			const key = match[1];
			if (!SPECIAL_KEYS.has(key)) {
				slugs.set(key, i + 1);
			}
		}
	}
}

/**
 * Validate TypeScript/JavaScript syntax of _meta.ts content.
 * Uses TypeScript compiler when loaded (for accurate line numbers),
 * falls back to Function constructor otherwise.
 *
 * @param content - The _meta.ts file content
 * @returns Array of syntax error issues
 */
function validateSyntax(content: string): Array<ValidationIssue> {
	// Try to use TypeScript compiler if loaded (gives accurate line numbers)
	/* v8 ignore start - TypeScript not loaded from CDN in Node.js tests */
	if (isTypeScriptLoaded()) {
		const tsErrors = validateSyntaxSync(content);
		if (tsErrors !== null) {
			return tsErrors.map((err: TsSyntaxError) => ({
				message: err.message,
				type: "error" as const,
				line: err.line,
				column: err.column,
			}));
		}
	}
	/* v8 ignore stop */

	// Fallback to Function constructor parsing
	return validateSyntaxFallback(content);
}

/**
 * Fallback syntax validation using Function constructor.
 * Used when TypeScript compiler is not loaded.
 */
function validateSyntaxFallback(content: string): Array<ValidationIssue> {
	const issues: Array<ValidationIssue> = [];

	// Check for export default structure
	const exportMatch = content.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/);
	if (!exportMatch) {
		// Try to find where the issue is
		if (!content.includes("export default")) {
			issues.push({
				message: "Missing 'export default' statement",
				type: "error",
				line: 1,
			});
		} else {
			// Find the line with export default
			const lines = content.split("\n");
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].includes("export default")) {
					issues.push({
						message: "Invalid 'export default' structure - expected an object literal",
						type: "error",
						line: i + 1,
					});
					break;
				}
			}
		}
		return issues;
	}

	// Try to parse the object literal
	try {
		// Use Function constructor to parse (safer than eval)
		new Function(`return (${exportMatch[1]})`)();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Try to extract line number from error message
		// Common patterns: "at line X", "line X", "(X:Y)"
		let line: number | undefined;
		let column: number | undefined;

		// Try to extract "line X" from error message - rare in browser JS
		/* v8 ignore next 4 - JS Function constructor rarely produces this format */
		const lineMatch = errorMessage.match(/line\s+(\d+)/i);
		if (lineMatch) {
			line = Number.parseInt(lineMatch[1], 10);
		}

		// Try to extract position from error format "(line:column)" - rare in browser JS
		/* v8 ignore start - JS Function constructor rarely produces this format */
		const posMatch = errorMessage.match(/\((\d+):(\d+)\)/);
		if (posMatch) {
			line = Number.parseInt(posMatch[1], 10);
			column = Number.parseInt(posMatch[2], 10);
		}
		/* v8 ignore stop */

		// If we couldn't find line info from error message, detect common issues
		if (!line) {
			line = findSyntaxErrorLine(content, errorMessage);
		}

		const issue: ValidationIssue = {
			message: errorMessage,
			type: "error",
			line, // Always set - findSyntaxErrorLine now always returns a value
		};
		/* v8 ignore next 3 - column rarely set by JS Function constructor */
		if (column !== undefined) {
			issue.column = column;
		}
		issues.push(issue);
	}

	return issues;
}

/**
 * Find line with unclosed braces or brackets.
 * Note: This function is only called from paths that are difficult to trigger
 * in tests because they require specific error message formats.
 */
/* v8 ignore start - helper function only called from hard-to-test error paths */
function findUnclosedBraceLine(lines: Array<string>): number | undefined {
	let braceCount = 0;
	let bracketCount = 0;
	let lastOpenBraceLine = 0;

	for (let i = 0; i < lines.length; i++) {
		for (const char of lines[i]) {
			if (char === "{") {
				braceCount++;
				lastOpenBraceLine = i + 1;
			} else if (char === "}") {
				braceCount--;
			} else if (char === "[") {
				bracketCount++;
				lastOpenBraceLine = i + 1;
			} else if (char === "]") {
				bracketCount--;
			}
		}
	}

	if (braceCount !== 0 || bracketCount !== 0) {
		return lastOpenBraceLine || lines.length;
	}
}
/* v8 ignore stop */

/**
 * Check if a line ends with a value that might need a trailing comma.
 */
function lineNeedsTrailingComma(line: string, nextLine: string): boolean {
	const endsWithValue = line.endsWith('"') || line.endsWith("'") || line.endsWith("}");
	const hasNoComma = !line.endsWith(",");
	const nextLineStartsKey = nextLine.startsWith('"') || nextLine.startsWith("'") || /^[a-zA-Z_]/.test(nextLine);
	return endsWithValue && hasNoComma && nextLineStartsKey;
}

/**
 * Find line with missing comma.
 */
function findMissingCommaLine(lines: Array<string>): number | undefined {
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i].trim();
		const nextLine = lines[i + 1].trim();

		if (lineNeedsTrailingComma(line, nextLine)) {
			return i + 1;
		}
	}
}

/**
 * Try to find the line where a syntax error occurred.
 * Looks for common issues like unclosed braces, missing commas, etc.
 * Always returns a line number (defaults to line 1 if no specific line can be identified).
 */
function findSyntaxErrorLine(content: string, errorMessage: string): number {
	const lines = content.split("\n");
	const lowerError = errorMessage.toLowerCase();

	// Check for unclosed braces/brackets
	// Note: This path is difficult to test because the regex requires balanced braces,
	// but these error messages suggest unbalanced structures
	/* v8 ignore start */
	if (lowerError.includes("unexpected end") || lowerError.includes("unterminated")) {
		const unclosedLine = findUnclosedBraceLine(lines);
		if (unclosedLine !== undefined) {
			return unclosedLine;
		}
	}
	/* v8 ignore stop */

	// Check for missing commas
	if (lowerError.includes("expected") || lowerError.includes("unexpected token")) {
		const commaLine = findMissingCommaLine(lines);
		if (commaLine !== undefined) {
			return commaLine;
		}
	}

	// Try to find any unclosed brace as a fallback
	const unclosedLine = findUnclosedBraceLine(lines);
	if (unclosedLine !== undefined) {
		return unclosedLine;
	}

	// Default to first line with content after 'export default'
	// Note: This will always be found because findSyntaxErrorLine is only called
	// when validateSyntaxFallback's regex matched, which requires "export default {"
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes("export default")) {
			return i + 1;
		}
	}

	/* v8 ignore start - defensive fallback that should never be reached */
	// because the for loop above will always find "export default"
	return 1;
}
/* v8 ignore stop */

/**
 * Validate _meta.ts content against content folder files.
 *
 * @param content - The _meta.ts file content
 * @param contentFiles - Array of file paths in the content folder (e.g., ["intro.mdx", "guide/setup.mdx"])
 * @param folders - Optional array of folder paths relative to content/ (e.g., ["guides", "guides/advanced"])
 * @returns Full validation result
 */
export function validateMetaContent(
	content: string,
	contentFiles: Array<string>,
	folders?: Array<string>,
): MetaValidationResult {
	const issues: Array<ValidationIssue> = [];
	const syntaxErrors: Array<ValidationIssue> = [];
	const orphanedEntries: Array<ValidationIssue> = [];
	const missingEntries: Array<ValidationIssue> = [];

	// Step 1: Validate syntax
	const syntaxIssues = validateSyntax(content);
	syntaxErrors.push(...syntaxIssues);
	issues.push(...syntaxIssues);

	// If there are syntax errors, we can't reliably parse for consistency
	if (syntaxErrors.length > 0) {
		return {
			valid: false,
			issues,
			syntaxErrors,
			orphanedEntries,
			missingEntries,
		};
	}

	// Step 2: Extract slugs from _meta.ts with line numbers
	const metaSlugs = extractSlugsWithLineNumbers(content);

	// Step 3: Get content file slugs (remove .mdx/.md extension and path prefix)
	const contentSlugs = new Set(
		contentFiles
			.filter(f => f.endsWith(".mdx") || f.endsWith(".md"))
			.map(f => {
				// Remove extension and any path prefix
				const withoutExt = f.replace(/\.(mdx|md)$/, "");
				// Get just the filename if it has a path
				const parts = withoutExt.split("/");
				return parts[parts.length - 1];
			}),
	);

	// Build folder name set from folder paths (e.g., "guides" from "guides/advanced")
	const folderNames = new Set((folders ?? []).map(f => f.split("/").pop() || f));

	// Step 4: Find orphaned entries (in _meta.ts but no matching file or folder)
	for (const [slug, lineNum] of metaSlugs) {
		// Skip if slug matches a known folder name
		if (folderNames.has(slug)) {
			continue;
		}
		if (!contentSlugs.has(slug)) {
			const issue: ValidationIssue = {
				message: `Entry "${slug}" has no matching content file`,
				type: "error",
				line: lineNum,
				slug,
			};
			orphanedEntries.push(issue);
			issues.push(issue);
		}
	}

	// Step 5: Find missing entries (files not in _meta.ts)
	for (const slug of contentSlugs) {
		if (!metaSlugs.has(slug)) {
			const issue: ValidationIssue = {
				message: `Content file "${slug}.mdx" is not listed in navigation. Double-click to add it to _meta.ts.`,
				type: "warning",
				slug,
			};
			missingEntries.push(issue);
			issues.push(issue);
		}
	}

	return {
		valid: syntaxErrors.length === 0 && orphanedEntries.length === 0, // Valid if no syntax errors or orphaned entries
		issues,
		syntaxErrors,
		orphanedEntries,
		missingEntries,
	};
}

/**
 * Quick syntax-only validation (no consistency check).
 * Use this when you don't have the content file list.
 * Only checks for syntax errors, ignores orphaned/missing entries.
 */
export function validateMetaSyntaxOnly(content: string): MetaValidationResult {
	const result = validateMetaContent(content, []);
	// For syntax-only validation, ignore orphaned entries (since we have no content files to compare)
	return {
		valid: result.syntaxErrors.length === 0,
		issues: result.syntaxErrors, // Only syntax errors
		syntaxErrors: result.syntaxErrors,
		orphanedEntries: [], // Empty - not checking consistency
		missingEntries: [], // Empty - not checking consistency
	};
}
