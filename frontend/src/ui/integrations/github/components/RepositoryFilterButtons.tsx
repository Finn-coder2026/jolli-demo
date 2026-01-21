import { Button } from "../../../../components/ui/Button";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface RepositoryFilterButtonsProps {
	showAllRepos: boolean;
	enabledCount: number;
	onShowAll: () => void;
	onShowEnabledOnly: () => void;
}

export function RepositoryFilterButtons({
	showAllRepos,
	enabledCount,
	onShowAll,
	onShowEnabledOnly,
}: RepositoryFilterButtonsProps): ReactElement {
	const content = useIntlayer("repository-filter-buttons");
	return (
		<div className="flex gap-2">
			<Button variant={showAllRepos ? "default" : "outline"} size="sm" onClick={onShowAll}>
				{content.allRepos}
			</Button>
			<Button variant={!showAllRepos ? "default" : "outline"} size="sm" onClick={onShowEnabledOnly}>
				{`Enabled (${enabledCount})`}
			</Button>
		</div>
	);
}
