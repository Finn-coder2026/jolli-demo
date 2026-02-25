import { Button } from "../../components/ui/Button";
import { formatTimestamp } from "../../util/DateTimeUtil";
import type { Doc, DocContentMetadata, DocDraft } from "jolli-common";
import { AlertCircle, FileText, X } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface DuplicateTitleDialogProps {
	title: string;
	existingArticles: Array<Doc>;
	existingDrafts: Array<DocDraft>;
	onOpenArticle: (jrn: string) => void;
	onOpenDraft: (id: number) => void;
	onCreateAnyway: () => void;
	onClose: () => void;
}

export function DuplicateTitleDialog({
	title,
	existingArticles,
	existingDrafts,
	onOpenArticle,
	onOpenDraft,
	onCreateAnyway,
	onClose,
}: DuplicateTitleDialogProps): ReactElement {
	const content = useIntlayer("duplicate-title-dialog");
	const dateTimeContent = useIntlayer("date-time");

	return (
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onClick={onClose}
			data-testid="duplicate-title-dialog-backdrop"
		>
			<div
				className="bg-background border border-border rounded-lg p-6 max-w-2xl w-full m-4 max-h-[80vh] overflow-y-auto scrollbar-thin"
				onClick={e => e.stopPropagation()}
				data-testid="duplicate-title-dialog-content"
			>
				<div className="flex justify-between items-start mb-4">
					<div className="flex items-start gap-3">
						<AlertCircle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
						<div>
							<h2 className="text-xl font-semibold">{content.title}</h2>
							<p className="text-sm text-muted-foreground mt-1">
								{content.subtitle({
									title,
									count: existingArticles.length + existingDrafts.length,
								})}
							</p>
						</div>
					</div>
					<Button variant="ghost" size="icon" onClick={onClose} data-testid="close-dialog-button">
						<X className="h-5 w-5" />
					</Button>
				</div>

				{/* Existing Articles */}
				{existingArticles.length > 0 && (
					<div className="mb-4">
						<h3 className="font-medium text-sm mb-2 text-muted-foreground">{content.existingArticles}</h3>
						<div className="space-y-2">
							{existingArticles.map(doc => {
								const metadata = (doc.contentMetadata as DocContentMetadata | undefined) ?? {};
								return (
									<button
										key={doc.id}
										onClick={() => onOpenArticle(doc.jrn)}
										className="w-full text-left p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
										type="button"
										data-testid={`article-${doc.id}`}
									>
										<div className="flex items-start gap-2">
											<FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
											<div className="flex-1 min-w-0">
												<div className="font-medium truncate">{metadata.title || title}</div>
												<div className="text-sm text-muted-foreground">
													{content.lastUpdated}{" "}
													{formatTimestamp(dateTimeContent, doc.updatedAt)}
												</div>
											</div>
										</div>
									</button>
								);
							})}
						</div>
					</div>
				)}

				{/* Existing Drafts */}
				{existingDrafts.length > 0 && (
					<div className="mb-4">
						<h3 className="font-medium text-sm mb-2 text-muted-foreground">{content.existingDrafts}</h3>
						<div className="space-y-2">
							{existingDrafts.map(draft => (
								<button
									key={draft.id}
									onClick={() => onOpenDraft(draft.id)}
									className="w-full text-left p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
									type="button"
									data-testid={`draft-${draft.id}`}
								>
									<div className="flex items-start gap-2">
										<FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
										<div className="flex-1 min-w-0">
											<div className="font-medium truncate">{draft.title}</div>
											<div className="text-sm text-muted-foreground">
												{content.lastUpdated}{" "}
												{formatTimestamp(dateTimeContent, draft.updatedAt)}
											</div>
										</div>
									</div>
								</button>
							))}
						</div>
					</div>
				)}

				{/* Actions */}
				<div className="flex gap-3 justify-end pt-4 border-t">
					<Button variant="outline" onClick={onClose} data-testid="cancel-button">
						{content.cancel}
					</Button>
					<Button onClick={onCreateAnyway} data-testid="create-anyway-button">
						{content.createAnyway}
					</Button>
				</div>
			</div>
		</div>
	);
}
