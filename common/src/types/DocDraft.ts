/**
 * Supported content types for document drafts
 */
export type DocDraftContentType = "text/markdown" | "application/json" | "application/yaml";

/**
 * A document draft being collaboratively edited
 */
export interface DocDraft {
	/**
	 * The unique draft ID
	 */
	readonly id: number;
	/**
	 * The ID of the document this draft is for (null for new documents)
	 */
	readonly docId: number | undefined;
	/**
	 * The draft title
	 */
	readonly title: string;
	/**
	 * The draft content
	 */
	readonly content: string;
	/**
	 * The content type (e.g., "text/markdown", "application/json", "application/yaml")
	 * Defaults to "text/markdown" for backward compatibility
	 */
	readonly contentType: DocDraftContentType;
	/**
	 * The user ID of the creator
	 */
	readonly createdBy: number;
	/**
	 * Date and time string representing when the draft was created
	 */
	readonly createdAt: string;
	/**
	 * Date and time string representing when the draft was updated
	 */
	readonly updatedAt: string;
	/**
	 * Date and time string representing when the content was last edited (undefined if never edited)
	 */
	readonly contentLastEditedAt: string | undefined;
	/**
	 * The user ID of the last person to edit the content (undefined if never edited)
	 */
	readonly contentLastEditedBy: number | undefined;
	/**
	 * Additional metadata about the draft content
	 */
	readonly contentMetadata: unknown | undefined;
	/**
	 * Whether this draft is shared with other users
	 */
	readonly isShared: boolean;
	/**
	 * Date and time string representing when the draft was shared (undefined if not shared)
	 */
	readonly sharedAt: string | undefined;
	/**
	 * The user ID of who shared the draft (undefined if not shared)
	 */
	readonly sharedBy: number | undefined;
	/**
	 * Whether this draft was created by a Jolli Agent
	 */
	readonly createdByAgent: boolean;
}

/**
 * Parameters for creating a new draft
 */
export interface CreateDocDraftRequest {
	/**
	 * The ID of the document this draft is for (optional, null for new documents)
	 */
	docId?: number | undefined;
	/**
	 * The draft title
	 */
	title: string;
	/**
	 * The draft content
	 */
	content: string;
	/**
	 * The content type (defaults to "text/markdown" if not provided)
	 */
	contentType?: DocDraftContentType;
	/**
	 * The space to create the article in (e.g., "/root")
	 * When set, the JRN will be prefixed with this space instead of "article:"
	 */
	space?: string;
}

/**
 * Parameters for updating a draft
 */
export interface UpdateDocDraftRequest {
	/**
	 * Updated title (optional)
	 */
	title?: string;
	/**
	 * Updated content (optional)
	 */
	content?: string;
	/**
	 * Updated content type (optional)
	 */
	contentType?: DocDraftContentType;
	/**
	 * Updated content metadata (optional)
	 */
	contentMetadata?: unknown;
}

/**
 * Represents a draft with pending section changes metadata
 */
export interface DocDraftWithPendingChanges {
	/**
	 * The draft object
	 */
	draft: DocDraft;
	/**
	 * Number of pending (unapplied, undismissed) section changes
	 */
	pendingChangesCount: number;
	/**
	 * Timestamp of the most recent section change
	 */
	lastChangeUpdatedAt: string;
}

/**
 * Types of edits that can be recorded in draft history
 */
export type DocDraftEditType = "content" | "title" | "section_apply" | "section_dismiss";

/**
 * Represents an edit history entry for a document draft
 */
export interface DocDraftEditHistoryEntry {
	/**
	 * The unique history entry ID
	 */
	readonly id: number;
	/**
	 * The draft this history entry belongs to
	 */
	readonly draftId: number;
	/**
	 * The user who made the edit
	 */
	readonly userId: number;
	/**
	 * The type of edit that was made
	 */
	readonly editType: DocDraftEditType;
	/**
	 * A brief description of the edit
	 */
	readonly description: string;
	/**
	 * Date and time string representing when the edit was made
	 */
	readonly editedAt: string;
}

/**
 * Counts for draft list filter cards in the UI
 */
export interface DraftCounts {
	/**
	 * Total count of all accessible articles
	 */
	readonly all: number;
	/**
	 * Count of user's unshared new drafts
	 */
	readonly myNewDrafts: number;
	/**
	 * Count of user's shared new drafts (drafts user owns but has shared)
	 */
	readonly mySharedNewDrafts: number;
	/**
	 * Count of drafts shared with user (including agent-created)
	 */
	readonly sharedWithMe: number;
	/**
	 * Count of articles with pending agent suggestions
	 */
	readonly suggestedUpdates: number;
}

/**
 * Filter options for draft list
 */
export type DraftListFilter = "all" | "my-new-drafts" | "shared-with-me" | "suggested-updates";

/**
 * Response for draft conflict when a draft with the same title already exists
 */
export interface DraftConflictResponse {
	/**
	 * Error message
	 */
	error: string;
	/**
	 * The existing draft with the conflicting title (for new article conflicts)
	 */
	conflictingDraft?: DocDraft;
	/**
	 * The existing draft ID (for existing article draft conflicts)
	 */
	existingDraftId?: number;
}
