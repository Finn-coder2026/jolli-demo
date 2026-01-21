/**
 * Utility functions for generating unified diff format strings.
 */

/**
 * Represents a line in the diff with its type and content.
 */
interface DiffLine {
	type: "unchanged" | "added" | "removed";
	content: string;
}

/**
 * Represents a hunk in the diff with its range and lines.
 */
interface DiffHunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: Array<DiffLine>;
}

/**
 * Simple LCS-based diff algorithm to find the longest common subsequence.
 * Returns the indices of the LCS elements in the old and new arrays.
 */
function computeLCS(oldLines: Array<string>, newLines: Array<string>): Array<[number, number]> {
	const m = oldLines.length;
	const n = newLines.length;

	// Build LCS length table
	const dp: Array<Array<number>> = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	// Backtrack to find the LCS pairs
	const lcs: Array<[number, number]> = [];
	let i = m;
	let j = n;

	while (i > 0 && j > 0) {
		if (oldLines[i - 1] === newLines[j - 1]) {
			lcs.unshift([i - 1, j - 1]);
			i--;
			j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	return lcs;
}

/**
 * Generates diff lines from old and new content using LCS algorithm.
 */
function generateDiffLines(oldLines: Array<string>, newLines: Array<string>): Array<DiffLine> {
	const lcs = computeLCS(oldLines, newLines);
	const result: Array<DiffLine> = [];

	let oldIdx = 0;
	let newIdx = 0;

	for (const [oldLcsIdx, newLcsIdx] of lcs) {
		// Add removed lines (in old but not in LCS up to this point)
		while (oldIdx < oldLcsIdx) {
			result.push({ type: "removed", content: oldLines[oldIdx] });
			oldIdx++;
		}

		// Add added lines (in new but not in LCS up to this point)
		while (newIdx < newLcsIdx) {
			result.push({ type: "added", content: newLines[newIdx] });
			newIdx++;
		}

		// Add unchanged line
		result.push({ type: "unchanged", content: oldLines[oldIdx] });
		oldIdx++;
		newIdx++;
	}

	// Add remaining removed lines
	while (oldIdx < oldLines.length) {
		result.push({ type: "removed", content: oldLines[oldIdx] });
		oldIdx++;
	}

	// Add remaining added lines
	while (newIdx < newLines.length) {
		result.push({ type: "added", content: newLines[newIdx] });
		newIdx++;
	}

	return result;
}

/**
 * Groups diff lines into hunks with context.
 * @param diffLines All diff lines
 * @param contextLines Number of context lines around changes (default: 3)
 */
function groupIntoHunks(diffLines: Array<DiffLine>, contextLines = 3): Array<DiffHunk> {
	const hunks: Array<DiffHunk> = [];

	// Find ranges with changes
	const changeRanges: Array<{ start: number; end: number }> = [];
	let currentRange: { start: number; end: number } | null = null;

	for (let i = 0; i < diffLines.length; i++) {
		if (diffLines[i].type !== "unchanged") {
			if (currentRange === null) {
				currentRange = { start: i, end: i };
			} else if (i - currentRange.end <= contextLines * 2) {
				// Merge with previous range if close enough
				currentRange.end = i;
			} else {
				changeRanges.push(currentRange);
				currentRange = { start: i, end: i };
			}
		}
	}

	if (currentRange !== null) {
		changeRanges.push(currentRange);
	}

	// If no changes, return empty hunks
	/* v8 ignore next 3 - defensive check: if oldContent !== newContent, there will always be changes */
	if (changeRanges.length === 0) {
		return [];
	}

	// Build hunks with context
	for (const range of changeRanges) {
		const start = Math.max(0, range.start - contextLines);
		const end = Math.min(diffLines.length - 1, range.end + contextLines);

		const hunkLines = diffLines.slice(start, end + 1);

		// Calculate line numbers
		let oldStart = 1;
		let newStart = 1;

		for (let i = 0; i < start; i++) {
			if (diffLines[i].type !== "added") {
				oldStart++;
			}
			if (diffLines[i].type !== "removed") {
				newStart++;
			}
		}

		let oldCount = 0;
		let newCount = 0;

		for (const line of hunkLines) {
			if (line.type !== "added") {
				oldCount++;
			}
			if (line.type !== "removed") {
				newCount++;
			}
		}

		hunks.push({
			oldStart,
			oldCount,
			newStart,
			newCount,
			lines: hunkLines,
		});
	}

	return hunks;
}

/**
 * Generates a unified diff string from two content strings.
 *
 * @param oldContent The original content
 * @param newContent The new content
 * @param oldFileName The name for the old file (default: "a")
 * @param newFileName The name for the new file (default: "b")
 * @returns A unified diff format string suitable for diff2html
 */
export function createUnifiedDiff(
	oldContent: string,
	newContent: string,
	oldFileName = "a",
	newFileName = "b",
): string {
	// Handle empty content edge cases
	if (oldContent === newContent) {
		return "";
	}

	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");

	const diffLines = generateDiffLines(oldLines, newLines);
	const hunks = groupIntoHunks(diffLines);

	/* v8 ignore next 3 - defensive check: already returned early if contents are identical */
	if (hunks.length === 0) {
		return "";
	}

	// Build unified diff string
	const lines: Array<string> = [];
	lines.push(`--- ${oldFileName}`);
	lines.push(`+++ ${newFileName}`);

	for (const hunk of hunks) {
		// Add hunk header
		lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);

		// Add hunk lines
		for (const line of hunk.lines) {
			switch (line.type) {
				case "unchanged":
					lines.push(` ${line.content}`);
					break;
				case "added":
					lines.push(`+${line.content}`);
					break;
				case "removed":
					lines.push(`-${line.content}`);
					break;
			}
		}
	}

	return lines.join("\n");
}
