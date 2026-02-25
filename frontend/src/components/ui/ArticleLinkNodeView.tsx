import { toast } from "./Sonner";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewWrapper } from "@tiptap/react";
import type * as React from "react";
import { useIntlayer } from "react-intlayer";
import { useClient } from "@/contexts/ClientContext";

interface ArticleLinkNodeViewProps {
	node: ProseMirrorNode;
	selected: boolean;
}

/* v8 ignore start -- Tiptap NodeView component, requires full editor instance to test */
export function ArticleLinkNodeView({ node, selected }: ArticleLinkNodeViewProps): React.ReactElement {
	const client = useClient();
	const content = useIntlayer("article-link-node-view");
	const { jrn, title } = node.attrs as { jrn: string; title: string };

	async function handleClick(event: React.MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		try {
			const doc = await client.docs().findDoc(jrn);
			if (doc) {
				window.open(`${window.location.origin}/articles?doc=${doc.id}`, "_blank");
			} else {
				toast.error(content.notFound);
			}
		} catch (error: unknown) {
			console.error("Failed to resolve article link:", error);
			toast.error(content.fetchError);
		}
	}

	return (
		<NodeViewWrapper as="span" className="article-link-node-wrapper">
			<a
				className={`tiptap-link article-link-node${selected ? " article-link-node-selected" : ""}`}
				onClick={handleClick}
				data-testid="article-link-node"
			>
				{title}
			</a>
		</NodeViewWrapper>
	);
}
/* v8 ignore stop */
