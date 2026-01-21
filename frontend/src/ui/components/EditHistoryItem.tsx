import { UserAvatar } from "../../components/UserAvatar";
import { formatTimestamp } from "../../util/DateTimeUtil";
import type { DocDraftEditHistoryEntry } from "jolli-common";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface EditHistoryItemProps {
	entry: DocDraftEditHistoryEntry;
}

export function EditHistoryItem({ entry }: EditHistoryItemProps): ReactElement {
	const content = useIntlayer("edit-history-item");
	const dateTimeContent = useIntlayer("date-time");

	function getEditTypeLabel(editType: string): string {
		switch (editType) {
			case "content":
				return content.editTypeContent.value;
			case "title":
				return content.editTypeTitle.value;
			case "section_apply":
				return content.editTypeSectionApply.value;
			case "section_dismiss":
				return content.editTypeSectionDismiss.value;
			default:
				return editType;
		}
	}

	return (
		<div className="flex flex-col gap-1 px-3 py-2" data-testid="edit-history-item">
			<div className="flex items-center gap-2">
				<UserAvatar userId={entry.userId} size="small" />
				<span className="text-sm font-medium">{getEditTypeLabel(entry.editType)}</span>
			</div>
			{entry.description.length > 0 && (
				<span className="text-xs text-muted-foreground pl-6" data-testid="edit-history-description">
					{entry.description}
				</span>
			)}
			<span className="text-xs text-muted-foreground pl-6" data-testid="edit-history-timestamp">
				{formatTimestamp(dateTimeContent, entry.editedAt)}
			</span>
		</div>
	);
}
