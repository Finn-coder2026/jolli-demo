/**
 * Smart merge utility that shows only conflicting sections
 * instead of wrapping entire files in conflict markers.
 *
 * For 3-way merge, use `threeWayMerge` from `jolli-common`.
 * It is re-exported from this module for backwards compatibility.
 */
import { z } from "zod";

export { threeWayMerge } from "jolli-common";

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
 * 2-way merge: compares local vs. server content using a prefix/suffix scan.
 * Use this when no common base version is available (e.g., first sync).
 * For 3-way merge (local + server + known base), use `threeWayMerge` instead.
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
