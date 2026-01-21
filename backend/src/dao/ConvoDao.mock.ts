import type { ChatMessage, Convo, NewConvo } from "../model/Convo";
import { mockConvo } from "../model/Convo.mock";
import type { ConvoDao } from "./ConvoDao";

export function mockConvoDao(): ConvoDao {
	const convos = new Map<number, Convo>();
	let nextId = 1;

	const dao: ConvoDao = {
		createConvo: (convo: NewConvo): Promise<Convo> => {
			const newConvo = mockConvo({
				...convo,
				id: nextId++,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			convos.set(newConvo.id, newConvo);
			return Promise.resolve(newConvo);
		},

		getConvo: (id: number, userId?: number, visitorId?: string): Promise<Convo | undefined> => {
			const convo = convos.get(id);
			if (!convo) {
				return Promise.resolve(undefined);
			}

			// Authorization check
			// Allow access if either userId or visitorId matches, OR if both are undefined (for testing)
			const hasAccess =
				(userId !== undefined && convo.userId === userId) ||
				(visitorId !== undefined && convo.visitorId === visitorId) ||
				(userId === undefined &&
					visitorId === undefined &&
					convo.userId === undefined &&
					convo.visitorId === undefined);

			return Promise.resolve(hasAccess ? convo : undefined);
		},

		listConvos: (userId?: number, visitorId?: string): Promise<Array<Convo>> => {
			return Promise.resolve(
				Array.from(convos.values())
					.filter(
						conv =>
							(userId !== undefined && conv.userId === userId) ||
							(visitorId !== undefined && conv.visitorId === visitorId) ||
							(userId === undefined &&
								visitorId === undefined &&
								conv.userId === undefined &&
								conv.visitorId === undefined),
					)
					.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
			);
		},

		updateConvo: async (
			id: number,
			updates: Partial<Pick<Convo, "title" | "messages">>,
			userId?: number,
			visitorId?: string,
		): Promise<Convo | undefined> => {
			const convo = await dao.getConvo(id, userId, visitorId);
			if (!convo) {
				return;
			}

			const updated = {
				...convo,
				...updates,
				updatedAt: new Date(),
			};
			convos.set(id, updated);
			return updated;
		},

		deleteConvo: async (id: number, userId?: number, visitorId?: string): Promise<boolean> => {
			const convo = await dao.getConvo(id, userId, visitorId);
			if (!convo) {
				return false;
			}

			convos.delete(id);
			return true;
		},

		addMessage: async (
			id: number,
			message: ChatMessage,
			userId?: number,
			visitorId?: string,
		): Promise<Convo | undefined> => {
			const convo = await dao.getConvo(id, userId, visitorId);
			if (!convo) {
				return;
			}

			const updatedMessages = [...convo.messages, message];
			return dao.updateConvo(id, { messages: updatedMessages }, userId, visitorId);
		},
	};

	return dao;
}
