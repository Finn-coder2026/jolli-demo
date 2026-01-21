import { Input } from "../../components/ui/Input";
import type { Doc } from "jolli-common";
import { Check, FileText, Search } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface ArticlePickerProps {
	/** All available articles */
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
}

/**
 * Gets the display title for an article
 */
export function getArticleTitle(article: Doc): string {
	return article.contentMetadata?.title || article.jrn;
}

/**
 * Filters articles based on search query
 */
export function filterArticles(articles: Array<Doc>, query: string): Array<Doc> {
	if (!query.trim()) {
		return articles;
	}
	const lowerQuery = query.toLowerCase();
	return articles.filter(article => {
		const title = getArticleTitle(article).toLowerCase();
		const jrn = article.jrn.toLowerCase();
		return title.includes(lowerQuery) || jrn.includes(lowerQuery);
	});
}

/**
 * Article picker with clean toggle between "All" and "Select" modes.
 * Uses visual selection indicators for a modern UX.
 */
export function ArticlePicker({
	articles,
	selectedJrns,
	onSelectionChange,
	includeAll,
	onIncludeAllChange,
	isLoading = false,
	disabled = false,
}: ArticlePickerProps): ReactElement {
	const content = useIntlayer("article-picker");
	const [searchQuery, setSearchQuery] = useState("");

	// Filter articles based on search
	const filteredArticles = useMemo(() => filterArticles(articles, searchQuery), [articles, searchQuery]);

	function handleArticleToggle(jrn: string) {
		const newSelection = new Set(selectedJrns);
		if (newSelection.has(jrn)) {
			newSelection.delete(jrn);
		} else {
			newSelection.add(jrn);
		}
		onSelectionChange(newSelection);
	}

	function handleSelectAll() {
		const allJrns = new Set(articles.map(a => a.jrn));
		onSelectionChange(allJrns);
	}

	function handleDeselectAll() {
		onSelectionChange(new Set());
	}

	function handleModeChange(newIncludeAll: boolean) {
		onIncludeAllChange(newIncludeAll);
		// When switching to specific selection, default to all selected
		if (!newIncludeAll && selectedJrns.size === 0) {
			handleSelectAll();
		}
	}

	function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSearchQuery(e.target.value);
	}

	if (isLoading) {
		return (
			<div className="p-4 text-center text-muted-foreground" data-testid="article-picker-loading">
				{content.loadingArticles}
			</div>
		);
	}

	return (
		<div className="space-y-4" data-testid="article-picker">
			{/* Mode toggle - segmented control */}
			<div
				className="inline-flex p-1 bg-muted rounded-lg"
				role="radiogroup"
				aria-label="Article selection mode"
				data-testid="mode-toggle"
			>
				<button
					type="button"
					role="radio"
					aria-checked={includeAll}
					onClick={() => handleModeChange(true)}
					disabled={disabled}
					className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
						includeAll
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
					data-testid="mode-all-button"
				>
					{content.includeAllArticles}
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={!includeAll}
					onClick={() => handleModeChange(false)}
					disabled={disabled}
					className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
						!includeAll
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
					data-testid="mode-select-button"
				>
					{content.selectSpecificArticles}
				</button>
			</div>

			{/* Include all mode - summary card */}
			{includeAll && (
				<div
					className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border"
					data-testid="include-all-info"
				>
					<div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
						<FileText className="h-5 w-5 text-primary" />
					</div>
					<div>
						<div className="font-medium">
							{articles.length} {content.articlesSelected}
						</div>
						<p className="text-sm text-muted-foreground">{content.allArticlesInfo}</p>
					</div>
				</div>
			)}

			{/* Select specific mode - article list */}
			{!includeAll && (
				<div className="space-y-3">
					{/* Search and bulk actions row */}
					<div className="flex items-center gap-3">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={searchQuery}
								onChange={handleSearchChange}
								placeholder={content.searchArticles.value}
								className="pl-9"
								disabled={disabled}
								data-testid="article-search-input"
							/>
						</div>
						<div className="flex items-center gap-1 text-xs">
							<button
								type="button"
								className="px-2 py-1 rounded hover:bg-muted disabled:opacity-50 transition-colors"
								onClick={handleSelectAll}
								disabled={disabled || selectedJrns.size === articles.length}
								data-testid="select-all-button"
							>
								{content.selectAll}
							</button>
							<span className="text-muted-foreground">·</span>
							<button
								type="button"
								className="px-2 py-1 rounded hover:bg-muted disabled:opacity-50 transition-colors"
								onClick={handleDeselectAll}
								disabled={disabled || selectedJrns.size === 0}
								data-testid="deselect-all-button"
							>
								{content.deselectAll}
							</button>
						</div>
					</div>

					{/* Selection count */}
					<div className="text-sm text-muted-foreground" data-testid="selection-count">
						{selectedJrns.size} {content.articlesOf} {articles.length} {content.articlesSelected}
					</div>

					{/* Article list */}
					<div className="max-h-[40vh] overflow-y-auto border rounded-lg divide-y" data-testid="article-list">
						{filteredArticles.length === 0 ? (
							<div className="p-6 text-sm text-center text-muted-foreground" data-testid="no-articles">
								{searchQuery ? content.noArticlesMatchSearch : content.noArticlesFound}
							</div>
						) : (
							filteredArticles.map(article => {
								const isSelected = selectedJrns.has(article.jrn);
								return (
									<button
										key={article.jrn}
										type="button"
										onClick={() => handleArticleToggle(article.jrn)}
										disabled={disabled}
										className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
											isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
										}`}
										data-testid={`article-item-${article.jrn}`}
									>
										{/* Selection indicator */}
										<div
											className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
												isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
											}`}
											data-testid={`article-checkbox-${article.jrn}`}
										>
											{isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
										</div>
										{/* Article title */}
										<span className="text-sm font-medium truncate">{getArticleTitle(article)}</span>
									</button>
								);
							})
						)}
					</div>
				</div>
			)}
		</div>
	);
}
