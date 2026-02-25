/**
 * File tree utilities for the frontend.
 *
 * Re-exports pure tree manipulation functions from jolli-common.
 * Provides meta-syncing wrappers that automatically update _meta.ts files
 * when content files are created, deleted, or moved.
 */

import { addMetaEntry, getEntryValue, removeMetaEntry } from "./MetaSyncUtils";
import {
	type FileTreeNode,
	findNodeInTree,
	insertNodeOptimistically,
	moveNodeOptimistically,
	removeNodeOptimistically,
	updateNodePendingContent,
} from "jolli-common";

// Re-export all pure tree functions for convenience
export {
	applyExpandedPaths,
	clearAllPendingContent,
	clearNodePendingContent,
	collectExpandedPaths,
	collectFilesWithErrors,
	type FileTreeNode,
	findNodeInTree,
	findNodePendingContent,
	getParentPath,
	insertNodeOptimistically,
	moveNodeOptimistically,
	removeNodeOptimistically,
	renameNodeOptimistically,
	treeHasSyntaxErrors,
	updateNodePendingContent,
	updateNodeSyntaxErrors,
} from "jolli-common";

// ========== Meta File Helpers ==========

/**
 * Recursively finds all _meta.* file paths in the tree.
 * Returns array of full paths to meta files.
 */
export function findAllMetaFiles(tree: Array<FileTreeNode>): Array<string> {
	const metaPaths: Array<string> = [];

	function walk(nodes: Array<FileTreeNode>) {
		for (const node of nodes) {
			if (node.type === "file" && /^_meta\.(ts|tsx|js|jsx)$/.test(node.name)) {
				metaPaths.push(node.path);
			}
			if (node.children) {
				walk(node.children);
			}
		}
	}

	walk(tree);
	return metaPaths;
}

/**
 * Determines if a file should trigger meta syncing.
 * Only .md/.mdx files in content/ folder should sync (excluding _meta.* files).
 */
export function shouldSyncMeta(filePath: string): boolean {
	// Must be in content folder
	if (!filePath.startsWith("content/")) {
		return false;
	}

	const fileName = filePath.split("/").pop() || "";

	// Must be .md or .mdx file
	if (!/\.(md|mdx)$/.test(fileName)) {
		return false;
	}

	// Must NOT be a _meta file
	if (fileName.startsWith("_meta.")) {
		return false;
	}

	return true;
}

/**
 * Extracts slug from filename (removes extension).
 * Returns null for non-markdown files.
 */
export function getFileSlug(fileName: string): string | null {
	if (!/\.(md|mdx)$/.test(fileName)) {
		return null;
	}
	return fileName.replace(/\.(md|mdx)$/, "");
}

/**
 * Determines which _meta.ts file to update for a given file path.
 * Returns null if no meta file exists in that folder (don't auto-create).
 */
export function getMetaFilePath(filePath: string, tree: Array<FileTreeNode>): string | null {
	// Get parent folder path
	const parts = filePath.split("/");
	parts.pop(); // Remove filename
	const folderPath = parts.join("/");

	// Find folder node
	const findFolder = (nodes: Array<FileTreeNode>, path: string): FileTreeNode | undefined => {
		if (path === "") {
			// Root level - return a virtual node with tree as children
			return { id: "root", name: "", path: "", type: "folder", children: nodes };
		}

		for (const node of nodes) {
			if (node.path === path && node.type === "folder") {
				return node;
			}
			if (node.children) {
				const found = findFolder(node.children, path);
				if (found) {
					return found;
				}
			}
		}
		return;
	};

	const folder = findFolder(tree, folderPath);
	if (!folder?.children) {
		return null;
	}

	// Look for existing _meta.* file in that folder
	const metaFile = folder.children.find(
		child => child.type === "file" && /^_meta\.(ts|tsx|js|jsx)$/.test(child.name),
	);

	return metaFile?.path ?? null;
}

/**
 * Stages updated _meta.ts content by setting pendingContent on the node.
 * Uses updateNodePendingContent from common.
 */
export function stageMetaUpdate(tree: Array<FileTreeNode>, metaPath: string, content: string): Array<FileTreeNode> {
	return updateNodePendingContent(tree, metaPath, content);
}

// ========== Meta-Syncing Wrapper Functions ==========

/**
 * Wraps insertNodeOptimistically to automatically sync _meta.ts files.
 * When a .md/.mdx file is created in content/, adds an entry to the folder's _meta.ts.
 */
export function insertNodeWithMetaSync(
	tree: Array<FileTreeNode>,
	parentPath: string,
	newNode: FileTreeNode,
	metaCache: Map<string, string>,
	setMetaCache: (value: Map<string, string> | ((prev: Map<string, string>) => Map<string, string>)) => void,
): Array<FileTreeNode> {
	// First, do the tree operation
	let updatedTree = insertNodeOptimistically(tree, parentPath, newNode);

	// If it's a file that should sync to _meta.ts
	if (newNode.type === "file" && shouldSyncMeta(newNode.path)) {
		const slug = getFileSlug(newNode.name);
		if (!slug) {
			return updatedTree;
		}

		const metaPath = getMetaFilePath(newNode.path, updatedTree);
		if (!metaPath) {
			// No _meta.ts exists in this folder, skip sync
			return updatedTree;
		}

		// Get current content from cache
		const currentContent = metaCache.get(metaPath);
		if (!currentContent) {
			// Meta file not in cache, skip sync
			return updatedTree;
		}

		// Add entry to meta content
		const updatedContent = addMetaEntry(currentContent, slug, slug);

		// Update cache
		setMetaCache(prev => new Map(prev).set(metaPath, updatedContent));

		// Stage update in tree
		updatedTree = stageMetaUpdate(updatedTree, metaPath, updatedContent);
	}

	return updatedTree;
}

/**
 * Wraps removeNodeOptimistically to automatically sync _meta.ts files.
 * When a .md/.mdx file is deleted, removes the entry from the folder's _meta.ts.
 */
export function removeNodeWithMetaSync(
	tree: Array<FileTreeNode>,
	path: string,
	metaCache: Map<string, string>,
	setMetaCache: (value: Map<string, string> | ((prev: Map<string, string>) => Map<string, string>)) => void,
): Array<FileTreeNode> {
	// Find node being removed to get its info
	const node = findNodeInTree(tree, path);

	// Do the tree operation
	let updatedTree = removeNodeOptimistically(tree, path);

	// If it was a file that should sync to _meta.ts
	if (node && node.type === "file" && shouldSyncMeta(path)) {
		const slug = getFileSlug(node.name);
		if (!slug) {
			return updatedTree;
		}

		const metaPath = getMetaFilePath(path, updatedTree);
		if (!metaPath) {
			// No _meta.ts exists, skip sync
			return updatedTree;
		}

		const currentContent = metaCache.get(metaPath);
		if (!currentContent) {
			// Meta file not in cache, skip sync
			return updatedTree;
		}

		// Remove entry from meta content
		const updatedContent = removeMetaEntry(currentContent, slug);

		// Update cache
		setMetaCache(prev => new Map(prev).set(metaPath, updatedContent));

		// Stage update in tree
		updatedTree = stageMetaUpdate(updatedTree, metaPath, updatedContent);
	}

	return updatedTree;
}

/**
 * Wraps moveNodeOptimistically to automatically sync _meta.ts files.
 * When a .md/.mdx file is moved between folders, removes from source _meta.ts and adds to destination _meta.ts.
 */
export function moveNodeWithMetaSync(
	tree: Array<FileTreeNode>,
	sourcePath: string,
	destFolder: string,
	metaCache: Map<string, string>,
	setMetaCache: (value: Map<string, string> | ((prev: Map<string, string>) => Map<string, string>)) => void,
): Array<FileTreeNode> {
	// Find node to move
	const node = findNodeInTree(tree, sourcePath);

	// Do the tree operation
	let updatedTree = moveNodeOptimistically(tree, sourcePath, destFolder);

	// If it's a file that should sync
	if (node && node.type === "file" && shouldSyncMeta(sourcePath)) {
		const slug = getFileSlug(node.name);
		if (!slug) {
			return updatedTree;
		}

		// Get source and destination meta paths
		const sourceMetaPath = getMetaFilePath(sourcePath, updatedTree);
		const newPath = destFolder ? `${destFolder}/${node.name}` : node.name;
		const destMetaPath = getMetaFilePath(newPath, updatedTree);

		// Preserve display value from source
		let displayValue = slug;
		if (sourceMetaPath) {
			const sourceContent = metaCache.get(sourceMetaPath);
			if (sourceContent) {
				const entryValue = getEntryValue(sourceContent, slug);
				if (entryValue) {
					displayValue = entryValue;
				}

				// Remove from source _meta.ts
				const updatedSourceContent = removeMetaEntry(sourceContent, slug);
				setMetaCache(prev => new Map(prev).set(sourceMetaPath, updatedSourceContent));
				updatedTree = stageMetaUpdate(updatedTree, sourceMetaPath, updatedSourceContent);
			}
		}

		// Add to destination _meta.ts
		if (destMetaPath) {
			const destContent = metaCache.get(destMetaPath);
			if (destContent) {
				// Parse displayValue if it's a string value (remove quotes)
				let titleToUse = slug;
				if (displayValue.startsWith('"') && displayValue.endsWith('"')) {
					titleToUse = displayValue.slice(1, -1);
				} else if (displayValue !== slug) {
					// It's an object or complex value, use slug as title
					titleToUse = slug;
				}

				const updatedDestContent = addMetaEntry(destContent, slug, titleToUse);
				setMetaCache(prev => new Map(prev).set(destMetaPath, updatedDestContent));
				updatedTree = stageMetaUpdate(updatedTree, destMetaPath, updatedDestContent);
			}
		}
	}

	return updatedTree;
}
