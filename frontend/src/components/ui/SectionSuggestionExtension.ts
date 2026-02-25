import { SectionSuggestionView } from "./SectionSuggestionView";
import { Node } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { DocDraftSectionChangeType } from "jolli-common";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		sectionSuggestion: {
			insertSectionSuggestion: (attrs: {
				changeId: number;
				draftId: number;
				sectionPath: string;
				sectionTitle: string | null;
				originalContent: string;
				suggestedContent: string;
				changeType: DocDraftSectionChangeType;
				description: string;
			}) => ReturnType;
			removeSectionSuggestion: (changeId: number) => ReturnType;
			removeAllSectionSuggestions: () => ReturnType;
		};
	}
}

export interface SectionSuggestionStorage {
	onApply: ((changeId: number) => void) | null;
	onDismiss: ((changeId: number) => void) | null;
}

interface NodeDeletion {
	pos: number;
	size: number;
}

function isEmptyParagraph(node: { type: { name: string }; content: { size: number } }): boolean {
	return node.type.name === "paragraph" && node.content.size === 0;
}

// Empty paragraphs are artifacts created by ProseMirror when block nodes
// are inserted via insertContentAt (it splits/creates paragraphs at boundaries).
function findAdjacentEmptyParagraphs(doc: EditorState["doc"], entry: NodeDeletion): Array<NodeDeletion> {
	const result: Array<NodeDeletion> = [];

	if (entry.pos > 0) {
		const resolved = doc.resolve(entry.pos);
		const indexBefore = resolved.index(0) - 1;
		if (indexBefore >= 0) {
			const nodeBefore = resolved.node(0).child(indexBefore);
			if (isEmptyParagraph(nodeBefore)) {
				result.push({ pos: entry.pos - nodeBefore.nodeSize, size: nodeBefore.nodeSize });
			}
		}
	}

	const posAfter = entry.pos + entry.size;
	if (posAfter < doc.content.size) {
		const resolved = doc.resolve(posAfter);
		const indexAfter = resolved.index(0);
		if (indexAfter < resolved.node(0).childCount) {
			const nodeAfter = resolved.node(0).child(indexAfter);
			if (isEmptyParagraph(nodeAfter)) {
				result.push({ pos: posAfter, size: nodeAfter.nodeSize });
			}
		}
	}

	return result;
}

function deduplicateAndSortReverse(deletions: Array<NodeDeletion>): Array<NodeDeletion> {
	const seen = new Set<number>();
	return deletions
		.filter(d => {
			if (seen.has(d.pos)) {
				return false;
			}
			seen.add(d.pos);
			return true;
		})
		.sort((a, b) => b.pos - a.pos);
}

export const SectionSuggestionExtension = Node.create<Record<string, never>, SectionSuggestionStorage>({
	name: "sectionSuggestion",

	group: "block",
	atom: true,
	selectable: true,
	draggable: false,

	addStorage() {
		return {
			onApply: null,
			onDismiss: null,
		};
	},

	addAttributes() {
		return {
			changeId: {
				default: null,
			},
			draftId: {
				default: null,
			},
			sectionPath: {
				default: "",
			},
			sectionTitle: {
				default: null,
			},
			originalContent: {
				default: "",
			},
			suggestedContent: {
				default: "",
			},
			changeType: {
				default: "update" as DocDraftSectionChangeType,
			},
			description: {
				default: "",
			},
		};
	},

	parseHTML() {
		return [
			{
				tag: 'div[data-section-suggestion="true"]',
			},
		];
	},

	renderHTML({ HTMLAttributes }) {
		return ["div", { "data-section-suggestion": "true", ...HTMLAttributes }];
	},

	addNodeView() {
		return ReactNodeViewRenderer(SectionSuggestionView);
	},

	addCommands() {
		return {
			insertSectionSuggestion:
				attrs =>
				({ chain }) => {
					return chain()
						.insertContent({
							type: this.name,
							attrs,
						})
						.run();
				},
			removeSectionSuggestion:
				changeId =>
				({ state, dispatch }) => {
					const { tr } = state;
					let found = false;

					state.doc.descendants((node, pos) => {
						if (node.type.name === this.name && node.attrs.changeId === changeId) {
							if (dispatch) {
								tr.delete(pos, pos + node.nodeSize);
							}
							found = true;
							return false;
						}
						return true;
					});

					if (found && dispatch) {
						dispatch(tr);
					}
					return found;
				},
			removeAllSectionSuggestions:
				() =>
				({ state, dispatch }) => {
					const suggestionNodes: Array<NodeDeletion> = [];

					state.doc.descendants((node, pos) => {
						if (node.type.name === this.name) {
							suggestionNodes.push({ pos, size: node.nodeSize });
						}
						return true;
					});

					if (suggestionNodes.length === 0) {
						return false;
					}

					if (dispatch) {
						const allDeletions: Array<NodeDeletion> = [];
						for (const entry of suggestionNodes) {
							allDeletions.push(entry, ...findAdjacentEmptyParagraphs(state.doc, entry));
						}

						const { tr } = state;
						for (const { pos, size } of deduplicateAndSortReverse(allDeletions)) {
							tr.delete(pos, pos + size);
						}
						dispatch(tr);
					}
					return true;
				},
		};
	},
});
