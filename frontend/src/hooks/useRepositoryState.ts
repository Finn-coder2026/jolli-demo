import type { FileTreeNode } from "../types/FileTree";
import { useCallback, useMemo, useState } from "react";

/**
 * Deep equality check for file trees.
 * Compares structure and properties, ignoring 'expanded' state.
 */
function treesEqual(a: Array<FileTreeNode>, b: Array<FileTreeNode>): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		const nodeA = a[i];
		const nodeB = b[i];
		if (nodeA.name !== nodeB.name || nodeA.path !== nodeB.path || nodeA.type !== nodeB.type) {
			return false;
		}
		// Check for pending content changes (file edits)
		if (nodeA.pendingContent !== nodeB.pendingContent) {
			return false;
		}
		// Recursively compare children if both have them
		const childrenA = nodeA.children ?? [];
		const childrenB = nodeB.children ?? [];
		if (!treesEqual(childrenA, childrenB)) {
			return false;
		}
	}
	return true;
}

/**
 * Custom hook for managing repository file tree state.
 * Provides original (server) and working (edited) tree state with operations.
 *
 * Replaces RepositoryContext for local component state management.
 */
export function useRepositoryState() {
	/** The tree as last saved to/loaded from the server */
	const [originalTree, setOriginalTree] = useState<Array<FileTreeNode>>([]);
	/** The current working tree with user edits */
	const [workingTree, setWorkingTree] = useState<Array<FileTreeNode>>([]);

	/**
	 * Initialize both original and working trees (used when loading from server).
	 */
	const initializeTree = useCallback((tree: Array<FileTreeNode>) => {
		setOriginalTree(tree);
		setWorkingTree(tree);
	}, []);

	/**
	 * Update the working tree using an updater function (for user edits).
	 */
	const updateWorkingTree = useCallback((updater: (tree: Array<FileTreeNode>) => Array<FileTreeNode>) => {
		setWorkingTree(updater);
	}, []);

	/**
	 * Update the original tree directly (for syncing after immediate saves of new files).
	 */
	const updateOriginalTree = useCallback((updater: (tree: Array<FileTreeNode>) => Array<FileTreeNode>) => {
		setOriginalTree(updater);
	}, []);

	/**
	 * Check if the working tree differs from the original tree.
	 */
	const isDirty = useMemo(() => !treesEqual(originalTree, workingTree), [originalTree, workingTree]);

	/**
	 * Discard changes by resetting working tree to original.
	 */
	const discardChanges = useCallback(() => {
		setWorkingTree(originalTree);
	}, [originalTree]);

	/**
	 * Mark the current working tree as saved (sets original = working).
	 */
	const markSaved = useCallback(() => {
		setOriginalTree(workingTree);
	}, [workingTree]);

	/**
	 * Clear both trees (used when unmounting or switching docsites).
	 */
	const clearTrees = useCallback(() => {
		setOriginalTree([]);
		setWorkingTree([]);
	}, []);

	return {
		originalTree,
		workingTree,
		initializeTree,
		updateWorkingTree,
		updateOriginalTree,
		isDirty,
		discardChanges,
		markSaved,
		clearTrees,
	};
}
