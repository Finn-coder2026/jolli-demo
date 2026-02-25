import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface HiddenRange {
	title: string | null;
}

export interface HiddenSectionStorage {
	hiddenRanges: Array<HiddenRange>;
}

const hiddenSectionPluginKey = new PluginKey("hiddenSection");

interface DescendableDoc {
	descendants: (cb: (node: Node, pos: number) => boolean) => void;
	content: { size: number };
}

interface NodePosition {
	from: number;
	to: number;
}

function findSectionNodesByTitle(doc: DescendableDoc, title: string | null): Array<NodePosition> {
	const nodes: Array<NodePosition> = [];
	let inSection = title === null;
	let sectionEnded = false;

	doc.descendants((node, pos) => {
		if (sectionEnded) {
			return false;
		}

		if (node.type.name === "heading") {
			if (inSection && (title === null || node.textContent !== title)) {
				sectionEnded = true;
				return false;
			}
			if (node.textContent === title) {
				inSection = true;
				nodes.push({ from: pos, to: pos + node.nodeSize });
			}
			return false;
		}

		if (inSection && node.isBlock) {
			// Skip sectionSuggestion nodes — they are block-level but belong to
			// the *next* section's change, not the current hidden section.
			if (node.type.name === "sectionSuggestion") {
				return false;
			}
			nodes.push({ from: pos, to: pos + node.nodeSize });
			return false;
		}

		return true;
	});

	return nodes;
}

export const HiddenSectionExtension = Extension.create<Record<string, never>, HiddenSectionStorage>({
	name: "hiddenSection",

	addStorage() {
		return {
			hiddenRanges: [],
		};
	},

	addProseMirrorPlugins() {
		const extension = this;

		return [
			new Plugin({
				key: hiddenSectionPluginKey,
				props: {
					decorations(state) {
						const { hiddenRanges } = extension.storage;
						if (!hiddenRanges || hiddenRanges.length === 0) {
							return DecorationSet.empty;
						}

						const decorations: Array<Decoration> = [];

						for (const range of hiddenRanges) {
							const nodePositions = findSectionNodesByTitle(state.doc, range.title);
							for (const pos of nodePositions) {
								decorations.push(
									Decoration.node(pos.from, pos.to, {
										class: "hidden-section-content",
									}),
								);
							}
						}

						return DecorationSet.create(state.doc, decorations);
					},
				},
			}),
		];
	},
});
