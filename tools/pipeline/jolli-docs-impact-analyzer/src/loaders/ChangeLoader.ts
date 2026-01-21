/**
 * Loads changed contract references from file.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedContractRefs } from "../types.js";

/**
 * Load changed contract references from artifacts directory.
 * @param artifactsDir - Path to artifacts directory
 * @param source - Source identifier
 * @returns Changed contract references
 */
export function loadChangedContractRefs(
	artifactsDir: string,
	source: string,
): ChangedContractRefs {
	const changesPath = join(artifactsDir, source, "changed_contract_refs.json");

	if (!existsSync(changesPath)) {
		throw new Error(
			`Changed contract refs file not found: ${changesPath}`,
		);
	}

	const content = readFileSync(changesPath, "utf-8");
	return JSON.parse(content) as ChangedContractRefs;
}
