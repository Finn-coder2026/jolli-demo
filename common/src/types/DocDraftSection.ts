export type DocDraftSectionChangeType = "insert-before" | "insert-after" | "update" | "delete";

/**
 * the type of section change.
 */
export type DocDraftSectionChangeForType = "content" | "prompt" | "metadata";

/**
 * The type of actor making a section change.
 */
export type DocDraftSectionChangeActorType = "agent" | "user";

/**
 * The actor making a section change.
 */
export interface DocDraftSectionChangeActor {
	type: DocDraftSectionChangeActorType;
	id?: number;
}

/**
 * A comment added by a user to a proposed section change.
 */
export interface DocDraftSectionComment {
	/**
	 * The message content
	 */
	content?: string;
	/**
	 * The user ID of the sender (if a user message)
	 */
	userId?: number;
	/**
	 * ISO timestamp of when the message was sent
	 */
	timestamp: string;
}

/**
 * Represents a single proposed change to a section of a Doc Draft.
 */
export interface DocDraftSectionChange {
	/**
	 * What the section change is for
	 */
	readonly for: DocDraftSectionChangeForType;
	/**
	 * The type of actor making the change.
	 */
	readonly who: DocDraftSectionChangeActor;
	/**
	 * A description of the change that will be made.
	 * This is what will be shown in the side bubble.
	 */
	readonly description: string;
	/**
	 * The changed value.
	 */
	readonly value: string | unknown;
	/**
	 * Timestamp when the change was applied.
	 */
	readonly appliedAt: string | undefined;
}

/**
 * Represents 1 or more proposed changes to a section of a Doc Draft.
 */
export interface DocDraftSectionChanges {
	/**
	 * auto-generated daft changes id.
	 */
	readonly id: number;
	/**
	 * ID of the draft the section changes are for
	 */
	readonly draftId: number;
	/**
	 * The type of section change being made (insert-before, insert-after, update, or delete).
	 */
	readonly changeType: DocDraftSectionChangeType;
	/**
	 * Path to locate the relative section within the draft doc to make the change to/before/after.
	 */
	readonly path: string;
	/**
	 * The original content of the section. This is only set if this is a section update.
	 */
	readonly content?: string;
	/**
	 * The proposed change or changes suggested by the agent for this section.
	 * Will be empty if this is for a section delete.
	 */
	readonly proposed: Array<DocDraftSectionChange>;
	/**
	 * Comments made to the section change.
	 */
	readonly comments: Array<DocDraftSectionComment>;
	/**
	 * Whether this change has been applied to the draft.
	 */
	readonly applied: boolean;
	/**
	 * Whether this change has been dismissed by the user.
	 */
	readonly dismissed: boolean;
	/**
	 * When the change was dismissed (if dismissed).
	 */
	readonly dismissedAt?: string | null;
	/**
	 * ID of the user who dismissed the change (if dismissed).
	 */
	readonly dismissedBy?: number | null;
	/**
	 * When changes were first added.
	 */
	readonly createdAt: string;
	/**
	 * When changes were last updated.
	 */
	readonly updatedAt: string;
}

/**
 * Type of annotation for rendering
 */
export type AnnotationType = "section-change" | "insert-point";

/**
 * Represents a section annotation with boundary information for frontend rendering.
 */
export interface SectionAnnotation {
	/**
	 * Type of annotation
	 */
	type: AnnotationType;
	/**
	 * Unique section identifier
	 */
	id: string;
	/**
	 * Section path from DocDraftSectionChanges
	 */
	path: string;
	/**
	 * Heading text or null for preamble
	 */
	title: string | null;
	/**
	 * Start line in markdown (0-indexed)
	 */
	startLine: number;
	/**
	 * End line in markdown (0-indexed)
	 */
	endLine: number;
	/**
	 * IDs of pending changes for this section
	 */
	changeIds: Array<number>;
}

/**
 * Response from getting section changes with annotations
 */
export interface SectionChangesResponse {
	/**
	 * Updated draft content
	 */
	content: string;
	/**
	 * Section annotations with boundary information
	 */
	sections: Array<SectionAnnotation>;
	/**
	 * All section changes for the draft
	 */
	changes: Array<DocDraftSectionChanges>;
	/**
	 * Whether undo is available
	 */
	canUndo: boolean;
	/**
	 * Whether redo is available
	 */
	canRedo: boolean;
}

/**
 * Response from applying a section change
 */
export interface ApplySectionChangeResponse {
	/**
	 * Updated draft content
	 */
	content: string;
	/**
	 * Updated section annotations
	 */
	sections: Array<SectionAnnotation>;
	/**
	 * Updated section changes
	 */
	changes: Array<DocDraftSectionChanges>;
	/**
	 * Whether undo is available
	 */
	canUndo: boolean;
	/**
	 * Whether redo is available
	 */
	canRedo: boolean;
}
