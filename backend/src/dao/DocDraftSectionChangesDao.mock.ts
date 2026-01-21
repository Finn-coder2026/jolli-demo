import type { DocDraftSectionChanges, NewDocDraftSectionChanges } from "../model/DocDraftSectionChanges";
import { mockDocDraftSectionChanges } from "../model/DocDraftSectionChanges.mock";
import type { DocDraftSectionChangesDao } from "./DocDraftSectionChangesDao";
import type { DocDraftSectionChange, DocDraftSectionComment } from "jolli-common";

export function mockDocDraftSectionChangesDao(): DocDraftSectionChangesDao {
	const changes = new Map<number, DocDraftSectionChanges>();
	let nextId = 1;

	const dao: DocDraftSectionChangesDao = {
		createDocDraftSectionChanges: (newChanges: NewDocDraftSectionChanges): Promise<DocDraftSectionChanges> => {
			const created = mockDocDraftSectionChanges({
				...newChanges,
				id: nextId++,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			changes.set(created.id, created);
			return Promise.resolve(created);
		},

		getDocDraftSectionChanges: (id: number): Promise<DocDraftSectionChanges | undefined> => {
			return Promise.resolve(changes.get(id));
		},

		listDocDraftSectionChanges: (limit?: number, offset?: number): Promise<Array<DocDraftSectionChanges>> => {
			let result = Array.from(changes.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

			if (offset !== undefined) {
				result = result.slice(offset);
			}

			if (limit !== undefined) {
				result = result.slice(0, limit);
			}

			return Promise.resolve(result);
		},

		findByDraftId: (draftId: number): Promise<Array<DocDraftSectionChanges>> => {
			return Promise.resolve(
				Array.from(changes.values())
					.filter(change => change.draftId === draftId)
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
			);
		},

		updateDocDraftSectionChanges: (
			id: number,
			updates: Partial<Pick<DocDraftSectionChanges, "changeType" | "path" | "content" | "proposed" | "comments">>,
		): Promise<DocDraftSectionChanges | undefined> => {
			const existing = changes.get(id);
			if (!existing) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...existing,
				...updates,
				updatedAt: new Date(),
			};
			changes.set(id, updated);
			return Promise.resolve(updated);
		},

		addComment: (id: number, comment: DocDraftSectionComment): Promise<DocDraftSectionChanges | undefined> => {
			const existing = changes.get(id);
			if (!existing) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...existing,
				comments: [...existing.comments, comment],
				updatedAt: new Date(),
			};
			changes.set(id, updated);
			return Promise.resolve(updated);
		},

		addProposedChange: (id: number, change: DocDraftSectionChange): Promise<DocDraftSectionChanges | undefined> => {
			const existing = changes.get(id);
			if (!existing) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...existing,
				proposed: [...existing.proposed, change],
				updatedAt: new Date(),
			};
			changes.set(id, updated);
			return Promise.resolve(updated);
		},

		dismissDocDraftSectionChange: (id: number, userId: number): Promise<DocDraftSectionChanges | undefined> => {
			const existing = changes.get(id);
			if (!existing) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...existing,
				dismissed: true,
				dismissedAt: new Date(),
				dismissedBy: userId,
				updatedAt: new Date(),
			};
			changes.set(id, updated);
			return Promise.resolve(updated);
		},

		deleteDocDraftSectionChanges: (id: number): Promise<boolean> => {
			return Promise.resolve(changes.delete(id));
		},

		deleteByDraftId: (draftId: number): Promise<number> => {
			const toDelete = Array.from(changes.values()).filter(change => change.draftId === draftId);
			for (const change of toDelete) {
				changes.delete(change.id);
			}
			return Promise.resolve(toDelete.length);
		},

		deleteAllDocDraftSectionChanges: (): Promise<void> => {
			changes.clear();
			return Promise.resolve();
		},
	};

	return dao;
}
