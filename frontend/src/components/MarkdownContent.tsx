import Markdown from "markdown-to-jsx";
import type { ReactElement } from "react";
import "./MarkdownContent.css";

// Custom anchor component for markdown links
export function MarkdownLink({ href, children }: { children?: React.ReactNode; href?: string | undefined }) {
	return (
		<a href={href} rel="noopener noreferrer" target="_blank">
			{children}
		</a>
	);
}

interface MarkdownContentProps {
	children: string;
}

export function MarkdownContent({ children }: MarkdownContentProps): ReactElement {
	return (
		<div className="markdownContent">
			<Markdown
				options={{
					overrides: {
						a: MarkdownLink,
					},
				}}
			>
				{children}
			</Markdown>
		</div>
	);
}
