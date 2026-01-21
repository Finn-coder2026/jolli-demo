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

		addMessage: (id: number, message: CollabMessage): Promise<CollabConvo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			const updated = {
				...convo,
				messages: [...convo.messages, message],
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
	};

	return dao;
}
