/**
 * SitesFavoritesList - Collapsible section displaying sites in the unified sidebar.
 *
 * Uses a soft cap of 6 items: favorites are shown first (alphabetically), then
 * non-favorites fill remaining slots. If more than 6 favorites exist, all are shown.
 * "View all sites" only appears when some sites are hidden.
 */

import { cn } from "../../common/ClassNameUtils";
import { SiteIcon } from "../../components/SiteIcon";
import { useNavigation } from "../../contexts/NavigationContext";
import { useSites } from "../../contexts/SitesContext";
import { usePreference } from "../../hooks/usePreference";
import { PREFERENCES } from "../../services/preferences/PreferencesRegistry";
import { getSiteUrl } from "../../util/UrlUtil";
import styles from "./SidebarItem.module.css";
import { SiteAuthIndicator } from "./SiteAuthIndicator";
import { ViewAllSitesDropdown } from "./ViewAllSitesDropdown";
import type { SiteWithUpdate } from "jolli-common";
import { ChevronDown, ChevronRight, ExternalLink, Globe, Plus, Star } from "lucide-react";
import { type ReactElement, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface SitesFavoritesListProps {
	/** Whether the sidebar is collapsed */
	collapsed: boolean;
}

/** Collapsible sites section for the unified sidebar with soft-cap display logic. */
export function SitesFavoritesList({ collapsed }: SitesFavoritesListProps): ReactElement {
	const content = useIntlayer("sites-favorites-list");
	const { navigate, siteId } = useNavigation();
	const { sites, isFavorite, toggleSiteFavorite } = useSites();
	const [sectionExpanded, setSectionExpanded] = usePreference(PREFERENCES.sidebarSitesExpanded);
	const [showViewAll, setShowViewAll] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const viewAllButtonRef = useRef<HTMLButtonElement>(null);

	/** Soft cap for the number of sites shown in the sidebar list. */
	const SOFT_CAP = 6;

	// Compute visible sites: favorites first (alpha), then non-favorites (alpha), up to soft cap.
	// If more than SOFT_CAP favorites exist, all favorites are shown (soft cap is exceeded).
	const visibleSites = useMemo(() => {
		const favorited = sites
			.filter(s => isFavorite(s.id))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
		const nonFavorited = sites
			.filter(s => !isFavorite(s.id))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));

		if (favorited.length === 0) {
			return nonFavorited.slice(0, SOFT_CAP);
		}
		if (favorited.length >= SOFT_CAP) {
			return favorited;
		}
		const remainingSlots = SOFT_CAP - favorited.length;
		return [...favorited, ...nonFavorited.slice(0, remainingSlots)];
	}, [sites, isFavorite]);

	// "View all" only shows when there are sites hidden from the sidebar list
	const hasHiddenSites = sites.length > visibleSites.length;

	function handleToggleSection() {
		setSectionExpanded(!sectionExpanded);
	}

	function handleSiteClick(site: SiteWithUpdate) {
		// Navigate to site detail view (shows RepositoryViewer)
		navigate(`/sites/${site.id}`);
		setShowViewAll(false);
	}

	function handleStarClick(e: React.MouseEvent, targetSiteId: number) {
		e.stopPropagation();
		toggleSiteFavorite(targetSiteId);
	}

	function handleOpenSite(e: React.MouseEvent, site: SiteWithUpdate) {
		e.stopPropagation();
		const url = getSiteUrl(site);
		if (url) {
			window.open(url, "_blank");
		}
	}

	function handleViewAllClick() {
		setShowViewAll(!showViewAll);
	}

	function handleCreateClick() {
		// Navigate to create site wizard instead of showing modal
		navigate("/sites/new");
	}

	// Collapsed sidebar mode - show just icon with dropdown
	if (collapsed) {
		return (
			<div className="relative px-2 py-1" ref={containerRef} data-testid="favorite-sites-list">
				<button
					type="button"
					onClick={handleViewAllClick}
					className="flex items-center justify-center w-full p-2 rounded-md hover:bg-accent transition-colors"
					title={content.sites.value}
					data-testid="sites-collapsed-trigger"
				>
					<Globe className="h-4 w-4" />
				</button>

				{showViewAll && (
					<>
						{/* Backdrop to close dropdown */}
						<div
							className="fixed inset-0 z-40"
							onClick={() => setShowViewAll(false)}
							data-testid="view-all-backdrop"
						/>
						<ViewAllSitesDropdown
							collapsed={true}
							onSiteClick={handleSiteClick}
							triggerRef={containerRef}
						/>
					</>
				)}
			</div>
		);
	}

	// Expanded sidebar mode
	return (
		<div className="relative" ref={containerRef} data-testid="favorite-sites-list">
			{/* Section Header */}
			<div className="flex items-center gap-1 px-2 py-1.5">
				<button
					type="button"
					onClick={handleToggleSection}
					className="flex items-center gap-2 flex-1 min-w-0 px-2 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
					title={sectionExpanded ? content.collapseSection.value : content.expandSection.value}
					data-testid="sites-section-toggle"
				>
					<div className="w-6 h-6 flex items-center justify-center shrink-0">
						<Globe className="h-4 w-4" />
					</div>
					<span>{content.sites}</span>
					{sectionExpanded ? (
						<ChevronDown className="h-3 w-3 opacity-70" />
					) : (
						<ChevronRight className="h-3 w-3 opacity-70" />
					)}
				</button>

				<button
					type="button"
					onClick={handleCreateClick}
					className="p-2 rounded hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
					title={content.createSite.value}
					data-testid="create-site-button"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>
			{/* Sites List (when expanded) */}
			{sectionExpanded && (
				<div className="px-2 pb-2">
					{visibleSites.length === 0 ? (
						<div className="px-3 py-6 text-center">
							<div className="text-sm text-sidebar-foreground/70 mb-2">{content.emptyStateMessage}</div>
							<button
								type="button"
								onClick={handleCreateClick}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
								data-testid="create-site-empty-state"
							>
								<Plus className="h-4 w-4" />
								{content.createSiteButton}
							</button>
						</div>
					) : (
						<div className="space-y-0.5 pl-4">
							{visibleSites.map(site => {
								const isActive = site.id === siteId;
								const isSiteFavorite = isFavorite(site.id);
								const siteUrl = getSiteUrl(site);
								const hasUrl = Boolean(siteUrl);

								return (
									<div
										key={site.id}
										className={cn(
											"w-full flex items-center gap-0 rounded-md text-sm group",
											styles.item,
											isActive && styles.selected,
										)}
										data-testid={`site-${site.id}`}
									>
										<button
											type="button"
											onClick={() => handleSiteClick(site)}
											className="flex-1 flex items-center gap-2 px-2 py-1.5 min-w-0 cursor-pointer"
										>
											<SiteIcon name={site.displayName} size={5} />
											<span className="flex-1 truncate text-left">{site.displayName}</span>
										</button>

										{/* Auth status indicator */}
										<SiteAuthIndicator metadata={site.metadata} iconClassName="h-3 w-3" />

										{/* External link button */}
										{hasUrl && (
											<button
												type="button"
												onClick={e => handleOpenSite(e, site)}
												className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background/50 transition-opacity"
												title={content.openInNewTab.value}
												data-testid={`open-site-${site.id}`}
											>
												<ExternalLink className="h-3 w-3 text-sidebar-foreground/50" />
											</button>
										)}

										{/* Star button */}
										<button
											type="button"
											onClick={e => handleStarClick(e, site.id)}
											className={cn(
												"p-0.5 mr-1 rounded hover:bg-background/50 transition-opacity shrink-0",
												isSiteFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
											)}
											title={
												isSiteFavorite
													? content.removeFromFavorites.value
													: content.addToFavorites.value
											}
											data-testid={`star-site-${site.id}`}
										>
											<Star
												className={cn(
													"h-3 w-3",
													isSiteFavorite
														? "fill-current text-yellow-500"
														: "text-sidebar-foreground/50",
												)}
											/>
										</button>
									</div>
								);
							})}
						</div>
					)}

					{/* View All Sites Button - only shown when some sites are hidden */}
					{hasHiddenSites && (
						<button
							ref={viewAllButtonRef}
							type="button"
							onClick={handleViewAllClick}
							className={cn(
								"flex items-center gap-2 px-2 py-1.5 mt-1 ml-4 w-[calc(100%-1rem)] rounded-md text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
								showViewAll && "bg-sidebar-accent text-sidebar-accent-foreground",
							)}
							data-testid="view-all-sites-button"
						>
							<span className="flex-1 text-left">{content.viewAllSites}</span>
						</button>
					)}
				</div>
			)}
			{/* View All Dropdown - portaled to document.body */}
			{showViewAll && (
				<>
					{/* Backdrop to close dropdown */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setShowViewAll(false)}
						data-testid="view-all-backdrop"
					/>
					<ViewAllSitesDropdown
						collapsed={false}
						onSiteClick={handleSiteClick}
						triggerRef={viewAllButtonRef}
					/>
				</>
			)}
		</div>
	);
}
