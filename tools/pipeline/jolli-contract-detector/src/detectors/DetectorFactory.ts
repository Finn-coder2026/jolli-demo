/**
 * Factory for creating contract detectors.
 */

import type { ContractChangeOutput, DetectorOptions } from "../types.js";
import { detectEnvContracts } from "./EnvDetector.js";
import { detectOpenApiContracts } from "./OpenApiDetector.js";

/** Detector function type */
export type DetectorFunction = (options: DetectorOptions) => Promise<ContractChangeOutput>;

/**
 * Get the appropriate detector function based on options.
 * @param options - Detector options
 * @returns Detector function
 */
export function getDetector(options: DetectorOptions): DetectorFunction {
	switch (options.detector) {
		case "env":
			return detectEnvContracts;
		case "openapi":
			return detectOpenApiContracts;
		default:
			throw new Error(`Unknown detector type: ${options.detector}`);
	}
}

/**
 * Create and run a detector based on options.
 * @param options - Detector options
 * @returns Promise resolving to detection results
 */
export async function runDetector(options: DetectorOptions): Promise<ContractChangeOutput> {
	const detector = getDetector(options);
	return detector(options);
}
