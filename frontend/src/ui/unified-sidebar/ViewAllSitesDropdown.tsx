/**
 * ViewAllSitesDropdown - Dialog-like menu showing all sites with search and favorites toggle.
 *
 * Features:
 * - Dialog-style centered overlay
 * - Search field to filter sites
 * - Full list of all sites with first letter avatar
 * - Star toggle to add/remove favorites
 * - External link button to open site in new tab
 * - Click row to navigate to site
 */

import { cn } from "../../common/ClassNameUtils";
import { Input } from "../../components/ui/Input";
import { useNavigation } from "../../contexts/NavigationContext";
import { useSites } from "../../contexts/SitesContext";
import { getSiteColor } from "../../util/ColorUtils";
import { getSiteUrl } from "../../util/UrlUtil";
import { SiteAuthIndicator } from "./SiteAuthIndicator";
import type { SiteWithUpdate } from "jolli-common";
import { ExternalLink, Search, Star } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useIntlayer } from "react-intlayer";

export interface ViewAllSitesDropdownProps {
	/** Whether the sidebar is in collapsed mode */
	collapsed: boolean;
	/** Callback when a site is selected */
	onSiteClick: (site: SiteWithUpdate) => void;
	/** The trigger element for positioning (button or container div) */
	triggerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Dialog component for viewing all sites with search and favorites.
 */
export function ViewAllSitesDropdown({
	onSiteClick,
	collapsed: _collapsed,
	triggerRef,
}: ViewAllSitesDropdownProps): ReactElement | null {
	const content = useIntlayer("sites-favorites-list");
	const { siteId } = useNavigation();
	const { sites, isFavorite, toggleSiteFavorite } = useSites();
	const [searchQuery, setSearchQuery] = useState("");
	const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
	const dropdownHeight = 400; // maxHeight of dropdown

	// Calculate position based on trigger element, ensuring it stays within viewport
	useEffect(() => {
		if (triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			const viewportHeight = window.innerHeight;
			const spaceBelow = viewportHeight - rect.bottom;
			const spaceAbove = rect.top;

			let top: number;
			if (spaceBelow >= dropdownHeight) {
				// Enough space below - align to top of trigger
				top = rect.top;
			} else if (spaceAbove >= dropdownHeight) {
				// Not enough below, but enough above - position above trigger
				top = rect.bottom - dropdownHeight;
			} else {
				// Not enough space either way - fit to viewport with padding
				top = Math.max(8, viewportHeight - dropdownHeight - 8);
			}

			setPosition({
				top,
				left: rect.right + 8, // 8px gap from sidebar
			});
		}
	}, [triggerRef]);

	// Sort alphabetically (ignoring favorites) and filter by search query
	const filteredSites = useMemo(() => {
		const sorted = [...sites].sort((a, b) => a.displayName.localeCompare(b.displayName));
		if (!searchQuery.trim()) {
			return sorted;
		}
		const query = searchQuery.toLowerCase();
		return sorted.filter(
			site => site.name.toLowerCase().includes(query) || site.displayName.toLowerCase().includes(query),
		);
	}, [sites, searchQuery]);

	function handleRowClick(site: SiteWithUpdate) {
		// Navigate to the site when clicking the row
		if (site.id !== siteId) {
			onSiteClick(site);
		}
	}

	function handleStarClick(e: React.MouseEvent, siteId: number) {
		e.stopPropagation();
		toggleSiteFavorite(siteId);
	}

	function handleOpenSite(e: React.MouseEvent, site: SiteWithUpdate) {
		e.stopPropagation();
		const url = getSiteUrl(site);
		if (url) {
			window.open(url, "_blank");
		}
	}

	// Don't render until position is calculated to avoid flash at (0,0)
	if (!position) {
		return null;
	}

	const dropdown = (
		<div
			className="fixed bg-popover border rounded-lg shadow-lg z-50 flex flex-col"
			style={{
				top: `${position.top}px`,
				left: `${position.left}px`,
				width: "280px",
				maxWidth: "calc(100vw - 80px)",
				maxHeight: "400px",
			}}
			data-testid="view-all-sites-dropdown"
		>
			{/* Header */}
			<div className="px-3 py-2 border-b">
				<h2 className="text-sm font-semibold" data-testid="view-all-sites-title">
					{content.allSites}
				</h2>
			</div>

			{/* Search field */}
			<div className="px-3 py-2 border-b">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						type="text"
						placeholder={content.searchSites.value}
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
						className="pl-8 h-8 text-sm"
						data-testid="search-sites-input"
					/>
				</div>
			</div>

			{/* Sites list */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
				{filteredSites.length === 0 ? (
					<div
						className="px-3 py-8 text-center text-sm text-muted-foreground"
						data-testid={searchQuery.trim() ? "view-all-sites-no-results" : "view-all-sites-no-sites"}
					>
						{searchQuery.trim() ? content.noResults : content.noSites}
					</div>
				) : (
					<div className="py-1">
						{filteredSites.map(site => {
							const isActive = site.id === siteId;
							const favorited = isFavorite(site.id);
							const siteUrl = getSiteUrl(site);
							const hasUrl = Boolean(siteUrl);
							const firstLetter = site.displayName.charAt(0).toUpperCase();
							const colorClass = getSiteColor(site.displayName);

							return (
								<div
									key={site.id}
									role="button"
									tabIndex={0}
									onClick={() => handleRowClick(site)}
									onKeyDown={e => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleRowClick(site);
										}
									}}
									className={cn(
										"w-full flex items-center gap-2 px-3 py-1.5 transition-colors group cursor-pointer",
										isActive
											? "bg-accent text-accent-foreground"
											: "hover:bg-accent/50 hover:text-accent-foreground",
									)}
									data-testid={`all-sites-item-${site.id}`}
								>
									{/* First letter with colored block */}
									<div
										className={cn(
											"w-5 h-5 rounded flex items-center justify-center text-white font-semibold text-xs flex-shrink-0",
											colorClass,
										)}
									>
										{firstLetter}
									</div>

									{/* Site name */}
									<span
										className="flex-1 truncate text-left text-sm"
										data-testid={`all-sites-name-${site.id}`}
									>
										{site.displayName}
									</span>

									{/* Auth status indicator */}
									<SiteAuthIndicator metadata={site.metadata} iconClassName="h-3.5 w-3.5" />

									{/* External link button */}
									{hasUrl && (
										<button
											type="button"
											onClick={e => handleOpenSite(e, site)}
											className="p-0.5 rounded hover:bg-background/50 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100"
											title={content.openInNewTab.value}
											data-testid={`open-site-${site.id}`}
										>
											<ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
										</button>
									)}

									{/* Favorite star */}
									<button
										type="button"
										onClick={e => handleStarClick(e, site.id)}
										className={cn(
											"p-0.5 rounded hover:bg-background/50 transition-all flex-shrink-0",
											favorited ? "opacity-100" : "opacity-0 group-hover:opacity-100",
										)}
										title={
											favorited ? content.removeFromFavorites.value : content.addToFavorites.value
										}
										data-testid={`star-site-${site.id}`}
									>
										<Star
											className={cn(
												"h-3.5 w-3.5",
												favorited ? "fill-current text-yellow-500" : "text-muted-foreground",
											)}
										/>
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);

	return createPortal(dropdown, document.body);
}
