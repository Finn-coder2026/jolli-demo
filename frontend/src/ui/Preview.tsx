import { MarkdownContent } from "../components/MarkdownContent";
import { TogglePill } from "../components/ui/TogglePill";
import { useClient } from "../contexts/ClientContext";
import { stripJolliScriptFrontmatter } from "../util/ContentUtil";
import { getLog } from "../util/Logger";
import type { Doc, DocContentMetadata } from "jolli-common";
import { Code, FileText } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface PreviewProps {
	readonly jrn: string;
}

export function Preview({ jrn }: PreviewProps): ReactElement {
	const client = useClient();
	const content = useIntlayer("preview");
	const [doc, setDoc] = useState<Doc | null>(null);
	const [loading, setLoading] = useState(true);
	const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");

	useEffect(() => {
		const fetchArticle = async () => {
			try {
				const data = await client.docs().findDoc(jrn);
				setDoc(data ?? null);
			} catch (error) {
				log.error(error, "Error fetching article:");
				setDoc(null);
			} finally {
				setLoading(false);
			}
		};

		fetchArticle().then();
	}, [jrn]);

	if (loading) {
		return (
			<div className="min-h-screen bg-background p-8">
				<div className="max-w-4xl mx-auto">
					<div className="text-center text-foreground text-2xl">{content.loadingPreview({ jrn })}</div>
				</div>
			</div>
		);
	}

	if (!doc) {
		return (
			<div className="min-h-screen bg-background p-8">
				<div className="max-w-4xl mx-auto">
					<div className="text-center">
						<h1 className="text-2xl font-bold text-foreground mb-2">{content.articleNotFound}</h1>
						<p className="text-muted-foreground">{content.couldNotLoadArticle({ jrn })}</p>
					</div>
				</div>
			</div>
		);
	}

	const metadata = doc.contentMetadata as DocContentMetadata | undefined;

	const lastUpdatedDate = new Date(doc.updatedAt).toLocaleDateString();

	return (
		<div className="min-h-screen bg-background p-8">
			<div className="max-w-4xl mx-auto">
				<div className="bg-card rounded-lg border p-8">
					{/* Header */}
					<div className="mb-6 pb-6 border-b">
						<div className="flex items-start justify-between gap-4">
							<div className="flex-1">
								<h1 className="text-3xl font-bold mb-2">{metadata?.title || content.untitled}</h1>
								{metadata?.sourceName && (
									<p className="text-sm text-muted-foreground">
										{content.source} {metadata.sourceName}
									</p>
								)}
							</div>
							<TogglePill
								options={[
									{
										value: "rendered",
										label: content.rendered.value,
										icon: <FileText className="h-4 w-4" />,
									},
									{
										value: "raw",
										label: content.sourceView.value,
										icon: <Code className="h-4 w-4" />,
									},
								]}
								value={viewMode}
								onChange={value => setViewMode(value as "rendered" | "raw")}
							/>
						</div>
					</div>

					{/* Content */}
					<div>
						{viewMode === "raw" ? (
							<pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm whitespace-pre-wrap">
								<code>{stripJolliScriptFrontmatter(doc.content)}</code>
							</pre>
						) : (
							<MarkdownContent>{stripJolliScriptFrontmatter(doc.content)}</MarkdownContent>
						)}
					</div>

					{/* Footer */}
					<div className="mt-8 pt-6 border-t text-sm text-muted-foreground">
						<div className="flex justify-between items-center">
							<div>{content.lastUpdated({ date: lastUpdatedDate })}</div>
							<div>{content.version({ version: doc.version })}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
