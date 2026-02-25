import { countLineChangesFromLines } from "./LcsDiff";

export function countLineChanges(oldContent: string, newContent: string): { additions: number; deletions: number } {
	const oldLines = oldContent.length > 0 ? oldContent.split("\n") : [];
	const newLines = newContent.length > 0 ? newContent.split("\n") : [];
	return countLineChangesFromLines(oldLines, newLines);
}
