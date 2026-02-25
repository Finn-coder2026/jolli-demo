/**
 * SpacesFavoritesList - Collapsible section displaying spaces in the unified sidebar.
 *
 * Uses a soft cap of 6 items: favorites are shown first (alphabetically), then
 * non-favorites fill remaining slots. If more than 6 favorites exist, all are shown.
 * "View all spaces" only appears when some spaces are hidden.
 */

import { cn } from "../../common/ClassNameUtils";
import { SpaceIcon } from "../../components/SpaceIcon";
import { useSpace } from "../../contexts/SpaceContext";
import { usePreference } from "../../hooks/usePreference";
import { PREFERENCES } from "../../services/preferences/PreferencesRegistry";
import { CreateSpaceDialog } from "../spaces/CreateSpaceDialog";
import styles from "./SidebarItem.module.css";
import { ViewAllSpacesDropdown } from "./ViewAllSpacesDropdown";
import type { Space } from "jolli-common";
import { ChevronDown, ChevronRight, Layers, Plus, Star } from "lucide-react";
import { type ReactElement, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface SpacesFavoritesListProps {
	/** Whether the sidebar is collapsed */
	collapsed: boolean;
	/** Optional callback when a space is clicked (called after switching) */
	onSpaceClick?: (space: Space) => void;
}

/** Collapsible spaces section for the unified sidebar with soft-cap display logic. */
export function SpacesFavoritesList({ collapsed, onSpaceClick }: SpacesFavoritesListProps): ReactElement {
	const content = useIntlayer("spaces-favorites-list");
	const { spaces, currentSpace, isFavorite, toggleSpaceFavorite, createSpace, switchSpace } = useSpace();
	const [sectionExpanded, setSectionExpanded] = usePreference(PREFERENCES.sidebarSpacesExpanded);
	const [showViewAll, setShowViewAll] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const viewAllButtonRef = useRef<HTMLButtonElement>(null);

	/** Soft cap for the number of spaces shown in the sidebar list. */
	const SOFT_CAP = 6;

	// Compute visible spaces: favorites first (alpha), then non-favorites (alpha), up to soft cap.
	// If more than SOFT_CAP favorites exist, all favorites are shown (soft cap is exceeded).
	const visibleSpaces = useMemo(() => {
		const nonPersonal = spaces.filter(s => !s.isPersonal);
		const favorited = nonPersonal.filter(s => isFavorite(s.id)).sort((a, b) => a.name.localeCompare(b.name));
		const nonFavorited = nonPersonal.filter(s => !isFavorite(s.id)).sort((a, b) => a.name.localeCompare(b.name));

		if (favorited.length === 0) {
			return nonFavorited.slice(0, SOFT_CAP);
		}
		if (favorited.length >= SOFT_CAP) {
			return favorited;
		}
		const remainingSlots = SOFT_CAP - favorited.length;
		return [...favorited, ...nonFavorited.slice(0, remainingSlots)];
	}, [spaces, isFavorite]);

	// "View all" only shows when there are non-personal spaces hidden from the sidebar list
	const hasHiddenSpaces = spaces.filter(s => !s.isPersonal).length > visibleSpaces.length;

	function handleToggleSection() {
		setSectionExpanded(!sectionExpanded);
	}

	async function handleSpaceClick(space: Space) {
		if (space.id !== currentSpace?.id) {
			await switchSpace(space.id);
		}
		onSpaceClick?.(space);
		setShowViewAll(false);
	}

	function handleStarClick(e: React.MouseEvent, spaceId: number) {
		e.stopPropagation();
		toggleSpaceFavorite(spaceId);
	}

	function handleCreateClick() {
		setShowCreateDialog(true);
	}

	async function handleCreateSpace(name: string, description?: string) {
		const newSpace = await createSpace(description ? { name, description } : { name }, true);
		setShowCreateDialog(false);
		// No need to call switchSpace here as createSpace with switchToNew=true already switched
		onSpaceClick?.(newSpace);
	}

	function handleCloseCreateDialog() {
		setShowCreateDialog(false);
	}

	function handleViewAllClick() {
		setShowViewAll(!showViewAll);
	}

	// Collapsed sidebar mode - show just icon with dropdown
	if (collapsed) {
		return (
			<div className="relative px-2 py-1" ref={containerRef} data-testid="favorite-spaces-list">
				<button
					type="button"
					onClick={handleViewAllClick}
					className="flex items-center justify-center w-full p-2 rounded-md hover:bg-accent transition-colors"
					title={content.spaces.value}
					data-testid="spaces-collapsed-trigger"
				>
					<Layers className="h-4 w-4" />
				</button>

				{showViewAll && (
					<>
						{/* Backdrop to close dropdown */}
						<div
							className="fixed inset-0 z-40"
							onClick={() => setShowViewAll(false)}
							data-testid="view-all-backdrop"
						/>
						<ViewAllSpacesDropdown
							collapsed={true}
							onSpaceClick={handleSpaceClick}
							triggerRef={containerRef}
						/>
					</>
				)}

				<CreateSpaceDialog
					open={showCreateDialog}
					onConfirm={handleCreateSpace}
					onClose={handleCloseCreateDialog}
				/>
			</div>
		);
	}

	// Expanded sidebar mode
	return (
		<div className="relative" ref={containerRef} data-testid="favorite-spaces-list">
			{/* Section Header */}
			<div className="flex items-center gap-1 px-2 py-1.5">
				<button
					type="button"
					onClick={handleToggleSection}
					className="flex items-center gap-2 flex-1 min-w-0 px-2 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
					title={sectionExpanded ? content.collapseSection.value : content.expandSection.value}
					data-testid="spaces-section-toggle"
				>
					<div className="w-6 h-6 flex items-center justify-center shrink-0">
						<Layers className="h-4 w-4" />
					</div>
					<span>{content.spaces}</span>
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
					title={content.createSpace.value}
					data-testid="create-space-button"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>

			{/* Spaces List (when expanded) */}
			{sectionExpanded && (
				<div className="px-2 pb-2">
					{visibleSpaces.length === 0 ? (
						<div className="px-3 py-6 text-center">
							<div className="text-sm text-sidebar-foreground/70 mb-2">{content.emptyStateMessage}</div>
							<button
								type="button"
								onClick={handleCreateClick}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
								data-testid="create-space-empty-state"
							>
								<Plus className="h-4 w-4" />
								{content.createSpaceButton}
							</button>
						</div>
					) : (
						<div className="space-y-0.5 pl-4">
							{visibleSpaces.map(space => {
								const isActive = space.id === currentSpace?.id;
								const isSpaceFavorite = isFavorite(space.id);

								return (
									<div
										key={space.id}
										className={cn(
											"w-full flex items-center gap-0 rounded-md text-sm group",
											styles.item,
											isActive && styles.selected,
										)}
										data-testid={`space-${space.id}`}
									>
										<button
											type="button"
											onClick={() => handleSpaceClick(space)}
											className="flex-1 flex items-center gap-2 px-2 py-1.5 min-w-0 cursor-pointer"
										>
											<SpaceIcon name={space.name} size={5} isPersonal={space.isPersonal} />
											<span className="flex-1 truncate text-left">{space.name}</span>
										</button>
										<button
											type="button"
											onClick={e => handleStarClick(e, space.id)}
											className={cn(
												"p-0.5 mr-1 rounded hover:bg-background/50 transition-opacity shrink-0",
												isSpaceFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
											)}
											title={
												isSpaceFavorite
													? content.removeFromFavorites.value
													: content.addToFavorites.value
											}
											data-testid={`star-space-${space.id}`}
										>
											<Star
												className={cn(
													"h-3 w-3",
													isSpaceFavorite
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

					{/* View All Spaces Button - only shown when some spaces are hidden */}
					{hasHiddenSpaces && (
						<button
							ref={viewAllButtonRef}
							type="button"
							onClick={handleViewAllClick}
							className={cn(
								"flex items-center gap-2 px-2 py-1.5 mt-1 ml-4 w-[calc(100%-1rem)] rounded-md text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
								showViewAll && "bg-sidebar-accent text-sidebar-accent-foreground",
							)}
							data-testid="view-all-spaces-button"
						>
							<span className="flex-1 text-left">{content.viewAllSpaces}</span>
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
					<ViewAllSpacesDropdown
						collapsed={false}
						onSpaceClick={handleSpaceClick}
						triggerRef={viewAllButtonRef}
					/>
				</>
			)}

			<CreateSpaceDialog
				open={showCreateDialog}
				onConfirm={handleCreateSpace}
				onClose={handleCloseCreateDialog}
			/>
		</div>
	);
}
