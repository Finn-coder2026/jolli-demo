import type { Space } from "./Space";

export function mockSpace(partial?: Partial<Space>): Space {
	return {
		id: 0,
		name: "Test Space",
		slug: "test-space",
		jrn: "test-space",
		description: undefined,
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		deletedAt: undefined,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}
