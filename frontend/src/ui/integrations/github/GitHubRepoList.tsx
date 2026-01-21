import { Breadcrumb } from "../../../components/ui/Breadcrumb";
import { Button } from "../../../components/ui/Button";
import { ErrorAlert } from "../../../components/ui/ErrorAlert";
import { Input } from "../../../components/ui/Input";
import { LoadingState } from "../../../components/ui/LoadingState";
import { Pagination } from "../../../components/ui/Pagination";
import { GitHubPageHeader } from "./components/GitHubPageHeader";
import { GitHubWelcomeBanner } from "./components/GitHubWelcomeBanner";
import { RepositoryEmptyState } from "./components/RepositoryEmptyState";
import { RepositoryFilterButtons } from "./components/RepositoryFilterButtons";
import { RepositoryList } from "./components/RepositoryList";
import { RepositoryStats } from "./components/RepositoryStats";
import { useGitHubRepoList } from "./hooks/useGitHubRepoList";
import { AlertCircle, ExternalLink, Search, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface GitHubRepoListProps {
	containerName: string;
	containerType: "org" | "user";
}

interface UninstalledAppWarningProps {
	containerType: "org" | "user";
	containerName: string;
	appSlug: string | undefined;
	onDeleteClick: () => void;
}

function UninstalledAppWarning({
	containerType,
	containerName,
	appSlug,
	onDeleteClick,
}: UninstalledAppWarningProps): ReactElement {
	const content = useIntlayer("github-repo-list");
	const message =
		containerType === "org" ? content.uninstalledWarning.messageOrg : content.uninstalledWarning.messageUser;
	return (
		<div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-6">
			<div className="flex items-start gap-3">
				<AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
				<div className="flex-1">
					<h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
						{content.uninstalledWarning.title}
					</h3>
					<p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">{message}</p>
					<div className="flex gap-3">
						{/* c8 ignore next 10 */}{" "}
						{appSlug ? (
							<a
								href={`https://github.com/apps/${appSlug}/installations/new`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 dark:bg-yellow-700 text-white rounded-md hover:bg-yellow-700 dark:hover:bg-yellow-800 transition-colors text-sm font-medium"
							>
								<ExternalLink className="h-4 w-4" />
								{content.uninstalledWarning.reinstallOnGitHub}
							</a>
						) : (
							/* c8 ignore next 13 */
							<a
								href={
									containerType === "org"
										? `https://github.com/organizations/${containerName}/settings/installations`
										: `https://github.com/settings/installations`
								}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 dark:bg-yellow-700 text-white rounded-md hover:bg-yellow-700 dark:hover:bg-yellow-800 transition-colors text-sm font-medium"
							>
								<ExternalLink className="h-4 w-4" />
								{content.uninstalledWarning.viewInstallations}
							</a>
						)}
						<Button
							variant="outline"
							onClick={onDeleteClick}
							className="border-yellow-400 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200"
						>
							<Trash2 className="h-4 w-4 mr-2" />
							{content.uninstalledWarning.deleteFromJolli}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

interface DeleteContainerModalProps {
	containerType: "org" | "user";
	containerName: string;
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}

function DeleteContainerModal({
	containerType,
	containerName,
	deleting,
	onCancel,
	onConfirm,
}: DeleteContainerModalProps): ReactElement {
	const content = useIntlayer("github-repo-list");
	const title = containerType === "org" ? content.deleteModal.titleOrg : content.deleteModal.titleUser;
	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div className="bg-card border rounded-lg p-6 max-w-md w-full mx-4">
				<h2 className="text-xl font-semibold mb-2">{title}</h2>
				<p className="text-muted-foreground mb-4">{`Are you sure you want to remove ${containerName}?`}</p>
				<p className="text-sm text-muted-foreground mb-6">{content.deleteModal.warningMessage}</p>
				<div className="flex gap-3 justify-end">
					<Button variant="outline" onClick={onCancel} disabled={deleting}>
						{content.deleteModal.cancel}
					</Button>
					<Button variant="destructive" onClick={onConfirm} disabled={deleting}>
						{deleting ? content.deleteModal.deleting : content.deleteModal.deleteButton}
					</Button>
				</div>
			</div>
		</div>
	);
}

export function GitHubRepoList({ containerName, containerType }: GitHubRepoListProps): ReactElement {
	const content = useIntlayer("github-repo-list");
	const {
		repos,
		loading,
		error,
		showAllRepos,
		setShowWelcome,
		installationId,
		appSlug,
		installationStatus,
		showDeleteContainerModal,
		setShowDeleteContainerModal,
		deletingContainer,
		loadRepos,
		handleToggleSuccess,
		handleToggleError,
		confirmDeleteContainer,
		enabledCount,
		shouldShowWelcome,
		shouldShowFilterButtons,
		breadcrumbItems,
		navigate,
		fadingOutRepos,
		searchQuery,
		setSearchQuery,
		currentPage,
		setCurrentPage,
		totalPages,
		paginatedRepos,
		handleShowAllRepos,
		handleShowEnabledOnly,
	} = useGitHubRepoList({ containerName, containerType });

	return (
		<div className="bg-card rounded-lg p-5 border h-full flex flex-col overflow-hidden">
			<Breadcrumb items={breadcrumbItems} onNavigate={navigate} />

			{loading ? (
				<LoadingState message={content.loading.value} />
			) : (
				<>
					{shouldShowWelcome && (
						<GitHubWelcomeBanner repoCount={repos.length} onDismiss={() => setShowWelcome(false)} />
					)}

					<GitHubPageHeader
						containerName={containerName}
						containerType={containerType}
						installationId={installationId}
						appSlug={appSlug}
						loading={loading}
						onSync={loadRepos}
						onRemoveClick={() => setShowDeleteContainerModal(true)}
					/>

					{installationStatus === "not_installed" && (
						<UninstalledAppWarning
							containerType={containerType}
							containerName={containerName}
							appSlug={appSlug}
							onDeleteClick={() => setShowDeleteContainerModal(true)}
						/>
					)}

					{error && <ErrorAlert message={error} />}

					{installationStatus !== "not_installed" && (
						<>
							<div className="mb-4">
								<div className="relative max-w-md">
									<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										placeholder={content.searchPlaceholder.value}
										value={searchQuery}
										onChange={e => setSearchQuery(e.target.value)}
										className="pl-9"
									/>
								</div>
							</div>

							<div className="mb-4 flex items-center justify-between">
								<RepositoryStats enabledCount={enabledCount} totalCount={repos.length} />
								{shouldShowFilterButtons && (
									<RepositoryFilterButtons
										showAllRepos={showAllRepos}
										enabledCount={enabledCount}
										onShowAll={handleShowAllRepos}
										onShowEnabledOnly={handleShowEnabledOnly}
									/>
								)}
							</div>

							<div className="flex-1 overflow-auto min-h-0">
								{paginatedRepos.length === 0 ? (
									<RepositoryEmptyState
										totalRepoCount={repos.length}
										showAllRepos={showAllRepos}
										onShowAll={handleShowAllRepos}
									/>
								) : (
									<RepositoryList
										repositories={paginatedRepos}
										onToggleSuccess={handleToggleSuccess}
										onToggleError={handleToggleError}
										fadingOutRepos={fadingOutRepos}
									/>
								)}
							</div>

							{totalPages > 1 && (
								<div className="mt-4 flex justify-center">
									<Pagination
										currentPage={currentPage}
										totalPages={totalPages}
										onPageChange={setCurrentPage}
									/>
								</div>
							)}
						</>
					)}
				</>
			)}

			{showDeleteContainerModal && (
				<DeleteContainerModal
					containerType={containerType}
					containerName={containerName}
					deleting={deletingContainer}
					onCancel={() => setShowDeleteContainerModal(false)}
					onConfirm={confirmDeleteContainer}
				/>
			)}
		</div>
	);
}
