/**
 * Project Root Discovery
 *
 * Traverses up the directory tree from cwd (or a given start directory)
 * looking for a `.jolli` directory — similar to how git finds `.git`.
 * The directory containing `.jolli` is considered the project root.
 */

import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const JOLLI_DIR = ".jolli";

/**
 * Walks up from `startDir` (defaults to `process.cwd()`) looking for a
 * `.jolli` directory. Returns the absolute path of the directory that
 * contains it, or `null` if the filesystem root is reached without
 * finding one.
 */
export async function findProjectRoot(startDir?: string): Promise<string | null> {
	let current = resolve(startDir ?? process.cwd());

	while (true) {
		const candidate = join(current, JOLLI_DIR);
		try {
			const stats = await stat(candidate);
			if (stats.isDirectory()) {
				return current;
			}
		} catch {
			// Directory doesn't exist here — keep traversing
		}

		const parent = dirname(current);
		if (parent === current) {
			// Reached filesystem root
			return null;
		}
		current = parent;
	}
}

/**
 * Like `findProjectRoot`, but throws with a helpful message if no
 * `.jolli` directory is found. Use this in commands that require an
 * initialized project (e.g. `jolli sync`).
 */
export async function requireProjectRoot(startDir?: string): Promise<string> {
	const root = await findProjectRoot(startDir);
	if (!root) {
		throw new Error(
			"No .jolli directory found. Run `jolli init` in your project root first.",
		);
	}
	return root;
}
