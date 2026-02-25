/**
 * File tree types and manipulation utilities.
 * Provides the FileTreeNode type and functions for traversing, querying, and modifying file trees.
 */

/**
 * Represents a node in the file tree (file or folder).
 *
 * Each node has a stable `id` that persists through renames and moves.
 * - For nodes loaded from GitHub: id = SHA hash
 * - For newly created nodes: id = generated UUID
 */
export interface FileTreeNode {
	/** Stable identifier that persists through renames/moves */
	id: string;
	name: string;
	path: string;
	/** Original path in GitHub repo (unchanged by moves/renames until save) */
	originalPath?: string;
	type: "file" | "folder";
	size?: number;
	children?: Array<FileTreeNode>;
	expanded?: boolean;
	/** Pending file content for batch save (only set when user edits a file) */
	pendingContent?: string;
	/** Whether this file has syntax errors that should block saving */
	hasSyntaxErrors?: boolean;
}

// ========== Tree Traversal & Query Functions ==========

/**
 * Collect paths of all expanded folders in the tree.
 * Used to preserve expanded state during tree refresh.
 */
export function collectExpandedPaths(tree: Array<FileTreeNode>): Set<string> {
	const expandedPaths = new Set<string>();
	function traverse(nodes: Array<FileTreeNode>) {
		for (const node of nodes) {
			if (node.type === "folder" && node.expanded) {
				expandedPaths.add(node.path);
			}
			if (node.children) {
				traverse(node.children);
			}
		}
	}
	traverse(tree);
	return expandedPaths;
}

/**
 * Apply expanded state to folders that were previously expanded.
 * Used to restore expanded state after tree refresh.
 */
export function applyExpandedPaths(tree: Array<FileTreeNode>, expandedPaths: Set<string>): Array<FileTreeNode> {
	return tree.map(node => {
		if (node.type === "folder") {
			const shouldExpand = expandedPaths.has(node.path) || node.expanded === true;
			const updatedNode: FileTreeNode = { ...node, expanded: shouldExpand };
			if (node.children) {
				updatedNode.children = applyExpandedPaths(node.children, expandedPaths);
			}
			return updatedNode;
		}
		return node;
	});
}

/**
 * Get the parent path from a full path.
 * e.g., "content/guides/article.mdx" -> "content/guides"
 *       "content/article.mdx" -> "content"
 *       "content" -> ""
 */
export function getParentPath(path: string): string {
	const lastSlashIndex = path.lastIndexOf("/");
	return lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : "";
}

/**
 * Find any node (file or folder) in the file tree by path.
 * Returns a deep clone of the node to avoid mutation issues.
 */
export function findNodeInTree(nodes: Array<FileTreeNode>, path: string): FileTreeNode | undefined {
	for (const node of nodes) {
		if (node.path === path) {
			// Return a deep clone to avoid mutation issues
			return JSON.parse(JSON.stringify(node)) as FileTreeNode;
		}
		if (node.children) {
			const found = findNodeInTree(node.children, path);
			if (found) {
				return found;
			}
		}
	}
	return;
}

/**
 * Find a node's pendingContent by path.
 */
export function findNodePendingContent(tree: Array<FileTreeNode>, filePath: string): string | undefined {
	for (const node of tree) {
		if (node.path === filePath && node.type === "file") {
			return node.pendingContent;
		}
		if (node.children) {
			const found = findNodePendingContent(node.children, filePath);
			if (found !== undefined) {
				return found;
			}
		}
	}
	return;
}

/**
 * Check if any node in the tree has syntax errors.
 */
export function treeHasSyntaxErrors(tree: Array<FileTreeNode>): boolean {
	for (const node of tree) {
		if (node.hasSyntaxErrors) {
			return true;
		}
		if (node.children && treeHasSyntaxErrors(node.children)) {
			return true;
		}
	}
	return false;
}

/**
 * Collect paths of all files with syntax errors.
 */
export function collectFilesWithErrors(tree: Array<FileTreeNode>): Array<string> {
	const result: Array<string> = [];
	for (const node of tree) {
		if (node.hasSyntaxErrors && node.type === "file") {
			result.push(node.path);
		}
		if (node.children) {
			result.push(...collectFilesWithErrors(node.children));
		}
	}
	return result;
}

// ========== Tree Modification Functions ==========

/**
 * Insert a node into the tree under a parent path.
 * If parentPath is empty, inserts at root level.
 * Returns a new tree with the node inserted, sorted alphabetically.
 */
export function insertNodeOptimistically(
	tree: Array<FileTreeNode>,
	parentPath: string,
	newNode: FileTreeNode,
): Array<FileTreeNode> {
	// Insert at root level
	if (!parentPath) {
		const newTree = [...tree, newNode];
		return newTree.sort((a, b) => {
			// Folders before files, then alphabetical
			if (a.type !== b.type) {
				return a.type === "folder" ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});
	}

	// Insert into a nested folder
	return tree.map(node => {
		if (node.path === parentPath && node.type === "folder") {
			const updatedChildren = [...(node.children || []), newNode].sort((a, b) => {
				if (a.type !== b.type) {
					return a.type === "folder" ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});
			return { ...node, children: updatedChildren, expanded: true };
		}
		if (node.children) {
			return { ...node, children: insertNodeOptimistically(node.children, parentPath, newNode) };
		}
		return node;
	});
}

/**
 * Remove a node from the tree by path.
 * Returns a new tree with the node removed.
 */
export function removeNodeOptimistically(tree: Array<FileTreeNode>, path: string): Array<FileTreeNode> {
	return tree
		.filter(node => node.path !== path)
		.map(node => {
			if (node.children) {
				return { ...node, children: removeNodeOptimistically(node.children, path) };
			}
			return node;
		});
}

/**
 * Rename a node in the tree.
 * Updates the node's name, path, and all descendant paths.
 * Returns a new tree with the node renamed.
 */
export function renameNodeOptimistically(
	tree: Array<FileTreeNode>,
	oldPath: string,
	newName: string,
): Array<FileTreeNode> {
	const parentPath = getParentPath(oldPath);
	const newPath = parentPath ? `${parentPath}/${newName}` : newName;

	return tree
		.map(node => {
			if (node.path === oldPath) {
				// Update this node and all its descendants
				const updateDescendantPaths = (n: FileTreeNode, oldBase: string, newBase: string): FileTreeNode => {
					const updatedPath = n.path.replace(oldBase, newBase);
					const updatedNode: FileTreeNode = {
						...n,
						path: updatedPath,
						name: n.path === oldBase ? newName : n.name,
					};
					if (n.children) {
						updatedNode.children = n.children.map(child => updateDescendantPaths(child, oldBase, newBase));
					}
					return updatedNode;
				};
				return updateDescendantPaths(node, oldPath, newPath);
			}
			if (node.children) {
				return { ...node, children: renameNodeOptimistically(node.children, oldPath, newName) };
			}
			return node;
		})
		.sort((a, b) => {
			if (a.type !== b.type) {
				return a.type === "folder" ? -1 : 1;
			}
			return a.name.localeCompare(b.name);
		});
}

/**
 * Move a node from one location to another in the tree.
 * Returns a new tree with the node moved.
 */
export function moveNodeOptimistically(
	tree: Array<FileTreeNode>,
	sourcePath: string,
	destFolder: string,
): Array<FileTreeNode> {
	// Find the node to move (get a copy)
	const nodeToMove = findNodeInTree(tree, sourcePath);
	if (!nodeToMove) {
		return tree;
	}

	// Update the node's path to the new location
	const fileName = nodeToMove.name;
	const newPath = destFolder ? `${destFolder}/${fileName}` : fileName;
	const movedNode: FileTreeNode = { ...nodeToMove, path: newPath };

	// Remove from old location, then insert at new location
	const treeWithoutNode = removeNodeOptimistically(tree, sourcePath);
	return insertNodeOptimistically(treeWithoutNode, destFolder, movedNode);
}

/**
 * Update a file node's pendingContent in the tree.
 * Used to stage file content changes for batch save.
 */
export function updateNodePendingContent(
	tree: Array<FileTreeNode>,
	filePath: string,
	content: string,
): Array<FileTreeNode> {
	return tree.map(node => {
		if (node.path === filePath && node.type === "file") {
			return { ...node, pendingContent: content };
		}
		if (node.children) {
			return { ...node, children: updateNodePendingContent(node.children, filePath, content) };
		}
		return node;
	});
}

/**
 * Clear a file node's pendingContent and hasSyntaxErrors in the tree (discard staged changes).
 */
export function clearNodePendingContent(tree: Array<FileTreeNode>, filePath: string): Array<FileTreeNode> {
	return tree.map(node => {
		if (node.path === filePath && node.type === "file") {
			const { pendingContent: _p, hasSyntaxErrors: _h, ...rest } = node;
			return rest;
		}
		if (node.children) {
			return { ...node, children: clearNodePendingContent(node.children, filePath) };
		}
		return node;
	});
}

/**
 * Clear pendingContent and hasSyntaxErrors from all nodes in the tree (after successful save).
 * Also syncs originalPath = path since the tree now matches GitHub.
 */
export function clearAllPendingContent(tree: Array<FileTreeNode>): Array<FileTreeNode> {
	return tree.map(node => {
		const { pendingContent: _p, hasSyntaxErrors: _h, ...rest } = node;
		// Sync originalPath to current path since we just saved to GitHub
		const updatedNode = { ...rest, originalPath: node.path };
		if (node.children) {
			return { ...updatedNode, children: clearAllPendingContent(node.children) };
		}
		return updatedNode;
	});
}

/**
 * Update a file node's hasSyntaxErrors flag in the tree.
 */
export function updateNodeSyntaxErrors(
	tree: Array<FileTreeNode>,
	filePath: string,
	hasErrors: boolean,
): Array<FileTreeNode> {
	return tree.map(node => {
		if (node.path === filePath && node.type === "file") {
			if (hasErrors) {
				return { ...node, hasSyntaxErrors: true };
			}
			// Clear the flag if no errors
			const { hasSyntaxErrors: _, ...rest } = node;
			return rest;
		}
		if (node.children) {
			return { ...node, children: updateNodeSyntaxErrors(node.children, filePath, hasErrors) };
		}
		return node;
	});
}
