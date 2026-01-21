import type { ChatMessage, Convo } from "./Convo";

export function mockChatMessage(partial?: Partial<ChatMessage>): ChatMessage {
	return {
		role: "user",
		content: "What is the most commonly occuring number in the universe?",
		...partial,
	} as ChatMessage;
}

export function mockConvo(partial?: Partial<Convo>): Convo {
	return {
		id: 5,
		userId: 34,
		visitorId: "LsVsbojxbaZrd83HVHs7cw",
		title: "What is the most commonly occuring number in the universe?",
		messages: [
			mockChatMessage(),
			mockChatMessage({
				role: "assistant",
				content: "The most commonly occuring number in the universe is 34 of course!",
			}),
			mockChatMessage({
				role: "user",
				content: "I thought it was 42.",
			}),
			mockChatMessage({
				role: "assistant",
				content: [
					"No silly, 42 is the answer to life, the universe, and everything",
					"but 34 is the most commmonly occuring number.",
				].join(", "),
			}),
		],
		createdAt: "2025-10-09 17:04:14.585000 +00:00",
		updatedAt: "2025-10-09 17:04:33.435000 +00:00",
		...partial,
	};
}
