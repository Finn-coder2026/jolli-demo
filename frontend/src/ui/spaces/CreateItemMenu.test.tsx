import type { TreeNode } from "../../hooks/useSpaceTree";
import { CreateItemMenu } from "./CreateItemMenu";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CreateItemMenu", () => {
	const mockOnCreateFolder = vi.fn();
	const mockOnCreateDoc = vi.fn();
	const mockTreeData: Array<TreeNode> = [
		{
			doc: {
				id: 1,
				jrn: "folder:test",
				slug: "test",
				path: "",
				docType: "folder",
				contentMetadata: { title: "Test Folder" },
				parentId: undefined,
				sortOrder: 0,
				spaceId: 1,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				updatedBy: "user",
				source: undefined,
				sourceMetadata: undefined,
				content: "",
				contentType: "folder",
				createdBy: undefined,
				deletedAt: undefined,
				explicitlyDeleted: false,
				version: 1,
			},
			children: [],
			expanded: false,
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockOnCreateFolder.mockResolvedValue(undefined);
		mockOnCreateDoc.mockResolvedValue(undefined);
	});

	it("should render trigger button", () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		expect(screen.getByTestId("create-item-menu-trigger")).toBeDefined();
	});

	it("should show dropdown menu when trigger is clicked", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("create-folder-option")).toBeDefined();
			expect(screen.getByTestId("create-doc-option")).toBeDefined();
		});
	});

	it("should show folder dialog when clicking create folder option", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("create-item-dialog-content")).toBeDefined();
			expect(screen.getByTestId("create-item-name-input")).toBeDefined();
		});
	});

	it("should show doc dialog when clicking create doc option", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-doc-option"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("create-item-dialog-content")).toBeDefined();
			expect(screen.getByTestId("create-item-name-input")).toBeDefined();
		});
	});

	it("should call onCreateFolder with parentId and name when confirmed", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My Folder" } });
		});

		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockOnCreateFolder).toHaveBeenCalledWith(undefined, "My Folder");
		});
	});

	it("should call onCreateDoc with parentId, name, and contentType when confirmed", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-doc-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My Article" } });
		});

		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockOnCreateDoc).toHaveBeenCalledWith(undefined, "My Article", "text/markdown");
		});
	});

	it("should trim whitespace from name", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "  My Folder  " } });
		});

		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockOnCreateFolder).toHaveBeenCalledWith(undefined, "My Folder");
		});
	});

	it("should disable create button when name is empty", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const createButton = screen.getByTestId("create-button");
			expect(createButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should disable create button when name is only whitespace", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "   " } });
		});

		const createButton = screen.getByTestId("create-button");
		expect(createButton.hasAttribute("disabled")).toBe(true);
	});

	it("should close dialog when cancel is clicked", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("create-item-dialog-content")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("cancel-button"));

		await waitFor(() => {
			expect(screen.queryByTestId("create-item-dialog-content")).toBeNull();
		});
	});

	it("should close dialog after successful creation", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My Folder" } });
		});

		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(screen.queryByTestId("create-item-dialog-backdrop")).toBeNull();
		});
	});

	it("should submit on Enter key press", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My Folder" } });
		});

		const input = screen.getByTestId("create-item-name-input");
		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => {
			expect(mockOnCreateFolder).toHaveBeenCalledWith(undefined, "My Folder");
		});
	});

	it("should not submit on Enter when name is empty", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.keyDown(input, { key: "Enter" });
		});

		expect(mockOnCreateFolder).not.toHaveBeenCalled();
	});

	it("should reset name when opening new dialog", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		// Open folder dialog
		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));
		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		// Enter name
		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "My Folder" } });
		});

		// Cancel
		fireEvent.click(screen.getByTestId("cancel-button"));

		// Open doc dialog
		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));
		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-doc-option"));
		});

		// Name should be reset
		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input") as HTMLInputElement;
			expect(input.value).toBe("");
		});
	});

	it("should show correct placeholder for folder", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input") as HTMLInputElement;
			expect(input.placeholder).toBe("Folder name...");
		});
	});

	it("should show correct placeholder for article", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-doc-option"));
		});

		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input") as HTMLInputElement;
			expect(input.placeholder).toBe("Article title...");
		});
	});

	it("should show parent folder selector", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("parent-folder-select")).toBeDefined();
		});
	});

	it("should show content type selector for article mode", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-doc-option"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("content-type-select")).toBeDefined();
		});
	});

	it("should NOT show content type selector for folder mode", async () => {
		render(
			<CreateItemMenu
				treeData={mockTreeData}
				onCreateFolder={mockOnCreateFolder}
				onCreateDoc={mockOnCreateDoc}
			/>,
		);

		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		await waitFor(() => {
			fireEvent.click(screen.getByTestId("create-folder-option"));
		});

		await waitFor(() => {
			expect(screen.queryByTestId("content-type-select")).toBeNull();
		});
	});
});
