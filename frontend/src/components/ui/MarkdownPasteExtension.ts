import { Extension } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";

/**
 * Detect block-level Markdown syntax in plain text.
 * Only checks blocks (tables, headings, code fences, lists, blockquotes, HRs)
 * to avoid false positives from inline markers like `*` or `_`.
 * Tables and lists require 2+ matching lines; other blocks trigger on one.
 */
export function containsMarkdownBlockSyntax(text: string): boolean {
	const lines = text.split("\n");
	let tableLineCount = 0;
	let ulCount = 0;
	let olCount = 0;

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.length > 2 && trimmed.startsWith("|") && trimmed.endsWith("|")) {
			tableLineCount++;
			if (tableLineCount >= 2) {
				return true;
			}
		}

		if (/^#{1,6}\s/.test(trimmed)) {
			return true;
		}

		if (trimmed.startsWith("```")) {
			return true;
		}

		if (/^[-*+]\s/.test(trimmed)) {
			ulCount++;
			if (ulCount >= 2) {
				return true;
			}
		}

		if (/^\d+\.\s/.test(trimmed)) {
			olCount++;
			if (olCount >= 2) {
				return true;
			}
		}

		if (trimmed.startsWith("> ")) {
			return true;
		}

		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
			return true;
		}
	}

	return false;
}

/* v8 ignore start -- ProseMirror paste plugin requires full editor instance; tested via E2E */
/** Register after `Markdown` extension so `editor.markdown` is available. */
export const MarkdownPasteExtension = Extension.create({
	name: "markdownPaste",

	addProseMirrorPlugins() {
		const { editor } = this;
		return [
			new Plugin({
				props: {
					handlePaste(view, event) {
						const clipboardData = event.clipboardData;
						if (!clipboardData) {
							return false;
						}

						const html = clipboardData.getData("text/html");
						const text = clipboardData.getData("text/plain");

						if (html?.trim()) {
							return false;
						}

						if (!text || !containsMarkdownBlockSyntax(text)) {
							return false;
						}

						const markdownManager = editor.markdown;
						if (!markdownManager) {
							return false;
						}

						try {
							const json = markdownManager.parse(text);
							const doc = view.state.schema.nodeFromJSON(json);
							const tr = view.state.tr.replaceSelection(new Slice(doc.content, 0, 0));
							view.dispatch(tr);
							return true;
						} catch {
							return false;
						}
					},
				},
			}),
		];
	},
});
/* v8 ignore stop */
