import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs";
import { useClient } from "../../contexts/ClientContext";
import { useBuildStream } from "../../hooks/useBuildStream";
import { formatTimestamp } from "../../util/DateTimeUtil";
import { getLog } from "../../util/Logger";
import { SiteContentTab } from "./SiteContentTab";
import { getChangeTypeStyle } from "./SiteDetailUtils";
import { SiteLogsTab } from "./SiteLogsTab";
import { SiteOverviewTab } from "./SiteOverviewTab";
import { SiteSettingsTab } from "./SiteSettingsTab";
import type { ChangedConfigFile, JwtAuthMode, SiteWithUpdate } from "jolli-common";
import {
	AlertCircle,
	ArrowLeft,
	CheckCircle,
	FileJson,
	FileText,
	KeyRound,
	LayoutDashboard,
	Pencil,
	RefreshCw,
	ScrollText,
	Settings,
	Trash2,
	XCircle,
} from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface SiteDetailProps {
	docsiteId: number;
	onBack: () => void;
}

/**
 * Analyzes changed articles and config files to determine the types of changes present.
 */
function analyzeChangeReasons(docsite: SiteWithUpdate): {
	hasContentChanges: boolean;
	hasSelectionChanges: boolean;
	hasConfigChanges: boolean;
} {
	let hasContentChanges = false;
	let hasSelectionChanges = false;
	const hasConfigChanges = (docsite.changedConfigFiles?.length ?? 0) > 0;

	if (docsite.changedArticles && docsite.changedArticles.length > 0) {
		for (const article of docsite.changedArticles) {
			if (article.changeReason === "selection") {
				hasSelectionChanges = true;
			} else {
				hasContentChanges = true;
			}
			if (hasContentChanges && hasSelectionChanges) {
				break;
			}
		}
	}

	return { hasContentChanges, hasSelectionChanges, hasConfigChanges };
}

/**
 * Renders the list of changed config files in the update alert.
 */
function renderChangedConfigFilesList(
	docsite: SiteWithUpdate,
	content: {
		changedConfigFilesTitle: React.ReactNode;
	},
): ReactElement | null {
	if (!docsite.changedConfigFiles || docsite.changedConfigFiles.length === 0) {
		return null;
	}

	return (
		<div className="mt-3">
			<h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
				{content.changedConfigFilesTitle} ({docsite.changedConfigFiles.length})
			</h4>
			<div className="rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
				{docsite.changedConfigFiles.map(configFile => (
					<div
						key={configFile.path}
						className="flex items-center gap-3 px-3 py-2 bg-purple-50/50 dark:bg-purple-900/20"
						data-testid="changed-config-file-item"
					>
						<Pencil className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
						<Settings className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
						<div className="flex-1 min-w-0">
							<div className="text-sm font-medium text-purple-700 dark:text-purple-300 truncate">
								{configFile.displayName}
							</div>
							<div className="text-xs text-purple-600 dark:text-purple-400 opacity-75">
								{configFile.path}
							</div>
						</div>
						<Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs">Edited</Badge>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Renders the list of changed articles in the update alert.
 */
function renderChangedArticlesList(
	docsite: SiteWithUpdate,
	content: {
		changedFilesTitle: React.ReactNode;
		changeTypeDeleted: React.ReactNode;
		changeTypeNew: React.ReactNode;
		changeTypeUpdated: React.ReactNode;
		changeReasonContent: React.ReactNode;
		changeReasonSelection: React.ReactNode;
	},
	// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects
	dateTimeContent: any,
): ReactElement | null {
	if (!docsite.changedArticles || docsite.changedArticles.length === 0) {
		return null;
	}

	return (
		<div className="mt-3">
			<h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
				{content.changedFilesTitle} ({docsite.changedArticles.length})
			</h4>
			<div className="rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
				{docsite.changedArticles.map(article => {
					const style = getChangeTypeStyle(article.changeType);
					const ChangeIcon = style.Icon;
					return (
						<div
							key={article.id !== -1 ? article.id : article.jrn}
							className={`flex items-center gap-3 px-3 py-2 ${style.bgClass}`}
							data-testid="changed-article-item"
						>
							<ChangeIcon className={`h-4 w-4 ${style.textClass} flex-shrink-0`} />
							{article.contentType === "application/json" ||
							article.contentType === "application/yaml" ? (
								<FileJson className={`h-4 w-4 ${style.textClass} flex-shrink-0`} />
							) : (
								<FileText className={`h-4 w-4 ${style.textClass} flex-shrink-0`} />
							)}
							<div className="flex-1 min-w-0">
								<div className={`text-sm font-medium ${style.textClass} truncate`}>{article.title}</div>
								<div className={`text-xs ${style.textClass} opacity-75`}>
									{article.changeType === "deleted"
										? content.changeTypeDeleted
										: formatTimestamp(dateTimeContent, article.updatedAt)}
								</div>
							</div>
							<div className="flex items-center gap-1">
								{article.changeReason === "selection" && (
									<Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs">
										{content.changeReasonSelection}
									</Badge>
								)}
								<Badge className={`${style.badgeClass} text-xs`}>
									{article.changeType === "new" && content.changeTypeNew}
									{article.changeType === "updated" && content.changeTypeUpdated}
									{article.changeType === "deleted" && content.changeTypeDeleted}
								</Badge>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function SiteDetail({ docsiteId, onBack }: SiteDetailProps): ReactElement {
	const content = useIntlayer("site-detail");
	const dateTimeContent = useIntlayer("date-time");
	const client = useClient();
	const [docsite, setDocsite] = useState<SiteWithUpdate | undefined>();
	const [loading, setLoading] = useState(true);
	const [rebuilding, setRebuilding] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [savingJwtAuth, setSavingJwtAuth] = useState(false);
	const [configFilesLoading, setConfigFilesLoading] = useState(false);
	const [changedConfigFiles, setChangedConfigFiles] = useState<Array<ChangedConfigFile> | undefined>();
	const [configRefreshTrigger, setConfigRefreshTrigger] = useState(0);
	// Active tab state for programmatic navigation
	const [activeTab, setActiveTab] = useState<"overview" | "content" | "settings" | "logs">("overview");

	const hasAuthChanges = !!docsite?.authChange;

	async function fetchDocsite() {
		try {
			setLoading(true);
			const site = await client.sites().getSite(docsiteId);
			setDocsite(site);
		} catch (error) {
			log.error(error, "Failed to fetch docsite");
		} finally {
			setLoading(false);
		}
	}

	async function fetchDocsiteSilent() {
		try {
			const site = await client.sites().getSite(docsiteId);
			setDocsite(site);
		} catch (error) {
			log.error(error, "Failed to fetch docsite");
		}
	}

	async function handleRepositoryFileSave() {
		await fetchDocsiteSilent();
		setConfigRefreshTrigger(prev => prev + 1);
	}

	const fetchDocsiteSilentRef = useRef(fetchDocsiteSilent);
	useEffect(() => {
		fetchDocsiteSilentRef.current = fetchDocsiteSilent;
	});

	const handleBuildComplete = useCallback(() => {
		fetchDocsiteSilentRef.current();
	}, []);

	const buildStream = useBuildStream(docsiteId, docsite?.status, handleBuildComplete);

	useEffect(() => {
		fetchDocsite().then();
	}, [docsiteId]);

	// Auto-refresh when building (fallback if SSE disconnects)
	useEffect(() => {
		const isBuilding = docsite?.status === "building" || docsite?.status === "pending";

		if (isBuilding && !buildStream.connected) {
			const intervalId = setInterval(() => {
				fetchDocsite().then();
			}, 5000);

			return () => clearInterval(intervalId);
		}
	}, [docsite?.status, buildStream.connected]);

	// Check deployment status periodically
	useEffect(() => {
		const isDeploymentBuilding = docsite?.metadata?.deploymentStatus === "building";

		if (isDeploymentBuilding && docsite?.status === "active") {
			const intervalId = setInterval(async () => {
				try {
					const site = await client.sites().getSite(docsiteId);
					if (site && site.metadata?.deploymentStatus !== docsite.metadata?.deploymentStatus) {
						setDocsite(site);
					}
				} catch (error) {
					log.error(error, "Failed to check deployment status");
				}
			}, 5000);

			return () => clearInterval(intervalId);
		}
	}, [docsite?.metadata?.deploymentStatus, docsite?.status]);

	// Fetch changed config files asynchronously
	useEffect(() => {
		if (!docsite || docsite.status !== "active") {
			setConfigFilesLoading(false);
			setChangedConfigFiles(undefined);
			return;
		}

		const hasArticleChanges = docsite.changedArticles && docsite.changedArticles.length > 0;

		if (!hasArticleChanges) {
			setConfigFilesLoading(true);
		}

		client
			.sites()
			.getChangedConfigFiles(docsiteId)
			.then(files => {
				setChangedConfigFiles(files);
				if (files.length > 0) {
					setDocsite(prev => (prev ? { ...prev, needsUpdate: true, changedConfigFiles: files } : prev));
				}
			})
			.catch(error => log.error(error, "Failed to fetch config file changes"))
			.finally(() => setConfigFilesLoading(false));
	}, [docsite?.id, docsite?.status, configRefreshTrigger]);

	async function handleRebuild() {
		if (!docsite) {
			return;
		}
		try {
			setRebuilding(true);
			await client.sites().regenerateSite(docsite.id);
			await fetchDocsite();
			// Switch to logs tab to show build progress
			setActiveTab("logs");
		} catch (error) {
			log.error(error, "Failed to rebuild site");
		} finally {
			setRebuilding(false);
		}
	}

	async function handleDelete() {
		if (!docsite) {
			return;
		}
		try {
			setDeleting(true);
			await client.sites().deleteSite(docsite.id);
			onBack();
		} catch (error) {
			log.error(error, "Failed to delete docsite");
			setDeleting(false);
			setShowDeleteConfirm(false);
		}
	}

	async function handleCancelBuild() {
		if (!docsite) {
			return;
		}
		try {
			const updatedDocsite = await client.sites().cancelBuild(docsite.id);
			setDocsite({ ...updatedDocsite, needsUpdate: docsite.needsUpdate });
		} catch (error) {
			log.error(error, "Failed to cancel build");
		}
	}

	async function handleJwtAuthUpdate(enabled: boolean, mode: JwtAuthMode) {
		if (!docsite) {
			return;
		}
		try {
			setSavingJwtAuth(true);
			await client.sites().updateJwtAuthConfig(docsite.id, { enabled, mode });
			const updatedSite = await client.sites().getSite(docsite.id);
			if (updatedSite) {
				handleDocsiteUpdate(updatedSite);
			}
		} catch (error) {
			log.error(error, "Failed to update JWT auth config");
		} finally {
			setSavingJwtAuth(false);
		}
	}

	function handleDocsiteUpdate(updatedSite: SiteWithUpdate) {
		const preservedConfigFiles = updatedSite.changedConfigFiles ?? changedConfigFiles ?? [];
		const hasConfigChanges = preservedConfigFiles.length > 0;

		setDocsite({
			...updatedSite,
			changedConfigFiles: preservedConfigFiles,
			needsUpdate: updatedSite.needsUpdate || hasConfigChanges,
		});
	}

	function handleNavigateToTab(tab: "content" | "settings" | "logs") {
		setActiveTab(tab);
	}

	// Loading state
	if (loading) {
		return (
			<div className="h-full flex flex-col">
				<div className="flex items-center justify-center py-12">
					<div className="text-muted-foreground">{content.loading}</div>
				</div>
			</div>
		);
	}

	// Not found state
	if (!docsite) {
		return (
			<div className="h-full flex flex-col">
				<div className="flex items-center justify-center py-12">
					<div className="text-muted-foreground">{content.notFound}</div>
				</div>
			</div>
		);
	}

	const showTabs =
		docsite.status === "active" ||
		docsite.status === "building" ||
		docsite.status === "pending" ||
		docsite.status === "error";

	return (
		<div className="h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="icon" onClick={onBack} data-testid="back-button">
						<ArrowLeft className="h-5 w-5" />
					</Button>
					<div>
						<h1 className="text-2xl font-semibold" data-testid="docsite-title">
							{docsite.displayName}
						</h1>
						<p className="text-sm text-muted-foreground">{docsite.name}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{(docsite.status === "building" || docsite.status === "pending") && (
						<Button variant="destructive" onClick={handleCancelBuild} data-testid="cancel-build-button">
							<XCircle className="h-4 w-4 mr-2" />
							{content.cancelBuildButton}
						</Button>
					)}
					{(docsite.status === "active" || docsite.status === "error") && (
						<Button
							variant={
								docsite.needsUpdate || hasAuthChanges || docsite.status === "error"
									? "default"
									: "outline"
							}
							onClick={handleRebuild}
							disabled={rebuilding}
							data-testid="rebuild-button"
						>
							<RefreshCw className={`h-4 w-4 mr-2 ${rebuilding ? "animate-spin" : ""}`} />
							{rebuilding ? content.rebuildingButton : content.rebuildButton}
						</Button>
					)}
				</div>
			</div>

			{/* Checking for config file changes */}
			{configFilesLoading &&
				docsite.status === "active" &&
				(!docsite.changedArticles || docsite.changedArticles.length === 0) && (
					<div
						className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4 mb-6"
						data-testid="config-files-loading"
					>
						<div className="flex items-center gap-3">
							<RefreshCw className="h-5 w-5 text-gray-600 dark:text-gray-400 animate-spin" />
							<span className="text-sm text-gray-600 dark:text-gray-400">
								{content.checkingConfigFiles}
							</span>
						</div>
					</div>
				)}

			{/* Update Available Banner */}
			{(docsite.needsUpdate || hasAuthChanges) && docsite.status === "active" && (
				<div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
					<div className="flex items-start gap-3">
						<AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
						<div className="flex-1">
							<h3 className="font-medium text-amber-700 dark:text-amber-400 mb-1">
								{content.updateAvailable}
							</h3>
							<p className="text-sm text-amber-600 dark:text-amber-300">
								{(() => {
									const { hasContentChanges, hasSelectionChanges, hasConfigChanges } =
										analyzeChangeReasons(docsite);
									const hasArticleChanges = hasContentChanges || hasSelectionChanges;
									const hasOtherChanges = hasArticleChanges || hasConfigChanges;

									if (hasAuthChanges && !hasOtherChanges) {
										return content.authChangesDescription;
									}
									if (hasAuthChanges && hasOtherChanges) {
										return content.authAndOtherChangesDescription;
									}
									if (hasConfigChanges && !hasArticleChanges) {
										return content.configChangesDescription;
									}
									if (hasConfigChanges && hasArticleChanges) {
										return content.configAndContentChangesDescription;
									}
									if (hasContentChanges && hasSelectionChanges) {
										return content.mixedChangesDescription;
									}
									if (hasSelectionChanges) {
										return content.selectionChangesDescription;
									}
									return content.contentChangesDescription;
								})()}
							</p>

							{/* Auth settings change section */}
							{hasAuthChanges && docsite.authChange && (
								<div className="mt-3" data-testid="auth-changes-section">
									<h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
										{content.authSettingsTitle}
									</h4>
									<div className="rounded-md border border-gray-200 dark:border-gray-700">
										<div
											className="flex items-center gap-3 px-3 py-2 bg-amber-50/50 dark:bg-amber-900/20"
											data-testid="auth-change-item"
										>
											<KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
											<div className="flex-1 min-w-0">
												<div className="text-sm font-medium text-amber-700 dark:text-amber-300">
													{content.authSettingLabel}
												</div>
											</div>
											<div className="flex items-center gap-2">
												<Badge className="bg-gray-500/20 text-gray-600 dark:text-gray-400 text-xs">
													{docsite.authChange.from
														? content.authEnabled
														: content.authDisabled}
												</Badge>
												<span className="text-amber-600 dark:text-amber-400">→</span>
												<Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
													{docsite.authChange.to ? content.authEnabled : content.authDisabled}
												</Badge>
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Changed config files section */}
							{configFilesLoading ? (
								<div
									className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
									data-testid="config-files-inline-loading"
								>
									<RefreshCw className="h-4 w-4 animate-spin" />
									{content.checkingConfigFiles}
								</div>
							) : (
								renderChangedConfigFilesList(docsite, {
									changedConfigFilesTitle: content.changedConfigFilesTitle,
								})
							)}

							{/* Changed articles list */}
							{renderChangedArticlesList(
								docsite,
								{
									changedFilesTitle: content.changedFilesTitle,
									changeTypeDeleted: content.changeTypeDeleted,
									changeTypeNew: content.changeTypeNew,
									changeTypeUpdated: content.changeTypeUpdated,
									changeReasonContent: content.changeReasonContent,
									changeReasonSelection: content.changeReasonSelection,
								},
								dateTimeContent,
							)}
						</div>
					</div>
				</div>
			)}

			{/* Up to Date Banner */}
			{!docsite.needsUpdate &&
				!hasAuthChanges &&
				!configFilesLoading &&
				(!changedConfigFiles || changedConfigFiles.length === 0) &&
				docsite.status === "active" && (
					<div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
						<div className="flex items-start gap-3">
							<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
							<div>
								<h3 className="font-medium text-green-700 dark:text-green-400">{content.upToDate}</h3>
							</div>
						</div>
					</div>
				)}

			{/* Build Progress Banner */}
			{docsite.status === "building" && (
				<div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
					<div className="flex items-start gap-3">
						<RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5 animate-spin" />
						<div>
							<h3 className="font-medium text-blue-700 dark:text-blue-400">{content.buildInProgress}</h3>
						</div>
					</div>
				</div>
			)}

			{/* Build Error Banner */}
			{docsite.status === "error" && docsite.metadata?.lastBuildError && (
				<div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
					<div className="flex items-start gap-3">
						<AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
						<div className="flex-1 min-w-0">
							<h3 className="font-medium text-red-700 dark:text-red-400 mb-1">{content.buildError}</h3>
							<pre className="text-sm text-red-600 dark:text-red-300 whitespace-pre-wrap break-words">
								{docsite.metadata.lastBuildError}
							</pre>
						</div>
					</div>
				</div>
			)}

			{/* Main Tabs */}
			{showTabs && (
				<Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="flex-1">
					<TabsList className="mb-4">
						<TabsTrigger
							value="overview"
							className="flex items-center gap-2"
							data-testid="overview-tab-trigger"
						>
							<LayoutDashboard className="h-4 w-4" />
							{content.tabOverview}
						</TabsTrigger>
						<TabsTrigger
							value="content"
							className="flex items-center gap-2"
							data-testid="content-tab-trigger"
						>
							<FileText className="h-4 w-4" />
							{content.tabContent}
						</TabsTrigger>
						<TabsTrigger
							value="settings"
							className="flex items-center gap-2"
							data-testid="settings-tab-trigger"
						>
							<Settings className="h-4 w-4" />
							{content.tabSettings}
						</TabsTrigger>
						<TabsTrigger value="logs" className="flex items-center gap-2" data-testid="logs-tab-trigger">
							<ScrollText className="h-4 w-4" />
							{content.tabLogs}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="overview" className="border rounded-lg p-4 bg-card">
						<SiteOverviewTab
							docsite={docsite}
							buildStream={buildStream}
							onNavigateToTab={handleNavigateToTab}
						/>
					</TabsContent>

					<TabsContent value="content" className="border rounded-lg p-4 bg-card">
						<SiteContentTab
							docsite={docsite}
							onDocsiteUpdate={handleDocsiteUpdate}
							onFileSave={handleRepositoryFileSave}
						/>
					</TabsContent>

					<TabsContent value="settings" className="border rounded-lg p-4 bg-card">
						<SiteSettingsTab
							docsite={docsite}
							onDocsiteUpdate={handleDocsiteUpdate}
							savingJwtAuth={savingJwtAuth}
							onJwtAuthUpdate={handleJwtAuthUpdate}
							onDeleteRequest={() => setShowDeleteConfirm(true)}
						/>
					</TabsContent>

					<TabsContent value="logs" className="border rounded-lg p-4 bg-card">
						<SiteLogsTab docsite={docsite} buildStream={buildStream} />
					</TabsContent>
				</Tabs>
			)}

			{/* Delete Confirmation Dialog */}
			{showDeleteConfirm && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setShowDeleteConfirm(false)}
					data-testid="delete-confirm-backdrop"
				>
					<div
						className="bg-background border border-border rounded-lg p-6 max-w-md w-full m-4"
						onClick={e => e.stopPropagation()}
						data-testid="delete-confirm-dialog"
					>
						<h2 className="text-xl font-semibold mb-4">{content.deleteConfirmTitle}</h2>
						<p className="text-muted-foreground mb-6">{content.deleteConfirmDescription}</p>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setShowDeleteConfirm(false)}
								disabled={deleting}
								data-testid="delete-cancel-button"
							>
								{content.cancelButton}
							</Button>
							<Button
								variant="destructive"
								onClick={handleDelete}
								disabled={deleting}
								data-testid="delete-confirm-button"
							>
								<Trash2 className="h-4 w-4 mr-2" />
								{content.deleteConfirmButton}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
