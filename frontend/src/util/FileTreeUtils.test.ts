import {
	findAllMetaFiles,
	getFileSlug,
	getMetaFilePath,
	insertNodeWithMetaSync,
	moveNodeWithMetaSync,
	removeNodeWithMetaSync,
	shouldSyncMeta,
	stageMetaUpdate,
} from "./FileTreeUtils";
import type { FileTreeNode } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

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

describe("FileTreeUtils (frontend)", () => {
	describe("findAllMetaFiles", () => {
		it("should return empty array for tree without meta files", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(findAllMetaFiles(tree)).toEqual([]);
		});

		it("should find _meta.ts files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.ts", "content/_meta.ts")]),
			];
			expect(findAllMetaFiles(tree)).toEqual(["content/_meta.ts"]);
		});

		it("should find _meta.tsx files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.tsx", "content/_meta.tsx")]),
			];
			expect(findAllMetaFiles(tree)).toEqual(["content/_meta.tsx"]);
		});

		it("should find _meta.js files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.js", "content/_meta.js")]),
			];
			expect(findAllMetaFiles(tree)).toEqual(["content/_meta.js"]);
		});

		it("should find _meta.jsx files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.jsx", "content/_meta.jsx")]),
			];
			expect(findAllMetaFiles(tree)).toEqual(["content/_meta.jsx"]);
		});

		it("should find multiple meta files in nested folders", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFolder("guides", "content/guides", [createFile("_meta.ts", "content/guides/_meta.ts")]),
				]),
			];
			expect(findAllMetaFiles(tree)).toEqual(["content/_meta.ts", "content/guides/_meta.ts"]);
		});

		it("should not match files that start with _meta but have wrong extension", () => {
			const tree: Array<FileTreeNode> = [createFile("_meta.md", "_meta.md")];
			expect(findAllMetaFiles(tree)).toEqual([]);
		});
	});

	describe("shouldSyncMeta", () => {
		it("should return true for .md files in content folder", () => {
			expect(shouldSyncMeta("content/guide.md")).toBe(true);
		});

		it("should return true for .mdx files in content folder", () => {
			expect(shouldSyncMeta("content/guide.mdx")).toBe(true);
		});

		it("should return true for nested .md files in content folder", () => {
			expect(shouldSyncMeta("content/guides/intro.md")).toBe(true);
		});

		it("should return false for files outside content folder", () => {
			expect(shouldSyncMeta("docs/guide.md")).toBe(false);
		});

		it("should return false for non-markdown files", () => {
			expect(shouldSyncMeta("content/guide.ts")).toBe(false);
		});

		it("should return false for _meta files", () => {
			expect(shouldSyncMeta("content/_meta.ts")).toBe(false);
			expect(shouldSyncMeta("content/_meta.md")).toBe(false);
		});
	});

	describe("getFileSlug", () => {
		it("should extract slug from .md file", () => {
			expect(getFileSlug("guide.md")).toBe("guide");
		});

		it("should extract slug from .mdx file", () => {
			expect(getFileSlug("intro.mdx")).toBe("intro");
		});

		it("should return null for non-markdown files", () => {
			expect(getFileSlug("config.ts")).toBeNull();
		});

		it("should handle filenames with dots", () => {
			expect(getFileSlug("getting.started.md")).toBe("getting.started");
		});
	});

	describe("getMetaFilePath", () => {
		it("should find _meta.ts in same folder", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
				]),
			];
			expect(getMetaFilePath("content/guide.md", tree)).toBe("content/_meta.ts");
		});

		it("should return null if no meta file exists", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("guide.md", "content/guide.md")]),
			];
			expect(getMetaFilePath("content/guide.md", tree)).toBeNull();
		});

		it("should return null if folder not found", () => {
			const tree: Array<FileTreeNode> = [createFile("readme.md", "readme.md")];
			expect(getMetaFilePath("content/guide.md", tree)).toBeNull();
		});

		it("should find _meta.ts for files in root level", () => {
			const tree: Array<FileTreeNode> = [createFile("_meta.ts", "_meta.ts"), createFile("guide.md", "guide.md")];
			expect(getMetaFilePath("guide.md", tree)).toBe("_meta.ts");
		});

		it("should find _meta.tsx variant", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.tsx", "content/_meta.tsx"),
					createFile("guide.md", "content/guide.md"),
				]),
			];
			expect(getMetaFilePath("content/guide.md", tree)).toBe("content/_meta.tsx");
		});

		it("should find _meta.js variant", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.js", "content/_meta.js"),
					createFile("guide.md", "content/guide.md"),
				]),
			];
			expect(getMetaFilePath("content/guide.md", tree)).toBe("content/_meta.js");
		});

		it("should return null for folder without children", () => {
			const tree: Array<FileTreeNode> = [{ id: "id-content", name: "content", path: "content", type: "folder" }];
			expect(getMetaFilePath("content/guide.md", tree)).toBeNull();
		});
	});

	describe("stageMetaUpdate", () => {
		it("should update pendingContent on meta file node", () => {
			const tree: Array<FileTreeNode> = [createFile("_meta.ts", "content/_meta.ts")];
			const result = stageMetaUpdate(tree, "content/_meta.ts", "export default { foo: 'bar' }");
			expect(result[0].pendingContent).toBe("export default { foo: 'bar' }");
		});
	});

	describe("insertNodeWithMetaSync", () => {
		it("should insert node without meta sync for non-content files", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [])];
			const newNode = createFile("guide.md", "docs/guide.md");
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = insertNodeWithMetaSync(tree, "docs", newNode, metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(1);
			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should insert node with meta sync for content files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.ts", "content/_meta.ts")]),
			];
			const newNode = createFile("guide.md", "content/guide.md");
			const metaCache = new Map([["content/_meta.ts", 'export default {\n\tintro: "Introduction",\n}']]);
			const setMetaCache = vi.fn();

			const result = insertNodeWithMetaSync(tree, "content", newNode, metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(2);
			expect(setMetaCache).toHaveBeenCalled();
			// Check that _meta.ts has pending content
			const metaNode = result[0].children?.find(c => c.name === "_meta.ts");
			expect(metaNode?.pendingContent).toBeDefined();
			expect(metaNode?.pendingContent).toContain("guide");
		});

		it("should skip meta sync if no slug can be extracted", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.ts", "content/_meta.ts")]),
			];
			const newNode = createFile("config.ts", "content/config.ts");
			const metaCache = new Map([["content/_meta.ts", "export default {\n}"]]);
			const setMetaCache = vi.fn();

			insertNodeWithMetaSync(tree, "content", newNode, metaCache, setMetaCache);

			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should skip meta sync if no meta file exists", () => {
			const tree: Array<FileTreeNode> = [createFolder("content", "content", [])];
			const newNode = createFile("guide.md", "content/guide.md");
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = insertNodeWithMetaSync(tree, "content", newNode, metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(1);
			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should skip meta sync if meta content not in cache", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.ts", "content/_meta.ts")]),
			];
			const newNode = createFile("guide.md", "content/guide.md");
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = insertNodeWithMetaSync(tree, "content", newNode, metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(2);
			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should not sync meta for folder nodes", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.ts", "content/_meta.ts")]),
			];
			const newNode = createFolder("guides", "content/guides");
			const metaCache = new Map([["content/_meta.ts", "export default {\n}"]]);
			const setMetaCache = vi.fn();

			const result = insertNodeWithMetaSync(tree, "content", newNode, metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(2);
			expect(setMetaCache).not.toHaveBeenCalled();
		});
	});

	describe("removeNodeWithMetaSync", () => {
		it("should remove node without meta sync for non-content files", () => {
			const tree: Array<FileTreeNode> = [createFolder("docs", "docs", [createFile("guide.md", "docs/guide.md")])];
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = removeNodeWithMetaSync(tree, "docs/guide.md", metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(0);
			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should remove node with meta sync for content files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
				]),
			];
			const metaCache = new Map([["content/_meta.ts", 'export default {\n\tguide: "Guide",\n}']]);
			const setMetaCache = vi.fn();

			const result = removeNodeWithMetaSync(tree, "content/guide.md", metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(1);
			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should skip meta sync if node not found", () => {
			const tree: Array<FileTreeNode> = [createFolder("content", "content", [])];
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			removeNodeWithMetaSync(tree, "content/nonexistent.md", metaCache, setMetaCache);

			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should skip meta sync if no slug can be extracted", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("config.ts", "content/config.ts"),
				]),
			];
			const metaCache = new Map([["content/_meta.ts", "export default {\n}"]]);
			const setMetaCache = vi.fn();

			removeNodeWithMetaSync(tree, "content/config.ts", metaCache, setMetaCache);

			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should skip meta sync if no meta file exists", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("guide.md", "content/guide.md")]),
			];
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = removeNodeWithMetaSync(tree, "content/guide.md", metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(0);
			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should skip meta sync if meta content not in cache", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
				]),
			];
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = removeNodeWithMetaSync(tree, "content/guide.md", metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(1);
			expect(setMetaCache).not.toHaveBeenCalled();
		});
	});

	describe("moveNodeWithMetaSync", () => {
		it("should move node without meta sync for non-content files", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("src", "src", [createFile("file.ts", "src/file.ts")]),
				createFolder("dest", "dest", []),
			];
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			const result = moveNodeWithMetaSync(tree, "src/file.ts", "dest", metaCache, setMetaCache);

			expect(result[0].children).toHaveLength(0);
			expect(result[1].children).toHaveLength(1);
			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should move node with meta sync between content folders", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", [createFile("_meta.ts", "content/docs/_meta.ts")]),
				]),
			];
			const metaCache = new Map([
				["content/_meta.ts", 'export default {\n\tguide: "My Guide",\n}'],
				["content/docs/_meta.ts", "export default {\n}"],
			]);
			const setMetaCache = vi.fn();

			const result = moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			expect(setMetaCache).toHaveBeenCalled();
			// Guide should be removed from source and added to dest
			const sourceMetaNode = result[0].children?.find(c => c.name === "_meta.ts");
			expect(sourceMetaNode?.pendingContent).toBeDefined();
			expect(sourceMetaNode?.pendingContent).not.toContain("guide");
		});

		it("should skip meta sync if node not found", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [createFile("_meta.ts", "content/_meta.ts")]),
			];
			const metaCache = new Map<string, string>();
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/nonexistent.md", "content/docs", metaCache, setMetaCache);

			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should skip meta sync if no slug can be extracted", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("config.ts", "content/config.ts"),
				]),
			];
			const metaCache = new Map([["content/_meta.ts", "export default {\n}"]]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/config.ts", "", metaCache, setMetaCache);

			expect(setMetaCache).not.toHaveBeenCalled();
		});

		it("should handle move when source has no meta file", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", [createFile("_meta.ts", "content/docs/_meta.ts")]),
				]),
			];
			const metaCache = new Map([["content/docs/_meta.ts", "export default {\n}"]]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			// Should still add to destination
			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should handle move when destination has no meta file", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", []),
				]),
			];
			const metaCache = new Map([["content/_meta.ts", 'export default {\n\tguide: "Guide",\n}']]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			// Should still remove from source
			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should handle move to root level", () => {
			const tree: Array<FileTreeNode> = [
				createFile("_meta.ts", "_meta.ts"),
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
				]),
			];
			const metaCache = new Map([
				["_meta.ts", "export default {\n}"],
				["content/_meta.ts", 'export default {\n\tguide: "Guide",\n}'],
			]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "", metaCache, setMetaCache);

			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should preserve display value when moving", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", [createFile("_meta.ts", "content/docs/_meta.ts")]),
				]),
			];
			const metaCache = new Map([
				["content/_meta.ts", 'export default {\n\tguide: "Custom Title",\n}'],
				["content/docs/_meta.ts", "export default {\n}"],
			]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			// The setMetaCache should have been called with the preserved title
			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should handle object values when moving", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", [createFile("_meta.ts", "content/docs/_meta.ts")]),
				]),
			];
			const metaCache = new Map([
				["content/_meta.ts", 'export default {\n\tguide: { title: "Guide", hidden: true },\n}'],
				["content/docs/_meta.ts", "export default {\n}"],
			]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			// Should fall back to slug for complex values
			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should handle source meta content not in cache", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", [createFile("_meta.ts", "content/docs/_meta.ts")]),
				]),
			];
			const metaCache = new Map([["content/docs/_meta.ts", "export default {\n}"]]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			// Should still add to destination
			expect(setMetaCache).toHaveBeenCalled();
		});

		it("should handle destination meta content not in cache", () => {
			const tree: Array<FileTreeNode> = [
				createFolder("content", "content", [
					createFile("_meta.ts", "content/_meta.ts"),
					createFile("guide.md", "content/guide.md"),
					createFolder("docs", "content/docs", [createFile("_meta.ts", "content/docs/_meta.ts")]),
				]),
			];
			const metaCache = new Map([["content/_meta.ts", 'export default {\n\tguide: "Guide",\n}']]);
			const setMetaCache = vi.fn();

			moveNodeWithMetaSync(tree, "content/guide.md", "content/docs", metaCache, setMetaCache);

			// Should still remove from source
			expect(setMetaCache).toHaveBeenCalled();
		});
	});
});
