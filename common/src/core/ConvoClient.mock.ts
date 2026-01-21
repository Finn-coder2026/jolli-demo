import { mockConvo } from "../types/Convo.mock";
import type { ConvoClient } from "./ConvoClient";

export function mockConvoClient(partial?: Partial<ConvoClient>): ConvoClient {
	const convo = mockConvo();
	return {
		createConvo: async () => convo,
		listConvos: async () => [convo],
		findConvo: async (id: number) => (convo.id === id ? convo : undefined),
		updateConvo: async () => convo,
		deleteConvo: async () => void 0,
		addMessage: async () => convo,
		...partial,
	};
}
