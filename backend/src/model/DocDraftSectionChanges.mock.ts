import type { DocDraftSectionChanges, NewDocDraftSectionChanges } from "./DocDraftSectionChanges";

export function mockDocDraftSectionChanges(overrides?: Partial<DocDraftSectionChanges>): DocDraftSectionChanges {
	return {
		id: 1,
		draftId: 1,
		docId: 1,
		changeType: "update",
		path: "/sections/0",
		content: "Original section content",
		proposed: [
			{
				for: "content",
				who: { type: "agent", id: 1 },
				description: "Update section content",
				value: "Updated section content",
				appliedAt: undefined,
			},
		],
		comments: [],
		applied: false,
		dismissed: false,
		dismissedAt: null,
		dismissedBy: null,
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		...overrides,
	};
}

export function mockNewDocDraftSectionChanges(
	overrides?: Partial<NewDocDraftSectionChanges>,
): NewDocDraftSectionChanges {
	return {
		draftId: 1,
		docId: 1,
		changeType: "update",
		path: "/sections/0",
		content: "Original section content",
		proposed: [
			{
				for: "content",
				who: { type: "agent", id: 1 },
				description: "Update section content",
				value: "Updated section content",
				appliedAt: undefined,
			},
		],
		comments: [],
		applied: false,
		dismissed: false,
		dismissedAt: null,
		dismissedBy: null,
		...overrides,
	};
}
