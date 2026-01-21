/**
 * Main impact analyzer orchestrator.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnalyzerOptions, AnalysisResult, ImpactAnalysis } from "./types.js";
import { loadChangedContractRefs } from "./loaders/ChangeLoader.js";
import { loadReverseIndex } from "./loaders/IndexLoader.js";
import {
	matchImpactedSections,
	countUniqueSections,
} from "./matchers/ImpactMatcher.js";

/**
 * Analyze which documentation sections are impacted by code changes.
 * @param options - Analyzer options
 * @returns Analysis result
 */
export function analyzeImpact(options: AnalyzerOptions): AnalysisResult {
	const { source, version, artifactsDir, directOnly } = options;

	// Load changed contract references
	const changes = loadChangedContractRefs(artifactsDir, source);

	// Load reverse index for the specified version
	const reverseIndex = loadReverseIndex(artifactsDir, source, version);

	// Match changes to impacted sections
	const impactedSections = matchImpactedSections(changes, reverseIndex, {
		directOnly,
	});

	// Build impact analysis output
	const analysis: ImpactAnalysis = {
		analyzed_at: new Date().toISOString(),
		base_version: version,
		source,
		impacted_sections: impactedSections,
		summary: {
			total_contracts_changed: changes.changed_contract_refs.length,
			total_sections_impacted: countUniqueSections(impactedSections),
		},
	};

	// Write output file
	const outputDir = join(artifactsDir, source);
	mkdirSync(outputDir, { recursive: true });

	const outputPath = join(outputDir, "impacted_sections.json");
	writeFileSync(outputPath, JSON.stringify(analysis, null, 2), "utf-8");

	return {
		source,
		version,
		contractsChanged: analysis.summary.total_contracts_changed,
		sectionsImpacted: analysis.summary.total_sections_impacted,
		outputFile: outputPath,
	};
}
