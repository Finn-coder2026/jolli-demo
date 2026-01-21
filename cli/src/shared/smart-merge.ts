/**
 * Smart merge utility that shows only conflicting sections
 * instead of wrapping entire files in conflict markers.
 */
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

export const MergeHunkTypeSchema = z.enum(["common", "conflict"]);

export const MergeHunkSchema = z.object({
	type: MergeHunkTypeSchema,
	lines: z.array(z.string()),
	localLines: z.array(z.string()).optional(),
	serverLines: z.array(z.string()).optional(),
});

export const DiffOpTypeSchema = z.enum(["equal", "insert", "delete"]);

export const DiffOpSchema = z.object({
	type: DiffOpTypeSchema,
	line: z.string(),
});

export const EditSchema = z.object({
	start: z.number(),
	end: z.number(),
	lines: z.array(z.string()),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type MergeHunkType = z.infer<typeof MergeHunkTypeSchema>;
export type MergeHunk = z.infer<typeof MergeHunkSchema>;
export type DiffOpType = z.infer<typeof DiffOpTypeSchema>;
export type DiffOp = z.infer<typeof DiffOpSchema>;
export type Edit = z.infer<typeof EditSchema>;

/**
 * Computes hunks showing common regions and conflicts.
 * Uses simple prefix/suffix matching - good for typical edits.
 */
export function computeHunks(local: string, server: string): Array<MergeHunk> {
	const localLines = local.split("\n");
	const serverLines = server.split("\n");

	// Find common prefix (lines that match at start)
	let prefixEnd = 0;
	while (
		prefixEnd < localLines.length &&
		prefixEnd < serverLines.length &&
		localLines[prefixEnd] === serverLines[prefixEnd]
	) {
		prefixEnd++;
	}

	// Find common suffix (lines that match at end)
	let localSuffixStart = localLines.length;
	let serverSuffixStart = serverLines.length;
	while (
		localSuffixStart > prefixEnd &&
		serverSuffixStart > prefixEnd &&
		localLines[localSuffixStart - 1] === serverLines[serverSuffixStart - 1]
	) {
		localSuffixStart--;
		serverSuffixStart--;
	}

	const hunks: Array<MergeHunk> = [];

	// Common prefix
	if (prefixEnd > 0) {
		hunks.push({
			type: "common",
			lines: localLines.slice(0, prefixEnd),
		});
	}

	// Differing middle section
	const localDiff = localLines.slice(prefixEnd, localSuffixStart);
	const serverDiff = serverLines.slice(prefixEnd, serverSuffixStart);

	if (localDiff.length > 0 || serverDiff.length > 0) {
		hunks.push({
			type: "conflict",
			lines: [], // Not used for conflicts
			localLines: localDiff,
			serverLines: serverDiff,
		});
	}

	// Common suffix
	if (localSuffixStart < localLines.length) {
		hunks.push({
			type: "common",
			lines: localLines.slice(localSuffixStart),
		});
	}

	return hunks;
}

/**
 * Renders hunks into a string with git-style conflict markers
 * only around the differing sections.
 */
export function renderWithConflictMarkers(
	hunks: Array<MergeHunk>,
	localLabel = "LOCAL",
	serverLabel = "SERVER",
): string {
	const result: Array<string> = [];

	for (const hunk of hunks) {
		if (hunk.type === "common") {
			result.push(...hunk.lines);
		} else {
			result.push(`<<<<<<< ${localLabel}`);
			if (hunk.localLines && hunk.localLines.length > 0) {
				result.push(...hunk.localLines);
			}
			result.push("=======");
			if (hunk.serverLines && hunk.serverLines.length > 0) {
				result.push(...hunk.serverLines);
			}
			result.push(`>>>>>>> ${serverLabel}`);
		}
	}

	return result.join("\n");
}

/**
 * Smart merge: only wraps conflicting sections in markers.
 * If files are identical, returns the content as-is.
 */
export function smartMerge(
	localContent: string,
	serverContent: string,
	localLabel = "LOCAL",
	serverLabel = "SERVER",
): { merged: string; hasConflict: boolean } {
	if (localContent === serverContent) {
		return { merged: localContent, hasConflict: false };
	}

	const hunks = computeHunks(localContent, serverContent);
	const hasConflict = hunks.some(h => h.type === "conflict");

	if (!hasConflict) {
		return { merged: localContent, hasConflict: false };
	}

	const merged = renderWithConflictMarkers(hunks, localLabel, serverLabel);
	return { merged, hasConflict: true };
}

function computeDiffOps(baseLines: Array<string>, otherLines: Array<string>): Array<DiffOp> {
	const baseLen = baseLines.length;
	const otherLen = otherLines.length;
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

function computeEdits(baseLines: Array<string>, otherLines: Array<string>): Array<Edit> {
	const ops = computeDiffOps(baseLines, otherLines);
	const edits: Array<Edit> = [];
	let baseIndex = 0;
	let current: { start: number; lines: Array<string> } | null = null;

	for (const op of ops) {
		if (op.type === "equal") {
			if (current) {
				edits.push({ start: current.start, end: baseIndex, lines: current.lines });
				current = null;
			}
			baseIndex++;
			continue;
		}

		if (!current) {
			current = { start: baseIndex, lines: [] };
		}

		if (op.type === "delete") {
			baseIndex++;
		} else {
			current.lines.push(op.line);
		}
	}

	if (current) {
		edits.push({ start: current.start, end: baseIndex, lines: current.lines });
	}

	return edits;
}

function editsOverlap(a: Edit, b: Edit): boolean {
	const aInsert = a.start === a.end;
	const bInsert = b.start === b.end;

	if (aInsert && bInsert) {
		return a.start === b.start;
	}
	if (aInsert) {
		return a.start > b.start && a.start < b.end;
	}
	if (bInsert) {
		return b.start > a.start && b.start < a.end;
	}
	return a.start < b.end && b.start < a.end;
}

function editOverlapsRange(edit: Edit, rangeStart: number, rangeEnd: number): boolean {
	if (rangeStart === rangeEnd) {
		return edit.start === edit.end && edit.start === rangeStart;
	}
	if (edit.start === edit.end) {
		return edit.start > rangeStart && edit.start < rangeEnd;
	}
	return edit.start < rangeEnd && edit.end > rangeStart;
}

function renderFragment(baseLines: Array<string>, edits: Array<Edit>, start: number, end: number): Array<string> {
	const result: Array<string> = [];
	let cursor = start;

	for (const edit of edits) {
		if (edit.start > cursor) {
			result.push(...baseLines.slice(cursor, Math.min(edit.start, end)));
		}
		result.push(...edit.lines);
		cursor = Math.max(cursor, edit.end);
	}

	if (cursor < end) {
		result.push(...baseLines.slice(cursor, end));
	}

	return result;
}

function linesEqual(a: Array<string>, b: Array<string>): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

export function threeWayMerge(
	baseContent: string,
	localContent: string,
	serverContent: string,
	localLabel = "LOCAL",
	serverLabel = "SERVER",
): { merged: string; hasConflict: boolean } {
	if (localContent === serverContent) {
		return { merged: localContent, hasConflict: false };
	}
	if (baseContent === localContent) {
		return { merged: serverContent, hasConflict: false };
	}
	if (baseContent === serverContent) {
		return { merged: localContent, hasConflict: false };
	}

	const baseLines = baseContent.split("\n");
	const localLines = localContent.split("\n");
	const serverLines = serverContent.split("\n");

	const localEdits = computeEdits(baseLines, localLines);
	const serverEdits = computeEdits(baseLines, serverLines);

	const result: Array<string> = [];
	let idxLocal = 0;
	let idxServer = 0;
	let cursor = 0;
	let hasConflict = false;

	const pushConflict = (localLinesOut: Array<string>, serverLinesOut: Array<string>): void => {
		result.push(`<<<<<<< ${localLabel}`);
		if (localLinesOut.length > 0) {
			result.push(...localLinesOut);
		}
		result.push("=======");
		if (serverLinesOut.length > 0) {
			result.push(...serverLinesOut);
		}
		result.push(`>>>>>>> ${serverLabel}`);
		hasConflict = true;
	};

	while (idxLocal < localEdits.length || idxServer < serverEdits.length) {
		const nextLocal = localEdits[idxLocal];
		const nextServer = serverEdits[idxServer];
		const nextStart = Math.min(
			nextLocal ? nextLocal.start : baseLines.length,
			nextServer ? nextServer.start : baseLines.length,
		);

		if (cursor < nextStart) {
			result.push(...baseLines.slice(cursor, nextStart));
			cursor = nextStart;
			continue;
		}

		if (nextLocal && nextServer && editsOverlap(nextLocal, nextServer)) {
			const unionStart = Math.min(nextLocal.start, nextServer.start);
			let unionEnd = Math.max(nextLocal.end, nextServer.end);
			const localOverlap: Array<Edit> = [nextLocal];
			const serverOverlap: Array<Edit> = [nextServer];
			idxLocal++;
			idxServer++;

			let expanded = true;
			while (expanded) {
				expanded = false;
				while (idxLocal < localEdits.length && editOverlapsRange(localEdits[idxLocal], unionStart, unionEnd)) {
					localOverlap.push(localEdits[idxLocal]);
					unionEnd = Math.max(unionEnd, localEdits[idxLocal].end);
					idxLocal++;
					expanded = true;
				}
				while (
					idxServer < serverEdits.length &&
					editOverlapsRange(serverEdits[idxServer], unionStart, unionEnd)
				) {
					serverOverlap.push(serverEdits[idxServer]);
					unionEnd = Math.max(unionEnd, serverEdits[idxServer].end);
					idxServer++;
					expanded = true;
				}
			}

			const localFragment = renderFragment(baseLines, localOverlap, unionStart, unionEnd);
			const serverFragment = renderFragment(baseLines, serverOverlap, unionStart, unionEnd);
			if (linesEqual(localFragment, serverFragment)) {
				result.push(...localFragment);
			} else {
				pushConflict(localFragment, serverFragment);
			}
			cursor = unionEnd;
			continue;
		}

		const chooseLocal =
			nextLocal &&
			(!nextServer ||
				nextLocal.start < nextServer.start ||
				(nextLocal.start === nextServer.start && nextLocal.start === nextLocal.end));

		const edit = chooseLocal ? nextLocal : nextServer;
		if (!edit) {
			break;
		}

		if (edit.start > cursor) {
			result.push(...baseLines.slice(cursor, edit.start));
			cursor = edit.start;
		}

		result.push(...edit.lines);
		cursor = edit.end;
		if (chooseLocal) {
			idxLocal++;
		} else {
			idxServer++;
		}
	}

	if (cursor < baseLines.length) {
		result.push(...baseLines.slice(cursor));
	}

	return { merged: result.join("\n"), hasConflict };
}
