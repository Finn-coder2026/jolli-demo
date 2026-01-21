import { GitHubRepositoryItem } from "../GitHubRepositoryItem";
import type { GitHubRepository } from "jolli-common";
import type { ReactElement } from "react";

export interface RepositoryListProps {
	repositories: Array<GitHubRepository>;
	onToggleSuccess: (repo: GitHubRepository, newState: boolean) => void;
	onToggleError: (errorMessage: string) => void;
	fadingOutRepos: Set<string>;
}

export function RepositoryList({
	repositories,
	onToggleSuccess,
	onToggleError,
	fadingOutRepos,
}: RepositoryListProps): ReactElement {
	return (
		<div className="space-y-3">
			{repositories.map(repo => (
				<GitHubRepositoryItem
					key={repo.fullName}
					repo={repo}
					onToggleSuccess={onToggleSuccess}
					onToggleError={onToggleError}
					isFadingOut={fadingOutRepos.has(repo.fullName)}
				/>
			))}
		</div>
	);
}
