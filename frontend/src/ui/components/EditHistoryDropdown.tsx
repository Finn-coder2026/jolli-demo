import { Button } from "../../components/ui/Button";
import { SimpleDropdown } from "../../components/ui/SimpleDropdown";
import { EditHistoryItem } from "./EditHistoryItem";
import type { DocDraftEditHistoryEntry } from "jolli-common";
import { History } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface EditHistoryDropdownProps {
	history: Array<DocDraftEditHistoryEntry>;
	maxItems?: number;
}

export function EditHistoryDropdown({ history, maxItems = 10 }: EditHistoryDropdownProps): ReactElement {
	const content = useIntlayer("edit-history-dropdown");

	return (
		<SimpleDropdown
			trigger={
				<Button variant="outline" size="sm" title={content.history.value} data-testid="history-button">
					<History className="h-4 w-4 mr-2" />
					{content.history}
				</Button>
			}
			align="end"
		>
			<div className="max-h-80 overflow-y-auto min-w-[16rem]" data-testid="history-dropdown-content">
				{history.length === 0 ? (
					<div
						className="px-3 py-4 text-sm text-muted-foreground text-center"
						data-testid="history-empty-state"
					>
						{content.noHistoryYet}
					</div>
				) : (
					<div className="divide-y">
						{history.slice(0, maxItems).map(entry => (
							<EditHistoryItem key={entry.id} entry={entry} />
						))}
					</div>
				)}
			</div>
		</SimpleDropdown>
	);
}
