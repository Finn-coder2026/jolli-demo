import fs from "node:fs";
import path from "node:path";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, test } from "vitest";
import { parse as parseYAML } from "yaml";

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

function extractSections(tree: Node) {
	const sections: Array<{ title: string; depth: number; nodes: Array<Node> }> = [];
	let frontmatter = "";
	const children: Array<Node> = tree.children ?? [];

	for (let i = 0; i < children.length; i++) {
		const node = children[i];
		if (node.type === "yaml" && typeof node.value === "string") {
			// capture front-matter (YAML) value
			frontmatter = node.value;
			continue;
		}
		if (node.type === "heading") {
			const depth: number = node.depth ?? 0;
			const title = headingText(node);
			const content: Array<Node> = [];
			let j = i + 1;
			while (j < children.length && children[j].type !== "heading") {
				content.push(children[j]);
				j++;
			}
			sections.push({ title, depth, nodes: content });
			i = j - 1; // jump to the last consumed index
		}
	}

	return { frontmatter, sections };
}

describe("remark-parse linear section extraction with front-matter", () => {
	test("extracts YAML front-matter and ordered sections", () => {
		const mdPath = path.join(process.cwd(), "tests", "resource", "architecture.md");
		const md = fs.readFileSync(mdPath, "utf8");

		const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).parse(md);
		const { frontmatter, sections } = extractSections(tree);

		// Front-matter assertions
		expect(frontmatter).toBeTypeOf("string");
		expect(frontmatter).toContain("title:");
		expect(frontmatter).toContain("generated:");
		const fm = parseYAML(frontmatter) as unknown;
		expect(fm && typeof fm).toBe("object");
		const fmObj = fm as Record<string, unknown>;
		expect(typeof fmObj.title).toBe("string");
		expect(Object.hasOwn(fmObj, "generated")).toBe(true);

		// Section assertions
		expect(sections.length).toBeGreaterThan(2);
		// First few known section headers in architecture.md
		const titles = sections.map(s => s.title);
		expect(titles[0]).toBe("JOLLI External CLI - Project Architecture");
		expect(titles).toContain("Overview");
		expect(titles).toContain("Technology Stack");

		// Each section should have its captured content nodes (may be empty for some)
		const overview = sections.find(s => s.title === "Overview");
		expect(overview).toBeDefined();
		expect(Array.isArray(overview?.nodes)).toBe(true);
	});
});
