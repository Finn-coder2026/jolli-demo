/**
 * Loads reverse index from file.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReverseIndex } from "../types.js";

/**
 * Load reverse index from artifacts directory.
 * @param artifactsDir - Path to artifacts directory
 * @param source - Source identifier
 * @param version - Version identifier
 * @returns Reverse index mapping contract refs to section IDs
 */
export function loadReverseIndex(
	artifactsDir: string,
	source: string,
	version: string,
): ReverseIndex {
	const indexPath = join(
		artifactsDir,
		source,
		version,
		"reverse_index.json",
	);

	if (!existsSync(indexPath)) {
		throw new Error(`Reverse index file not found: ${indexPath}`);
	}

	const content = readFileSync(indexPath, "utf-8");
	return JSON.parse(content) as ReverseIndex;
}
