/**
 * Main detector orchestrator.
 * Uses factory pattern to select and run appropriate detector based on options.
 */

import { runDetector } from "./detectors/DetectorFactory.js";
import type { ContractChangeOutput, DetectorOptions } from "./types.js";

/**
 * Detect contract changes based on detector type.
 * @param options - Detection options (detector type, base ref, output path, cwd, repo)
 * @returns Promise resolving to the complete contract change output
 */
export async function detectContractChanges(options: DetectorOptions): Promise<ContractChangeOutput> {
	return runDetector(options);
}
