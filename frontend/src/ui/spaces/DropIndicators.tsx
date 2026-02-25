import { cn } from "../../common/ClassNameUtils";
import type { DropPosition } from "../../hooks/useFlattenedTree";
import type { ReactElement } from "react";

/** Indentation width in pixels per depth level (must match TreeItem) */
const INDENTATION_WIDTH = 16;
/** Base padding for tree items */
const BASE_PADDING = 8;
/** Offset to align with icons (skip chevron/spacer + gap) */
const ICON_OFFSET = 20;

export interface DropLineProps {
	/** Position relative to the reference item */
	position: "before" | "after";
	/** Depth level for proper indentation */
	depth: number;
	/** Whether the drop is valid */
	isValid: boolean;
}

/**
 * Horizontal line indicator shown between items during drag.
 * Used for same-level reordering in default sort mode.
 */
export function DropLine({ position, depth, isValid }: DropLineProps): ReactElement {
	// Align with icons: base padding + depth indentation + icon offset
	const indent = depth * INDENTATION_WIDTH + BASE_PADDING + ICON_OFFSET;

	return (
		<div
			className={cn(
				"absolute left-0 right-0 h-0.5 pointer-events-none z-10",
				position === "before" ? "-top-px" : "-bottom-px",
				isValid ? "bg-blue-500" : "bg-red-500",
			)}
			style={{ marginLeft: `${indent}px` }}
			data-testid="drop-line"
			data-position={position}
			data-valid={isValid}
		/>
	);
}

export interface FolderHighlightProps {
	/** Whether the drop is valid */
	isValid: boolean;
}

/**
 * Highlight overlay shown on folders during drag.
 * Indicates that dropping will move the item into this folder.
 */
export function FolderHighlight({ isValid }: FolderHighlightProps): ReactElement {
	return (
		<div
			className={cn(
				"absolute inset-0 rounded-md pointer-events-none z-0",
				isValid
					? "ring-2 ring-primary bg-primary/10"
					: "ring-2 ring-destructive bg-destructive/10 cursor-not-allowed",
			)}
			data-testid="folder-highlight"
			data-valid={isValid}
		/>
	);
}

export interface DropIndicatorProps {
	/** Drop position type */
	position: DropPosition;
	/** Depth level for indentation */
	depth: number;
	/** Whether the drop is valid */
	isValid: boolean;
}

/**
 * Combined drop indicator component that renders the appropriate
 * visual feedback based on the drop position.
 */
export function DropIndicator({ position, depth, isValid }: DropIndicatorProps): ReactElement | null {
	if (position === "inside") {
		return <FolderHighlight isValid={isValid} />;
	}

	return <DropLine position={position} depth={depth} isValid={isValid} />;
}
