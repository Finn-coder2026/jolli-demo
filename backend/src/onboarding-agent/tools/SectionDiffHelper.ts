/**
 * SectionDiffHelper - Helper for generating section-by-section changes when importing updated content.
 *
 * When a markdown file is re-imported and content has changed, this helper generates
 * section changes that can be reviewed by the user in the draft UI.
 */

import { parseSections, sectionToMarkdown } from "../../../../tools/jolliagent/src/jolliscript/parser";
import type { Section } from "../../../../tools/jolliagent/src/jolliscript/types";
import type { DocDraftSectionChangesDao } from "../../dao/DocDraftSectionChangesDao";
import type { DocDraftSectionChangeType } from "jolli-common";

/**
 * Result of creating section changes from an import.
 */
export interface SectionDiffResult {
	/** Whether any changes were detected */
	hasChanges: boolean;
	/** Total number of changes */
	changeCount: number;
	/** Summary of changes (e.g., "2 sections updated, 1 added, 0 deleted") */
	summary: string;
	/** Counts by change type */
	counts: {
		updated: number;
		inserted: number;
		deleted: number;
	};
}

/**
 * Matched section pair for diffing.
 */
interface SectionMatch {
	oldIndex: number;
	newIndex: number;
	oldSection: Section;
	newSection: Section;
}

/**
 * Normalizes content for comparison by trimming whitespace and normalizing line endings.
 */
function normalizeContent(content: string): string {
	return content.trim().replace(/\r\n/g, "\n").replace(/\s+$/gm, "");
}

/**
 * Check if two sections have the same content (after normalization).
 */
function sectionsMatch(oldSection: Section, newSection: Section): boolean {
	const oldContent = normalizeContent(sectionToMarkdown(oldSection));
	const newContent = normalizeContent(sectionToMarkdown(newSection));
	return oldContent === newContent;
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for fuzzy title matching.
 */
function levenshteinDistance(a: string, b: string): number {
	const matrix: Array<Array<number>> = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1, // deletion
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

/**
 * Match sections between old and new content.
 * Uses exact title match first, then fuzzy matching for remaining sections.
 */
function matchSections(
	oldSections: Array<Section>,
	newSections: Array<Section>,
): {
	matches: Array<SectionMatch>;
	unmatchedOld: Array<{ index: number; section: Section }>;
	unmatchedNew: Array<{ index: number; section: Section }>;
} {
	const matches: Array<SectionMatch> = [];
	const matchedOldIndices = new Set<number>();
	const matchedNewIndices = new Set<number>();

	// Pass 1: Exact title matches
	for (let newIdx = 0; newIdx < newSections.length; newIdx++) {
		const newSection = newSections[newIdx];
		for (let oldIdx = 0; oldIdx < oldSections.length; oldIdx++) {
			if (matchedOldIndices.has(oldIdx)) {
				continue;
			}
			const oldSection = oldSections[oldIdx];

			// Exact title match (including both null for preamble)
			if (newSection.title === oldSection.title) {
				matches.push({
					oldIndex: oldIdx,
					newIndex: newIdx,
					oldSection,
					newSection,
				});
				matchedOldIndices.add(oldIdx);
				matchedNewIndices.add(newIdx);
				break;
			}
		}
	}

	// Pass 2: Fuzzy title matches (Levenshtein distance < 3) for remaining sections
	for (let newIdx = 0; newIdx < newSections.length; newIdx++) {
		if (matchedNewIndices.has(newIdx)) {
			continue;
		}
		const newSection = newSections[newIdx];
		if (!newSection.title) {
			continue; // Skip preamble for fuzzy matching
		}

		let bestMatch: { oldIdx: number; distance: number } | null = null;

		for (let oldIdx = 0; oldIdx < oldSections.length; oldIdx++) {
			if (matchedOldIndices.has(oldIdx)) {
				continue;
			}
			const oldSection = oldSections[oldIdx];
			if (!oldSection.title) {
				continue;
			}

			const distance = levenshteinDistance(newSection.title.toLowerCase(), oldSection.title.toLowerCase());

			if (distance < 3 && (!bestMatch || distance < bestMatch.distance)) {
				bestMatch = { oldIdx, distance };
			}
		}

		if (bestMatch) {
			matches.push({
				oldIndex: bestMatch.oldIdx,
				newIndex: newIdx,
				oldSection: oldSections[bestMatch.oldIdx],
				newSection,
			});
			matchedOldIndices.add(bestMatch.oldIdx);
			matchedNewIndices.add(newIdx);
		}
	}

	// Collect unmatched sections
	const unmatchedOld = oldSections
		.map((section, index) => ({ index, section }))
		.filter(({ index }) => !matchedOldIndices.has(index));

	const unmatchedNew = newSections
		.map((section, index) => ({ index, section }))
		.filter(({ index }) => !matchedNewIndices.has(index));

	return { matches, unmatchedOld, unmatchedNew };
}

/**
 * Creates section-by-section changes from imported content update.
 *
 * @param draftId - The draft ID to create changes for
 * @param docId - The document ID being edited
 * @param oldContent - The existing article content
 * @param newContent - The new content from GitHub
 * @param sectionChangesDao - DAO for creating section changes
 * @returns Summary of changes created
 */
export async function createSectionChangesFromImport(
	draftId: number,
	docId: number,
	oldContent: string,
	newContent: string,
	sectionChangesDao: DocDraftSectionChangesDao,
): Promise<SectionDiffResult> {
	// Parse both contents into sections
	const oldSections = parseSections(oldContent);
	const newSections = parseSections(newContent);

	// Match sections between old and new
	const { matches, unmatchedOld, unmatchedNew } = matchSections(oldSections, newSections);

	const counts = { updated: 0, inserted: 0, deleted: 0 };

	// Create update changes for matched sections with different content
	for (const match of matches) {
		if (!sectionsMatch(match.oldSection, match.newSection)) {
			const newMarkdown = sectionToMarkdown(match.newSection);
			await sectionChangesDao.createDocDraftSectionChanges({
				draftId,
				docId,
				changeType: "update" as DocDraftSectionChangeType,
				path: `/sections/${match.oldIndex}`,
				content: sectionToMarkdown(match.oldSection),
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: `Updated content from GitHub import`,
						value: newMarkdown,
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
			});
			counts.updated++;
		}
	}

	// Create insert-after changes for new sections
	for (const { index, section } of unmatchedNew) {
		// Find the reference section (previous section in new content)
		const refIndex = index > 0 ? index - 1 : 0;
		// Find corresponding old section index for the reference
		const refMatch = matches.find(m => m.newIndex === refIndex);
		const insertAfterIndex = refMatch ? refMatch.oldIndex : 0;

		const newMarkdown = sectionToMarkdown(section);
		await sectionChangesDao.createDocDraftSectionChanges({
			draftId,
			docId,
			changeType: "insert-after" as DocDraftSectionChangeType,
			path: `/sections/${insertAfterIndex}`,
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: `New section "${section.title ?? "preamble"}" from GitHub import`,
					value: newMarkdown,
					appliedAt: undefined,
				},
			],
			comments: [],
			applied: false,
			dismissed: false,
		});
		counts.inserted++;
	}

	// Create delete changes for removed sections
	for (const { index, section } of unmatchedOld) {
		// Skip front matter deletions - they're usually intentional structure differences
		if (section.isFrontMatter) {
			continue;
		}

		// Skip empty preamble sections (whitespace between front matter and first heading)
		if (!section.title && !section.content.trim()) {
			continue;
		}

		await sectionChangesDao.createDocDraftSectionChanges({
			draftId,
			docId,
			changeType: "delete" as DocDraftSectionChangeType,
			path: `/sections/${index}`,
			content: sectionToMarkdown(section),
			proposed: [],
			comments: [],
			applied: false,
			dismissed: false,
		});
		counts.deleted++;
	}

	const changeCount = counts.updated + counts.inserted + counts.deleted;
	const hasChanges = changeCount > 0;

	// Build summary
	const summaryParts: Array<string> = [];
	if (counts.updated > 0) {
		summaryParts.push(`${counts.updated} section${counts.updated !== 1 ? "s" : ""} updated`);
	}
	if (counts.inserted > 0) {
		summaryParts.push(`${counts.inserted} section${counts.inserted !== 1 ? "s" : ""} added`);
	}
	if (counts.deleted > 0) {
		summaryParts.push(`${counts.deleted} section${counts.deleted !== 1 ? "s" : ""} deleted`);
	}
	const summary = summaryParts.length > 0 ? summaryParts.join(", ") : "No changes";

	return { hasChanges, changeCount, summary, counts };
}

/**
 * Compares content to determine if they're the same (after normalizing whitespace).
 */
export function contentMatches(content1: string, content2: string): boolean {
	return normalizeContent(content1) === normalizeContent(content2);
}
