import { Button } from "../../components/ui/Button";
import { formatTimestamp } from "../../util/DateTimeUtil";
import type { DocDraft } from "jolli-common";
import { FileEdit, FilePlus, Trash2, X } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface DraftSelectionDialogProps {
	drafts: Array<DocDraft>;
	onSelectDraft: (draftId: number) => void;
	onCreateNew: () => void;
	onClose: () => void;
	onDeleteDraft: (draftId: number) => void;
}

// Helper function to stop event propagation (exported for testing)
export function handleStopPropagation(e: React.MouseEvent): void {
	e.stopPropagation();
}

export function DraftSelectionDialog({
	drafts,
	onSelectDraft,
	onCreateNew,
	onClose,
	onDeleteDraft,
}: DraftSelectionDialogProps): ReactElement {
	const content = useIntlayer("draft-selection-dialog");
	const dateTimeContent = useIntlayer("date-time");

	function handleDelete(e: React.MouseEvent, draftId: number): void {
		e.stopPropagation();
		const confirmed = window.confirm(content.confirmDelete.value);
		if (confirmed) {
			onDeleteDraft(draftId);
		}
	}

	return (
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onClick={onClose}
			data-testid="draft-selection-dialog-backdrop"
		>
			<div
				className="bg-background border border-border rounded-lg p-6 max-w-2xl w-full m-4 max-h-[80vh] overflow-hidden flex flex-col"
				onClick={handleStopPropagation}
				data-testid="draft-selection-dialog-content"
			>
				<div className="flex justify-between items-center mb-4">
					<div>
						<h2 className="text-xl font-semibold">{content.title}</h2>
						<p className="text-sm text-muted-foreground mt-1">{content.subtitle}</p>
					</div>
					<Button variant="ghost" size="icon" onClick={onClose} data-testid="close-dialog-button">
						<X className="h-5 w-5" />
					</Button>
				</div>

				<div className="flex-1 overflow-y-auto space-y-3 mb-4 scrollbar-thin">
					{drafts.map(draft => (
						<div
							key={draft.id}
							className="w-full flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
							data-testid={`draft-option-${draft.id}`}
						>
							<div className="flex-shrink-0 text-muted-foreground mt-1">
								<FileEdit className="h-5 w-5" />
							</div>
							<button
								type="button"
								onClick={() => onSelectDraft(draft.id)}
								className="flex-1 min-w-0 text-left"
								data-testid={`draft-select-button-${draft.id}`}
							>
								<h3 className="font-medium truncate">{draft.title}</h3>
								<p className="text-sm text-muted-foreground line-clamp-2 mt-1">
									{draft.content.slice(0, 150)}
									{draft.content.length > 150 ? "..." : ""}
								</p>
								<p className="text-xs text-muted-foreground mt-2">
									{content.lastEdited} {formatTimestamp(dateTimeContent, draft.updatedAt)}
								</p>
							</button>
							<Button
								variant="ghost"
								size="icon"
								onClick={e => handleDelete(e, draft.id)}
								data-testid={`delete-draft-${draft.id}`}
								className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
								title={content.deleteButton?.value}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>

				<div className="border-t pt-4">
					<Button
						onClick={onCreateNew}
						variant="outline"
						className="w-full"
						data-testid="create-new-draft-button"
					>
						<FilePlus className="h-4 w-4 mr-2" />
						{content.createNew}
					</Button>
				</div>
			</div>
		</div>
	);
}
