import { useSpaceTree } from "./useSpaceTree";
import { act, cleanup, renderHook, waitFor } from "@testing-library/preact";
import type { Doc, Space } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the ClientContext
const mockSpacesClient = {
	getTreeContent: vi.fn(),
	getTrashContent: vi.fn(),
	hasTrash: vi.fn(),
	getPreferences: vi.fn(),
	updatePreferences: vi.fn(),
};

const mockDocsClient = {
	createDoc: vi.fn(),
	softDelete: vi.fn(),
	restore: vi.fn(),
	renameDoc: vi.fn(),
	moveDoc: vi.fn(),
	reorderAt: vi.fn(),
};

const mockClient = {
	spaces: () => mockSpacesClient,
	docs: () => mockDocsClient,
};

vi.mock("../contexts/ClientContext", () => ({
	useClient: () => mockClient,
}));

function createMockSpace(overrides: Partial<Space> = {}): Space {
	return {
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
		...overrides,
	};
}

function createMockDoc(overrides: Partial<Doc> = {}): Doc {
	return {
		id: 1,
		jrn: "doc:test",
		slug: "test",
		path: "",
		content: "# Test",
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

describe("useSpaceTree actions", () => {
	const mockSpace = createMockSpace();

	beforeEach(() => {
		vi.clearAllMocks();
		mockSpacesClient.getTreeContent.mockResolvedValue([]);
		mockSpacesClient.getTrashContent.mockResolvedValue([]);
		mockSpacesClient.hasTrash.mockResolvedValue(false);
		mockSpacesClient.getPreferences.mockResolvedValue({ sort: null, filters: {}, expandedFolders: [] });
		mockSpacesClient.updatePreferences.mockResolvedValue({ sort: null, filters: {}, expandedFolders: [] });
		mockDocsClient.moveDoc.mockResolvedValue({});
		mockDocsClient.reorderAt.mockResolvedValue({});
	});

	afterEach(() => {
		// Clean up rendered hooks to prevent memory leaks
		cleanup();
		// Ensure fake timers are restored in case a test fails before calling vi.useRealTimers()
		vi.useRealTimers();
	});

	describe("search functionality", () => {
		it("should initialize with empty search query", () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));
			const [state] = result.current;

			expect(state.searchQuery).toBe("");
			expect(state.isSearching).toBe(false);
		});

		it("should set search query", () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			act(() => {
				const [, actions] = result.current;
				actions.setSearchQuery("test query");
			});

			const [state] = result.current;
			expect(state.searchQuery).toBe("test query");
			expect(state.isSearching).toBe(true);
		});

		it("should clear search query", () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			// First set a search query
			act(() => {
				const [, actions] = result.current;
				actions.setSearchQuery("test query");
			});

			let [state] = result.current;
			expect(state.searchQuery).toBe("test query");
			expect(state.isSearching).toBe(true);

			// Then clear it
			act(() => {
				const [, actions] = result.current;
				actions.clearSearch();
			});

			[state] = result.current;
			expect(state.searchQuery).toBe("");
			expect(state.isSearching).toBe(false);
		});

		it("should not be searching when query is only whitespace", () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			act(() => {
				const [, actions] = result.current;
				actions.setSearchQuery("   ");
			});

			const [state] = result.current;
			expect(state.searchQuery).toBe("   ");
			expect(state.isSearching).toBe(false);
		});

		it("should be searching when query has non-whitespace characters", () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			act(() => {
				const [, actions] = result.current;
				actions.setSearchQuery("  test  ");
			});

			const [state] = result.current;
			expect(state.searchQuery).toBe("  test  ");
			expect(state.isSearching).toBe(true);
		});
	});

	describe("moveTo action", () => {
		it("should call moveDoc with optimistic update (no loadTree)", async () => {
			const doc = createMockDoc({ id: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.moveDoc.mockResolvedValue({});

			// Create space outside renderHook callback to avoid infinite re-renders
			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Clear call count after initial load
			mockSpacesClient.getTreeContent.mockClear();

			const [, actions] = result.current;
			await act(async () => {
				await actions.moveTo(1, 2, 3, "after");
			});

			expect(mockDocsClient.moveDoc).toHaveBeenCalledWith(1, 2, 3, "after");
			// moveTo uses optimistic update - no loadTree call
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});

		it("should convert undefined parentId to null when calling moveDoc", async () => {
			const doc = createMockDoc({ id: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);

			// Create space outside renderHook callback to avoid infinite re-renders
			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;
			await act(async () => {
				await actions.moveTo(1, undefined);
			});

			expect(mockDocsClient.moveDoc).toHaveBeenCalledWith(1, null, undefined, undefined);
		});

		it("should re-throw error when moveDoc fails", async () => {
			const doc = createMockDoc({ id: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.moveDoc.mockRejectedValue(new Error("Move failed"));

			// Create space outside renderHook callback to avoid infinite re-renders
			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;
			await expect(
				act(async () => {
					await actions.moveTo(1, 2);
				}),
			).rejects.toThrow("Move failed");
		});
	});

	describe("reorderAt action", () => {
		it("should call reorderAt with optimistic update (no loadTree)", async () => {
			const doc = createMockDoc({ id: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.reorderAt.mockResolvedValue({});

			// Create space outside renderHook callback to avoid infinite re-renders
			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Clear call count after initial load
			mockSpacesClient.getTreeContent.mockClear();

			const [, actions] = result.current;
			await act(async () => {
				await actions.reorderAt(1, 2, "before");
			});

			expect(mockDocsClient.reorderAt).toHaveBeenCalledWith(1, 2, "before");
			// reorderAt uses optimistic update - no loadTree call
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});

		it("should re-throw error when reorderAt fails", async () => {
			const doc = createMockDoc({ id: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.reorderAt.mockRejectedValue(new Error("Reorder failed"));

			// Create space outside renderHook callback to avoid infinite re-renders
			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;
			await expect(
				act(async () => {
					await actions.reorderAt(1, 2, "after");
				}),
			).rejects.toThrow("Reorder failed");
		});
	});
});
