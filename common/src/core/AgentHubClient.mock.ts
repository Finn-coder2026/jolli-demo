import type { AgentHubClient } from "./AgentHubClient";

export function mockAgentHubClient(partial?: Partial<AgentHubClient>): AgentHubClient {
	return {
		createConvo: async () => ({
			id: 1,
			title: undefined,
			messages: [],
			metadata: null,
			createdAt: "",
			updatedAt: "",
		}),
		listConvos: async () => [],
		getConvo: async () => ({
			id: 1,
			title: "Test",
			messages: [],
			metadata: null,
			createdAt: "",
			updatedAt: "",
		}),
		deleteConvo: async () => void 0,
		updateTitle: async () => void 0,
		sendMessage: async () => void 0,
		retryMessage: async (_id: number, _messageIndex: number) => void 0,
		seedConvo: async () => void 0,
		advanceConvo: async () => void 0,
		respondToConfirmation: async () => void 0,
		setMode: async () => ({
			id: 1,
			title: "Test",
			messages: [],
			metadata: { mode: "exec" as const },
			createdAt: "",
			updatedAt: "",
		}),
		...partial,
	};
}
