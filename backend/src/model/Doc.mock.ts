import type { Doc } from "./Doc";

export function mockDoc(partial?: Partial<Doc>): Doc {
	return {
		id: 0,
		jrn: "",
		slug: "",
		path: "",
		createdAt: new Date(0),
		updatedAt: new Date(0),
		updatedBy: "",
		source: undefined,
		sourceMetadata: undefined,
		content: "",
		contentType: "text/markdown",
		contentMetadata: undefined,
		version: 1,
		// Space hierarchy fields
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: undefined,
		deletedAt: undefined,
		explicitlyDeleted: false,
		...partial,
	};
}
