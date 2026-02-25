import type { TreeNode } from "../hooks/useSpaceTree";
import {
	addNodeToTree,
	cloneTreeData,
	findNodeById,
	getSiblingsAndIndex,
	insertNodeAtPosition,
	removeNodeFromTree,
	updateDocTitle,
	updateNodeExpanded,
} from "./TreeUtils";
import type { Doc } from "jolli-common";
import { describe, expect, it } from "vitest";

describe("TreeUtils", () => {
	describe("updateNodeExpanded", () => {
		// Create mock tree data at describe level for reference stability
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder" } as TreeNode["doc"],
					children: [
						{
							doc: { id: 2, docType: "folder" } as TreeNode["doc"],
							children: [],
							expanded: false,
						},
						{
							doc: { id: 4, docType: "document" } as TreeNode["doc"],
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 3, docType: "document" } as TreeNode["doc"],
					children: [],
					expanded: false,
				},
			];
		}

		it("should update expanded state of target node", () => {
			const tree = createMockTree();
			const result = updateNodeExpanded(tree, 1, false);

			expect(result[0].expanded).toBe(false);
			expect(result[0].doc.id).toBe(1);
		});

		it("should update nested node expanded state", () => {
			const tree = createMockTree();
			const result = updateNodeExpanded(tree, 2, true);

			expect(result[0].children[0].expanded).toBe(true);
		});

		it("should preserve reference for unchanged nodes", () => {
			const tree = createMockTree();
			const result = updateNodeExpanded(tree, 1, false);

			// Node 3 should be same reference (unchanged)
			expect(result[1]).toBe(tree[1]);
		});

		it("should create new reference for changed path only", () => {
			const tree = createMockTree();
			const result = updateNodeExpanded(tree, 2, true);

			// Root array is new
			expect(result).not.toBe(tree);
			// Node 1 is new (has changed child)
			expect(result[0]).not.toBe(tree[0]);
			// Node 2 is new (expanded changed)
			expect(result[0].children[0]).not.toBe(tree[0].children[0]);
			// Node 4 is same (sibling unchanged)
			expect(result[0].children[1]).toBe(tree[0].children[1]);
			// Node 3 is same (unchanged)
			expect(result[1]).toBe(tree[1]);
		});

		it("should return same tree reference if node not found", () => {
			const tree = createMockTree();
			const result = updateNodeExpanded(tree, 999, true);

			// Should return same reference when no changes
			expect(result).toBe(tree);
			// All nodes should be same reference
			expect(result[0]).toBe(tree[0]);
			expect(result[1]).toBe(tree[1]);
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const result = updateNodeExpanded(tree, 1, true);

			expect(result).toBe(tree);
			expect(result.length).toBe(0);
		});

		it("should handle deeply nested nodes", () => {
			const deepTree: Array<TreeNode> = [
				{
					doc: { id: 1, docType: "folder" } as TreeNode["doc"],
					children: [
						{
							doc: { id: 2, docType: "folder" } as TreeNode["doc"],
							children: [
								{
									doc: { id: 3, docType: "folder" } as TreeNode["doc"],
									children: [
										{
											doc: { id: 4, docType: "document" } as TreeNode["doc"],
											children: [],
											expanded: false,
										},
									],
									expanded: false,
								},
							],
							expanded: false,
						},
					],
					expanded: false,
				},
			];

			const result = updateNodeExpanded(deepTree, 3, true);

			// Target node should be updated
			expect(result[0].children[0].children[0].expanded).toBe(true);
			// All ancestors should be new references
			expect(result[0]).not.toBe(deepTree[0]);
			expect(result[0].children[0]).not.toBe(deepTree[0].children[0]);
			expect(result[0].children[0].children[0]).not.toBe(deepTree[0].children[0].children[0]);
			// Leaf node should be same reference
			expect(result[0].children[0].children[0].children[0]).toBe(deepTree[0].children[0].children[0].children[0]);
		});

		it("should not change expanded state if already matching", () => {
			const tree = createMockTree();
			// Node 1 is already expanded: true
			const result = updateNodeExpanded(tree, 1, true);

			// Since expanded state is same, still creates new object (by design)
			// This is acceptable - the function doesn't check if value is same
			expect(result[0].expanded).toBe(true);
		});
	});

	describe("addNodeToTree", () => {
		// Sort comparator for testing: sort by sortOrder (default mode)
		const sortBySortOrder = (a: Doc, b: Doc) => a.sortOrder - b.sortOrder;

		// Sort comparator for alphabetical sorting
		const sortAlphabetically = (a: Doc, b: Doc) => {
			const titleA = (a.contentMetadata as { title?: string })?.title ?? "";
			const titleB = (b.contentMetadata as { title?: string })?.title ?? "";
			return titleA.localeCompare(titleB);
		};

		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder", sortOrder: 1, contentMetadata: { title: "Folder A" } } as Doc,
					children: [
						{
							doc: {
								id: 2,
								docType: "document",
								sortOrder: 1,
								contentMetadata: { title: "Doc B" },
							} as Doc,
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 3, docType: "document", sortOrder: 2, contentMetadata: { title: "Doc C" } } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		it("should insert node at root level", () => {
			const tree = createMockTree();
			const newDoc = { id: 5, docType: "document", sortOrder: 3, contentMetadata: { title: "Doc D" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, undefined, sortBySortOrder, expandedIds);

			// Should have 3 root nodes now
			expect(result.length).toBe(3);
			// New node should be at the end (sortOrder: 3 > 2)
			expect(result[2].doc.id).toBe(5);
			expect(result[2].expanded).toBe(false);
		});

		it("should insert node at root level in correct sorted position", () => {
			const tree = createMockTree();
			// New doc with sortOrder 0 should go first
			const newDoc = { id: 5, docType: "document", sortOrder: 0, contentMetadata: { title: "Doc First" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, undefined, sortBySortOrder, expandedIds);

			// New node should be first
			expect(result[0].doc.id).toBe(5);
			// Original first node should now be second
			expect(result[1].doc.id).toBe(1);
		});

		it("should insert node as child of specified parent", () => {
			const tree = createMockTree();
			const newDoc = { id: 5, docType: "document", sortOrder: 2, contentMetadata: { title: "Doc E" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, 1, sortBySortOrder, expandedIds);

			// Root level should still have 2 nodes
			expect(result.length).toBe(2);
			// Parent folder should now have 2 children
			expect(result[0].children.length).toBe(2);
			// New node should be second child (sortOrder: 2 > 1)
			expect(result[0].children[1].doc.id).toBe(5);
		});

		it("should preserve reference for unchanged nodes", () => {
			const tree = createMockTree();
			const newDoc = { id: 5, docType: "document", sortOrder: 2, contentMetadata: { title: "Doc E" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, 1, sortBySortOrder, expandedIds);

			// Node 3 should be same reference (unchanged)
			expect(result[1]).toBe(tree[1]);
			// Node 2 (sibling of new node) should be same reference
			expect(result[0].children[0]).toBe(tree[0].children[0]);
		});

		it("should create new reference for parent path only", () => {
			const tree = createMockTree();
			const newDoc = { id: 5, docType: "document", sortOrder: 2, contentMetadata: { title: "Doc E" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, 1, sortBySortOrder, expandedIds);

			// Root array is new
			expect(result).not.toBe(tree);
			// Parent node is new (children changed)
			expect(result[0]).not.toBe(tree[0]);
			// Sibling root node is same
			expect(result[1]).toBe(tree[1]);
		});

		it("should set expanded state based on expandedIds", () => {
			const tree = createMockTree();
			const newDoc = { id: 5, docType: "folder", sortOrder: 3, contentMetadata: { title: "Folder New" } } as Doc;
			const expandedIds = new Set<number>([5]); // New folder is expanded

			const result = addNodeToTree(tree, newDoc, undefined, sortBySortOrder, expandedIds);

			expect(result[2].expanded).toBe(true);
		});

		it("should insert at correct position with alphabetical sorting", () => {
			const tree = createMockTree();
			// "Doc AA" should come before "Doc B" alphabetically
			const newDoc = { id: 5, docType: "document", sortOrder: 10, contentMetadata: { title: "Doc AA" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, 1, sortAlphabetically, expandedIds);

			// New node should be first child (alphabetically before "Doc B")
			expect(result[0].children[0].doc.id).toBe(5);
			expect(result[0].children[1].doc.id).toBe(2);
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const newDoc = { id: 1, docType: "document", sortOrder: 1, contentMetadata: { title: "Doc" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, undefined, sortBySortOrder, expandedIds);

			expect(result.length).toBe(1);
			expect(result[0].doc.id).toBe(1);
		});

		it("should return same tree reference if parent not found", () => {
			const tree = createMockTree();
			const newDoc = { id: 5, docType: "document", sortOrder: 1, contentMetadata: { title: "Doc" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(tree, newDoc, 999, sortBySortOrder, expandedIds);

			// Should return same reference when parent not found
			expect(result).toBe(tree);
		});

		it("should insert node into deeply nested parent", () => {
			const deepTree: Array<TreeNode> = [
				{
					doc: { id: 1, docType: "folder", sortOrder: 1 } as Doc,
					children: [
						{
							doc: { id: 2, docType: "folder", sortOrder: 1 } as Doc,
							children: [
								{
									doc: { id: 3, docType: "folder", sortOrder: 1 } as Doc,
									children: [],
									expanded: false,
								},
							],
							expanded: false,
						},
					],
					expanded: false,
				},
			];

			const newDoc = { id: 5, docType: "document", sortOrder: 1, contentMetadata: { title: "Deep Doc" } } as Doc;
			const expandedIds = new Set<number>();

			const result = addNodeToTree(deepTree, newDoc, 3, sortBySortOrder, expandedIds);

			// New node should be child of node 3
			expect(result[0].children[0].children[0].children.length).toBe(1);
			expect(result[0].children[0].children[0].children[0].doc.id).toBe(5);
			// All ancestors should be new references
			expect(result[0]).not.toBe(deepTree[0]);
			expect(result[0].children[0]).not.toBe(deepTree[0].children[0]);
			expect(result[0].children[0].children[0]).not.toBe(deepTree[0].children[0].children[0]);
		});
	});

	describe("cloneTreeData", () => {
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder", contentMetadata: { title: "Folder A" } } as Doc,
					children: [
						{
							doc: { id: 2, docType: "document", contentMetadata: { title: "Doc B" } } as Doc,
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 3, docType: "document", contentMetadata: { title: "Doc C" } } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		it("should create a deep clone of the tree", () => {
			const tree = createMockTree();
			const clone = cloneTreeData(tree);

			// Should be equal in value
			expect(clone).toEqual(tree);
			// But not the same reference
			expect(clone).not.toBe(tree);
		});

		it("should not share any references with original", () => {
			const tree = createMockTree();
			const clone = cloneTreeData(tree);

			// Root nodes should be different references
			expect(clone[0]).not.toBe(tree[0]);
			expect(clone[1]).not.toBe(tree[1]);
			// Nested children should be different references
			expect(clone[0].children).not.toBe(tree[0].children);
			expect(clone[0].children[0]).not.toBe(tree[0].children[0]);
			// Doc objects should be different references
			expect(clone[0].doc).not.toBe(tree[0].doc);
			// ContentMetadata should be different references
			expect(clone[0].doc.contentMetadata).not.toBe(tree[0].doc.contentMetadata);
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const clone = cloneTreeData(tree);

			expect(clone).toEqual([]);
			expect(clone).not.toBe(tree);
		});

		it("should allow modifying clone without affecting original", () => {
			const tree = createMockTree();
			const clone = cloneTreeData(tree);

			// Modify clone
			clone[0].expanded = false;
			(clone[0].doc.contentMetadata as { title: string }).title = "Modified";

			// Original should be unchanged
			expect(tree[0].expanded).toBe(true);
			expect((tree[0].doc.contentMetadata as { title: string }).title).toBe("Folder A");
		});
	});

	describe("findNodeById", () => {
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder" } as Doc,
					children: [
						{
							doc: { id: 2, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
						{
							doc: { id: 3, docType: "folder" } as Doc,
							children: [
								{
									doc: { id: 4, docType: "document" } as Doc,
									children: [],
									expanded: false,
								},
							],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 5, docType: "document" } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		it("should find root level node", () => {
			const tree = createMockTree();
			const result = findNodeById(tree, 1);

			expect(result).toBeDefined();
			expect(result?.doc.id).toBe(1);
		});

		it("should find nested node", () => {
			const tree = createMockTree();
			const result = findNodeById(tree, 2);

			expect(result).toBeDefined();
			expect(result?.doc.id).toBe(2);
		});

		it("should find deeply nested node", () => {
			const tree = createMockTree();
			const result = findNodeById(tree, 4);

			expect(result).toBeDefined();
			expect(result?.doc.id).toBe(4);
		});

		it("should return undefined if not found", () => {
			const tree = createMockTree();
			const result = findNodeById(tree, 999);

			expect(result).toBeUndefined();
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const result = findNodeById(tree, 1);

			expect(result).toBeUndefined();
		});
	});

	describe("getSiblingsAndIndex", () => {
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder" } as Doc,
					children: [
						{
							doc: { id: 2, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
						{
							doc: { id: 3, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 4, docType: "document" } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		it("should find root level siblings and index", () => {
			const tree = createMockTree();
			const result = getSiblingsAndIndex(tree, 1);

			expect(result).toBeDefined();
			if (!result) {
				throw new Error("Result should be defined");
			}
			const [siblings, index] = result;
			expect(siblings).toBe(tree);
			expect(index).toBe(0);
		});

		it("should find second root level node", () => {
			const tree = createMockTree();
			const result = getSiblingsAndIndex(tree, 4);

			expect(result).toBeDefined();
			if (!result) {
				throw new Error("Result should be defined");
			}
			const [siblings, index] = result;
			expect(siblings).toBe(tree);
			expect(index).toBe(1);
		});

		it("should find nested siblings and index", () => {
			const tree = createMockTree();
			const result = getSiblingsAndIndex(tree, 2);

			expect(result).toBeDefined();
			if (!result) {
				throw new Error("Result should be defined");
			}
			const [siblings, index] = result;
			expect(siblings).toBe(tree[0].children);
			expect(index).toBe(0);
		});

		it("should find second nested sibling", () => {
			const tree = createMockTree();
			const result = getSiblingsAndIndex(tree, 3);

			expect(result).toBeDefined();
			if (!result) {
				throw new Error("Result should be defined");
			}
			const [siblings, index] = result;
			expect(siblings).toBe(tree[0].children);
			expect(index).toBe(1);
		});

		it("should return undefined if not found", () => {
			const tree = createMockTree();
			const result = getSiblingsAndIndex(tree, 999);

			expect(result).toBeUndefined();
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const result = getSiblingsAndIndex(tree, 1);

			expect(result).toBeUndefined();
		});
	});

	describe("removeNodeFromTree", () => {
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder" } as Doc,
					children: [
						{
							doc: { id: 2, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
						{
							doc: { id: 3, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 4, docType: "document" } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		it("should remove root level node", () => {
			const tree = createMockTree();
			const removed = removeNodeFromTree(tree, 4);

			expect(removed).toBeDefined();
			expect(removed?.doc.id).toBe(4);
			expect(tree.length).toBe(1);
		});

		it("should remove nested node", () => {
			const tree = createMockTree();
			const removed = removeNodeFromTree(tree, 2);

			expect(removed).toBeDefined();
			expect(removed?.doc.id).toBe(2);
			expect(tree[0].children.length).toBe(1);
			expect(tree[0].children[0].doc.id).toBe(3);
		});

		it("should return undefined if not found", () => {
			const tree = createMockTree();
			const originalLength = tree.length;
			const removed = removeNodeFromTree(tree, 999);

			expect(removed).toBeUndefined();
			expect(tree.length).toBe(originalLength);
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const removed = removeNodeFromTree(tree, 1);

			expect(removed).toBeUndefined();
		});

		it("should remove node with children", () => {
			const tree = createMockTree();
			const removed = removeNodeFromTree(tree, 1);

			expect(removed).toBeDefined();
			expect(removed?.doc.id).toBe(1);
			expect(removed?.children.length).toBe(2);
			expect(tree.length).toBe(1);
			expect(tree[0].doc.id).toBe(4);
		});
	});

	describe("insertNodeAtPosition", () => {
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder" } as Doc,
					children: [
						{
							doc: { id: 2, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
						{
							doc: { id: 3, docType: "document" } as Doc,
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 4, docType: "document" } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		function createNewNode(): TreeNode {
			return {
				doc: { id: 5, docType: "document" } as Doc,
				children: [],
				expanded: false,
			};
		}

		it("should insert at root level end when no reference", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, undefined, newNode, null, undefined);

			expect(result).toBe(true);
			expect(tree.length).toBe(3);
			expect(tree[2].doc.id).toBe(5);
		});

		it("should insert at root level before reference", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, undefined, newNode, 4, "before");

			expect(result).toBe(true);
			expect(tree.length).toBe(3);
			expect(tree[1].doc.id).toBe(5);
			expect(tree[2].doc.id).toBe(4);
		});

		it("should insert at root level after reference", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, undefined, newNode, 1, "after");

			expect(result).toBe(true);
			expect(tree.length).toBe(3);
			expect(tree[0].doc.id).toBe(1);
			expect(tree[1].doc.id).toBe(5);
			expect(tree[2].doc.id).toBe(4);
		});

		it("should insert as child of parent", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, 1, newNode, null, undefined);

			expect(result).toBe(true);
			expect(tree[0].children.length).toBe(3);
			expect(tree[0].children[2].doc.id).toBe(5);
		});

		it("should insert before reference in parent", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, 1, newNode, 3, "before");

			expect(result).toBe(true);
			expect(tree[0].children.length).toBe(3);
			expect(tree[0].children[1].doc.id).toBe(5);
			expect(tree[0].children[2].doc.id).toBe(3);
		});

		it("should insert after reference in parent", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, 1, newNode, 2, "after");

			expect(result).toBe(true);
			expect(tree[0].children.length).toBe(3);
			expect(tree[0].children[0].doc.id).toBe(2);
			expect(tree[0].children[1].doc.id).toBe(5);
			expect(tree[0].children[2].doc.id).toBe(3);
		});

		it("should return false if parent not found", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, 999, newNode, null, undefined);

			expect(result).toBe(false);
		});

		it("should append to end if reference not found in target", () => {
			const tree = createMockTree();
			const newNode = createNewNode();

			const result = insertNodeAtPosition(tree, 1, newNode, 999, "before");

			expect(result).toBe(true);
			expect(tree[0].children.length).toBe(3);
			expect(tree[0].children[2].doc.id).toBe(5);
		});
	});

	describe("updateDocTitle", () => {
		function createMockTree(): Array<TreeNode> {
			return [
				{
					doc: { id: 1, docType: "folder", contentMetadata: { title: "Folder A" } } as Doc,
					children: [
						{
							doc: { id: 2, docType: "document", contentMetadata: { title: "Doc B" } } as Doc,
							children: [],
							expanded: false,
						},
					],
					expanded: true,
				},
				{
					doc: { id: 3, docType: "document", contentMetadata: { title: "Doc C" } } as Doc,
					children: [],
					expanded: false,
				},
			];
		}

		it("should update root level node title", () => {
			const tree = createMockTree();
			const result = updateDocTitle(tree, 1, "New Title");

			expect(result).toBe(true);
			expect((tree[0].doc.contentMetadata as { title: string }).title).toBe("New Title");
		});

		it("should update nested node title", () => {
			const tree = createMockTree();
			const result = updateDocTitle(tree, 2, "Updated Doc");

			expect(result).toBe(true);
			expect((tree[0].children[0].doc.contentMetadata as { title: string }).title).toBe("Updated Doc");
		});

		it("should return false if node not found", () => {
			const tree = createMockTree();
			const result = updateDocTitle(tree, 999, "New Title");

			expect(result).toBe(false);
		});

		it("should handle empty tree", () => {
			const tree: Array<TreeNode> = [];
			const result = updateDocTitle(tree, 1, "New Title");

			expect(result).toBe(false);
		});

		it("should not modify other nodes", () => {
			const tree = createMockTree();
			updateDocTitle(tree, 1, "New Title");

			// Other nodes should be unchanged
			expect((tree[0].children[0].doc.contentMetadata as { title: string }).title).toBe("Doc B");
			expect((tree[1].doc.contentMetadata as { title: string }).title).toBe("Doc C");
		});
	});
});
