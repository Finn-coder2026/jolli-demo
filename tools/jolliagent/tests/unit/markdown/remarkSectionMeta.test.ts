import fs from "node:fs";
import path from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, test } from "vitest";

type Node = {
	type?: string;
	value?: string | unknown;
	children?: Array<Node>;
	depth?: number;
};

type TextNode = Node & { type: "text" | "inlineCode"; value: string };

function headingText(node: Node): string {
	if (!node || node.type !== "heading") {
		return "";
	}
	const parts: Array<string> = [];
	const walk = (n: Node) => {
		if (!n) {
			return;
		}
		if (n.type === "text" || n.type === "inlineCode") {
			const textNode = n as TextNode;
			parts.push(textNode.value ?? "");
		}
		if (Array.isArray(n.children)) {
			n.children.forEach(walk);
		}
	};
	node.children?.forEach(walk);
	return parts.join("").trim();
}

function parseMetaComment(value: string): unknown | undefined {
	const m = value.match(/<!--\s*meta:\s*({[\s\S]*?})\s*-->/i);
	if (!m) {
		return;
	}
	const json = m[1];
	return JSON.parse(json);
}

describe("per-section <!-- meta: {...} --> citations", () => {
	test("extracts JSON meta right after each heading and validates citations shape", () => {
		const mdPath = path.join(process.cwd(), "tests", "resource", "architecture-meta.md");
		const md = fs.readFileSync(mdPath, "utf8");

		const tree = unified().use(remarkParse).parse(md) as unknown;
		const children: Array<Node> = Array.isArray((tree as { children?: Array<unknown> }).children)
			? ((tree as { children?: Array<unknown> }).children as Array<Node>)
			: [];

		const metas: Record<string, unknown> = {};

		for (let i = 0; i < children.length; i++) {
			const node = children[i];
			if (node.type === "heading") {
				const title = headingText(node);
				const next = children[i + 1];
				if (next && next.type === "html" && typeof next.value === "string") {
					const meta = parseMetaComment(String(next.value ?? ""));
					if (meta) {
						metas[title] = meta;
					}
				}
			}
		}

		// Expect meta for main sections
		expect(Object.keys(metas)).toEqual(["Project Architecture", "Overview", "Technology Stack", "Subsystem A"]);

		// Validate shape for each meta.citations entry
		for (const [_section, meta] of Object.entries(metas)) {
			expect(meta && typeof meta).toBe("object");
			const citations = (meta as { citations?: Array<unknown> }).citations;
			expect(Array.isArray(citations)).toBe(true);
			if (Array.isArray(citations)) {
				for (const c of citations as Array<{ file?: unknown; description?: unknown; lines?: unknown }>) {
					expect(typeof c.file).toBe("string");
					expect(typeof c.description).toBe("string");
					expect(typeof c.lines).toBe("string");
					expect(String(c.lines)).toMatch(/^\d+-\d+$/);
				}
			}
			// Basic sanity: at least one citation per section
			expect(Array.isArray(citations) ? citations.length : 0).toBeGreaterThan(0);
		}
	});
});
