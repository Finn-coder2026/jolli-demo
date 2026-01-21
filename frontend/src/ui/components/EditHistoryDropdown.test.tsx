import { renderWithProviders } from "../../test/TestUtils";
import { EditHistoryDropdown } from "./EditHistoryDropdown";
import { fireEvent, waitFor } from "@testing-library/preact";
import type { DocDraftEditHistoryEntry } from "jolli-common";
import { describe, expect, it } from "vitest";

const mockHistoryEntries: Array<DocDraftEditHistoryEntry> = [
	{
		id: 1,
		draftId: 100,
		userId: 42,
		editType: "content",
		description: "Updated introduction",
		editedAt: "2025-01-15T10:30:00Z",
	},
	{
		id: 2,
		draftId: 100,
		userId: 43,
		editType: "title",
		description: "Changed title to Guide",
		editedAt: "2025-01-15T11:00:00Z",
	},
	{
		id: 3,
		draftId: 100,
		userId: 42,
		editType: "section_apply",
		description: "Applied AI suggestion",
		editedAt: "2025-01-15T11:30:00Z",
	},
];

describe("EditHistoryDropdown", () => {
	it("displays history button", () => {
		const { getByTestId } = renderWithProviders(<EditHistoryDropdown history={[]} />);

		expect(getByTestId("history-button")).toBeTruthy();
		expect(getByTestId("history-button").textContent).toContain("History");
	});

	it("shows empty state when no history", async () => {
		const { getByTestId } = renderWithProviders(<EditHistoryDropdown history={[]} />);

		// Click to open dropdown
		fireEvent.click(getByTestId("history-button"));

		await waitFor(() => {
			expect(getByTestId("history-dropdown-content")).toBeTruthy();
			expect(getByTestId("history-empty-state")).toBeTruthy();
			expect(getByTestId("history-empty-state").textContent).toContain("No edit history yet");
		});
	});

	it("displays history items when history exists", async () => {
		const { getByTestId, getAllByTestId } = renderWithProviders(
			<EditHistoryDropdown history={mockHistoryEntries} />,
		);

		// Click to open dropdown
		fireEvent.click(getByTestId("history-button"));

		await waitFor(() => {
			const items = getAllByTestId("edit-history-item");
			expect(items.length).toBe(3);
		});
	});

	it("limits items to maxItems prop", async () => {
		const { getByTestId, getAllByTestId } = renderWithProviders(
			<EditHistoryDropdown history={mockHistoryEntries} maxItems={2} />,
		);

		// Click to open dropdown
		fireEvent.click(getByTestId("history-button"));

		await waitFor(() => {
			const items = getAllByTestId("edit-history-item");
			expect(items.length).toBe(2);
		});
	});

	it("uses default maxItems of 10", async () => {
		// Create 15 entries
		const manyEntries: Array<DocDraftEditHistoryEntry> = Array.from({ length: 15 }, (_, i) => ({
			id: i + 1,
			draftId: 100,
			userId: 42,
			editType: "content" as const,
			description: `Edit ${i + 1}`,
			editedAt: `2025-01-15T${String(10 + i).padStart(2, "0")}:00:00Z`,
		}));

		const { getByTestId, getAllByTestId } = renderWithProviders(<EditHistoryDropdown history={manyEntries} />);

		// Click to open dropdown
		fireEvent.click(getByTestId("history-button"));

		await waitFor(() => {
			const items = getAllByTestId("edit-history-item");
			expect(items.length).toBe(10); // Default maxItems
		});
	});

	it("displays items in order provided", async () => {
		const { getByTestId, getAllByTestId } = renderWithProviders(
			<EditHistoryDropdown history={mockHistoryEntries} />,
		);

		// Click to open dropdown
		fireEvent.click(getByTestId("history-button"));

		await waitFor(() => {
			const items = getAllByTestId("edit-history-item");
			// First item should be "Content edited" (from first entry)
			expect(items[0].textContent).toContain("Content edited");
			// Second item should be "Title changed" (from second entry)
			expect(items[1].textContent).toContain("Title changed");
		});
	});
});
