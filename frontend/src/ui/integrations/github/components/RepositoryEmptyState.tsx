import { Button } from "../../../../components/ui/Button";
import { FolderGit2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface RepositoryEmptyStateProps {
	totalRepoCount: number;
	showAllRepos: boolean;
	onShowAll: () => void;
}

export function RepositoryEmptyState({
	totalRepoCount,
	showAllRepos,
	onShowAll,
}: RepositoryEmptyStateProps): ReactElement {
	const content = useIntlayer("repository-empty-state");
	return (
		<div className="text-center py-12">
			<FolderGit2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
			<h3 className="text-lg font-medium mb-2">
				{totalRepoCount === 0 ? content.noRepositoriesFound : content.noEnabledRepositories}
			</h3>
			<p className="text-sm text-muted-foreground mb-4">
				{totalRepoCount === 0 ? content.noAccess : content.enableToStart}
			</p>
			{totalRepoCount > 0 && !showAllRepos && (
				<Button variant="outline" onClick={onShowAll}>
					{content.viewAll}
				</Button>
			)}
		</div>
	);
}
