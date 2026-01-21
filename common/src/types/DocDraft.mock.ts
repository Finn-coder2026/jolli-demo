import type { DocDraft, DocDraftEditHistoryEntry, DraftCounts } from "./DocDraft";

export function mockDocDraft(partial?: Partial<DocDraft>): DocDraft {
	return {
		id: 1,
		docId: undefined,
		title: "Test Draft",
		content: "Test content",
		contentType: "text/markdown",
		createdBy: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		contentLastEditedAt: undefined,
		contentLastEditedBy: 1,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
		...partial,
	};
}

export function mockDocDraftEditHistoryEntry(partial?: Partial<DocDraftEditHistoryEntry>): DocDraftEditHistoryEntry {
	return {
		id: 1,
		draftId: 1,
		userId: 1,
		editType: "content",
		description: "Updated content",
		editedAt: new Date().toISOString(),
		...partial,
	};
}

export function mockDraftCounts(partial?: Partial<DraftCounts>): DraftCounts {
	return {
		all: 10,
		myNewDrafts: 2,
		mySharedNewDrafts: 0,
		sharedWithMe: 3,
		suggestedUpdates: 1,
		...partial,
	};
}
