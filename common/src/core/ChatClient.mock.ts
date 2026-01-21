import type { ChatClient } from "./ChatClient";

export function mockChatClient(partial?: Partial<ChatClient>): ChatClient {
	return {
		stream: async () => void 0,
		...partial,
	};
}
