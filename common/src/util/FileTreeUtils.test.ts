import {
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
} from "./FileTreeUtils";
import { describe, expect, it } from "vitest";

// Helper to create test nodes
function createFile(name: string, path: string, options: Partial<FileTreeNode> = {}): FileTreeNode {
	return { id: `id-${name}`, name, path, type: "file", ...options };
}

function createFolder(
	name: string,
	path: string,
	children: Array<FileTreeNode> = [],
	options: Partial<FileTreeNode> = {},
): FileTreeNode {
	return { id: `id-${name}`, name, path, type: "folder", children, ...options };
}

describe("FileTreeUtils", () => {
	describe("collectExpandedPaths", () => {
		it("should return empty set for empty tree", () => {
			expect(collectExpandedPaths([])).toEqual(new Set());
		});

		it("should collect expanded folder paths", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [], { expanded: true }),
				createFolder("src", "src", [], { expanded: false }),
			];
			expect(collectExpandedPaths(tree)).toEqual(new Set(["docs"]));
		});

		it("should collect nested expanded folder paths", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFolder("guides", "docs/guides", [], { expanded: true })], {
					expanded: true,
				}),
			];
			const result = collectExpandedPaths(tree);
			expect(result).toEqual(new Set(["docs", "docs/guides"]));
		});

		it("should ignore files", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(collectExpandedPaths(tree)).toEqual(new Set());
		});
	});

	describe("applyExpandedPaths", () => {
		it("should expand folders in the expanded paths set", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs"), createFolder("src", "src")];
			const expandedPaths = new Set(["docs"]);
			const result = applyExpandedPaths(tree, expandedPaths);
			expect(result[0].expanded).toBe(true);
			expect(result[1].expanded).toBe(false);
		});

		it("should preserve already expanded folders", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [], { expanded: true })];
			const result = applyExpandedPaths(tree, new Set());
			expect(result[0].expanded).toBe(true);
		});

		it("should apply to nested folders", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFolder("guides", "docs/guides")])];
			const expandedPaths = new Set(["docs/guides"]);
			const result = applyExpandedPaths(tree, expandedPaths);
			expect(result[0].children?.[0].expanded).toBe(true);
		});

		it("should not modify files", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			const result = applyExpandedPaths(tree, new Set(["readme.md"]));
			expect(result[0]).toEqual(tree[0]);
		});
	});

	describe("getParentPath", () => {
		it("should return parent path for nested file", () => {
			expect(getParentPath("content/guides/article.mdx")).toBe("content/guides");
		});

		it("should return parent path for file in root folder", () => {
			expect(getParentPath("content/article.mdx")).toBe("content");
		});

		it("should return empty string for root level item", () => {
			expect(getParentPath("content")).toBe("");
		});

		it("should return empty string for file with no slash", () => {
			expect(getParentPath("readme.md")).toBe("");
		});
	});

	describe("findNodeInTree", () => {
		it("should find node at root level", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			const result = findNodeInTree(tree, "readme.md");
			expect(result?.name).toBe("readme.md");
		});

		it("should find nested node", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md")])];
			const result = findNodeInTree(tree, "docs/guide.md");
			expect(result?.name).toBe("guide.md");
		});

		it("should return undefined for non-existent path", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(findNodeInTree(tree, "nonexistent.md")).toBeUndefined();
		});

		it("should return a deep clone", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			const result = findNodeInTree(tree, "readme.md");
			expect(result).toBeDefined();
			if (result) {
				result.name = "modified";
			}
			expect(tree[0].name).toBe("readme.md");
		});
	});

	describe("findNodePendingContent", () => {
		it("should find pending content for file", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md", { pendingContent: "# Hello" })];
			expect(findNodePendingContent(tree, "readme.md")).toBe("# Hello");
		});

		it("should find nested pending content", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [
					createFile("guide.md", "docs/guide.md", { pendingContent: "Guide content" }),
				]),
			];
			expect(findNodePendingContent(tree, "docs/guide.md")).toBe("Guide content");
		});

		it("should return undefined for file without pending content", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(findNodePendingContent(tree, "readme.md")).toBeUndefined();
		});

		it("should return undefined for non-existent file", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(findNodePendingContent(tree, "nonexistent.md")).toBeUndefined();
		});

		it("should not return pending content for folders", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs")];
			expect(findNodePendingContent(tree, "docs")).toBeUndefined();
		});
	});

	describe("treeHasSyntaxErrors", () => {
		it("should return false for tree without errors", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(treeHasSyntaxErrors(tree)).toBe(false);
		});

		it("should return true for tree with errors at root", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md", { hasSyntaxErrors: true })];
			expect(treeHasSyntaxErrors(tree)).toBe(true);
		});

		it("should return true for tree with nested errors", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md", { hasSyntaxErrors: true })]),
			];
			expect(treeHasSyntaxErrors(tree)).toBe(true);
		});

		it("should return false for empty tree", () => {
			expect(treeHasSyntaxErrors([])).toBe(false);
		});
	});

	describe("collectFilesWithErrors", () => {
		it("should return empty array for tree without errors", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(collectFilesWithErrors(tree)).toEqual([]);
		});

		it("should collect files with errors", () => {
			const tree: Array<FileTreeNode> = [
				createFile("readme.md", "readme.md", { hasSyntaxErrors: true }),
				createFile("other.md", "other.md"),
			];
			expect(collectFilesWithErrors(tree)).toEqual(["readme.md"]);
		});

		it("should collect nested files with errors", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md", { hasSyntaxErrors: true })]),
			];
			expect(collectFilesWithErrors(tree)).toEqual(["docs/guide.md"]);
		});

		it("should not include folders with errors", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [], { hasSyntaxErrors: true })];
			expect(collectFilesWithErrors(tree)).toEqual([]);
		});
	});

	describe("insertNodeOptimistically", () => {
		it("should insert at root level when parentPath is empty", () => {
			const tree: Array<FileTreeNode> = [createFile("a.md", "a.md")];
			const newNode = createFile("b.md", "b.md");
			const result = insertNodeOptimistically(tree, "", newNode);
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("a.md");
			expect(result[1].name).toBe("b.md");
		});

		it("should sort folders before files", () => {
			const tree: Array<FileTreeNode> = [createFile("z.md", "z.md")];
			const newNode = createFolder("a-folder", "a-folder");
			const result = insertNodeOptimistically(tree, "", newNode);
			expect(result[0].name).toBe("a-folder");
			expect(result[1].name).toBe("z.md");
		});

		it("should insert into nested folder", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [])];
			const newNode = createFile("guide.md", "docs/guide.md");
			const result = insertNodeOptimistically(tree, "docs", newNode);
			expect(result[0].children).toHaveLength(1);
			expect(result[0].children?.[0].name).toBe("guide.md");
			expect(result[0].expanded).toBe(true);
		});

		it("should sort children in nested folder", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("z.md", "docs/z.md")])];
			const newNode = createFile("a.md", "docs/a.md");
			const result = insertNodeOptimistically(tree, "docs", newNode);
			expect(result[0].children?.[0].name).toBe("a.md");
			expect(result[0].children?.[1].name).toBe("z.md");
		});

		it("should sort folders before files in nested folder", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFile("readme.md", "docs/readme.md")]),
			];
			const newNode = createFolder("guides", "docs/guides");
			const result = insertNodeOptimistically(tree, "docs", newNode);
			expect(result[0].children?.[0].type).toBe("folder");
			expect(result[0].children?.[0].name).toBe("guides");
			expect(result[0].children?.[1].type).toBe("file");
			expect(result[0].children?.[1].name).toBe("readme.md");
		});

		it("should handle folder with undefined children", () => {
			// Create folder without children array
			const folderWithoutChildren: FileTreeNode = {
				id: "folder-id",
				name: "docs",
				path: "docs",
				type: "folder",
			};
			const tree: Array<FileTreeNode> = [folderWithoutChildren];
			const newNode = createFile("guide.md", "docs/guide.md");
			const result = insertNodeOptimistically(tree, "docs", newNode);
			expect(result[0].children).toHaveLength(1);
			expect(result[0].children?.[0].name).toBe("guide.md");
		});

		it("should sort files before folders when file comes second in original order", () => {
			// Insert a file into a folder that has a folder, to trigger comparison where a is folder and b is file
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFolder("subfolder", "docs/subfolder")]),
			];
			const newNode = createFile("readme.md", "docs/readme.md");
			const result = insertNodeOptimistically(tree, "docs", newNode);
			expect(result[0].children?.[0].type).toBe("folder");
			expect(result[0].children?.[1].type).toBe("file");
		});

		it("should handle deeply nested insertion", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFolder("guides", "docs/guides", [])]),
			];
			const newNode = createFile("intro.md", "docs/guides/intro.md");
			const result = insertNodeOptimistically(tree, "docs/guides", newNode);
			expect(result[0].children?.[0].children?.[0].name).toBe("intro.md");
		});

		it("should leave sibling files unchanged when inserting into nested folder", () => {
			const tree: Array<FileTreeNode> = [
				createFile("sibling.md", "sibling.md"),
				createFolder("docs", "docs", []),
			];
			const newNode = createFile("guide.md", "docs/guide.md");
			const result = insertNodeOptimistically(tree, "docs", newNode);
			expect(result[0].name).toBe("sibling.md");
			expect(result[1].children?.[0].name).toBe("guide.md");
		});
	});

	describe("removeNodeOptimistically", () => {
		it("should remove node at root level", () => {
			const tree: Array<FileTreeNode> = [createFile("a.md", "a.md"), createFile("b.md", "b.md")];
			const result = removeNodeOptimistically(tree, "a.md");
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("b.md");
		});

		it("should remove nested node", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md")])];
			const result = removeNodeOptimistically(tree, "docs/guide.md");
			expect(result[0].children).toHaveLength(0);
		});

		it("should not modify tree if path not found", () => {
			const tree: Array<FileTreeNode> = [createFile("a.md", "a.md")];
			const result = removeNodeOptimistically(tree, "nonexistent.md");
			expect(result).toHaveLength(1);
		});
	});

	describe("renameNodeOptimistically", () => {
		it("should rename file at root level", () => {
			const tree: Array<FileTreeNode> = [createFile("old.md", "old.md")];
			const result = renameNodeOptimistically(tree, "old.md", "new.md");
			expect(result[0].name).toBe("new.md");
			expect(result[0].path).toBe("new.md");
		});

		it("should rename nested file", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("old.md", "docs/old.md")])];
			const result = renameNodeOptimistically(tree, "docs/old.md", "new.md");
			expect(result[0].children?.[0].name).toBe("new.md");
			expect(result[0].children?.[0].path).toBe("docs/new.md");
		});

		it("should update descendant paths when renaming folder", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("old-folder", "old-folder", [createFile("guide.md", "old-folder/guide.md")]),
			];
			const result = renameNodeOptimistically(tree, "old-folder", "new-folder");
			expect(result[0].name).toBe("new-folder");
			expect(result[0].path).toBe("new-folder");
			expect(result[0].children?.[0].path).toBe("new-folder/guide.md");
		});

		it("should re-sort after rename", () => {
			const tree: Array<FileTreeNode> = [createFile("a.md", "a.md"), createFile("c.md", "c.md")];
			const result = renameNodeOptimistically(tree, "c.md", "b.md");
			expect(result[0].name).toBe("a.md");
			expect(result[1].name).toBe("b.md");
		});

		it("should sort folders before files after rename", () => {
			const tree: Array<FileTreeNode> = [createFolder("z-folder", "z-folder"), createFile("a.md", "a.md")];
			const result = renameNodeOptimistically(tree, "a.md", "b.md");
			expect(result[0].type).toBe("folder");
			expect(result[1].type).toBe("file");
		});

		it("should not modify tree if path not found in nested search", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFile("existing.md", "docs/existing.md")]),
			];
			const result = renameNodeOptimistically(tree, "nonexistent.md", "new.md");
			expect(result[0].children?.[0].name).toBe("existing.md");
		});

		it("should sort files after folders after rename", () => {
			// Rename a file to test sorting with mixed types
			const tree: Array<FileTreeNode> = [createFile("b.md", "b.md"), createFolder("a-folder", "a-folder")];
			const result = renameNodeOptimistically(tree, "b.md", "c.md");
			expect(result[0].type).toBe("folder");
			expect(result[1].type).toBe("file");
		});
	});

	describe("moveNodeOptimistically", () => {
		it("should move file to different folder", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("src", "src", [createFile("file.md", "src/file.md")]),
				createFolder("dest", "dest", []),
			];
			const result = moveNodeOptimistically(tree, "src/file.md", "dest");
			expect(result[1].children).toHaveLength(1);
			expect(result[1].children?.[0].path).toBe("dest/file.md");
			expect(result[0].children).toHaveLength(0);
		});

		it("should move file to root level", () => {
			const tree: Array<FileTreeNode> = [createFolder("src", "src", [createFile("file.md", "src/file.md")])];
			const result = moveNodeOptimistically(tree, "src/file.md", "");
			expect(result).toHaveLength(2);
			expect(result[1].path).toBe("file.md");
		});

		it("should return unchanged tree if source not found", () => {
			const tree: Array<FileTreeNode> = [createFile("a.md", "a.md")];
			const result = moveNodeOptimistically(tree, "nonexistent.md", "");
			expect(result).toEqual(tree);
		});
	});

	describe("updateNodePendingContent", () => {
		it("should update pending content for file", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			const result = updateNodePendingContent(tree, "readme.md", "# New content");
			expect(result[0].pendingContent).toBe("# New content");
		});

		it("should update nested file pending content", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md")])];
			const result = updateNodePendingContent(tree, "docs/guide.md", "Updated");
			expect(result[0].children?.[0].pendingContent).toBe("Updated");
		});

		it("should not update folders", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs")];
			const result = updateNodePendingContent(tree, "docs", "content");
			expect(result[0].pendingContent).toBeUndefined();
		});

		it("should traverse through folders to find deeply nested file", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("level1", "level1", [
					createFolder("level2", "level1/level2", [createFile("deep.md", "level1/level2/deep.md")]),
				]),
			];
			const result = updateNodePendingContent(tree, "level1/level2/deep.md", "Deep content");
			expect(result[0].children?.[0].children?.[0].pendingContent).toBe("Deep content");
		});

		it("should leave sibling files unchanged", () => {
			const tree: Array<FileTreeNode> = [
				createFile("sibling.md", "sibling.md"),
				createFile("target.md", "target.md"),
			];
			const result = updateNodePendingContent(tree, "target.md", "Updated");
			expect(result[0].pendingContent).toBeUndefined();
			expect(result[1].pendingContent).toBe("Updated");
		});
	});

	describe("clearNodePendingContent", () => {
		it("should clear pending content and syntax errors", () => {
			const tree: Array<FileTreeNode> = [
				createFile("readme.md", "readme.md", { pendingContent: "content", hasSyntaxErrors: true }),
			];
			const result = clearNodePendingContent(tree, "readme.md");
			expect(result[0].pendingContent).toBeUndefined();
			expect(result[0].hasSyntaxErrors).toBeUndefined();
		});

		it("should clear nested file pending content", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md", { pendingContent: "content" })]),
			];
			const result = clearNodePendingContent(tree, "docs/guide.md");
			expect(result[0].children?.[0].pendingContent).toBeUndefined();
		});

		it("should traverse through folders to find deeply nested file", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("level1", "level1", [
					createFolder("level2", "level1/level2", [
						createFile("deep.md", "level1/level2/deep.md", { pendingContent: "content" }),
					]),
				]),
			];
			const result = clearNodePendingContent(tree, "level1/level2/deep.md");
			expect(result[0].children?.[0].children?.[0].pendingContent).toBeUndefined();
		});

		it("should leave sibling files unchanged", () => {
			const tree: Array<FileTreeNode> = [
				createFile("sibling.md", "sibling.md", { pendingContent: "keep" }),
				createFile("target.md", "target.md", { pendingContent: "clear" }),
			];
			const result = clearNodePendingContent(tree, "target.md");
			expect(result[0].pendingContent).toBe("keep");
			expect(result[1].pendingContent).toBeUndefined();
		});
	});

	describe("clearAllPendingContent", () => {
		it("should clear all pending content and sync originalPath", () => {
			const tree: Array<FileTreeNode> = [
				createFile("readme.md", "readme.md", { pendingContent: "content", hasSyntaxErrors: true }),
			];
			const result = clearAllPendingContent(tree);
			expect(result[0].pendingContent).toBeUndefined();
			expect(result[0].hasSyntaxErrors).toBeUndefined();
			expect(result[0].originalPath).toBe("readme.md");
		});

		it("should clear nested pending content", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md", { pendingContent: "content" })]),
			];
			const result = clearAllPendingContent(tree);
			expect(result[0].children?.[0].pendingContent).toBeUndefined();
			expect(result[0].children?.[0].originalPath).toBe("docs/guide.md");
		});
	});

	describe("updateNodeSyntaxErrors", () => {
		it("should set syntax errors flag to true", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			const result = updateNodeSyntaxErrors(tree, "readme.md", true);
			expect(result[0].hasSyntaxErrors).toBe(true);
		});

		it("should clear syntax errors flag when false", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md", { hasSyntaxErrors: true })];
			const result = updateNodeSyntaxErrors(tree, "readme.md", false);
			expect(result[0].hasSyntaxErrors).toBeUndefined();
		});

		it("should update nested file syntax errors", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md")])];
			const result = updateNodeSyntaxErrors(tree, "docs/guide.md", true);
			expect(result[0].children?.[0].hasSyntaxErrors).toBe(true);
		});

		it("should not update folders", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs")];
			const result = updateNodeSyntaxErrors(tree, "docs", true);
			expect(result[0].hasSyntaxErrors).toBeUndefined();
		});

		it("should traverse through folders to find deeply nested file", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("level1", "level1", [
					createFolder("level2", "level1/level2", [createFile("deep.md", "level1/level2/deep.md")]),
				]),
			];
			const result = updateNodeSyntaxErrors(tree, "level1/level2/deep.md", true);
			expect(result[0].children?.[0].children?.[0].hasSyntaxErrors).toBe(true);
		});

		it("should leave sibling files unchanged", () => {
			const tree: Array<FileTreeNode> = [
				createFile("sibling.md", "sibling.md"),
				createFile("target.md", "target.md"),
			];
			const result = updateNodeSyntaxErrors(tree, "target.md", true);
			expect(result[0].hasSyntaxErrors).toBeUndefined();
			expect(result[1].hasSyntaxErrors).toBe(true);
		});
	});
});
