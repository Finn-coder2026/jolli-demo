import { InlineSectionChange } from "../InlineSectionChange";
import type { SectionSuggestionStorage } from "./SectionSuggestionExtension";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import type { DocDraftSectionChanges, DocDraftSectionChangeType } from "jolli-common";
import type { ReactElement } from "react";

interface SectionSuggestionViewProps {
	node: ProseMirrorNode;
	deleteNode: () => void;
	editor: Editor;
}

export function SectionSuggestionView({ node, deleteNode, editor }: SectionSuggestionViewProps): ReactElement {
	const attrs = node.attrs as {
		changeId: number;
		draftId: number;
		sectionPath: string;
		sectionTitle: string | null;
		originalContent: string;
		suggestedContent: string;
		changeType: DocDraftSectionChangeType;
		description: string;
	};

	const storage = (editor.storage as unknown as Record<string, SectionSuggestionStorage | undefined>)
		.sectionSuggestion;

	const change: DocDraftSectionChanges = {
		id: attrs.changeId,
		draftId: attrs.draftId,
		path: attrs.sectionPath,
		content: attrs.originalContent,
		changeType: attrs.changeType,
		applied: false,
		dismissed: false,
		proposed: [
			{
				for: "content",
				who: { type: "agent" },
				value: attrs.suggestedContent,
				description: attrs.description,
				appliedAt: undefined,
			},
		],
		comments: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	function handleApply(changeId: number): void {
		storage?.onApply?.(changeId);
		deleteNode();
	}

	function handleDismiss(changeId: number): void {
		storage?.onDismiss?.(changeId);
		deleteNode();
	}

	return (
		<NodeViewWrapper className="section-suggestion-nodeview" contentEditable={false}>
			<InlineSectionChange
				change={change}
				sectionTitle={attrs.sectionTitle}
				onApply={handleApply}
				onDismiss={handleDismiss}
				testIdPrefix={`tiptap-suggestion-${attrs.changeId}`}
			/>
		</NodeViewWrapper>
	);
}
