import { MarkdownImage } from "./MarkdownImage";
import { toast } from "./ui/Sonner";
import Markdown from "markdown-to-jsx";
import type * as React from "react";
import { type ReactElement, useMemo } from "react";
import { useIntlayer } from "react-intlayer";
import { useClient } from "@/contexts/ClientContext";
import "./MarkdownContent.css";

/* v8 ignore start -- JRN link resolution requires full ClientProvider context */
function JrnArticleLink({ jrn, children }: { jrn: string; children?: React.ReactNode }): React.ReactElement {
	const client = useClient();
	const content = useIntlayer("markdown-content");

	async function handleClick(event: React.MouseEvent) {
		event.preventDefault();

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
		<a onClick={handleClick} rel="noopener noreferrer" className="cursor-pointer">
			{children}
		</a>
	);
}
/* v8 ignore stop */

export function MarkdownLink({ href, children }: { children?: React.ReactNode; href?: string | undefined }) {
	if (href?.startsWith("jrn:")) {
		return <JrnArticleLink jrn={href}>{children}</JrnArticleLink>;
	}

	return (
		<a href={href} rel="noopener noreferrer" target="_blank">
			{children}
		</a>
	);
}

function preprocessMarkdownImages(content: string): string {
	const imageWithWidthRegex = /!\[([^\]]*)\]\(([^)]+)\)\{width=(\d+)%\}/g;
	return content.replace(imageWithWidthRegex, '<img src="$2" alt="$1" data-width-percent="$3" />');
}

interface MarkdownContentProps {
	children: string;
	/** Use compact styling for chat messages with tighter spacing */
	compact?: boolean;
}

export function MarkdownContent({ children, compact }: MarkdownContentProps): ReactElement {
	const processedContent = useMemo(() => preprocessMarkdownImages(children), [children]);

	return (
		<div className={compact ? "markdownContent markdownContent--compact" : "markdownContent"}>
			<Markdown
				options={{
					overrides: {
						a: MarkdownLink,
						img: MarkdownImage,
					},
				}}
			>
				{processedContent}
			</Markdown>
		</div>
	);
}
