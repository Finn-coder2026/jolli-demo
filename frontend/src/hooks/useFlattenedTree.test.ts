import type { DragLayoutCache, DragLayoutItemRect, FlattenedItem, PositioningInfo } from "./useFlattenedTree";
import {
	buildProjectedDrop,
	findItemById,
	flattenTree,
	getDropIndicator,
	getItemsAtParent,
	getProjection,
	isDescendant,
} from "./useFlattenedTree";
import type { TreeNode } from "./useSpaceTree";
import type { Doc } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create a mock Doc
function createDoc(id: number, title: string, docType: "folder" | "document", parentId?: number): Doc {
	return {
		id,
		jrn: `jrn:space:1/${docType}/${title.toLowerCase().replace(/\s+/g, "-")}`,
		slug: title.toLowerCase().replace(/\s+/g, "-"),
		path: `/${title.toLowerCase().replace(/\s+/g, "-")}`,
		spaceId: 1,
		parentId,
		docType,
		content: "",
		contentType: docType === "folder" ? "folder" : "text/markdown",
		contentMetadata: { title },
		source: undefined,
		sourceMetadata: undefined,
		sortOrder: id * 1000,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: undefined,
		createdBy: undefined,
		updatedBy: "user",
		version: 1,
		explicitlyDeleted: false,
	};
}

// Helper to create a TreeNode
function createTreeNode(doc: Doc, children: Array<TreeNode> = [], expanded = false): TreeNode {
	return { doc, children, expanded };
}

describe("useFlattenedTree", () => {
	describe("flattenTree", () => {
		it("should flatten empty tree", () => {
			const result = flattenTree([]);
			expect(result).toEqual([]);
		});

		it("should flatten single item", () => {
			const doc = createDoc(1, "Document 1", "document");
			const tree = [createTreeNode(doc)];

			const result = flattenTree(tree);

			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({
				id: 1,
				depth: 0,
				parentId: undefined,
				index: 0,
				isFolder: false,
				expanded: false,
			});
		});

		it("should flatten multiple root items", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
				createTreeNode(createDoc(3, "Folder 1", "folder")),
			];

			const result = flattenTree(tree);

			expect(result).toHaveLength(3);
			expect(result[0].index).toBe(0);
			expect(result[1].index).toBe(1);
			expect(result[2].index).toBe(2);
			expect(result[2].isFolder).toBe(true);
		});

		it("should include children of expanded folders", () => {
			const parentDoc = createDoc(1, "Folder 1", "folder");
			const childDoc = createDoc(2, "Child Doc", "document", 1);
			const tree = [
				createTreeNode(parentDoc, [createTreeNode(childDoc)], true), // expanded
			];

			const result = flattenTree(tree);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe(1);
			expect(result[0].depth).toBe(0);
			expect(result[1].id).toBe(2);
			expect(result[1].depth).toBe(1);
			expect(result[1].parentId).toBe(1);
		});

		it("should not include children of collapsed folders", () => {
			const parentDoc = createDoc(1, "Folder 1", "folder");
			const childDoc = createDoc(2, "Child Doc", "document", 1);
			const tree = [
				createTreeNode(parentDoc, [createTreeNode(childDoc)], false), // collapsed
			];

			const result = flattenTree(tree);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});

		it("should track descendant IDs correctly", () => {
			const grandchildDoc = createDoc(3, "Grandchild", "document", 2);
			const childDoc = createDoc(2, "Child Folder", "folder", 1);
			const parentDoc = createDoc(1, "Parent Folder", "folder");

			const tree = [
				createTreeNode(parentDoc, [createTreeNode(childDoc, [createTreeNode(grandchildDoc)], true)], true),
			];

			const result = flattenTree(tree);

			expect(result).toHaveLength(3);
			// Parent should have both child and grandchild as descendants
			expect(result[0].descendantIds.has(2)).toBe(true);
			expect(result[0].descendantIds.has(3)).toBe(true);
			// Child folder should only have grandchild
			expect(result[1].descendantIds.has(3)).toBe(true);
			expect(result[1].descendantIds.has(1)).toBe(false);
			// Grandchild has no descendants
			expect(result[2].descendantIds.size).toBe(0);
		});

		it("should handle deeply nested expanded structure", () => {
			const level3 = createDoc(4, "Level 3", "document", 3);
			const level2 = createDoc(3, "Level 2 Folder", "folder", 2);
			const level1 = createDoc(2, "Level 1 Folder", "folder", 1);
			const root = createDoc(1, "Root Folder", "folder");

			const tree = [
				createTreeNode(
					root,
					[createTreeNode(level1, [createTreeNode(level2, [createTreeNode(level3)], true)], true)],
					true,
				),
			];

			const result = flattenTree(tree);

			expect(result).toHaveLength(4);
			expect(result[0].depth).toBe(0);
			expect(result[1].depth).toBe(1);
			expect(result[2].depth).toBe(2);
			expect(result[3].depth).toBe(3);
		});
	});

	describe("findItemById", () => {
		it("should find existing item", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			const found = findItemById(items, 2);

			expect(found).toBeDefined();
			expect(found?.id).toBe(2);
		});

		it("should return undefined for non-existent item", () => {
			const tree = [createTreeNode(createDoc(1, "Doc 1", "document"))];
			const items = flattenTree(tree);

			const found = findItemById(items, 999);

			expect(found).toBeUndefined();
		});
	});

	describe("getItemsAtParent", () => {
		it("should get root level items", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(
					createDoc(2, "Folder", "folder"),
					[createTreeNode(createDoc(3, "Child", "document", 2))],
					true,
				),
			];
			const items = flattenTree(tree);

			const rootItems = getItemsAtParent(items, undefined);

			expect(rootItems).toHaveLength(2);
			expect(rootItems.map(i => i.id)).toEqual([1, 2]);
		});

		it("should get items at specific parent", () => {
			const tree = [
				createTreeNode(
					createDoc(1, "Folder", "folder"),
					[
						createTreeNode(createDoc(2, "Child 1", "document", 1)),
						createTreeNode(createDoc(3, "Child 2", "document", 1)),
					],
					true,
				),
			];
			const items = flattenTree(tree);

			const children = getItemsAtParent(items, 1);

			expect(children).toHaveLength(2);
			expect(children.map(i => i.id)).toEqual([2, 3]);
		});
	});

	describe("isDescendant", () => {
		it("should detect direct child as descendant", () => {
			const tree = [
				createTreeNode(
					createDoc(1, "Folder", "folder"),
					[createTreeNode(createDoc(2, "Child", "document", 1))],
					true,
				),
			];
			const items = flattenTree(tree);

			expect(isDescendant(items, 1, 2)).toBe(true);
		});

		it("should detect nested descendant", () => {
			const tree = [
				createTreeNode(
					createDoc(1, "Folder", "folder"),
					[
						createTreeNode(
							createDoc(2, "Child Folder", "folder", 1),
							[createTreeNode(createDoc(3, "Grandchild", "document", 2))],
							true,
						),
					],
					true,
				),
			];
			const items = flattenTree(tree);

			expect(isDescendant(items, 1, 3)).toBe(true);
		});

		it("should not detect sibling as descendant", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			expect(isDescendant(items, 1, 2)).toBe(false);
		});

		it("should not detect parent as descendant", () => {
			const tree = [
				createTreeNode(
					createDoc(1, "Folder", "folder"),
					[createTreeNode(createDoc(2, "Child", "document", 1))],
					true,
				),
			];
			const items = flattenTree(tree);

			expect(isDescendant(items, 2, 1)).toBe(false);
		});

		it("should return false for non-existent source", () => {
			const tree = [createTreeNode(createDoc(1, "Doc", "document"))];
			const items = flattenTree(tree);

			expect(isDescendant(items, 999, 1)).toBe(false);
		});
	});

	describe("buildProjectedDrop", () => {
		// Helper to create a mock FlattenedItem for testing buildProjectedDrop directly
		function createFlattenedItem(overrides: Partial<FlattenedItem>): FlattenedItem {
			return {
				id: 1,
				doc: createDoc(1, "Test", "document"),
				depth: 0,
				parentId: undefined,
				index: 0,
				isFolder: false,
				expanded: false,
				descendantIds: new Set(),
				...overrides,
			};
		}

		it("should return isValid false when folder is dropped into itself", () => {
			// Create a folder item with id=5
			const folderItem = createFlattenedItem({
				id: 5,
				isFolder: true,
				parentId: undefined,
			});

			// Positioning where targetParentId equals the folder's own id
			const positioning: PositioningInfo = {
				targetParentId: 5, // Same as activeItem.id
				referenceDocId: null,
				dropPosition: "after",
				isOnFolderHeader: false,
			};

			const result = buildProjectedDrop(positioning, folderItem, 0, true);

			expect(result.isValid).toBe(false);
			expect(result.parentId).toBe(5);
			expect(result.isSameParent).toBe(false); // parentId (5) !== activeItem.parentId (undefined)
		});

		it("should return isValid true when folder is dropped into different parent", () => {
			const folderItem = createFlattenedItem({
				id: 5,
				isFolder: true,
				parentId: undefined,
			});

			// Positioning where targetParentId is different from folder's id
			const positioning: PositioningInfo = {
				targetParentId: 10, // Different from activeItem.id
				referenceDocId: null,
				dropPosition: "after",
				isOnFolderHeader: false,
			};

			const result = buildProjectedDrop(positioning, folderItem, 0, true);

			expect(result.isValid).toBe(true);
			expect(result.parentId).toBe(10);
		});

		it("should return isValid false for same-parent reordering in non-default sort", () => {
			const docItem = createFlattenedItem({
				id: 5,
				isFolder: false,
				parentId: 10,
			});

			// Positioning where targetParentId equals activeItem.parentId (same parent)
			const positioning: PositioningInfo = {
				targetParentId: 10, // Same as activeItem.parentId
				referenceDocId: 6,
				dropPosition: "before",
				isOnFolderHeader: false,
			};

			const result = buildProjectedDrop(positioning, docItem, 0, false); // non-default sort

			expect(result.isValid).toBe(false);
			expect(result.isSameParent).toBe(true);
		});
	});

	describe("getProjection", () => {
		it("should return null when dragging over self", () => {
			const tree = [createTreeNode(createDoc(1, "Doc", "document"))];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 1, 0, true);

			expect(projection).toBeNull();
		});

		it("should return null for non-existent active item", () => {
			const tree = [createTreeNode(createDoc(1, "Doc", "document"))];
			const items = flattenTree(tree);

			const projection = getProjection(items, 999, 1, 0, true);

			expect(projection).toBeNull();
		});

		it("should return null for non-existent over item", () => {
			const tree = [createTreeNode(createDoc(1, "Doc", "document"))];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 999, 0, true);

			expect(projection).toBeNull();
		});

		it("should mark dropping on descendant as invalid", () => {
			const tree = [
				createTreeNode(
					createDoc(1, "Folder", "folder"),
					[createTreeNode(createDoc(2, "Child", "document", 1))],
					true,
				),
			];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 2, 0, true);

			expect(projection).not.toBeNull();
			expect(projection?.isValid).toBe(false);
		});

		it("should allow dropping on sibling document in default sort mode", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 2, 0, true);

			expect(projection).not.toBeNull();
			expect(projection?.isValid).toBe(true);
			expect(projection?.isSameParent).toBe(true);
			expect(projection?.parentId).toBeUndefined();
			expect(projection?.referenceDocId).toBe(2);
			expect(projection?.dropPosition).toBe("after");
		});

		it("should disallow same-parent reordering in non-default sort mode", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 2, 0, false); // non-default sort

			expect(projection).not.toBeNull();
			expect(projection?.isValid).toBe(false);
			expect(projection?.isSameParent).toBe(true);
		});

		it("should allow cross-folder move in non-default sort mode", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Folder", "folder"), [], false),
			];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 2, 0, false); // non-default sort

			expect(projection).not.toBeNull();
			expect(projection?.isValid).toBe(true);
			expect(projection?.isSameParent).toBe(false);
			expect(projection?.parentId).toBe(2); // Drop into folder
		});

		it("should project into expanded folder (move to end, fallback when no mouseY)", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(
					createDoc(2, "Folder", "folder"),
					[createTreeNode(createDoc(3, "Child", "document", 2))],
					true, // expanded
				),
			];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 2, 0, true);

			expect(projection).not.toBeNull();
			expect(projection?.parentId).toBe(2);
			// Without mouseY, fallback to move into folder (referenceDocId = null)
			expect(projection?.referenceDocId).toBeNull();
		});

		it("should use fallback when mouseY is provided but DOM element not found", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(
					createDoc(2, "Folder", "folder"),
					[createTreeNode(createDoc(3, "Child", "document", 2))],
					true, // expanded
				),
			];
			const items = flattenTree(tree);

			// Pass mouseY - in test environment, DOM element won't be found, so fallback is used
			const projection = getProjection(items, 1, 2, 0, true, 200);

			expect(projection).not.toBeNull();
			expect(projection?.parentId).toBe(2);
			// Fallback: move into folder (referenceDocId = null)
			expect(projection?.referenceDocId).toBeNull();
		});

		it("should project into collapsed folder (move to end)", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(
					createDoc(2, "Folder", "folder"),
					[createTreeNode(createDoc(3, "Child", "document", 2))],
					false, // collapsed
				),
			];
			const items = flattenTree(tree);

			const projection = getProjection(items, 1, 2, 0, true);

			expect(projection).not.toBeNull();
			expect(projection?.parentId).toBe(2);
			// Move into folder (referenceDocId = null)
			expect(projection?.referenceDocId).toBeNull();
		});

		it("should prevent dropping folder into itself", () => {
			const tree = [
				createTreeNode(createDoc(1, "Folder 1", "folder"), [], false),
				createTreeNode(createDoc(2, "Folder 2", "folder"), [], false),
			];
			const items = flattenTree(tree);

			// This case is handled by the "dropping on descendant" check
			// since a folder is considered its own container
			const projection = getProjection(items, 1, 1, 0, true);

			expect(projection).toBeNull(); // Cannot drop on self
		});

		describe("with layout cache", () => {
			function createLayoutCache(overrides: Partial<DragLayoutCache> = {}): DragLayoutCache {
				return {
					childrenByParent: new Map<number | undefined, Array<number>>(),
					itemRects: new Map<number, DragLayoutItemRect>(),
					containerTop: 0,
					scrollTop: 0,
					scrollLeft: 0,
					...overrides,
				};
			}

			it("should return null when dropping on current parent folder header", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[createTreeNode(createDoc(2, "Child", "document", 1))],
						true,
					),
				];
				const items = flattenTree(tree);

				const layoutCache = createLayoutCache({
					containerTop: 100,
					scrollTop: 200,
					childrenByParent: new Map<number | undefined, Array<number>>([
						[undefined, [1]],
						[1, [2]],
					]),
					itemRects: new Map<number, DragLayoutItemRect>([
						[1, { rectTop: 120, rectBottom: 150, height: 30, top: 200 }],
						[2, { rectTop: 160, rectBottom: 180, height: 20, top: 240 }],
					]),
				});

				// active item is already inside folder 1, hovering over folder header should be no-op
				const projection = getProjection(items, 2, 1, 0, true, 120, layoutCache);

				expect(projection).toBeNull();
			});

			it("should use content coordinates from layout cache for before/after calculation", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				const layoutCache = createLayoutCache({
					containerTop: 100,
					scrollTop: 200,
					childrenByParent: new Map<number | undefined, Array<number>>([
						[undefined, [1]],
						[1, [2, 3]],
					]),
					itemRects: new Map<number, DragLayoutItemRect>([
						[1, { rectTop: 120, rectBottom: 140, height: 20, top: 180 }],
						[2, { rectTop: 160, rectBottom: 180, height: 20, top: 220 }],
						[3, { rectTop: 190, rectBottom: 210, height: 20, top: 250 }],
					]),
				});

				// mouseYInContent = 120 - 100 + 200 = 220, which is before Doc A center (230)
				const projection = getProjection(items, 3, 1, 0, true, 120, layoutCache);

				expect(projection).not.toBeNull();
				expect(projection?.referenceDocId).toBe(2);
				expect(projection?.dropPosition).toBe("before");
			});
		});

		describe("with DOM mocking", () => {
			let querySelectorSpy: ReturnType<typeof vi.spyOn>;

			beforeEach(() => {
				querySelectorSpy = vi.spyOn(document, "querySelector");
			});

			afterEach(() => {
				querySelectorSpy.mockRestore();
			});

			it("should return 'before' position when mouseY is above child center", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				// Mock DOM elements for items inside folder
				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 80, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Doc B (id=3), hover over folder, mouseY=55 (above Doc A center at 65)
				const projection = getProjection(items, 3, 1, 0, true, 55);

				expect(projection).not.toBeNull();
				expect(projection?.referenceDocId).toBe(2); // before Doc A
				expect(projection?.dropPosition).toBe("before");
				expect(projection?.isValid).toBe(true);
			});

			it("should return 'after' position when mouseY is below all children centers", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 80, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Doc A (id=2), hover over folder, mouseY=100 (below Doc B center at 95)
				const projection = getProjection(items, 2, 1, 0, true, 100);

				expect(projection).not.toBeNull();
				expect(projection?.referenceDocId).toBe(3); // after Doc B
				expect(projection?.dropPosition).toBe("after");
				expect(projection?.isValid).toBe(true);
			});

			it("should return null when 'before next sibling' (same position)", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 80, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Doc A (id=2), hover over folder, mouseY=85 (above Doc B center at 95)
				// This would place Doc A "before Doc B" which is its next sibling - same position
				const projection = getProjection(items, 2, 1, 0, true, 85);

				expect(projection).toBeNull(); // Same position
			});

			it("should return null when 'after previous sibling' (same position)", () => {
				// Use three elements: A, B, C to test "after B" when dragging C
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
							createTreeNode(createDoc(4, "Doc C", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 80, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-4"]') {
						// Doc C is not visible in DOM (returns null) so loop stops at Doc B
						return null;
					}
					return null;
				});

				// Drag Doc C (id=4), hover over folder, mouseY=100 (below Doc B center at 95)
				// lastVisibleChild = Doc B (index 1), activeIndex = 2 for Doc C
				// lastVisibleChildIndex (1) === activeIndex (2) - 1? YES
				// This means "after Doc B" which is Doc C's previous sibling - same position
				const projection = getProjection(items, 4, 1, 0, true, 100);

				expect(projection).toBeNull(); // Same position
			});

			it("should return null when 'before activeItem' (same position)", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 80, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Doc A (id=2), hover over folder, mouseY=55 (above Doc A center at 65)
				// This would place Doc A "before Doc A" - same position
				const projection = getProjection(items, 2, 1, 0, true, 55);

				expect(projection).toBeNull(); // Same position
			});

			it("should return null when 'after activeItem' (same position)", () => {
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[createTreeNode(createDoc(2, "Doc A", "document", 1))],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Doc A (id=2), hover over folder, mouseY=70 (below Doc A center at 65)
				// This would place Doc A "after Doc A" - same position
				const projection = getProjection(items, 2, 1, 0, true, 70);

				expect(projection).toBeNull(); // Same position
			});

			it("should return folder header drop when mouseY is on or above folder header", () => {
				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					return null;
				});

				const treeWithRootDoc = [
					createTreeNode(createDoc(99, "Root Doc", "document")),
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[createTreeNode(createDoc(2, "Doc A", "document", 1))],
						true,
					),
				];
				const itemsWithRootDoc = flattenTree(treeWithRootDoc);

				// Drag Root Doc, hover over folder, mouseY=20 (on folder header, below bottom=30)
				const projection = getProjection(itemsWithRootDoc, 99, 1, 0, true, 20);

				expect(projection).not.toBeNull();
				expect(projection?.parentId).toBe(1);
				expect(projection?.isOnFolderHeader).toBe(true);
			});

			it("should mark invalid when folder is dropped into itself via expanded folder", () => {
				// This tests the buildProjectedDrop validation for folder self-drop
				const tree = [
					createTreeNode(
						createDoc(1, "Folder A", "folder"),
						[
							createTreeNode(
								createDoc(2, "Folder B", "folder", 1),
								[createTreeNode(createDoc(3, "Doc", "document", 2))],
								true,
							),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					// When dragging Folder B and hovering on its child Doc,
					// the container becomes Folder B itself
					if (selector === '[data-folder-header-id="2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, bottom: 80, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 90, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Folder B (id=2), hover over its child Doc (id=3)
				// This should be caught by isDescendant check
				const projection = getProjection(items, 2, 3, 0, true, 100);

				expect(projection).not.toBeNull();
				expect(projection?.isValid).toBe(false);
			});

			it("should handle empty folder with mouseY and return isOnFolderHeader true", () => {
				// Test the path where children.length === 0 with mouseY provided
				const tree = [
					createTreeNode(createDoc(99, "Root Doc", "document")),
					createTreeNode(
						createDoc(1, "Empty Folder", "folder"),
						[], // No children
						true, // expanded
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, bottom: 80, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Root Doc, hover over empty folder, mouseY=100 (below folder header)
				const projection = getProjection(items, 99, 1, 0, true, 100);

				expect(projection).not.toBeNull();
				expect(projection?.parentId).toBe(1);
				expect(projection?.referenceDocId).toBeNull();
				expect(projection?.isOnFolderHeader).toBe(true); // Empty folder triggers isOnFolderHeader
			});

			it("should use document parentId as containerId when hovering over document with mouseY", () => {
				// Test the branch where overItem is a document (not folder)
				// containerId = overItem.parentId
				const tree = [
					createTreeNode(
						createDoc(1, "Folder", "folder"),
						[
							createTreeNode(createDoc(2, "Doc A", "document", 1)),
							createTreeNode(createDoc(3, "Doc B", "document", 1)),
						],
						true,
					),
				];
				const items = flattenTree(tree);

				querySelectorSpy.mockImplementation(selector => {
					// Mock folder header for containerId (which is the folder id=1)
					if (selector === '[data-folder-header-id="1"]') {
						return {
							getBoundingClientRect: () => ({ top: 0, bottom: 30, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-2"]') {
						return {
							getBoundingClientRect: () => ({ top: 50, height: 30 }),
						} as Element;
					}
					if (selector === '[data-testid="tree-item-3"]') {
						return {
							getBoundingClientRect: () => ({ top: 80, height: 30 }),
						} as Element;
					}
					return null;
				});

				// Drag Doc A (id=2), hover over Doc B (document, not folder), mouseY=100
				// overItem is Doc B, which is not a folder, so containerId = Doc B's parentId = 1
				const projection = getProjection(items, 2, 3, 0, true, 100);

				// This tests the branch: containerId = overItem.parentId (when overItem is document)
				expect(projection).not.toBeNull();
				expect(projection?.parentId).toBe(1); // Parent folder
			});
		});
	});

	describe("getDropIndicator", () => {
		const mockRect = { top: 100, height: 30 };

		it("should return null when dragging over self", () => {
			const tree = [createTreeNode(createDoc(1, "Doc", "document"))];
			const items = flattenTree(tree);

			const indicator = getDropIndicator(items, 1, 1, 115, mockRect, true);

			expect(indicator).toBeNull();
		});

		it("should return null for missing rect", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			const indicator = getDropIndicator(items, 1, 2, 115, null, true);

			expect(indicator).toBeNull();
		});

		it("should indicate 'before' position for document top half", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			// Pointer at Y=105 (5px from top of item at Y=100-130)
			const indicator = getDropIndicator(items, 1, 2, 105, mockRect, true);

			expect(indicator).not.toBeNull();
			expect(indicator?.position).toBe("before");
		});

		it("should indicate 'after' position for document bottom half", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			// Pointer at Y=125 (25px from top of item at Y=100-130)
			const indicator = getDropIndicator(items, 1, 2, 125, mockRect, true);

			expect(indicator).not.toBeNull();
			expect(indicator?.position).toBe("after");
		});

		it("should indicate 'before' for folder top third", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc", "document")),
				createTreeNode(createDoc(2, "Folder", "folder"), [], false),
			];
			const items = flattenTree(tree);

			// Pointer at Y=105 (5px from top, within top third of 30px height)
			const indicator = getDropIndicator(items, 1, 2, 105, mockRect, true);

			expect(indicator).not.toBeNull();
			expect(indicator?.position).toBe("before");
		});

		it("should indicate 'inside' for folder middle third", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc", "document")),
				createTreeNode(createDoc(2, "Folder", "folder"), [], false),
			];
			const items = flattenTree(tree);

			// Pointer at Y=115 (15px from top, within middle third)
			const indicator = getDropIndicator(items, 1, 2, 115, mockRect, true);

			expect(indicator).not.toBeNull();
			expect(indicator?.position).toBe("inside");
			expect(indicator?.depth).toBe(1); // Inside folder, so depth + 1
		});

		it("should indicate 'after' for folder bottom third", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc", "document")),
				createTreeNode(createDoc(2, "Folder", "folder"), [], false),
			];
			const items = flattenTree(tree);

			// Pointer at Y=125 (25px from top, within bottom third)
			const indicator = getDropIndicator(items, 1, 2, 125, mockRect, true);

			expect(indicator).not.toBeNull();
			expect(indicator?.position).toBe("after");
		});

		it("should mark invalid for same-parent in non-default mode", () => {
			const tree = [
				createTreeNode(createDoc(1, "Doc 1", "document")),
				createTreeNode(createDoc(2, "Doc 2", "document")),
			];
			const items = flattenTree(tree);

			const indicator = getDropIndicator(items, 1, 2, 115, mockRect, false);

			expect(indicator).not.toBeNull();
			expect(indicator?.isValid).toBe(false);
		});

		it("should mark invalid when dropping on descendant", () => {
			const tree = [
				createTreeNode(
					createDoc(1, "Folder", "folder"),
					[createTreeNode(createDoc(2, "Child", "document", 1))],
					true,
				),
			];
			const items = flattenTree(tree);

			const indicator = getDropIndicator(items, 1, 2, 115, mockRect, true);

			expect(indicator).not.toBeNull();
			expect(indicator?.isValid).toBe(false);
		});
	});
});
