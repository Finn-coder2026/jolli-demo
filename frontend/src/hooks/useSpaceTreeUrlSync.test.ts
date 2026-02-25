import type { SpaceTreeActions, SpaceTreeState } from "./useSpaceTree";
import { useSpaceTreeUrlSync } from "./useSpaceTreeUrlSync";
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock navigation context
const mockNavigate = vi.fn();
let mockUrlDocId: number | undefined;
let mockInlineEditDraftId: number | undefined;

vi.mock("../contexts/NavigationContext", () => ({
	useNavigation: () => ({
		selectedDocId: mockUrlDocId,
		inlineEditDraftId: mockInlineEditDraftId,
		navigate: mockNavigate,
	}),
}));

// Mock router context
let mockLocationSearch = "";

vi.mock("../contexts/RouterContext", () => ({
	useLocation: () => ({
		search: mockLocationSearch,
	}),
}));

describe("useSpaceTreeUrlSync", () => {
	// Create mock tree state
	const createMockTreeState = (selectedDocId?: number): SpaceTreeState => ({
		treeData: [],
		trashData: [],
		loading: false,
		hasTrash: false,
		selectedDocId,
		showTrash: false,
		searchQuery: "",
		isSearching: false,
		sortMode: "default",
		isDefaultSort: true,
		isMatchingSpaceDefault: true,
		filters: { updated: "any_time", creator: "" },
		filterCount: 0,
		isMatchingSpaceDefaultFilters: true,
	});

	// Create mock tree actions
	const createMockTreeActions = (): SpaceTreeActions => ({
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
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mockUrlDocId = undefined;
		mockInlineEditDraftId = undefined;
		mockLocationSearch = "";
	});

	describe("URL to tree sync", () => {
		it("should sync URL doc parameter to tree state when URL changes", () => {
			const treeState = createMockTreeState(undefined);
			const treeActions = createMockTreeActions();
			mockUrlDocId = 123;

			renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			expect(treeActions.selectDoc).toHaveBeenCalledWith(123);
		});

		it("should not sync when URL doc matches tree state", () => {
			const treeState = createMockTreeState(123);
			const treeActions = createMockTreeActions();
			mockUrlDocId = 123;

			renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			expect(treeActions.selectDoc).not.toHaveBeenCalled();
		});

		it("should not sync when URL doc is undefined", () => {
			const treeState = createMockTreeState(123);
			const treeActions = createMockTreeActions();
			mockUrlDocId = undefined;

			renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			expect(treeActions.selectDoc).not.toHaveBeenCalled();
		});
	});

	describe("edit mode exit refresh", () => {
		it("should refresh tree when returning from edit mode", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockInlineEditDraftId = 456;

			const { rerender } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			// Initially in edit mode, no refresh
			expect(treeActions.refreshTree).not.toHaveBeenCalled();

			// Exit edit mode
			mockInlineEditDraftId = undefined;
			rerender();

			expect(treeActions.refreshTree).toHaveBeenCalledTimes(1);
		});

		it("should not refresh when entering edit mode", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockInlineEditDraftId = undefined;

			const { rerender } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			// Enter edit mode
			mockInlineEditDraftId = 456;
			rerender();

			expect(treeActions.refreshTree).not.toHaveBeenCalled();
		});

		it("should not refresh when staying in edit mode", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockInlineEditDraftId = 456;

			const { rerender } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			// Change to different draft
			mockInlineEditDraftId = 789;
			rerender();

			expect(treeActions.refreshTree).not.toHaveBeenCalled();
		});
	});

	describe("selectDoc with URL sync", () => {
		it("should call original selectDoc and navigate when selecting a doc", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockLocationSearch = "";

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			act(() => {
				result.current.selectDoc(123);
			});

			expect(treeActions.selectDoc).toHaveBeenCalledWith(123);
			expect(mockNavigate).toHaveBeenCalledWith("/articles?doc=123");
		});

		it("should skip navigation when selecting the already-selected doc", () => {
			const treeState = createMockTreeState(123);
			const treeActions = createMockTreeActions();
			mockLocationSearch = "?doc=123";

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			act(() => {
				result.current.selectDoc(123);
			});

			expect(treeActions.selectDoc).not.toHaveBeenCalled();
			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("should preserve existing URL parameters when selecting a doc", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockLocationSearch = "?filter=active";

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			act(() => {
				result.current.selectDoc(456);
			});

			expect(mockNavigate).toHaveBeenCalledWith("/articles?filter=active&doc=456");
		});

		it("should strip edit parameter when selecting a doc to exit inline edit mode", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockLocationSearch = "?edit=99&doc=10";

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			act(() => {
				result.current.selectDoc(20);
			});

			expect(treeActions.selectDoc).toHaveBeenCalledWith(20);
			expect(mockNavigate).toHaveBeenCalledWith("/articles?doc=20");
		});

		it("should remove doc parameter when selecting undefined", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockLocationSearch = "?doc=123&filter=active";

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			act(() => {
				result.current.selectDoc(undefined);
			});

			expect(treeActions.selectDoc).toHaveBeenCalledWith(undefined);
			expect(mockNavigate).toHaveBeenCalledWith("/articles?filter=active");
		});

		it("should navigate without query string when no params remain", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();
			mockLocationSearch = "?doc=123";

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			act(() => {
				result.current.selectDoc(undefined);
			});

			expect(mockNavigate).toHaveBeenCalledWith("/articles");
		});
	});

	describe("returned actions", () => {
		it("should preserve all other tree actions unchanged", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			// Verify all other actions are passed through
			expect(result.current.loadTree).toBe(treeActions.loadTree);
			expect(result.current.loadTrash).toBe(treeActions.loadTrash);
			expect(result.current.toggleExpanded).toBe(treeActions.toggleExpanded);
			expect(result.current.setShowTrash).toBe(treeActions.setShowTrash);
			expect(result.current.createFolder).toBe(treeActions.createFolder);
			expect(result.current.createDoc).toBe(treeActions.createDoc);
			expect(result.current.softDelete).toBe(treeActions.softDelete);
			expect(result.current.restore).toBe(treeActions.restore);
			expect(result.current.refreshTree).toBe(treeActions.refreshTree);
			expect(result.current.rename).toBe(treeActions.rename);
			expect(result.current.setSearchQuery).toBe(treeActions.setSearchQuery);
			expect(result.current.clearSearch).toBe(treeActions.clearSearch);
			expect(result.current.setSortMode).toBe(treeActions.setSortMode);
			expect(result.current.resetToDefaultSort).toBe(treeActions.resetToDefaultSort);
			expect(result.current.reorderDoc).toBe(treeActions.reorderDoc);
			expect(result.current.moveTo).toBe(treeActions.moveTo);
			expect(result.current.reorderAt).toBe(treeActions.reorderAt);
			expect(result.current.setFilters).toBe(treeActions.setFilters);
			expect(result.current.resetToDefaultFilters).toBe(treeActions.resetToDefaultFilters);
		});

		it("should return wrapped selectDoc that differs from original", () => {
			const treeState = createMockTreeState();
			const treeActions = createMockTreeActions();

			const { result } = renderHook(() => useSpaceTreeUrlSync(treeState, treeActions));

			// selectDoc should be wrapped, not the original
			expect(result.current.selectDoc).not.toBe(treeActions.selectDoc);
		});
	});
});
