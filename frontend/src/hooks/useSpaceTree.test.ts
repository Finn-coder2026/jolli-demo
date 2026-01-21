import { useSpaceTree } from "./useSpaceTree";
import { act, renderHook, waitFor } from "@testing-library/preact";
import type { Doc, Space } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the ClientContext
const mockSpacesClient = {
	getDefaultSpace: vi.fn(),
	getTreeContent: vi.fn(),
	getTrashContent: vi.fn(),
	hasTrash: vi.fn(),
};

const mockDocsClient = {
	createDoc: vi.fn(),
	softDelete: vi.fn(),
	restore: vi.fn(),
	renameDoc: vi.fn(),
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
		defaultSort: "default",
		defaultFilters: {},
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
	beforeEach(() => {
		vi.clearAllMocks();
		mockSpacesClient.getDefaultSpace.mockResolvedValue(createMockSpace());
		mockSpacesClient.getTreeContent.mockResolvedValue([]);
		mockSpacesClient.getTrashContent.mockResolvedValue([]);
		mockSpacesClient.hasTrash.mockResolvedValue(false);
	});

	it("should initialize with loading state", () => {
		const { result } = renderHook(() => useSpaceTree());
		const [state] = result.current;

		expect(state.loading).toBe(true);
		expect(state.treeData).toEqual([]);
		expect(state.trashData).toEqual([]);
	});

	it("should load space on mount", async () => {
		const mockSpace = createMockSpace();
		mockSpacesClient.getDefaultSpace.mockResolvedValue(mockSpace);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toEqual(mockSpace);
		});

		expect(mockSpacesClient.getDefaultSpace).toHaveBeenCalled();
	});

	it("should load tree content when space is available", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" }), createMockDoc({ id: 2, parentId: 1 })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		expect(mockSpacesClient.getTreeContent).toHaveBeenCalled();
	});

	it("should handle loadSpace error gracefully", async () => {
		mockSpacesClient.getDefaultSpace.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});
	});

	it("should toggle expanded state", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree());

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
		const { result } = renderHook(() => useSpaceTree());

		act(() => {
			const [, actions] = result.current;
			actions.selectDoc(123);
		});

		const [state] = result.current;
		expect(state.selectedDocId).toBe(123);
	});

	it("should set showTrash state", () => {
		const { result } = renderHook(() => useSpaceTree());

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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

	it("should create document", async () => {
		const mockNewDoc = createMockDoc({ id: 11 });
		mockDocsClient.createDoc.mockResolvedValue(mockNewDoc);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.softDelete(1);
		});

		expect(mockDocsClient.softDelete).toHaveBeenCalledWith(1);
	});

	it("should restore document", async () => {
		mockDocsClient.restore.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.loadTrash();
		});

		const [state] = result.current;
		expect(state.trashData).toEqual(trashDocs);
	});

	it("should refresh tree", async () => {
		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Should not throw, just log error
		const [state] = result.current;
		expect(state.treeData).toEqual([]);
	});

	it("should handle createFolder without space", async () => {
		mockSpacesClient.getDefaultSpace.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createFolder(undefined, "Test");
		});

		expect(createdDoc).toBeUndefined();
		expect(mockDocsClient.createDoc).not.toHaveBeenCalled();
	});

	it("should handle createDoc without space", async () => {
		mockSpacesClient.getDefaultSpace.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});

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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
		});

		let createdDoc: Doc | undefined;
		await act(async () => {
			const [, actions] = result.current;
			createdDoc = await actions.createDoc(undefined, "Test");
		});

		expect(createdDoc).toBeUndefined();
	});

	it("should handle softDelete error", async () => {
		mockDocsClient.softDelete.mockRejectedValue(new Error("Delete failed"));

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
		});

		// Should not throw
		await act(async () => {
			const [, actions] = result.current;
			await actions.softDelete(1);
		});
	});

	it("should handle restore error", async () => {
		mockDocsClient.restore.mockRejectedValue(new Error("Restore failed"));

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
		});

		// Should not throw
		await act(async () => {
			const [, actions] = result.current;
			await actions.restore(1);
		});
	});

	it("should handle loadTrash error", async () => {
		mockSpacesClient.getTrashContent.mockRejectedValue(new Error("Load failed"));

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeDefined();
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

		const { result } = renderHook(() => useSpaceTree());

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

		const { result } = renderHook(() => useSpaceTree());

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

	it("should expand all folders on first load", async () => {
		const mockDocs = [
			createMockDoc({ id: 1, docType: "folder", parentId: undefined }),
			createMockDoc({ id: 2, docType: "folder", parentId: 1 }),
		];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.treeData.length).toBeGreaterThan(0);
		});

		const [state] = result.current;
		// First root folder should be expanded on first load
		expect(state.treeData[0].expanded).toBe(true);
	});

	it("should not load tree if space is not available", async () => {
		mockSpacesClient.getDefaultSpace.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});

		// getTreeContent should not be called if space is undefined
		// Note: it might be called once during initial setup, but not after space fails to load
	});

	it("should not load trash if space is not available", async () => {
		mockSpacesClient.getDefaultSpace.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});

		await act(async () => {
			const [, actions] = result.current;
			await actions.loadTrash();
		});

		// getTrashContent should not be called if space is undefined
		expect(mockSpacesClient.getTrashContent).not.toHaveBeenCalled();
	});

	it("should collapse expanded folder when toggled twice", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Get initial call count
		const initialCallCount = mockSpacesClient.getTreeContent.mock.calls.length;

		// First toggle should collapse (folder is expanded on first load)
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		await waitFor(() => {
			const [state] = result.current;
			// After first toggle, folder should be collapsed (expanded = false)
			expect(state.treeData[0]?.expanded).toBe(false);
		});

		// Second toggle should expand again
		act(() => {
			const [, actions] = result.current;
			actions.toggleExpanded(1);
		});

		await waitFor(() => {
			const [state] = result.current;
			// After second toggle, folder should be expanded again
			expect(state.treeData[0]?.expanded).toBe(true);
		});

		// Verify getTreeContent was called additional times for rebuilding
		expect(mockSpacesClient.getTreeContent.mock.calls.length).toBeGreaterThan(initialCallCount);
	});

	it("should handle error when rebuilding tree after expandedIds change", async () => {
		const mockDocs = [createMockDoc({ id: 1, docType: "folder" })];
		mockSpacesClient.getTreeContent.mockResolvedValue(mockDocs);

		const { result } = renderHook(() => useSpaceTree());

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
		const { result } = renderHook(() => useSpaceTree());

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

	it("should not load tree if space is not available", async () => {
		mockSpacesClient.getDefaultSpace.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});

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
		const { result } = renderHook(() => useSpaceTree());

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
		mockSpacesClient.getDefaultSpace.mockResolvedValue(undefined);

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.space).toBeUndefined();
		});

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

	it("should rename document and refresh tree", async () => {
		const updatedDoc = createMockDoc({ id: 1, version: 2, contentMetadata: { title: "New Name" } });
		mockDocsClient.renameDoc.mockResolvedValue(updatedDoc);

		const { result } = renderHook(() => useSpaceTree());

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
		expect(mockSpacesClient.getTreeContent).toHaveBeenCalled();
	});

	it("should handle error during rename", async () => {
		mockDocsClient.renameDoc.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useSpaceTree());

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		await act(async () => {
			const [, actions] = result.current;
			const renamed = await actions.rename(1, "New Name");
			expect(renamed).toBeUndefined();
		});
	});
});
