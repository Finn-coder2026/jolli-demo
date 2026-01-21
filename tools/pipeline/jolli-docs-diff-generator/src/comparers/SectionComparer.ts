/**
 * Compares sections between two content graphs.
 */

import type {
	AddedSection,
	ContentGraph,
	ModifiedSection,
	RemovedSection,
	VersionDiff,
} from "../types.js";

/**
 * Generate a diff between two content graphs.
 * @param fromGraph - Source graph (old version)
 * @param toGraph - Target graph (new version)
 * @returns Version diff
 */
export function generateVersionDiff(
	fromGraph: ContentGraph,
	toGraph: ContentGraph,
): VersionDiff {
	// Build maps for fast lookup
	const fromSections = new Map(
		fromGraph.sections.map(s => [s.section_id, s]),
	);
	const toSections = new Map(toGraph.sections.map(s => [s.section_id, s]));

	const added: Array<AddedSection> = [];
	const removed: Array<RemovedSection> = [];
	const modified: Array<ModifiedSection> = [];
	let unchangedCount = 0;

	// Find added and modified sections
	for (const [sectionId, toSection] of toSections) {
		const fromSection = fromSections.get(sectionId);

		if (!fromSection) {
			// Section was added
			added.push({
				section_id: toSection.section_id,
				content_hash: toSection.content_hash,
				covers: toSection.covers,
			});
		} else if (fromSection.content_hash !== toSection.content_hash) {
			// Section was modified
			modified.push({
				section_id: sectionId,
				old_hash: fromSection.content_hash,
				new_hash: toSection.content_hash,
			});
		} else {
			// Section is unchanged
			unchangedCount++;
		}
	}

	// Find removed sections
	for (const [sectionId, fromSection] of fromSections) {
		if (!toSections.has(sectionId)) {
			removed.push({
				section_id: fromSection.section_id,
				content_hash: fromSection.content_hash,
			});
		}
	}

	return {
		from_version: fromGraph.version,
		to_version: toGraph.version,
		generated_at: new Date().toISOString(),
		added,
		removed,
		modified,
		summary: {
			added_count: added.length,
			removed_count: removed.length,
			modified_count: modified.length,
			unchanged_count: unchangedCount,
		},
	};
}
