import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { ArticleTree } from "./ArticleTree";
import type { Doc, Space } from "jolli-common";
import { Check, ChevronDown, ChevronRight, Layers, Minus, Search } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface ArticlePickerProps {
	/** All available articles (including folders) */
	articles: Array<Doc>;
	/** Currently selected article JRNs (empty Set = none selected) */
	selectedJrns: Set<string>;
	/** Callback when selection changes */
	onSelectionChange: (jrns: Set<string>) => void;
	/** Whether "include all" mode is enabled */
	includeAll: boolean;
	/** Callback when include all mode changes */
	onIncludeAllChange: (includeAll: boolean) => void;
	/** Whether the component is in loading state */
	isLoading?: boolean;
	/** Whether the component is disabled */
	disabled?: boolean;
	/** Spaces for grouping articles */
	spaces?: Array<Space>;
	/** JRNs of articles that have pending changes (shows amber indicator) */
	changedJrns?: Set<string> | undefined;
}

/**
 * Gets all article JRNs for a space (both documents and folders since folders can have content)
 */
function getArticleJrnsForSpace(articles: Array<Doc>, spaceId: number | null): Array<string> {
	return articles.filter(a => (a.spaceId ?? null) === spaceId).map(a => a.jrn);
}

/** Space group with selection state */
interface SpaceGroup {
	id: number | null;
	name: string;
	articles: Array<Doc>;
	selectedCount: number;
	isFullySelected: boolean;
	isPartiallySelected: boolean;
}

/**
 * Article picker with collapsible space sections.
 * Each space can be selected/deselected as a whole, or expanded to select individual articles.
 */
export function ArticlePicker({
	articles,
	selectedJrns,
	onSelectionChange,
	includeAll,
	onIncludeAllChange,
	isLoading = false,
	disabled = false,
	spaces = [],
	changedJrns,
}: ArticlePickerProps): ReactElement {
	const content = useIntlayer("article-picker");
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedSpaces, setExpandedSpaces] = useState<Set<number | null>>(new Set());
	// Preserve the last manual selection when toggling include-all
	const [previousSelection, setPreviousSelection] = useState<Set<string>>(new Set());

	// Count all articles (including folders since they can have content)
	const totalArticleCount = articles.length;

	// Structural grouping of articles by space (does NOT depend on selectedJrns).
	// Only re-computes when articles or spaces change, not on every checkbox click.
	const structuralGroups = useMemo((): Array<
		Omit<SpaceGroup, "selectedCount" | "isFullySelected" | "isPartiallySelected">
	> => {
		// If no spaces provided, don't create any groups - show flat list instead
		if (spaces.length === 0) {
			return [];
		}

		const grouped = new Map<number | null, Array<Doc>>();

		// Initialize groups for all spaces
		for (const space of spaces) {
			grouped.set(space.id, []);
		}
		grouped.set(null, []); // For articles without a space

		// Distribute articles
		for (const article of articles) {
			const spaceId = article.spaceId ?? null;
			const group = grouped.get(spaceId);
			if (group) {
				group.push(article);
			} else {
				grouped.get(null)?.push(article);
			}
		}

		// Build structural groups (without selection state)
		const groups: Array<Omit<SpaceGroup, "selectedCount" | "isFullySelected" | "isPartiallySelected">> = [];

		for (const space of spaces) {
			const spaceArticles = grouped.get(space.id) || [];
			if (spaceArticles.length === 0) {
				continue;
			}
			groups.push({ id: space.id, name: space.name, articles: spaceArticles });
		}

		// Add "Other" group for articles without a space
		const noSpaceArticles = grouped.get(null) || [];
		if (noSpaceArticles.length > 0) {
			groups.push({ id: null, name: content.otherArticles.value, articles: noSpaceArticles });
		}

		return groups;
	}, [articles, spaces, content.otherArticles.value]);

	// Overlay selection state onto structural groups.
	// Only this memo re-runs on each checkbox click.
	const spaceGroups = useMemo((): Array<SpaceGroup> => {
		return structuralGroups.map(group => {
			const selectedCount = group.articles.filter(a => selectedJrns.has(a.jrn)).length;
			return {
				...group,
				selectedCount,
				isFullySelected: selectedCount === group.articles.length,
				isPartiallySelected: selectedCount > 0 && selectedCount < group.articles.length,
			};
		});
	}, [structuralGroups, selectedJrns]);

	// Toggle all articles for a space
	function handleSpaceCheckboxClick(spaceId: number | null, e: React.MouseEvent) {
		e.stopPropagation();
		const group = spaceGroups.find(g => g.id === spaceId);
		if (!group) {
			return;
		}

		const spaceJrns = getArticleJrnsForSpace(articles, spaceId);
		const newSelection = new Set(selectedJrns);

		if (group.isFullySelected) {
			// Deselect all in this space
			for (const jrn of spaceJrns) {
				newSelection.delete(jrn);
			}
		} else {
			// Select all in this space
			for (const jrn of spaceJrns) {
				newSelection.add(jrn);
			}
		}

		onSelectionChange(newSelection);

		// If we're in include-all mode, switch out of it
		if (includeAll) {
			onIncludeAllChange(false);
		}
	}

	// Toggle space expansion
	function handleSpaceExpandClick(spaceId: number | null) {
		setExpandedSpaces(prev => {
			const next = new Set(prev);
			if (next.has(spaceId)) {
				next.delete(spaceId);
			} else {
				next.add(spaceId);
			}
			return next;
		});
	}

	// Select all articles
	function handleSelectAll() {
		const allJrns = new Set(articles.map(a => a.jrn));
		onSelectionChange(allJrns);
		onIncludeAllChange(false);
	}

	// Handle include all toggle, preserving the previous manual selection
	function handleIncludeAllToggle() {
		if (includeAll) {
			// Switching FROM include-all: restore previous selection (or select all if none saved)
			if (previousSelection.size > 0) {
				onSelectionChange(new Set(previousSelection));
			} else {
				onSelectionChange(new Set(articles.map(a => a.jrn)));
			}
			onIncludeAllChange(false);
		} else {
			// Switching TO include-all: save current selection for later restoration
			setPreviousSelection(new Set(selectedJrns));
			onIncludeAllChange(true);
			onSelectionChange(new Set());
		}
	}

	function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSearchQuery(e.target.value);
	}

	if (isLoading) {
		return (
			<div className="space-y-3" data-testid="article-picker-loading">
				{/* Include all toggle skeleton */}
				<Skeleton className="h-12 w-full rounded-lg" />
				{/* Space group skeletons */}
				<div className="space-y-1.5">
					<Skeleton className="h-11 w-full rounded-lg" />
					<Skeleton className="h-11 w-full rounded-lg" />
					<Skeleton className="h-11 w-full rounded-lg" />
				</div>
			</div>
		);
	}

	// Render a space group section
	function renderSpaceGroup(group: SpaceGroup): ReactElement {
		const isExpanded = expandedSpaces.has(group.id);
		const checkboxState =
			includeAll || group.isFullySelected ? "checked" : group.isPartiallySelected ? "partial" : "unchecked";
		// Count changed articles in this space group (for amber indicator on collapsed headers)
		const changedCount = changedJrns ? group.articles.filter(a => changedJrns.has(a.jrn)).length : 0;

		return (
			<div
				key={group.id ?? "other"}
				className="border rounded-lg overflow-hidden"
				data-testid={`space-group-${group.id ?? "other"}`}
			>
				{/* Space header row */}
				<div
					role="button"
					tabIndex={disabled || includeAll ? -1 : 0}
					onClick={() => !disabled && !includeAll && handleSpaceExpandClick(group.id)}
					onKeyDown={e => {
						if ((e.key === "Enter" || e.key === " ") && !disabled && !includeAll) {
							e.preventDefault();
							handleSpaceExpandClick(group.id);
						}
					}}
					className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
						includeAll ? "opacity-60" : "cursor-pointer hover:bg-muted/30"
					} ${disabled ? "cursor-default" : ""}`}
					data-testid={`space-header-${group.id ?? "other"}`}
				>
					{/* Expand/collapse chevron */}
					<div className="flex-shrink-0">
						{isExpanded ? (
							<ChevronDown className="h-4 w-4 text-muted-foreground/50" />
						) : (
							<ChevronRight className="h-4 w-4 text-muted-foreground/50" />
						)}
					</div>

					{/* Checkbox */}
					<button
						type="button"
						onClick={e => handleSpaceCheckboxClick(group.id, e)}
						disabled={disabled || includeAll}
						className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
							checkboxState === "checked"
								? "bg-primary border-primary"
								: checkboxState === "partial"
									? "bg-primary/50 border-primary"
									: "border-muted-foreground/30 hover:border-muted-foreground/50"
						}`}
						data-testid={`space-checkbox-${group.id ?? "other"}`}
					>
						{checkboxState === "checked" && <Check className="h-3 w-3 text-primary-foreground" />}
						{checkboxState === "partial" && <Minus className="h-3 w-3 text-primary-foreground" />}
					</button>

					{/* Space icon and name */}
					<Layers className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
					<span className="flex-1 text-sm font-medium truncate">{group.name}</span>

					{/* Count + changed indicator */}
					<span className="text-xs text-muted-foreground/70 flex-shrink-0 flex items-center gap-1.5">
						{includeAll ? group.articles.length : `${group.selectedCount}/${group.articles.length}`}
						{changedCount > 0 && !isExpanded && (
							<span
								className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0"
								title={content.changedCount({ count: String(changedCount) }).value}
								data-testid={`space-changed-indicator-${group.id ?? "other"}`}
							/>
						)}
					</span>
				</div>

				{/* Expanded article tree */}
				{isExpanded && !includeAll && (
					<div className="border-t bg-muted/10">
						<ArticleTree
							articles={group.articles}
							selectedJrns={selectedJrns}
							onSelectionChange={onSelectionChange}
							searchQuery={searchQuery}
							disabled={disabled}
							changedJrns={changedJrns}
						/>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-3" data-testid="article-picker">
			{/* Include all toggle */}
			<button
				type="button"
				onClick={handleIncludeAllToggle}
				disabled={disabled}
				className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
					includeAll ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50"
				}`}
				data-testid="include-all-toggle"
			>
				<div
					className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
						includeAll ? "bg-primary border-primary" : "border-muted-foreground/30"
					}`}
				>
					{includeAll && <Check className="h-3 w-3 text-primary-foreground" />}
				</div>
				<div className="flex-1">
					<span className="text-sm font-medium">{content.includeAllArticles}</span>
				</div>
				<span className="text-xs text-muted-foreground">{totalArticleCount}</span>
			</button>

			{/* Search and bulk actions (when not including all) */}
			{!includeAll && (
				<div className="space-y-2">
					{/* Search */}
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
						<Input
							value={searchQuery}
							onChange={handleSearchChange}
							placeholder={content.searchArticles.value}
							className="pl-9 h-9"
							disabled={disabled}
							data-testid="article-search-input"
						/>
					</div>

					{/* Selection count and bulk actions */}
					<div className="flex items-center justify-between px-1">
						<span className="text-xs text-muted-foreground" data-testid="selection-count">
							{selectedJrns.size} {content.articlesOf} {totalArticleCount} {content.articlesSelected}
						</span>
						<div className="flex items-center gap-1 text-xs">
							<button
								type="button"
								className="px-2 py-1 rounded hover:bg-muted disabled:opacity-50 transition-colors text-muted-foreground hover:text-foreground"
								onClick={handleSelectAll}
								disabled={disabled || selectedJrns.size === totalArticleCount}
								data-testid="select-all-button"
							>
								{content.selectAll}
							</button>
							<span className="text-muted-foreground/40">·</span>
							<button
								type="button"
								className="px-2 py-1 rounded hover:bg-muted disabled:opacity-50 transition-colors text-muted-foreground hover:text-foreground"
								onClick={() => onSelectionChange(new Set())}
								disabled={disabled || selectedJrns.size === 0}
								data-testid="deselect-all-button"
							>
								{content.deselectAll}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Space sections */}
			{spaceGroups.length > 0 ? (
				<div className="space-y-1.5 max-h-[45vh] overflow-y-auto scrollbar-thin" data-testid="space-groups">
					{spaceGroups.map(group => renderSpaceGroup(group))}
				</div>
			) : (
				// No spaces - show flat article tree
				!includeAll && (
					<div
						className="border rounded-lg max-h-[40vh] overflow-y-auto scrollbar-thin"
						data-testid="article-list"
					>
						<ArticleTree
							articles={articles}
							selectedJrns={selectedJrns}
							onSelectionChange={onSelectionChange}
							searchQuery={searchQuery}
							disabled={disabled}
							changedJrns={changedJrns}
						/>
					</div>
				)
			)}
		</div>
	);
}
