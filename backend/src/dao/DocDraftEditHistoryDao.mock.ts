import type { DocDraftEditHistory, NewDocDraftEditHistory } from "../model/DocDraftEditHistory";
import type { DocDraftEditHistoryDao } from "./DocDraftEditHistoryDao";

export function mockDocDraftEditHistoryDao(): DocDraftEditHistoryDao {
	const entries = new Map<number, DocDraftEditHistory>();
	let nextId = 1;

	return {
		createEditHistory: (entry: NewDocDraftEditHistory): Promise<DocDraftEditHistory> => {
			const newEntry: DocDraftEditHistory = {
				id: nextId++,
				draftId: entry.draftId,
				userId: entry.userId,
				editType: entry.editType,
				description: entry.description,
				editedAt: entry.editedAt ?? new Date(),
				createdAt: new Date(),
			};
			entries.set(newEntry.id, newEntry);
			return Promise.resolve(newEntry);
		},

		listByDraftId: (draftId: number, limit = 50): Promise<Array<DocDraftEditHistory>> => {
			const result = Array.from(entries.values())
				.filter(entry => entry.draftId === draftId)
				.sort((a, b) => b.editedAt.getTime() - a.editedAt.getTime())
				.slice(0, limit);
			return Promise.resolve(result);
		},

		deleteByDraftId: (draftId: number): Promise<void> => {
			for (const [id, entry] of entries) {
				if (entry.draftId === draftId) {
					entries.delete(id);
				}
			}
			return Promise.resolve();
		},

		deleteAll: (): Promise<void> => {
			entries.clear();
			return Promise.resolve();
		},
	};
}
