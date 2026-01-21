import type { Doc } from "../types/Doc";

export function mockDoc(partial?: Partial<Doc>): Doc {
	return {
		id: 1,
		jrn: "jrn:doc:test",
		slug: "test-doc",
		path: "",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		updatedBy: "test@example.com",
		source: undefined,
		sourceMetadata: undefined,
		content: "Test content",
		contentType: "text/plain",
		contentMetadata: undefined,
		version: 1,
		spaceId: 1,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "test@example.com",
		deletedAt: undefined,
		explicitlyDeleted: false,
		...partial,
	};
}
