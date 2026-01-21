/**
 * Main diff generator orchestrator.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DiffGeneratorOptions, DiffResult } from "./types.js";
import { loadContentGraph } from "./loaders/GraphLoader.js";
import { generateVersionDiff } from "./comparers/SectionComparer.js";

/**
 * Generate diff between two documentation versions.
 * @param options - Diff generator options
 * @returns Diff result
 */
export function generateDiff(options: DiffGeneratorOptions): DiffResult {
	const { source, fromVersion, toVersion, artifactsDir } = options;

	// Load content graphs
	const fromGraph = loadContentGraph(artifactsDir, source, fromVersion);
	const toGraph = loadContentGraph(artifactsDir, source, toVersion);

	// Generate diff
	const diff = generateVersionDiff(fromGraph, toGraph);

	// Create output directory
	const diffsDir = join(artifactsDir, source, "diffs");
	mkdirSync(diffsDir, { recursive: true });

	// Write output file
	const outputPath = join(diffsDir, `${fromVersion}__${toVersion}.json`);
	writeFileSync(outputPath, JSON.stringify(diff, null, 2), "utf-8");

	return {
		source,
		fromVersion,
		toVersion,
		addedCount: diff.summary.added_count,
		removedCount: diff.summary.removed_count,
		modifiedCount: diff.summary.modified_count,
		outputFile: outputPath,
	};
}
