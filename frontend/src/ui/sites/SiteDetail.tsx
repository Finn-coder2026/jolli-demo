import { cn } from "../../common/ClassNameUtils";
import { Button } from "../../components/ui/Button";
import { ContentShell } from "../../components/ui/ContentShell";
import { FloatingPanel } from "../../components/ui/FloatingPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../components/ui/Resizable";
import { TooltipProvider } from "../../components/ui/Tooltip";
import { useClient } from "../../contexts/ClientContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { useSites } from "../../contexts/SitesContext";
import { useBuildStream } from "../../hooks/useBuildStream";
import { usePreference } from "../../hooks/usePreference";
import { PREFERENCES } from "../../services/preferences/PreferencesRegistry";
import { getLog } from "../../util/Logger";
import { formatDomainUrl, getPrimarySiteDomain } from "../../util/UrlUtil";
import { SiteBrandingTab } from "./branding";
import { SiteBuildLogsPanel } from "./SiteBuildLogsPanel";
import { SiteContentTab } from "./SiteContentTab";
import { SiteNavigationTab } from "./SiteNavigationTab";
import { SitePendingChangesTab } from "./SitePendingChangesTab";
import { SiteRebuildIndicator } from "./SiteRebuildIndicator";
import { type SiteDetailView, SiteTreeNav } from "./SiteTreeNav";
import type { ChangedConfigFile, SiteWithUpdate } from "jolli-common";
import { ExternalLink, PanelLeft, Star, XCircle } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

/** Polling interval (ms) for fallback refresh when SSE is disconnected or checking deployment status */
const POLLING_INTERVAL_MS = 5000;

interface SiteDetailProps {
	docsiteId: number;
}

export function SiteDetail({ docsiteId }: SiteDetailProps): ReactElement {
	const content = useIntlayer("site-detail");
	const client = useClient();
	const { navigate } = useNavigation();
	const { setCurrentSite, refreshSites, isFavorite, toggleSiteFavorite } = useSites();
	const [isTreePinned, setIsTreePinned] = usePreference(PREFERENCES.sitesTreePanelPinned);

	const [docsite, setDocsite] = useState<SiteWithUpdate | undefined>();
	const [loading, setLoading] = useState(true);
	const [rebuilding, setRebuilding] = useState(false);
	const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
	const [changedConfigFiles, setChangedConfigFiles] = useState<Array<ChangedConfigFile> | undefined>();
	const [configRefreshTrigger, setConfigRefreshTrigger] = useState(0);

	const [activeView, setActiveView] = useState<SiteDetailView>("content");

	// Reset active view when switching between sites
	useEffect(() => {
		setActiveView("content");
	}, [docsiteId]);

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

	function handleRepositoryDirtyStateChange(isDirty: boolean) {
		setHasUnsavedChanges(isDirty);
	}

	const fetchDocsiteRef = useRef(fetchDocsite);
	const fetchDocsiteSilentRef = useRef(fetchDocsiteSilent);
	useEffect(() => {
		fetchDocsiteRef.current = fetchDocsite;
		fetchDocsiteSilentRef.current = fetchDocsiteSilent;
	});

	const handleBuildComplete = useCallback(() => {
		fetchDocsiteSilentRef.current();
		void refreshSites();
	}, [refreshSites]);

	const buildStream = useBuildStream(docsiteId, docsite?.status, handleBuildComplete);

	useEffect(() => {
		void fetchDocsiteRef.current();
	}, [docsiteId]);

	// Auto-refresh when building (fallback if SSE disconnects)
	useEffect(() => {
		const isBuilding = docsite?.status === "building" || docsite?.status === "pending";

		if (isBuilding && !buildStream.connected) {
			const intervalId = setInterval(() => {
				void fetchDocsiteRef.current();
			}, POLLING_INTERVAL_MS);

			return () => clearInterval(intervalId);
		}
	}, [docsite?.status, buildStream.connected]);

	// Check deployment status periodically (uses ref to avoid stale closure)
	useEffect(() => {
		const isDeploymentBuilding = docsite?.metadata?.deploymentStatus === "building";

		if (isDeploymentBuilding && docsite?.status === "active") {
			const intervalId = setInterval(() => {
				void fetchDocsiteSilentRef.current();
			}, POLLING_INTERVAL_MS);

			return () => clearInterval(intervalId);
		}
	}, [docsite?.metadata?.deploymentStatus, docsite?.status]);

	useEffect(() => {
		if (!docsite || docsite.status !== "active") {
			setChangedConfigFiles(undefined);
			return;
		}

		let cancelled = false;
		client
			.sites()
			.getChangedConfigFiles(docsiteId)
			.then(files => {
				if (cancelled) {
					return;
				}
				setChangedConfigFiles(files);
				if (files.length > 0) {
					setDocsite(prev => (prev ? { ...prev, needsUpdate: true, changedConfigFiles: files } : prev));
				}
			})
			.catch(error => {
				if (!cancelled) {
					log.error(error, "Failed to fetch config file changes");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [client, docsiteId, docsite?.status, configRefreshTrigger]);

	async function handleRebuild() {
		if (!docsite) {
			return;
		}
		try {
			setRebuilding(true);
			await client.sites().regenerateSite(docsite.id);
			await fetchDocsiteRef.current();
		} catch (error) {
			log.error(error, "Failed to rebuild site");
		} finally {
			setRebuilding(false);
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

	function handleDocsiteUpdate(updatedSite: SiteWithUpdate) {
		const preservedConfigFiles = updatedSite.changedConfigFiles ?? changedConfigFiles ?? [];
		const preservedArticles = updatedSite.changedArticles ?? docsite?.changedArticles ?? [];
		const hasConfigChanges = preservedConfigFiles.length > 0;
		const hasArticleChanges = preservedArticles.length > 0;

		setDocsite({
			...updatedSite,
			changedConfigFiles: preservedConfigFiles,
			changedArticles: preservedArticles,
			needsUpdate: updatedSite.needsUpdate || hasConfigChanges || hasArticleChanges,
		});
	}

	function handleViewChange(view: SiteDetailView): void {
		setActiveView(view);
	}

	async function handleSiteChange(newSite: SiteWithUpdate): Promise<void> {
		// Update context and navigate to the new site
		await refreshSites();
		setCurrentSite(newSite.id);
		navigate(`/sites/${newSite.id}`);
	}

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center">
				<div className="text-muted-foreground">{content.loading}</div>
			</div>
		);
	}

	if (!docsite) {
		return (
			<div className="h-full flex items-center justify-center">
				<div className="text-muted-foreground">{content.notFound}</div>
			</div>
		);
	}

	const site = docsite;
	const primaryUrl = site.status === "active" ? getPrimarySiteDomain(site) : null;
	const isFav = isFavorite(site.id);

	function renderNavigation(): ReactElement {
		return (
			<SiteNavigationTab
				docsite={site}
				onFileSave={handleRepositoryFileSave}
				onDirtyStateChange={handleRepositoryDirtyStateChange}
			/>
		);
	}

	function renderContent(): ReactElement {
		return <SiteContentTab docsite={site} onDocsiteUpdate={handleDocsiteUpdate} />;
	}

	function renderBranding(): ReactElement {
		return <SiteBrandingTab docsite={site} onDocsiteUpdate={handleDocsiteUpdate} />;
	}

	function renderChanges(): ReactElement {
		return (
			<SitePendingChangesTab
				site={site}
				rebuilding={rebuilding}
				hasUnsavedChanges={hasUnsavedChanges}
				onRebuild={handleRebuild}
			/>
		);
	}

	function renderActiveView(): ReactElement {
		switch (activeView) {
			case "navigation":
				return renderNavigation();
			case "content":
				return renderContent();
			case "branding":
				return renderBranding();
			case "changes":
				return renderChanges();
			default: {
				const _exhaustive: never = activeView;
				return renderContent();
			}
		}
	}

	/** Renders the header panel with site name, favorite, view site, cancel build, rebuild indicator. */
	function renderHeaderPanel(showExpandButton: boolean): ReactElement {
		return (
			<FloatingPanel className="shrink-0">
				<div className="h-12 flex items-center justify-between px-4">
					<div className="min-w-0 flex items-center gap-2">
						{showExpandButton && (
							<button
								type="button"
								className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
								onClick={() => setIsTreePinned(true)}
								title={content.expandPanel.value}
								aria-label={content.expandPanel.value}
								data-testid="site-tree-expand-button"
							>
								<PanelLeft className="h-4 w-4" />
							</button>
						)}
						<h1 className="text-sm font-semibold truncate" data-testid="docsite-title">
							{site.displayName}
						</h1>
						<span className="text-xs text-muted-foreground hidden sm:inline">·</span>
						<span className="text-xs text-muted-foreground truncate hidden sm:inline">{site.name}</span>

						<button
							type="button"
							onClick={() => toggleSiteFavorite(site.id)}
							className={cn(
								"p-0.5 rounded hover:bg-muted transition-opacity flex-shrink-0",
								isFav ? "opacity-100" : "opacity-50 hover:opacity-100",
							)}
							title={isFav ? content.removeFromFavorites.value : content.addToFavorites.value}
							data-testid="favorite-site-button"
						>
							<Star
								className={cn(
									"h-3.5 w-3.5",
									isFav ? "fill-current text-yellow-500" : "text-muted-foreground",
								)}
							/>
						</button>

						{primaryUrl && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs text-muted-foreground"
								onClick={() => window.open(formatDomainUrl(primaryUrl), "_blank")}
								data-testid="open-site-button"
							>
								<ExternalLink className="h-3.5 w-3.5 mr-1" />
								{content.viewSite}
							</Button>
						)}
					</div>

					<div className="flex items-center gap-2">
						{(site.status === "building" || site.status === "pending") && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleCancelBuild}
								data-testid="cancel-build-button"
							>
								<XCircle className="h-4 w-4 mr-1" />
								{content.cancelBuildButton}
							</Button>
						)}

						<SiteRebuildIndicator
							site={site}
							rebuilding={rebuilding}
							hasUnsavedChanges={hasUnsavedChanges}
							onRebuild={handleRebuild}
							onReviewChanges={() => setActiveView("changes")}
							buildProgress={
								buildStream.totalSteps > 0
									? (buildStream.currentStep / buildStream.totalSteps) * 100
									: undefined
							}
						/>
					</div>
				</div>
			</FloatingPanel>
		);
	}

	/** Renders the content panel with active view and build logs. */
	function renderContentPanel(): ReactElement {
		return (
			<FloatingPanel className="flex-1 flex flex-col overflow-hidden">
				<main className="flex-1 overflow-auto scrollbar-thin">{renderActiveView()}</main>
				<SiteBuildLogsPanel site={site} buildStream={buildStream} />
			</FloatingPanel>
		);
	}

	if (isTreePinned) {
		// Pinned mode: resizable panels with tree nav on left
		return (
			<TooltipProvider>
				<ContentShell>
					<ResizablePanelGroup direction="horizontal" className="h-full">
						<ResizablePanel defaultSize={17} minSize={15} maxSize={35}>
							<SiteTreeNav
								site={site}
								activeView={activeView}
								onViewChange={handleViewChange}
								onSiteChange={handleSiteChange}
								onCollapse={() => setIsTreePinned(false)}
							/>
						</ResizablePanel>

						<ResizableHandle withHandle className="bg-transparent" />

						<ResizablePanel defaultSize={83} minSize={65}>
							<div className="h-full pl-[3px] flex flex-col gap-1">
								{renderHeaderPanel(false)}
								{renderContentPanel()}
							</div>
						</ResizablePanel>
					</ResizablePanelGroup>
				</ContentShell>
			</TooltipProvider>
		);
	}

	// Collapsed mode: no left panel, expand button in header
	return (
		<TooltipProvider>
			<ContentShell data-testid="collapsed-site-tree">
				<div className="h-full flex flex-col gap-1">
					{renderHeaderPanel(true)}
					{renderContentPanel()}
				</div>
			</ContentShell>
		</TooltipProvider>
	);
}
