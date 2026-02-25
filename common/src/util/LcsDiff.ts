export type DiffOpType = "equal" | "insert" | "delete";

export type DiffOp = {
	type: DiffOpType;
	line: string;
};

/**
 * Maximum product of line counts before falling back to a simple delete-all/insert-all diff.
 * This prevents O(m*n) memory allocation for very large files (e.g., 2000x2000 = ~32MB).
 */
const MAX_LCS_MATRIX_CELLS = 1_000_000;

export function computeDiffOps(baseLines: Array<string>, otherLines: Array<string>): Array<DiffOp> {
	const baseLen = baseLines.length;
	const otherLen = otherLines.length;

	// Guard against excessive memory for very large files
	if (baseLen * otherLen > MAX_LCS_MATRIX_CELLS) {
		const ops: Array<DiffOp> = [];
		for (const line of baseLines) {
			ops.push({ type: "delete", line });
		}
		for (const line of otherLines) {
			ops.push({ type: "insert", line });
		}
		return ops;
	}

	const lcs: Array<Array<number>> = Array.from({ length: baseLen + 1 }, () => new Array(otherLen + 1).fill(0));

	for (let i = baseLen - 1; i >= 0; i--) {
		for (let j = otherLen - 1; j >= 0; j--) {
			if (baseLines[i] === otherLines[j]) {
				lcs[i][j] = lcs[i + 1][j + 1] + 1;
			} else {
				lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
			}
		}
	}

	const ops: Array<DiffOp> = [];
	let i = 0;
	let j = 0;

	while (i < baseLen && j < otherLen) {
		if (baseLines[i] === otherLines[j]) {
			ops.push({ type: "equal", line: baseLines[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
			ops.push({ type: "delete", line: baseLines[i] });
			i++;
		} else {
			ops.push({ type: "insert", line: otherLines[j] });
			j++;
		}
	}

	while (i < baseLen) {
		ops.push({ type: "delete", line: baseLines[i] });
		i++;
	}

	while (j < otherLen) {
		ops.push({ type: "insert", line: otherLines[j] });
		j++;
	}

	return ops;
}

export function countLineChangesFromLines(
	oldLines: Array<string>,
	newLines: Array<string>,
): { additions: number; deletions: number } {
	const lcsLength = computeLcsLengthRolling(oldLines, newLines);
	return {
		additions: newLines.length - lcsLength,
		deletions: oldLines.length - lcsLength,
	};
}

function computeLcsLengthRolling(leftLines: Array<string>, rightLines: Array<string>): number {
	if (leftLines.length === 0 || rightLines.length === 0) {
		return 0;
	}

	// Keep the DP row width to the shorter side to cap memory at O(min(m, n)).
	const [longer, shorter] = leftLines.length >= rightLines.length ? [leftLines, rightLines] : [rightLines, leftLines];

	let previous = new Array(shorter.length + 1).fill(0);
	let current = new Array(shorter.length + 1).fill(0);

	for (let i = 1; i <= longer.length; i++) {
		current[0] = 0;
		for (let j = 1; j <= shorter.length; j++) {
			if (longer[i - 1] === shorter[j - 1]) {
				current[j] = previous[j - 1] + 1;
			} else {
				current[j] = Math.max(previous[j], current[j - 1]);
			}
		}
		[previous, current] = [current, previous];
	}

	/* v8 ignore next -- defensive fallback; previous[shorter.length] is always populated by the DP loop */
	return previous[shorter.length] ?? 0;
}
