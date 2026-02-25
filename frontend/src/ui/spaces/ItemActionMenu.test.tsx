import { ItemActionMenu } from "./ItemActionMenu";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ItemActionMenu", () => {
	const mockOnDelete = vi.fn();
	const mockOnRename = vi.fn();
	const defaultProps = {
		itemName: "Test Document",
		isFolder: false,
		childCount: 0,
		onRename: mockOnRename,
		onDelete: mockOnDelete,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockOnDelete.mockResolvedValue(undefined);
	});

	it("should render trigger button", () => {
		render(<ItemActionMenu {...defaultProps} />);

		expect(screen.getByTestId("item-action-menu-trigger")).toBeDefined();
	});

	it("should show dropdown menu when trigger is clicked", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("delete-item-option")).toBeDefined();
		});
	});

	it("should show confirmation dialog with item name when delete option is clicked", async () => {
		render(<ItemActionMenu {...defaultProps} itemName="My Article" />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-item-option"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("delete-cancel-button")).toBeDefined();
			expect(screen.getByTestId("delete-confirm-button")).toBeDefined();
		});

		// Should not call onDelete yet
		expect(mockOnDelete).not.toHaveBeenCalled();
	});

	it("should show document description for non-folder items", async () => {
		render(<ItemActionMenu {...defaultProps} isFolder={false} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-item-option"));
		});

		await waitFor(() => {
			expect(screen.getByText(/move the document to trash/i)).toBeDefined();
		});
	});

	it("should show empty folder description for folders with no children", async () => {
		render(<ItemActionMenu {...defaultProps} isFolder={true} childCount={0} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-item-option"));
		});

		await waitFor(() => {
			expect(screen.getByText(/move the folder to trash/i)).toBeDefined();
		});
	});

	it("should show folder with contents description for folders with children", async () => {
		render(<ItemActionMenu {...defaultProps} isFolder={true} childCount={5} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-item-option"));
		});

		await waitFor(() => {
			expect(screen.getByText(/all 5 items to trash/i)).toBeDefined();
		});
	});

	it("should call onDelete when confirm button is clicked", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-item-option"));
		});

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-confirm-button"));
		});

		await waitFor(() => {
			expect(mockOnDelete).toHaveBeenCalled();
		});
	});

	it("should not call onDelete when cancel button is clicked", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-item-option"));
		});

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("delete-cancel-button"));
		});

		// Wait a bit to ensure onDelete is not called
		await new Promise(resolve => setTimeout(resolve, 100));

		expect(mockOnDelete).not.toHaveBeenCalled();
	});

	it("should display delete text in menu", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Delete")).toBeDefined();
		});
	});

	it("should have destructive styling on delete option", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			const deleteOption = screen.getByTestId("delete-item-option");
			expect(deleteOption.className).toContain("text-destructive");
		});
	});

	it("should show rename option in menu", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("rename-item-option")).toBeDefined();
			expect(screen.getByText("Rename")).toBeDefined();
		});
	});

	it("should call onRename when rename option is clicked", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("rename-item-option"));
		});

		expect(mockOnRename).toHaveBeenCalled();
	});

	it("should show Move to option when onMoveTo is provided", async () => {
		const mockOnMoveTo = vi.fn();
		render(<ItemActionMenu {...defaultProps} onMoveTo={mockOnMoveTo} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("move-to-option")).toBeDefined();
			expect(screen.getByText("Move to...")).toBeDefined();
		});
	});

	it("should not show Move to option when onMoveTo is not provided", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.queryByTestId("move-to-option")).toBeNull();
		});
	});

	it("should call onMoveTo when Move to option is clicked", async () => {
		const mockOnMoveTo = vi.fn();
		render(<ItemActionMenu {...defaultProps} onMoveTo={mockOnMoveTo} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("move-to-option"));
		});

		expect(mockOnMoveTo).toHaveBeenCalled();
	});

	it("should show New Folder and New Article options when onAddFolder is provided", async () => {
		const mockOnAddArticle = vi.fn();
		const mockOnAddFolder = vi.fn();
		render(
			<ItemActionMenu
				{...defaultProps}
				isFolder={true}
				onAddArticle={mockOnAddArticle}
				onAddFolder={mockOnAddFolder}
			/>,
		);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("add-article-option")).toBeDefined();
			expect(screen.getByTestId("add-folder-option")).toBeDefined();
		});
	});

	it("should not show New Folder/Article options when callbacks are not provided", async () => {
		render(<ItemActionMenu {...defaultProps} />);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			expect(screen.queryByTestId("add-article-option")).toBeNull();
			expect(screen.queryByTestId("add-folder-option")).toBeNull();
		});
	});

	it("should call onAddArticle when New Article option is clicked", async () => {
		const mockOnAddArticle = vi.fn();
		const mockOnAddFolder = vi.fn();
		render(
			<ItemActionMenu
				{...defaultProps}
				isFolder={true}
				onAddArticle={mockOnAddArticle}
				onAddFolder={mockOnAddFolder}
			/>,
		);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("add-article-option"));
		});

		expect(mockOnAddArticle).toHaveBeenCalled();
	});

	it("should call onAddFolder when New Folder option is clicked", async () => {
		const mockOnAddArticle = vi.fn();
		const mockOnAddFolder = vi.fn();
		render(
			<ItemActionMenu
				{...defaultProps}
				isFolder={true}
				onAddArticle={mockOnAddArticle}
				onAddFolder={mockOnAddFolder}
			/>,
		);

		fireEvent.click(screen.getByTestId("item-action-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("add-folder-option"));
		});

		expect(mockOnAddFolder).toHaveBeenCalled();
	});
});
