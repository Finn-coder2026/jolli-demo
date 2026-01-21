/**
 * Environment variable contract detector.
 * Detects changes to environment variables in .env files and code references.
 */

import { analyzeCodeRefs } from "../CodeRefDetector.js";
import { analyzeEnvChanges } from "../EnvParser.js";
import { categorizeChangedFiles, getChangedFiles, getFileDiff } from "../GitDiff.js";
import type { ContractChangeOutput, DetectorOptions } from "../types.js";
import { buildOutput } from "./shared.js";

/**
 * Detect environment variable contract changes.
 * @param options - Detection options
 * @returns Promise resolving to the complete contract change output
 */
export async function detectEnvContracts(options: DetectorOptions): Promise<ContractChangeOutput> {
	const { base, cwd } = options;

	// Get all changed files
	const changedFiles = await getChangedFiles(base, cwd);

	// Categorize into env files and source files
	const { envFiles, sourceFiles } = categorizeChangedFiles(changedFiles);

	// Track changes
	const allAdded = new Set<string>();
	const allRemoved = new Set<string>();
	const allChanged = new Set<string>();

	// Process .env files
	for (const envFile of envFiles) {
		const diff = await getFileDiff(envFile, base, cwd);
		const { added, removed, changed } = analyzeEnvChanges(diff.addedLines, diff.removedLines);

		for (const v of added) allAdded.add(v);
		for (const v of removed) allRemoved.add(v);
		for (const v of changed) allChanged.add(v);
	}

	// Process source files for code references
	for (const sourceFile of sourceFiles) {
		const diff = await getFileDiff(sourceFile, base, cwd);
		const codeRefs = analyzeCodeRefs(diff.addedLines, diff.removedLines);

		// Code refs are considered "changed" (touched by PR)
		// unless already categorized as added/removed from .env files
		for (const ref of codeRefs) {
			if (!allAdded.has(ref) && !allRemoved.has(ref)) {
				allChanged.add(ref);
			}
		}
	}

	// Build the output
	return buildOutput("env", "config", allAdded, allRemoved, allChanged);
}
