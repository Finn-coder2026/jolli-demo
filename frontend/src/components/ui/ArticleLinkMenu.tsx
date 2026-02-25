import type { useEditor } from "@tiptap/react";
import type { ArticleLinkSearchResult } from "jolli-common";
import debounce from "lodash.debounce";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { useIntlayer } from "react-intlayer";
import { useClient } from "@/contexts/ClientContext";
import { useCurrentSpace } from "@/contexts/SpaceContext";

export interface ArticleLinkMenuProps {
	/** The Tiptap editor instance */
	editor: NonNullable<ReturnType<typeof useEditor>>;
	/** Whether the menu is currently active/visible */
	active: boolean;
	/** The current search query (text typed after [[) */
	query: string;
	/** Callback to close the menu */
	onClose: () => void;
	/** Callback when an article is selected (click or Enter) */
	onSelect: (result: ArticleLinkSearchResult) => void;
}

/* v8 ignore start -- Tiptap floating menu component, requires full editor instance to test */
/**
 * Highlights occurrences of `query` within `text` by wrapping them
 * in <mark> elements. Returns an array of React nodes.
 */
function highlightMatch(text: string, query: string): Array<React.ReactNode> {
	if (!query) {
		return [text];
	}

	const lowerText = text.toLowerCase();
	const lowerQuery = query.toLowerCase();
	const parts: Array<React.ReactNode> = [];
	let lastIndex = 0;

	let matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
	while (matchIndex !== -1) {
		if (matchIndex > lastIndex) {
			parts.push(text.slice(lastIndex, matchIndex));
		}
		parts.push(
			<mark key={matchIndex} className="article-link-menu-highlight">
				{text.slice(matchIndex, matchIndex + query.length)}
			</mark>,
		);
		lastIndex = matchIndex + query.length;
		matchIndex = lowerText.indexOf(lowerQuery, lastIndex);
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts;
}

/**
 * Extracts a display title from a Doc's contentMetadata or slug.
 */
function getDisplayTitle(result: ArticleLinkSearchResult): string {
	return result.contentMetadata?.title || result.slug.replace(/-/g, " ");
}

/**
 * ArticleLinkMenu - Floating menu that appears when user types `[[`.
 * Searches articles by title and displays results with keyword highlighting.
 */
export function ArticleLinkMenu({
	editor,
	active,
	query,
	onClose,
	onSelect,
}: ArticleLinkMenuProps): React.ReactElement | null {
	const menuRef = React.useRef<HTMLDivElement>(null);
	const client = useClient();
	const currentSpace = useCurrentSpace();
	const content = useIntlayer("article-link-menu");

	const [results, setResults] = React.useState<Array<ArticleLinkSearchResult>>([]);
	const [loading, setLoading] = React.useState(false);
	const [selectedIndex, setSelectedIndex] = React.useState(0);

	// Reset selection when results change
	React.useEffect(() => {
		setSelectedIndex(0);
	}, [results]);

	// Debounced fetch to avoid flooding the backend while the user types
	const debouncedFetch = React.useMemo(
		() =>
			debounce(async (q: string, spaceId: number | undefined, signal: { cancelled: boolean }) => {
				try {
					const data = await client.docs().searchArticlesForLink(q, spaceId);
					if (!signal.cancelled) {
						setResults(data);
					}
				} catch (error: unknown) {
					if (!signal.cancelled) {
						console.error("Failed to search articles for link:", error);
						setResults([]);
					}
				} finally {
					if (!signal.cancelled) {
						setLoading(false);
					}
				}
			}, 200),
		[client],
	);

	// Cancel debounce on unmount
	React.useEffect(() => {
		return () => {
			debouncedFetch.cancel();
		};
	}, [debouncedFetch]);

	// Fetch results when query or active changes
	React.useEffect(() => {
		if (!active) {
			return;
		}

		const signal = { cancelled: false };
		setLoading(true);
		debouncedFetch(query, currentSpace?.id, signal);

		return () => {
			signal.cancelled = true;
			debouncedFetch.cancel();
		};
	}, [active, query, debouncedFetch, currentSpace?.id]);

	// Close menu on click outside
	React.useEffect(() => {
		if (!active) {
			return;
		}

		function handleMouseDown(event: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		}

		document.addEventListener("mousedown", handleMouseDown);
		return () => {
			document.removeEventListener("mousedown", handleMouseDown);
		};
	}, [active, onClose]);

	// Scroll selected item into view when navigating with keyboard
	const selectedItemRef = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		selectedItemRef.current?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	// Keyboard navigation: capture ArrowUp / ArrowDown / Enter before ProseMirror handles them
	const selectedIndexRef = React.useRef(selectedIndex);
	selectedIndexRef.current = selectedIndex;

	// Close menu on Escape (works regardless of results)
	React.useEffect(() => {
		if (!active) {
			return;
		}

		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onClose();
			}
		}

		const editorDom = editor.view.dom;
		editorDom.addEventListener("keydown", handleEscape, true);
		return () => {
			editorDom.removeEventListener("keydown", handleEscape, true);
		};
	}, [active, editor.view.dom, onClose]);

	// Keyboard navigation: capture ArrowUp / ArrowDown / Enter before ProseMirror handles them
	React.useEffect(() => {
		if (!active || results.length === 0) {
			return;
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				event.stopPropagation();
				setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				event.stopPropagation();
				setSelectedIndex(prev => Math.max(prev - 1, 0));
			} else if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				const selected = results[selectedIndexRef.current];
				if (selected) {
					onSelect(selected);
				}
			}
		}

		// Use capture phase so we intercept before ProseMirror's key handling
		const editorDom = editor.view.dom;
		editorDom.addEventListener("keydown", handleKeyDown, true);
		return () => {
			editorDom.removeEventListener("keydown", handleKeyDown, true);
		};
	}, [active, results, editor.view.dom, onSelect]);

	if (!active) {
		return null;
	}

	// Calculate position during render to avoid initial flash at {0,0}
	let top = 0;
	let left = 0;
	try {
		const coords = editor.view.coordsAtPos(editor.state.selection.from);
		top = coords.bottom + 4;
		left = coords.left;
	} catch {
		// Position calculation can fail if the editor DOM is not ready
	}

	return (
		<div ref={menuRef} className="article-link-menu" style={{ top, left }} data-testid="article-link-menu">
			{loading && results.length === 0 && (
				<div className="article-link-menu-loading" data-testid="article-link-menu-loading">
					<Loader2 className="h-4 w-4 animate-spin" />
				</div>
			)}
			{!loading && results.length === 0 && (
				<div className="article-link-menu-empty" data-testid="article-link-menu-empty">
					{query ? content.noMatchingArticles : content.noArticlesFound}
				</div>
			)}
			{results.length > 0 && (
				<div data-testid="article-link-menu-results">
					{results.map((result, index) => {
						const title = getDisplayTitle(result);
						const isSelected = index === selectedIndex;
						return (
							<button
								key={result.id}
								ref={isSelected ? selectedItemRef : undefined}
								type="button"
								className={`article-link-menu-item${isSelected ? " article-link-menu-item-selected" : ""}`}
								data-testid="article-link-menu-item"
								onMouseEnter={() => setSelectedIndex(index)}
								onClick={() => onSelect(result)}
							>
								<div className="article-link-menu-item-title">{highlightMatch(title, query)}</div>
								{result.parentFolderName && (
									<div className="article-link-menu-item-path">{result.parentFolderName}</div>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
/* v8 ignore stop */
