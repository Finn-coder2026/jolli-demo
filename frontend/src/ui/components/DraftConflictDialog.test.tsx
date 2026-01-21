import { DraftConflictDialog } from "./DraftConflictDialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { DocDraft } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DraftConflictDialog", () => {
	const mockOnJoinCollaboration = vi.fn();
	const mockOnClose = vi.fn();

	const mockConflictingDraft: DocDraft = {
		id: 42,
		docId: undefined,
		title: "Existing Draft Title",
		content: "This draft already exists",
		contentType: "text/markdown",
		createdBy: 100,
		createdAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T12:00:00Z",
		contentLastEditedAt: "2025-01-01T12:00:00Z",
		contentLastEditedBy: 100,
		contentMetadata: undefined,
		isShared: false,
		sharedAt: undefined,
		sharedBy: undefined,
		createdByAgent: false,
	};

	beforeEach(() => {
		mockOnJoinCollaboration.mockClear();
		mockOnClose.mockClear();
	});

	it("renders dialog with title and description", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Draft Already Exists")).toBeDefined();
		expect(screen.getByText(/A draft named "Existing Draft Title" already exists/)).toBeDefined();
	});

	it("renders the conflicting draft information", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByText("Existing Draft")).toBeDefined();
		expect(screen.getByText("Existing Draft Title")).toBeDefined();
		expect(screen.getByText("Created by")).toBeDefined();
	});

	it("calls onJoinCollaboration when join button is clicked", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		const joinButton = screen.getByTestId("join-collaboration-button");
		fireEvent.click(joinButton);

		expect(mockOnJoinCollaboration).toHaveBeenCalledWith(42);
	});

	it("calls onClose when close button is clicked", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		const closeButton = screen.getByTestId("close-dialog-button");
		fireEvent.click(closeButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("calls onClose when cancel button is clicked", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		const cancelButton = screen.getByTestId("cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("calls onClose when backdrop is clicked", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		const backdrop = screen.getByTestId("draft-conflict-dialog-backdrop");
		fireEvent.click(backdrop);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("does not close when dialog content is clicked", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		const content = screen.getByTestId("draft-conflict-dialog-content");
		fireEvent.click(content);

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("renders Join Collaboration button with icon", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		const joinButton = screen.getByTestId("join-collaboration-button");
		expect(joinButton.textContent).toContain("Join Collaboration");
	});

	it("does not have a Create Anyway button", () => {
		render(
			<DraftConflictDialog
				conflictingDraft={mockConflictingDraft}
				onJoinCollaboration={mockOnJoinCollaboration}
				onClose={mockOnClose}
			/>,
		);

		// Per requirements, there should be no "Create Anyway" option
		expect(screen.queryByText("Create Anyway")).toBeNull();
		expect(screen.queryByText("Create New Anyway")).toBeNull();
		expect(screen.queryByTestId("create-anyway-button")).toBeNull();
	});
});
