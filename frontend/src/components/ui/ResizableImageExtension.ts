import { ResizableImage } from "./ResizableImage";
import type { JSONContent, MarkdownToken } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";

export const ResizableImageExtension = Image.extend({
	name: "image",

	addAttributes() {
		return {
			...this.parent?.(),
			widthPx: {
				default: null,
				parseHTML: element => {
					const style = element.getAttribute("style");
					if (style) {
						const match = style.match(/width:\s*(\d+)px/);
						if (match) {
							return Number.parseInt(match[1], 10);
						}
					}
					return null;
				},
				renderHTML: attributes => {
					if (!attributes.widthPx) {
						return {};
					}
					return { style: `width: ${attributes.widthPx}px` };
				},
			},
			widthPercent: {
				default: null,
				parseHTML: element => {
					const style = element.getAttribute("style");
					if (style) {
						const match = style.match(/width:\s*(\d+)%/);
						if (match) {
							return Number.parseInt(match[1], 10);
						}
					}
					return null;
				},
				renderHTML: () => ({}),
			},
		};
	},

	addNodeView() {
		return ReactNodeViewRenderer(ResizableImage);
	},

	renderMarkdown(node: JSONContent): string {
		const attrs = node.attrs as {
			src?: string;
			alt?: string;
			widthPx?: number;
			widthPercent?: number;
		};
		const src = attrs?.src || "";
		const alt = attrs?.alt || "";
		const widthPercent = attrs?.widthPercent;

		let result = `![${alt}](${src})`;
		if (widthPercent != null) {
			result += `{width=${widthPercent}%}`;
		}
		return result;
	},

	parseMarkdown(token: MarkdownToken): JSONContent {
		const src = (token.href as string) || "";
		const alt = (token.text as string) || "";
		let widthPercent: number | undefined;

		const raw = (token.raw as string) || "";
		// Parse percentage format: {width=XX%}
		const percentMatch = raw.match(/\{width=(\d+)%\}/);
		if (percentMatch) {
			widthPercent = Number.parseInt(percentMatch[1], 10);
		}

		// Also check for widthPercent directly on token (from custom tokenizer)
		if (token.widthPercent != null) {
			widthPercent = token.widthPercent as number;
		}

		return {
			type: "image",
			attrs: { src, alt, widthPercent },
		};
	},

	markdownTokenizer: {
		name: "resizableImage",
		level: "inline" as const,
		start: (src: string) => src.indexOf("!["),
		tokenize(src: string): MarkdownToken | undefined {
			// Match image with percentage width: ![alt](src){width=XX%}
			const imageWithPercentRegex = /^!\[([^\]]*)\]\(([^)]+)\)\{width=(\d+)%\}/;
			const match = src.match(imageWithPercentRegex);

			if (match) {
				const [raw, alt, href, widthPercent] = match;
				return {
					type: "image",
					raw,
					text: alt,
					href,
					widthPercent: Number.parseInt(widthPercent, 10),
				};
			}

			return;
		},
	},
});
