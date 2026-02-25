import type { TreeNode } from "../../hooks/useSpaceTree";
import { type BreadcrumbPathItem, buildBreadcrumbPath, CollapsibleBreadcrumb } from "./CollapsibleBreadcrumb";
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

function createTreeNode(doc: Doc, children: Array<TreeNode> = []): TreeNode {
	return { doc, children, expanded: true };
}

describe("buildBreadcrumbPath", () => {
	it("should return empty array for non-existent doc", () => {
		const tree: Array<TreeNode> = [];
		expect(buildBreadcrumbPath(tree, 999)).toEqual([]);
	});

	it("should return single item for root-level document", () => {
		const doc = createMockDoc({ id: 1, contentMetadata: { title: "Article" }, docType: "document" });
		const tree = [createTreeNode(doc)];

		const path = buildBreadcrumbPath(tree, 1);
		expect(path).toEqual([{ id: 1, name: "Article", type: "article" }]);
	});

	it("should return single item for root-level folder", () => {
		const folder = createMockDoc({ id: 1, contentMetadata: { title: "Folder" }, docType: "folder" });
		const tree = [createTreeNode(folder)];

		const path = buildBreadcrumbPath(tree, 1);
		expect(path).toEqual([{ id: 1, name: "Folder", type: "folder" }]);
	});

	it("should return full path for nested document", () => {
		const rootFolder = createMockDoc({ id: 1, contentMetadata: { title: "Root Folder" }, docType: "folder" });
		const childDoc = createMockDoc({
			id: 2,
			parentId: 1,
			contentMetadata: { title: "Child Article" },
			docType: "document",
		});
		const tree = [createTreeNode(rootFolder, [createTreeNode(childDoc)])];

		const path = buildBreadcrumbPath(tree, 2);
		expect(path).toEqual([
			{ id: 1, name: "Root Folder", type: "folder" },
			{ id: 2, name: "Child Article", type: "article" },
		]);
	});

	it("should return deeply nested path", () => {
		const folder1 = createMockDoc({ id: 1, contentMetadata: { title: "Level 1" }, docType: "folder" });
		const folder2 = createMockDoc({
			id: 2,
			parentId: 1,
			contentMetadata: { title: "Level 2" },
			docType: "folder",
		});
		const folder3 = createMockDoc({
			id: 3,
			parentId: 2,
			contentMetadata: { title: "Level 3" },
			docType: "folder",
		});
		const doc = createMockDoc({
			id: 4,
			parentId: 3,
			contentMetadata: { title: "Deep Article" },
			docType: "document",
		});
		const tree = [
			createTreeNode(folder1, [createTreeNode(folder2, [createTreeNode(folder3, [createTreeNode(doc)])])]),
		];

		const path = buildBreadcrumbPath(tree, 4);
		expect(path).toEqual([
			{ id: 1, name: "Level 1", type: "folder" },
			{ id: 2, name: "Level 2", type: "folder" },
			{ id: 3, name: "Level 3", type: "folder" },
			{ id: 4, name: "Deep Article", type: "article" },
		]);
	});

	it("should use 'Untitled' for docs without title", () => {
		const doc = createMockDoc({ id: 1, contentMetadata: undefined, docType: "document" });
		const tree = [createTreeNode(doc)];

		const path = buildBreadcrumbPath(tree, 1);
		expect(path).toEqual([{ id: 1, name: "Untitled", type: "article" }]);
	});
});

describe("CollapsibleBreadcrumb", () => {
	const mockOnNavigate = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render breadcrumb navigation", () => {
		const path: Array<BreadcrumbPathItem> = [{ id: 1, name: "Article", type: "article" }];

		render(
			<CollapsibleBreadcrumb
				spaceName="Test Space"
				path={path}
				sidebarCollapsed={false}
				onNavigate={mockOnNavigate}
			/>,
		);

		expect(screen.getByTestId("collapsible-breadcrumb")).toBeDefined();
	});

	describe("when sidebar is collapsed", () => {
		it("should show space name as root", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Folder", type: "folder" },
				{ id: 2, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="My Space"
					path={path}
					sidebarCollapsed={true}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-space-root")).toBeDefined();
			expect(screen.getByText("My Space")).toBeDefined();
		});

		it("should show current article as bold item", () => {
			const path: Array<BreadcrumbPathItem> = [{ id: 1, name: "My Article", type: "article" }];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={true}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-current-item")).toBeDefined();
			expect(screen.getByText("My Article")).toBeDefined();
		});
	});

	describe("when sidebar is expanded", () => {
		it("should show top-level folder as root instead of space name", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Top Folder", type: "folder" },
				{ id: 2, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-folder-root")).toBeDefined();
			expect(screen.getByText("Top Folder")).toBeDefined();
			expect(screen.queryByTestId("breadcrumb-space-root")).toBeNull();
		});

		it("should navigate when clicking the root folder", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Top Folder", type: "folder" },
				{ id: 2, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			fireEvent.click(screen.getByTestId("breadcrumb-folder-root"));
			expect(mockOnNavigate).toHaveBeenCalledWith({ id: 1, name: "Top Folder", type: "folder" });
		});
	});

	describe("with empty path", () => {
		it("should show space name as root when path is empty", () => {
			render(
				<CollapsibleBreadcrumb
					spaceName="My Space"
					path={[]}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-space-root")).toBeDefined();
			expect(screen.getByText("My Space")).toBeDefined();
		});
	});

	describe("with parent folder", () => {
		it("should show parent folder when path has 3+ items (root > parent > current)", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root Folder", type: "folder" },
				{ id: 2, name: "Parent Folder", type: "folder" },
				{ id: 3, name: "Current Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-folder-root")).toBeDefined();
			expect(screen.getByTestId("breadcrumb-parent-folder")).toBeDefined();
			expect(screen.getByTestId("breadcrumb-current-item")).toBeDefined();
		});

		it("should navigate when clicking parent folder", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root", type: "folder" },
				{ id: 2, name: "Parent", type: "folder" },
				{ id: 3, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			fireEvent.click(screen.getByTestId("breadcrumb-parent-folder"));
			expect(mockOnNavigate).toHaveBeenCalledWith({ id: 2, name: "Parent", type: "folder" });
		});
	});

	describe("with collapsed folders (ellipsis dropdown)", () => {
		it("should show ellipsis when path has 4+ items", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root", type: "folder" },
				{ id: 2, name: "Middle1", type: "folder" },
				{ id: 3, name: "Parent", type: "folder" },
				{ id: 4, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-ellipsis")).toBeDefined();
		});

		it("should open dropdown when clicking ellipsis", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root", type: "folder" },
				{ id: 2, name: "Middle", type: "folder" },
				{ id: 3, name: "Parent", type: "folder" },
				{ id: 4, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			// Initially dropdown is hidden
			expect(screen.queryByTestId("breadcrumb-ellipsis-dropdown")).toBeNull();

			// Click ellipsis to open
			fireEvent.click(screen.getByTestId("breadcrumb-ellipsis"));
			expect(screen.getByTestId("breadcrumb-ellipsis-dropdown")).toBeDefined();
		});

		it("should show collapsed folders in dropdown and navigate on click", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root", type: "folder" },
				{ id: 2, name: "Middle1", type: "folder" },
				{ id: 3, name: "Middle2", type: "folder" },
				{ id: 4, name: "Parent", type: "folder" },
				{ id: 5, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			// Open dropdown
			fireEvent.click(screen.getByTestId("breadcrumb-ellipsis"));

			// Should have two collapsed folders: Middle1 and Middle2
			expect(screen.getByTestId("breadcrumb-collapsed-folder-2")).toBeDefined();
			expect(screen.getByTestId("breadcrumb-collapsed-folder-3")).toBeDefined();

			// Click Middle1
			fireEvent.click(screen.getByTestId("breadcrumb-collapsed-folder-2"));
			expect(mockOnNavigate).toHaveBeenCalledWith({ id: 2, name: "Middle1", type: "folder" });
		});

		it("should close dropdown when clicking outside", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root", type: "folder" },
				{ id: 2, name: "Middle", type: "folder" },
				{ id: 3, name: "Parent", type: "folder" },
				{ id: 4, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			// Open dropdown
			fireEvent.click(screen.getByTestId("breadcrumb-ellipsis"));
			expect(screen.getByTestId("breadcrumb-ellipsis-dropdown")).toBeDefined();

			// Click outside (mousedown on document body)
			fireEvent.mouseDown(document.body);
			expect(screen.queryByTestId("breadcrumb-ellipsis-dropdown")).toBeNull();
		});

		it("should close dropdown after navigating to a collapsed folder", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Root", type: "folder" },
				{ id: 2, name: "Middle", type: "folder" },
				{ id: 3, name: "Parent", type: "folder" },
				{ id: 4, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			// Open dropdown
			fireEvent.click(screen.getByTestId("breadcrumb-ellipsis"));
			expect(screen.getByTestId("breadcrumb-ellipsis-dropdown")).toBeDefined();

			// Click a folder
			fireEvent.click(screen.getByTestId("breadcrumb-collapsed-folder-2"));

			// Dropdown should close
			expect(screen.queryByTestId("breadcrumb-ellipsis-dropdown")).toBeNull();
		});
	});

	describe("with sidebar collapsed and deep path", () => {
		it("should show space name as root with all remaining items", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Folder1", type: "folder" },
				{ id: 2, name: "Folder2", type: "folder" },
				{ id: 3, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="My Space"
					path={path}
					sidebarCollapsed={true}
					onNavigate={mockOnNavigate}
				/>,
			);

			// Should show space name as root
			expect(screen.getByTestId("breadcrumb-space-root")).toBeDefined();
			expect(screen.getByText("My Space")).toBeDefined();

			// Should show parent folder and current item
			expect(screen.getByTestId("breadcrumb-parent-folder")).toBeDefined();
			expect(screen.getByTestId("breadcrumb-current-item")).toBeDefined();
		});
	});

	describe("single article without folders", () => {
		it("should show space as root and article as current when sidebar collapsed", () => {
			const path: Array<BreadcrumbPathItem> = [{ id: 1, name: "Article", type: "article" }];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={true}
					onNavigate={mockOnNavigate}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-space-root")).toBeDefined();
			expect(screen.getByTestId("breadcrumb-current-item")).toBeDefined();
		});

		it("should show article as current item when sidebar expanded and article is at root level", () => {
			const path: Array<BreadcrumbPathItem> = [{ id: 1, name: "Article", type: "article" }];

			render(
				<CollapsibleBreadcrumb
					spaceName="Space"
					path={path}
					sidebarCollapsed={false}
					onNavigate={mockOnNavigate}
				/>,
			);

			// A root-level article should NOT be shown as a folder root —
			// it should only appear as the current item
			expect(screen.queryByTestId("breadcrumb-folder-root")).toBeNull();
			expect(screen.getByTestId("breadcrumb-current-item")).toBeDefined();
		});
	});

	it("should not render navigation elements when no onNavigate provided", () => {
		const path: Array<BreadcrumbPathItem> = [
			{ id: 1, name: "Folder", type: "folder" },
			{ id: 2, name: "Article", type: "article" },
		];

		// Should render without errors even when onNavigate is undefined
		const { container } = render(<CollapsibleBreadcrumb spaceName="Space" path={path} sidebarCollapsed={false} />);

		expect(container.querySelector("nav")).toBeDefined();
	});

	describe("hideSpaceName prop", () => {
		it("should hide space root when hideSpaceName is true and sidebar is collapsed", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Folder", type: "folder" },
				{ id: 2, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="My Space"
					path={path}
					sidebarCollapsed={true}
					onNavigate={mockOnNavigate}
					hideSpaceName
				/>,
			);

			// Space root should be hidden
			expect(screen.queryByTestId("breadcrumb-space-root")).toBeNull();
			// Should show the folder as root instead
			expect(screen.getByTestId("breadcrumb-folder-root")).toBeDefined();
			expect(screen.getByText("Folder")).toBeDefined();
		});

		it("should show space root when hideSpaceName is false and sidebar is collapsed", () => {
			const path: Array<BreadcrumbPathItem> = [
				{ id: 1, name: "Folder", type: "folder" },
				{ id: 2, name: "Article", type: "article" },
			];

			render(
				<CollapsibleBreadcrumb
					spaceName="My Space"
					path={path}
					sidebarCollapsed={true}
					onNavigate={mockOnNavigate}
					hideSpaceName={false}
				/>,
			);

			expect(screen.getByTestId("breadcrumb-space-root")).toBeDefined();
			expect(screen.getByText("My Space")).toBeDefined();
		});
	});
});
