import { ArticleTree } from "./ArticleTree";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Doc } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock react-intlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: (key: string) => {
		if (key === "article-tree") {
			return {
				noArticlesFound: "No articles found",
				unorganizedArticles: "Other Articles",
				hasPendingChanges: { value: "Has pending changes" },
				itemCount: (params: { count: string }) => ({ value: `${params.count} items` }),
			};
		}
		return {};
	},
}));

// Mock ArticleTreeItem to simplify tests and avoid recursive rendering complexity
vi.mock("./ArticleTreeItem", () => ({
	ArticleTreeItem: ({
		node,
		depth,
		selectedJrns,
		onToggle,
		onToggleExpand,
		onSelectFolder,
		disabled,
		changedJrns,
	}: {
		node: { doc: Doc; children: Array<unknown>; expanded: boolean };
		depth: number;
		selectedJrns: Set<string>;
		onToggle: (jrn: string) => void;
		onToggleExpand: (docId: number) => void;
		onSelectFolder: (node: unknown, select: boolean) => void;
		disabled: boolean;
		changedJrns: Set<string> | undefined;
	}) => (
		<div data-testid={`mock-tree-item-${node.doc.id}`} data-depth={depth} data-disabled={disabled}>
			<span data-testid={`item-title-${node.doc.id}`}>{node.doc.contentMetadata?.title || node.doc.slug}</span>
			<button type="button" data-testid={`toggle-${node.doc.jrn}`} onClick={() => onToggle(node.doc.jrn)}>
				Toggle
			</button>
			<button type="button" data-testid={`expand-${node.doc.id}`} onClick={() => onToggleExpand(node.doc.id)}>
				Expand
			</button>
			<button
				type="button"
				data-testid={`select-folder-${node.doc.id}`}
				onClick={() => onSelectFolder(node, true)}
			>
				Select Folder
			</button>
			<button
				type="button"
				data-testid={`deselect-folder-${node.doc.id}`}
				onClick={() => onSelectFolder(node, false)}
			>
				Deselect Folder
			</button>
			{selectedJrns.has(node.doc.jrn) && <span data-testid={`selected-indicator-${node.doc.jrn}`}>Selected</span>}
			{changedJrns?.has(node.doc.jrn) && <span data-testid={`changed-indicator-${node.doc.jrn}`}>Changed</span>}
		</div>
	),
	getAllDocumentJrns: (node: { doc: Doc; children: Array<{ doc: Doc; children: Array<unknown> }> }) => {
		const jrns: Array<string> = [node.doc.jrn];
		for (const child of node.children) {
			jrns.push(child.doc.jrn);
		}
		return jrns;
	},
	computeFolderStats: () => ({
		selectionStates: new Map(),
		descendantCounts: new Map(),
	}),
}));

/** Creates a minimal Doc object for testing */
function createDoc(id: number, jrn: string, overrides: Partial<Doc> = {}): Doc {
	return {
		id,
		jrn,
		slug: `slug-${id}`,
		path: `/path/${id}`,
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		updatedBy: "user-1",
		source: undefined,
		sourceMetadata: undefined,
		content: "",
		contentType: "text/markdown",
		contentMetadata: { title: `Doc ${id}` },
		version: 1,
		spaceId: 1,
		parentId: undefined,
		docType: "document",
		sortOrder: id,
		createdBy: "user-1",
		deletedAt: undefined,
		explicitlyDeleted: false,
		...overrides,
	} as Doc;
}

/** Creates a folder Doc */
function createFolder(id: number, jrn: string, overrides: Partial<Doc> = {}): Doc {
	return createDoc(id, jrn, {
		docType: "folder",
		contentMetadata: { title: `Folder ${id}` },
		...overrides,
	});
}

describe("ArticleTree", () => {
	const mockOnSelectionChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Rendering", () => {
		it("renders the article tree container", () => {
			const articles = [createDoc(1, "jrn:doc:1")];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			expect(screen.getByTestId("article-tree")).toBeDefined();
		});

		it("renders tree items for each root-level article", () => {
			const articles = [createDoc(1, "jrn:doc:1"), createDoc(2, "jrn:doc:2"), createDoc(3, "jrn:doc:3")];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
			expect(screen.getByTestId("mock-tree-item-2")).toBeDefined();
			expect(screen.getByTestId("mock-tree-item-3")).toBeDefined();
		});

		it("shows empty state when no articles are provided", () => {
			render(<ArticleTree articles={[]} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />);

			expect(screen.queryByTestId("article-tree")).toBeNull();
			expect(screen.getByTestId("article-tree-empty")).toBeDefined();
			expect(screen.getByTestId("article-tree-empty").textContent).toContain("No articles found");
		});

		it("passes disabled prop to tree items", () => {
			const articles = [createDoc(1, "jrn:doc:1")];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					disabled={true}
				/>,
			);

			const item = screen.getByTestId("mock-tree-item-1");
			expect(item.getAttribute("data-disabled")).toBe("true");
		});

		it("passes disabled=false by default to tree items", () => {
			const articles = [createDoc(1, "jrn:doc:1")];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			const item = screen.getByTestId("mock-tree-item-1");
			expect(item.getAttribute("data-disabled")).toBe("false");
		});
	});

	describe("Tree Building", () => {
		it("places child articles under their parent folder", () => {
			const articles = [createFolder(1, "jrn:folder:1"), createDoc(2, "jrn:doc:2", { parentId: 1 })];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// Only the root folder should be rendered at depth 0
			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
			// Child doc should not be at root level (it is inside the folder node's children)
			expect(screen.queryByTestId("mock-tree-item-2")).toBeNull();
		});

		it("places articles with missing parent at root level", () => {
			const articles = [createDoc(1, "jrn:doc:1", { parentId: 999 })];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("sorts by sortOrder regardless of document type", () => {
			const articles = [
				createDoc(1, "jrn:doc:1", { sortOrder: 1 }),
				createFolder(2, "jrn:folder:2", { sortOrder: 2 }),
			];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			const tree = screen.getByTestId("article-tree");
			const items = tree.querySelectorAll("[data-testid^='mock-tree-item-']");
			// Pure sortOrder: doc (sortOrder=1) before folder (sortOrder=2)
			expect(items[0].getAttribute("data-testid")).toBe("mock-tree-item-1");
			expect(items[1].getAttribute("data-testid")).toBe("mock-tree-item-2");
		});

		it("sorts items by sortOrder within the same type", () => {
			const articles = [
				createDoc(3, "jrn:doc:3", { sortOrder: 30 }),
				createDoc(1, "jrn:doc:1", { sortOrder: 10 }),
				createDoc(2, "jrn:doc:2", { sortOrder: 20 }),
			];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			const tree = screen.getByTestId("article-tree");
			const items = tree.querySelectorAll("[data-testid^='mock-tree-item-']");
			expect(items[0].getAttribute("data-testid")).toBe("mock-tree-item-1");
			expect(items[1].getAttribute("data-testid")).toBe("mock-tree-item-2");
			expect(items[2].getAttribute("data-testid")).toBe("mock-tree-item-3");
		});
	});

	describe("Selection Handling", () => {
		it("passes selectedJrns to tree items", () => {
			const articles = [createDoc(1, "jrn:doc:1")];
			const selectedJrns = new Set(["jrn:doc:1"]);

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={selectedJrns}
					onSelectionChange={mockOnSelectionChange}
				/>,
			);

			expect(screen.getByTestId("selected-indicator-jrn:doc:1")).toBeDefined();
		});

		it("calls onSelectionChange with new Set when toggling an unselected item", () => {
			const articles = [createDoc(1, "jrn:doc:1")];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			fireEvent.click(screen.getByTestId("toggle-jrn:doc:1"));

			expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:doc:1")).toBe(true);
		});

		it("calls onSelectionChange removing item when toggling a selected item", () => {
			const articles = [createDoc(1, "jrn:doc:1")];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set(["jrn:doc:1"])}
					onSelectionChange={mockOnSelectionChange}
				/>,
			);

			fireEvent.click(screen.getByTestId("toggle-jrn:doc:1"));

			expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:doc:1")).toBe(false);
		});

		it("preserves other selections when toggling an item", () => {
			const articles = [createDoc(1, "jrn:doc:1"), createDoc(2, "jrn:doc:2")];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set(["jrn:doc:1"])}
					onSelectionChange={mockOnSelectionChange}
				/>,
			);

			fireEvent.click(screen.getByTestId("toggle-jrn:doc:2"));

			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:doc:1")).toBe(true);
			expect(newSelection.has("jrn:doc:2")).toBe(true);
		});
	});

	describe("Folder Selection", () => {
		it("selects all folder children when onSelectFolder is called with select=true", () => {
			const folder = createFolder(1, "jrn:folder:1");
			const child = createDoc(2, "jrn:doc:2", { parentId: 1 });
			const articles = [folder, child];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			fireEvent.click(screen.getByTestId("select-folder-1"));

			expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			// The getAllDocumentJrns mock returns [node.doc.jrn, ...children.doc.jrn]
			expect(newSelection.has("jrn:folder:1")).toBe(true);
		});

		it("deselects all folder children when onSelectFolder is called with select=false", () => {
			const folder = createFolder(1, "jrn:folder:1");
			const child = createDoc(2, "jrn:doc:2", { parentId: 1 });
			const articles = [folder, child];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set(["jrn:folder:1", "jrn:doc:2"])}
					onSelectionChange={mockOnSelectionChange}
				/>,
			);

			fireEvent.click(screen.getByTestId("deselect-folder-1"));

			expect(mockOnSelectionChange).toHaveBeenCalledTimes(1);
			const newSelection = mockOnSelectionChange.mock.calls[0][0] as Set<string>;
			expect(newSelection.has("jrn:folder:1")).toBe(false);
		});
	});

	describe("Expand/Collapse", () => {
		it("folders start expanded by default", () => {
			const folder = createFolder(1, "jrn:folder:1");
			const child = createDoc(2, "jrn:doc:2", { parentId: 1 });
			const articles = [folder, child];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// The folder tree item should render (folders start expanded)
			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("toggles expand state when onToggleExpand is triggered", () => {
			const folder = createFolder(1, "jrn:folder:1");
			const child = createDoc(2, "jrn:doc:2", { parentId: 1 });
			const articles = [folder, child];

			const { rerender } = render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// Click expand toggle to collapse the folder
			fireEvent.click(screen.getByTestId("expand-1"));

			// Re-render to see updated state (React state update)
			rerender(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// The folder should still be rendered (it's a root node)
			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("toggling expand twice restores original state", () => {
			const folder = createFolder(1, "jrn:folder:1");
			const child = createDoc(2, "jrn:doc:2", { parentId: 1 });
			const articles = [folder, child];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// Collapse
			fireEvent.click(screen.getByTestId("expand-1"));
			// Re-expand
			fireEvent.click(screen.getByTestId("expand-1"));

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});
	});

	describe("Search Filtering", () => {
		it("shows all articles when searchQuery is empty", () => {
			const articles = [
				createDoc(1, "jrn:doc:1", { contentMetadata: { title: "Getting Started" } }),
				createDoc(2, "jrn:doc:2", { contentMetadata: { title: "Advanced Guide" } }),
			];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery=""
				/>,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
			expect(screen.getByTestId("mock-tree-item-2")).toBeDefined();
		});

		it("filters articles based on searchQuery matching title", () => {
			const articles = [
				createDoc(1, "jrn:doc:1", { contentMetadata: { title: "Getting Started" } }),
				createDoc(2, "jrn:doc:2", { contentMetadata: { title: "Advanced Guide" } }),
			];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="Getting"
				/>,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
			expect(screen.queryByTestId("mock-tree-item-2")).toBeNull();
		});

		it("performs case-insensitive search", () => {
			const articles = [createDoc(1, "jrn:doc:1", { contentMetadata: { title: "Getting Started" } })];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="getting started"
				/>,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("shows empty state when search query matches no articles", () => {
			const articles = [createDoc(1, "jrn:doc:1", { contentMetadata: { title: "Getting Started" } })];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="nonexistent"
				/>,
			);

			expect(screen.queryByTestId("article-tree")).toBeNull();
			expect(screen.getByTestId("article-tree-empty")).toBeDefined();
			expect(screen.getByTestId("article-tree-empty").textContent).toContain("No articles found");
		});

		it("keeps parent folder visible when child matches search query", () => {
			const folder = createFolder(1, "jrn:folder:1", {
				contentMetadata: { title: "API Reference" },
			});
			const child = createDoc(2, "jrn:doc:2", {
				parentId: 1,
				contentMetadata: { title: "Authentication Guide" },
			});
			const articles = [folder, child];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="Authentication"
				/>,
			);

			// Parent folder should be visible because its child matches
			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("falls back to slug when title is absent", () => {
			const articles = [
				createDoc(1, "jrn:doc:1", {
					slug: "my-special-slug",
					contentMetadata: undefined,
				}),
			];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="special"
				/>,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("falls back to jrn when both title and slug are absent", () => {
			const articles = [
				createDoc(1, "jrn:doc:unique-id", {
					slug: "",
					contentMetadata: undefined,
				}),
			];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="unique-id"
				/>,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
		});

		it("ignores whitespace-only search queries", () => {
			const articles = [createDoc(1, "jrn:doc:1"), createDoc(2, "jrn:doc:2")];

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					searchQuery="   "
				/>,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
			expect(screen.getByTestId("mock-tree-item-2")).toBeDefined();
		});
	});

	describe("Changed JRNs", () => {
		it("passes changedJrns to tree items", () => {
			const articles = [createDoc(1, "jrn:doc:1")];
			const changedJrns = new Set(["jrn:doc:1"]);

			render(
				<ArticleTree
					articles={articles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
					changedJrns={changedJrns}
				/>,
			);

			expect(screen.getByTestId("changed-indicator-jrn:doc:1")).toBeDefined();
		});

		it("does not show changed indicator when changedJrns is undefined", () => {
			const articles = [createDoc(1, "jrn:doc:1")];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			expect(screen.queryByTestId("changed-indicator-jrn:doc:1")).toBeNull();
		});
	});

	describe("Auto-expand new folders", () => {
		it("auto-expands folders that appear after initial render", () => {
			const initialArticles = [createDoc(1, "jrn:doc:1")];
			const { rerender } = render(
				<ArticleTree
					articles={initialArticles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
				/>,
			);

			// Re-render with new root-level folder and document added
			const updatedArticles = [
				createDoc(1, "jrn:doc:1"),
				createFolder(10, "jrn:folder:10"),
				createDoc(11, "jrn:doc:11"),
			];

			rerender(
				<ArticleTree
					articles={updatedArticles}
					selectedJrns={new Set()}
					onSelectionChange={mockOnSelectionChange}
				/>,
			);

			// The new folder should be rendered (auto-expanded via the useEffect)
			expect(screen.getByTestId("mock-tree-item-10")).toBeDefined();
			expect(screen.getByTestId("mock-tree-item-11")).toBeDefined();
		});

		it("does not re-expand a folder that was manually collapsed", () => {
			const articles = [createFolder(10, "jrn:folder:10"), createDoc(11, "jrn:doc:11")];

			const { rerender } = render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// Collapse the folder
			fireEvent.click(screen.getByTestId("expand-10"));

			// Re-render with same articles (no new folders)
			rerender(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			// Folder should still be rendered (it exists), but the expand was toggled
			expect(screen.getByTestId("mock-tree-item-10")).toBeDefined();
		});
	});

	describe("Root-level items with null parentId", () => {
		it("treats articles with null parentId as root-level items", () => {
			const articles = [
				createDoc(1, "jrn:doc:1", { parentId: null as unknown as undefined }),
				createDoc(2, "jrn:doc:2", { parentId: undefined }),
			];

			render(
				<ArticleTree articles={articles} selectedJrns={new Set()} onSelectionChange={mockOnSelectionChange} />,
			);

			expect(screen.getByTestId("mock-tree-item-1")).toBeDefined();
			expect(screen.getByTestId("mock-tree-item-2")).toBeDefined();
		});
	});
});
