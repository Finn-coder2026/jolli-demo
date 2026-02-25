import type { Database } from "../core/Database";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { DocDraftSectionChanges } from "../model/DocDraftSectionChanges";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { createSectionMergeService } from "./SectionMergeService";
import { createSectionPathService, type SectionIdMapping } from "./SectionPathService";
import { parseSections, type Section, sectionToMarkdown } from "jolli-agent/jolliscript";
import type { SectionAnnotation } from "jolli-common";

const log = getLog(import.meta);

/**
 * Service for annotating markdown content with section change information.
 */
export interface SectionMarkupService {
	/**
	 * Annotates a doc draft with section boundary and change information.
	 * @param draftId the draft ID
	 * @param content the markdown content to annotate
	 * @returns array of section annotations
	 */
	annotateDocDraft(draftId: number, content: string): Promise<Array<SectionAnnotation>>;

	/**
	 * Applies a section change to draft content.
	 * @param content the current markdown content
	 * @param change the section change to apply
	 * @returns the modified content
	 */
	applySectionChangeToDraft(content: string, change: unknown): string;

	/**
	 * Re-extracts section content from the draft markdown for each change.
	 * @param draftContent the current draft markdown
	 * @param draftId the draft ID (for loading section ID metadata)
	 * @param changes the section changes to enrich
	 * @returns a new array of changes with refreshed content fields
	 */
	enrichSectionChangeContent(
		draftContent: string,
		draftId: number,
		changes: Array<DocDraftSectionChanges>,
	): Promise<Array<DocDraftSectionChanges>>;
}

/**
 * Creates a SectionMarkupService instance.
 * @param defaultDb - The default database to use when no tenant context is available.
 *                    In multi-tenant mode, methods will use getTenantContext() to get
 *                    the tenant-specific database.
 */
export function createSectionMarkupService(defaultDb: Database): SectionMarkupService {
	const sectionPathService = createSectionPathService();
	const sectionMergeService = createSectionMergeService();

	/**
	 * Get the DocDraftSectionChangesDao to use - prefers tenant context, falls back to default.
	 */
	function getDocDraftSectionChangesDao(): DocDraftSectionChangesDao {
		const tenantContext = getTenantContext();
		if (tenantContext?.database?.docDraftSectionChangesDao) {
			return tenantContext.database.docDraftSectionChangesDao;
		}
		return defaultDb.docDraftSectionChangesDao;
	}

	/**
	 * Get the DocDraftDao to use - prefers tenant context, falls back to default.
	 */
	function getDocDraftDao(): DocDraftDao {
		const tenantContext = getTenantContext();
		if (tenantContext?.database?.docDraftDao) {
			return tenantContext.database.docDraftDao;
		}
		return defaultDb.docDraftDao;
	}

	return {
		annotateDocDraft,
		applySectionChangeToDraft,
		enrichSectionChangeContent,
	};

	async function enrichSectionChangeContent(
		draftContent: string,
		draftId: number,
		changes: Array<DocDraftSectionChanges>,
	): Promise<Array<DocDraftSectionChanges>> {
		if (changes.length === 0) {
			return changes;
		}

		const draft = await getDocDraftDao().getDocDraft(draftId);
		/* v8 ignore next 3 - draft should always exist when called from router after validation */
		if (!draft) {
			return changes;
		}

		/* v8 ignore next - sectionIds may not exist in older drafts */
		const sectionIdMapping = (draft.contentMetadata as { sectionIds?: SectionIdMapping })?.sectionIds || {};
		const { sections } = sectionPathService.parseSectionsWithIds(draftContent, sectionIdMapping);

		return changes.map((change, _index) => {
			// Only enrich pending update/delete changes (they have original content)
			if (change.applied || change.dismissed) {
				return change;
			}
			if (change.changeType !== "update" && change.changeType !== "delete") {
				return change;
			}

			// Match section by sectionId (preferred) or path (legacy fallback)
			let matchedSection: Section | undefined;
			for (let i = 0; i < sections.length; i++) {
				const section = sections[i];
				const sectionPath = `/sections/${i}`;
				/* v8 ignore next - branch coverage for section matching */
				const matchesById = change.sectionId ? change.sectionId === section.id : false;
				const matchesByPath = change.path === sectionPath;
				if (matchesById || matchesByPath) {
					matchedSection = section;
					break;
				}
			}

			if (!matchedSection) {
				return change;
			}

			return { ...change, content: matchedSection.content };
		});
	}

	async function annotateDocDraft(draftId: number, content: string): Promise<Array<SectionAnnotation>> {
		// Get all pending section changes for this draft
		const allChanges = await getDocDraftSectionChangesDao().findByDraftId(draftId);
		const pendingChanges = allChanges.filter(change => !change.applied && !change.dismissed);

		log.debug("=== ANNOTATE DOC DRAFT DEBUG ===");
		log.debug("Draft ID: %d", draftId);
		log.debug("All changes: %d", allChanges.length);
		log.debug(
			"All changes details: %o",
			allChanges.map(c => ({ id: c.id, applied: c.applied, changeType: c.changeType })),
		);
		log.debug("Pending changes (applied=false): %d", pendingChanges.length);
		log.debug(
			"Pending changes details: %o",
			pendingChanges.map(c => ({ id: c.id, changeType: c.changeType, path: c.path, sectionId: c.sectionId })),
		);

		if (pendingChanges.length === 0) {
			log.debug("No pending changes, returning empty annotations");
			return [];
		}

		// Get draft to access section ID mapping from metadata
		const draft = await getDocDraftDao().getDocDraft(draftId);
		/* v8 ignore start - draft should always exist when called from router after validation */
		if (!draft) {
			log.warn("Draft %d not found", draftId);
			return [];
		}
		/* v8 ignore stop */

		/* v8 ignore next - sectionIds may not exist in older drafts */
		const sectionIdMapping = (draft.contentMetadata as { sectionIds?: SectionIdMapping })?.sectionIds || {};

		// Parse sections with stable IDs
		const { sections } = sectionPathService.parseSectionsWithIds(content, sectionIdMapping);
		const annotations: Array<SectionAnnotation> = [];

		// Match sections by stable ID (preferred) or by path (legacy fallback)
		for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
			const section = sections[sectionIndex];
			const sectionPath = `/sections/${sectionIndex}`;
			const sectionId = section.id;

			// Use full section range (heading + content) for annotations
			// Frontend uses this for hiding original content when showing suggestions
			const highlightStartLine = section.startLine;
			const highlightEndLine = section.endLine;

			// Find which update/delete changes apply to this section
			// Prefer matching by stable sectionId; if not matching, fall back to legacy path
			const sectionChanges = pendingChanges.filter(change => {
				/* v8 ignore next 3 - branch coverage for section matching logic */
				const matchesById = change.sectionId ? change.sectionId === sectionId : false;
				const matchesByPath = change.path === sectionPath;
				const isUpdateOrDelete = change.changeType === "update" || change.changeType === "delete";
				return (matchesById || matchesByPath) && isUpdateOrDelete;
			});

			if (sectionChanges.length > 0) {
				annotations.push({
					type: "section-change",
					id: `section-${sectionIndex}`,
					path: sectionPath,
					title: section.title,
					startLine: highlightStartLine,
					endLine: highlightEndLine,
					changeIds: sectionChanges.map(change => change.id),
				});

				log.debug(
					"Section annotation created: sectionId=%s, path=%s, title=%s, highlight lines=%d-%d, changeIds=%o",
					sectionId,
					sectionPath,
					section.title,
					highlightStartLine,
					highlightEndLine,
					sectionChanges.map(c => c.id),
				);
			}

			// Check for insert-after changes at this section
			const insertAfterChanges = pendingChanges.filter(change => {
				/* v8 ignore next 2 - branch coverage for insert-after matching logic */
				const matchesById = change.sectionId ? change.sectionId === sectionId : false;
				const matchesByPath = change.path === sectionPath;
				const isInsertAfter = change.changeType === "insert-after";
				return (matchesById || matchesByPath) && isInsertAfter;
			});

			/* v8 ignore start - insert-after changes path tested via frontend integration */
			if (insertAfterChanges.length > 0) {
				// Create insertion point annotation at the end of this section
				// For insert-after, we want the full section end, not just the heading
				const insertLine = section.endLine;

				annotations.push({
					type: "insert-point",
					id: `insert-after-${sectionIndex}`,
					path: sectionPath,
					title: section.title, // Include anchor section title for positioning in frontend
					startLine: insertLine,
					endLine: insertLine,
					changeIds: insertAfterChanges.map(change => change.id),
				});

				log.debug(
					"Insert-after annotation created: sectionId=%s, path=%s, title=%s, line=%d, changeIds=%o",
					sectionId,
					sectionPath,
					section.title,
					insertLine,
					insertAfterChanges.map(c => c.id),
				);
			}
			/* v8 ignore stop */
		}

		// Check for insert-before at section 0 (beginning of document)
		/* v8 ignore next - ternary for empty document case */
		const firstSectionId = sections.length > 0 ? sections[0].id : null;
		const insertBeforeFirst = pendingChanges.filter(change => {
			/* v8 ignore next 4 - branch coverage for insert-before matching logic */
			const matchesById = firstSectionId ? change.sectionId === firstSectionId : false;
			const matchesByPath = change.path === "/sections/0";
			const isInsertBefore = change.changeType === "insert-before";
			return (matchesById || matchesByPath) && isInsertBefore;
		});

		/* v8 ignore start - insert-before changes path tested via frontend integration */
		if (insertBeforeFirst.length > 0) {
			annotations.push({
				type: "insert-point",
				id: "insert-before-0",
				path: "/sections/0",
				title: null,
				startLine: 0,
				endLine: 0,
				changeIds: insertBeforeFirst.map(change => change.id),
			});

			log.debug(
				"Insert-before annotation created: sectionId=%s, path=/sections/0, line=0, changeIds=%o",
				firstSectionId,
				insertBeforeFirst.map(c => c.id),
			);
		}
		/* v8 ignore stop */

		log.debug("Annotated draft %d: %d annotations with pending changes", draftId, annotations.length);
		return annotations;
	}

	// Helper to reconstruct a section using the parser's sectionToMarkdown
	function reconstructSection(originalContent: string, section: Section): string {
		return sectionToMarkdown(section, originalContent);
	}

	// Helper to apply update change type
	function applyUpdateChange(
		content: string,
		sections: Array<Section>,
		sectionIndex: number,
		proposedValue: string,
		baseContent: string | undefined,
	): string {
		const targetSection = sections[sectionIndex];
		let finalContent = proposedValue;

		// If we have baseContent, perform three-way merge
		if (baseContent !== undefined) {
			const mergeResult = sectionMergeService.mergeSectionContent(
				baseContent,
				targetSection.content,
				proposedValue,
			);
			finalContent = mergeResult.merged;

			if (mergeResult.hasConflict) {
				/* v8 ignore next - conflicts array fallback for logging */
				log.warn("Merge conflict detected for section %d: %o", sectionIndex, mergeResult.conflicts || []);
			} /* v8 ignore start - debug logging for successful merge */ else {
				log.debug("Merge completed successfully for section %d", sectionIndex);
			} /* v8 ignore stop */
		}

		// Replace the section content with the merged/proposed content, keeping the heading
		const updatedSections: Array<string> = [];
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			if (i === sectionIndex) {
				// Create a modified section with the new content
				const updatedSection: Section = { ...section, content: finalContent };
				updatedSections.push(reconstructSection(content, updatedSection));
			} else {
				updatedSections.push(reconstructSection(content, section));
			}
		}
		log.debug("Applied update to section %d", sectionIndex);
		return updatedSections.join("\n\n");
	}

	// Helper to apply delete change type
	function applyDeleteChange(content: string, sections: Array<Section>, sectionIndex: number): string {
		const updatedSections: Array<string> = [];
		for (let i = 0; i < sections.length; i++) {
			if (i !== sectionIndex) {
				updatedSections.push(reconstructSection(content, sections[i]));
			}
		}
		log.debug("Applied delete to section %d", sectionIndex);
		return updatedSections.join("\n\n");
	}

	// Helper to apply insert-after change type
	function applyInsertAfterChange(
		content: string,
		sections: Array<Section>,
		sectionIndex: number,
		proposedValue: string,
	): string {
		const updatedSections: Array<string> = [];
		for (let i = 0; i < sections.length; i++) {
			updatedSections.push(reconstructSection(content, sections[i]));
			if (i === sectionIndex) {
				updatedSections.push(proposedValue);
			}
		}
		log.debug("Applied insert-after at section %d", sectionIndex);
		return updatedSections.join("\n\n");
	}

	// Helper to apply insert-before change type
	function applyInsertBeforeChange(
		content: string,
		sections: Array<Section>,
		sectionIndex: number,
		proposedValue: string,
	): string {
		const updatedSections: Array<string> = [];
		for (let i = 0; i < sections.length; i++) {
			if (i === sectionIndex) {
				updatedSections.push(proposedValue);
			}
			updatedSections.push(reconstructSection(content, sections[i]));
		}
		log.debug("Applied insert-before at section %d", sectionIndex);
		return updatedSections.join("\n\n");
	}

	function applySectionChangeToDraft(content: string, change: unknown): string {
		// Type assertion for the change parameter
		const sectionChange = change as {
			changeType: string;
			path: string;
			sectionId?: string;
			baseContent?: string;
			content?: string;
			proposed: Array<{ value: unknown }>;
		};

		log.debug("=== APPLY SECTION CHANGE DEBUG ===");
		log.debug("Change type: %s", sectionChange.changeType);
		log.debug("Path: %s", sectionChange.path);

		// Parse the content into sections
		const sections = parseSections(content);
		log.debug("Parsed %d sections from content", sections.length);

		// Determine section index: prefer matching by base/original content, fallback to path index
		let sectionIndex = -1;
		const base = (sectionChange.baseContent ?? sectionChange.content) as unknown;
		if (typeof base === "string" && base.length > 0) {
			sectionIndex = sections.findIndex(s => s.content === base);
		}

		if (sectionIndex < 0) {
			// Extract section index from path (e.g., "/sections/0" -> 0)
			const pathMatch = sectionChange.path.match(/\/sections\/(\d+)/);
			if (!pathMatch) {
				log.warn("Invalid section path: %s", sectionChange.path);
				return content;
			}

			sectionIndex = Number.parseInt(pathMatch[1], 10);
		}
		log.debug("Section index: %d", sectionIndex);

		// Validate section index
		if (sectionIndex < 0 || sectionIndex >= sections.length) {
			log.warn("Section index %d out of range (0-%d)", sectionIndex, sections.length - 1);
			return content;
		}

		// Get the proposed content value
		const proposedValue = sectionChange.proposed[0]?.value;
		log.debug("Proposed value type: %s", typeof proposedValue);
		log.debug(
			"Proposed value (first 100 chars): %s",
			typeof proposedValue === "string" ? proposedValue.substring(0, 100) : proposedValue,
		);

		// Apply the change based on changeType
		let result: string;
		switch (sectionChange.changeType) {
			case "update":
				if (typeof proposedValue !== "string") {
					log.warn("Invalid proposed value type for update: %s", typeof proposedValue);
					return content;
				}
				result = applyUpdateChange(content, sections, sectionIndex, proposedValue, sectionChange.baseContent);
				break;

			case "delete":
				result = applyDeleteChange(content, sections, sectionIndex);
				break;

			case "insert-after":
				if (typeof proposedValue !== "string") {
					log.warn("Invalid proposed value type for insert-after: %s", typeof proposedValue);
					return content;
				}
				result = applyInsertAfterChange(content, sections, sectionIndex, proposedValue);
				break;

			case "insert-before":
				if (typeof proposedValue !== "string") {
					log.warn("Invalid proposed value type for insert-before: %s", typeof proposedValue);
					return content;
				}
				result = applyInsertBeforeChange(content, sections, sectionIndex, proposedValue);
				break;

			default:
				log.warn("Unknown change type: %s", sectionChange.changeType);
				return content;
		}

		log.debug("Result length: %d (original: %d)", result.length, content.length);
		log.debug("Result changed: %s", result !== content);
		return result;
	}
}
