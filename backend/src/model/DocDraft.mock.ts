import type { DocDraft, NewDocDraft } from "./DocDraft";

export function mockDocDraft(overrides?: Partial<DocDraft>): DocDraft {
	return {
		id: 1,
		docId: undefined,
		title: "Test Draft",
		content: "Test content",
		contentType: "text/markdown",
		createdBy: 1,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		contentLastEditedAt: null,
		contentLastEditedBy: 1,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: null,
		sharedBy: null,
		createdByAgent: false,
		...overrides,
	};
}

export function mockNewDocDraft(overrides?: Partial<NewDocDraft>): NewDocDraft {
	return {
		docId: undefined,
		title: "Test Draft",
		content: "Test content",
		createdBy: 1,
		...overrides,
	};
}
