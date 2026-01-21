import { mockDocDraft, mockDraftCounts } from "../types/DocDraft.mock";
import type { DocDraftClient } from "./DocDraftClient";

export function mockDocDraftClient(partial?: Partial<DocDraftClient>): DocDraftClient {
	const draft = mockDocDraft();
	return {
		createDocDraft: async () => draft,
		listDocDrafts: async () => [draft],
		getDocDraft: async () => draft,
		updateDocDraft: async () => draft,
		saveDocDraft: async () => ({ success: true }),
		deleteDocDraft: async () => ({ success: true }),
		undoDocDraft: async () => ({
			success: true,
			content: draft.content,
			canUndo: false,
			canRedo: true,
			sections: [],
			changes: [],
		}),
		redoDocDraft: async () => ({
			success: true,
			content: draft.content,
			canUndo: true,
			canRedo: false,
			sections: [],
			changes: [],
		}),
		getRevisions: async () => ({ revisions: [], currentIndex: 0, canUndo: false, canRedo: false }),
		streamDraftUpdates: () => ({}) as EventSource,
		searchByTitle: async () => [],
		getSectionChanges: async () => ({
			content: draft.content,
			sections: [],
			changes: [],
			canUndo: false,
			canRedo: false,
		}),
		applySectionChange: async () => ({
			content: draft.content,
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		}),
		dismissSectionChange: async () => ({
			content: draft.content,
			sections: [],
			changes: [],
			canUndo: true,
			canRedo: false,
		}),
		getDraftsWithPendingChanges: async () => [],
		validateDocDraft: async () => ({ isValid: true, isOpenApiSpec: false, errors: [] }),
		validateContent: async () => ({ isValid: true, errors: [] }),
		shareDraft: async () => mockDocDraft({ isShared: true, sharedAt: new Date().toISOString(), sharedBy: 1 }),
		getDraftHistory: async () => [],
		getDraftCounts: async () => mockDraftCounts(),
		listDocDraftsFiltered: async () => ({ drafts: [draft], total: 1 }),
		...partial,
	};
}
