import { CreateItemDialog, type FolderOption } from "./CreateItemDialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CreateItemDialog", () => {
	const mockOnConfirm = vi.fn();
	const mockOnClose = vi.fn();
	const mockFolders: Array<FolderOption> = [
		{ id: 1, name: "Folder A", depth: 0 },
		{ id: 2, name: "Folder B", depth: 0 },
		{ id: 3, name: "Subfolder", depth: 1 },
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("folder mode", () => {
		it("should render with folder title", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByText("New Folder")).toBeDefined();
		});

		it("should show folder subtitle", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByText("Enter a name for your new folder")).toBeDefined();
		});

		it("should show folder placeholder", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input") as HTMLInputElement;
			expect(input.placeholder).toBe("Folder name...");
		});

		it("should NOT show content type selector", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.queryByTestId("content-type-select")).toBeNull();
		});

		it("should call onConfirm with folder params", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My New Folder" } });

			fireEvent.click(screen.getByTestId("create-button"));

			expect(mockOnConfirm).toHaveBeenCalledWith({
				name: "My New Folder",
				parentId: undefined,
			});
		});
	});

	describe("article mode", () => {
		it("should render with article title", () => {
			render(
				<CreateItemDialog
					mode="article"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByText("New Article")).toBeDefined();
		});

		it("should show article subtitle", () => {
			render(
				<CreateItemDialog
					mode="article"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByText("Enter a name for your new article")).toBeDefined();
		});

		it("should show article placeholder", () => {
			render(
				<CreateItemDialog
					mode="article"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input") as HTMLInputElement;
			expect(input.placeholder).toBe("Article title...");
		});

		it("should show content type selector", () => {
			render(
				<CreateItemDialog
					mode="article"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByTestId("content-type-select")).toBeDefined();
		});

		it("should call onConfirm with article params including contentType", () => {
			render(
				<CreateItemDialog
					mode="article"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My New Article" } });

			fireEvent.click(screen.getByTestId("create-button"));

			expect(mockOnConfirm).toHaveBeenCalledWith({
				name: "My New Article",
				parentId: undefined,
				contentType: "text/markdown",
			});
		});
	});

	describe("parent folder selection", () => {
		it("should show parent folder selector", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByTestId("parent-folder-select")).toBeDefined();
		});

		it("should default to root folder", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			expect(screen.getByText("(Root)")).toBeDefined();
		});

		it("should use defaultParentId when provided", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					defaultParentId={1}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "Test" } });

			fireEvent.click(screen.getByTestId("create-button"));

			expect(mockOnConfirm).toHaveBeenCalledWith({
				name: "Test",
				parentId: 1,
			});
		});
	});

	describe("dialog interactions", () => {
		it("should close when clicking cancel button", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			fireEvent.click(screen.getByTestId("cancel-button"));

			expect(mockOnClose).toHaveBeenCalled();
		});

		it("should call onClose when dialog overlay is clicked", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			// Find and click the dialog overlay to trigger onOpenChange(false)
			const overlay = screen.getByTestId("dialog-overlay");
			fireEvent.click(overlay);

			// Verify that onClose was called via handleOpenChange
			expect(mockOnClose).toHaveBeenCalled();
		});

		it("should submit on Enter key when name is valid", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "Test Folder" } });
			fireEvent.keyDown(input, { key: "Enter" });

			expect(mockOnConfirm).toHaveBeenCalled();
		});

		it("should NOT submit on Enter key when name is empty", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.keyDown(input, { key: "Enter" });

			expect(mockOnConfirm).not.toHaveBeenCalled();
		});
	});

	describe("validation", () => {
		it("should disable create button when name is empty", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const createButton = screen.getByTestId("create-button");
			expect(createButton.hasAttribute("disabled")).toBe(true);
		});

		it("should disable create button when name is only whitespace", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "   " } });

			const createButton = screen.getByTestId("create-button");
			expect(createButton.hasAttribute("disabled")).toBe(true);
		});

		it("should trim whitespace from name", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "  Test Folder  " } });

			fireEvent.click(screen.getByTestId("create-button"));

			expect(mockOnConfirm).toHaveBeenCalledWith({
				name: "Test Folder",
				parentId: undefined,
			});
		});

		it("should show error for invalid characters and not call onConfirm", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "test/folder" } });
			fireEvent.click(screen.getByTestId("create-button"));

			expect(screen.getByTestId("create-error-message")).toBeDefined();
			expect(mockOnConfirm).not.toHaveBeenCalled();
		});

		it("should show error for backslash in name", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "test\\folder" } });
			fireEvent.click(screen.getByTestId("create-button"));

			expect(screen.getByTestId("create-error-message")).toBeDefined();
			expect(mockOnConfirm).not.toHaveBeenCalled();
		});

		it("should show error for colon in name", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "test:folder" } });
			fireEvent.click(screen.getByTestId("create-button"));

			expect(screen.getByTestId("create-error-message")).toBeDefined();
			expect(mockOnConfirm).not.toHaveBeenCalled();
		});

		it("should clear error when user types after error", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			// First, trigger an error
			fireEvent.input(input, { target: { value: "test/folder" } });
			fireEvent.click(screen.getByTestId("create-button"));
			expect(screen.getByTestId("create-error-message")).toBeDefined();

			// Then type to clear the error
			fireEvent.input(input, { target: { value: "valid folder" } });
			expect(screen.queryByTestId("create-error-message")).toBeNull();
		});

		it("should show empty error when Enter pressed on empty name", () => {
			render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			const input = screen.getByTestId("create-item-name-input");
			// Type something and then clear it to enable the button would not work
			// since button is disabled. Instead we test via Enter key when name is whitespace
			fireEvent.input(input, { target: { value: "   " } });
			// Button is disabled for whitespace, so test Enter key path
			fireEvent.keyDown(input, { key: "Enter" });

			// Error should be shown
			expect(screen.getByTestId("create-error-message")).toBeDefined();
			expect(mockOnConfirm).not.toHaveBeenCalled();
		});

		it("should reset error when dialog reopens", () => {
			const { rerender } = render(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			// Trigger an error
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "test/folder" } });
			fireEvent.click(screen.getByTestId("create-button"));
			expect(screen.getByTestId("create-error-message")).toBeDefined();

			// Close and reopen dialog
			rerender(
				<CreateItemDialog
					mode="folder"
					open={false}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);
			rerender(
				<CreateItemDialog
					mode="folder"
					open={true}
					folders={mockFolders}
					onConfirm={mockOnConfirm}
					onClose={mockOnClose}
				/>,
			);

			// Error should be cleared
			expect(screen.queryByTestId("create-error-message")).toBeNull();
		});
	});
});
