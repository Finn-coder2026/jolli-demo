import { listAllFiles, readMarkdownFile } from "../sandbox/utils";
import type { RunState } from "../Types";

export type SaveIt = (filename: string, data: string) => Promise<void> | void;

export type ListAndSaveOptions = {
	/** Root directory to list (defaults to current directory in the target executor). */
	root?: string;
	/** Optional reporter to log progress and discovered files */
	report?: (message: string) => void;
};

/**
 * Factory for a zero-arg finalizer that:
 * - Lists all files under `root` (or current directory if omitted), preferring E2B sandbox when available
 * - Reads each file as UTF-8 markdown text
 * - Calls `saveIt(filename, data)` for each file
 *
 * This returns a no-arg function suitable for assigning to `agent.finalizer`.
 */
export function createListAndSaveFinalizer(
	runState: RunState,
	saveIt: SaveIt,
	opts?: ListAndSaveOptions,
): () => Promise<void> {
	const root = opts?.root;
	const report = opts?.report;
	return async () => {
		const files = await listAllFiles(runState, root);
		if (report) {
			report(`Finalizer scanning ${files.length} file(s) under ${root ?? "."}`);
			for (const f of files) {
				report(`→ ${f}`);
			}
		}
		for (const file of files) {
			try {
				const content = await readMarkdownFile(runState, file);
				await saveIt(file, content);
			} catch (e) {
				report?.(`! Failed to save ${file}: ${String(e)}`);
				// Ignore per-file errors to allow best-effort completion
			}
		}
	};
}
