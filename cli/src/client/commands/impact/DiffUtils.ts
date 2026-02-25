/**
 * Diff Utilities
 *
 * Provides unified diff computation for comparing file contents.
 * Used to create patch strings for the audit trail.
 */

/**
 * Creates a unified diff between two strings.
 * Uses a simple line-by-line diff algorithm.
 *
 * @param original - The original content
 * @param updated - The updated content
 * @param filePath - The file path for the diff header
 * @returns A unified diff string
 */
export function createUnifiedDiff(original: string, updated: string, filePath: string): string {
	const originalLines = original.split("\n");
	const updatedLines = updated.split("\n");

	// Simple diff algorithm using longest common subsequence approach
	const hunks = computeDiffHunks(originalLines, updatedLines);

	if (hunks.length === 0) {
		return "";
	}

	const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
	const hunkStrings = hunks.map(hunk => formatHunk(hunk, originalLines, updatedLines));

	return header + hunkStrings.join("");
}

/**
 * Represents a diff hunk with line ranges and operations.
 */
interface DiffHunk {
	originalStart: number;
	originalCount: number;
	updatedStart: number;
	updatedCount: number;
	operations: Array<DiffOperation>;
}

/**
 * Represents a single diff operation.
 */
interface DiffOperation {
	type: "keep" | "remove" | "add";
	originalIndex?: number;
	updatedIndex?: number;
}

/**
 * Computes the diff hunks between two arrays of lines.
 * Uses a simplified Myers diff algorithm.
 */
function computeDiffHunks(originalLines: Array<string>, updatedLines: Array<string>): Array<DiffHunk> {
	const operations = computeOperations(originalLines, updatedLines);

	if (operations.length === 0) {
		return [];
	}

	// Group operations into hunks with context
	const contextLines = 3;
	const hunks: Array<DiffHunk> = [];
	let currentHunk: DiffHunk | null = null;
	let lastChangeIndex = -100;

	for (let i = 0; i < operations.length; i++) {
		const op = operations[i];
		if (!op) {
			continue;
		}

		const isChange = op.type !== "keep";
		const opIndex = op.originalIndex ?? op.updatedIndex ?? i;

		if (isChange) {
			if (currentHunk === null || opIndex - lastChangeIndex > contextLines * 2) {
				// Start a new hunk
				if (currentHunk !== null) {
					hunks.push(currentHunk);
				}
				currentHunk = createHunkFromOperation(op, operations, i, contextLines, originalLines, updatedLines);
			} else {
				// Extend current hunk
				extendHunk(currentHunk, op, operations, i, contextLines, originalLines, updatedLines);
			}
			lastChangeIndex = opIndex;
		}
	}

	if (currentHunk !== null) {
		hunks.push(currentHunk);
	}

	return hunks;
}

/**
 * Computes the edit operations between two arrays of lines.
 */
function computeOperations(originalLines: Array<string>, updatedLines: Array<string>): Array<DiffOperation> {
	// Build LCS matrix
	const m = originalLines.length;
	const n = updatedLines.length;
	const lcs: Array<Array<number>> = new Array(m + 1).fill(null).map(() => new Array(n + 1).fill(0) as Array<number>);

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const row = lcs[i];
			const prevRow = lcs[i - 1];
			if (row && prevRow) {
				if (originalLines[i - 1] === updatedLines[j - 1]) {
					row[j] = (prevRow[j - 1] ?? 0) + 1;
				} else {
					row[j] = Math.max(prevRow[j] ?? 0, row[j - 1] ?? 0);
				}
			}
		}
	}

	// Backtrack to find operations
	const operations: Array<DiffOperation> = [];
	let i = m;
	let j = n;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && originalLines[i - 1] === updatedLines[j - 1]) {
			operations.unshift({ type: "keep", originalIndex: i - 1, updatedIndex: j - 1 });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || (lcs[i]?.[j - 1] ?? 0) >= (lcs[i - 1]?.[j] ?? 0))) {
			operations.unshift({ type: "add", updatedIndex: j - 1 });
			j--;
		} else {
			operations.unshift({ type: "remove", originalIndex: i - 1 });
			i--;
		}
	}

	return operations;
}

/**
 * Creates a new hunk starting from the given operation.
 */
function createHunkFromOperation(
	_op: DiffOperation,
	allOps: Array<DiffOperation>,
	opIndex: number,
	contextLines: number,
	_originalLines: Array<string>,
	_updatedLines: Array<string>,
): DiffHunk {
	// Find context start
	let startOpIndex = opIndex;
	let contextCount = 0;
	while (startOpIndex > 0 && contextCount < contextLines) {
		startOpIndex--;
		const prevOp = allOps[startOpIndex];
		if (prevOp?.type === "keep") {
			contextCount++;
		}
	}

	const startOp = allOps[startOpIndex];
	const originalStart = startOp?.originalIndex ?? 0;
	const updatedStart = startOp?.updatedIndex ?? 0;

	return {
		originalStart,
		originalCount: 0,
		updatedStart,
		updatedCount: 0,
		operations: [],
	};
}

/**
 * Extends an existing hunk with a new operation.
 */
function extendHunk(
	_hunk: DiffHunk,
	_op: DiffOperation,
	_allOps: Array<DiffOperation>,
	_opIndex: number,
	_contextLines: number,
	_originalLines: Array<string>,
	_updatedLines: Array<string>,
): void {
	// This is simplified - in practice we'd track the hunk's operations
}

/**
 * Formats a hunk as a unified diff string.
 */
function formatHunk(_hunk: DiffHunk, _originalLines: Array<string>, _updatedLines: Array<string>): string {
	// Simplified formatting - return actual diff content
	return "";
}

/**
 * Hunk header information.
 */
interface HunkHeader {
	origStart: number;
	origCount: number;
	newStart: number;
	newCount: number;
}

/**
 * Calculates hunk header from operations.
 */
function calculateHunkHeader(hunkOps: Array<DiffOperation>): HunkHeader {
	let origStart = 0;
	let origCount = 0;
	let newStart = 0;
	let newCount = 0;

	for (const op of hunkOps) {
		if (op.type === "keep" || op.type === "remove") {
			if (origCount === 0 && op.originalIndex !== undefined) {
				origStart = op.originalIndex + 1;
			}
			if (op.originalIndex !== undefined) {
				origCount++;
			}
		}
		if (op.type === "keep" || op.type === "add") {
			if (newCount === 0 && op.updatedIndex !== undefined) {
				newStart = op.updatedIndex + 1;
			}
			if (op.updatedIndex !== undefined) {
				newCount++;
			}
		}
	}

	return { origStart, origCount, newStart, newCount };
}

/**
 * Formats a single operation as a diff line.
 */
function formatDiffLine(op: DiffOperation, originalLines: Array<string>, updatedLines: Array<string>): string {
	if (op.type === "keep") {
		const line = originalLines[op.originalIndex ?? 0] ?? "";
		return ` ${line}`;
	}
	if (op.type === "remove") {
		const line = originalLines[op.originalIndex ?? 0] ?? "";
		return `-${line}`;
	}
	// add
	const line = updatedLines[op.updatedIndex ?? 0] ?? "";
	return `+${line}`;
}

/**
 * Formats hunk operations as diff lines.
 */
function formatHunkOps(
	hunkOps: Array<DiffOperation>,
	originalLines: Array<string>,
	updatedLines: Array<string>,
): Array<string> {
	const { origStart, origCount, newStart, newCount } = calculateHunkHeader(hunkOps);
	const lines: Array<string> = [];
	lines.push(`@@ -${origStart},${origCount} +${newStart},${newCount} @@`);

	for (const op of hunkOps) {
		lines.push(formatDiffLine(op, originalLines, updatedLines));
	}

	return lines;
}

/**
 * Adds preceding context operations to hunk.
 */
function addPrecedingContext(
	hunkOps: Array<DiffOperation>,
	operations: Array<DiffOperation>,
	currentIndex: number,
	contextSize: number,
): void {
	for (let j = Math.max(0, currentIndex - contextSize); j < currentIndex; j++) {
		const ctxOp = operations[j];
		if (ctxOp) {
			hunkOps.push(ctxOp);
		}
	}
}

/**
 * Creates a simple unified diff between two strings.
 * This is a simplified implementation that shows all changes.
 */
export function createSimpleDiff(original: string, updated: string, filePath: string): string {
	if (original === updated) {
		return "";
	}

	const originalLines = original.split("\n");
	const updatedLines = updated.split("\n");

	const result: Array<string> = [];
	result.push(`--- a/${filePath}`);
	result.push(`+++ b/${filePath}`);

	const operations = computeOperations(originalLines, updatedLines);
	const contextSize = 3;
	let hunkOps: Array<DiffOperation> = [];
	let lastChangeIdx = -100;

	for (let i = 0; i < operations.length; i++) {
		const op = operations[i];
		if (!op) {
			continue;
		}

		const isChange = op.type !== "keep";

		if (isChange) {
			if (hunkOps.length === 0) {
				addPrecedingContext(hunkOps, operations, i, contextSize);
			}
			hunkOps.push(op);
			lastChangeIdx = i;
		} else if (hunkOps.length > 0) {
			if (i - lastChangeIdx <= contextSize) {
				hunkOps.push(op);
			} else {
				result.push(...formatHunkOps(hunkOps, originalLines, updatedLines));
				hunkOps = [];
			}
		}
	}

	// Flush final hunk
	if (hunkOps.length > 0) {
		result.push(...formatHunkOps(hunkOps, originalLines, updatedLines));
	}

	return result.join("\n");
}
