import { UserAvatar } from "../../components/UserAvatar";
import { Button } from "../../components/ui/Button";
import { formatTimestamp } from "../../util/DateTimeUtil";
import type { DocDraft } from "jolli-common";
import { AlertCircle, FileText, Users, X } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface DraftConflictDialogProps {
	conflictingDraft: DocDraft;
	onJoinCollaboration: (draftId: number) => void;
	onClose: () => void;
}

export function DraftConflictDialog({
	conflictingDraft,
	onJoinCollaboration,
	onClose,
}: DraftConflictDialogProps): ReactElement {
	const content = useIntlayer("draft-conflict-dialog");
	const dateTimeContent = useIntlayer("date-time");

	return (
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onClick={onClose}
			data-testid="draft-conflict-dialog-backdrop"
		>
			<div
				className="bg-background border border-border rounded-lg p-6 max-w-md w-full m-4"
				onClick={e => e.stopPropagation()}
				data-testid="draft-conflict-dialog-content"
			>
				<div className="flex justify-between items-start mb-4">
					<div className="flex items-start gap-3">
						<AlertCircle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
						<div>
							<h2 className="text-xl font-semibold">{content.title}</h2>
							<p className="text-sm text-muted-foreground mt-1">
								{content.description({ title: conflictingDraft.title })}
							</p>
						</div>
					</div>
					<Button variant="ghost" size="icon" onClick={onClose} data-testid="close-dialog-button">
						<X className="h-5 w-5" />
					</Button>
				</div>

				{/* Existing Draft Info */}
				<div className="mb-6">
					<h3 className="font-medium text-sm mb-2 text-muted-foreground">{content.existingDraft}</h3>
					<div className="p-4 rounded-lg border bg-card">
						<div className="flex items-start gap-3">
							<FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
							<div className="flex-1 min-w-0">
								<div className="font-medium truncate">{conflictingDraft.title}</div>
								<div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
									<span>{content.createdBy}</span>
									<UserAvatar userId={conflictingDraft.createdBy} size="small" />
								</div>
								<div className="text-sm text-muted-foreground mt-1">
									{content.lastUpdated} {formatTimestamp(dateTimeContent, conflictingDraft.updatedAt)}
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Actions - Only join collaboration, no "Create Anyway" */}
				<div className="flex gap-3 justify-end pt-4 border-t">
					<Button variant="outline" onClick={onClose} data-testid="cancel-button">
						{content.cancel}
					</Button>
					<Button
						onClick={() => onJoinCollaboration(conflictingDraft.id)}
						data-testid="join-collaboration-button"
					>
						<Users className="h-4 w-4 mr-2" />
						{content.joinCollaboration}
					</Button>
				</div>
			</div>
		</div>
	);
}
