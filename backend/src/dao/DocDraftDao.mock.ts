import type { DocDraft, NewDocDraft } from "../model/DocDraft";
import { mockDocDraft } from "../model/DocDraft.mock";
import type { DocDraftDao, DocDraftWithPendingChanges } from "./DocDraftDao";

export function mockDocDraftDao(): DocDraftDao {
	const drafts = new Map<number, DocDraft>();
	let nextId = 1;

	const dao: DocDraftDao = {
		createDocDraft: (draft: NewDocDraft): Promise<DocDraft> => {
			const newDraft = mockDocDraft({
				...draft,
				id: nextId++,
				contentType: draft.contentType ?? "text/markdown",
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: draft.contentLastEditedAt ?? null,
				contentLastEditedBy: draft.contentLastEditedBy ?? draft.createdBy,
				contentMetadata: draft.contentMetadata ?? undefined,
			});
			drafts.set(newDraft.id, newDraft);
			return Promise.resolve(newDraft);
		},

		getDocDraft: (id: number): Promise<DocDraft | undefined> => {
			return Promise.resolve(drafts.get(id));
		},

		listDocDrafts: (limit?: number, offset?: number): Promise<Array<DocDraft>> => {
			let result = Array.from(drafts.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

			if (offset !== undefined) {
				result = result.slice(offset);
			}

			if (limit !== undefined) {
				result = result.slice(0, limit);
			}

			return Promise.resolve(result);
		},

		listDocDraftsByUser: (userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>> => {
			let result = Array.from(drafts.values())
				.filter(draft => draft.createdBy === userId)
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

			if (offset !== undefined) {
				result = result.slice(offset);
			}

			if (limit !== undefined) {
				result = result.slice(0, limit);
			}

			return Promise.resolve(result);
		},

		findByDocId: (docId: number): Promise<Array<DocDraft>> => {
			return Promise.resolve(
				Array.from(drafts.values())
					.filter(draft => draft.docId === docId)
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
			);
		},

		updateDocDraft: (
			id: number,
			updates: Partial<
				Pick<
					DocDraft,
					| "title"
					| "content"
					| "contentType"
					| "contentLastEditedAt"
					| "contentLastEditedBy"
					| "contentMetadata"
				>
			>,
		): Promise<DocDraft | undefined> => {
			const draft = drafts.get(id);
			if (!draft) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...draft,
				...updates,
				updatedAt: new Date(),
			};
			drafts.set(id, updated);
			return Promise.resolve(updated);
		},

		deleteDocDraft: (id: number): Promise<boolean> => {
			return Promise.resolve(drafts.delete(id));
		},

		deleteAllDocDrafts: (): Promise<void> => {
			drafts.clear();
			return Promise.resolve();
		},

		searchDocDraftsByTitle: (title: string, userId: number): Promise<Array<DocDraft>> => {
			const lowerTitle = title.toLowerCase();
			return Promise.resolve(
				Array.from(drafts.values())
					.filter(draft => draft.createdBy === userId && draft.title.toLowerCase().includes(lowerTitle))
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
			);
		},

		getDraftsWithPendingChanges: (): Promise<Array<DocDraftWithPendingChanges>> => {
			// Mock implementation returns empty array by default
			// Tests can override this with vi.spyOn
			return Promise.resolve([]);
		},

		listAccessibleDrafts: (userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>> => {
			// Return drafts the user can access: owned, shared, agent-created, or has docId
			let result = Array.from(drafts.values())
				.filter(
					draft =>
						draft.createdBy === userId ||
						draft.isShared ||
						draft.createdByAgent ||
						draft.docId !== undefined,
				)
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

			if (offset !== undefined) {
				result = result.slice(offset);
			}
			if (limit !== undefined) {
				result = result.slice(0, limit);
			}
			return Promise.resolve(result);
		},

		findDraftsByExactTitle: (title: string): Promise<Array<DocDraft>> => {
			const lowerTitle = title.toLowerCase();
			return Promise.resolve(
				Array.from(drafts.values())
					.filter(draft => draft.title.toLowerCase() === lowerTitle && draft.docId === undefined)
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
			);
		},

		findDraftByDocId: (docId: number): Promise<DocDraft | undefined> => {
			return Promise.resolve(Array.from(drafts.values()).find(draft => draft.docId === docId));
		},

		shareDraft: (draftId: number, sharedBy: number): Promise<DocDraft | undefined> => {
			const draft = drafts.get(draftId);
			if (!draft) {
				return Promise.resolve(undefined);
			}
			const updated = {
				...draft,
				isShared: true,
				sharedAt: new Date(),
				sharedBy,
				updatedAt: new Date(),
			};
			drafts.set(draftId, updated);
			return Promise.resolve(updated);
		},

		listSharedDrafts: (userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>> => {
			// Return agent-created + explicitly shared drafts (not owned by user)
			let result = Array.from(drafts.values())
				.filter(
					draft =>
						draft.docId === undefined && // Only new drafts
						draft.createdBy !== userId && // Not owned by user
						(draft.isShared || draft.createdByAgent), // Shared or agent-created
				)
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

			if (offset !== undefined) {
				result = result.slice(offset);
			}
			if (limit !== undefined) {
				result = result.slice(0, limit);
			}
			return Promise.resolve(result);
		},

		countMyNewDrafts: (userId: number): Promise<number> => {
			return Promise.resolve(
				Array.from(drafts.values()).filter(
					draft =>
						draft.docId === undefined && // New draft (no docId)
						draft.createdBy === userId && // Owned by user
						!draft.isShared, // Not shared
				).length,
			);
		},

		countMySharedNewDrafts: (userId: number): Promise<number> => {
			return Promise.resolve(
				Array.from(drafts.values()).filter(
					draft =>
						draft.docId === undefined && // New draft (no docId)
						draft.createdBy === userId && // Owned by user
						draft.isShared === true, // Is shared
				).length,
			);
		},

		countSharedWithMeDrafts: (userId: number): Promise<number> => {
			return Promise.resolve(
				Array.from(drafts.values()).filter(
					draft =>
						draft.docId === undefined && // New draft
						draft.createdBy !== userId && // Not owned by user
						(draft.isShared || draft.createdByAgent), // Shared or agent-created
				).length,
			);
		},

		countArticlesWithAgentSuggestions: (): Promise<number> => {
			// Count unique docIds that have agent suggestions (drafts with docId and createdByAgent)
			const docIdsWithSuggestions = new Set(
				Array.from(drafts.values())
					.filter(draft => draft.docId !== undefined && draft.createdByAgent)
					.map(draft => draft.docId),
			);
			return Promise.resolve(docIdsWithSuggestions.size);
		},

		getAllContent: (): Promise<Array<{ content: string }>> => {
			return Promise.resolve(Array.from(drafts.values()).map(draft => ({ content: draft.content })));
		},
	};

	return dao;
}
