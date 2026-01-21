/**
 * Shared utilities for detectors.
 */

import type { ChangeSummary, ContractChangeOutput, ContractRef, ContractType } from "../types.js";

/**
 * Build the final output structure.
 * @param source - Source type ("env" or "openapi")
 * @param contractType - Contract type for refs ("config" or "openapi")
 * @param added - Set of added contracts
 * @param removed - Set of removed contracts
 * @param changed - Set of changed contracts
 * @returns Formatted contract change output
 */
export function buildOutput(
	source: "env" | "openapi",
	contractType: ContractType,
	added: Set<string>,
	removed: Set<string>,
	changed: Set<string>,
): ContractChangeOutput {
	// Combine all unique keys
	const allKeys = new Set<string>();
	for (const k of added) allKeys.add(k);
	for (const k of removed) allKeys.add(k);
	for (const k of changed) allKeys.add(k);

	// Sort keys alphabetically
	const sortedKeys = Array.from(allKeys).sort();

	// Build contract refs
	const contractRefs: Array<ContractRef> = sortedKeys.map(key => ({
		type: contractType,
		key,
	}));

	// Build summary with sorted arrays
	const summary: ChangeSummary = {
		added: Array.from(added).sort(),
		removed: Array.from(removed).sort(),
		changed: Array.from(changed).sort(),
	};

	return {
		source,
		changed_contract_refs: contractRefs,
		summary,
	};
}
