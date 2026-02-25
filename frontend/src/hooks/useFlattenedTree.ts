import type { TreeNode } from "./useSpaceTree";
import type { Doc } from "jolli-common";

/**
 * Represents a flattened tree item for dnd-kit
 */
export interface FlattenedItem {
	/** The document ID (used as dnd-kit id) */
	id: number;
	/** The document data */
	doc: Doc;
	/** Depth level in the tree (0 = root level) */
	depth: number;
	/** Parent document ID (undefined for root level items) */
	parentId: number | undefined;
	/** Index among siblings */
	index: number;
	/** Whether this item is a folder */
	isFolder: boolean;
	/** Whether this folder is expanded (only relevant for folders) */
	expanded: boolean;
	/** IDs of all descendant documents (for detecting invalid drop targets) */
	descendantIds: Set<number>;
}

/**
 * Cached DOM layout information for drag calculations.
 * Optional fields are filled by the UI layer that owns the DOM.
 */
export interface DragLayoutItemRect {
	rectTop: number;
	rectBottom: number;
	height: number;
	top?: number;
	iconLeft?: number;
	width?: number;
}

/**
 * Cache of layout data to avoid per-frame DOM queries during drag.
 */
export interface DragLayoutCache {
	childrenByParent: Map<number | undefined, Array<number>>;
	itemRects: Map<number, DragLayoutItemRect>;
	containerTop: number;
	scrollTop: number;
	scrollLeft: number;
}

/**
 * Result of drop projection calculation
 */
export interface ProjectedDrop {
	/** The target parent ID (undefined for root level) */
	parentId: number | undefined;
	/** The reference document ID (null when dropping on folder header = move to end) */
	referenceDocId: number | null;
	/** Position relative to reference document ("before" or "after"). Ignored when referenceDocId is null. */
	dropPosition: "before" | "after";
	/** The projected depth level */
	depth: number;
	/** Whether this is a same-parent reorder (vs cross-folder move) */
	isSameParent: boolean;
	/** Whether the drop target is valid */
	isValid: boolean;
	/** Whether the mouse is on the folder header (triggers FolderHighlight instead of DropLine) */
	isOnFolderHeader: boolean;
}

/**
 * Collects all descendant IDs of a tree node recursively
 */
function collectDescendantIds(node: TreeNode): Set<number> {
	const ids = new Set<number>();
	for (const child of node.children) {
		ids.add(child.doc.id);
		for (const descendantId of collectDescendantIds(child)) {
			ids.add(descendantId);
		}
	}
	return ids;
}

/**
 * Flattens a tree structure into a flat array for dnd-kit
 * Only includes visible items (respects expanded state)
 */
export function flattenTree(nodes: Array<TreeNode>): Array<FlattenedItem> {
	const result: Array<FlattenedItem> = [];

	function traverse(items: Array<TreeNode>, parentId: number | undefined, depth: number): void {
		for (let index = 0; index < items.length; index++) {
			const node = items[index];
			const isFolder = node.doc.docType === "folder";

			result.push({
				id: node.doc.id,
				doc: node.doc,
				depth,
				parentId,
				index,
				isFolder,
				expanded: node.expanded,
				descendantIds: collectDescendantIds(node),
			});

			// Only traverse children if the folder is expanded
			if (isFolder && node.expanded && node.children.length > 0) {
				traverse(node.children, node.doc.id, depth + 1);
			}
		}
	}

	traverse(nodes, undefined, 0);
	return result;
}

/**
 * Gets all items at a specific parent level
 */
export function getItemsAtParent(items: Array<FlattenedItem>, parentId: number | undefined): Array<FlattenedItem> {
	return items.filter(item => item.parentId === parentId);
}

/**
 * Finds an item by ID in the flattened array
 */
export function findItemById(items: Array<FlattenedItem>, id: number): FlattenedItem | undefined {
	return items.find(item => item.id === id);
}

/**
 * Checks if targetId is a descendant of sourceId
 */
export function isDescendant(items: Array<FlattenedItem>, sourceId: number, targetId: number): boolean {
	const sourceItem = findItemById(items, sourceId);
	if (!sourceItem) {
		return false;
	}
	return sourceItem.descendantIds.has(targetId);
}

/**
 * Indentation width in pixels per depth level
 */
const INDENTATION_WIDTH = 24;

/**
 * Result of calculating drop position within a container (folder or root level)
 */
interface DropPositionResult {
	/** The target parent ID (undefined for root level) */
	parentId: number | undefined;
	/** The reference document ID (null = move to end) */
	referenceDocId: number | null;
	/** Position relative to reference document. Ignored when referenceDocId is null. */
	dropPosition: "before" | "after";
	/** Whether the mouse is on the folder header (only applicable when parentId is a folder) */
	isOnFolderHeader: boolean;
}

/**
 * Calculates the precise drop position within a container (folder or root level).
 * This function uses mouseY to determine the exact position among siblings.
 *
 * @param containerId - The container ID (folder ID or undefined for root level)
 * @param mouseY - The current mouse Y coordinate (undefined = fallback to end)
 * @param items - Flattened tree items
 * @param activeId - The ID of the item being dragged (to detect "same position" cases)
 * @returns Drop position info, or null if the drop position is the same as current position
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Drag positioning needs multiple conditional paths to match UX rules.
function calculateDropPosition(
	containerId: number | undefined,
	mouseY: number | undefined,
	items: Array<FlattenedItem>,
	activeId: number,
	layoutCache?: DragLayoutCache,
): DropPositionResult | null {
	// Use content coordinates when a drag layout cache is available so scrolling does not invalidate offsets.
	const useContentCoords =
		layoutCache !== undefined && mouseY !== undefined && Number.isFinite(layoutCache.containerTop);
	const mouseYInContent =
		useContentCoords && mouseY !== undefined
			? mouseY - layoutCache.containerTop + layoutCache.scrollTop
			: undefined;

	// Get all children in this container
	const childrenIds =
		layoutCache?.childrenByParent.get(containerId) ??
		items.filter(item => item.parentId === containerId).map(item => item.id);

	// Find activeItem's index in children (to detect "same position" cases)
	const activeIndex = childrenIds.indexOf(activeId);

	// If container is a folder, check if mouse is on the folder header
	if (containerId !== undefined && mouseY !== undefined) {
		const cachedHeaderRect = layoutCache?.itemRects.get(containerId);
		if (cachedHeaderRect && cachedHeaderRect.top !== undefined && mouseYInContent !== undefined) {
			const headerBottom = cachedHeaderRect.top + cachedHeaderRect.height;
			if (mouseYInContent <= headerBottom) {
				return {
					parentId: containerId,
					referenceDocId: null,
					dropPosition: "after" as const,
					isOnFolderHeader: true,
				};
			}
		} else {
			const folderHeader = document.querySelector(`[data-folder-header-id="${containerId}"]`);
			if (folderHeader) {
				const headerRect = folderHeader.getBoundingClientRect();
				// If mouse is on or above the folder header, treat as "move into folder (at end)"
				if (mouseY <= headerRect.bottom) {
					return {
						parentId: containerId,
						referenceDocId: null,
						dropPosition: "after" as const,
						isOnFolderHeader: true,
					};
				}
			}
		}
	}

	// No mouseY provided or no children - fallback to end of container
	if (mouseY === undefined || childrenIds.length === 0) {
		return {
			parentId: containerId,
			referenceDocId: null,
			dropPosition: "after" as const,
			isOnFolderHeader: containerId !== undefined && childrenIds.length === 0,
		};
	}

	// Find the drop position based on mouseY
	// Children are in visual order (top to bottom), so we can iterate and find the insertion point
	let lastVisibleChildId: number | null = null;
	let lastVisibleChildIndex = -1;

	for (let index = 0; index < childrenIds.length; index++) {
		const childId = childrenIds[index];
		let childCenter: number | null = null;
		const cachedRect = layoutCache?.itemRects.get(childId);
		if (cachedRect && cachedRect.top !== undefined && mouseYInContent !== undefined) {
			childCenter = cachedRect.top + cachedRect.height / 2;
		} else {
			const childElement = document.querySelector(`[data-testid="tree-item-${childId}"]`);
			if (!childElement) {
				continue;
			}
			const childRect = childElement.getBoundingClientRect();
			childCenter = childRect.top + childRect.height / 2;
		}

		const compareY = mouseYInContent ?? mouseY;
		if (compareY !== undefined && compareY < childCenter) {
			// Mouse is above this child's center - insert before this child
			const childIndex = index;

			// Check if this is the "same position" case:
			// "before X" where X is activeItem's next sibling means no movement needed
			if (activeIndex !== -1 && childIndex === activeIndex + 1) {
				return null;
			}

			// Also check: "before activeItem" means no movement needed
			if (childId === activeId) {
				return null;
			}

			return {
				parentId: containerId,
				referenceDocId: childId,
				dropPosition: "before" as const,
				isOnFolderHeader: false,
			};
		}

		// Mouse is at or below this child's center - track as potential "after" target
		lastVisibleChildId = childId;
		lastVisibleChildIndex = index;
	}

	// Mouse is below all children's centers (or no visible children found)
	if (lastVisibleChildId != null) {
		// Check if this is the "same position" case:
		// "after X" where X is activeItem's previous sibling means no movement needed
		if (activeIndex !== -1 && lastVisibleChildIndex === activeIndex - 1) {
			return null;
		}

		// Also check: "after activeItem" means no movement needed
		if (lastVisibleChildId === activeId) {
			return null;
		}

		return {
			parentId: containerId,
			referenceDocId: lastVisibleChildId,
			dropPosition: "after" as const,
			isOnFolderHeader: false,
		};
	}

	// No DOM elements found - fallback to end of container
	return {
		parentId: containerId,
		referenceDocId: null,
		dropPosition: "after" as const,
		isOnFolderHeader: containerId !== undefined,
	};
}

/**
 * Positioning info extracted from various drop scenarios
 * @internal Exported for testing purposes only
 */
export interface PositioningInfo {
	targetParentId: number | undefined;
	referenceDocId: number | null;
	dropPosition: "before" | "after";
	isOnFolderHeader: boolean;
}

/**
 * Builds the final ProjectedDrop result with validation checks
 * @internal Exported for testing purposes only
 */
export function buildProjectedDrop(
	positioning: PositioningInfo,
	activeItem: FlattenedItem,
	projectedDepth: number,
	isDefaultSort: boolean,
): ProjectedDrop {
	const { targetParentId, referenceDocId, dropPosition, isOnFolderHeader } = positioning;
	const isSameParent = targetParentId === activeItem.parentId;

	// In non-default sort mode, same-parent reordering is not allowed
	if (!isDefaultSort && isSameParent) {
		return {
			parentId: targetParentId,
			referenceDocId,
			dropPosition,
			depth: projectedDepth,
			isSameParent: true,
			isValid: false,
			isOnFolderHeader,
		};
	}

	// Validate: cannot drop folder into itself
	if (activeItem.isFolder && targetParentId === activeItem.id) {
		return {
			parentId: targetParentId,
			referenceDocId,
			dropPosition,
			depth: projectedDepth,
			isSameParent,
			isValid: false,
			isOnFolderHeader,
		};
	}

	return {
		parentId: targetParentId,
		referenceDocId,
		dropPosition,
		depth: projectedDepth,
		isSameParent,
		isValid: true,
		isOnFolderHeader,
	};
}

/**
 * Calculates the projected drop position based on pointer position
 *
 * @param items - Flattened tree items
 * @param activeId - The ID of the item being dragged
 * @param overId - The ID of the item being hovered over
 * @param dragOffset - Horizontal drag offset in pixels (for depth adjustment)
 * @param isDefaultSort - Whether we're in default sort mode (allows same-level reordering)
 * @param mouseY - The current mouse Y coordinate (for precise positioning)
 * @returns The projected drop position, or null if drop is not allowed
 */
export function getProjection(
	items: Array<FlattenedItem>,
	activeId: number,
	overId: number,
	dragOffset: number,
	isDefaultSort: boolean,
	mouseY?: number,
	layoutCache?: DragLayoutCache,
): ProjectedDrop | null {
	const activeItem = findItemById(items, activeId);
	const overItem = findItemById(items, overId);

	// Early return: items not found
	if (!activeItem || !overItem) {
		return null;
	}

	// Early return: cannot drop on self
	if (activeId === overId) {
		return null;
	}

	// Early return: cannot drop on own descendant (would create circular reference)
	if (isDescendant(items, activeId, overId)) {
		return {
			parentId: undefined,
			referenceDocId: null,
			dropPosition: "after",
			depth: 0,
			isSameParent: false,
			isValid: false,
			isOnFolderHeader: false,
		};
	}

	// Calculate depth adjustment based on horizontal drag offset
	const depthChange = Math.round(dragOffset / INDENTATION_WIDTH);
	const projectedDepth = Math.max(0, overItem.depth + depthChange);

	// Early return: collapsed folder - move into folder (at end)
	if (overItem.isFolder && !overItem.expanded) {
		return buildProjectedDrop(
			{
				targetParentId: overItem.id,
				referenceDocId: null,
				dropPosition: "after",
				isOnFolderHeader: true,
			},
			activeItem,
			projectedDepth,
			isDefaultSort,
		);
	}

	// Early return: no mouseY - use fallback behavior for backward compatibility
	if (mouseY === undefined) {
		if (overItem.isFolder) {
			// Expanded folder without mouseY: move into folder (at end)
			return buildProjectedDrop(
				{
					targetParentId: overItem.id,
					referenceDocId: null,
					dropPosition: "after",
					isOnFolderHeader: true,
				},
				activeItem,
				projectedDepth,
				isDefaultSort,
			);
		}
		// Document without mouseY: place after this document
		return buildProjectedDrop(
			{
				targetParentId: overItem.parentId,
				referenceDocId: overItem.id,
				dropPosition: "after",
				isOnFolderHeader: false,
			},
			activeItem,
			projectedDepth,
			isDefaultSort,
		);
	}

	// Main logic: use precise positioning based on mouse Y coordinate
	// Container is: folder itself (if overItem is folder) or overItem's parent (if overItem is document)
	const containerId = overItem.isFolder ? overItem.id : overItem.parentId;
	const position = calculateDropPosition(containerId, mouseY, items, activeId, layoutCache);

	// "Same position" detected - no movement needed, don't show DropLine
	if (position === null) {
		return null;
	}

	// Dropping onto the current parent folder header should be a no-op.
	if (position.isOnFolderHeader && position.parentId === activeItem.parentId) {
		return null;
	}

	return buildProjectedDrop(
		{
			targetParentId: position.parentId,
			referenceDocId: position.referenceDocId,
			dropPosition: position.dropPosition,
			isOnFolderHeader: position.isOnFolderHeader,
		},
		activeItem,
		projectedDepth,
		isDefaultSort,
	);
}

/**
 * Gets the drop position relative to the over item (before, after, or inside)
 * Used for rendering drop indicators
 */
export type DropPosition = "before" | "after" | "inside";

export interface DropIndicatorInfo {
	/** Position relative to the over item */
	position: DropPosition;
	/** The over item */
	overItem: FlattenedItem;
	/** Depth for the indicator (for proper indentation) */
	depth: number;
	/** Whether the drop is valid */
	isValid: boolean;
}

/**
 * Calculates drop indicator information for visual feedback
 */
export function getDropIndicator(
	items: Array<FlattenedItem>,
	activeId: number,
	overId: number,
	pointerY: number,
	overRect: { top: number; height: number } | null,
	isDefaultSort: boolean,
): DropIndicatorInfo | null {
	const activeItem = findItemById(items, activeId);
	const overItem = findItemById(items, overId);

	if (!activeItem || !overItem || !overRect) {
		return null;
	}

	// Cannot drop on self
	if (activeId === overId) {
		return null;
	}

	// Check if dropping on descendant (invalid)
	const isInvalidDescendant = isDescendant(items, activeId, overId);

	// Determine position based on pointer Y relative to over item
	const relativeY = pointerY - overRect.top;
	const threshold = overRect.height / 3;

	let position: DropPosition;
	let targetParentId: number | undefined;

	if (overItem.isFolder) {
		// For folders: top third = before, middle = inside, bottom third = after
		if (relativeY < threshold) {
			position = "before";
			targetParentId = overItem.parentId;
		} else if (relativeY > overRect.height - threshold) {
			position = "after";
			targetParentId = overItem.parentId;
		} else {
			position = "inside";
			targetParentId = overItem.id;
		}
	} else {
		// For documents: top half = before, bottom half = after
		if (relativeY < overRect.height / 2) {
			position = "before";
		} else {
			position = "after";
		}
		targetParentId = overItem.parentId;
	}

	// Check if same parent reorder is allowed
	const isSameParent = targetParentId === activeItem.parentId;
	const isValidSameParent = isDefaultSort || !isSameParent;

	return {
		position,
		overItem,
		depth: position === "inside" ? overItem.depth + 1 : overItem.depth,
		isValid: !isInvalidDescendant && isValidSameParent,
	};
}
