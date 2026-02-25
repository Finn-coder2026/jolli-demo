import { mockCollabConvo } from "../types/CollabConvo.mock";
import type { CollabConvoClient } from "./CollabConvoClient";

export function mockCollabConvoClient(partial?: Partial<CollabConvoClient>): CollabConvoClient {
	const convo = mockCollabConvo();
	return {
		createCollabConvo: async () => convo,
		getCollabConvo: async () => convo,
		getCollabConvoByArtifact: async () => convo,
		sendMessage: async () => {
			// No-op mock
		},
		streamConvo: () => ({}) as EventSource,
		...partial,
	};
}
