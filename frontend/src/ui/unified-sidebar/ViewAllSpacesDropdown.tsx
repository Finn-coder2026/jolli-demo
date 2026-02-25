/**
 * ViewAllSpacesDropdown - Dialog-like menu showing all spaces with search and favorites toggle.
 *
 * Features:
 * - Dialog-style centered overlay
 * - Search field to filter spaces
 * - Full list of all spaces with first letter avatar
 * - Star toggle to add/remove favorites
 * - Click row to toggle favorite
 */

import { cn } from "../../common/ClassNameUtils";
import { SpaceIcon } from "../../components/SpaceIcon";
import { Input } from "../../components/ui/Input";
import { useSpace } from "../../contexts/SpaceContext";
import type { Space } from "jolli-common";
import { Search, Star } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useIntlayer } from "react-intlayer";

export interface ViewAllSpacesDropdownProps {
	/** Callback when a space is clicked to navigate */
	onSpaceClick: (space: Space) => void;
	/** Whether the sidebar is in collapsed mode */
	collapsed: boolean;
	/** The trigger element for positioning (button or container div) */
	triggerRef: React.RefObject<HTMLElement | null>;
}

/**
 * Dialog component for viewing all spaces with search and favorites.
 */
export function ViewAllSpacesDropdown({
	onSpaceClick,
	collapsed: _collapsed,
	triggerRef,
}: ViewAllSpacesDropdownProps): ReactElement | null {
	const content = useIntlayer("spaces-favorites-list");
	const { spaces, currentSpace, isFavorite, toggleSpaceFavorite } = useSpace();
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

	// Filter and sort spaces by search query, keeping personal space pinned at top
	const { filteredPersonalSpace, filteredCompanySpaces } = useMemo(() => {
		const personal = spaces.find(s => s.isPersonal);
		const company = spaces.filter(s => !s.isPersonal).sort((a, b) => a.name.localeCompare(b.name));

		if (!searchQuery.trim()) {
			return { filteredPersonalSpace: personal, filteredCompanySpaces: company };
		}
		const query = searchQuery.toLowerCase();
		function matchesQuery(space: Space): boolean {
			return space.name.toLowerCase().includes(query) || space.slug.toLowerCase().includes(query);
		}
		return {
			filteredPersonalSpace: personal && matchesQuery(personal) ? personal : undefined,
			filteredCompanySpaces: company.filter(matchesQuery),
		};
	}, [spaces, searchQuery]);

	const hasResults = !!filteredPersonalSpace || filteredCompanySpaces.length > 0;

	function handleRowClick(space: Space) {
		// Always navigate when clicking the row, even for the current space
		onSpaceClick(space);
	}

	function handleStarClick(e: React.MouseEvent, spaceId: number) {
		e.stopPropagation();
		toggleSpaceFavorite(spaceId);
	}

	/** Renders a single space row with icon, name, and favorite star. */
	function renderSpaceRow(space: Space): ReactElement {
		const isActive = space.id === currentSpace?.id;
		const favorited = isFavorite(space.id);

		return (
			<div
				key={space.id}
				role="button"
				tabIndex={0}
				onClick={() => handleRowClick(space)}
				onKeyDown={e => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleRowClick(space);
					}
				}}
				className={cn(
					"w-full flex items-center gap-2 px-3 py-1.5 transition-colors group cursor-pointer",
					isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 hover:text-accent-foreground",
				)}
				data-testid={`all-spaces-item-${space.id}`}
			>
				<SpaceIcon name={space.name} size={5} isPersonal={space.isPersonal} />

				{/* Space name */}
				<span className="flex-1 truncate text-left text-sm">{space.name}</span>

				{/* Favorite star */}
				<button
					type="button"
					onClick={e => handleStarClick(e, space.id)}
					className={cn(
						"p-0.5 rounded hover:bg-background/50 transition-all flex-shrink-0",
						favorited ? "opacity-100" : "opacity-0 group-hover:opacity-100",
					)}
					title={favorited ? content.removeFromFavorites.value : content.addToFavorites.value}
					data-testid={`star-space-${space.id}`}
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
			data-testid="view-all-spaces-dropdown"
		>
			{/* Header */}
			<div className="px-3 py-2 border-b">
				<h2 className="text-sm font-semibold">{content.allSpaces}</h2>
			</div>

			{/* Search field */}
			<div className="px-3 py-2 border-b">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
					<Input
						type="text"
						placeholder={content.searchSpaces.value}
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
						className="pl-8 h-8 text-sm"
						data-testid="search-spaces-input"
					/>
				</div>
			</div>

			{/* Spaces list */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
				{!hasResults ? (
					<div className="px-3 py-8 text-center text-sm text-muted-foreground">
						{searchQuery.trim() ? content.noResults : content.noSpaces}
					</div>
				) : (
					<div className="py-1">
						{/* Personal space pinned at top */}
						{filteredPersonalSpace && renderSpaceRow(filteredPersonalSpace)}
						{filteredPersonalSpace && filteredCompanySpaces.length > 0 && (
							<div className="my-1 border-t border-border" />
						)}
						{/* Company spaces */}
						{filteredCompanySpaces.map(space => renderSpaceRow(space))}
					</div>
				)}
			</div>
		</div>
	);

	return createPortal(dropdown, document.body);
}
