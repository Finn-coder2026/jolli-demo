/**
 * Builds reverse index mapping contract refs to section IDs.
 */

import type {
	ContentGraph,
	LegacyReverseIndex,
	ReverseIndex,
	SectionCoverage,
} from "../types.js";

/**
 * Build a reverse index from a content graph.
 * Maps each contract reference to the section coverage entries.
 * @param graph - Content graph
 * @returns Reverse index with coverage type information
 */
export function buildReverseIndex(graph: ContentGraph): ReverseIndex {
	const index: ReverseIndex = {};

	for (const section of graph.sections) {
		for (const coverage of section.covers_with_type) {
			if (!index[coverage.contract_ref]) {
				index[coverage.contract_ref] = [];
			}
			index[coverage.contract_ref].push({
				section_id: section.section_id,
				coverage_type: coverage.coverage_type,
			});
		}
	}

	// Sort section coverage entries for consistent output
	for (const contractRef of Object.keys(index)) {
		index[contractRef].sort((a, b) => a.section_id.localeCompare(b.section_id));
	}

	return index;
}

/**
 * Build a legacy reverse index (section IDs only, no coverage types).
 * For backwards compatibility with existing tools.
 * @param graph - Content graph
 * @returns Legacy reverse index with just section IDs
 */
export function buildLegacyReverseIndex(graph: ContentGraph): LegacyReverseIndex {
	const index: LegacyReverseIndex = {};

	for (const section of graph.sections) {
		for (const contractRef of section.covers) {
			if (!index[contractRef]) {
				index[contractRef] = [];
			}
			index[contractRef].push(section.section_id);
		}
	}

	// Sort section IDs for consistent output
	for (const contractRef of Object.keys(index)) {
		index[contractRef].sort();
	}

	return index;
}

/**
 * Filter reverse index to only include direct coverage.
 * @param index - Full reverse index
 * @returns Filtered index with only direct coverage
 */
export function filterDirectCoverage(index: ReverseIndex): ReverseIndex {
	const filtered: ReverseIndex = {};

	for (const [contractRef, sections] of Object.entries(index)) {
		const directSections = sections.filter(s => s.coverage_type === "direct");
		if (directSections.length > 0) {
			filtered[contractRef] = directSections;
		}
	}

	return filtered;
}

/**
 * Convert a reverse index to legacy format (section IDs only).
 * @param index - Reverse index with coverage types
 * @returns Legacy format with just section IDs
 */
export function toLegacyFormat(index: ReverseIndex): LegacyReverseIndex {
	const legacy: LegacyReverseIndex = {};

	for (const [contractRef, sections] of Object.entries(index)) {
		legacy[contractRef] = sections.map(s => s.section_id);
	}

	return legacy;
}
