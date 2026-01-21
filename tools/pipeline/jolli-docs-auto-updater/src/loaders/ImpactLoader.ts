/**
 * Loads impact analysis results.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ImpactAnalysis } from "../types.js";

/**
 * Load impact analysis from artifacts directory.
 * @param source - Source identifier
 * @param artifactsDir - Path to artifacts directory
 * @returns Impact analysis data
 * @throws Error if file doesn't exist or is invalid
 */
export function loadImpactAnalysis(source: string, artifactsDir: string): ImpactAnalysis {
	const filePath = join(artifactsDir, source, "impacted_sections.json");

	if (!existsSync(filePath)) {
		throw new Error(
			`Impact analysis file not found: ${filePath}\nRun jolli-docs-impact-analyzer first.`,
		);
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		return JSON.parse(content) as ImpactAnalysis;
	} catch (error) {
		throw new Error(
			`Failed to parse impact analysis file: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
