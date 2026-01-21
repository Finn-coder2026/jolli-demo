import type {
	CreateDocDraftRequest,
	DocDraft,
	DocDraftEditHistoryEntry,
	DocDraftWithPendingChanges,
	DraftCounts,
	DraftListFilter,
	UpdateDocDraftRequest,
} from "../types/DocDraft";
import type { ApplySectionChangeResponse, SectionChangesResponse } from "../types/DocDraftSection";
import type { RevisionsResponse, UndoRedoResponse } from "../types/Revision";
import type { OpenApiValidationError, OpenApiValidationResult } from "../util/OpenApiValidation";
import type { ClientAuth } from "./Client";

/**
 * Result of content validation (works for both MDX and OpenAPI)
 */
export interface ContentValidationResult {
	/** Whether the content is valid */
	isValid: boolean;
	/** Validation errors */
	errors: Array<OpenApiValidationError>;
}

const BASE_PATH = "/api/doc-drafts";

export interface DocDraftClient {
	/**
	 * Creates a new document draft
	 */
	createDocDraft(data: CreateDocDraftRequest): Promise<DocDraft>;
	/**
	 * Get all drafts for the current user
	 */
	listDocDrafts(limit?: number, offset?: number): Promise<Array<DocDraft>>;
	/**
	 * Gets a specific draft by ID
	 */
	getDocDraft(id: number): Promise<DocDraft>;
	/**
	 * Updates a draft
	 */
	updateDocDraft(id: number, updates: UpdateDocDraftRequest): Promise<DocDraft>;
	/**
	 * Saves a draft as an article
	 */
	saveDocDraft(id: number): Promise<{ success: boolean }>;
	/**
	 * Deletes a draft
	 */
	deleteDocDraft(id: number): Promise<{ success: boolean }>;
	/**
	 * Undo last change to draft
	 */
	undoDocDraft(id: number): Promise<UndoRedoResponse>;
	/**
	 * Redo last undone change to draft
	 */
	redoDocDraft(id: number): Promise<UndoRedoResponse>;
	/**
	 * Get revision history for draft
	 */
	getRevisions(id: number): Promise<RevisionsResponse>;
	/**
	 * Create an SSE connection to stream draft updates
	 */
	streamDraftUpdates(id: number): EventSource;
	/**
	 * Search drafts by title
	 */
	searchByTitle(title: string): Promise<Array<DocDraft>>;
	/**
	 * Get section changes with annotations for a draft
	 */
	getSectionChanges(draftId: number): Promise<SectionChangesResponse>;
	/**
	 * Apply a section change to a draft
	 */
	applySectionChange(draftId: number, changeId: number): Promise<ApplySectionChangeResponse>;
	/**
	 * Dismiss a section change
	 */
	dismissSectionChange(draftId: number, changeId: number): Promise<SectionChangesResponse>;
	/**
	 * Get drafts that have pending section changes
	 */
	getDraftsWithPendingChanges(): Promise<Array<DocDraftWithPendingChanges>>;
	/**
	 * Validate draft content (for OpenAPI specs)
	 */
	validateDocDraft(id: number): Promise<OpenApiValidationResult>;
	/**
	 * Validate content without requiring a draft (for real-time validation)
	 */
	validateContent(content: string, contentType?: string): Promise<ContentValidationResult>;
	/**
	 * Share a draft with other users
	 */
	shareDraft(id: number): Promise<DocDraft>;
	/**
	 * Get edit history for a draft
	 */
	getDraftHistory(id: number): Promise<Array<DocDraftEditHistoryEntry>>;
	/**
	 * Get counts for draft list filter cards
	 */
	getDraftCounts(): Promise<DraftCounts>;
	/**
	 * List drafts with a specific filter
	 */
	listDocDraftsFiltered(
		filter: DraftListFilter,
		limit?: number,
		offset?: number,
	): Promise<{ drafts: Array<DocDraft>; total: number }>;
}

export function createDocDraftClient(baseUrl: string, auth: ClientAuth): DocDraftClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;
	return {
		createDocDraft,
		listDocDrafts,
		getDocDraft,
		updateDocDraft,
		saveDocDraft,
		deleteDocDraft,
		undoDocDraft,
		redoDocDraft,
		getRevisions,
		streamDraftUpdates,
		searchByTitle,
		getSectionChanges,
		applySectionChange,
		dismissSectionChange,
		getDraftsWithPendingChanges,
		validateDocDraft,
		validateContent,
		shareDraft,
		getDraftHistory,
		getDraftCounts,
		listDocDraftsFiltered,
	};

	async function createDocDraft(data: CreateDocDraftRequest): Promise<DocDraft> {
		const response = await fetch(basePath, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create draft: ${response.statusText}`);
		}

		return (await response.json()) as DocDraft;
	}

	async function listDocDrafts(limit?: number, offset?: number): Promise<Array<DocDraft>> {
		const params = new URLSearchParams();
		if (limit !== undefined) {
			params.append("limit", limit.toString());
		}
		if (offset !== undefined) {
			params.append("offset", offset.toString());
		}

		const url = params.toString() ? `${basePath}?${params}` : basePath;
		const response = await fetch(url, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list drafts: ${response.statusText}`);
		}

		return (await response.json()) as Array<DocDraft>;
	}

	async function getDocDraft(id: number): Promise<DocDraft> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get draft: ${response.statusText}`);
		}

		return (await response.json()) as DocDraft;
	}

	async function updateDocDraft(id: number, updates: UpdateDocDraftRequest): Promise<DocDraft> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PATCH", updates));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update draft: ${response.statusText}`);
		}

		return (await response.json()) as DocDraft;
	}

	async function saveDocDraft(id: number): Promise<{ success: boolean }> {
		const response = await fetch(`${basePath}/${id}/save`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to save draft: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean };
	}

	async function deleteDocDraft(id: number): Promise<{ success: boolean }> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete draft: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean };
	}

	async function undoDocDraft(id: number): Promise<UndoRedoResponse> {
		const response = await fetch(`${basePath}/${id}/undo`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to undo: ${response.statusText}`);
		}

		return (await response.json()) as UndoRedoResponse;
	}

	async function redoDocDraft(id: number): Promise<UndoRedoResponse> {
		const response = await fetch(`${basePath}/${id}/redo`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to redo: ${response.statusText}`);
		}

		return (await response.json()) as UndoRedoResponse;
	}

	async function getRevisions(id: number): Promise<RevisionsResponse> {
		const response = await fetch(`${basePath}/${id}/revisions`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get revisions: ${response.statusText}`);
		}

		return (await response.json()) as RevisionsResponse;
	}

	function streamDraftUpdates(id: number): EventSource {
		return new EventSource(`${basePath}/${id}/stream`, { withCredentials: true });
	}

	async function searchByTitle(title: string): Promise<Array<DocDraft>> {
		const response = await fetch(`${basePath}/search-by-title`, createRequest("POST", { title }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to search drafts by title: ${response.statusText}`);
		}

		return (await response.json()) as Array<DocDraft>;
	}

	async function getSectionChanges(draftId: number): Promise<SectionChangesResponse> {
		const response = await fetch(`${basePath}/${draftId}/section-changes`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get section changes: ${response.statusText}`);
		}

		return (await response.json()) as SectionChangesResponse;
	}

	async function applySectionChange(draftId: number, changeId: number): Promise<ApplySectionChangeResponse> {
		const response = await fetch(`${basePath}/${draftId}/section-changes/${changeId}/apply`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to apply section change: ${response.statusText}`);
		}

		return (await response.json()) as ApplySectionChangeResponse;
	}

	async function dismissSectionChange(draftId: number, changeId: number): Promise<SectionChangesResponse> {
		const response = await fetch(
			`${basePath}/${draftId}/section-changes/${changeId}/dismiss`,
			createRequest("POST"),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to dismiss section change: ${response.statusText}`);
		}

		return (await response.json()) as SectionChangesResponse;
	}

	async function getDraftsWithPendingChanges(): Promise<Array<DocDraftWithPendingChanges>> {
		const response = await fetch(`${basePath}/with-pending-changes`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get drafts with pending changes: ${response.statusText}`);
		}

		return (await response.json()) as Array<DocDraftWithPendingChanges>;
	}

	async function validateDocDraft(id: number): Promise<OpenApiValidationResult> {
		const response = await fetch(`${basePath}/${id}/validate`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to validate draft: ${response.statusText}`);
		}

		return (await response.json()) as OpenApiValidationResult;
	}

	async function validateContent(content: string, contentType?: string): Promise<ContentValidationResult> {
		const response = await fetch(`${basePath}/validate`, createRequest("POST", { content, contentType }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to validate content: ${response.statusText}`);
		}

		return (await response.json()) as ContentValidationResult;
	}

	async function shareDraft(id: number): Promise<DocDraft> {
		const response = await fetch(`${basePath}/${id}/share`, createRequest("POST"));

		if (!response.ok) {
			throw new Error(`Failed to share draft: ${response.statusText}`);
		}

		return (await response.json()) as DocDraft;
	}

	async function getDraftHistory(id: number): Promise<Array<DocDraftEditHistoryEntry>> {
		const response = await fetch(`${basePath}/${id}/history`, createRequest("GET"));

		if (!response.ok) {
			throw new Error(`Failed to get draft history: ${response.statusText}`);
		}

		return (await response.json()) as Array<DocDraftEditHistoryEntry>;
	}

	async function getDraftCounts(): Promise<DraftCounts> {
		const response = await fetch(`${basePath}/counts`, createRequest("GET"));

		if (!response.ok) {
			throw new Error(`Failed to get draft counts: ${response.statusText}`);
		}

		return (await response.json()) as DraftCounts;
	}

	async function listDocDraftsFiltered(
		filter: DraftListFilter,
		limit?: number,
		offset?: number,
	): Promise<{ drafts: Array<DocDraft>; total: number }> {
		const params = new URLSearchParams();
		params.append("filter", filter);
		if (limit !== undefined) {
			params.append("limit", limit.toString());
		}
		if (offset !== undefined) {
			params.append("offset", offset.toString());
		}

		const response = await fetch(`${basePath}?${params}`, createRequest("GET"));

		if (!response.ok) {
			throw new Error(`Failed to list filtered drafts: ${response.statusText}`);
		}

		return (await response.json()) as { drafts: Array<DocDraft>; total: number };
	}
}
