/**
 * Diff operation types for incremental content updates
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
