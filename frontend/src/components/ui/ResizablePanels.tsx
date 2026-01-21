import { cn } from "../../common/ClassNameUtils";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export interface ResizablePanelsProps {
	/** Left/first panel content */
	left: ReactNode;
	/** Right/second panel content */
	right: ReactNode;
	/** Initial width of the left panel as a percentage (default: 40) */
	initialLeftWidth?: number;
	/** Minimum width of the left panel as a percentage (default: 20) */
	minLeftWidth?: number;
	/** Maximum width of the left panel as a percentage (default: 60) */
	maxLeftWidth?: number;
	/** Additional className for the container */
	className?: string;
	/** localStorage key to persist the panel width. If provided, the width will be saved and restored. */
	storageKey?: string;
	/** data-testid for testing */
	"data-testid"?: string;
}

/**
 * Loads the saved panel width from localStorage.
 * Returns the saved value if valid and within bounds, otherwise returns the default.
 */
function loadSavedWidth(
	storageKey: string | undefined,
	defaultWidth: number,
	minWidth: number,
	maxWidth: number,
): number {
	if (!storageKey || typeof window === "undefined") {
		return defaultWidth;
	}
	const saved = localStorage.getItem(storageKey);
	if (saved === null) {
		return defaultWidth;
	}
	const parsed = Number.parseFloat(saved);
	if (Number.isNaN(parsed)) {
		return defaultWidth;
	}
	// Clamp to current min/max bounds in case they changed
	return Math.min(Math.max(parsed, minWidth), maxWidth);
}

/**
 * A resizable two-panel layout with a draggable divider.
 * The left panel can be resized by dragging the divider.
 * Optionally persists the panel width to localStorage when a storageKey is provided.
 */
export function ResizablePanels({
	left,
	right,
	initialLeftWidth = 40,
	minLeftWidth = 20,
	maxLeftWidth = 60,
	className,
	storageKey,
	"data-testid": testId,
}: ResizablePanelsProps): ReactElement {
	const containerRef = useRef<HTMLDivElement>(null);
	const [leftWidth, setLeftWidth] = useState(() =>
		loadSavedWidth(storageKey, initialLeftWidth, minLeftWidth, maxLeftWidth),
	);
	const [isDragging, setIsDragging] = useState(false);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			// Only process mouse move when dragging and container is available
			// containerRef.current is always available after mount since it's attached to the rendered div
			if (isDragging && containerRef.current) {
				const containerRect = containerRef.current.getBoundingClientRect();
				const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

				// Clamp to min/max bounds
				const clampedWidth = Math.min(Math.max(newLeftWidth, minLeftWidth), maxLeftWidth);
				setLeftWidth(clampedWidth);
			}
		},
		[isDragging, minLeftWidth, maxLeftWidth],
	);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
		// Save to localStorage when drag ends
		if (storageKey && typeof window !== "undefined") {
			setLeftWidth(currentWidth => {
				localStorage.setItem(storageKey, String(currentWidth));
				return currentWidth;
			});
		}
	}, [storageKey]);

	useEffect(() => {
		if (isDragging) {
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			// Prevent text selection while dragging
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		}

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
	}, [isDragging, handleMouseMove, handleMouseUp]);

	return (
		<div ref={containerRef} className={cn("flex h-full overflow-hidden", className)} data-testid={testId}>
			{/* Left Panel */}
			<div
				className="flex-shrink-0 overflow-hidden"
				style={{ width: `${leftWidth}%` }}
				data-testid={testId ? `${testId}-left` : undefined}
			>
				{left}
			</div>

			{/* Divider */}
			<div
				className={cn(
					"flex-shrink-0 w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors",
					"flex items-center justify-center group",
					isDragging && "bg-primary/50",
				)}
				onMouseDown={handleMouseDown}
				data-testid={testId ? `${testId}-divider` : undefined}
			>
				<div
					className={cn(
						"w-1 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-primary/70 transition-colors",
						isDragging && "bg-primary/70",
					)}
				/>
			</div>

			{/* Right Panel */}
			<div
				className="flex-1 overflow-hidden"
				style={{ width: `${100 - leftWidth}%` }}
				data-testid={testId ? `${testId}-right` : undefined}
			>
				{right}
			</div>
		</div>
	);
}
