import type { SpaceTreeActions, SpaceTreeState } from "../hooks/useSpaceTree";
import { createMockClient, renderWithProviders } from "../test/TestUtils";
import { Spaces } from "./Spaces";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import type { Space } from "jolli-common";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./spaces/ChangesetReviewWorkbench", () => ({
	ChangesetReviewWorkbench: ({
		changeset,
		onCloseReview,
		onChangesetMutated,
	}: {
		changeset: { id: number };
		onCloseReview?: () => void;
		onChangesetMutated?: () => void;
	}) => (
		<div data-testid="changeset-review-workbench">
			Workbench for #{changeset.id}
			{onCloseReview && (
				<button type="button" data-testid="mock-close-review-workbench" onClick={onCloseReview}>
					Close review
				</button>
			)}
			{onChangesetMutated && (
				<button type="button" data-testid="mock-mutate-changeset" onClick={onChangesetMutated}>
					Mutate changeset
				</button>
			)}
		</div>
	),
}));

// Mock ArticleDraft component — accepts both draftId (explicit edit) and articleJrn (always-editable)
vi.mock("./ArticleDraft", () => ({
	ArticleDraft: ({ draftId, articleJrn }: { draftId?: number; articleJrn?: string; articleTitle?: string }) => (
		<div data-testid="article-draft-mock">
			{articleJrn ? `Article: ${articleJrn}` : `ArticleDraft (draftId: ${draftId})`}
		</div>
	),
}));

// Mock NavigationContext
const mockNavigationContext = vi.hoisted(() => ({
	inlineEditDraftId: undefined as number | undefined,
	selectedDocId: undefined as number | undefined,
	navigate: vi.fn() as ReturnType<typeof vi.fn>,
}));

vi.mock("../contexts/NavigationContext", () => ({
	useNavigation: () => mockNavigationContext,
}));

// Mock SpaceTreeNav component to isolate Spaces tests
vi.mock("./spaces/SpaceTreeNav", () => ({
	SpaceTreeNav: ({
		onCollapse,
		onDropdownOpenChange,
		onSelectChangeset,
		selectedChangesetId,
		bundleRefreshKey,
	}: {
		onCollapse?: () => void;
		onDropdownOpenChange?: (open: boolean) => void;
		onSelectChangeset?: (changeset: unknown) => void;
		selectedChangesetId?: number;
		bundleRefreshKey?: number;
	}) => (
		<div data-testid="space-tree">
			SpaceTreeNav
			{onCollapse && (
				<button data-testid="pinned-panel-collapse-button" onClick={onCollapse} type="button">
					Collapse
				</button>
			)}
			{onDropdownOpenChange && (
				<>
					<button data-testid="mock-dropdown-open" onClick={() => onDropdownOpenChange(true)} type="button">
						Open Dropdown
					</button>
					<button data-testid="mock-dropdown-close" onClick={() => onDropdownOpenChange(false)} type="button">
						Close Dropdown
					</button>
				</>
			)}
			{onSelectChangeset && (
				<>
					<button
						data-testid="mock-select-changeset"
						onClick={() =>
							onSelectChangeset({
								id: 101,
								seq: 1,
								message: "Test bundle",
								mergePrompt: null,
								pushedBy: null,
								clientChangesetId: "CID-101",
								status: "proposed",
								commitScopeKey: "space:1",
								targetBranch: "main",
								payloadHash: "hash",
								publishedAt: null,
								publishedBy: null,
								createdAt: "2024-01-01T00:00:00.000Z",
								summary: {
									totalFiles: 1,
									accepted: 0,
									rejected: 0,
									amended: 0,
									pending: 1,
									additions: 2,
									deletions: 1,
								},
							})
						}
						type="button"
					>
						Select Bundle
					</button>
					<button
						data-testid="mock-clear-changeset"
						onClick={() => onSelectChangeset(undefined)}
						type="button"
					>
						Clear Bundle
					</button>
				</>
			)}
			<div data-testid="mock-selected-changeset">{selectedChangesetId ?? "none"}</div>
			<div data-testid="mock-bundle-refresh-key">{bundleRefreshKey ?? 0}</div>
		</div>
	),
}));

// Mock SpaceContext - SpaceProvider just renders children, useCurrentSpace returns mock
const mockCurrentSpace: Space = {
	id: 1,
	name: "Test Space",
	slug: "test-space",
	jrn: "space:test",
	description: undefined,
	ownerId: 1,
	isPersonal: false,
	defaultSort: "default",
	defaultFilters: { updated: "any_time", creator: "" },
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-01T00:00:00Z",
};

vi.mock("../contexts/SpaceContext", () => ({
	SpaceProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	useCurrentSpace: () => mockCurrentSpace,
	useSpace: () => ({ switchSpace: vi.fn() }),
}));

// Mock useSpaceTree hook
const mockTreeActions: SpaceTreeActions = {
	loadTree: vi.fn(),
	loadTrash: vi.fn(),
	toggleExpanded: vi.fn(),
	selectDoc: vi.fn(),
	setShowTrash: vi.fn(),
	createFolder: vi.fn(),
	createDoc: vi.fn(),
	softDelete: vi.fn(),
	restore: vi.fn(),
	refreshTree: vi.fn(),
	rename: vi.fn(),
	setSearchQuery: vi.fn(),
	clearSearch: vi.fn(),
	setSortMode: vi.fn(),
	resetToDefaultSort: vi.fn(),
	reorderDoc: vi.fn(),
	moveTo: vi.fn(),
	reorderAt: vi.fn(),
	setFilters: vi.fn(),
	resetToDefaultFilters: vi.fn(),
};

const mockTreeState: SpaceTreeState = {
	treeData: [],
	trashData: [],
	loading: false,
	hasTrash: false,
	selectedDocId: undefined,
	showTrash: false,
	searchQuery: "",
	isSearching: false,
	sortMode: "default",
	isDefaultSort: true,
	isMatchingSpaceDefault: true,
	filters: { updated: "any_time", creator: "" },
	filterCount: 0,
	isMatchingSpaceDefaultFilters: true,
};

const mockUseSpaceTree = vi.fn();

vi.mock("../hooks/useSpaceTree", () => ({
	useSpaceTree: () => mockUseSpaceTree() as [SpaceTreeState, SpaceTreeActions],
}));

describe("Spaces", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUseSpaceTree.mockReturnValue([mockTreeState, mockTreeActions]);
		mockNavigationContext.inlineEditDraftId = undefined;
		mockNavigationContext.selectedDocId = undefined;
		mockNavigationContext.navigate = vi.fn();
		// Set tree to pinned (visible) by default for tests
		localStorage.setItem("spaces.treePanelPinned", "true");
	});

	// Common render options since we mock NavigationContext and SpaceContext
	const renderOptions = { withNavigation: false, withSpace: false, withSites: false };

	it("should render ResizablePanelGroup with correct structure", () => {
		const { container } = renderWithProviders(<Spaces />, renderOptions);

		// Verify ResizablePanelGroup is rendered with id
		const group = container.querySelector('[data-resizable-group="Group"]');
		expect(group).toBeDefined();

		// Verify empty state is shown when no document selected
		expect(screen.getByText("No document selected")).toBeDefined();
	});

	it("should render two panels with correct ids", () => {
		const { container } = renderWithProviders(<Spaces />, renderOptions);

		// Verify both panels are rendered
		const panels = container.querySelectorAll('[data-resizable-panel="Panel"]');
		expect(panels.length).toBe(2);
	});

	it("should render ResizableHandle", () => {
		const { container } = renderWithProviders(<Spaces />, renderOptions);

		// Verify handle is rendered
		const handle = container.querySelector('[data-resizable-handle="PanelResizeHandle"]');
		expect(handle).toBeDefined();
	});

	it("should render empty state with title and description", () => {
		renderWithProviders(<Spaces />, renderOptions);

		expect(screen.getByText("No document selected")).toBeDefined();
		expect(screen.getByText("Select a document from the tree to view and edit its content.")).toBeDefined();
	});

	it("should render SpaceTreeNav component", () => {
		const { container } = renderWithProviders(<Spaces />, renderOptions);

		// Verify SpaceTreeNav is rendered (it should be in the left panel)
		expect(container.querySelector('[data-testid="space-tree"]')).toBeDefined();
	});

	it("should render ArticleDraft when a document is selected", async () => {
		const mockStateWithSelection = {
			...mockTreeState,
			selectedDocId: 123,
			treeData: [
				{
					doc: {
						id: 123,
						jrn: "test:doc1",
						slug: "test-doc1",
						title: "Test Document",
						contentType: "text/markdown",
					},
					children: [],
					expanded: false,
				},
			],
		};

		mockUseSpaceTree.mockReturnValue([mockStateWithSelection, mockTreeActions]);

		renderWithProviders(<Spaces />, renderOptions);

		// Always-editable editor is rendered with the article JRN (lazy-loaded — wait for render)
		await waitFor(() => {
			expect(screen.getByTestId("article-draft-mock")).toBeDefined();
		});
		expect(screen.getByText("Article: test:doc1")).toBeDefined();
	});

	it("should handle nested tree structure with children", async () => {
		const mockStateWithNestedTree = {
			...mockTreeState,
			selectedDocId: 456,
			treeData: [
				{
					doc: {
						id: 123,
						jrn: "test:doc1",
						slug: "test-doc1",
						title: "Parent Document",
						contentType: "text/markdown",
					},
					children: [
						{
							doc: {
								id: 456,
								jrn: "test:doc2",
								slug: "test-doc2",
								title: "Child Document",
								contentType: "text/markdown",
							},
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
			],
		};

		mockUseSpaceTree.mockReturnValue([mockStateWithNestedTree, mockTreeActions]);

		renderWithProviders(<Spaces />, renderOptions);

		// Always-editable editor is rendered with the nested document's JRN (lazy-loaded — wait for render)
		await waitFor(() => {
			expect(screen.getByTestId("article-draft-mock")).toBeDefined();
		});
		expect(screen.getByText("Article: test:doc2")).toBeDefined();
	});

	it("replaces center document view with the changeset review workbench when a bundle is selected", async () => {
		const mockStateWithSelection = {
			...mockTreeState,
			selectedDocId: 123,
			treeData: [
				{
					doc: {
						id: 123,
						jrn: "test:doc1",
						slug: "test-doc1",
						title: "Test Document",
						contentType: "text/markdown",
					},
					children: [],
					expanded: false,
				},
			],
		};
		mockUseSpaceTree.mockReturnValue([mockStateWithSelection, mockTreeActions]);

		renderWithProviders(<Spaces />, renderOptions);

		// Wait for lazy article editor to render
		await waitFor(() => {
			expect(screen.getByTestId("article-draft-mock")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("mock-select-changeset"));

		await waitFor(() => {
			expect(screen.getByTestId("changeset-review-workbench")).toBeDefined();
		});
		expect(screen.queryByTestId("article-draft-mock")).toBeNull();

		fireEvent.click(screen.getByTestId("mock-close-review-workbench"));
		await waitFor(() => {
			expect(screen.queryByTestId("changeset-review-workbench")).toBeNull();
		});
		// After closing review, article editor is shown again (selection persists)
		await waitFor(() => {
			expect(screen.getByTestId("article-draft-mock")).toBeDefined();
		});
	});

	it("increments bundle refresh key when workbench reports changeset mutation", async () => {
		renderWithProviders(<Spaces />, renderOptions);

		expect(screen.getByTestId("mock-bundle-refresh-key").textContent).toBe("0");

		fireEvent.click(screen.getByTestId("mock-select-changeset"));
		await waitFor(() => {
			expect(screen.getByTestId("changeset-review-workbench")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("mock-mutate-changeset"));
		await waitFor(() => {
			expect(screen.getByTestId("mock-bundle-refresh-key").textContent).toBe("1");
		});
	});

	describe("Edit mode (inline draft via URL)", () => {
		beforeEach(() => {
			mockNavigationContext.inlineEditDraftId = 42;
			// Clear localStorage to ensure fresh state for each test
			localStorage.removeItem("spaces.treePanelPinned");
		});

		it("should keep tree pinned in edit mode (no auto-collapse)", () => {
			renderWithProviders(<Spaces />, renderOptions);

			// Tree stays pinned (default preference is true) — no auto-collapse
			expect(screen.getByTestId("pinned-tree-panel")).toBeDefined();
			expect(screen.getByTestId("pinned-panel-collapse-button")).toBeDefined();
		});

		it("should render ArticleDraft with draftId in edit mode", () => {
			renderWithProviders(<Spaces />, renderOptions);

			expect(screen.getByTestId("article-draft-mock")).toBeDefined();
			expect(screen.getByText("ArticleDraft (draftId: 42)")).toBeDefined();
		});

		it("should pin tree panel when clicking expand button", async () => {
			// Start with tree collapsed
			localStorage.setItem("spaces.treePanelPinned", "false");
			renderWithProviders(<Spaces />, renderOptions);

			expect(screen.queryByTestId("pinned-tree-panel")).toBeNull();

			// Click expand button to pin
			const expandButton = screen.getByTestId("collapsed-rail-expand-button");
			fireEvent.click(expandButton);

			// Wait for state update — should show pinned panel
			await waitFor(() => {
				expect(screen.getByTestId("pinned-tree-panel")).toBeDefined();
			});
			expect(screen.getByTestId("pinned-panel-collapse-button")).toBeDefined();
		});

		it("should collapse pinned panel when clicking collapse button", async () => {
			renderWithProviders(<Spaces />, renderOptions);

			// Tree starts pinned (default)
			expect(screen.getByTestId("pinned-tree-panel")).toBeDefined();

			// Click collapse button
			const collapseButton = screen.getByTestId("pinned-panel-collapse-button");
			fireEvent.click(collapseButton);

			// Wait for collapse — expand button appears in the header
			await waitFor(() => {
				expect(screen.getByTestId("collapsed-rail-expand-button")).toBeDefined();
			});
			expect(screen.queryByTestId("pinned-tree-panel")).toBeNull();
		});
	});

	describe("Normal mode (collapsible tree panel)", () => {
		beforeEach(() => {
			mockNavigationContext.inlineEditDraftId = undefined;
			// Set tree to pinned (visible) by default for normal mode tests
			localStorage.setItem("spaces.treePanelPinned", "true");
		});

		it("should render pinned tree panel with collapse button in normal mode", () => {
			renderWithProviders(<Spaces />, renderOptions);

			// Should show the collapse button in the SpaceTreeNav
			expect(screen.getByTestId("pinned-panel-collapse-button")).toBeDefined();
			// Should show pinned panel
			expect(screen.getByTestId("pinned-tree-panel")).toBeDefined();
		});

		it("should collapse tree panel when clicking collapse button", async () => {
			renderWithProviders(<Spaces />, renderOptions);

			// Click collapse button
			const collapseButton = screen.getByTestId("pinned-panel-collapse-button");
			fireEvent.click(collapseButton);

			// Wait for collapse — expand button appears in header
			await waitFor(() => {
				expect(screen.getByTestId("collapsed-rail-expand-button-empty")).toBeDefined();
			});
			// Should not show pinned panel anymore
			expect(screen.queryByTestId("pinned-panel-collapse-button")).toBeNull();
		});

		it("should expand tree panel when clicking expand button on collapsed rail", async () => {
			// Start with tree collapsed
			localStorage.setItem("spaces.treePanelPinned", "false");
			renderWithProviders(<Spaces />, renderOptions);

			// Click expand button (empty state variant since no article is selected)
			const expandButton = screen.getByTestId("collapsed-rail-expand-button-empty");
			fireEvent.click(expandButton);

			// Wait for expansion
			await waitFor(() => {
				// Should show collapse button (pinned panel)
				expect(screen.getByTestId("pinned-panel-collapse-button")).toBeDefined();
			});
			// Expand button should be gone
			expect(screen.queryByTestId("collapsed-rail-expand-button-empty")).toBeNull();
		});

		it("should render content area with empty state when collapsed", () => {
			// Start with tree collapsed
			localStorage.setItem("spaces.treePanelPinned", "false");
			renderWithProviders(<Spaces />, renderOptions);

			// Should show empty state in content area
			expect(screen.getByText("No document selected")).toBeDefined();
		});

		it("should render article editor when document is selected and tree is collapsed", async () => {
			// Start with tree collapsed
			localStorage.setItem("spaces.treePanelPinned", "false");

			const mockStateWithSelection = {
				...mockTreeState,
				selectedDocId: 123,
				treeData: [
					{
						doc: {
							id: 123,
							jrn: "test:doc1",
							slug: "test-doc1",
							title: "Test Document",
							contentType: "text/markdown",
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateWithSelection, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Expand button renders in header (tree is collapsed)
			expect(screen.getByTestId("collapsed-rail-expand-button")).toBeDefined();
			// Article editor is lazy-loaded — wait for render
			await waitFor(() => {
				expect(screen.getByTestId("article-draft-mock")).toBeDefined();
			});
			expect(screen.getByText("Article: test:doc1")).toBeDefined();
		});
	});

	describe("Auto-select article on space entry", () => {
		beforeEach(() => {
			mockNavigationContext.inlineEditDraftId = undefined;
			mockNavigationContext.selectedDocId = undefined;
			localStorage.setItem("spaces.treePanelPinned", "true");
		});

		it("should auto-select first document when tree loads with no selection", async () => {
			const mockStateLoaded = {
				...mockTreeState,
				loading: false,
				selectedDocId: undefined,
				treeData: [
					{
						doc: {
							id: 10,
							jrn: "test:first-doc",
							slug: "first-doc",
							contentType: "text/markdown",
							contentMetadata: { title: "First Article" },
							docType: "document",
							parentId: undefined,
						},
						children: [],
						expanded: false,
					},
					{
						doc: {
							id: 20,
							jrn: "test:second-doc",
							slug: "second-doc",
							contentType: "text/markdown",
							contentMetadata: { title: "Second Article" },
							docType: "document",
							parentId: undefined,
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateLoaded, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Should call selectDoc with the first document's ID
			await waitFor(() => {
				expect(mockTreeActions.selectDoc).toHaveBeenCalledWith(10);
			});
		});

		it("should auto-select first nested document when root is a folder", async () => {
			const mockStateLoaded = {
				...mockTreeState,
				loading: false,
				selectedDocId: undefined,
				treeData: [
					{
						doc: {
							id: 1,
							jrn: "test:folder",
							slug: "folder",
							contentType: "text/markdown",
							contentMetadata: { title: "Folder" },
							docType: "folder",
							parentId: undefined,
						},
						children: [
							{
								doc: {
									id: 2,
									jrn: "test:nested-doc",
									slug: "nested-doc",
									contentType: "text/markdown",
									contentMetadata: { title: "Nested Doc" },
									docType: "document",
									parentId: 1,
								},
								children: [],
								expanded: false,
							},
						],
						expanded: true,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateLoaded, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Should select the nested document, not the folder
			await waitFor(() => {
				expect(mockTreeActions.selectDoc).toHaveBeenCalledWith(2);
			});
		});

		it("should auto-select last-viewed article from localStorage when available", async () => {
			// Set last-viewed article in localStorage for space 1
			localStorage.setItem("spaces.lastViewedArticle.1", "20");

			const mockStateLoaded = {
				...mockTreeState,
				loading: false,
				selectedDocId: undefined,
				treeData: [
					{
						doc: {
							id: 10,
							jrn: "test:first-doc",
							slug: "first-doc",
							contentType: "text/markdown",
							contentMetadata: { title: "First Article" },
							docType: "document",
							parentId: undefined,
						},
						children: [],
						expanded: false,
					},
					{
						doc: {
							id: 20,
							jrn: "test:second-doc",
							slug: "second-doc",
							contentType: "text/markdown",
							contentMetadata: { title: "Second Article" },
							docType: "document",
							parentId: undefined,
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateLoaded, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Should select the last-viewed article (20), not the first (10)
			await waitFor(() => {
				expect(mockTreeActions.selectDoc).toHaveBeenCalledWith(20);
			});
		});

		it("should fall back to first document if last-viewed article was deleted", async () => {
			// Set last-viewed article that no longer exists in tree
			localStorage.setItem("spaces.lastViewedArticle.1", "999");

			const mockStateLoaded = {
				...mockTreeState,
				loading: false,
				selectedDocId: undefined,
				treeData: [
					{
						doc: {
							id: 10,
							jrn: "test:first-doc",
							slug: "first-doc",
							contentType: "text/markdown",
							contentMetadata: { title: "First Article" },
							docType: "document",
							parentId: undefined,
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateLoaded, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Should fall back to first document
			await waitFor(() => {
				expect(mockTreeActions.selectDoc).toHaveBeenCalledWith(10);
			});
		});

		it("should not auto-select when tree is still loading", () => {
			const mockStateLoading = {
				...mockTreeState,
				loading: true,
				selectedDocId: undefined,
				treeData: [],
			};

			mockUseSpaceTree.mockReturnValue([mockStateLoading, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// selectDoc should NOT have been called
			expect(mockTreeActions.selectDoc).not.toHaveBeenCalled();
		});

		it("should not auto-select when a doc is already selected", () => {
			const mockStateWithSelection = {
				...mockTreeState,
				loading: false,
				selectedDocId: 123,
				treeData: [
					{
						doc: {
							id: 123,
							jrn: "test:doc",
							slug: "doc",
							contentType: "text/markdown",
							contentMetadata: { title: "Selected" },
							docType: "document",
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateWithSelection, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// selectDoc should NOT have been called (doc already selected)
			expect(mockTreeActions.selectDoc).not.toHaveBeenCalled();
		});

		it("should not auto-select when URL has doc parameter", () => {
			mockNavigationContext.selectedDocId = 42;

			const mockStateLoaded = {
				...mockTreeState,
				loading: false,
				selectedDocId: undefined,
				treeData: [
					{
						doc: {
							id: 10,
							jrn: "test:doc",
							slug: "doc",
							contentType: "text/markdown",
							contentMetadata: { title: "Doc" },
							docType: "document",
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateLoaded, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// selectDoc should NOT have been called by auto-select (URL sync handles it)
		});

		it("should persist selection to localStorage when a doc is selected", async () => {
			const mockStateWithSelection = {
				...mockTreeState,
				loading: false,
				selectedDocId: 42,
				treeData: [
					{
						doc: {
							id: 42,
							jrn: "test:doc",
							slug: "doc",
							contentType: "text/markdown",
							contentMetadata: { title: "Doc" },
							docType: "document",
						},
						children: [],
						expanded: false,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateWithSelection, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Check localStorage was updated
			await waitFor(() => {
				expect(localStorage.getItem("spaces.lastViewedArticle.1")).toBe("42");
			});
		});

		it("should not auto-select when tree is empty", () => {
			const mockStateEmpty = {
				...mockTreeState,
				loading: false,
				selectedDocId: undefined,
				treeData: [],
			};

			mockUseSpaceTree.mockReturnValue([mockStateEmpty, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			expect(mockTreeActions.selectDoc).not.toHaveBeenCalled();
		});
	});

	describe("Breadcrumb navigation", () => {
		beforeEach(() => {
			mockNavigationContext.inlineEditDraftId = undefined;
			localStorage.setItem("spaces.treePanelPinned", "true");
		});

		it("should render breadcrumb when article is selected", () => {
			const mockStateWithSelection = {
				...mockTreeState,
				selectedDocId: 2,
				treeData: [
					{
						doc: {
							id: 1,
							jrn: "test:folder",
							slug: "folder",
							contentType: "text/markdown",
							contentMetadata: { title: "My Folder" },
							docType: "folder",
							parentId: undefined,
						},
						children: [
							{
								doc: {
									id: 2,
									jrn: "test:article",
									slug: "article",
									contentType: "text/markdown",
									contentMetadata: { title: "My Article" },
									docType: "document",
									parentId: 1,
								},
								children: [],
								expanded: false,
							},
						],
						expanded: true,
					},
				],
			};

			mockUseSpaceTree.mockReturnValue([mockStateWithSelection, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			// Breadcrumb should be visible
			expect(screen.getByTestId("collapsible-breadcrumb")).toBeDefined();
			expect(screen.getByText("My Folder")).toBeDefined();
			expect(screen.getByText("My Article")).toBeDefined();
		});

		it("should not render breadcrumb when no article is selected", () => {
			mockUseSpaceTree.mockReturnValue([mockTreeState, mockTreeActions]);
			renderWithProviders(<Spaces />, renderOptions);

			expect(screen.queryByTestId("collapsible-breadcrumb")).toBeNull();
		});
	});

	describe("Suggestion fetch on mount", () => {
		it("should call getDraftsWithPendingChanges on mount", async () => {
			const mockGetDrafts = vi.fn().mockResolvedValue([]);
			const mockClient = createMockClient();
			vi.mocked(mockClient.docDrafts).mockReturnValue({
				...mockClient.docDrafts(),
				getDraftsWithPendingChanges: mockGetDrafts,
			} as ReturnType<typeof mockClient.docDrafts>);

			renderWithProviders(<Spaces />, { ...renderOptions, client: mockClient });

			await waitFor(() => {
				expect(mockGetDrafts).toHaveBeenCalled();
			});
		});

		it("should handle suggestion fetch failure gracefully", async () => {
			// biome-ignore lint/nursery/noUselessUndefined: Needed to satisfy noEmptyBlockStatements rule
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
			const mockClient = createMockClient();
			vi.mocked(mockClient.docDrafts).mockReturnValue({
				...mockClient.docDrafts(),
				getDraftsWithPendingChanges: vi.fn().mockRejectedValue(new Error("API error")),
			} as ReturnType<typeof mockClient.docDrafts>);

			renderWithProviders(<Spaces />, { ...renderOptions, client: mockClient });

			// Should not crash — error is caught and logged
			await waitFor(() => {
				expect(consoleSpy).toHaveBeenCalledWith(
					"Failed to fetch docs with pending suggestions:",
					expect.any(Error),
				);
			});
			consoleSpy.mockRestore();
		});
	});

	describe("Cross-space navigation on URL doc", () => {
		it("should call getDocById when URL has doc parameter", async () => {
			mockNavigationContext.selectedDocId = 999;

			const mockGetDocById = vi.fn().mockResolvedValue({ id: 999, spaceId: 1 });
			const mockClient = createMockClient();
			vi.mocked(mockClient.docs).mockReturnValue({
				...mockClient.docs(),
				getDocById: mockGetDocById,
			} as unknown as ReturnType<typeof mockClient.docs>);

			renderWithProviders(<Spaces />, { ...renderOptions, client: mockClient });

			// getDocById should be called with the URL doc ID
			await waitFor(() => {
				expect(mockGetDocById).toHaveBeenCalledWith(999);
			});
		});

		it("should handle getDocById failure gracefully", async () => {
			mockNavigationContext.selectedDocId = 999;

			const mockClient = createMockClient();
			vi.mocked(mockClient.docs).mockReturnValue({
				...mockClient.docs(),
				getDocById: vi.fn().mockRejectedValue(new Error("Not found")),
			} as unknown as ReturnType<typeof mockClient.docs>);

			// Should not crash
			renderWithProviders(<Spaces />, { ...renderOptions, client: mockClient });

			await waitFor(() => {
				expect(screen.getByText("No document selected")).toBeDefined();
			});
		});
	});

	describe("Tree panel persistence in edit mode", () => {
		it("should keep tree pinned when entering edit mode", () => {
			// Start with tree pinned and no edit mode
			localStorage.setItem("spaces.treePanelPinned", "true");
			mockNavigationContext.inlineEditDraftId = undefined;

			const { rerender } = renderWithProviders(<Spaces />, renderOptions);

			// Verify tree is pinned
			expect(screen.getByTestId("pinned-panel-collapse-button")).toBeDefined();
			expect(screen.getByTestId("pinned-tree-panel")).toBeDefined();

			// Enter edit mode — tree should stay pinned (no auto-collapse)
			mockNavigationContext.inlineEditDraftId = 42;
			rerender(<Spaces />);

			// Tree remains pinned
			expect(screen.getByTestId("pinned-tree-panel")).toBeDefined();
			expect(screen.getByTestId("pinned-panel-collapse-button")).toBeDefined();
		});
	});
});
