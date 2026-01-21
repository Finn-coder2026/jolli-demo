import { Badge } from "../../../components/ui/Badge";
import { useClient } from "../../../contexts/ClientContext";
import type { GitHubRepository } from "jolli-common";
import { AlertCircle, FolderGit2 } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface RepoToggleProps {
	repo: GitHubRepository;
	onSuccess: (repo: GitHubRepository, newState: boolean) => void;
	onError: (error: string) => void;
}

function RepoToggle({ repo, onSuccess, onError }: RepoToggleProps): ReactElement {
	const content = useIntlayer("github-repo-item");
	const client = useClient();
	const [optimisticEnabled, setOptimisticEnabled] = useState(repo.enabled);
	const [toggling, setToggling] = useState(false);

	// Sync optimistic state when actual repo.enabled changes
	useEffect(() => {
		setOptimisticEnabled(repo.enabled);
	}, [repo.enabled]);

	async function handleToggle() {
		const [owner, repoName] = repo.fullName.split("/");
		const targetState = !repo.enabled;

		// Optimistically update the toggle immediately
		setOptimisticEnabled(targetState);
		setToggling(true);

		try {
			if (repo.enabled) {
				await client.github().disableRepo(owner, repoName);
			} else {
				await client.github().enableRepo(owner, repoName, repo.defaultBranch);
			}
			// Notify parent of success so it can update the badge
			onSuccess(repo, targetState);
		} catch (err) {
			// Revert optimistic state on error
			setOptimisticEnabled(repo.enabled);
			onError(err instanceof Error ? err.message : content.failedToggle.value);
		} finally {
			setToggling(false);
		}
	}

	return (
		<label
			className={`relative inline-flex items-center ${
				repo.status === "needs_repo_access" ? "cursor-not-allowed opacity-50" : "cursor-pointer"
			}`}
		>
			<input
				type="checkbox"
				className="sr-only peer"
				checked={optimisticEnabled}
				onChange={handleToggle}
				disabled={toggling || repo.status === "needs_repo_access"}
			/>
			<div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-background after:border-2 after:border-gray-300 dark:after:border-gray-700 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600 peer-checked:after:border-green-600 dark:peer-checked:bg-green-500 dark:peer-checked:after:border-green-500"></div>
		</label>
	);
}

function getStatusBadge(
	repo: GitHubRepository,
	labels: {
		needsAttention: string;
		error: string;
		enabled: string;
		available: string;
	},
): ReactElement {
	const statusConfig = {
		needs_repo_access: { variant: "destructive" as const, icon: true, label: labels.needsAttention },
		error: { variant: "destructive" as const, icon: true, label: labels.error },
		active: { variant: "default" as const, icon: false, label: labels.enabled },
		available: { variant: "secondary" as const, icon: false, label: labels.available },
	};

	const status =
		repo.status === "needs_repo_access" || repo.status === "error"
			? repo.status
			: repo.enabled
				? "active"
				: "available";

	const config = statusConfig[status];

	return (
		<Badge variant={config.variant} className={config.icon ? "gap-1" : ""}>
			{config.icon && <AlertCircle className="h-3 w-3" />}
			{config.label}
		</Badge>
	);
}

export interface GitHubRepositoryItemProps {
	repo: GitHubRepository;
	onToggleSuccess: (repo: GitHubRepository, newState: boolean) => void;
	onToggleError: (error: string) => void;
	isFadingOut?: boolean;
}

export function getAccessErrorMessage(
	accessError: string | undefined,
	content: ReturnType<typeof useIntlayer<"github-repo-item">>,
): string {
	if (!accessError) {
		return "";
	}

	switch (accessError) {
		case "repoNotAccessibleByApp":
			return content.accessErrors.repoNotAccessibleByApp.value;
		case "repoRemovedFromInstallation":
			return content.accessErrors.repoRemovedFromInstallation.value;
		case "appInstallationUninstalled":
			return content.accessErrors.appInstallationUninstalled.value;
		case "repoNotAccessibleViaInstallation":
			return content.accessErrors.repoNotAccessibleViaInstallation.value;
		default:
			return accessError;
	}
}

export function GitHubRepositoryItem({
	repo,
	onToggleSuccess,
	onToggleError,
	isFadingOut = false,
}: GitHubRepositoryItemProps): ReactElement {
	const content = useIntlayer("github-repo-item");
	const misc = useIntlayer("misc");
	return (
		<div
			className={`flex items-center justify-between p-4 border rounded-lg transition-opacity duration-500 ${
				isFadingOut ? "opacity-0" : "opacity-100"
			}`}
		>
			<div className="flex items-center gap-4 flex-1">
				<div className="rounded-full bg-primary/10 p-2">
					<FolderGit2 className="h-5 w-5 text-primary" />
				</div>
				<div className="flex-1">
					<h3 className="font-semibold">{repo.fullName.split("/")[1]}</h3>
					<div className="flex items-center gap-2 mt-1">
						<p className="text-sm text-muted-foreground">{misc.branch({ branch: repo.defaultBranch })}</p>
						{repo.lastAccessCheck && (
							<>
								<span className="text-muted-foreground">•</span>
								<p className="text-xs text-muted-foreground">
									{content.lastChecked({ date: new Date(repo.lastAccessCheck).toLocaleDateString() })}
								</p>
							</>
						)}
					</div>
					{repo.status === "needs_repo_access" && (
						<div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
							<p className="text-yellow-800 dark:text-yellow-200 font-medium mb-1">
								{content.notAccessible.title}
							</p>
							<p className="text-yellow-700 dark:text-yellow-300 mb-2">{content.notAccessible.message}</p>
							<ol className="list-decimal list-inside space-y-1 text-yellow-700 dark:text-yellow-300 mb-2">
								<li>{content.notAccessible.step1}</li>
								<li>{content.notAccessible.step2}</li>
								<li>{content.notAccessible.step3}</li>
							</ol>
						</div>
					)}
					{repo.accessError && (
						<p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
							{getAccessErrorMessage(repo.accessError, content)}
						</p>
					)}
				</div>
			</div>
			<div className="flex items-center gap-3">
				{getStatusBadge(repo, {
					needsAttention: content.statusLabels.needsAttention.value,
					error: content.statusLabels.error.value,
					enabled: content.statusLabels.enabled.value,
					available: content.statusLabels.available.value,
				})}
				<RepoToggle repo={repo} onSuccess={onToggleSuccess} onError={onToggleError} />
			</div>
		</div>
	);
}
