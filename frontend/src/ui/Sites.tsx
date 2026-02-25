import { Button } from "../components/ui/Button";
import { ContentShell } from "../components/ui/ContentShell";
import { FloatingPanel } from "../components/ui/FloatingPanel";
import { useNavigation } from "../contexts/NavigationContext";
import { useSites } from "../contexts/SitesContext";
import { formatTimestamp } from "../util/DateTimeUtil";
import { formatDomainUrl, getPrimarySiteDomain } from "../util/UrlUtil";
import { CreateSiteWizard } from "./sites/CreateSiteWizard";
import { SiteDetail } from "./sites/SiteDetail";
import { getStatusBadge } from "./sites/SiteDetailUtils";
import { ExternalLink, Globe, Lock, Plus, RefreshCw, Settings, Star } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export function Sites(): ReactElement {
	const content = useIntlayer("sites");
	const dateTimeContent = useIntlayer("date-time");
	const { sites: docsites, isLoading: loading, refreshSites, toggleSiteFavorite, isFavorite } = useSites();

	const { siteView, siteId, navigate } = useNavigation();

	function handleDocsiteClick(id: number) {
		navigate(`/sites/${id}`);
	}

	function handleCreateClick() {
		navigate("/sites/new");
	}

	function handleWizardSuccess(id: number) {
		navigate(`/sites/${id}`);
		void refreshSites();
	}

	// Render create wizard view
	if (siteView === "create") {
		return <CreateSiteWizard onClose={() => navigate("/sites")} onSuccess={handleWizardSuccess} />;
	}

	// Render detail view
	if (siteView === "detail" && siteId) {
		return <SiteDetail docsiteId={siteId} />;
	}

	// Render list view
	return (
		<ContentShell>
			<FloatingPanel className="h-full overflow-auto scrollbar-thin">
				<div className="p-6 flex flex-col">
					{/* Header */}
					<div className="flex items-center justify-between mb-4">
						<div>
							<h1 className="text-2xl font-semibold" data-testid="sites-title">
								{content.title}
							</h1>
						</div>
						<Button onClick={handleCreateClick} data-testid="create-site-button">
							<Plus className="h-4 w-4 mr-2" />
							{content.createButton}
						</Button>
					</div>

					{/* Loading state */}
					{loading && (
						<div className="flex items-center justify-center py-12">
							<div className="text-muted-foreground">{content.loading}</div>
						</div>
					)}

					{/* Empty state */}
					{!loading && docsites.length === 0 && (
						<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
							<div className="rounded-full bg-muted p-3 mb-4">
								<Globe className="h-8 w-8 text-muted-foreground" />
							</div>
							<h3 className="text-lg font-semibold mb-2">{content.emptyStateTitle}</h3>
							<p className="text-muted-foreground mb-6 max-w-md">{content.emptyStateDescription}</p>
							<Button onClick={handleCreateClick}>
								<Plus className="h-4 w-4 mr-2" />
								{content.createButton}
							</Button>
						</div>
					)}

					{/* Sites grid - responsive cards */}
					{!loading && docsites.length > 0 && (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
							{docsites.map(docsite => {
								const siteDomain = getPrimarySiteDomain(docsite);
								const siteUrl = siteDomain ? formatDomainUrl(siteDomain) : undefined;

								return (
									<button
										type="button"
										key={docsite.id}
										onClick={() => handleDocsiteClick(docsite.id)}
										className="border border-border rounded-lg overflow-hidden bg-card hover:shadow-md transition-shadow cursor-pointer flex flex-col max-w-sm text-left"
										data-testid={`site-card-${docsite.id}`}
									>
										{/* Preview - top */}
										<div className="w-full h-28 bg-muted/30 relative overflow-hidden flex-shrink-0">
											{siteUrl &&
											docsite.status === "active" &&
											!docsite.metadata?.jwtAuth?.enabled ? (
												/* v8 ignore start */
												typeof window !== "undefined" && !import.meta.env.VITEST ? (
													<iframe
														src={siteUrl}
														className="absolute top-0 left-0 pointer-events-none"
														style={{
															width: "400%",
															height: "400%",
															transform: "scale(0.25)",
															transformOrigin: "top left",
														}}
														title={`Preview of ${docsite.displayName}`}
														sandbox="allow-same-origin"
													/>
												) : (
													/* v8 ignore stop */
													<div className="w-full h-full flex items-center justify-center">
														<Globe className="h-6 w-6 text-muted-foreground/50" />
													</div>
												)
											) : docsite.status === "building" || docsite.status === "pending" ? (
												<div className="w-full h-full flex items-center justify-center">
													<RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
												</div>
											) : docsite.metadata?.jwtAuth?.enabled ? (
												<div className="w-full h-full flex items-center justify-center">
													<Lock className="h-5 w-5 text-muted-foreground/50" />
												</div>
											) : (
												<div className="w-full h-full flex items-center justify-center">
													<Globe className="h-6 w-6 text-muted-foreground/50" />
												</div>
											)}
										</div>

										{/* Content - bottom */}
										<div className="flex-1 p-3 min-w-0 flex flex-col">
											{/* Site name and status */}
											<div className="flex items-center gap-2 mb-1">
												<h3 className="font-semibold text-sm truncate flex-1">
													{docsite.displayName}
												</h3>
												{getStatusBadge(docsite.status, {
													active: content.statusActive,
													building: content.statusBuilding,
													pending: content.statusPending,
													error: content.statusError,
												})}
											</div>

											{/* Site URL */}
											{siteUrl && (
												<div className="text-xs text-muted-foreground truncate mb-1 font-mono">
													{siteUrl.replace(/^https?:\/\//, "")}
												</div>
											)}

											{/* Metadata */}
											<div className="text-xs text-muted-foreground mb-2">
												{docsite.updatedAt && (
													<span>{formatTimestamp(dateTimeContent, docsite.updatedAt)}</span>
												)}
											</div>

											{/* Actions row */}
											<div className="flex items-center gap-3 mt-auto pt-2">
												<button
													type="button"
													onClick={e => {
														e.stopPropagation();
														toggleSiteFavorite(docsite.id);
													}}
													className={`flex items-center gap-1 text-xs transition-colors ${
														isFavorite(docsite.id)
															? "text-yellow-500 hover:text-yellow-600"
															: "text-muted-foreground hover:text-yellow-500"
													}`}
													title={
														isFavorite(docsite.id)
															? content.removeFavorite.value
															: content.addFavorite.value
													}
													data-testid={`favorite-site-${docsite.id}`}
												>
													<Star
														className={`h-3 w-3 ${isFavorite(docsite.id) ? "fill-current" : ""}`}
													/>
													{isFavorite(docsite.id) ? content.favorited : content.favorite}
												</button>
												{siteUrl && (
													<a
														href={siteUrl}
														target="_blank"
														rel="noopener noreferrer"
														onClick={e => e.stopPropagation()}
														className="flex items-center gap-1 text-xs text-primary hover:underline"
														data-testid={`view-site-${docsite.id}`}
													>
														<ExternalLink className="h-3 w-3" />
														{content.viewSite}
													</a>
												)}
												<span
													className="flex items-center gap-1 text-xs text-muted-foreground"
													data-testid={`configure-site-${docsite.id}`}
												>
													<Settings className="h-3 w-3" />
													{content.viewDetails}
												</span>
											</div>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>
			</FloatingPanel>
		</ContentShell>
	);
}
