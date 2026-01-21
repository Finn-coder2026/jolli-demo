import type { Convo, NewConvo } from "./Convo";

export function mockConvo(partial?: Partial<Convo>): Convo {
	return {
		id: 1,
		userId: undefined,
		visitorId: "visitor123",
		title: "Test Conversation",
		messages: [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there!" },
		],
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		...partial,
	};
}

export function mockNewConvo(partial?: Partial<NewConvo>): NewConvo {
	return {
		userId: undefined,
		visitorId: "visitor123",
		title: "New Conversation",
		messages: [],
		...partial,
	};
}
