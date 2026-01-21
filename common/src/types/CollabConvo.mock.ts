import type { CollabConvo, CollabMessage } from "./CollabConvo";

export function mockCollabMessage(partial?: Partial<CollabMessage>): CollabMessage {
	return {
		role: "user",
		content: "Test message",
		userId: 1,
		timestamp: new Date().toISOString(),
		...partial,
	};
}

export function mockCollabConvo(partial?: Partial<CollabConvo>): CollabConvo {
	return {
		id: 1,
		artifactType: "doc_draft",
		artifactId: 1,
		messages: [mockCollabMessage()],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...partial,
	};
}
