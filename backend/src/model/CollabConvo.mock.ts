import type { CollabConvo, CollabMessage, NewCollabConvo } from "./CollabConvo";

export function mockCollabMessage(overrides?: Partial<CollabMessage>): CollabMessage {
	return {
		role: "user",
		content: "Test message",
		userId: 1,
		timestamp: "2025-01-01T00:00:00Z",
		...overrides,
	} as CollabMessage;
}

export function mockCollabConvo(overrides?: Partial<CollabConvo>): CollabConvo {
	return {
		id: 1,
		artifactType: "doc_draft",
		artifactId: 1,
		title: null,
		messages: [],
		metadata: null,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		...overrides,
	};
}

export function mockNewCollabConvo(overrides?: Partial<NewCollabConvo>): NewCollabConvo {
	return {
		artifactType: "doc_draft",
		artifactId: 1,
		messages: [],
		metadata: null,
		...overrides,
	};
}
