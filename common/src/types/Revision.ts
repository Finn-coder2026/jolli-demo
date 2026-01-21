import type { DocDraftSectionChanges, SectionAnnotation } from "./DocDraftSection";

/**
 * Revision metadata (without content)
 */
export interface RevisionInfo {
	timestamp: Date;
	userId: number;
	description: string;
}

/**
 * Response for undo/redo operations
 */
export interface UndoRedoResponse {
	success: boolean;
	content: string;
	sections: Array<SectionAnnotation>;
	changes: Array<DocDraftSectionChanges>;
	canUndo: boolean;
	canRedo: boolean;
}

/**
 * Response for getting revision history
 */
export interface RevisionsResponse {
	revisions: Array<RevisionInfo>;
	currentIndex: number;
	canUndo: boolean;
	canRedo: boolean;
}
