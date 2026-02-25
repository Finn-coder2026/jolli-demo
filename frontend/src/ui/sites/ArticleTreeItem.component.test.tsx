import { ArticleTreeItem, type ArticleTreeNode, computeFolderStats, type FolderStats } from "./ArticleTreeItem";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Doc } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Mock lucide-react icons with data-testid for assertion
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Check: () => <div data-testid="check-icon" />,
		Minus: () => <div data-testid="minus-icon" />,
		ChevronDown: () => <div data-testid="chevron-down" />,
		ChevronRight: () => <div data-testid="chevron-right" />,
		FileText: () => <div data-testid="file-text-icon" />,
		Folder: () => <div data-testid="folder-icon" />,
		FolderOpen: () => <div data-testid="folder-open-icon" />,
	};
});

/** Creates a minimal Doc for testing */
function createDoc(
	id: number,
	jrn: string,
	docType: "document" | "folder" = "document",
	overrides: Partial<Doc> = {},
): Doc {
	return {
		id,
		jrn,
		docType,
		slug: `slug-${id}`,
		sortOrder: 0,
		contentMetadata: { title: `Doc ${id}` },
		...overrides,
	} as Doc;
}

/** Creates a tree node */
function createNode(doc: Doc, children: Array<ArticleTreeNode> = [], expanded = false): ArticleTreeNode {
	return { doc, children, expanded };
}

/** Empty folder stats for tests that don't need pre-computed data */
const emptyFolderStats: FolderStats = {
	selectionStates: new Map(),
	descendantCounts: new Map(),
};

/** Builds folderStats from a node and selected JRNs for tests involving folder selection */
function buildTestFolderStats(node: ArticleTreeNode, selectedJrns: Set<string>): FolderStats {
	return computeFolderStats([node], selectedJrns);
}

/** Default props factory */
function defaultProps(overrides: Partial<React.ComponentProps<typeof ArticleTreeItem>> = {}) {
	return {
		node: createNode(createDoc(1, "jrn:doc:1")),
		depth: 0,
		selectedJrns: new Set<string>(),
		onToggle: vi.fn(),
		onToggleExpand: vi.fn(),
		onSelectFolder: vi.fn(),
		folderStats: emptyFolderStats,
		pendingChangesLabel: "Has pending changes",
		itemCountFormatter: (count: number) => `${count} items`,
		...overrides,
	};
}

describe("ArticleTreeItem", () => {
	describe("document rendering", () => {
		it("should render a document item with its title", () => {
			const props = defaultProps();
			render(<ArticleTreeItem {...props} />);

			const item = screen.getByTestId("article-tree-item-jrn:doc:1");
			expect(item).toBeDefined();
			expect(item.textContent).toContain("Doc 1");
		});

		it("should show FileText icon for documents", () => {
			const props = defaultProps();
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("file-text-icon")).toBeDefined();
		});

		it("should not show a chevron for documents (renders spacer instead)", () => {
			const props = defaultProps();
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("chevron-down")).toBeNull();
			expect(screen.queryByTestId("chevron-right")).toBeNull();
		});

		it("should fall back to slug when title is missing", () => {
			const doc = createDoc(1, "jrn:doc:1", "document", { contentMetadata: {} });
			const props = defaultProps({ node: createNode(doc) });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("article-tree-item-jrn:doc:1").textContent).toContain("slug-1");
		});

		it("should fall back to jrn when both title and slug are missing", () => {
			const doc = { id: 1, jrn: "jrn:doc:1", docType: "document", sortOrder: 0 } as Doc;
			const props = defaultProps({ node: createNode(doc) });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("article-tree-item-jrn:doc:1").textContent).toContain("jrn:doc:1");
		});
	});

	describe("folder rendering", () => {
		it("should show Folder icon for collapsed folders", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("folder-icon")).toBeDefined();
			expect(screen.queryByTestId("folder-open-icon")).toBeNull();
		});

		it("should show FolderOpen icon for expanded folders", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], true);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("folder-open-icon")).toBeDefined();
			expect(screen.queryByTestId("folder-icon")).toBeNull();
		});

		it("should show ChevronRight for collapsed folders with children", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("chevron-right")).toBeDefined();
			expect(screen.queryByTestId("chevron-down")).toBeNull();
		});

		it("should show ChevronDown for expanded folders with children", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], true);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("chevron-down")).toBeDefined();
			expect(screen.queryByTestId("chevron-right")).toBeNull();
		});

		it("should display descendant count for folders with children", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const children = [createNode(createDoc(2, "jrn:doc:2")), createNode(createDoc(3, "jrn:doc:3"))];
			const node = createNode(folderDoc, children, false);
			const props = defaultProps({ node, folderStats: buildTestFolderStats(node, new Set()) });
			render(<ArticleTreeItem {...props} />);

			// The folder should show "2" for 2 descendants
			const item = screen.getByTestId("article-tree-item-jrn:folder:1");
			expect(item.textContent).toContain("2");
		});

		it("should render children when expanded", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:child"));
			const node = createNode(folderDoc, [child], true);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("article-tree-item-jrn:doc:child")).toBeDefined();
		});

		it("should not render children when collapsed", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:child"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("article-tree-item-jrn:doc:child")).toBeNull();
		});

		it("should not show chevron for empty folders", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const node = createNode(folderDoc, [], false);
			const props = defaultProps({ node });
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("chevron-right")).toBeNull();
			expect(screen.queryByTestId("chevron-down")).toBeNull();
		});
	});

	describe("click behavior", () => {
		it("should call onToggleExpand when clicking a folder with children", () => {
			const onToggleExpand = vi.fn();
			const folderDoc = createDoc(10, "jrn:folder:10", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node, onToggleExpand });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-tree-item-jrn:folder:10"));
			expect(onToggleExpand).toHaveBeenCalledWith(10);
		});

		it("should call onToggle when clicking a document", () => {
			const onToggle = vi.fn();
			const props = defaultProps({ onToggle });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-tree-item-jrn:doc:1"));
			expect(onToggle).toHaveBeenCalledWith("jrn:doc:1");
		});

		it("should call onToggle when clicking an empty folder", () => {
			const onToggle = vi.fn();
			const folderDoc = createDoc(1, "jrn:folder:empty", "folder");
			const node = createNode(folderDoc, [], false);
			const props = defaultProps({ node, onToggle });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-tree-item-jrn:folder:empty"));
			expect(onToggle).toHaveBeenCalledWith("jrn:folder:empty");
		});
	});

	describe("chevron click", () => {
		it("should call onToggleExpand when clicking the chevron button", () => {
			const onToggleExpand = vi.fn();
			const folderDoc = createDoc(5, "jrn:folder:5", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node, onToggleExpand });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("folder-expand-5"));
			expect(onToggleExpand).toHaveBeenCalledWith(5);
		});

		it("should stop propagation on chevron click (not trigger row click)", () => {
			const onToggleExpand = vi.fn();
			const folderDoc = createDoc(5, "jrn:folder:5", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node, onToggleExpand });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("folder-expand-5"));
			// onToggleExpand should only be called once (from chevron), not twice (from row too)
			expect(onToggleExpand).toHaveBeenCalledTimes(1);
		});
	});

	describe("checkbox behavior", () => {
		it("should call onToggle when clicking the checkbox of a document", () => {
			const onToggle = vi.fn();
			const props = defaultProps({ onToggle });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-checkbox-jrn:doc:1"));
			expect(onToggle).toHaveBeenCalledWith("jrn:doc:1");
		});

		it("should call onSelectFolder with true when clicking unselected folder checkbox", () => {
			const onSelectFolder = vi.fn();
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			// No items selected, so folderState = "none" → shouldSelect = true
			const selectedJrns = new Set<string>();
			const props = defaultProps({
				node,
				onSelectFolder,
				selectedJrns,
				folderStats: buildTestFolderStats(node, selectedJrns),
			});
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-checkbox-jrn:folder:1"));
			expect(onSelectFolder).toHaveBeenCalledWith(node, true);
		});

		it("should call onSelectFolder with false when clicking fully-selected folder checkbox", () => {
			const onSelectFolder = vi.fn();
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			// All items selected → folderState = "all" → shouldSelect = false
			const selected = new Set(["jrn:folder:1", "jrn:doc:2"]);
			const props = defaultProps({
				node,
				onSelectFolder,
				selectedJrns: selected,
				folderStats: buildTestFolderStats(node, selected),
			});
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-checkbox-jrn:folder:1"));
			expect(onSelectFolder).toHaveBeenCalledWith(node, false);
		});

		it("should call onSelectFolder with true when clicking partially-selected folder checkbox", () => {
			const onSelectFolder = vi.fn();
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child1 = createNode(createDoc(2, "jrn:doc:2"));
			const child2 = createNode(createDoc(3, "jrn:doc:3"));
			const node = createNode(folderDoc, [child1, child2], false);
			// Only some selected → folderState = "some" → shouldSelect = true
			const selected = new Set(["jrn:doc:2"]);
			const props = defaultProps({
				node,
				onSelectFolder,
				selectedJrns: selected,
				folderStats: buildTestFolderStats(node, selected),
			});
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-checkbox-jrn:folder:1"));
			expect(onSelectFolder).toHaveBeenCalledWith(node, true);
		});

		it("should call onToggle when clicking checkbox on an empty folder", () => {
			const onToggle = vi.fn();
			const folderDoc = createDoc(1, "jrn:folder:empty", "folder");
			const node = createNode(folderDoc, [], false);
			const props = defaultProps({ node, onToggle });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-checkbox-jrn:folder:empty"));
			expect(onToggle).toHaveBeenCalledWith("jrn:folder:empty");
		});

		it("should stop propagation on checkbox click", () => {
			const onToggle = vi.fn();
			const onToggleExpand = vi.fn();
			const props = defaultProps({ onToggle, onToggleExpand });
			render(<ArticleTreeItem {...props} />);

			fireEvent.click(screen.getByTestId("article-checkbox-jrn:doc:1"));
			// Only onToggle should fire, not onToggleExpand from the row
			expect(onToggle).toHaveBeenCalledTimes(1);
		});
	});

	describe("selection state", () => {
		it("should show check icon when document is selected", () => {
			const props = defaultProps({ selectedJrns: new Set(["jrn:doc:1"]) });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("check-icon")).toBeDefined();
		});

		it("should apply selected background class when document is selected", () => {
			const props = defaultProps({ selectedJrns: new Set(["jrn:doc:1"]) });
			render(<ArticleTreeItem {...props} />);

			const item = screen.getByTestId("article-tree-item-jrn:doc:1");
			expect(item.className).toContain("bg-primary/5");
		});

		it("should not show check icon when document is not selected", () => {
			const props = defaultProps({ selectedJrns: new Set<string>() });
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("check-icon")).toBeNull();
			expect(screen.queryByTestId("minus-icon")).toBeNull();
		});

		it("should show check icon when all folder children are selected", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const selected = new Set(["jrn:folder:1", "jrn:doc:2"]);
			const props = defaultProps({
				node,
				selectedJrns: selected,
				folderStats: buildTestFolderStats(node, selected),
			});
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("check-icon")).toBeDefined();
		});

		it("should show minus icon when some folder children are selected", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child1 = createNode(createDoc(2, "jrn:doc:2"));
			const child2 = createNode(createDoc(3, "jrn:doc:3"));
			const node = createNode(folderDoc, [child1, child2], false);
			// Only one of three items is selected (partial)
			const selected = new Set(["jrn:doc:2"]);
			const props = defaultProps({
				node,
				selectedJrns: selected,
				folderStats: buildTestFolderStats(node, selected),
			});
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("minus-icon")).toBeDefined();
			expect(screen.queryByTestId("check-icon")).toBeNull();
		});

		it("should show no icon when no folder children are selected", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const selectedJrns = new Set<string>();
			const props = defaultProps({
				node,
				selectedJrns,
				folderStats: buildTestFolderStats(node, selectedJrns),
			});
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("check-icon")).toBeNull();
			expect(screen.queryByTestId("minus-icon")).toBeNull();
		});
	});

	describe("changed JRNs indicator", () => {
		it("should show amber indicator when doc has pending changes", () => {
			const props = defaultProps({ changedJrns: new Set(["jrn:doc:1"]) });
			render(<ArticleTreeItem {...props} />);

			expect(screen.getByTestId("change-indicator-jrn:doc:1")).toBeDefined();
		});

		it("should not show amber indicator when doc has no pending changes", () => {
			const props = defaultProps({ changedJrns: new Set<string>() });
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("change-indicator-jrn:doc:1")).toBeNull();
		});

		it("should not show amber indicator when changedJrns is undefined", () => {
			const props = defaultProps();
			render(<ArticleTreeItem {...props} />);

			expect(screen.queryByTestId("change-indicator-jrn:doc:1")).toBeNull();
		});
	});

	describe("disabled state", () => {
		it("should disable the row button when disabled is true", () => {
			const props = defaultProps({ disabled: true });
			render(<ArticleTreeItem {...props} />);

			const item = screen.getByTestId("article-tree-item-jrn:doc:1");
			expect(item.getAttribute("aria-disabled")).toBe("true");
		});

		it("should disable the checkbox button when disabled is true", () => {
			const props = defaultProps({ disabled: true });
			render(<ArticleTreeItem {...props} />);

			const checkbox = screen.getByTestId("article-checkbox-jrn:doc:1") as HTMLButtonElement;
			expect(checkbox.disabled).toBe(true);
		});

		it("should disable the chevron button when disabled is true", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child = createNode(createDoc(2, "jrn:doc:2"));
			const node = createNode(folderDoc, [child], false);
			const props = defaultProps({ node, disabled: true });
			render(<ArticleTreeItem {...props} />);

			const chevron = screen.getByTestId("folder-expand-1") as HTMLButtonElement;
			expect(chevron.disabled).toBe(true);
		});
	});

	describe("indentation", () => {
		it("should apply padding based on depth level", () => {
			const props = defaultProps({ depth: 3 });
			render(<ArticleTreeItem {...props} />);

			const item = screen.getByTestId("article-tree-item-jrn:doc:1");
			// depth * 16 + 8 = 3 * 16 + 8 = 56
			expect(item.style.paddingLeft).toBe("56px");
		});

		it("should apply base padding at depth 0", () => {
			const props = defaultProps({ depth: 0 });
			render(<ArticleTreeItem {...props} />);

			const item = screen.getByTestId("article-tree-item-jrn:doc:1");
			// 0 * 16 + 8 = 8
			expect(item.style.paddingLeft).toBe("8px");
		});
	});

	describe("checkbox styling", () => {
		it("should have primary background when fully selected", () => {
			const props = defaultProps({ selectedJrns: new Set(["jrn:doc:1"]) });
			render(<ArticleTreeItem {...props} />);

			const checkbox = screen.getByTestId("article-checkbox-jrn:doc:1");
			expect(checkbox.className).toContain("bg-primary");
			expect(checkbox.className).toContain("border-primary");
		});

		it("should have partial background when folder is partially selected", () => {
			const folderDoc = createDoc(1, "jrn:folder:1", "folder");
			const child1 = createNode(createDoc(2, "jrn:doc:2"));
			const child2 = createNode(createDoc(3, "jrn:doc:3"));
			const node = createNode(folderDoc, [child1, child2], false);
			const selected = new Set(["jrn:doc:2"]);
			const props = defaultProps({
				node,
				selectedJrns: selected,
				folderStats: buildTestFolderStats(node, selected),
			});
			render(<ArticleTreeItem {...props} />);

			const checkbox = screen.getByTestId("article-checkbox-jrn:folder:1");
			expect(checkbox.className).toContain("bg-primary/50");
			expect(checkbox.className).toContain("border-primary");
		});

		it("should have muted border when not selected", () => {
			const props = defaultProps({ selectedJrns: new Set<string>() });
			render(<ArticleTreeItem {...props} />);

			const checkbox = screen.getByTestId("article-checkbox-jrn:doc:1");
			expect(checkbox.className).toContain("border-muted-foreground/30");
		});
	});
});
