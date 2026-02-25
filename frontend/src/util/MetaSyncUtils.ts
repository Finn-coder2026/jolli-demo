/**
 * Meta content manipulation utilities for _meta.ts files.
 * These functions modify _meta.ts content for tree-to-meta sync operations.
 *
 * Separated from MetaValidator.ts which handles validation-only logic.
 */

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the index of a matching closing brace for an opening brace.
 *
 * @param content - The content string
 * @param openIndex - Index of the opening brace
 * @returns Index after the closing brace
 */
function findMatchingBrace(content: string, openIndex: number): number {
	let depth = 0;
	let i = openIndex;
	let inString = false;
	let stringChar = "";

	while (i < content.length) {
		const char = content[i];

		if (inString) {
			if (char === "\\" && i + 1 < content.length) {
				// Skip escaped character
				i += 2;
				continue;
			}
			if (char === stringChar) {
				inString = false;
			}
		} else {
			if (char === '"' || char === "'") {
				inString = true;
				stringChar = char;
			} else if (char === "{") {
				depth++;
			} else if (char === "}") {
				depth--;
				if (depth === 0) {
					return i + 1;
				}
			}
		}
		i++;
	}

	return content.length;
}

/**
 * Find the closing quote for a string value.
 *
 * @param content - The content string
 * @param openIndex - Index of the opening quote
 * @param quoteChar - The quote character (' or ")
 * @returns Index after the closing quote
 */
function findClosingQuote(content: string, openIndex: number, quoteChar: string): number {
	let i = openIndex + 1;

	while (i < content.length) {
		const char = content[i];

		if (char === "\\" && i + 1 < content.length) {
			// Skip escaped character
			i += 2;
			continue;
		}
		if (char === quoteChar) {
			return i + 1;
		}
		i++;
	}

	return content.length;
}

/**
 * Find the boundaries of an entry in _meta.ts content.
 * Handles both simple string values and multi-line object values with brace tracking.
 *
 * @param content - The _meta.ts file content
 * @param slug - The entry key to find
 * @returns Object with start/end indices and the entry text, or null if not found
 * @internal Exported for testing
 */
export function findEntryBoundaries(
	content: string,
	slug: string,
): { start: number; end: number; entryText: string; valueStart: number } | null {
	// Build regex patterns to match the key (quoted or unquoted)
	const keyPatterns = [
		new RegExp(`(^|[{,\\s])${escapeRegex(slug)}\\s*:`, "m"),
		new RegExp(`(^|[{,\\s])"${escapeRegex(slug)}"\\s*:`, "m"),
		new RegExp(`(^|[{,\\s])'${escapeRegex(slug)}'\\s*:`, "m"),
	];

	let keyMatch: RegExpMatchArray | null = null;
	let keyStartIndex = -1;

	for (const pattern of keyPatterns) {
		const match = content.match(pattern);
		if (match && match.index !== undefined) {
			// Adjust for the leading character (if captured)
			/* v8 ignore next - match[1] is always defined by the capturing group (^|[{,\s]) */
			const leadingChar = match[1] || "";
			const adjustedIndex = match.index + leadingChar.length;
			if (keyStartIndex === -1 || adjustedIndex < keyStartIndex) {
				keyMatch = match;
				keyStartIndex = adjustedIndex;
			}
		}
	}

	if (!keyMatch || keyStartIndex === -1) {
		return null;
	}

	// Find the colon after the key
	const colonIndex = content.indexOf(":", keyStartIndex);
	/* v8 ignore start - defensive check: regex patterns include colon, so it must exist if key matched */
	if (colonIndex === -1) {
		return null;
	}
	/* v8 ignore stop */

	// Skip whitespace after colon to find value start
	let valueStart = colonIndex + 1;
	while (valueStart < content.length && /\s/.test(content[valueStart])) {
		valueStart++;
	}

	// Determine the value type and find its end
	const valueChar = content[valueStart];
	let valueEnd: number;

	if (valueChar === "{") {
		// Object value - track braces
		valueEnd = findMatchingBrace(content, valueStart);
	} else if (valueChar === '"' || valueChar === "'") {
		// String value - find closing quote
		valueEnd = findClosingQuote(content, valueStart, valueChar);
	} else {
		// Other value (number, identifier, etc.) - find next comma or closing brace
		valueEnd = valueStart;
		while (valueEnd < content.length && !/[,}\n]/.test(content[valueEnd])) {
			valueEnd++;
		}
		// Trim trailing whitespace
		while (valueEnd > valueStart && /\s/.test(content[valueEnd - 1])) {
			valueEnd--;
		}
	}

	// Check for trailing comma
	let entryEnd = valueEnd;
	let afterValue = entryEnd;
	while (afterValue < content.length && /\s/.test(content[afterValue])) {
		afterValue++;
	}
	if (content[afterValue] === ",") {
		entryEnd = afterValue + 1;
	}

	// Include preceding whitespace/newline for clean removal
	let entryStart = keyStartIndex;
	while (entryStart > 0 && /[\t ]/.test(content[entryStart - 1])) {
		entryStart--;
	}
	// Include preceding newline if present
	if (entryStart > 0 && content[entryStart - 1] === "\n") {
		entryStart--;
	}

	return {
		start: entryStart,
		end: entryEnd,
		entryText: content.slice(entryStart, entryEnd),
		valueStart,
	};
}

/**
 * Get the value of an entry in _meta.ts content.
 * Used to preserve display title when moving files.
 *
 * @param content - The _meta.ts file content
 * @param slug - The entry key to look up
 * @returns The entry value (string or stringified object), or null if not found
 */
export function getEntryValue(content: string, slug: string): string | null {
	const boundaries = findEntryBoundaries(content, slug);
	if (!boundaries) {
		return null;
	}

	// Extract just the value portion
	const valueStart = boundaries.valueStart;
	let valueEnd = boundaries.end;

	// Remove trailing comma if present
	while (valueEnd > valueStart && /[\s,]/.test(content[valueEnd - 1])) {
		valueEnd--;
	}

	return content.slice(valueStart, valueEnd);
}

/**
 * Remove an entry from _meta.ts content by its slug.
 * Handles multi-line object entries via brace tracking.
 *
 * @param content - The _meta.ts file content
 * @param slug - The entry key to remove
 * @returns The modified content with the entry removed
 */
export function removeMetaEntry(content: string, slug: string): string {
	const boundaries = findEntryBoundaries(content, slug);
	if (!boundaries) {
		return content;
	}

	// Remove the entry
	let newContent = content.slice(0, boundaries.start) + content.slice(boundaries.end);

	// Clean up double newlines that might result from removal
	newContent = newContent.replace(/\n\s*\n\s*\n/g, "\n\n");

	// Clean up trailing comma before closing brace
	newContent = newContent.replace(/,(\s*})/g, "$1");

	return newContent;
}

/**
 * Add a new entry to _meta.ts content before the closing brace.
 * Uses consistent formatting with existing entries.
 *
 * @param content - The _meta.ts file content
 * @param slug - The entry key to add
 * @param title - The display title for the entry
 * @returns The modified content with the entry added
 */
export function addMetaEntry(content: string, slug: string, title: string): string {
	// Find the last closing brace of the export default object
	const exportMatch = content.match(/export\s+default\s+\{/);
	if (!exportMatch) {
		return content;
	}

	// Find the matching closing brace
	const exportIndex = exportMatch.index;
	/* v8 ignore start - defensive check: match.index is always defined when match succeeds */
	if (exportIndex === undefined) {
		return content;
	}
	/* v8 ignore stop */
	const objectStart = exportIndex + exportMatch[0].length - 1;
	const closingBraceIndex = findMatchingBrace(content, objectStart) - 1;

	/* v8 ignore start - defensive check for malformed content that won't parse */
	if (closingBraceIndex < 0) {
		return content;
	}
	/* v8 ignore stop */

	// Detect indentation from existing content
	const indentMatch = content.match(/\n(\s+)\w/);
	const indent = indentMatch ? indentMatch[1] : "\t";

	// Check if the slug needs quoting (contains special characters)
	const needsQuotes = /[^a-zA-Z0-9_]/.test(slug);
	const quotedSlug = needsQuotes ? `"${slug}"` : slug;

	// Escape the title for use in a string
	const escapedTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

	// Build the new entry
	const newEntry = `${indent}${quotedSlug}: "${escapedTitle}",`;

	// Check if we need to add a comma to the previous entry
	const beforeBrace = content.slice(0, closingBraceIndex).trimEnd();
	const lastNonWhitespaceChar = beforeBrace[beforeBrace.length - 1];
	const needsComma = lastNonWhitespaceChar !== "," && lastNonWhitespaceChar !== "{";

	// Build the new content
	let newContent: string;
	if (needsComma) {
		// Add comma after last entry, then new entry
		newContent = `${beforeBrace},\n${newEntry}\n${content.slice(closingBraceIndex)}`;
	} else {
		// Just add the new entry
		newContent = `${beforeBrace}\n${newEntry}\n${content.slice(closingBraceIndex)}`;
	}

	return newContent;
}

/**
 * Rename an entry key in _meta.ts content while preserving its value.
 * Used when files are renamed in the tree.
 *
 * @param content - The _meta.ts file content
 * @param oldSlug - The current entry key
 * @param newSlug - The new entry key
 * @returns The modified content with the entry renamed
 */
export function renameMetaEntry(content: string, oldSlug: string, newSlug: string): string {
	const boundaries = findEntryBoundaries(content, oldSlug);
	if (!boundaries) {
		return content;
	}

	// Get the value to preserve
	const value = getEntryValue(content, oldSlug);
	/* v8 ignore start - defensive check: if boundaries exist, value should always be found */
	if (value === null) {
		return content;
	}
	/* v8 ignore stop */

	// Check if the new slug needs quoting
	const needsQuotes = /[^a-zA-Z0-9_]/.test(newSlug);
	const quotedNewSlug = needsQuotes ? `"${newSlug}"` : newSlug;

	// Build the new entry (key: value with potential trailing comma)
	const hasTrailingComma = content.slice(boundaries.start, boundaries.end).trimEnd().endsWith(",");
	const newEntry = `${quotedNewSlug}: ${value}${hasTrailingComma ? "," : ""}`;

	// Preserve leading whitespace from the original entry
	const entryText = content.slice(boundaries.start, boundaries.end);
	const leadingWhitespace = entryText.match(/^[\s]*/)?.[0] || "";

	// Build replacement
	const replacement = leadingWhitespace + newEntry;

	return content.slice(0, boundaries.start) + replacement + content.slice(boundaries.end);
}
