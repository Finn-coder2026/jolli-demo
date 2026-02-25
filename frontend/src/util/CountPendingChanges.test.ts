import { countPendingChanges } from "./SuggestionEvents";
import type { DocDraftSectionChanges } from "jolli-common";
import { describe, expect, it } from "vitest";

/** Minimal factory for DocDraftSectionChanges test fixtures. */
function makeChange(overrides: Partial<DocDraftSectionChanges> = {}): DocDraftSectionChanges {
	return {
		id: 1,
		draftId: 1,
		changeType: "update",
		sectionTitle: "Section",
		content: "content",
		applied: false,
		dismissed: false,
		proposed: [],
		createdAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T00:00:00Z",
		...overrides,
	} as DocDraftSectionChanges;
}

describe("countPendingChanges", () => {
	it("returns 0 for an empty array", () => {
		expect(countPendingChanges([])).toBe(0);
	});

	it("counts changes that are neither applied nor dismissed", () => {
		const changes = [
			makeChange({ id: 1, applied: false, dismissed: false }),
			makeChange({ id: 2, applied: false, dismissed: false }),
			makeChange({ id: 3, applied: false, dismissed: false }),
		];
		expect(countPendingChanges(changes)).toBe(3);
	});

	it("excludes applied changes", () => {
		const changes = [
			makeChange({ id: 1, applied: true, dismissed: false }),
			makeChange({ id: 2, applied: false, dismissed: false }),
		];
		expect(countPendingChanges(changes)).toBe(1);
	});

	it("excludes dismissed changes", () => {
		const changes = [
			makeChange({ id: 1, applied: false, dismissed: true }),
			makeChange({ id: 2, applied: false, dismissed: false }),
		];
		expect(countPendingChanges(changes)).toBe(1);
	});

	it("excludes changes that are both applied and dismissed", () => {
		const changes = [
			makeChange({ id: 1, applied: true, dismissed: true }),
			makeChange({ id: 2, applied: false, dismissed: false }),
		];
		expect(countPendingChanges(changes)).toBe(1);
	});

	it("returns 0 when all changes are applied or dismissed", () => {
		const changes = [
			makeChange({ id: 1, applied: true, dismissed: false }),
			makeChange({ id: 2, applied: false, dismissed: true }),
			makeChange({ id: 3, applied: true, dismissed: true }),
		];
		expect(countPendingChanges(changes)).toBe(0);
	});
});
