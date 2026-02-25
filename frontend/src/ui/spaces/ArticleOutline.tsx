import { ChevronRight } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntlayer } from "react-intlayer";
import { cn } from "@/common/ClassNameUtils";

/** Delay before hiding the outline overlay after mouse-leave (ms).
 *  Longer than the FloatingToolbar's delay to give users time to move
 *  from the narrow bars column into the wider overlay panel. */
const HIDE_DELAY_MS = 300;

export interface OutlineHeading {
	id: string;
	text: string;
	level: 1 | 2 | 3 | 4;
}

interface ArticleOutlineProps {
	/** Headings extracted from the editor DOM */
	headings: Array<OutlineHeading>;
	/** ID of the heading currently in view */
	activeHeadingId: string | null;
	/** Callback when a heading is clicked */
	onHeadingClick: (id: string) => void;
}

/**
 * Minimized article outline / table of contents — small colored bars
 * representing H1/H2 heading structure. Hover to show a portal-rendered
 * popover with all heading levels (H1-H4). Click any bar or heading to
 * scroll to that section.
 *
 * Bars are right-aligned within the column. The expanded overlay renders
 * via a React portal to escape parent overflow:hidden containers that
 * would otherwise clip it to zero width.
 */
export function ArticleOutline({
	headings,
	activeHeadingId,
	onHeadingClick,
}: ArticleOutlineProps): ReactElement | null {
	const content = useIntlayer("article-outline");
	const [expanded, setExpanded] = useState(false);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const barsRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);
	const [overlayPos, setOverlayPos] = useState<{ top: number; left: number } | null>(null);

	/** Only H1/H2 headings are shown as bars in the minimized view. */
	const barHeadings = headings.filter(h => h.level <= 2);

	/** Recalculate overlay position whenever it becomes visible or the window resizes. */
	useEffect(() => {
		if (!expanded || !barsRef.current) {
			return;
		}
		function updatePos() {
			if (barsRef.current) {
				const rect = barsRef.current.getBoundingClientRect();
				// Position the overlay's top-right corner at the bars' top-right
				setOverlayPos({ top: rect.top, left: rect.right });
			}
		}
		updatePos();
		window.addEventListener("resize", updatePos);
		return () => window.removeEventListener("resize", updatePos);
	}, [expanded]);

	const showOverlay = useCallback(() => {
		clearTimeout(hideTimeoutRef.current);
		setExpanded(true);
	}, []);

	const hideOverlay = useCallback(() => {
		hideTimeoutRef.current = setTimeout(() => setExpanded(false), HIDE_DELAY_MS);
	}, []);

	/** Keep overlay open when mouse moves from bars into the overlay. */
	const handleOverlayMouseEnter = useCallback(() => {
		clearTimeout(hideTimeoutRef.current);
	}, []);

	if (headings.length === 0) {
		return null;
	}

	return (
		<>
			{/* Minimized bars — only H1/H2, right-aligned within the column. */}
			<div
				ref={barsRef}
				className="w-fit ml-auto"
				onMouseEnter={showOverlay}
				onMouseLeave={hideOverlay}
				onFocus={showOverlay}
				onBlur={hideOverlay}
				tabIndex={0}
				data-testid="article-outline"
			>
				<div className="flex flex-col items-end gap-2 py-1 px-1 cursor-pointer">
					{barHeadings.map(heading => (
						<button
							key={heading.id}
							type="button"
							onClick={() => onHeadingClick(heading.id)}
							title={heading.text}
							aria-label={heading.text}
							className={cn(
								"rounded-full transition-all duration-200 h-1",
								heading.level === 1 ? "w-6" : "w-4",
								activeHeadingId === heading.id
									? "bg-primary"
									: "bg-border hover:bg-muted-foreground/50",
							)}
							data-testid={`outline-bar-${heading.id}`}
						/>
					))}
				</div>
			</div>

			{/* Portal-rendered overlay — all heading levels (H1-H4). */}
			{expanded &&
				overlayPos &&
				createPortal(
					<div
						ref={overlayRef}
						className="fixed z-50"
						style={{ top: overlayPos.top, left: overlayPos.left }}
						onMouseEnter={handleOverlayMouseEnter}
						onMouseLeave={hideOverlay}
						data-testid="article-outline-expanded"
					>
						<div className="bg-popover border border-border rounded-lg shadow-md overflow-hidden min-w-[200px]">
							<div className="px-3 py-2 border-b border-border">
								<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									{content.onThisPage}
								</span>
							</div>
							<nav className="p-1.5 max-h-[60vh] overflow-y-auto scrollbar-thin">
								<ul className="space-y-0.5">
									{headings.map(heading => (
										<li key={heading.id}>
											<button
												type="button"
												onClick={() => {
													onHeadingClick(heading.id);
													setExpanded(false);
												}}
												className={cn(
													"w-full text-left text-sm py-1.5 px-2 rounded-md transition-colors",
													"flex items-center gap-1.5 whitespace-nowrap",
													heading.level === 1 && "font-semibold",
													heading.level === 3 && "pl-5 text-xs",
													heading.level === 4 && "pl-8 text-xs",
													activeHeadingId === heading.id
														? "text-primary bg-primary/10 font-medium"
														: "text-muted-foreground hover:text-foreground hover:bg-muted",
												)}
												data-testid={`outline-item-${heading.id}`}
											>
												<ChevronRight
													className={cn(
														"h-3 w-3 shrink-0 transition-colors",
														activeHeadingId === heading.id ? "opacity-100" : "opacity-50",
													)}
												/>
												<span className="truncate max-w-[220px]">{heading.text}</span>
											</button>
										</li>
									))}
								</ul>
							</nav>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}

/**
 * Extracts heading elements (h1-h4) from the TipTap editor DOM.
 * Returns stable heading objects with IDs derived from text content.
 * Always sets the element ID to ensure scroll-to-heading navigation works.
 */
export function extractHeadingsFromEditor(editorDom: HTMLElement | null): Array<OutlineHeading> {
	if (!editorDom) {
		return [];
	}

	const levelMap: Record<string, OutlineHeading["level"]> = { H1: 1, H2: 2, H3: 3, H4: 4 };
	const headings: Array<OutlineHeading> = [];
	// Track how many times each base ID has been used to generate unique suffixes.
	const seenIds = new Map<string, number>();
	const elements = editorDom.querySelectorAll(".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4");

	for (const el of elements) {
		const text = el.textContent?.trim() ?? "";
		if (!text) {
			continue;
		}

		// Generate a stable base ID from the heading text for tracking and data-testid attributes.
		// Navigation uses index-based DOM matching since TipTap re-renders nodes and strips custom IDs.
		const baseId = text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");

		// Deduplicate: if this base ID has been seen before, append an incrementing suffix.
		const count = seenIds.get(baseId) ?? 0;
		seenIds.set(baseId, count + 1);
		const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

		const level = levelMap[el.tagName] ?? 2;

		headings.push({ id, text, level });
	}

	return headings;
}
