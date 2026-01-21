import { renderWithProviders } from "../../test/TestUtils";
import { DraftSelectionDialog, handleStopPropagation } from "./DraftSelectionDialog";
import { fireEvent } from "@testing-library/preact";
import type { DocDraft } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

const mockDrafts: Array<DocDraft> = [
	{
		id: 1,
		docId: undefined,
		title: "Unsaved Draft 1",
		content: "This is the content of draft 1",
		contentType: "text/markdown",
		createdBy: 100,
		createdAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T12:00:00Z",
		contentLastEditedAt: "2025-01-01T00:05:00Z",
		contentLastEditedBy: 100,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	},
	{
		id: 2,
		docId: undefined,
		title: "Unsaved Draft 2",
		content:
			"This is a much longer content for draft 2 that should be truncated in the preview because it exceeds the character limit and we want to show only a portion of it to the user in the selection dialog.",
		contentType: "text/markdown",
		createdBy: 101,
		createdAt: "2025-01-02T00:00:00Z",
		updatedAt: "2025-01-02T15:30:00Z",
		contentLastEditedAt: "2025-01-02T00:05:00Z",
		contentLastEditedBy: 101,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	},
];

describe("DraftSelectionDialog", () => {
	it("renders dialog with drafts", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		expect(getByTestId("draft-selection-dialog-backdrop")).toBeTruthy();
		expect(getByTestId("draft-selection-dialog-content")).toBeTruthy();
		expect(getByTestId("draft-option-1")).toBeTruthy();
		expect(getByTestId("draft-option-2")).toBeTruthy();
		expect(getByTestId("delete-draft-1")).toBeTruthy();
		expect(getByTestId("delete-draft-2")).toBeTruthy();
		expect(getByTestId("create-new-draft-button")).toBeTruthy();
	});

	it("calls onSelectDraft when draft is clicked", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("draft-select-button-1"));
		expect(onSelectDraft).toHaveBeenCalledWith(1);
	});

	it("calls onCreateNew when create new button is clicked", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("create-new-draft-button"));
		expect(onCreateNew).toHaveBeenCalled();
	});

	it("calls onClose when close button is clicked", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("close-dialog-button"));
		expect(onClose).toHaveBeenCalled();
	});

	it("calls onClose when backdrop is clicked", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("draft-selection-dialog-backdrop"));
		expect(onClose).toHaveBeenCalled();
	});

	it("does not call onClose when dialog content is clicked", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("draft-selection-dialog-content"));
		expect(onClose).not.toHaveBeenCalled();
	});

	it("renders draft titles and content previews", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByText } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		expect(getByText("Unsaved Draft 1")).toBeTruthy();
		expect(getByText("Unsaved Draft 2")).toBeTruthy();
	});

	it("handles empty drafts array", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();

		const { getByTestId, queryByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={[]}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		expect(getByTestId("draft-selection-dialog-content")).toBeTruthy();
		expect(queryByTestId("draft-option-1")).toBeNull();
		expect(getByTestId("create-new-draft-button")).toBeTruthy();
	});

	it("calls onDeleteDraft when delete button is clicked and confirmed", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("delete-draft-1"));
		expect(confirmSpy).toHaveBeenCalled();
		expect(onDeleteDraft).toHaveBeenCalledWith(1);
		expect(onSelectDraft).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("does not call onDeleteDraft when delete button is clicked and cancelled", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("delete-draft-1"));
		expect(confirmSpy).toHaveBeenCalled();
		expect(onDeleteDraft).not.toHaveBeenCalled();
		expect(onSelectDraft).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("delete button does not trigger draft selection", () => {
		const onSelectDraft = vi.fn();
		const onCreateNew = vi.fn();
		const onClose = vi.fn();
		const onDeleteDraft = vi.fn();
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

		const { getByTestId } = renderWithProviders(
			<DraftSelectionDialog
				drafts={mockDrafts}
				onSelectDraft={onSelectDraft}
				onCreateNew={onCreateNew}
				onClose={onClose}
				onDeleteDraft={onDeleteDraft}
			/>,
		);

		fireEvent.click(getByTestId("delete-draft-2"));
		expect(onDeleteDraft).toHaveBeenCalledWith(2);
		expect(onSelectDraft).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("handleStopPropagation stops event propagation", () => {
		const mockEvent = {
			stopPropagation: vi.fn(),
		} as unknown as React.MouseEvent;

		handleStopPropagation(mockEvent);
		expect(mockEvent.stopPropagation).toHaveBeenCalled();
	});
});
