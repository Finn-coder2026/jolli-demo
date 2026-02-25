import type { TreeNode } from "../hooks/useSpaceTree";
import type { Doc, DocContentMetadata } from "jolli-common";

// ============================================================================
// Snapshot utilities for optimistic updates
// ============================================================================

/**
 * Deep clone TreeNode array for snapshot/rollback.
 * Creates independent copies of all nodes and their nested structures.
 *
 * @param nodes - The tree nodes array to clone
 * @returns A deep clone of the tree
 */
export function cloneTreeData(nodes: Array<TreeNode>): Array<TreeNode> {
	return nodes.map(function cloneNode(node): TreeNode {
		return {
			doc: {
				...node.doc,
				contentMetadata: { ...(node.doc.contentMetadata as DocContentMetadata) },
			},
			children: cloneTreeData(node.children),
			expanded: node.expanded,
		};
	});
}

// ============================================================================
// Tree traversal utilities
// ============================================================================

/**
 * Find a node by document ID in the tree.
 *
 * @param nodes - The tree nodes array to search
 * @param docId - The document ID to find
 * @returns The found TreeNode or undefined
 */
export function findNodeById(nodes: Array<TreeNode>, docId: number): TreeNode | undefined {
	for (const node of nodes) {
		if (node.doc.id === docId) {
			return node;
		}
		const found = findNodeById(node.children, docId);
		if (found) {
			return found;
		}
	}
	return;
}

/**
 * Get the siblings array and index for a document ID.
 * Returns the array containing the node and its index within that array.
 *
 * @param nodes - The tree nodes array to search
 * @param docId - The document ID to find
 * @returns Tuple of [siblings array, index] or undefined if not found
 */
export function getSiblingsAndIndex(nodes: Array<TreeNode>, docId: number): [Array<TreeNode>, number] | undefined {
	// Check root level
	const rootIndex = nodes.findIndex(n => n.doc.id === docId);
	if (rootIndex !== -1) {
		return [nodes, rootIndex];
	}

	// Check children recursively
	for (const node of nodes) {
		const childIndex = node.children.findIndex(n => n.doc.id === docId);
		if (childIndex !== -1) {
			return [node.children, childIndex];
		}
		const found = getSiblingsAndIndex(node.children, docId);
		/* c8 ignore next 3 -- Recursive return, covered by nested test cases */
		if (found) {
			return found;
		}
	}
	return;
}

// ============================================================================
// Tree modification utilities
// ============================================================================

/**
 * Remove a node from the tree and return it.
 * Modifies the tree in place.
 *
 * @param nodes - The tree nodes array to modify
 * @param docId - The document ID to remove
 * @returns The removed TreeNode or undefined if not found
 */
export function removeNodeFromTree(nodes: Array<TreeNode>, docId: number): TreeNode | undefined {
	const idx = nodes.findIndex(n => n.doc.id === docId);
	if (idx !== -1) {
		return nodes.splice(idx, 1)[0];
	}

	for (const node of nodes) {
		const removed = removeNodeFromTree(node.children, docId);
		if (removed) {
			return removed;
		}
	}
	return;
}

/**
 * Insert a node at a specific position in the tree.
 * Modifies the tree in place.
 *
 * @param nodes - The tree nodes array to modify
 * @param parentId - Target parent ID (undefined for root level)
 * @param nodeToInsert - The node to insert
 * @param referenceDocId - Reference doc ID for positioning (null/undefined = append)
 * @param position - "before" or "after" the reference (default: "after")
 * @returns true if insertion succeeded, false otherwise
 */
export function insertNodeAtPosition(
	nodes: Array<TreeNode>,
	parentId: number | undefined,
	nodeToInsert: TreeNode,
	referenceDocId: number | null | undefined,
	position: "before" | "after" | undefined,
): boolean {
	// Helper to insert into an array
	function insertIntoArray(arr: Array<TreeNode>): boolean {
		if (referenceDocId == null) {
			// No reference - append to end
			arr.push(nodeToInsert);
			return true;
		}
		const refIdx = arr.findIndex(n => n.doc.id === referenceDocId);
		if (refIdx === -1) {
			// Reference not found in this array - append to end
			arr.push(nodeToInsert);
			return true;
		}
		const insertIdx = position === "before" ? refIdx : refIdx + 1;
		arr.splice(insertIdx, 0, nodeToInsert);
		return true;
	}

	// Target is root level
	if (parentId === undefined) {
		return insertIntoArray(nodes);
	}

	// Find target parent recursively
	for (const node of nodes) {
		if (node.doc.id === parentId) {
			return insertIntoArray(node.children);
		}
		/* c8 ignore next 3 -- Recursive return, covered by nested test cases */
		if (insertNodeAtPosition(node.children, parentId, nodeToInsert, referenceDocId, position)) {
			return true;
		}
	}
	return false;
}

/**
 * Update the title of a document in the tree.
 * Modifies the tree in place.
 *
 * @param nodes - The tree nodes array to modify
 * @param docId - The document ID to update
 * @param newTitle - The new title
 * @returns true if update succeeded, false otherwise
 */
export function updateDocTitle(nodes: Array<TreeNode>, docId: number, newTitle: string): boolean {
	for (const node of nodes) {
		if (node.doc.id === docId) {
			node.doc = {
				...node.doc,
				contentMetadata: {
					...(node.doc.contentMetadata as DocContentMetadata),
					title: newTitle,
				},
			};
			return true;
		}
		if (updateDocTitle(node.children, docId, newTitle)) {
			return true;
		}
	}
	return false;
}

// ============================================================================
// Original tree update utilities (minimal object recreation)
// ============================================================================

/**
 * Update single node's expanded state without rebuilding entire tree.
 * Returns new tree with minimal object recreation (only affected path).
 *
 * Only the target node and its ancestor path get new references:
 * - Target node: new reference (expanded state changed)
 * - Ancestors: new references (because their children array changed)
 * - Siblings and other branches: same references (unchanged)
 *
 * Example: updating node 3's expanded state in this tree:
 * ```
 *       1              1'  ← new reference (child changed)
 *      / \            / \
 *     2   3    →     2   3' ← new reference (expanded changed)
 *         |              |
 *         4              4  ← same reference (unchanged)
 * ```
 *
 * @param nodes - The tree nodes array
 * @param docId - The document ID to update
 * @param expanded - The new expanded state
 * @returns New tree array with updated node (same references for unchanged nodes)
 */
export function updateNodeExpanded(nodes: Array<TreeNode>, docId: number, expanded: boolean): Array<TreeNode> {
	let hasChanges = false;

	const result = nodes.map(node => {
		if (node.doc.id === docId) {
			// Found target node - create new object with updated expanded
			hasChanges = true;
			return { ...node, expanded };
		}
		if (node.children.length > 0) {
			// Check if target is in children
			const updatedChildren = updateNodeExpanded(node.children, docId, expanded);
			// Only create new parent if children actually changed
			if (updatedChildren !== node.children) {
				hasChanges = true;
				return { ...node, children: updatedChildren };
			}
		}
		// No change - return same reference
		return node;
	});

	// Return same array reference if no changes were made
	return hasChanges ? result : nodes;
}

/**
 * Insert a node into a sorted array at the correct position.
 * Used internally by addNodeToTree.
 *
 * @param nodes - The array of nodes to insert into
 * @param newNode - The new node to insert
 * @param sortComparator - Function to compare two docs for sorting
 * @returns New array with the node inserted at the correct position
 */
function insertSorted(
	nodes: Array<TreeNode>,
	newNode: TreeNode,
	sortComparator: (a: Doc, b: Doc) => number,
): Array<TreeNode> {
	const result = [...nodes];
	const insertIndex = result.findIndex(node => sortComparator(newNode.doc, node.doc) < 0);
	if (insertIndex === -1) {
		result.push(newNode);
	} else {
		result.splice(insertIndex, 0, newNode);
	}
	return result;
}

/**
 * Insert a new node into the tree at the correct sorted position.
 * Returns new tree with minimal object recreation (only affected path).
 *
 * Only the parent node (if any) and its ancestors get new references:
 * - Parent node: new reference (children array changed)
 * - Ancestors: new references (because their children array changed)
 * - Siblings and other branches: same references (unchanged)
 *
 * Example: inserting node 5 as child of node 1 in this tree:
 * ```
 *       1              1'  ← new reference (children changed)
 *      / \            /|\
 *     2   3    →     2 3 5  ← new node
 *         |            |
 *         4            4  ← same reference (unchanged)
 * ```
 *
 * @param nodes - The tree nodes array
 * @param newDoc - The new document to insert
 * @param parentId - The parent folder ID (undefined for root level)
 * @param sortComparator - Function to compare two docs for sorting
 * @param expandedIds - Set of expanded folder IDs (to set initial expanded state)
 * @returns New tree array with the new node inserted
 */
export function addNodeToTree(
	nodes: Array<TreeNode>,
	newDoc: Doc,
	parentId: number | undefined,
	sortComparator: (a: Doc, b: Doc) => number,
	expandedIds: Set<number>,
): Array<TreeNode> {
	const newNode: TreeNode = {
		doc: newDoc,
		children: [],
		expanded: expandedIds.has(newDoc.id),
	};

	if (parentId === undefined) {
		// Insert at root level with correct sort position
		return insertSorted(nodes, newNode, sortComparator);
	}

	// Find parent and insert child
	let hasChanges = false;
	const result = nodes.map(node => {
		if (node.doc.id === parentId) {
			hasChanges = true;
			return {
				...node,
				children: insertSorted(node.children, newNode, sortComparator),
			};
		}
		if (node.children.length > 0) {
			const updatedChildren = addNodeToTree(node.children, newDoc, parentId, sortComparator, expandedIds);
			if (updatedChildren !== node.children) {
				hasChanges = true;
				return { ...node, children: updatedChildren };
			}
		}
		return node;
	});

	return hasChanges ? result : nodes;
}
