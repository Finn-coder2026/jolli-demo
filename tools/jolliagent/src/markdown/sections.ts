import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYAML } from "yaml";

type Node = unknown;

export type SectionMeta = Record<string, unknown>;

export type Section = {
	number: number; // 1-based
	depth: number; // markdown heading depth (1 = #, 2 = ##, etc.)
	title: string;
	text: string; // raw markdown content under the heading (excludes heading + meta comment)
	metadata?: SectionMeta; // parsed from an immediate HTML comment: <!-- meta: {...} -->
};

export type DocumentModel = {
	frontmatter?: { raw: string; yaml?: unknown };
	sections: Array<Section>;
};

function headingText(node: Node): string {
	const n = node as { type?: string; children?: Array<unknown>; value?: string };
	if (!n || n.type !== "heading") {
		return "";
	}
	const parts: Array<string> = [];
	const walk = (child: Node) => {
		const c = child as { type?: string; children?: Array<unknown>; value?: string };
		if (!c) {
			return;
		}
		if (c.type === "text" || c.type === "inlineCode") {
			parts.push(c.value ?? "");
		}
		if (Array.isArray(c.children)) {
			c.children.forEach(walk);
		}
	};
	n.children?.forEach(walk);
	return parts.join("").trim();
}

function parseMetaFromHtml(value: string): SectionMeta | undefined {
	const m = value.match(/<!--\s*meta:\s*({[\s\S]*?})\s*-->/i);
	if (!m) {
		return;
	}
	try {
		return JSON.parse(m[1]);
	} catch {
		return;
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex markdown parsing logic requires multiple conditions
export function parseMarkdownToDocument(md: string): DocumentModel {
	const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]).parse(md) as unknown;
	const children: Array<Node> = (tree as { children?: Array<Node> }).children ?? [];

	// Front-matter: first yaml node at the top
	let fmRaw = "";
	let fmObj: unknown | undefined;
	for (const node of children) {
		const n = node as { type?: string; value?: string };
		if (n.type === "yaml" && typeof n.value === "string") {
			fmRaw = n.value;
			try {
				fmObj = parseYAML(fmRaw);
			} catch {
				// ignore parse errors
			}
			break;
		}
		if (n.type !== "yaml") {
			break;
		}
	}

	const sections: Array<Section> = [];

	for (let i = 0, n = 1; i < children.length; i++) {
		const node = children[i] as {
			type?: string;
			depth?: number;
			value?: string;
			position?: { start?: { offset?: number }; end?: { offset?: number } };
		};
		if (node.type !== "heading") {
			continue;
		}
		const title = headingText(children[i]);
		const depth: number = node.depth ?? 0;

		// Optional immediate meta comment
		let meta: SectionMeta | undefined;
		let bodyStartIndex = i + 1;
		const next = children[i + 1] as { type?: string; value?: string } | undefined;
		if (next && next.type === "html" && typeof next.value === "string") {
			const parsed = parseMetaFromHtml(next.value);
			if (parsed) {
				meta = parsed;
				bodyStartIndex = i + 2;
			}
		}

		// Collect body slice until next heading
		let j = bodyStartIndex;
		let startOffset: number | undefined;
		let endOffset: number | undefined;
		for (; j < children.length; j++) {
			const c = children[j] as {
				type?: string;
				position?: { start?: { offset?: number }; end?: { offset?: number } };
			};
			if (c.type === "heading") {
				break;
			}
			const cStart = c.position?.start?.offset;
			const cEnd = c.position?.end?.offset;
			if (typeof cStart === "number" && typeof cEnd === "number") {
				if (startOffset === undefined) {
					startOffset = cStart;
				}
				endOffset = cEnd;
			}
		}
		const text =
			startOffset !== undefined && endOffset !== undefined ? md.slice(startOffset, endOffset).trim() : "";

		sections.push(
			meta !== undefined
				? { number: n++, depth, title, text, metadata: meta }
				: { number: n++, depth, title, text },
		);
		i = j - 1; // jump to end of this section
	}

	const result: DocumentModel = { sections };
	if (fmRaw) {
		result.frontmatter = fmObj !== undefined ? { raw: fmRaw, yaml: fmObj } : { raw: fmRaw };
	}
	return result;
}
