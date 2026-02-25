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
	reorderDoc: vi.fn(),
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

describe("useSpaceTree optimistic updates", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSpacesClient.getTreeContent.mockResolvedValue([]);
		mockSpacesClient.getTrashContent.mockResolvedValue([]);
		mockSpacesClient.hasTrash.mockResolvedValue(false);
		mockSpacesClient.getPreferences.mockResolvedValue({ sort: null, filters: {}, expandedFolders: [] });
		mockSpacesClient.updatePreferences.mockResolvedValue({ sort: null, filters: {}, expandedFolders: [] });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	describe("rename optimistic update", () => {
		it("should update tree immediately before API call completes", async () => {
			const doc = createMockDoc({ id: 1, contentMetadata: { title: "Original Title" } });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);

			// Create a promise we can control to simulate slow API
			let resolveRename!: (value: Doc) => void;
			const renamePromise = new Promise<Doc>(resolve => {
				resolveRename = resolve;
			});
			mockDocsClient.renameDoc.mockReturnValue(renamePromise);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			// Start rename but don't await
			let renameResult: Doc | undefined;
			act(() => {
				const [, actions] = result.current;
				actions.rename(1, "New Title").then(res => {
					renameResult = res;
				});
			});

			// Tree should be updated immediately (before API completes)
			await waitFor(() => {
				const [state] = result.current;
				const title = (state.treeData[0]?.doc.contentMetadata as { title?: string })?.title;
				expect(title).toBe("New Title");
			});

			// Now resolve the API call
			const updatedDoc = createMockDoc({ id: 1, contentMetadata: { title: "New Title" } });
			resolveRename?.(updatedDoc);

			await waitFor(() => {
				expect(renameResult).toBeDefined();
			});

			// Tree should still show new title
			const [state] = result.current;
			const title = (state.treeData[0]?.doc.contentMetadata as { title?: string })?.title;
			expect(title).toBe("New Title");
		});

		it("should rollback on API failure", async () => {
			const doc = createMockDoc({ id: 1, contentMetadata: { title: "Original Title" } });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.renameDoc.mockRejectedValue(new Error("Rename failed"));

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;

			// Rename should fail and rollback
			await expect(
				act(async () => {
					await actions.rename(1, "New Title");
				}),
			).rejects.toThrow("Rename failed");

			// Tree should be rolled back to original title
			const [state] = result.current;
			const title = (state.treeData[0]?.doc.contentMetadata as { title?: string })?.title;
			expect(title).toBe("Original Title");
		});

		it("should update only the target doc in cache when renaming with multiple docs", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
				createMockDoc({ id: 3, contentMetadata: { title: "Doc 3" }, sortOrder: 2 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);
			mockDocsClient.renameDoc.mockResolvedValue(
				createMockDoc({ id: 2, contentMetadata: { title: "Renamed Doc 2" } }),
			);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.length).toBe(3);
			});

			// Rename doc 2 only
			await act(async () => {
				const [, actions] = result.current;
				await actions.rename(2, "Renamed Doc 2");
			});

			// Doc 1 and Doc 3 should be unchanged, only Doc 2 renamed
			const [state] = result.current;
			const titles = state.treeData.map(n => (n.doc.contentMetadata as { title?: string })?.title);
			expect(titles).toEqual(["Doc 1", "Renamed Doc 2", "Doc 3"]);
		});

		it("should not call loadTree after rename", async () => {
			const doc = createMockDoc({ id: 1, contentMetadata: { title: "Original Title" } });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.renameDoc.mockResolvedValue(
				createMockDoc({ id: 1, contentMetadata: { title: "New Title" } }),
			);

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
				await actions.rename(1, "New Title");
			});

			// loadTree should NOT be called (optimistic update)
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});
	});

	describe("softDelete optimistic update", () => {
		it("should collect and remove nested descendants from cache when soft deleting a folder", async () => {
			// Create a folder with nested children: folder(1) -> child(2) -> grandchild(3), plus sibling(4)
			const folder = createMockDoc({
				id: 1,
				docType: "folder",
				contentMetadata: { title: "Folder" },
				sortOrder: 0,
			});
			const child = createMockDoc({
				id: 2,
				parentId: 1,
				contentMetadata: { title: "Child Doc" },
				sortOrder: 0,
			});
			const grandchild = createMockDoc({
				id: 3,
				parentId: 2,
				docType: "folder",
				contentMetadata: { title: "Grandchild Folder" },
				sortOrder: 0,
			});
			const sibling = createMockDoc({
				id: 4,
				contentMetadata: { title: "Sibling Doc" },
				sortOrder: 1,
			});
			mockSpacesClient.getTreeContent.mockResolvedValue([folder, child, grandchild, sibling]);

			let resolveSoftDelete!: () => void;
			const softDeletePromise = new Promise<void>(resolve => {
				resolveSoftDelete = resolve;
			});
			mockDocsClient.softDelete.mockReturnValue(softDeletePromise);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.length).toBe(2); // folder + sibling at root
			});

			// Soft delete the folder (should also remove child and grandchild)
			act(() => {
				const [, actions] = result.current;
				actions.softDelete(1);
			});

			// Only the sibling should remain in the tree
			await waitFor(() => {
				const [state] = result.current;
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.id).toBe(4);
			});

			// Resolve the API call
			resolveSoftDelete?.();

			await waitFor(() => {
				expect(mockDocsClient.softDelete).toHaveBeenCalledWith(1);
			});
		});

		it("should remove node from tree immediately before API call completes", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);

			// Create a promise we can control
			let resolveSoftDelete!: () => void;
			const softDeletePromise = new Promise<void>(resolve => {
				resolveSoftDelete = resolve;
			});
			mockDocsClient.softDelete.mockReturnValue(softDeletePromise);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.length).toBe(2);
			});

			// Start softDelete but don't await
			act(() => {
				const [, actions] = result.current;
				actions.softDelete(1);
			});

			// Tree should be updated immediately (node removed)
			await waitFor(() => {
				const [state] = result.current;
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.id).toBe(2);
			});

			// hasTrash should be set to true optimistically
			const [stateAfterDelete] = result.current;
			expect(stateAfterDelete.hasTrash).toBe(true);

			// Now resolve the API call
			resolveSoftDelete?.();

			await waitFor(() => {
				expect(mockDocsClient.softDelete).toHaveBeenCalledWith(1);
			});
		});

		it("should rollback on API failure", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);
			mockDocsClient.softDelete.mockRejectedValue(new Error("Delete failed"));

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.length).toBe(2);
			});

			const [, actions] = result.current;

			// softDelete should fail and rollback
			await expect(
				act(async () => {
					await actions.softDelete(1);
				}),
			).rejects.toThrow("Delete failed");

			// Tree should be rolled back
			const [state] = result.current;
			expect(state.treeData.length).toBe(2);
			expect(state.treeData[0].doc.id).toBe(1);
		});

		it("should not call loadTree after softDelete", async () => {
			const doc = createMockDoc({ id: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([doc]);
			mockDocsClient.softDelete.mockResolvedValue(undefined);

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
				await actions.softDelete(1);
			});

			// loadTree should NOT be called (optimistic update)
			expect(mockSpacesClient.getTreeContent).not.toHaveBeenCalled();
		});
	});

	describe("reorderDoc optimistic update", () => {
		it("should swap nodes immediately before API call completes", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);

			// Create a promise we can control
			let resolveReorder!: () => void;
			const reorderPromise = new Promise<void>(resolve => {
				resolveReorder = resolve;
			});
			mockDocsClient.reorderDoc.mockReturnValue(reorderPromise);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData[0].doc.id).toBe(1);
				expect(state.treeData[1].doc.id).toBe(2);
			});

			// Start reorder but don't await
			act(() => {
				const [, actions] = result.current;
				actions.reorderDoc(1, "down");
			});

			// Nodes should be swapped immediately
			await waitFor(() => {
				const [state] = result.current;
				expect(state.treeData[0].doc.id).toBe(2);
				expect(state.treeData[1].doc.id).toBe(1);
			});

			// Now resolve the API call
			resolveReorder?.();
		});

		it("should rollback on API failure", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);
			mockDocsClient.reorderDoc.mockRejectedValue(new Error("Reorder failed"));

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;

			// reorderDoc should fail and rollback
			await expect(
				act(async () => {
					await actions.reorderDoc(1, "down");
				}),
			).rejects.toThrow("Reorder failed");

			// Tree should be rolled back to original order
			const [state] = result.current;
			expect(state.treeData[0].doc.id).toBe(1);
			expect(state.treeData[1].doc.id).toBe(2);
		});
	});

	describe("moveTo optimistic update", () => {
		it("should move node immediately before API call completes", async () => {
			const folder = createMockDoc({
				id: 1,
				docType: "folder",
				contentMetadata: { title: "Folder" },
				sortOrder: 0,
			});
			const doc = createMockDoc({ id: 2, contentMetadata: { title: "Doc" }, sortOrder: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([folder, doc]);

			// Create a promise we can control
			let resolveMove!: () => void;
			const movePromise = new Promise<void>(resolve => {
				resolveMove = resolve;
			});
			mockDocsClient.moveDoc.mockReturnValue(movePromise);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.length).toBe(2);
			});

			// Start move but don't await
			act(() => {
				const [, actions] = result.current;
				actions.moveTo(2, 1); // Move doc into folder
			});

			// Node should be moved immediately
			await waitFor(() => {
				const [state] = result.current;
				// Root should now only have folder
				expect(state.treeData.length).toBe(1);
				expect(state.treeData[0].doc.id).toBe(1);
				// Folder should have doc as child
				expect(state.treeData[0].children.length).toBe(1);
				expect(state.treeData[0].children[0].doc.id).toBe(2);
			});

			// Folder should be expanded
			const [stateAfterMove] = result.current;
			expect(stateAfterMove.treeData[0].expanded).toBe(true);

			// Now resolve the API call
			resolveMove?.();
		});

		it("should rollback on API failure", async () => {
			const folder = createMockDoc({
				id: 1,
				docType: "folder",
				contentMetadata: { title: "Folder" },
				sortOrder: 0,
			});
			const doc = createMockDoc({ id: 2, contentMetadata: { title: "Doc" }, sortOrder: 1 });
			mockSpacesClient.getTreeContent.mockResolvedValue([folder, doc]);
			mockDocsClient.moveDoc.mockRejectedValue(new Error("Move failed"));

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;

			// moveTo should fail and rollback
			await expect(
				act(async () => {
					await actions.moveTo(2, 1);
				}),
			).rejects.toThrow("Move failed");

			// Tree should be rolled back
			const [state] = result.current;
			expect(state.treeData.length).toBe(2);
			expect(state.treeData[0].doc.id).toBe(1);
			expect(state.treeData[0].children.length).toBe(0);
			expect(state.treeData[1].doc.id).toBe(2);
		});
	});

	describe("reorderAt optimistic update", () => {
		it("should reorder node immediately before API call completes", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
				createMockDoc({ id: 3, contentMetadata: { title: "Doc 3" }, sortOrder: 2 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);

			// Create a promise we can control
			let resolveReorder!: () => void;
			const reorderPromise = new Promise<void>(resolve => {
				resolveReorder = resolve;
			});
			mockDocsClient.reorderAt.mockReturnValue(reorderPromise);

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
				expect(state.treeData.map(n => n.doc.id)).toEqual([1, 2, 3]);
			});

			// Start reorder: move doc 3 before doc 1
			act(() => {
				const [, actions] = result.current;
				actions.reorderAt(3, 1, "before");
			});

			// Order should change immediately
			await waitFor(() => {
				const [state] = result.current;
				expect(state.treeData.map(n => n.doc.id)).toEqual([3, 1, 2]);
			});

			// Now resolve the API call
			resolveReorder?.();
		});

		it("should rollback on API failure", async () => {
			const docs = [
				createMockDoc({ id: 1, contentMetadata: { title: "Doc 1" }, sortOrder: 0 }),
				createMockDoc({ id: 2, contentMetadata: { title: "Doc 2" }, sortOrder: 1 }),
				createMockDoc({ id: 3, contentMetadata: { title: "Doc 3" }, sortOrder: 2 }),
			];
			mockSpacesClient.getTreeContent.mockResolvedValue(docs);
			mockDocsClient.reorderAt.mockRejectedValue(new Error("Reorder failed"));

			const testSpace = createMockSpace();
			const { result } = renderHook(() => useSpaceTree(testSpace));

			await waitFor(() => {
				const [state] = result.current;
				expect(state.loading).toBe(false);
			});

			const [, actions] = result.current;

			// reorderAt should fail and rollback
			await expect(
				act(async () => {
					await actions.reorderAt(3, 1, "before");
				}),
			).rejects.toThrow("Reorder failed");

			// Tree should be rolled back to original order
			const [state] = result.current;
			expect(state.treeData.map(n => n.doc.id)).toEqual([1, 2, 3]);
		});
	});
});
