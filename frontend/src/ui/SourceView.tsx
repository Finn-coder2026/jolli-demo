import { useClient } from "../contexts/ClientContext";
import { getLog } from "../util/Logger";
import type { Doc } from "jolli-common";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface SourceViewProps {
	readonly jrn: string;
}

export function SourceView({ jrn }: SourceViewProps): ReactElement {
	const client = useClient();
	const content = useIntlayer("source-view");
	const [doc, setDoc] = useState<Doc | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchArticle = async () => {
			try {
				const data = await client.docs().findDoc(jrn);
				setDoc(data ?? null);
			} catch (error) {
				log.error(error, "Error fetching source:");
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
					<div className="text-center text-foreground text-2xl">{content.loadingSource({ jrn })}</div>
				</div>
			</div>
		);
	}

	if (!doc || !doc.source) {
		return (
			<div className="min-h-screen bg-background p-8">
				<div className="max-w-4xl mx-auto">
					<div className="text-center">
						<h1 className="text-2xl font-bold text-foreground mb-2">{content.sourceNotAvailable}</h1>
						<p className="text-muted-foreground">
							{!doc ? content.couldNotLoadArticle({ jrn }) : content.noSourceContent}
						</p>
					</div>
				</div>
			</div>
		);
	}

	const sourceMetadata = doc.sourceMetadata as Record<string, unknown> | undefined;
	const sourceContent = typeof doc.source === "string" ? doc.source : JSON.stringify(doc.source, null, 2);

	return (
		<div className="min-h-screen bg-background p-8">
			<div className="max-w-4xl mx-auto">
				<div className="bg-card rounded-lg border p-8">
					{/* Header */}
					<div className="mb-6 pb-6 border-b">
						<h1 className="text-3xl font-bold mb-2">{content.originalSource}</h1>
						<p className="text-sm text-muted-foreground">JRN: {jrn}</p>
					</div>

					{/* Source Metadata */}
					{sourceMetadata && Object.keys(sourceMetadata).length > 0 && (
						<div className="mb-6">
							<h2 className="text-xl font-semibold mb-3">{content.sourceMetadata}</h2>
							<div className="bg-muted rounded-lg p-4">
								<pre className="text-sm overflow-x-auto">
									<code>{JSON.stringify(sourceMetadata, null, 2)}</code>
								</pre>
							</div>
						</div>
					)}

					{/* Source Content */}
					<div>
						<h2 className="text-xl font-semibold mb-3">{content.sourceContent}</h2>
						<div className="prose dark:prose-invert max-w-none">
							<pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm whitespace-pre-wrap">
								<code>{sourceContent}</code>
							</pre>
						</div>
					</div>

					{/* Footer */}
					<div className="mt-8 pt-6 border-t text-sm text-muted-foreground">
						<div className="flex justify-between items-center">
							<div>{content.created({ date: new Date(doc.createdAt).toLocaleDateString() })}</div>
							<div>{content.updated({ date: new Date(doc.updatedAt).toLocaleDateString() })}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
