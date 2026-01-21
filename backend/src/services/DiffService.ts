/**
 * Diff operation types for incremental updates
 */
export type DiffOperation = "insert" | "delete" | "replace";

/**
 * A single diff operation to apply to content
 */
export interface ContentDiff {
	/**
	 * The type of operation
	 */
	operation: DiffOperation;
	/**
	 * Starting position in the content (character index)
	 */
	position: number;
	/**
	 * Length of content to delete/replace
	 */
	length?: number;
	/**
	 * Text to insert/replace with
	 */
	text?: string;
}

/**
 * Result of generating diffs between two content strings
 */
export interface DiffResult {
	/**
	 * Array of diff operations to transform oldContent into newContent
	 */
	diffs: Array<ContentDiff>;
	/**
	 * The original content
	 */
	oldContent: string;
	/**
	 * The new content
	 */
	newContent: string;
}

/**
 * Service for generating incremental diffs between content versions
 */
export class DiffService {
	/**
	 * Generates a minimal set of diff operations to transform oldContent into newContent.
	 * Uses a simple character-by-character comparison for now.
	 * Can be optimized with more sophisticated algorithms (e.g., Myers diff) if needed.
	 *
	 * @param oldContent the original content
	 * @param newContent the updated content
	 * @returns diff operations to transform old into new
	 */
	generateDiff(oldContent: string, newContent: string): DiffResult {
		const diffs: Array<ContentDiff> = [];

		// If contents are identical, return empty diffs
		if (oldContent === newContent) {
			return { diffs, oldContent, newContent };
		}

		// If old content is empty, entire new content is an insert
		if (oldContent.length === 0) {
			diffs.push({
				operation: "insert",
				position: 0,
				text: newContent,
			});
			return { diffs, oldContent, newContent };
		}

		// If new content is empty, delete entire old content
		if (newContent.length === 0) {
			diffs.push({
				operation: "delete",
				position: 0,
				length: oldContent.length,
			});
			return { diffs, oldContent, newContent };
		}

		// Find common prefix
		let commonPrefixLength = 0;
		const minLength = Math.min(oldContent.length, newContent.length);

		while (commonPrefixLength < minLength && oldContent[commonPrefixLength] === newContent[commonPrefixLength]) {
			commonPrefixLength++;
		}

		// Find common suffix (excluding the common prefix)
		let commonSuffixLength = 0;
		while (
			commonSuffixLength < minLength - commonPrefixLength &&
			oldContent[oldContent.length - 1 - commonSuffixLength] ===
				newContent[newContent.length - 1 - commonSuffixLength]
		) {
			commonSuffixLength++;
		}

		// Calculate the parts that differ
		const oldMiddleStart = commonPrefixLength;
		const oldMiddleEnd = oldContent.length - commonSuffixLength;
		const newMiddleStart = commonPrefixLength;
		const newMiddleEnd = newContent.length - commonSuffixLength;

		const oldMiddle = oldContent.substring(oldMiddleStart, oldMiddleEnd);
		const newMiddle = newContent.substring(newMiddleStart, newMiddleEnd);

		// Generate appropriate diff operation
		if (oldMiddle.length === 0 && newMiddle.length > 0) {
			// Pure insertion
			diffs.push({
				operation: "insert",
				position: commonPrefixLength,
				text: newMiddle,
			});
		} else if (oldMiddle.length > 0 && newMiddle.length === 0) {
			// Pure deletion
			diffs.push({
				operation: "delete",
				position: commonPrefixLength,
				length: oldMiddle.length,
			});
		} else if (oldMiddle.length > 0 && newMiddle.length > 0) {
			// Replacement
			diffs.push({
				operation: "replace",
				position: commonPrefixLength,
				length: oldMiddle.length,
				text: newMiddle,
			});
		}

		return { diffs, oldContent, newContent };
	}

	/**
	 * Applies a series of diff operations to content.
	 *
	 * @param content the original content
	 * @param diffs the diff operations to apply
	 * @returns the resulting content after applying diffs
	 */
	applyDiff(content: string, diffs: Array<ContentDiff>): string {
		let result = content;

		// Apply diffs in reverse order to maintain correct positions
		for (const diff of [...diffs].reverse()) {
			const { operation, position, length, text } = diff;

			switch (operation) {
				case "insert":
					/* v8 ignore next - defensive: text should always be present for insert */
					result = result.substring(0, position) + (text || "") + result.substring(position);
					break;
				case "delete":
					/* v8 ignore next - defensive: length should always be present for delete */
					result = result.substring(0, position) + result.substring(position + (length || 0));
					break;
				case "replace":
					/* v8 ignore next - defensive: text and length should always be present for replace */
					result = result.substring(0, position) + (text || "") + result.substring(position + (length || 0));
					break;
			}
		}

		return result;
	}

	/**
	 * Validates that applying diffs to oldContent produces newContent.
	 *
	 * @param oldContent the original content
	 * @param newContent the expected result
	 * @param diffs the diff operations
	 * @returns true if diffs correctly transform old to new
	 */
	validateDiff(oldContent: string, newContent: string, diffs: Array<ContentDiff>): boolean {
		const result = this.applyDiff(oldContent, diffs);
		return result === newContent;
	}
}
