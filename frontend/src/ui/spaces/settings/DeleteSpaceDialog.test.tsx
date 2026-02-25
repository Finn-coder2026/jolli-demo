import type { SpaceContextType } from "../../../contexts/SpaceContext";
import { DeleteSpaceDialog } from "./DeleteSpaceDialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { DEFAULT_SPACE_FILTERS, type Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock SpaceContext
const mockSpaces: Array<Space> = [
	{
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: "Test description",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: DEFAULT_SPACE_FILTERS,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
	{
		id: 2,
		name: "Another Space",
		slug: "another-space",
		jrn: "space:another",
		description: "",
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: DEFAULT_SPACE_FILTERS,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
	},
];

const mockDeleteSpace = vi.fn();
const mockMigrateSpaceContent = vi.fn();

vi.mock("../../../contexts/SpaceContext", () => ({
	useSpace: () =>
		({
			currentSpace: mockSpaces[0],
			personalSpace: undefined,
			spaces: mockSpaces,
			favoriteSpaces: [],
			isLoading: false,
			error: undefined,
			switchSpace: vi.fn(),
			switchToPersonalSpace: vi.fn(),
			createSpace: vi.fn(),
			updateSpace: vi.fn(),
			deleteSpace: mockDeleteSpace,
			migrateSpaceContent: mockMigrateSpaceContent,
			refreshSpaces: vi.fn(),
			toggleSpaceFavorite: vi.fn(),
			isFavorite: vi.fn(),
		}) as SpaceContextType,
}));

describe("DeleteSpaceDialog", () => {
	const mockOnOpenChange = vi.fn();
	const mockOnDeleted = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockDeleteSpace.mockResolvedValue(undefined);
		mockMigrateSpaceContent.mockResolvedValue(undefined);
	});

	function renderDialog(open = true) {
		return render(
			<DeleteSpaceDialog
				open={open}
				onOpenChange={mockOnOpenChange}
				space={mockSpaces[0]}
				onDeleted={mockOnDeleted}
			/>,
		);
	}

	it("should render step 1 dialog when open", () => {
		renderDialog();

		expect(screen.getByTestId("delete-space-dialog")).toBeDefined();
	});

	it("should not render when closed", () => {
		renderDialog(false);

		expect(screen.queryByTestId("delete-space-dialog")).toBeNull();
	});

	it("should show radio group with move and delete options", () => {
		renderDialog();

		expect(screen.getByTestId("delete-action-radio")).toBeDefined();
	});

	it("should show target space select when move is selected", () => {
		renderDialog();

		// Move option is selected by default
		expect(screen.getByTestId("target-space-select")).toBeDefined();
	});

	it("should disable continue button when move is selected but no target", () => {
		renderDialog();

		const continueButton = screen.getByTestId("continue-delete-button");
		expect(continueButton.hasAttribute("disabled")).toBe(true);
	});

	it("should call onOpenChange when cancel is clicked", () => {
		renderDialog();

		fireEvent.click(screen.getByTestId("cancel-delete-button"));

		expect(mockOnOpenChange).toHaveBeenCalledWith(false);
	});

	it("should show continue button text", () => {
		renderDialog();

		// Verify continue button exists
		const continueButton = screen.getByTestId("continue-delete-button");
		expect(continueButton).toBeDefined();
	});

	it("should display space name in dialog title", () => {
		renderDialog();

		// Check that the dialog contains the space name
		const dialog = screen.getByTestId("delete-space-dialog");
		expect(dialog.textContent).toContain("Test Space");
	});

	it("should hide target space select when delete option is selected", () => {
		renderDialog();

		// Initially, target space select is visible (move is default)
		expect(screen.getByTestId("target-space-select")).toBeDefined();

		// Click delete radio button to switch to delete action
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);

		// Target space select should be hidden
		expect(screen.queryByTestId("target-space-select")).toBeNull();
	});

	it("should enable continue button when delete action is selected", () => {
		renderDialog();

		// Click delete radio button
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);

		// Continue button should now be enabled
		const continueButton = screen.getByTestId("continue-delete-button");
		expect(continueButton.hasAttribute("disabled")).toBe(false);
	});

	it("should show confirmation dialog when continue is clicked with delete action", () => {
		renderDialog();

		// Select delete option
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);

		// Click continue button
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Confirmation dialog should appear
		expect(screen.getByTestId("confirm-delete-dialog")).toBeDefined();
	});

	it("should disable confirm button when confirmation text does not match", () => {
		renderDialog();

		// Select delete option and proceed
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Confirm button should be disabled initially
		const confirmButton = screen.getByTestId("confirm-delete-button");
		expect(confirmButton.hasAttribute("disabled")).toBe(true);
	});

	it("should enable confirm button when confirmation text matches space name", () => {
		renderDialog();

		// Select delete option and proceed
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Type space name in confirmation input
		const input = screen.getByTestId("confirmation-input");
		fireEvent.input(input, { target: { value: "Test Space" } });

		// Confirm button should now be enabled
		const confirmButton = screen.getByTestId("confirm-delete-button");
		expect(confirmButton.hasAttribute("disabled")).toBe(false);
	});

	it("should call deleteSpace and onDeleted when confirming delete action", async () => {
		renderDialog();

		// Select delete option and proceed
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Type space name and confirm
		const input = screen.getByTestId("confirmation-input");
		fireEvent.input(input, { target: { value: "Test Space" } });
		fireEvent.click(screen.getByTestId("confirm-delete-button"));

		// Wait for async operation
		await waitFor(() => {
			// deleteContent=true when selecting "Delete all content"
			expect(mockDeleteSpace).toHaveBeenCalledWith(1, true);
			expect(mockOnDeleted).toHaveBeenCalled();
		});
	});

	it("should call migrateSpaceContent when confirming move action with target space", async () => {
		renderDialog();

		// Move is default, select a target space
		// Click on the select item for the other space (id: 2)
		const selectItems = screen
			.getAllByRole("generic")
			.filter(el => el.getAttribute("data-radix-select") === "Item");
		const targetSpaceItem = selectItems.find(el => el.getAttribute("data-value") === "2");
		if (targetSpaceItem) {
			fireEvent.click(targetSpaceItem);
		}

		// Continue to confirmation
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Check that confirmation dialog shows move message
		const confirmDialog = screen.getByTestId("confirm-delete-dialog");
		expect(confirmDialog.textContent).toContain("Another Space");

		// Type space name and confirm
		const input = screen.getByTestId("confirmation-input");
		fireEvent.input(input, { target: { value: "Test Space" } });
		fireEvent.click(screen.getByTestId("confirm-delete-button"));

		// Wait for async operation
		await waitFor(() => {
			expect(mockMigrateSpaceContent).toHaveBeenCalledWith(1, 2);
			expect(mockOnDeleted).toHaveBeenCalled();
		});
	});

	it("should handle delete error gracefully", async () => {
		mockDeleteSpace.mockRejectedValue(new Error("Delete failed"));

		renderDialog();

		// Select delete option and proceed
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Type space name and confirm
		const input = screen.getByTestId("confirmation-input");
		fireEvent.input(input, { target: { value: "Test Space" } });
		fireEvent.click(screen.getByTestId("confirm-delete-button"));

		// Wait for async operation - should not call onDeleted on error
		await waitFor(() => {
			// deleteContent=true when selecting "Delete all content"
			expect(mockDeleteSpace).toHaveBeenCalledWith(1, true);
		});

		// onDeleted should not be called on error
		expect(mockOnDeleted).not.toHaveBeenCalled();
	});

	it("should go back to selection when clicking back button in confirmation dialog", () => {
		renderDialog();

		// Select delete option and proceed
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Click back button
		fireEvent.click(screen.getByTestId("back-to-selection-button"));

		// Should be back at step 1
		expect(screen.getByTestId("delete-space-dialog")).toBeDefined();
		expect(screen.queryByTestId("confirm-delete-dialog")).toBeNull();
	});

	it("should display delete all content warning in confirmation when delete is selected", () => {
		renderDialog();

		// Select delete option and proceed
		const deleteRadio = screen.getByRole("radio", { name: /delete all content/i });
		fireEvent.click(deleteRadio);
		fireEvent.click(screen.getByTestId("continue-delete-button"));

		// Check for destructive warning text
		const confirmDialog = screen.getByTestId("confirm-delete-dialog");
		expect(confirmDialog.textContent).toContain("permanently deleted");
	});
});
