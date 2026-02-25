import { type ArticleTreeNode, getAllDocumentJrns } from "./ArticleTreeItem";
import type { Doc } from "jolli-common";
import { describe, expect, it } from "vitest";

/** Creates a minimal Doc object for testing tree utilities */
function createDoc(id: number, jrn: string, docType: "document" | "folder" = "document"): Doc {
	return {
		id,
		jrn,
		docType,
		slug: `slug-${id}`,
		contentMetadata: { title: `Doc ${id}` },
	} as Doc;
}

/** Creates a tree node with optional children */
function createNode(doc: Doc, children: Array<ArticleTreeNode> = [], expanded = false): ArticleTreeNode {
	return { doc, children, expanded };
}

describe("getAllDocumentJrns", () => {
	it("returns only the node's JRN for a leaf node", () => {
		const node = createNode(createDoc(1, "jrn:doc:1"));
		expect(getAllDocumentJrns(node)).toEqual(["jrn:doc:1"]);
	});

	it("returns JRNs for all descendants including the node itself", () => {
		const node = createNode(createDoc(1, "jrn:folder:1", "folder"), [
			createNode(createDoc(2, "jrn:doc:2")),
			createNode(createDoc(3, "jrn:doc:3")),
		]);
		expect(getAllDocumentJrns(node)).toEqual(["jrn:folder:1", "jrn:doc:2", "jrn:doc:3"]);
	});

	it("returns JRNs for deeply nested trees", () => {
		const node = createNode(createDoc(1, "jrn:folder:root", "folder"), [
			createNode(createDoc(2, "jrn:folder:sub", "folder"), [createNode(createDoc(3, "jrn:doc:leaf"))]),
		]);
		expect(getAllDocumentJrns(node)).toEqual(["jrn:folder:root", "jrn:folder:sub", "jrn:doc:leaf"]);
	});
});
