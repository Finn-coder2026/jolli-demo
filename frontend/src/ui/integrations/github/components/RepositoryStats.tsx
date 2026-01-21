import type { ReactElement } from "react";

export interface RepositoryStatsProps {
	enabledCount: number;
	totalCount: number;
}

export function RepositoryStats({ enabledCount, totalCount }: RepositoryStatsProps): ReactElement {
	const message =
		totalCount === 1
			? `${enabledCount} of ${totalCount} repository enabled`
			: `${enabledCount} of ${totalCount} repositories enabled`;
	return <p className="text-sm text-muted-foreground">{message}</p>;
}
