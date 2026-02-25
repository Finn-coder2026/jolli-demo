import type { Space } from "./Space";

export function mockSpace(partial?: Partial<Space>): Space {
	return {
		id: 1,
		name: "Default Space",
		slug: "default-space",
		jrn: "default",
		description: "Default workspace for documents",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: {
			updated: "any_time",
			creator: "",
		},
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...partial,
	};
}
