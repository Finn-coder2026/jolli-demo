import { renderWithProviders } from "../../test/TestUtils";
import { EditHistoryItem } from "./EditHistoryItem";
import type { DocDraftEditHistoryEntry } from "jolli-common";
import { describe, expect, it } from "vitest";

const mockHistoryEntry: DocDraftEditHistoryEntry = {
	id: 1,
	draftId: 100,
	userId: 42,
	editType: "content",
	description: "Updated the introduction section",
	editedAt: "2025-01-15T10:30:00Z",
};

describe("EditHistoryItem", () => {
	it("displays edit type label for content edit", () => {
		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={mockHistoryEntry} />);

		expect(getByTestId("edit-history-item")).toBeTruthy();
		expect(getByTestId("edit-history-item").textContent).toContain("Content edited");
	});

	it("displays edit type label for title change", () => {
		const entry: DocDraftEditHistoryEntry = {
			...mockHistoryEntry,
			editType: "title",
		};

		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={entry} />);

		expect(getByTestId("edit-history-item").textContent).toContain("Title changed");
	});

	it("displays edit type label for section apply", () => {
		const entry: DocDraftEditHistoryEntry = {
			...mockHistoryEntry,
			editType: "section_apply",
		};

		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={entry} />);

		expect(getByTestId("edit-history-item").textContent).toContain("Applied suggestion");
	});

	it("displays edit type label for section dismiss", () => {
		const entry: DocDraftEditHistoryEntry = {
			...mockHistoryEntry,
			editType: "section_dismiss",
		};

		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={entry} />);

		expect(getByTestId("edit-history-item").textContent).toContain("Dismissed suggestion");
	});

	it("displays raw edit type for unknown types", () => {
		// Use type assertion to test the default case in getEditTypeLabel
		const entry = {
			...mockHistoryEntry,
			editType: "unknown_type",
		} as unknown as DocDraftEditHistoryEntry;

		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={entry} />);

		expect(getByTestId("edit-history-item").textContent).toContain("unknown_type");
	});

	it("displays user avatar", () => {
		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={mockHistoryEntry} />);

		// UserAvatar component should be rendered with userId-based testid
		expect(getByTestId("user-avatar-42")).toBeTruthy();
	});

	it("displays description when present", () => {
		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={mockHistoryEntry} />);

		expect(getByTestId("edit-history-description")).toBeTruthy();
		expect(getByTestId("edit-history-description").textContent).toContain("Updated the introduction section");
	});

	it("hides description when empty", () => {
		const entryWithoutDescription: DocDraftEditHistoryEntry = {
			...mockHistoryEntry,
			description: "",
		};

		const { queryByTestId } = renderWithProviders(<EditHistoryItem entry={entryWithoutDescription} />);

		expect(queryByTestId("edit-history-description")).toBeNull();
	});

	it("displays formatted timestamp", () => {
		const { getByTestId } = renderWithProviders(<EditHistoryItem entry={mockHistoryEntry} />);

		expect(getByTestId("edit-history-timestamp")).toBeTruthy();
		// Timestamp should be displayed (exact format depends on locale)
		expect(getByTestId("edit-history-timestamp").textContent).toBeTruthy();
	});
});
