import { CodeBlockLanguageSelector } from "./CodeBlockLanguageSelector";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import * as React from "react";

export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps): React.ReactElement {
	const language = (node.attrs as { language?: string }).language ?? "";

	const handleLanguageChange = React.useCallback(
		(newLanguage: string) => {
			updateAttributes({ language: newLanguage });
		},
		[updateAttributes],
	);

	return (
		<NodeViewWrapper className="code-block-view" data-testid="code-block-view" data-language={language}>
			<div
				className="code-block-language-overlay"
				contentEditable={false}
				data-testid="code-block-language-overlay"
			>
				<CodeBlockLanguageSelector language={language} onLanguageChange={handleLanguageChange} />
			</div>
			<pre>
				<NodeViewContent as={"code" as "div"} />
			</pre>
		</NodeViewWrapper>
	);
}
