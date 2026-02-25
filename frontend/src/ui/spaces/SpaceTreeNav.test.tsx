import type { SpaceTreeActions, SpaceTreeState } from "../../hooks/useSpaceTree";
import { SpaceTreeNav } from "./SpaceTreeNav";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { DEFAULT_SPACE_FILTERS, type Doc } from "jolli-common";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock sonner toast - use vi.hoisted to ensure mock is available at module load time
const { mockToast } = vi.hoisted(() => ({
	mockToast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../../components/ui/Sonner", () => ({
	toast: mockToast,
}));

// Mock ParentFolderSelector to make folder selection testable
vi.mock("./ParentFolderSelector", () => ({
	ParentFolderSelector: ({
		folders,
		value,
		onChange,
		excludedIds,
	}: {
		folders: Array<{ id: number; name: string; depth: number }>;
		value: string;
		onChange: (value: string) => void;
		excludedIds?: Set<number>;
	}) => {
		const availableFolders = folders.filter(f => !excludedIds?.has(f.id));
		return (
			<div data-testid="parent-folder-selector">
				<span data-testid="current-value">{value}</span>
				{availableFolders.map(folder => (
					<button
						key={folder.id}
						type="button"
						data-testid={`folder-option-${folder.id}`}
						onClick={() => onChange(String(folder.id))}
					>
						{folder.name}
					</button>
				))}
				<button type="button" data-testid="folder-option-root" onClick={() => onChange("root")}>
					Root
				</button>
			</div>
		);
	},
}));

// Mock ClientContext for SpaceSearchResults component
const mockSearchInSpace = vi.fn();
const mockListChangesetsPage = vi.fn();
const mockSyncChangesetsClient = {
	listChangesetsPage: mockListChangesetsPage,
};
const mockSpacesClient = {
	searchInSpace: mockSearchInSpace,
};
const mockClient = {
	spaces: () => mockSpacesClient,
	syncChangesets: () => mockSyncChangesetsClient,
};

vi.mock("../../contexts/ClientContext", () => ({
	useClient: () => mockClient,
}));

// Mock SpaceContext for useCurrentSpace and useSpace hooks
const mockCurrentSpace = {
	id: 1,
	name: "Test Space",
	slug: "test-space",
	jrn: "space:test",
	description: undefined,
	ownerId: 1,
	defaultSort: "default",
	defaultFilters: DEFAULT_SPACE_FILTERS,
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-01T00:00:00Z",
};

const mockRefreshSpaces = vi.fn().mockResolvedValue(undefined);

vi.mock("../../contexts/SpaceContext", () => ({
	useCurrentSpace: () => mockCurrentSpace,
	useSpace: () => ({
		currentSpace: mockCurrentSpace,
		spaces: [mockCurrentSpace],
		favoriteSpaces: [],
		isLoading: false,
		error: undefined,
		switchSpace: vi.fn().mockResolvedValue(undefined),
		createSpace: vi.fn().mockResolvedValue(mockCurrentSpace),
		updateSpace: vi.fn().mockResolvedValue(mockCurrentSpace),
		deleteSpace: vi.fn().mockResolvedValue(undefined),
		migrateSpaceContent: vi.fn().mockResolvedValue(undefined),
		refreshSpaces: mockRefreshSpaces,
		toggleSpaceFavorite: vi.fn(),
		isFavorite: vi.fn().mockReturnValue(false),
	}),
}));

// Mock the SpaceSwitcher component
vi.mock("./SpaceSwitcher", () => ({
	SpaceSwitcher: ({ onSpaceChange }: { onSpaceChange?: () => void }) => (
		<div data-testid="space-switcher" onClick={onSpaceChange}>
			Space Switcher
		</div>
	),
}));

// Mock NavigationContext for Settings button navigation
const mockNavigate = vi.fn();
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		navigate: mockNavigate,
	}),
}));

// Mock the SpaceSortMenu component (it uses useClient and useSpace hooks that require providers)
vi.mock("./SpaceSortMenu", () => ({
	SpaceSortMenu: ({
		sortMode,
		isDefaultSort,
		onSortModeChange,
	}: {
		sortMode: string;
		isDefaultSort: boolean;
		onSortModeChange: (mode: string) => void;
		onResetToDefault: () => void;
	}) => (
		<div
			data-testid="space-sort-menu"
			data-sort-mode={sortMode}
			data-is-default={isDefaultSort}
			onClick={() => onSortModeChange("alphabetical_asc")}
		>
			Sort Menu
		</div>
	),
}));

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

describe("SpaceTreeNav", () => {
	const mockActions: SpaceTreeActions = {
		loadTree: vi.fn().mockResolvedValue(undefined),
		loadTrash: vi.fn().mockResolvedValue(undefined),
		toggleExpanded: vi.fn(),
		selectDoc: vi.fn(),
		setShowTrash: vi.fn(),
		createFolder: vi.fn().mockResolvedValue(createMockDoc({ docType: "folder" })),
		createDoc: vi.fn().mockResolvedValue(createMockDoc()),
		softDelete: vi.fn().mockResolvedValue(undefined),
		restore: vi.fn().mockResolvedValue(undefined),
		refreshTree: vi.fn().mockResolvedValue(undefined),
		rename: vi.fn().mockResolvedValue(createMockDoc()),
		setSearchQuery: vi.fn(),
		clearSearch: vi.fn(),
		setSortMode: vi.fn(),
		resetToDefaultSort: vi.fn(),
		reorderDoc: vi.fn().mockResolvedValue(undefined),
		moveTo: vi.fn().mockResolvedValue(undefined),
		reorderAt: vi.fn().mockResolvedValue(undefined),
		setFilters: vi.fn(),
		resetToDefaultFilters: vi.fn(),
	};

	function createMockState(overrides: Partial<SpaceTreeState> = {}): SpaceTreeState {
		return {
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
			filters: DEFAULT_SPACE_FILTERS,
			filterCount: 0,
			isMatchingSpaceDefaultFilters: true,
			...overrides,
		};
	}

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		// Default mock for search - returns empty results
		mockSearchInSpace.mockResolvedValue({ results: [], total: 0, limited: false });
		mockListChangesetsPage.mockResolvedValue({ changesets: [], hasMore: false });
		mockNavigate.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should render SpaceSwitcher", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("space-switcher")).toBeDefined();
	});

	it("should call selectDoc with undefined when space changes", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Click SpaceSwitcher to trigger onSpaceChange
		fireEvent.click(screen.getByTestId("space-switcher"));

		expect(mockActions.selectDoc).toHaveBeenCalledWith(undefined);
	});

	it("should render loading state", () => {
		const state = createMockState({ loading: true });

		const { container } = render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Verify Skeleton components are rendered
		const skeletons = container.querySelectorAll(".animate-pulse");
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("should render empty state when no documents", () => {
		const state = createMockState({ treeData: [], loading: false });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByText("No documents yet")).toBeDefined();
	});

	it("should render tree items when documents exist", () => {
		const doc = createMockDoc({ contentMetadata: { title: "My Document" } });
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByText("My Document")).toBeDefined();
	});

	it("should render create item menu", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("create-item-menu-trigger")).toBeDefined();
	});

	it("should show trash menu when hasTrash is true", () => {
		const state = createMockState({ hasTrash: true });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("space-more-menu-trigger")).toBeDefined();
	});

	it("should not show trash menu when hasTrash is false", () => {
		const state = createMockState({ hasTrash: false });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("space-more-menu-trigger")).toBeNull();
	});

	it("should call loadTrash and setShowTrash when clicking trash option", async () => {
		const state = createMockState({ hasTrash: true });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open menu
		fireEvent.click(screen.getByTestId("space-more-menu-trigger"));

		// Click trash option
		await waitFor(() => {
			const trashOption = screen.getByTestId("show-trash-option");
			fireEvent.click(trashOption);
		});

		expect(mockActions.loadTrash).toHaveBeenCalled();
		expect(mockActions.setShowTrash).toHaveBeenCalledWith(true);
	});

	it("should render TrashView when showTrash is true", () => {
		const trashDoc = createMockDoc({
			id: 2,
			deletedAt: "2024-01-02T00:00:00Z",
			explicitlyDeleted: false,
			contentMetadata: { title: "Deleted Document" },
		});
		const state = createMockState({
			showTrash: true,
			trashData: [trashDoc],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("trash-back-button")).toBeDefined();
		expect(screen.getByText("Deleted Document")).toBeDefined();
	});

	it("should keep SpaceSwitcher visible when showTrash is true", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// SpaceSwitcher should still be visible when viewing trash
		expect(screen.getByTestId("space-switcher")).toBeDefined();
	});

	it("should show trash header when showTrash is true", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("trash-header")).toBeDefined();
		expect(screen.getByText("Trash")).toBeDefined();
	});

	it("should hide search box when showTrash is true", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("space-search")).toBeNull();
	});

	it("should hide create menu when showTrash is true", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("create-item-menu-trigger")).toBeNull();
	});

	it("should render trash content container when showTrash is true", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("trash-content")).toBeDefined();
	});

	it("should call setShowTrash(false) when clicking back in TrashView", () => {
		const state = createMockState({
			showTrash: true,
			trashData: [],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		fireEvent.click(screen.getByTestId("trash-back-button"));

		expect(mockActions.setShowTrash).toHaveBeenCalledWith(false);
	});

	it("should call createFolder with correct parentId", async () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open create menu
		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		// Click create folder option
		await waitFor(() => {
			const folderOption = screen.getByTestId("create-folder-option");
			fireEvent.click(folderOption);
		});

		// Fill in the folder name
		await waitFor(() => {
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "New Folder" } });
		});

		// Confirm creation
		fireEvent.click(screen.getByTestId("create-button"));

		await waitFor(() => {
			expect(mockActions.createFolder).toHaveBeenCalledWith(undefined, "New Folder");
		});
	});

	it("should call createDoc with correct parentId", async () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open create menu
		fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

		// Click create doc option - this immediately creates an "Untitled" article (no dialog)
		await act(() => {
			const docOption = screen.getByTestId("create-doc-option");
			fireEvent.click(docOption);
		});

		// createDoc should be called with "Untitled" (default name)
		expect(mockActions.createDoc).toHaveBeenCalledWith(undefined, "Untitled", "text/markdown");
	});

	it("should render with correct tree structure", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByRole("tree")).toBeDefined();
		expect(screen.getByTestId("space-tree")).toBeDefined();
	});

	it("should notify dropdown open state changes", async () => {
		const state = createMockState();
		const onDropdownOpenChange = vi.fn();

		render(<SpaceTreeNav state={state} actions={mockActions} onDropdownOpenChange={onDropdownOpenChange} />);

		await waitFor(() => {
			expect(onDropdownOpenChange).toHaveBeenCalledWith(false);
		});
	});

	it("should call restore from trash view", async () => {
		const trashDoc = createMockDoc({
			id: 2,
			deletedAt: "2024-01-02T00:00:00Z",
			explicitlyDeleted: false,
			contentMetadata: { title: "Deleted Document" },
		});
		const state = createMockState({
			showTrash: true,
			trashData: [trashDoc],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Click restore button
		const restoreButton = screen.getByTestId("restore-item-2");
		fireEvent.click(restoreButton);

		await waitFor(() => {
			expect(mockActions.restore).toHaveBeenCalledWith(2);
		});
	});

	it("should call softDelete when delete is triggered from tree item", async () => {
		const doc = createMockDoc({
			id: 3,
			contentMetadata: { title: "Document to Delete" },
		});
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open the tree item action menu
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Click delete option
		await waitFor(() => {
			const deleteOption = screen.getByTestId("delete-item-option");
			fireEvent.click(deleteOption);
		});

		// Confirm deletion in the alert dialog
		await waitFor(() => {
			const confirmButton = screen.getByTestId("delete-confirm-button");
			fireEvent.click(confirmButton);
		});

		await waitFor(() => {
			expect(mockActions.softDelete).toHaveBeenCalledWith(3);
		});
	});

	it("should render search box", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.getByTestId("space-search")).toBeDefined();
	});

	it("should hide create menu and tree when searching", () => {
		const state = createMockState({
			isSearching: true,
			searchQuery: "test",
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Create menu should be hidden when searching
		expect(screen.queryByTestId("create-item-menu-trigger")).toBeNull();
		// Tree should be hidden when searching
		expect(screen.queryByTestId("space-tree")).toBeNull();
	});

	it("should call setSearchQuery when search input changes after debounce", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		const searchInput = screen.getByTestId("space-search-input");
		fireEvent.input(searchInput, { target: { value: "test query" } });

		// Fast forward past debounce time (500ms)
		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(mockActions.setSearchQuery).toHaveBeenCalledWith("test query");
	});

	it("should call clearSearch when search is cleared", () => {
		const state = createMockState({
			searchQuery: "test",
			isSearching: false,
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Type something first to show clear button
		const searchInput = screen.getByTestId("space-search-input");
		fireEvent.input(searchInput, { target: { value: "test" } });

		// Clear button should appear
		const clearButton = screen.getByTestId("space-search-clear");
		fireEvent.click(clearButton);

		expect(mockActions.clearSearch).toHaveBeenCalled();
	});

	it("should call selectDoc when search result is clicked", async () => {
		// Mock search response with a result
		mockSearchInSpace.mockResolvedValue({
			results: [
				{
					doc: {
						id: 123,
						jrn: "doc:test-123",
						slug: "test-123",
						path: "",
						docType: "document",
						contentMetadata: { title: "Test Result" },
						content: "",
						contentType: "text/markdown",
						spaceId: 1,
						parentId: undefined,
						sortOrder: 0,
						version: 1,
						source: undefined,
						sourceMetadata: undefined,
						createdBy: "user",
						updatedBy: "user",
						createdAt: "2024-01-01T00:00:00Z",
						updatedAt: "2024-01-01T00:00:00Z",
						deletedAt: undefined,
						explicitlyDeleted: false,
					},
					contentSnippet: "",
					matchType: "title",
					relevance: 1.0,
				},
			],
			total: 1,
			limited: false,
		});

		const state = createMockState({
			isSearching: true,
			searchQuery: "test",
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Wait for search results to render
		await waitFor(() => {
			expect(screen.getByTestId("search-result-123")).toBeDefined();
		});

		// Click on search result
		fireEvent.click(screen.getByTestId("search-result-123"));

		expect(mockActions.selectDoc).toHaveBeenCalledWith(123);
	});

	it("should call rename when rename is triggered from tree item", async () => {
		const doc = createMockDoc({
			id: 4,
			contentMetadata: { title: "Document to Rename" },
		});
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open the tree item action menu
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Click rename option
		await waitFor(() => {
			const renameOption = screen.getByTestId("rename-item-option");
			fireEvent.click(renameOption);
		});

		// Fill in the new name
		await waitFor(() => {
			const input = screen.getByTestId("rename-item-name-input");
			fireEvent.input(input, { target: { value: "New Name" } });
		});

		// Confirm rename
		fireEvent.click(screen.getByTestId("rename-save-button"));

		await waitFor(() => {
			expect(mockActions.rename).toHaveBeenCalledWith(4, "New Name");
		});
	});

	it("should call reorderDoc when Move Down is triggered from tree item in default sort mode", async () => {
		const doc1 = createMockDoc({
			id: 1,
			contentMetadata: { title: "First Document" },
		});
		const doc2 = createMockDoc({
			id: 2,
			contentMetadata: { title: "Second Document" },
		});
		const state = createMockState({
			treeData: [
				{ doc: doc1, children: [], expanded: false },
				{ doc: doc2, children: [], expanded: false },
			],
			sortMode: "default",
			isDefaultSort: true,
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Find the first tree item's action menu trigger
		const actionMenuTriggers = screen.getAllByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTriggers[0]);

		// Click Move Down option (use getAllByTestId since each tree item has one)
		await waitFor(() => {
			const moveDownOptions = screen.getAllByTestId("move-down-option");
			fireEvent.click(moveDownOptions[0]);
		});

		await waitFor(() => {
			expect(mockActions.reorderDoc).toHaveBeenCalledWith(1, "down");
		});
	});

	it("should render SpaceTreeNav with nested tree structure to enable moveTo path", () => {
		// This test ensures the nested tree structure is rendered,
		// which exercises the findDocInTree function (lines 54-65) when moveTo is called
		const parentFolder = createMockDoc({
			id: 1,
			docType: "folder",
			contentMetadata: { title: "Parent Folder" },
		});
		const childDoc = createMockDoc({
			id: 2,
			parentId: 1,
			contentMetadata: { title: "Child Document" },
		});
		const state = createMockState({
			treeData: [
				{
					doc: parentFolder,
					children: [{ doc: childDoc, children: [], expanded: false }],
					expanded: true,
				},
			],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Verify both parent and child are rendered
		expect(screen.getByText("Parent Folder")).toBeDefined();
		expect(screen.getByText("Child Document")).toBeDefined();

		// Note: The handleMoveTo function (lines 143-152) including findDocInTree (lines 54-65)
		// is covered when TreeItem calls actions.moveTo, which is tested in TreeItem.test.tsx
	});

	it("should show success toast when Move To succeeds", async () => {
		// Use real timers for this async test
		vi.useRealTimers();

		// Use a document inside a folder - the doc can be moved to root
		const doc = createMockDoc({
			id: 5,
			parentId: 10, // Currently inside folder
			contentMetadata: { title: "Document to Move" },
		});
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open the tree item action menu
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Click Move to option
		await waitFor(() => {
			const moveToOption = screen.getByTestId("move-to-option");
			fireEvent.click(moveToOption);
		});

		// Select root from the mocked ParentFolderSelector
		await waitFor(() => {
			const rootOption = screen.getByTestId("folder-option-root");
			fireEvent.click(rootOption);
		});

		// Click confirm button in the MoveItemDialog
		fireEvent.click(screen.getByTestId("move-dialog-confirm"));

		await waitFor(() => {
			expect(mockActions.moveTo).toHaveBeenCalledWith(5, undefined);
		});

		await waitFor(() => {
			expect(mockToast.success).toHaveBeenCalled();
		});

		// Restore fake timers for other tests
		vi.useFakeTimers();
	});

	it("should show error toast when Move To fails", async () => {
		// Use real timers for this async test
		vi.useRealTimers();

		const doc = createMockDoc({
			id: 6,
			parentId: 11, // Currently inside folder
			contentMetadata: { title: "Document to Move" },
		});
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		// Mock moveTo to reject
		vi.mocked(mockActions.moveTo).mockRejectedValueOnce(new Error("Move failed"));

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open the tree item action menu
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Click Move to option
		await waitFor(() => {
			const moveToOption = screen.getByTestId("move-to-option");
			fireEvent.click(moveToOption);
		});

		// Select root from the mocked ParentFolderSelector
		await waitFor(() => {
			const rootOption = screen.getByTestId("folder-option-root");
			fireEvent.click(rootOption);
		});

		// Click confirm button in the MoveItemDialog
		fireEvent.click(screen.getByTestId("move-dialog-confirm"));

		await waitFor(() => {
			expect(mockActions.moveTo).toHaveBeenCalledWith(6, undefined);
		});

		await waitFor(() => {
			expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
		});

		// Restore fake timers for other tests
		vi.useFakeTimers();
	});

	it("should use jrn as item name when title is not available in Move To toast", async () => {
		// Use real timers for this async test
		vi.useRealTimers();

		const doc = createMockDoc({
			id: 7,
			jrn: "doc:test-jrn",
			parentId: 12, // Currently inside folder
			contentMetadata: undefined,
		});
		const state = createMockState({
			treeData: [{ doc, children: [], expanded: false }],
		});

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Open the tree item action menu
		const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
		fireEvent.click(actionMenuTrigger);

		// Click Move to option
		await waitFor(() => {
			const moveToOption = screen.getByTestId("move-to-option");
			fireEvent.click(moveToOption);
		});

		// Select root from the mocked ParentFolderSelector
		await waitFor(() => {
			const rootOption = screen.getByTestId("folder-option-root");
			fireEvent.click(rootOption);
		});

		// Click confirm button in the MoveItemDialog
		fireEvent.click(screen.getByTestId("move-dialog-confirm"));

		await waitFor(() => {
			expect(mockActions.moveTo).toHaveBeenCalledWith(7, undefined);
		});

		await waitFor(() => {
			expect(mockToast.success).toHaveBeenCalled();
		});

		// Restore fake timers for other tests
		vi.useFakeTimers();
	});

	it("should navigate to settings when Settings button is clicked", () => {
		const state = createMockState();

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		// Find and click the Settings button
		const settingsButton = screen.getByTestId("space-settings-button");
		expect(settingsButton).toBeDefined();

		fireEvent.click(settingsButton);

		expect(mockNavigate).toHaveBeenCalledWith("/spaces/1/settings/general");
	});

	it("should not render Settings button in trash view", () => {
		const state = createMockState({ showTrash: true });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("space-settings-button")).toBeNull();
	});

	it("should not render Settings button when searching", () => {
		const state = createMockState({ isSearching: true, searchQuery: "test" });

		render(<SpaceTreeNav state={state} actions={mockActions} />);

		expect(screen.queryByTestId("space-settings-button")).toBeNull();
	});

	it("renders bundle accordion above settings footer", async () => {
		mockListChangesetsPage.mockResolvedValue({
			changesets: [
				{
					id: 11,
					seq: 1,
					message: "Bundle message",
					mergePrompt: null,
					pushedBy: null,
					clientChangesetId: "CID-BUNDLE-001",
					status: "proposed",
					commitScopeKey: "space:1",
					targetBranch: "main",
					payloadHash: "hash-1",
					publishedAt: null,
					publishedBy: null,
					createdAt: "2024-01-01T00:00:00.000Z",
					summary: {
						totalFiles: 2,
						accepted: 0,
						rejected: 0,
						amended: 0,
						pending: 2,
						additions: 4,
						deletions: 1,
					},
				},
			],
			hasMore: false,
		});

		const state = createMockState();
		render(<SpaceTreeNav state={state} actions={mockActions} />);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-bundle-11")).toBeDefined();
		});

		const bundlesSection = screen.getByTestId("changeset-bundles-section");
		const settingsFooter = screen.getByTestId("space-settings-footer");
		expect(bundlesSection.nextElementSibling).toBe(settingsFooter);
	});

	it("reloads bundle list when bundleRefreshKey changes", async () => {
		const state = createMockState();
		const { rerender } = render(<SpaceTreeNav state={state} actions={mockActions} bundleRefreshKey={0} />);

		await waitFor(() => {
			expect(mockListChangesetsPage).toHaveBeenCalled();
		});
		const initialLoadCount = mockListChangesetsPage.mock.calls.length;

		rerender(<SpaceTreeNav state={state} actions={mockActions} bundleRefreshKey={1} />);

		await waitFor(() => {
			expect(mockListChangesetsPage.mock.calls.length).toBeGreaterThan(initialLoadCount);
		});
	});

	it("selects and clears bundle selection when clicking the same bundle", async () => {
		mockListChangesetsPage.mockResolvedValue({
			changesets: [
				{
					id: 12,
					seq: 1,
					message: null,
					mergePrompt: null,
					pushedBy: null,
					clientChangesetId: "CID-BUNDLE-002",
					status: "proposed",
					commitScopeKey: "space:1",
					targetBranch: "main",
					payloadHash: "hash-2",
					publishedAt: null,
					publishedBy: null,
					createdAt: "2024-01-01T00:00:00.000Z",
					summary: {
						totalFiles: 1,
						accepted: 0,
						rejected: 0,
						amended: 0,
						pending: 1,
						additions: 1,
						deletions: 0,
					},
				},
			],
			hasMore: false,
		});

		const onSelectChangeset = vi.fn();
		const state = createMockState();
		render(
			<SpaceTreeNav
				state={state}
				actions={mockActions}
				onSelectChangeset={onSelectChangeset}
				selectedChangesetId={12}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("changeset-bundle-12")).toBeDefined();
		});
		fireEvent.click(screen.getByTestId("changeset-bundle-12"));
		expect(onSelectChangeset).toHaveBeenCalledWith(undefined);
	});

	it("loads more bundles when Load more is clicked", async () => {
		vi.useRealTimers();
		try {
			mockListChangesetsPage
				.mockResolvedValueOnce({
					changesets: [
						{
							id: 20,
							seq: 1,
							message: null,
							mergePrompt: null,
							pushedBy: null,
							clientChangesetId: "CID-BUNDLE-020",
							status: "proposed",
							commitScopeKey: "space:1",
							targetBranch: "main",
							payloadHash: "hash-20",
							publishedAt: null,
							publishedBy: null,
							createdAt: "2024-01-01T00:00:00.000Z",
							summary: {
								totalFiles: 1,
								accepted: 0,
								rejected: 0,
								amended: 0,
								pending: 1,
								additions: 1,
								deletions: 0,
							},
						},
					],
					hasMore: true,
					nextBeforeId: 20,
				})
				.mockResolvedValueOnce({
					changesets: [
						{
							id: 19,
							seq: 1,
							message: null,
							mergePrompt: null,
							pushedBy: null,
							clientChangesetId: "CID-BUNDLE-019",
							status: "proposed",
							commitScopeKey: "space:1",
							targetBranch: "main",
							payloadHash: "hash-19",
							publishedAt: null,
							publishedBy: null,
							createdAt: "2024-01-01T00:00:00.000Z",
							summary: {
								totalFiles: 1,
								accepted: 0,
								rejected: 0,
								amended: 0,
								pending: 1,
								additions: 1,
								deletions: 0,
							},
						},
					],
					hasMore: false,
				});

			const state = createMockState();
			render(<SpaceTreeNav state={state} actions={mockActions} />);

			await waitFor(() => {
				expect(screen.getByTestId("changeset-bundle-20")).toBeDefined();
			});
			expect(screen.getByTestId("changeset-bundles-load-more")).toBeDefined();

			fireEvent.click(screen.getByTestId("changeset-bundles-load-more"));

			await waitFor(() => {
				expect(screen.getByTestId("changeset-bundle-19")).toBeDefined();
			});
			expect(screen.queryByTestId("changeset-bundles-load-more")).toBeNull();
			expect(mockListChangesetsPage).toHaveBeenNthCalledWith(2, {
				spaceSlug: "test-space",
				limit: 50,
				beforeId: 20,
			});
		} finally {
			vi.useFakeTimers();
		}
	});

	describe("Drag and Drop", () => {
		function createDragState(): SpaceTreeState {
			const doc1 = createMockDoc({
				id: 1,
				sortOrder: 0,
				contentMetadata: { title: "Document 1" },
			});
			const doc2 = createMockDoc({
				id: 2,
				sortOrder: 1,
				contentMetadata: { title: "Document 2" },
			});

			return createMockState({
				treeData: [
					{ doc: doc1, children: [], expanded: false },
					{ doc: doc2, children: [], expanded: false },
				],
				isDefaultSort: true,
			});
		}

		it("should handle drag start event", () => {
			// Use real timers for async drag events
			vi.useRealTimers();

			const state = createDragState();

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Find a draggable item
			const treeItems = screen.getAllByRole("treeitem");
			expect(treeItems.length).toBeGreaterThan(0);

			// Simulate pointerdown on the first item (this triggers the drag sensors)
			fireEvent.pointerDown(treeItems[0], { pointerId: 1, button: 0 });

			// Clean up
			fireEvent.pointerUp(treeItems[0], { pointerId: 1 });

			vi.useFakeTimers();
		});

		it("should ignore non-left click drag start", () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 2, clientX: 0, clientY: 0 });
			});
			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			expect(screen.queryByTestId("tree-item-drag-overlay")).toBeNull();

			rafSpy.mockRestore();
			vi.useFakeTimers();
		});

		it("should ignore pointer up with mismatched pointerId", () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});
			act(() => {
				fireEvent.pointerUp(window, { pointerId: 2 });
			});

			expect(screen.queryByTestId("tree-item-drag-overlay")).toBeNull();

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			rafSpy.mockRestore();
			vi.useFakeTimers();
		});

		it("should render drag overlay and toggle userSelect during drag", async () => {
			vi.useRealTimers();

			const state = createDragState();

			const originalUserSelect = document.body.style.userSelect;
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			expect(document.body.style.userSelect).toBe("none");

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			expect(document.body.style.userSelect).toBe(originalUserSelect);

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should set and restore body cursor during drag", async () => {
			vi.useRealTimers();

			const state = createDragState();

			const originalCursor = document.body.style.cursor;
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			expect(document.body.style.cursor).toBe("grabbing");

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			expect(document.body.style.cursor).toBe(originalCursor);

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should cap drag overlay width based on container size", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			const treeContainer = screen.getByTestId("space-tree").parentElement as HTMLDivElement;
			Object.defineProperty(treeContainer, "clientWidth", { value: 200, configurable: true });
			Object.defineProperty(treeContainer, "scrollTop", { value: 0, writable: true, configurable: true });
			const containerRectSpy = vi.spyOn(treeContainer, "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 200,
				left: 0,
				right: 200,
				width: 200,
				height: 200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});
			const itemRectSpy = vi.spyOn(treeItem, "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 32,
				left: 0,
				right: 240,
				width: 240,
				height: 32,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			const overlay = screen.getByTestId("tree-item-drag-overlay");
			const overlayWrapper = overlay.parentElement as HTMLDivElement;

			await waitFor(() => {
				expect(overlayWrapper.style.width).toBe("184px");
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			itemRectSpy.mockRestore();
			containerRectSpy.mockRestore();
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should ignore click immediately after drag and allow subsequent selection", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			fireEvent.click(treeItem);
			expect(mockActions.selectDoc).not.toHaveBeenCalled();

			fireEvent.click(treeItem);
			expect(mockActions.selectDoc).toHaveBeenCalledWith(1);

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should ignore pointer down while dragging", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItems = screen.getAllByRole("treeitem");
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItems[0] as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItems[0], { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerDown(treeItems[1], { pointerId: 1, button: 0, clientX: 10, clientY: 0 });
			});

			expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should not start drag when movement is below threshold", () => {
			vi.useRealTimers();

			const state = createDragState();
			const originalUserSelect = document.body.style.userSelect;
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 2, clientY: 0 });
			});

			expect(screen.queryByTestId("tree-item-drag-overlay")).toBeNull();
			expect(document.body.style.userSelect).toBe(originalUserSelect);

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should not commit drop when no target is resolved", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi.spyOn(document, "elementFromPoint").mockReturnValue(null);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			expect(mockActions.reorderAt).not.toHaveBeenCalled();
			expect(mockActions.moveTo).not.toHaveBeenCalled();

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should ignore invalid tree item ids from hit testing", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			const fakeTarget = document.createElement("div");
			fakeTarget.setAttribute("data-testid", "tree-item-foo");
			document.body.appendChild(fakeTarget);

			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(fakeTarget as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			expect(mockActions.reorderAt).not.toHaveBeenCalled();
			expect(mockActions.moveTo).not.toHaveBeenCalled();

			document.body.removeChild(fakeTarget);
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should auto-scroll when pointer is beyond container edge during drag", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			const treeContainer = screen.getByTestId("space-tree").parentElement as HTMLDivElement;
			Object.defineProperty(treeContainer, "scrollHeight", { value: 1000, configurable: true });
			Object.defineProperty(treeContainer, "clientHeight", { value: 200, configurable: true });
			Object.defineProperty(treeContainer, "scrollTop", { value: 0, writable: true, configurable: true });
			const rectSpy = vi.spyOn(treeContainer, "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 200,
				left: 0,
				right: 300,
				width: 300,
				height: 200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 260 });
			});

			await waitFor(() => {
				expect(treeContainer.scrollTop).toBeGreaterThan(0);
			});

			rectSpy.mockRestore();
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should auto-scroll when pointer is above the container during drag", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItem as unknown as Element);

			const treeContainer = screen.getByTestId("space-tree").parentElement as HTMLDivElement;
			Object.defineProperty(treeContainer, "scrollHeight", { value: 1000, configurable: true });
			Object.defineProperty(treeContainer, "clientHeight", { value: 200, configurable: true });
			Object.defineProperty(treeContainer, "scrollTop", { value: 50, writable: true, configurable: true });
			const rectSpy = vi.spyOn(treeContainer, "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 200,
				left: 0,
				right: 300,
				width: 300,
				height: 200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: -20 });
			});

			await waitFor(() => {
				expect(treeContainer.scrollTop).toBeLessThan(50);
			});

			rectSpy.mockRestore();
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should move item without reorder in non-default sort mode", async () => {
			vi.useRealTimers();

			const folder = createMockDoc({
				id: 10,
				docType: "folder",
				contentMetadata: { title: "Folder" },
			});
			const doc = createMockDoc({
				id: 11,
				jrn: "doc:drag-jrn",
				contentMetadata: undefined,
			});
			const state = createMockState({
				treeData: [
					{ doc: folder, children: [], expanded: false },
					{ doc, children: [], expanded: false },
				],
				isDefaultSort: false,
				sortMode: "alphabetical_asc",
			});

			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItems = screen.getAllByRole("treeitem");
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItems[0] as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItems[1], { pointerId: 1, button: 0, clientX: 0, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 20 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			await waitFor(() => {
				expect(mockActions.moveTo).toHaveBeenCalledWith(11, 10);
			});

			await waitFor(() => {
				expect(mockToast.success).toHaveBeenCalled();
			});

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should skip same-parent drops in non-default sort mode", async () => {
			vi.useRealTimers();

			const state = createMockState({
				...createDragState(),
				isDefaultSort: false,
				sortMode: "alphabetical_asc",
			});
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItems = screen.getAllByRole("treeitem");
			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItems[1] as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItems[0], { pointerId: 1, button: 0, clientX: 0, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 90 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			expect(mockActions.reorderAt).not.toHaveBeenCalled();
			expect(mockActions.moveTo).not.toHaveBeenCalled();

			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should show error toast when drag reorder fails", async () => {
			vi.useRealTimers();

			vi.mocked(mockActions.reorderAt).mockRejectedValueOnce(new Error("Reorder failed"));
			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItems = screen.getAllByRole("treeitem");
			const container = screen.getByTestId("space-tree").parentElement as HTMLDivElement;
			Object.defineProperty(container, "scrollTop", { value: 0, writable: true, configurable: true });
			Object.defineProperty(container, "scrollLeft", { value: 0, writable: true, configurable: true });
			const containerRectSpy = vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 200,
				left: 0,
				right: 200,
				width: 200,
				height: 200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});
			const itemRectSpy1 = vi.spyOn(treeItems[0], "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 32,
				left: 0,
				right: 200,
				width: 200,
				height: 32,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});
			const itemRectSpy2 = vi.spyOn(treeItems[1], "getBoundingClientRect").mockReturnValue({
				top: 40,
				bottom: 72,
				left: 0,
				right: 200,
				width: 200,
				height: 32,
				x: 0,
				y: 40,
				toJSON: () => ({}),
			});

			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItems[1] as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItems[0], { pointerId: 1, button: 0, clientX: 0, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 90 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			await waitFor(() => {
				expect(mockToast.error).toHaveBeenCalled();
			});

			containerRectSpy.mockRestore();
			itemRectSpy1.mockRestore();
			itemRectSpy2.mockRestore();
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should reorder items when dropping after another item", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItems = screen.getAllByRole("treeitem");
			const container = screen.getByTestId("space-tree").parentElement as HTMLDivElement;
			// Provide stable layout metrics so drag projection can resolve positions deterministically.
			Object.defineProperty(container, "scrollTop", { value: 0, writable: true, configurable: true });
			Object.defineProperty(container, "scrollLeft", { value: 0, writable: true, configurable: true });
			Object.defineProperty(container, "clientHeight", { value: 200, configurable: true });
			Object.defineProperty(container, "scrollHeight", { value: 200, configurable: true });

			const containerRect = {
				top: 0,
				bottom: 200,
				left: 0,
				right: 200,
				width: 200,
				height: 200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			};

			function buildItemRect(top: number) {
				return {
					top,
					bottom: top + 32,
					left: 0,
					right: 200,
					width: 200,
					height: 32,
					x: 0,
					y: top,
					toJSON: () => ({}),
				};
			}

			const containerRectSpy = vi.spyOn(container, "getBoundingClientRect").mockReturnValue(containerRect);
			const itemRectSpy1 = vi.spyOn(treeItems[0], "getBoundingClientRect").mockReturnValue(buildItemRect(0));
			const itemRectSpy2 = vi.spyOn(treeItems[1], "getBoundingClientRect").mockReturnValue(buildItemRect(40));

			const icon1 = treeItems[0].querySelector('[data-tree-icon="true"]') as HTMLElement | null;
			const icon2 = treeItems[1].querySelector('[data-tree-icon="true"]') as HTMLElement | null;
			const iconRect = {
				top: 0,
				bottom: 0,
				left: 16,
				right: 16,
				width: 0,
				height: 0,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			};
			const iconRectSpy1 = icon1 ? vi.spyOn(icon1, "getBoundingClientRect").mockReturnValue(iconRect) : null;
			const iconRectSpy2 = icon2 ? vi.spyOn(icon2, "getBoundingClientRect").mockReturnValue(iconRect) : null;

			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItems[1] as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItems[0], { pointerId: 1, button: 0, clientX: 0, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 90 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			await waitFor(() => {
				expect(mockActions.reorderAt).toHaveBeenCalledWith(1, 2, "after");
			});

			containerRectSpy.mockRestore();
			itemRectSpy1.mockRestore();
			itemRectSpy2.mockRestore();
			iconRectSpy1?.mockRestore();
			iconRectSpy2?.mockRestore();
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should move item into a collapsed folder on drop", async () => {
			vi.useRealTimers();

			const folder = createMockDoc({
				id: 10,
				docType: "folder",
				contentMetadata: { title: "Folder" },
			});
			const doc = createMockDoc({
				id: 11,
				contentMetadata: { title: "Document" },
			});
			const state = createMockState({
				treeData: [
					{ doc: folder, children: [], expanded: false },
					{ doc, children: [], expanded: false },
				],
				isDefaultSort: true,
			});

			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItems = screen.getAllByRole("treeitem");
			const container = screen.getByTestId("space-tree").parentElement as HTMLDivElement;
			// Keep container metrics stable for consistent drag calculations.
			Object.defineProperty(container, "scrollTop", { value: 0, writable: true, configurable: true });
			Object.defineProperty(container, "scrollLeft", { value: 0, writable: true, configurable: true });
			const containerRectSpy = vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				top: 0,
				bottom: 200,
				left: 0,
				right: 200,
				width: 200,
				height: 200,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(treeItems[0] as unknown as Element);

			act(() => {
				fireEvent.pointerDown(treeItems[1], { pointerId: 1, button: 0, clientX: 0, clientY: 10 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 20 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			await waitFor(() => {
				expect(mockActions.moveTo).toHaveBeenCalledWith(11, 10, null, "after");
			});

			await waitFor(() => {
				expect(mockToast.success).toHaveBeenCalled();
			});

			containerRectSpy.mockRestore();
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should ignore pointer hits outside tree items during drag", async () => {
			vi.useRealTimers();

			const state = createDragState();
			const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
				callback(0);
				return 1;
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getAllByRole("treeitem")[0];
			const outsideTarget = document.createElement("div");
			document.body.appendChild(outsideTarget);

			if (!document.elementFromPoint) {
				document.elementFromPoint = () => null;
			}
			const elementFromPointSpy = vi
				.spyOn(document, "elementFromPoint")
				.mockReturnValue(outsideTarget as Element);

			act(() => {
				fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
			});

			act(() => {
				fireEvent.pointerMove(window, { pointerId: 1, clientX: 10, clientY: 0 });
			});

			await waitFor(() => {
				expect(screen.getByTestId("tree-item-drag-overlay")).toBeDefined();
			});

			act(() => {
				fireEvent.pointerUp(window, { pointerId: 1 });
			});

			expect(mockActions.reorderAt).not.toHaveBeenCalled();
			expect(mockActions.moveTo).not.toHaveBeenCalled();

			document.body.removeChild(outsideTarget);
			rafSpy.mockRestore();
			elementFromPointSpy.mockRestore();

			vi.useFakeTimers();
		});

		it("should handle drag cancel when pointer is released without moving", () => {
			vi.useRealTimers();

			const doc = createMockDoc({
				id: 1,
				contentMetadata: { title: "Test Document" },
			});
			const state = createMockState({
				treeData: [{ doc, children: [], expanded: false }],
				isDefaultSort: true,
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			const treeItem = screen.getByRole("treeitem");
			fireEvent.pointerDown(treeItem, { pointerId: 1, button: 0 });
			fireEvent.pointerCancel(treeItem, { pointerId: 1 });

			vi.useFakeTimers();
		});

		it("should render with canReorder disabled when not in default sort", () => {
			const doc1 = createMockDoc({
				id: 1,
				sortOrder: 0,
				contentMetadata: { title: "Document 1" },
			});
			const doc2 = createMockDoc({
				id: 2,
				sortOrder: 1,
				contentMetadata: { title: "Document 2" },
			});
			const state = createMockState({
				treeData: [
					{ doc: doc1, children: [], expanded: false },
					{ doc: doc2, children: [], expanded: false },
				],
				isDefaultSort: false, // This disables reordering
				sortMode: "alphabetical_asc",
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Tree should still render
			expect(screen.getByTestId("space-tree")).toBeDefined();
			expect(screen.getByText("Document 1")).toBeDefined();
			expect(screen.getByText("Document 2")).toBeDefined();
		});

		it("should render folder with children for drag overlay calculations", () => {
			const parentFolder = createMockDoc({
				id: 1,
				docType: "folder",
				contentMetadata: { title: "Parent Folder" },
			});
			const childDoc1 = createMockDoc({
				id: 2,
				parentId: 1,
				contentMetadata: { title: "Child 1" },
			});
			const childDoc2 = createMockDoc({
				id: 3,
				parentId: 1,
				contentMetadata: { title: "Child 2" },
			});
			const state = createMockState({
				treeData: [
					{
						doc: parentFolder,
						children: [
							{ doc: childDoc1, children: [], expanded: false },
							{ doc: childDoc2, children: [], expanded: false },
						],
						expanded: true,
					},
				],
				isDefaultSort: true,
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// All items should be rendered
			expect(screen.getByText("Parent Folder")).toBeDefined();
			expect(screen.getByText("Child 1")).toBeDefined();
			expect(screen.getByText("Child 2")).toBeDefined();
		});
	});

	describe("extractFoldersFromTree", () => {
		it("should extract folders with correct depth for nested structure", () => {
			const parentFolder = createMockDoc({
				id: 1,
				docType: "folder",
				contentMetadata: { title: "Parent Folder" },
			});
			const nestedFolder = createMockDoc({
				id: 2,
				docType: "folder",
				parentId: 1,
				contentMetadata: { title: "Nested Folder" },
			});
			const childDoc = createMockDoc({
				id: 3,
				parentId: 2,
				contentMetadata: { title: "Child Document" },
			});
			const state = createMockState({
				treeData: [
					{
						doc: parentFolder,
						children: [
							{
								doc: nestedFolder,
								children: [{ doc: childDoc, children: [], expanded: false }],
								expanded: true,
							},
						],
						expanded: true,
					},
				],
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Verify the tree structure is rendered correctly
			expect(screen.getByText("Parent Folder")).toBeDefined();
			expect(screen.getByText("Nested Folder")).toBeDefined();
		});

		it("should handle folder without title in contentMetadata", () => {
			const folder = createMockDoc({
				id: 1,
				jrn: "doc:unnamed-folder",
				docType: "folder",
				contentMetadata: undefined,
			});
			const state = createMockState({
				treeData: [{ doc: folder, children: [], expanded: false }],
			});

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Should fallback to jrn
			expect(screen.getByText("doc:unnamed-folder")).toBeDefined();
		});
	});

	describe("Error handling", () => {
		it("should show error toast when rename fails", async () => {
			vi.useRealTimers();

			const doc = createMockDoc({
				id: 8,
				contentMetadata: { title: "Document to Rename" },
			});
			const state = createMockState({
				treeData: [{ doc, children: [], expanded: false }],
			});

			// Mock rename to reject
			vi.mocked(mockActions.rename).mockRejectedValueOnce(new Error("Rename failed"));

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Open the tree item action menu
			const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
			fireEvent.click(actionMenuTrigger);

			// Click rename option
			await waitFor(() => {
				const renameOption = screen.getByTestId("rename-item-option");
				fireEvent.click(renameOption);
			});

			// Enter new name in rename dialog
			await waitFor(() => {
				const nameInput = screen.getByTestId("rename-item-name-input");
				fireEvent.change(nameInput, { target: { value: "New Name" } });
			});

			// Click save button
			const saveButton = screen.getByTestId("rename-save-button");
			fireEvent.click(saveButton);

			await waitFor(() => {
				expect(mockActions.rename).toHaveBeenCalledWith(8, "New Name");
			});

			await waitFor(() => {
				expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
			});

			vi.useFakeTimers();
		});

		it("should show error toast when delete fails", async () => {
			vi.useRealTimers();

			const doc = createMockDoc({
				id: 9,
				contentMetadata: { title: "Document to Delete" },
			});
			const state = createMockState({
				treeData: [{ doc, children: [], expanded: false }],
			});

			// Mock softDelete to reject
			vi.mocked(mockActions.softDelete).mockRejectedValueOnce(new Error("Delete failed"));

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Open the tree item action menu
			const actionMenuTrigger = screen.getByTestId("item-action-menu-trigger");
			fireEvent.click(actionMenuTrigger);

			// Click delete option
			await waitFor(() => {
				const deleteOption = screen.getByTestId("delete-item-option");
				fireEvent.click(deleteOption);
			});

			// Confirm deletion in the alert dialog
			await waitFor(() => {
				const confirmButton = screen.getByTestId("delete-confirm-button");
				fireEvent.click(confirmButton);
			});

			await waitFor(() => {
				expect(mockActions.softDelete).toHaveBeenCalledWith(9);
			});

			await waitFor(() => {
				expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
			});

			vi.useFakeTimers();
		});

		it("should show error toast when reorder fails", async () => {
			vi.useRealTimers();

			// Need two documents so Move Down is enabled
			const doc1 = createMockDoc({
				id: 10,
				sortOrder: 0,
				contentMetadata: { title: "Document 1" },
			});
			const doc2 = createMockDoc({
				id: 11,
				sortOrder: 1,
				contentMetadata: { title: "Document 2" },
			});
			const state = createMockState({
				treeData: [
					{ doc: doc1, children: [], expanded: false },
					{ doc: doc2, children: [], expanded: false },
				],
				sortMode: "default",
				isDefaultSort: true,
			});

			// Mock reorderDoc to reject
			vi.mocked(mockActions.reorderDoc).mockRejectedValueOnce(new Error("Reorder failed"));

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Open the first tree item's action menu
			const actionMenuTriggers = screen.getAllByTestId("item-action-menu-trigger");
			fireEvent.click(actionMenuTriggers[0]);

			// Click Move Down option (use getAllByTestId since each tree item has one)
			await waitFor(() => {
				const moveDownOptions = screen.getAllByTestId("move-down-option");
				fireEvent.click(moveDownOptions[0]);
			});

			await waitFor(() => {
				expect(mockActions.reorderDoc).toHaveBeenCalledWith(10, "down");
			});

			await waitFor(() => {
				expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
			});
		});

		it("should show error toast when createFolder fails", async () => {
			const state = createMockState();

			// Mock createFolder to reject
			vi.mocked(mockActions.createFolder).mockRejectedValueOnce(new Error("Create folder failed"));

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Open create menu
			fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

			// Click create folder option
			await act(() => {
				const folderOption = screen.getByTestId("create-folder-option");
				fireEvent.click(folderOption);
			});

			// Dialog should now be open
			expect(screen.getByTestId("create-item-dialog-content")).toBeDefined();
			const input = screen.getByTestId("create-item-name-input");
			fireEvent.input(input, { target: { value: "New Folder" } });

			// Confirm creation
			await act(async () => {
				fireEvent.click(screen.getByTestId("create-button"));
				// Allow promise rejection to propagate
				await vi.runAllTimersAsync();
			});

			expect(mockActions.createFolder).toHaveBeenCalledWith(undefined, "New Folder");
			expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
		});

		it("should show error toast when createDoc fails", async () => {
			const state = createMockState();

			// Mock createDoc to reject
			vi.mocked(mockActions.createDoc).mockRejectedValueOnce(new Error("Create doc failed"));

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Open create menu
			fireEvent.click(screen.getByTestId("create-item-menu-trigger"));

			// Click create doc option - this immediately creates an "Untitled" article (no dialog)
			await act(async () => {
				const docOption = screen.getByTestId("create-doc-option");
				fireEvent.click(docOption);
				// Allow promise rejection to propagate
				await vi.runAllTimersAsync();
			});

			// createDoc should be called with "Untitled" (default name, no dialog)
			expect(mockActions.createDoc).toHaveBeenCalledWith(undefined, "Untitled", "text/markdown");
			expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
		});

		it("should show error toast when restore fails", async () => {
			const trashDoc = createMockDoc({
				id: 12,
				deletedAt: "2024-01-02T00:00:00Z",
				explicitlyDeleted: false,
				contentMetadata: { title: "Deleted Document" },
			});
			const state = createMockState({
				showTrash: true,
				trashData: [trashDoc],
			});

			// Mock restore to reject
			vi.mocked(mockActions.restore).mockRejectedValueOnce(new Error("Restore failed"));

			render(<SpaceTreeNav state={state} actions={mockActions} />);

			// Click restore button
			await act(async () => {
				const restoreButton = screen.getByTestId("restore-item-12");
				fireEvent.click(restoreButton);
				// Allow promise rejection to propagate
				await vi.runAllTimersAsync();
			});

			expect(mockActions.restore).toHaveBeenCalledWith(12);
			expect(mockToast.error).toHaveBeenCalledWith(expect.any(String));
		});
	});

	describe("computeFoldersWithSuggestions", () => {
		it("should show suggestion dot on folder when a descendant doc has suggestions", () => {
			const childDoc = createMockDoc({ id: 20, docType: "document" });
			const folderDoc = createMockDoc({ id: 10, docType: "folder", contentMetadata: { title: "Parent Folder" } });
			const state = createMockState({
				treeData: [
					{
						doc: folderDoc,
						children: [{ doc: childDoc, children: [], expanded: false }],
						expanded: true,
					},
				],
			});

			// Child doc ID 20 has suggestions
			const docsWithSuggestions = new Set([20]);

			render(<SpaceTreeNav state={state} actions={mockActions} docsWithSuggestions={docsWithSuggestions} />);

			// Folder should have suggestion dot because its descendant has suggestions
			expect(screen.getByTestId("suggestion-dot-10")).toBeDefined();
		});

		it("should not show suggestion dot on folder when no descendants have suggestions", () => {
			const childDoc = createMockDoc({ id: 20, docType: "document" });
			const folderDoc = createMockDoc({ id: 10, docType: "folder", contentMetadata: { title: "Parent Folder" } });
			const state = createMockState({
				treeData: [
					{
						doc: folderDoc,
						children: [{ doc: childDoc, children: [], expanded: false }],
						expanded: true,
					},
				],
			});

			// No docs have suggestions
			const docsWithSuggestions = new Set<number>();

			render(<SpaceTreeNav state={state} actions={mockActions} docsWithSuggestions={docsWithSuggestions} />);

			// Folder should NOT have suggestion dot
			expect(screen.queryByTestId("suggestion-dot-10")).toBeNull();
		});
	});
});
