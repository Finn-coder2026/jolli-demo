import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface GitHubPageHeaderProps {
	containerName: string;
	containerType: "org" | "user";
	installationId?: number | undefined;
	appSlug?: string | undefined;
	loading: boolean;
	onSync: () => void;
	onRemoveClick?: () => void;
}

export function GitHubPageHeader({
	containerName,
	containerType,
	installationId,
	appSlug,
	loading,
	onSync,
	onRemoveClick,
}: GitHubPageHeaderProps): ReactElement {
	const content = useIntlayer("github-page-header");
	return (
		<div className="mb-6 flex items-center justify-between">
			<div>
				<div className="flex items-center gap-3 mb-1">
					<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0" }}>
						{content.repositoriesTitle({ name: containerName })}
					</h1>
					<Badge variant="outline" className="text-sm">
						{containerType === "org" ? content.organization : content.user}
					</Badge>
					{onRemoveClick && (
						<button
							type="button"
							onClick={onRemoveClick}
							className="text-sm text-destructive hover:underline inline-flex items-center gap-1"
							data-testid="remove-org-link"
						>
							<Trash2 className="h-3 w-3" />
							{content.removeFromJolli}
						</button>
					)}
				</div>
				<p className="text-sm m-0" style={{ color: "#808080cc" }}>
					{content.enableRepositories}
				</p>
				{installationId && appSlug && (
					<a
						href={`https://github.com/apps/${appSlug}/installations/${installationId}`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-4"
					>
						{content.manageInstallation}
						<ExternalLink className="h-3 w-3" />
					</a>
				)}
			</div>
			<Button variant="outline" size="sm" onClick={onSync} disabled={loading}>
				<RefreshCw className={loading ? "h-4 w-4 mr-2 animate-spin" : "h-4 w-4 mr-2"} />
				{content.sync}
			</Button>
		</div>
	);
}
