import { parseSections } from "../../../tools/jolliagent/src/jolliscript/parser";
import type { Section } from "../../../tools/jolliagent/src/jolliscript/types";
import { randomUUID } from "node:crypto";

/**
 * Metadata for section IDs stored in draft metadata
 */
export interface SectionIdMapping {
	/**
	 * Map of section ID to section title (or null for preamble)
	 */
	[sectionId: string]: string | null;
}

/**
 * Extended Section with ID
 */
export interface SectionWithId extends Section {
	id: string;
}

/**
 * Service for managing stable section identifiers.
 * Generates and maintains UUIDs for markdown sections to support stable references
 * even when sections are reordered or deleted.
 */
export interface SectionPathService {
	/**
	 * Parses sections from markdown and assigns stable IDs.
	 * Reuses existing IDs from sectionIdMapping when possible (by matching titles).
	 * @param content markdown content
	 * @param existingMapping existing section ID mapping from draft metadata
	 * @returns sections with assigned IDs and updated mapping
	 */
	parseSectionsWithIds(
		content: string,
		existingMapping?: SectionIdMapping,
	): { sections: Array<SectionWithId>; mapping: SectionIdMapping };

	/**
	 * Finds a section by its stable ID.
	 * @param sections sections with IDs
	 * @param sectionId the stable section ID
	 * @returns the section if found, null otherwise
	 */
	findSectionById(sections: Array<SectionWithId>, sectionId: string): SectionWithId | null;

	/**
	 * Converts a legacy path (e.g., "/sections/0") to a section ID by index.
	 * @param sections sections with IDs
	 * @param path legacy path string
	 * @returns section ID if found, null otherwise
	 */
	pathToSectionId(sections: Array<SectionWithId>, path: string): string | null;

	/**
	 * Gets the index of a section by its ID.
	 * @param sections sections with IDs
	 * @param sectionId the stable section ID
	 * @returns the index if found, -1 otherwise
	 */
	getSectionIndex(sections: Array<SectionWithId>, sectionId: string): number;
}

/**
 * Creates a SectionPathService instance.
 */
export function createSectionPathService(): SectionPathService {
	return {
		parseSectionsWithIds,
		findSectionById,
		pathToSectionId,
		getSectionIndex,
	};

	function parseSectionsWithIds(
		content: string,
		existingMapping: SectionIdMapping = {},
	): { sections: Array<SectionWithId>; mapping: SectionIdMapping } {
		const baseSections = parseSections(content);
		const sectionsWithIds: Array<SectionWithId> = [];
		const newMapping: SectionIdMapping = {};

		// Create reverse mapping: title -> existing ID
		const titleToId = new Map<string | null, string>();
		for (const [id, title] of Object.entries(existingMapping)) {
			titleToId.set(title, id);
		}

		for (const section of baseSections) {
			let sectionId: string;

			// Try to reuse existing ID if title matches
			if (titleToId.has(section.title)) {
				sectionId = titleToId.get(section.title) as string;
				// Remove from map so we don't reuse it for another section
				titleToId.delete(section.title);
			} else {
				// Generate new UUID for new section
				sectionId = randomUUID();
			}

			sectionsWithIds.push({
				...section,
				id: sectionId,
			});

			newMapping[sectionId] = section.title;
		}

		return { sections: sectionsWithIds, mapping: newMapping };
	}

	function findSectionById(sections: Array<SectionWithId>, sectionId: string): SectionWithId | null {
		return sections.find(s => s.id === sectionId) ?? null;
	}

	function pathToSectionId(sections: Array<SectionWithId>, path: string): string | null {
		// Extract section index from path (e.g., "/sections/0" -> 0)
		const pathMatch = path.match(/\/sections\/(\d+)/);
		if (!pathMatch) {
			return null;
		}

		const sectionIndex = Number.parseInt(pathMatch[1], 10);

		if (sectionIndex < 0 || sectionIndex >= sections.length) {
			return null;
		}

		return sections[sectionIndex].id;
	}

	function getSectionIndex(sections: Array<SectionWithId>, sectionId: string): number {
		return sections.findIndex(s => s.id === sectionId);
	}
}

/**
 * Finds a section by its title.
 *
 * @param sections - Array of all sections from parseSections()
 * @param title - Section title (null for preamble)
 * @returns Section index (0-based) or null if not found
 */
export function findSectionByTitle(sections: Array<Section>, title: string | null): number | null {
	const sectionIndex = sections.findIndex(section => {
		if (title === null || title === "null") {
			return section.title === null;
		}
		return section.title === title;
	});

	return sectionIndex >= 0 ? sectionIndex : null;
}
