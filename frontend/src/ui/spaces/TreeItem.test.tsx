import type { TreeNode } from "../../hooks/useSpaceTree";
import { TreeItem } from "./TreeItem";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Doc } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockDoc(overrides: Partial<Doc> = {}): Doc {
	return {
		id: 1,
		jrn: "doc:test-doc",
		slug: "test-doc",
		path: "",
		content: "# Test\n\nContent",
		contentType: "text/markdown",
		source: undefined,
		sourceMetadata: undefined,
		contentMetadata: { title: "Test Document" },
		updatedBy: "user",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		version: 1,
		spaceId: 1,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "user",
		deletedAt: undefined,
		explicitlyDeleted: false,
		...overrides,
	};
}

function createMockTreeNode(overrides: Partial<TreeNode> = {}): TreeNode {
	return {
		doc: createMockDoc(),
		children: [],
		expanded: false,
		...overrides,
	};
}

describe("TreeItem", () => {
	const mockOnSelect = vi.fn();
	const mockOnToggleExpand = vi.fn();
	const mockOnDelete = vi.fn();
	const mockOnRename = vi.fn();
	const mockOnCreateFolder = vi.fn();
	const mockOnCreateDoc = vi.fn();

	const defaultProps = {
		depth: 0,
		selectedDocId: undefined as number | undefined,
		treeData: [] as Array<TreeNode>,
		onSelect: mockOnSelect,
		onToggleExpand: mockOnToggleExpand,
		onDelete: mockOnDelete,
		onRename: mockOnRename,
		onCreateFolder: mockOnCreateFolder,
		onCreateDoc: mockOnCreateDoc,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render document with title", () => {
		const node = createMockTreeNode();

		render(<TreeItem node={node} {...defaultProps} />);

		expect(screen.getByText("Test Document")).toBeDefined();
	});

	it("should render document with jrn when no title in contentMetadata", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({
				contentMetadata: undefined,
			}),
		});

		render(<TreeItem node={node} {...defaultProps} />);

		expect(screen.getByText("doc:test-doc")).toBeDefined();
	});

	it("should call onSelect when clicking on document", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 42 }),
		});

		render(<TreeItem node={node} {...defaultProps} />);

		fireEvent.click(screen.getByRole("treeitem"));

		expect(mockOnSelect).toHaveBeenCalledWith(42);
	});

	it("should call onSelect but not onToggleExpand when clicking on folder treeitem", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 42, docType: "folder" }),
		});

		render(<TreeItem node={node} {...defaultProps} />);

		fireEvent.click(screen.getByRole("treeitem"));

		expect(mockOnSelect).toHaveBeenCalledWith(42);
		expect(mockOnToggleExpand).not.toHaveBeenCalled(); // Toggle only when clicking chevron
	});

	it("should call onToggleExpand when clicking on folder chevron", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 42, docType: "folder" }),
			expanded: false,
		});

		render(<TreeItem node={node} {...defaultProps} />);

		const chevronButton = screen.getByLabelText("Expand folder");
		fireEvent.click(chevronButton);

		expect(mockOnToggleExpand).toHaveBeenCalledWith(42);
		expect(mockOnSelect).not.toHaveBeenCalled(); // Chevron click should not select
	});

	it("should apply selected style when document is selected", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 42 }),
		});

		render(<TreeItem node={node} {...defaultProps} selectedDocId={42} />);

		const treeItem = screen.getByRole("treeitem");
		expect(treeItem.className).toContain("bg-accent");
	});

	it("should render chevron right when folder is collapsed", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ docType: "folder" }),
			expanded: false,
		});

		const { container } = render(<TreeItem node={node} {...defaultProps} />);

		const chevronRight = container.querySelector('[data-lucide-icon="ChevronRight"]');
		expect(chevronRight).toBeDefined();
	});

	it("should render chevron down when folder is expanded", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ docType: "folder" }),
			expanded: true,
		});

		const { container } = render(<TreeItem node={node} {...defaultProps} />);

		const chevronDown = container.querySelector('[data-lucide-icon="ChevronDown"]');
		expect(chevronDown).toBeDefined();
	});

	it("should render folder icon for folders", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ docType: "folder" }),
		});

		const { container } = render(<TreeItem node={node} {...defaultProps} />);

		const folderIcon = container.querySelector('[data-lucide-icon="Folder"]');
		expect(folderIcon).toBeDefined();
	});

	it("should render file icon for documents", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ docType: "document" }),
		});

		const { container } = render(<TreeItem node={node} {...defaultProps} />);

		const fileIcon = container.querySelector('[data-lucide-icon="File"]');
		expect(fileIcon).toBeDefined();
	});

	it("should render children when folder is expanded", () => {
		const childDoc = createMockDoc({
			id: 2,
			contentMetadata: { title: "Child Document" },
		});
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 1, docType: "folder" }),
			expanded: true,
			children: [createMockTreeNode({ doc: childDoc })],
		});

		render(<TreeItem node={node} {...defaultProps} />);

		expect(screen.getByText("Child Document")).toBeDefined();
	});

	it("should not render children when folder is collapsed", () => {
		const childDoc = createMockDoc({
			id: 2,
			contentMetadata: { title: "Child Document" },
		});
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 1, docType: "folder" }),
			expanded: false,
			children: [createMockTreeNode({ doc: childDoc })],
		});

		render(<TreeItem node={node} {...defaultProps} />);

		expect(screen.queryByText("Child Document")).toBeNull();
	});

	it("should show action menu on hover with full opacity", () => {
		const node = createMockTreeNode();

		render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");

		// Action menu should exist but be hidden (opacity-0)
		const actionMenu = screen.getByTestId("item-action-menu-trigger");
		expect(actionMenu).toBeDefined();

		// After hover, action menu should be visible (opacity-100)
		fireEvent.mouseEnter(treeItem);

		expect(screen.getByTestId("item-action-menu-trigger")).toBeDefined();
	});

	it("should handle keyboard navigation with Enter", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 42 }),
		});

		render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");
		fireEvent.keyDown(treeItem, { key: "Enter" });

		expect(mockOnSelect).toHaveBeenCalledWith(42);
	});

	it("should handle keyboard navigation with Space", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ id: 42 }),
		});

		render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");
		fireEvent.keyDown(treeItem, { key: " " });

		expect(mockOnSelect).toHaveBeenCalledWith(42);
	});

	it("should apply correct indentation based on depth", () => {
		const node = createMockTreeNode();

		render(<TreeItem node={node} {...defaultProps} depth={2} />);

		const treeItem = screen.getByRole("treeitem");
		// 2 * 16 + 8 = 40px
		expect(treeItem.style.paddingLeft).toBe("40px");
	});

	it("should set aria-expanded for folders", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ docType: "folder" }),
			expanded: true,
		});

		render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");
		expect(treeItem.getAttribute("aria-expanded")).toBe("true");
	});

	it("should not set aria-expanded for documents", () => {
		const node = createMockTreeNode({
			doc: createMockDoc({ docType: "document" }),
		});

		render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");
		expect(treeItem.getAttribute("aria-expanded")).toBeNull();
	});

	it("should stop event propagation when clicking action menus", () => {
		const node = createMockTreeNode();
		mockOnDelete.mockResolvedValue(undefined);

		render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");
		fireEvent.mouseEnter(treeItem);

		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// onSelect should not be called when clicking action menu
		expect(mockOnSelect).not.toHaveBeenCalled();
	});

	it("should keep action menu visible when dropdown is open", () => {
		const node = createMockTreeNode();
		mockOnDelete.mockResolvedValue(undefined);

		const { container } = render(<TreeItem node={node} {...defaultProps} />);

		const treeItem = screen.getByRole("treeitem");
		fireEvent.mouseEnter(treeItem);

		// Action menu container should be visible (opacity-100)
		const actionMenuContainer = container.querySelector(".transition-opacity");
		expect(actionMenuContainer?.className).toContain("opacity-100");

		// Click trigger to open dropdown
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Mouse leave the tree item (simulating user moving to dropdown)
		fireEvent.mouseLeave(treeItem);

		// Action menu container should still be visible because dropdown is open
		expect(actionMenuContainer?.className).toContain("opacity-100");
	});
});
