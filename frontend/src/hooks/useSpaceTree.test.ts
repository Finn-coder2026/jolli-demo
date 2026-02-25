import { _internal, useSpaceTree } from "./useSpaceTree";
import { act, renderHook, waitFor } from "@testing-library/preact";
import { DEFAULT_SPACE_FILTERS, type Doc, type Space, type SpaceFilters } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
	reorderDoc: vi.fn(),
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
		defaultFilters: DEFAULT_SPACE_FILTERS,
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

describe("useSpaceTree", () => {
	const mockSpace = createMockSpace();

	beforeEach(() => {
		vi.clearAllMocks();
		mockSpacesClient.getTreeContent.mockResolvedValue([]);
		mockSpacesClient.getTrashContent.mockResolvedValue([]);
		mockSpacesClient.hasTrash.mockResolvedValue(false);
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: null,
			filters: DEFAULT_SPACE_FILTERS,
			expandedFolders: [],
		});
		mockSpacesClient.updatePreferences.mockResolvedValue({
			sort: null,
			filters: DEFAULT_SPACE_FILTERS,
			expandedFolders: [],
		});
		mockDocsClient.moveDoc.mockResolvedValue({});
		mockDocsClient.reorderAt.mockResolvedValue({});
	});

	it("should initialize with loading state", () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));
		const [state] = result.current;

		expect(state.loading).toBe(true);
		expect(state.treeData).toEqual([]);
		expect(state.trashData).toEqual([]);
	});

	it("should load tree content when space is provided", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" }), createMockDoc({ id: 2, parentId: 1 })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		expect(mockSpacesClient.getTreeContent).toHaveBeenCalledWith(mockSpace.id);
	});

	it("should not load tree when space is undefined", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		// Wait for any potential async operations
		await new Promise(resolve => setTimeout(resolve, 50));

		const [state] = result.current;
		expect(state.loading).toBe(true);
		expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
	});

	it("should toggle expanded state", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Toggle expand
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		// Verify toggle was called (state change will trigger re-render)
		expect(mockSpacesClient.getTreeContent).toHaveBeenCalled();
	});

	it("should select document", () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		act(() => {
			const [, actions] = result.current;
			actions.selectDoc(123);
		});

		const [state] = result.current;
		expect(state.selectedDocId).toBe(123);
	});

	it("should set showTrash state", () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		act(() => {
			const [, actions] = result.current;
			actions.setShowTrash(true);
		});

		const [state] = result.current;
		expect(state.showTrash).toBe(true);
	});

	it("should create folder", async () => {
		const mockNewDoc = createMockDoc({ id: 10, docType: "folder" });
		mockDocsClient.createDoc.mockResolvedValue(mockNewDoc);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createFolder(undefined, "New Folder");
		});

		expect(mockDocsClient.createDoc).toHaveBeenCalledWith(
			expect.objectContaining({
				docType: "folder",
				contentType: "folder",
			}),
		);
		expect(createdDoc).toEqual(mockNewDoc);
	});

	it("should create folder inside parent folder and expand parent", async () => {
		const parentFolder = createMockDoc({
			id: 1,
			docType: "folder",
			contentMetadata: { title: "Parent" },
			sortOrder: 0,
		});
		mockSpacesClient.getTreeContent.mockResolvedValue([parentFolder]);

		const mockNewFolder = createMockDoc({
			id: 10,
			docType: "folder",
			parentId: 1,
			contentMetadata: { title: "Child Folder" },
			sortOrder: 0,
		});
		mockDocsClient.createDoc.mockResolvedValue(mockNewFolder);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.createFolder(1, "Child Folder");
		});

		// Parent folder should be expanded and contain the new child
		const [state] = result.current;
		expect(state.treeData[0].expanded).toBe(true);
		expect(state.treeData[0].children.length).toBe(1);
		expect(state.treeData[0].children[0].doc.id).toBe(10);
	});

	it("should create document inside parent folder and expand parent", async () => {
		const parentFolder = createMockDoc({
			id: 1,
			docType: "folder",
			contentMetadata: { title: "Parent" },
			sortOrder: 0,
		});
		mockSpacesClient.getTreeContent.mockResolvedValue([parentFolder]);

		const mockNewDoc = createMockDoc({
			id: 11,
			parentId: 1,
			contentMetadata: { title: "Child Doc" },
			sortOrder: 0,
		});
		mockDocsClient.createDoc.mockResolvedValue(mockNewDoc);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.createDoc(1, "Child Doc", "text/markdown");
		});

		// Parent folder should be expanded and contain the new child
		const [state] = result.current;
		expect(state.treeData[0].expanded).toBe(true);
		expect(state.treeData[0].children.length).toBe(1);
		expect(state.treeData[0].children[0].doc.id).toBe(11);
		// New doc should be auto-selected
		expect(state.selectedDocId).toBe(11);
	});

	it("should create document", async () => {
		const mockNewDoc = createMockDoc({ id: 11 });
		mockDocsClient.createDoc.mockResolvedValue(mockNewDoc);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createDoc(undefined, "New Document", "text/markdown");
		});

		expect(mockDocsClient.createDoc).toHaveBeenCalledWith(
			expect.objectContaining({
				docType: "document",
				contentType: "text/markdown",
			}),
		);
		expect(createdDoc).toEqual(mockNewDoc);
	});

	it("should create OpenAPI document with empty content", async () => {
		const mockNewDoc = createMockDoc({ id: 12, contentType: "application/yaml" });
		mockDocsClient.createDoc.mockResolvedValue(mockNewDoc);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.createDoc(undefined, "API Spec", "application/yaml");
		});

		expect(mockDocsClient.createDoc).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "", // OpenAPI content should be empty
				contentType: "application/yaml",
			}),
		);
	});

	it("should soft delete document", async () => {
		mockDocsClient.softDelete.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.softDelete(1);
		});

		expect(mockDocsClient.softDelete).toHaveBeenCalledWith(1);
	});

	it("should restore document", async () => {
		mockDocsClient.restore.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.restore(1);
		});

		expect(mockDocsClient.restore).toHaveBeenCalledWith(1);
	});

	it("should load trash content", async () => {
		const trashDocs = [createMockDoc({ id: 5, deletedAt: "2024-01-02T00:00:00Z" })];
		mockSpacesClient.getTrashContent.mockResolvedValue(trashDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.loadTrash();
		});

		const [state] = result.current;
		expect(state.trashData).toEqual(trashDocs);
	});

	it("should refresh tree", async () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Clear mock call count
		mockSpacesClient.getTreeContent.mockClear();
		mockSpacesClient.hasTrash.mockClear();

		await act(async () => {
			const [, actions] = result.current;
			await actions.refreshTree();
		});

		expect(mockSpacesClient.getTreeContent).toHaveBeenCalled();
		expect(mockSpacesClient.hasTrash).toHaveBeenCalled();
	});

	it("should handle tree load error gracefully", async () => {
		mockSpacesClient.getTreeContent.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Should not throw, just log error
		const [state] = result.current;
		expect(state.treeData).toEqual([]);
	});

	it("should handle createFolder without space", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createFolder(undefined, "Test");
		});

		expect(createdDoc).toBeUndefined();
		expect(mockDocsClient.createDoc).not.toHaveBeenCalled();
	});

	it("should handle createDoc without space", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createDoc(undefined, "Test");
		});

		expect(createdDoc).toBeUndefined();
		expect(mockDocsClient.createDoc).not.toHaveBeenCalled();
	});

	it("should handle createFolder error", async () => {
		mockDocsClient.createDoc.mockRejectedValue(new Error("Create failed"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createFolder(undefined, "Test");
		});

		expect(createdDoc).toBeUndefined();
	});

	it("should handle createDoc error", async () => {
		mockDocsClient.createDoc.mockRejectedValue(new Error("Create failed"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createDoc(undefined, "Test");
		});

		expect(createdDoc).toBeUndefined();
	});

	it("should handle softDelete error by re-throwing", async () => {
		mockDocsClient.softDelete.mockRejectedValue(new Error("Delete failed"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// softDelete uses optimistic update and re-throws errors for caller to handle
		await expect(
			act(async () => {
				const [, actions] = result.current;
				await actions.softDelete(1);
			}),
		).rejects.toThrow("Delete failed");
	});

	it("should handle restore error", async () => {
		mockDocsClient.restore.mockRejectedValue(new Error("Restore failed"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Should not throw
		await act(async () => {
			const [, actions] = result.current;
			await actions.restore(1);
		});
	});

	it("should handle loadTrash error", async () => {
		mockSpacesClient.getTrashContent.mockRejectedValue(new Error("Load failed"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Should not throw
		await act(async () => {
			const [, actions] = result.current;
			await actions.loadTrash();
		});

		const [state] = result.current;
		expect(state.trashData).toEqual([]);
	});

	it("should handle hasTrash error", async () => {
		mockSpacesClient.hasTrash.mockRejectedValue(new Error("Check failed"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			// Should still load despite hasTrash error
			expect(state.loading).toBe(false);
		});
	});

	it("should build tree structure correctly", async () => {
		const mockDocs = [
			createMockDoc({ id: 1, docType: "folder", parentId: undefined, sortOrder: 0 }),
			createMockDoc({ id: 2, docType: "document", parentId: 1, sortOrder: 0 }),
			createMockDoc({ id: 3, docType: "document", parentId: 1, sortOrder: 1 }),
			createMockDoc({ id: 4, docType: "folder", parentId: undefined, sortOrder: 1 }),
		];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.treeData.length).toBe(2); // Two root nodes
		});

		const [state] = result.current;
		// First root node should have 2 children
		expect(state.treeData[0].children.length).toBe(2);
		// Second root node should have no children
		expect(state.treeData[1].children.length).toBe(0);
	});

	it("should collapse all folders on first load", async () => {
		const mockDocs = [
			createMockDoc({ id: 1, docType: "folder", parentId: undefined }),
			createMockDoc({ id: 2, docType: "folder", parentId: 1 }),
		];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.treeData.length).toBeGreaterThan(0);
		});

		const [state] = result.current;
		// First root folder should be collapsed on first load (like VS Code behavior)
		expect(state.treeData[0].expanded).toBe(false);
	});

	it("should not load trash if space is not available", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		await act(async () => {
			const [, actions] = result.current;
			await actions.loadTrash();
		});

		// getTrashContent should not be called if space is undefined
		expect(mockSpacesClient.getTrashContent).not.toHaveBeenCalled();
	});

	it("should toggle folder expand/collapse state correctly", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Get initial call count
		const initialCallCount = mockSpacesClient.getTreeContent.mock.calls.length;

		// First toggle should expand (folder is collapsed on first load)
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		await waitFor(() => {
			const [state] = result.current;
			// After first toggle, folder should be expanded (expanded = true)
			expect(state.treeData[0]?.expanded).toBe(true);
		});

		// Second toggle should collapse again
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		await waitFor(() => {
			const [state] = result.current;
			// After second toggle, folder should be collapsed again
			expect(state.treeData[0]?.expanded).toBe(false);
		});

		// Verify getTreeContent was NOT called again (toggle updates tree locally for performance)
		expect(mockSpacesClient.getTreeContent.mock.calls.length).toBe(initialCallCount);
	});

	it("should persist expanded folders to API with debounce after toggling", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		mockSpacesClient.updatePreferences.mockClear();

		// Enable fake timers AFTER initial loading completes
		vi.useFakeTimers();

		// Toggle expand folder
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		// API should not be called immediately (debounced at 2000ms)
		expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

		// Fast-forward debounce timer
		act(() => {
			vi.advanceTimersByTime(2000);
		});

		// API should have been called with expanded folder IDs
		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
			expandedFolders: [1],
		});

		vi.useRealTimers();
	});

	it("should handle error when rebuilding tree after expandedIds change", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Make getTreeContent fail on next call
		mockSpacesClient.getTreeContent.mockRejectedValueOnce(new Error("Network error"));

		// Toggle should trigger expandedIds change which triggers rebuild
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		// Wait a bit for the error to be handled
		await new Promise(resolve => setTimeout(resolve, 100));

		// Should not throw, just log error
		const [state] = result.current;
		expect(state).toBeDefined();
	});

	it("should deselect document when selectDoc is called with undefined", () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		// First select a document
		act(() => {
			const [, actions] = result.current;
			actions.selectDoc(123);
		});

		let [state] = result.current;
		expect(state.selectedDocId).toBe(123);

		// Then deselect by passing undefined
		act(() => {
			const [, actions] = result.current;
			actions.selectDoc(undefined);
		});

		[state] = result.current;
		expect(state.selectedDocId).toBeUndefined();
	});

	it("should not load tree when loadTree is called without space", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		// Clear any initial calls
		mockSpacesClient.getTreeContent.mockClear();

		// Call loadTree directly
		await act(async () => {
			const [, actions] = result.current;
			await actions.loadTree();
		});

		// getTreeContent should not be called if space is undefined
		expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
	});

	it("should handle setShowTrash to false", () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		// First set to true
		act(() => {
			const [, actions] = result.current;
			actions.setShowTrash(true);
		});

		let [state] = result.current;
		expect(state.showTrash).toBe(true);

		// Then set to false
		act(() => {
			const [, actions] = result.current;
			actions.setShowTrash(false);
		});

		[state] = result.current;
		expect(state.showTrash).toBe(false);
	});

	it("should handle refreshTree when space is not available", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		// Clear any initial calls
		mockSpacesClient.getTreeContent.mockClear();
		mockSpacesClient.hasTrash.mockClear();

		// Call refreshTree directly when space is undefined
		await act(async () => {
			const [, actions] = result.current;
			await actions.refreshTree();
		});

		// Neither getTreeContent nor hasTrash should be called if space is undefined
		expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		expect(mockSpacesClient.hasTrash).not.toHaveBeenCalled();
	});

	it("should rename document with optimistic update (no loadTree)", async () => {
		const updatedDoc = createMockDoc({ id: 1, version: 2, contentMetadata: { title: "New Name" } });
		mockDocsClient.renameDoc.mockResolvedValue(updatedDoc);

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		mockSpacesClient.getTreeContent.mockClear();

		await act(async () => {
			const [, actions] = result.current;
			const renamed = await actions.rename(1, "New Name");
			expect(renamed).toEqual(updatedDoc);
		});

		expect(mockDocsClient.renameDoc).toHaveBeenCalledWith(1, "New Name");
		// rename uses optimistic update - no loadTree call
		expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
	});

	it("should handle error during rename by re-throwing", async () => {
		mockDocsClient.renameDoc.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// rename uses optimistic update and re-throws errors for caller to handle
		await expect(
			act(async () => {
				const [, actions] = result.current;
				await actions.rename(1, "New Name");
			}),
		).rejects.toThrow("Network error");
	});

	it("should reset state when space changes", async () => {
		const space1 = createMockSpace({ id: 1, name: "Space 1" });
		const space2 = createMockSpace({ id: 2, name: "Space 2" });

		const mockDocs1 = [createMockDoc({ id: 1, spaceId: 1 })];
		const mockDocs2 = [createMockDoc({ id: 2, spaceId: 2 })];

		mockSpacesClient.getTreeContent.mockImplementation((spaceId: number) =>
			Promise.resolve(spaceId === 1 ? mockDocs1 : mockDocs2),
		);

		const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
			initialProps: { space: space1 },
		});

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Select a document in space 1
		act(() => {
			const [, actions] = result.current;
			actions.selectDoc(123);
		});

		let [state] = result.current;
		expect(state.selectedDocId).toBe(123);

		// Change to space 2
		rerender({ space: space2 });

		await waitFor(() => {
			const [state] = result.current;
			// Selected doc should be cleared when space changes
			expect(state.selectedDocId).toBeUndefined();
		});

		[state] = result.current;
		expect(state.showTrash).toBe(false);
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

	describe("sort preference API", () => {
		it("should load sort preference from API when space changes", async () => {
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: "alphabetical_asc",
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("alphabetical_asc");
			});

			expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(mockSpace.id);
		});

		it("should use space defaultSort when API returns null sort", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("updatedAt_desc");
			});
		});

		it("should use space defaultSort when getPreferences API fails", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "createdAt_asc" });
			mockSpacesClient.getPreferences.mockRejectedValue(new Error("API error"));

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("createdAt_asc");
			});
		});

		it("should call updatePreferences API when setSortMode is called", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc");
			});

			// API should not be called immediately (debounced)
			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

			// Fast-forward debounce timer
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
				sort: "alphabetical_asc",
			});

			vi.useRealTimers();
		});

		it("should save null when sort mode matches space defaultSort", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "alphabetical_asc" });
			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc"); // Same as space defaultSort
			});

			act(() => {
				vi.advanceTimersByTime(500);
			});

			// Should save null since it matches space default
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultSort.id, {
				sort: null,
			});

			vi.useRealTimers();
		});

		it("should debounce multiple setSortMode calls", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			// Call setSortMode multiple times quickly
			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc");
			});

			act(() => {
				vi.advanceTimersByTime(200);
			});

			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("updatedAt_desc");
			});

			act(() => {
				vi.advanceTimersByTime(200);
			});

			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("createdAt_asc");
			});

			// API should not be called yet
			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

			// Fast-forward debounce timer
			act(() => {
				vi.advanceTimersByTime(500);
			});

			// Only the last value should be saved
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledTimes(1);
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
				sort: "createdAt_asc",
			});

			vi.useRealTimers();
		});

		it("should handle updatePreferences API error gracefully", async () => {
			mockSpacesClient.updatePreferences.mockRejectedValue(new Error("API error"));

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			// Should not throw
			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc");
			});

			act(() => {
				vi.advanceTimersByTime(500);
			});

			// State should still be updated locally
			const [state] = result.current;
			expect(state.sortMode).toBe("alphabetical_asc");

			vi.useRealTimers();
		});

		it("should call updatePreferences with null when resetToDefaultSort is called", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: "alphabetical_asc",
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("alphabetical_asc");
			});

			mockSpacesClient.updatePreferences.mockClear();

			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultSort();
			});

			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultSort.id, {
				sort: null,
			});

			const [state] = result.current;
			expect(state.sortMode).toBe("updatedAt_desc");
		});

		it("should handle resetToDefaultSort API error gracefully", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: "alphabetical_asc",
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});
			mockSpacesClient.updatePreferences.mockRejectedValue(new Error("API error"));

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Should not throw
			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultSort();
			});

			// State should still be updated locally
			const [state] = result.current;
			expect(state.sortMode).toBe("updatedAt_desc");
		});

		it("should cancel pending debounced save when resetToDefaultSort is called", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			// Set a sort mode (starts debounce timer)
			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc");
			});

			// Before debounce timer fires, call resetToDefaultSort
			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultSort();
			});

			// Fast-forward past debounce timer
			act(() => {
				vi.advanceTimersByTime(600);
			});

			// resetToDefaultSort should have been called immediately, debounced call should be cancelled
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledTimes(1);
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultSort.id, {
				sort: null,
			});

			vi.useRealTimers();
		});

		it("should not call API when space is undefined for setSortMode", () => {
			vi.useFakeTimers();

			const { result } = renderHook(() => useSpaceTree(undefined));

			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc");
			});

			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

			vi.useRealTimers();
		});

		it("should not call API when space is undefined for resetToDefaultSort", async () => {
			const { result } = renderHook(() => useSpaceTree(undefined));

			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultSort();
			});

			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();
		});

		it("should reload preferences when space changes", async () => {
			const space1 = createMockSpace({ id: 1, name: "Space 1", defaultSort: "default" });
			const space2 = createMockSpace({ id: 2, name: "Space 2", defaultSort: "updatedAt_desc" });

			mockSpacesClient.getPreferences
				.mockResolvedValueOnce({
					sort: "alphabetical_asc",
					filters: DEFAULT_SPACE_FILTERS,
					expandedFolders: [],
				})
				.mockResolvedValueOnce({ sort: "createdAt_desc", filters: DEFAULT_SPACE_FILTERS, expandedFolders: [] });

			const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
				initialProps: { space: space1 },
			});

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("alphabetical_asc");
			});

			// Change to space 2
			rerender({ space: space2 });

			await waitFor(() => {
				const [state] = result.current;
				expect(state.sortMode).toBe("createdAt_desc");
			});

			expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(space1.id);
			expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(space2.id);
		});

		it("should indicate isMatchingSpaceDefault correctly", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: "updatedAt_desc",
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("updatedAt_desc");
				expect(state.isMatchingSpaceDefault).toBe(true);
			});
		});

		it("should indicate isMatchingSpaceDefault as false when sort differs", async () => {
			const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: "alphabetical_asc",
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("alphabetical_asc");
				expect(state.isMatchingSpaceDefault).toBe(false);
			});
		});

		it("should load expanded folders from API preferences", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, docType: "folder" }),
				createMockDoc({ id: 2, docType: "folder", parentId: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [1, 2], // These folders should be expanded
			});

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.length).toBeGreaterThan(0);
			});

			// Verify getPreferences was called (which loads expandedFolders)
			expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(mockSpace.id);
		});

		it("should rebuild tree when sortMode changes after initial load", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Beta" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Alpha" }, sortOrder: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Initial order should be by sortOrder (default mode)
			let [state] = result.current;
			expect(state.treeData[0].doc.id).toBe(1); // Beta (sortOrder 0)
			expect(state.treeData[1].doc.id).toBe(2); // Alpha (sortOrder 1)

			// Change sort mode to alphabetical
			act(() => {
				const [, actions] = result.current;
				actions.setSortMode("alphabetical_asc");
			});

			// Tree should rebuild with new sort order
			[state] = result.current;
			expect(state.treeData[0].doc.id).toBe(2); // Alpha (alphabetically first)
			expect(state.treeData[1].doc.id).toBe(1); // Beta (alphabetically second)
		});

		it("should ignore stale preference response when space changes during preference load", async () => {
			// First space with custom sort preference
			const space1 = createMockSpace({ id: 1, defaultSort: "default" });
			// Second space with different default
			const space2 = createMockSpace({ id: 2, defaultSort: "updatedAt_desc" });

			// biome-ignore lint/suspicious/noEmptyBlockStatements: Initial value for resolver function, will be assigned
			let resolveFirstPrefs: (value: unknown) => void = () => {};
			// First space preference load - will be delayed
			mockSpacesClient.getPreferences.mockImplementationOnce(
				() =>
					new Promise(resolve => {
						resolveFirstPrefs = resolve;
					}),
			);

			// Render with first space
			const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
				initialProps: { space: space1 },
			});

			// Wait for initial load to start
			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(true);
			});

			// Mock second space preference
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: {},
				expandedFolders: [],
			});

			// Switch to second space before first preference loads
			rerender({ space: space2 });

			// Wait for second space to load
			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Now resolve first space preferences (stale)
			resolveFirstPrefs({
				sort: "alphabetical_asc",
				filters: {},
				expandedFolders: [],
			});

			// Wait a bit for stale response to be processed
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 100));
			});

			// Should use space2's sort, not the stale space1 preference
			const [state] = result.current;
			expect(state.sortMode).toBe("updatedAt_desc"); // space2's defaultSort
			expect(state.sortMode).not.toBe("alphabetical_asc"); // NOT space1's preference
		});

		it("should ignore stale preference error when space changes during preference load", async () => {
			const space1 = createMockSpace({ id: 1, defaultSort: "default" });
			const space2 = createMockSpace({ id: 2, defaultSort: "updatedAt_desc" });

			// biome-ignore lint/suspicious/noEmptyBlockStatements: Initial value for rejection function, will be assigned
			let rejectFirstPrefs: (reason: Error) => void = () => {};
			// First space preference load - will fail after delay
			mockSpacesClient.getPreferences.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						rejectFirstPrefs = reject;
					}),
			);

			// Render with first space
			const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
				initialProps: { space: space1 },
			});

			// Wait for initial load
			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(true);
			});

			// Mock second space preference (succeeds)
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: {},
				expandedFolders: [],
			});

			// Switch to second space before first preference fails
			rerender({ space: space2 });

			// Wait for second space to load successfully
			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.sortMode).toBe("updatedAt_desc");
			});

			// Now reject first space preferences (stale error)
			rejectFirstPrefs(new Error("Preference load failed"));

			// Wait for stale error to be processed
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 100));
			});

			// Should still use space2's sort, not be affected by stale error
			const [state] = result.current;
			expect(state.sortMode).toBe("updatedAt_desc");
		});
	});

	describe("filter functionality", () => {
		it("should initialize with default filters", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [state] = result.current;
			expect(state.filters).toEqual(DEFAULT_SPACE_FILTERS);
			expect(state.filterCount).toBe(0);
			expect(state.isMatchingSpaceDefaultFilters).toBe(true);
		});

		it("should load filters from API preferences", async () => {
			const savedFilters: SpaceFilters = {
				updated: "last_7_days",
				creator: "alice@example.com",
			};
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: savedFilters,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.filters).toEqual(savedFilters);
			});
		});

		it("should calculate filterCount correctly", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set filters with both updated and creator
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "alice@example.com",
				});
			});

			const [state] = result.current;
			expect(state.filterCount).toBe(2);
		});

		it("should calculate filterCount as 1 when only updated is set", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "",
				});
			});

			const [state] = result.current;
			expect(state.filterCount).toBe(1);
		});

		it("should calculate filterCount as 1 when only creator is set", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "any_time",
					creator: "alice@example.com",
				});
			});

			const [state] = result.current;
			expect(state.filterCount).toBe(1);
		});

		it("should update isMatchingSpaceDefaultFilters when filters change", async () => {
			const spaceWithDefaultFilters = createMockSpace({
				id: 1,
				defaultFilters: DEFAULT_SPACE_FILTERS,
			});

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultFilters));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Initially should match default
			let [state] = result.current;
			expect(state.isMatchingSpaceDefaultFilters).toBe(true);

			// Set different filters
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_30_days",
					creator: "",
				});
			});

			[state] = result.current;
			expect(state.isMatchingSpaceDefaultFilters).toBe(false);
		});

		it("should handle setFilters API error gracefully", async () => {
			mockSpacesClient.updatePreferences.mockRejectedValue(new Error("API error"));

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			// Should not throw
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "",
				});
			});

			act(() => {
				vi.advanceTimersByTime(500);
			});

			// State should still be updated locally
			const [state] = result.current;
			expect(state.filters.updated).toBe("last_7_days");

			vi.useRealTimers();
		});

		it("should debounce multiple setFilters calls and cancel previous timeout", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();
			vi.useFakeTimers();

			// Call setFilters multiple times quickly
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "today",
					creator: "",
				});
			});

			act(() => {
				vi.advanceTimersByTime(200);
			});

			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "",
				});
			});

			act(() => {
				vi.advanceTimersByTime(200);
			});

			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_30_days",
					creator: "bob@example.com",
				});
			});

			// API should not be called yet
			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

			// Fast-forward debounce timer
			act(() => {
				vi.advanceTimersByTime(500);
			});

			// Only the last value should be saved
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledTimes(1);
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
				filters: {
					updated: "last_30_days",
					creator: "bob@example.com",
				},
			});

			vi.useRealTimers();
		});

		it("should save DEFAULT_SPACE_FILTERS when filters match space default", async () => {
			const spaceWithDefaultFilters = createMockSpace({
				id: 1,
				defaultFilters: {
					updated: "last_7_days",
					creator: "",
				},
			});
			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultFilters));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();
			vi.useFakeTimers();

			// Set filters to match the space default
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "",
				});
			});

			act(() => {
				vi.advanceTimersByTime(500);
			});

			// Should save DEFAULT_SPACE_FILTERS since it matches space default
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultFilters.id, {
				filters: DEFAULT_SPACE_FILTERS,
			});

			vi.useRealTimers();
		});

		it("should save filters to API with debounce", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();
			vi.useFakeTimers();

			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "today",
					creator: "",
				});
			});

			// Should not be called immediately
			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

			// Fast-forward debounce timer
			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
				filters: {
					updated: "today",
					creator: "",
				},
			});

			vi.useRealTimers();
		});

		it("should reset filters to default when resetToDefaultFilters is called", async () => {
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: {
					updated: "last_7_days",
					creator: "alice@example.com",
				},
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();

			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultFilters();
			});

			const [state] = result.current;
			expect(state.filters).toEqual(DEFAULT_SPACE_FILTERS);
			// resetToDefaultFilters saves DEFAULT_SPACE_FILTERS to API to clear user preference
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
				filters: DEFAULT_SPACE_FILTERS,
			});
		});

		it("should filter tree data by updated time", async () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const lastWeek = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

			const mockDocs = [
				createMockDoc({ id: 1, updatedAt: now.toISOString() }),
				createMockDoc({ id: 2, updatedAt: yesterday.toISOString() }),
				createMockDoc({ id: 3, updatedAt: lastWeek.toISOString() }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set filter to today
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "today",
					creator: "",
				});
			});

			await waitFor(() => {
				const [state] = result.current;
				// Only today's document should be visible
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.id).toBe(1);
			});
		});

		// TODO: Re-enable when member/permission features are implemented
		// biome-ignore lint/suspicious/noSkippedTests: Creator filter temporarily disabled
		it.skip("should filter tree data by creator using fuzzy matching", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, createdBy: "alice@example.com" }),
				createMockDoc({ id: 2, createdBy: "bob@example.com" }),
				createMockDoc({ id: 3, createdBy: "charlie@example.com" }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set filter to "alice" - should fuzzy match alice@example.com
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "any_time",
					creator: "alice",
				});
			});

			await waitFor(() => {
				const [state] = result.current;
				// Only alice@example.com should match
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.id).toBe(1);
			});
		});

		// TODO: Re-enable when member/permission features are implemented
		// biome-ignore lint/suspicious/noSkippedTests: Creator filter temporarily disabled
		it.skip("should filter tree data by creator case-insensitively", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, createdBy: "Alice@example.com" }),
				createMockDoc({ id: 2, createdBy: "bob@example.com" }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set filter to "alice" (lowercase) - should match "Alice@example.com" (mixed case)
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "any_time",
					creator: "alice",
				});
			});

			await waitFor(() => {
				const [state] = result.current;
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.id).toBe(1);
			});
		});

		it("should not call API when space is undefined for setFilters", () => {
			vi.useFakeTimers();

			const { result } = renderHook(() => useSpaceTree(undefined));

			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "",
				});
			});

			act(() => {
				vi.advanceTimersByTime(500);
			});

			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

			vi.useRealTimers();
		});

		it("should not call API when space is undefined for resetToDefaultFilters", async () => {
			const { result } = renderHook(() => useSpaceTree(undefined));

			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultFilters();
			});

			expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();
		});

		it("should handle custom date filter", async () => {
			const now = new Date();
			const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

			const mockDocs = [
				createMockDoc({ id: 1, updatedAt: now.toISOString() }),
				createMockDoc({ id: 2, updatedAt: twoDaysAgo.toISOString() }),
				createMockDoc({ id: 3, updatedAt: fiveDaysAgo.toISOString() }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set custom date filter to 3 days ago
			const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: { type: "after_date", date: threeDaysAgo.toISOString().split("T")[0] },
					creator: "",
				});
			});

			await waitFor(() => {
				const [state] = result.current;
				// Documents from today and 2 days ago should be visible
				expect(state.treeData.length).toBe(2);
			});
		});

		it("should keep folders visible if any child matches filter", async () => {
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			const mockDocs = [
				createMockDoc({ id: 1, docType: "folder", updatedAt: yesterday.toISOString() }),
				createMockDoc({ id: 2, parentId: 1, docType: "document", updatedAt: now.toISOString() }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set filter to today - folder should still be visible because child matches
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "today",
					creator: "",
				});
			});

			await waitFor(() => {
				const [state] = result.current;
				// Folder should be visible because it has a child that matches
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.docType).toBe("folder");
				expect(state.treeData[0].children.length).toBe(1);
			});
		});

		// TODO: Re-enable when member/permission features are implemented
		// biome-ignore lint/suspicious/noSkippedTests: Creator filter temporarily disabled
		it.skip("should keep folders visible if any child matches creator filter", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, docType: "folder", createdBy: "admin@example.com" }),
				createMockDoc({ id: 2, parentId: 1, docType: "document", createdBy: "alice@example.com" }),
				createMockDoc({ id: 3, docType: "document", createdBy: "bob@example.com" }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Set filter to alice - folder should still be visible because child matches
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "any_time",
					creator: "alice@example.com",
				});
			});

			await waitFor(() => {
				const [state] = result.current;
				// Folder should be visible because it has a child created by alice
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.docType).toBe("folder");
				expect(state.treeData[0].children.length).toBe(1);
				expect(state.treeData[0].children[0].doc.createdBy).toBe("alice@example.com");
			});
		});

		it("should use space defaultFilters when API returns empty filters", async () => {
			const spaceWithDefaultFilters = createMockSpace({
				id: 1,
				defaultFilters: {
					updated: "last_7_days",
					creator: "",
				},
			});
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: DEFAULT_SPACE_FILTERS,
				expandedFolders: [],
			});

			const { result } = renderHook(() => useSpaceTree(spaceWithDefaultFilters));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				// Should use space default filters when API returns empty object
				expect(state.filters.updated).toBe("last_7_days");
			});
		});

		it("should ignore stale API response when space changes during request (success path)", async () => {
			const space1 = createMockSpace({ id: 1, name: "Space 1", defaultSort: "default" });
			const space2 = createMockSpace({ id: 2, name: "Space 2", defaultSort: "updatedAt_desc" });

			// Create a delayed promise for space1's getPreferences
			let resolveSpace1Prefs: ((value: unknown) => void) | undefined;
			const space1PrefsPromise = new Promise(resolve => {
				resolveSpace1Prefs = resolve;
			});

			// First call (space1) returns a delayed promise, second call (space2) returns immediately
			mockSpacesClient.getPreferences
				.mockImplementationOnce(() => space1PrefsPromise)
				.mockResolvedValueOnce({
					sort: "alphabetical_asc",
					filters: { updated: "today", creator: "" },
					expandedFolders: [],
				});

			const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
				initialProps: { space: space1 },
			});

			// Quickly switch to space2 before space1's request completes
			rerender({ space: space2 });

			// Wait for space2's preferences to load
			await waitFor(() => {
				const [state] = result.current;
				expect(state.sortMode).toBe("alphabetical_asc");
				expect(state.filters.updated).toBe("today");
			});

			// Now resolve space1's delayed response (should be ignored due to race condition check)
			resolveSpace1Prefs?.({
				sort: "createdAt_desc",
				filters: { updated: "last_30_days", creator: "old@example.com" },
				expandedFolders: [],
			});

			// Wait a bit to ensure the stale response is processed
			await new Promise(resolve => setTimeout(resolve, 50));

			// State should still reflect space2's preferences (stale space1 response ignored)
			const [state] = result.current;
			expect(state.sortMode).toBe("alphabetical_asc");
			expect(state.filters.updated).toBe("today");
		});

		it("should cancel pending debounced filter save when resetToDefaultFilters is called", async () => {
			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.updatePreferences.mockClear();

			// Enable fake timers AFTER initial loading completes
			vi.useFakeTimers();

			// Set filters (starts debounce timer)
			act(() => {
				const [, actions] = result.current;
				actions.setFilters({
					updated: "last_7_days",
					creator: "alice@example.com",
				});
			});

			// Before debounce timer fires, call resetToDefaultFilters
			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultFilters();
			});

			// Fast-forward past debounce timer
			act(() => {
				vi.advanceTimersByTime(600);
			});

			// resetToDefaultFilters should have been called immediately, debounced call should be cancelled
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledTimes(1);
			expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
				filters: DEFAULT_SPACE_FILTERS,
			});

			vi.useRealTimers();
		});

		it("should handle resetToDefaultFilters API error gracefully", async () => {
			mockSpacesClient.getPreferences.mockResolvedValue({
				sort: null,
				filters: {
					updated: "last_7_days",
					creator: "alice@example.com",
				},
				expandedFolders: [],
			});
			mockSpacesClient.updatePreferences.mockRejectedValue(new Error("API error"));

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Should not throw
			await act(async () => {
				const [, actions] = result.current;
				await actions.resetToDefaultFilters();
			});

			// State should still be updated locally
			const [state] = result.current;
			expect(state.filters).toEqual(DEFAULT_SPACE_FILTERS);
		});

		it("should ignore stale API error when space changes during request (error path)", async () => {
			const space1 = createMockSpace({ id: 1, name: "Space 1", defaultSort: "default" });
			const space2 = createMockSpace({ id: 2, name: "Space 2", defaultSort: "updatedAt_desc" });

			// Create a delayed rejection for space1's getPreferences
			let rejectSpace1Prefs: ((error: Error) => void) | undefined;
			const space1PrefsPromise = new Promise((_, reject) => {
				rejectSpace1Prefs = reject;
			});

			// First call (space1) returns a delayed rejection, second call (space2) returns immediately
			mockSpacesClient.getPreferences
				.mockImplementationOnce(() => space1PrefsPromise)
				.mockResolvedValueOnce({
					sort: "alphabetical_asc",
					filters: { updated: "today", creator: "" },
					expandedFolders: [],
				});

			const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
				initialProps: { space: space1 },
			});

			// Quickly switch to space2 before space1's request fails
			rerender({ space: space2 });

			// Wait for space2's preferences to load
			await waitFor(() => {
				const [state] = result.current;
				expect(state.sortMode).toBe("alphabetical_asc");
				expect(state.filters.updated).toBe("today");
			});

			// Now reject space1's delayed request (should be ignored due to race condition check)
			rejectSpace1Prefs?.(new Error("Network error for space1"));

			// Wait a bit to ensure the stale error is processed
			await new Promise(resolve => setTimeout(resolve, 50));

			// State should still reflect space2's preferences (stale space1 error ignored)
			const [state] = result.current;
			expect(state.sortMode).toBe("alphabetical_asc");
			expect(state.filters.updated).toBe("today");
		});
	});

	describe("reorderDoc functionality", () => {
		it("should reorder document up with optimistic update (no loadTree)", async () => {
			mockDocsClient.reorderDoc.mockResolvedValue(undefined);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.getTreeContent.mockClear();

			await act(async () => {
				const [, actions] = result.current;
				await actions.reorderDoc(1, "up");
			});

			expect(mockDocsClient.reorderDoc).toHaveBeenCalledWith(1, "up");
			// reorderDoc uses optimistic update - no loadTree call
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});

		it("should reorder document down with optimistic update (no loadTree)", async () => {
			mockDocsClient.reorderDoc.mockResolvedValue(undefined);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.getTreeContent.mockClear();

			await act(async () => {
				const [, actions] = result.current;
				await actions.reorderDoc(2, "down");
			});

			expect(mockDocsClient.reorderDoc).toHaveBeenCalledWith(2, "down");
			// reorderDoc uses optimistic update - no loadTree call
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});

		it("should handle reorderDoc error by re-throwing", async () => {
			mockDocsClient.reorderDoc.mockRejectedValue(new Error("Reorder failed"));

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// reorderDoc uses optimistic update and re-throws errors for caller to handle
			await expect(
				act(async () => {
					const [, actions] = result.current;
					await actions.reorderDoc(1, "up");
				}),
			).rejects.toThrow("Reorder failed");

			expect(mockDocsClient.reorderDoc).toHaveBeenCalledWith(1, "up");
		});
	});

	describe("moveTo functionality", () => {
		it("should move document to new parent with optimistic update", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, docType: "folder", parentId: undefined }),
				createMockDoc({ id: 2, docType: "document", parentId: undefined }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);
			mockDocsClient.moveDoc.mockResolvedValue(undefined);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.getTreeContent.mockClear();

			await act(async () => {
				const [, actions] = result.current;
				await actions.moveTo(2, 1); // Move doc 2 into folder 1
			});

			expect(mockDocsClient.moveDoc).toHaveBeenCalledWith(2, 1, undefined, undefined);
			// moveTo uses optimistic update - no loadTree call
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});

		it("should handle moveTo error by re-throwing", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, docType: "folder", parentId: undefined }),
				createMockDoc({ id: 2, docType: "document", parentId: undefined }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);
			mockDocsClient.moveDoc.mockRejectedValue(new Error("Move failed"));

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// moveTo uses optimistic update and re-throws errors for caller to handle
			await expect(
				act(async () => {
					const [, actions] = result.current;
					await actions.moveTo(2, 1);
				}),
			).rejects.toThrow("Move failed");

			expect(mockDocsClient.moveDoc).toHaveBeenCalledWith(2, 1, undefined, undefined);
		});
	});

	describe("reorderAt functionality", () => {
		it("should reorder document relative to reference with optimistic update", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, docType: "document", parentId: undefined, sortOrder: 0 }),
				createMockDoc({ id: 2, docType: "document", parentId: undefined, sortOrder: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);
			mockDocsClient.reorderAt.mockResolvedValue(undefined);

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			mockSpacesClient.getTreeContent.mockClear();

			await act(async () => {
				const [, actions] = result.current;
				await actions.reorderAt(2, 1, "before");
			});

			expect(mockDocsClient.reorderAt).toHaveBeenCalledWith(2, 1, "before");
			// reorderAt uses optimistic update - no loadTree call
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});

		it("should handle reorderAt error by re-throwing", async () => {
			const mockDocs = [
				createMockDoc({ id: 1, docType: "document", parentId: undefined }),
				createMockDoc({ id: 2, docType: "document", parentId: undefined }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);
			mockDocsClient.reorderAt.mockRejectedValue(new Error("Reorder failed"));

			const { result } = renderHook(() => useSpaceTree(mockSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// reorderAt uses optimistic update and re-throws errors for caller to handle
			await expect(
				act(async () => {
					const [, actions] = result.current;
					await actions.reorderAt(2, 1, "after");
				}),
			).rejects.toThrow("Reorder failed");

			expect(mockDocsClient.reorderAt).toHaveBeenCalledWith(2, 1, "after");
		});
	});

	describe("internal functions - getFilterCutoffDate", () => {
		it("should return undefined for any_time filter", () => {
			const result = _internal.getFilterCutoffDate("any_time");
			expect(result).toBeUndefined();
		});

		it("should return today's date at midnight for today filter", () => {
			const result = _internal.getFilterCutoffDate("today");
			expect(result).toBeDefined();
			const now = new Date();
			const expected = new Date(now);
			expected.setHours(0, 0, 0, 0);
			expect(result?.getTime()).toBe(expected.getTime());
		});

		it("should return date 7 days ago for last_7_days filter", () => {
			const result = _internal.getFilterCutoffDate("last_7_days");
			expect(result).toBeDefined();
			const now = new Date();
			const expectedMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
			// Allow 1 second tolerance for test execution time
			expect(Math.abs((result?.getTime() ?? 0) - expectedMs)).toBeLessThan(1000);
		});

		it("should return date 30 days ago for last_30_days filter", () => {
			const result = _internal.getFilterCutoffDate("last_30_days");
			expect(result).toBeDefined();
			const now = new Date();
			const expectedMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
			expect(Math.abs((result?.getTime() ?? 0) - expectedMs)).toBeLessThan(1000);
		});

		it("should return date 90 days ago for last_3_months filter", () => {
			const result = _internal.getFilterCutoffDate("last_3_months");
			expect(result).toBeDefined();
			const now = new Date();
			const expectedMs = now.getTime() - 90 * 24 * 60 * 60 * 1000;
			expect(Math.abs((result?.getTime() ?? 0) - expectedMs)).toBeLessThan(1000);
		});

		it("should return date for after_date filter object", () => {
			const result = _internal.getFilterCutoffDate({ type: "after_date", date: "2025-01-15" });
			expect(result).toBeDefined();
			expect(result?.toISOString().split("T")[0]).toBe("2025-01-15");
		});

		it("should return undefined for unknown string filter (defensive)", () => {
			// Use type assertion to test defensive code path
			const result = _internal.getFilterCutoffDate("unknown_filter" as unknown as "any_time");
			expect(result).toBeUndefined();
		});

		it("should return undefined for invalid filter object without type (defensive)", () => {
			// Use type assertion to test defensive code path for invalid objects
			const result = _internal.getFilterCutoffDate({ foo: "bar" } as unknown as {
				type: "after_date";
				date: string;
			});
			expect(result).toBeUndefined();
		});

		it("should return undefined for filter object with wrong type (defensive)", () => {
			// Use type assertion to test defensive code path for objects with wrong type
			const result = _internal.getFilterCutoffDate({ type: "invalid_type" } as unknown as {
				type: "after_date";
				date: string;
			});
			expect(result).toBeUndefined();
		});

		it("should return undefined for filter object without date (defensive)", () => {
			// Use type assertion to test defensive code path for objects missing date
			const result = _internal.getFilterCutoffDate({ type: "after_date" } as unknown as {
				type: "after_date";
				date: string;
			});
			expect(result).toBeUndefined();
		});
	});

	describe("internal functions - getSortComparator", () => {
		it("should sort alphabetically ascending by title", () => {
			const comparator = _internal.getSortComparator("alphabetical_asc");
			const docA = createMockDoc({ id: 1, contentMetadata: { title: "Apple" } });
			const docB = createMockDoc({ id: 2, contentMetadata: { title: "Banana" } });
			const docC = createMockDoc({ id: 3, contentMetadata: { title: "Cherry" } });

			const docs = [docC, docA, docB];
			docs.sort(comparator);

			expect(docs.map(d => (d.contentMetadata as { title: string }).title)).toEqual([
				"Apple",
				"Banana",
				"Cherry",
			]);
		});

		it("should sort alphabetically descending by title", () => {
			const comparator = _internal.getSortComparator("alphabetical_desc");
			const docA = createMockDoc({ id: 1, contentMetadata: { title: "Apple" } });
			const docB = createMockDoc({ id: 2, contentMetadata: { title: "Banana" } });
			const docC = createMockDoc({ id: 3, contentMetadata: { title: "Cherry" } });

			const docs = [docA, docC, docB];
			docs.sort(comparator);

			expect(docs.map(d => (d.contentMetadata as { title: string }).title)).toEqual([
				"Cherry",
				"Banana",
				"Apple",
			]);
		});

		it("should handle empty titles in alphabetical sort", () => {
			const comparator = _internal.getSortComparator("alphabetical_asc");
			const docA = createMockDoc({ id: 1, contentMetadata: {} });
			const docB = createMockDoc({ id: 2, contentMetadata: { title: "Banana" } });

			const docs = [docB, docA];
			docs.sort(comparator);

			// Empty string sorts before "Banana"
			expect(docs[0].id).toBe(1);
			expect(docs[1].id).toBe(2);
		});

		it("should sort by updatedAt ascending", () => {
			const comparator = _internal.getSortComparator("updatedAt_asc");
			const docA = createMockDoc({ id: 1, updatedAt: "2025-01-10T00:00:00Z" });
			const docB = createMockDoc({ id: 2, updatedAt: "2025-01-15T00:00:00Z" });
			const docC = createMockDoc({ id: 3, updatedAt: "2025-01-05T00:00:00Z" });

			const docs = [docA, docB, docC];
			docs.sort(comparator);

			expect(docs.map(d => d.id)).toEqual([3, 1, 2]);
		});

		it("should sort by updatedAt descending", () => {
			const comparator = _internal.getSortComparator("updatedAt_desc");
			const docA = createMockDoc({ id: 1, updatedAt: "2025-01-10T00:00:00Z" });
			const docB = createMockDoc({ id: 2, updatedAt: "2025-01-15T00:00:00Z" });
			const docC = createMockDoc({ id: 3, updatedAt: "2025-01-05T00:00:00Z" });

			const docs = [docA, docB, docC];
			docs.sort(comparator);

			expect(docs.map(d => d.id)).toEqual([2, 1, 3]);
		});

		it("should sort by createdAt ascending", () => {
			const comparator = _internal.getSortComparator("createdAt_asc");
			const docA = createMockDoc({ id: 1, createdAt: "2025-01-10T00:00:00Z" });
			const docB = createMockDoc({ id: 2, createdAt: "2025-01-15T00:00:00Z" });
			const docC = createMockDoc({ id: 3, createdAt: "2025-01-05T00:00:00Z" });

			const docs = [docA, docB, docC];
			docs.sort(comparator);

			expect(docs.map(d => d.id)).toEqual([3, 1, 2]);
		});

		it("should sort by createdAt descending", () => {
			const comparator = _internal.getSortComparator("createdAt_desc");
			const docA = createMockDoc({ id: 1, createdAt: "2025-01-10T00:00:00Z" });
			const docB = createMockDoc({ id: 2, createdAt: "2025-01-15T00:00:00Z" });
			const docC = createMockDoc({ id: 3, createdAt: "2025-01-05T00:00:00Z" });

			const docs = [docA, docB, docC];
			docs.sort(comparator);

			expect(docs.map(d => d.id)).toEqual([2, 1, 3]);
		});

		it("should sort by sortOrder for default mode", () => {
			const comparator = _internal.getSortComparator("default");
			const docA = createMockDoc({ id: 1, sortOrder: 2 });
			const docB = createMockDoc({ id: 2, sortOrder: 0 });
			const docC = createMockDoc({ id: 3, sortOrder: 1 });

			const docs = [docA, docB, docC];
			docs.sort(comparator);

			expect(docs.map(d => d.id)).toEqual([2, 3, 1]);
		});
	});

	describe("internal functions - applyFilters", () => {
		it("should return all docs when filters is null (defensive)", () => {
			const docs = [createMockDoc({ id: 1 }), createMockDoc({ id: 2 })];
			// Use type assertion to test defensive code path
			const result = _internal.applyFilters(docs, null as unknown as { updated: "any_time"; creator: string });
			expect(result).toEqual(docs);
		});

		it("should return all docs when filters is undefined (defensive)", () => {
			const docs = [createMockDoc({ id: 1 }), createMockDoc({ id: 2 })];
			// Use type assertion to test defensive code path
			const result = _internal.applyFilters(
				docs,
				undefined as unknown as { updated: "any_time"; creator: string },
			);
			expect(result).toEqual(docs);
		});

		it("should return all docs when filters.updated is missing (defensive)", () => {
			const docs = [createMockDoc({ id: 1 }), createMockDoc({ id: 2 })];
			// Use type assertion to test defensive code path
			const result = _internal.applyFilters(docs, { creator: "" } as unknown as {
				updated: "any_time";
				creator: string;
			});
			expect(result).toEqual(docs);
		});

		it("should return all docs when filters.creator is missing (defensive)", () => {
			const docs = [createMockDoc({ id: 1 }), createMockDoc({ id: 2 })];
			// Use type assertion to test defensive code path
			const result = _internal.applyFilters(docs, { updated: "any_time" } as unknown as {
				updated: "any_time";
				creator: string;
			});
			expect(result).toEqual(docs);
		});

		it("should apply valid filters correctly", () => {
			const now = new Date();
			const oldDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
			const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

			const docs = [
				createMockDoc({ id: 1, updatedAt: recentDate, createdBy: "alice@example.com" }),
				createMockDoc({ id: 2, updatedAt: oldDate, createdBy: "bob@example.com" }),
				createMockDoc({ id: 3, updatedAt: recentDate, createdBy: "bob@example.com" }),
			];

			// Filter by last 7 days
			const result = _internal.applyFilters(docs, {
				updated: "last_7_days",
				creator: "",
			});

			expect(result.length).toBe(2);
			expect(result.map(d => d.id)).toEqual([1, 3]);
		});

		// TODO: Re-enable when member/permission features are implemented
		// biome-ignore lint/suspicious/noSkippedTests: Creator filter temporarily disabled
		it.skip("should apply both updated and creator filters", () => {
			const now = new Date();
			const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

			const docs = [
				createMockDoc({ id: 1, updatedAt: recentDate, createdBy: "alice@example.com" }),
				createMockDoc({ id: 2, updatedAt: recentDate, createdBy: "bob@example.com" }),
			];

			const result = _internal.applyFilters(docs, {
				updated: "last_7_days",
				creator: "alice@example.com",
			});

			expect(result.length).toBe(1);
			expect(result[0].id).toBe(1);
		});
	});
});
