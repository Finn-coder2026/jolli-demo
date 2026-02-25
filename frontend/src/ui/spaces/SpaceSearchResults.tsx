import { cn } from "../../common/ClassNameUtils";
import { Empty } from "../../components/ui/Empty";
import { Skeleton } from "../../components/ui/Skeleton";
import { useClient } from "../../contexts/ClientContext";
import { getLog } from "../../util/Logger";
import { SPACE_SEARCH_MAX_RESULTS, type SpaceSearchResult } from "jolli-common";
import { FileText, Folder, Search } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

export interface SpaceSearchResultsProps {
	spaceId: number | undefined;
	query: string;
	onResultClick: (docId: number) => void;
	selectedDocId?: number | undefined;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/**
 * Sanitizes HTML from ts_headline by escaping all HTML except <b> tags.
 * This prevents XSS attacks while preserving search term highlighting.
 */
function sanitizeHeadlineHtml(html: string): string {
	// First, temporarily replace <b> and </b> with placeholders
	const BOLD_OPEN = "\u0000BOLD_OPEN\u0000";
	const BOLD_CLOSE = "\u0000BOLD_CLOSE\u0000";

	let sanitized = html.replace(/<b>/gi, BOLD_OPEN).replace(/<\/b>/gi, BOLD_CLOSE);

	// Escape all HTML characters
	sanitized = escapeHtml(sanitized);

	// Restore <b> tags
	sanitized = sanitized.replace(new RegExp(escapeRegex(BOLD_OPEN), "g"), "<b>");
	sanitized = sanitized.replace(new RegExp(escapeRegex(BOLD_CLOSE), "g"), "</b>");

	return sanitized;
}

/**
 * Highlights search terms in text.
 * If HTML contains <b> tags (from ts_headline), sanitizes and renders as HTML.
 * Otherwise, manually highlights the query term.
 */
function highlightText(html: string, query: string): ReactElement {
	if (!query || !html) {
		return <>{html}</>;
	}

	// If already contains <b> tags (from ts_headline), sanitize and render as HTML
	if (html.includes("<b>")) {
		const sanitized = sanitizeHeadlineHtml(html);
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - HTML is sanitized by sanitizeHeadlineHtml, only <b> tags allowed
		return <span dangerouslySetInnerHTML={{ __html: sanitized }} />;
	}

	// Otherwise, manually highlight
	const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
	const parts = html.split(regex);

	return (
		<>
			{parts.map((part, i) =>
				regex.test(part) ? (
					<mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded">
						{part}
					</mark>
				) : (
					<span key={i}>{part}</span>
				),
			)}
		</>
	);
}

export function SpaceSearchResults({
	spaceId,
	query,
	onResultClick,
	selectedDocId,
}: SpaceSearchResultsProps): ReactElement {
	const content = useIntlayer("space-search");
	const client = useClient();
	const [results, setResults] = useState<Array<SpaceSearchResult>>([]);
	const [total, setTotal] = useState(0);
	const [limited, setLimited] = useState(false);
	const [loading, setLoading] = useState(false);

	// Perform search when query changes
	// Uses cancelled flag to ignore stale results from older requests
	useEffect(() => {
		let cancelled = false;

		async function performSearch() {
			if (!spaceId || !query.trim()) {
				setResults([]);
				setTotal(0);
				setLimited(false);
				return;
			}

			setLoading(true);
			try {
				const response = await client.spaces().searchInSpace(spaceId, query);
				// Ignore result if a newer search has been triggered
				if (cancelled) {
					return;
				}
				setResults(response.results);
				setTotal(response.total);
				setLimited(response.limited);
			} catch (error) {
				// Ignore error if a newer search has been triggered
				if (cancelled) {
					return;
				}
				log.error(error, "Search failed for space %d with query '%s'", spaceId, query);
				setResults([]);
				setTotal(0);
				setLimited(false);
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		performSearch();

		return () => {
			cancelled = true;
		};
	}, [spaceId, query, client]);

	// Loading state
	if (loading) {
		return (
			<div className="flex-1 overflow-hidden p-2" data-testid="space-search-loading">
				<div className="space-y-2">
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
				</div>
			</div>
		);
	}

	// Empty results
	if (!loading && results.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-4" data-testid="space-search-empty">
				<Empty
					icon={<Search className="h-12 w-12" />}
					title={String(content.noResults.value)}
					description={String(content.noResultsDescription.value)}
				/>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col overflow-hidden" data-testid="space-search-results">
			{/* Result count */}
			<div
				className="px-3 py-2 text-xs text-muted-foreground font-medium flex-shrink-0"
				data-testid="space-search-count"
			>
				{total} {total === 1 ? content.result : content.results}
				{limited && (
					<span className="ml-2 text-yellow-600 dark:text-yellow-400">
						({content.showingFirstN({ count: SPACE_SEARCH_MAX_RESULTS })})
					</span>
				)}
			</div>

			{/* Results list */}
			<div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin" data-testid="space-search-list">
				{results.map(result => {
					const title = (result.doc.contentMetadata as { title?: string } | undefined)?.title || "Untitled";
					const isSelected = result.doc.id === selectedDocId;

					return (
						<button
							key={result.doc.id}
							onClick={() => onResultClick(result.doc.id)}
							className={cn(
								"w-full p-1 text-left rounded hover:bg-accent transition-colors",
								isSelected && "bg-accent",
							)}
							data-testid={`search-result-${result.doc.id}`}
						>
							<div className="flex items-start gap-2">
								{/* Icon */}
								{result.doc.docType === "folder" ? (
									<Folder className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
								) : (
									<FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
								)}

								{/* Content */}
								<div className="flex-1 min-w-0">
									{/* Title */}
									<div className="font-medium text-sm truncate">{highlightText(title, query)}</div>

									{/* Content snippet */}
									{result.contentSnippet && (
										<div className="text-xs text-muted-foreground mt-1 line-clamp-2">
											{highlightText(result.contentSnippet, query)}
										</div>
									)}
								</div>
							</div>
						</button>
					);
				})}

				{/* Bottom message when results are limited */}
				{limited && (
					<div
						className="px-2 py-3 text-xs text-muted-foreground text-center italic"
						data-testid="space-search-limited-message"
					>
						{content.resultsLimited}
					</div>
				)}
			</div>
		</div>
	);
}
