import type { ArtifactType, CollabConvo, CollabMessage, NewCollabConvo } from "../model/CollabConvo";
import { mockCollabConvo } from "../model/CollabConvo.mock";
import type { CollabConvoDao } from "./CollabConvoDao";

export function mockCollabConvoDao(): CollabConvoDao {
	const convos = new Map<number, CollabConvo>();
	let nextId = 1;

	const dao: CollabConvoDao = {
		createCollabConvo: (convo: NewCollabConvo): Promise<CollabConvo> => {
			const newConvo = mockCollabConvo({
				...convo,
				id: nextId++,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			convos.set(newConvo.id, newConvo);
			return Promise.resolve(newConvo);
		},

		getCollabConvo: (id: number): Promise<CollabConvo | undefined> => {
			return Promise.resolve(convos.get(id));
		},

		findByArtifact: (artifactType: ArtifactType, artifactId: number): Promise<CollabConvo | undefined> => {
			return Promise.resolve(
				Array.from(convos.values()).find(
					convo => convo.artifactType === artifactType && convo.artifactId === artifactId,
				),
			);
		},

		listByArtifactType: (
			artifactType: ArtifactType,
			limit?: number,
			offset?: number,
		): Promise<Array<CollabConvo>> => {
			const filtered = Array.from(convos.values())
				.filter(convo => convo.artifactType === artifactType)
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

			const start = offset ?? 0;
			const end = limit !== undefined ? start + limit : undefined;
			return Promise.resolve(filtered.slice(start, end));
		},

		addMessage: (id: number, message: CollabMessage): Promise<CollabConvo | undefined> => {
			return dao.addMessages(id, [message]);
		},

		addMessages: (id: number, messages: Array<CollabMessage>): Promise<CollabConvo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...convo,
				messages: [...convo.messages, ...messages],
				updatedAt: new Date(),
			};
			convos.set(id, updated);
			return Promise.resolve(updated);
		},

		getMessages: (id: number, limit?: number, offset?: number): Promise<Array<CollabMessage>> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve([]);
			}

			let messages = convo.messages;

			if (offset !== undefined) {
				messages = messages.slice(offset);
			}

			if (limit !== undefined) {
				messages = messages.slice(0, limit);
			}

			return Promise.resolve(messages);
		},

		updateLastActivity: (id: number): Promise<CollabConvo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...convo,
				updatedAt: new Date(),
			};
			convos.set(id, updated);
			return Promise.resolve(updated);
		},

		deleteCollabConvo: (id: number): Promise<boolean> => {
			return Promise.resolve(convos.delete(id));
		},

		deleteAllCollabConvos: (): Promise<void> => {
			convos.clear();
			return Promise.resolve();
		},

		updateMetadata: (id: number, metadata: Record<string, unknown>): Promise<CollabConvo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...convo,
				metadata: { ...convo.metadata, ...metadata },
				updatedAt: new Date(),
			};
			convos.set(id, updated);
			return Promise.resolve(updated);
		},

		updateTitle: (id: number, title: string): Promise<CollabConvo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...convo,
				title,
				updatedAt: new Date(),
			};
			convos.set(id, updated);
			return Promise.resolve(updated);
		},

		truncateMessages: (id: number, keepCount: number): Promise<CollabConvo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...convo,
				messages: convo.messages.slice(0, keepCount),
				updatedAt: new Date(),
			};
			convos.set(id, updated);
			return Promise.resolve(updated);
		},

		findSeededConvo: (
			artifactType: ArtifactType,
			convoKind: string,
			userId: number,
		): Promise<CollabConvo | undefined> => {
			return Promise.resolve(
				Array.from(convos.values()).find(
					convo =>
						convo.artifactType === artifactType &&
						(convo.metadata as Record<string, unknown> | null)?.convoKind === convoKind &&
						(convo.metadata as Record<string, unknown> | null)?.createdForUserId === userId,
				),
			);
		},
	};

	return dao;
}
