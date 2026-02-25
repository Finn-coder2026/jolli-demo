import { ArticleLinkNodeView } from "./ArticleLinkNodeView";
import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

/* v8 ignore start -- Tiptap Node extension, requires full editor instance to test */
export const ArticleLinkNode = Node.create({
	name: "articleLink",

	inline: true,
	group: "inline",
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			jrn: {
				default: null,
			},
			title: {
				default: "",
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'a[data-article-link="true"]',
				getAttrs: (element: HTMLElement) => ({
					jrn: element.getAttribute("data-jrn") || "",
					title: element.textContent || "",
				}),
			},
		];
	},

	renderHTML({ node }) {
		return [
			"a",
			{
				"data-article-link": "true",
				"data-jrn": node.attrs.jrn,
				class: "tiptap-link article-link-node",
			},
			node.attrs.title,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(ArticleLinkNodeView);
	},

	renderMarkdown(node: JSONContent): string {
		const attrs = node.attrs as { jrn?: string; title?: string };
		const title = attrs?.title || "";
		const jrn = attrs?.jrn || "";
		return `[${title}](${jrn})`;
	},

	parseMarkdown(token: MarkdownToken): JSONContent {
		const href = (token.href as string) || "";
		const text = (token.text as string) || "";
		return {
			type: "articleLink",
			attrs: { jrn: href, title: text },
		};
	},

	markdownTokenizer: {
		name: "articleLink",
		level: "inline" as const,
		start: (src: string) => {
			const match = src.match(/\[[^\]]*\]\(jrn:/);
			return match ? src.indexOf(match[0]) : -1;
		},
		tokenize(src: string): MarkdownToken | undefined {
			const regex = /^\[([^\]]*)\]\((jrn:[^)]+)\)/;
			const match = src.match(regex);

			if (match) {
				const [raw, text, href] = match;
				return {
					type: "articleLink",
					raw,
					text,
					href,
				};
			}

			return;
		},
	},
});
/* v8 ignore stop */
