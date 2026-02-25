import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { Empty } from "../../components/ui/Empty";
import { Skeleton } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/Sonner";
import { useClient } from "../../contexts/ClientContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { useCurrentSpace } from "../../contexts/SpaceContext";
import {
	type DragLayoutCache,
	type DragLayoutItemRect,
	type FlattenedItem,
	findItemById,
	flattenTree,
	getProjection,
	type ProjectedDrop,
} from "../../hooks/useFlattenedTree";
import type { SpaceTreeActions, SpaceTreeState, TreeNode } from "../../hooks/useSpaceTree";
import { formatDateTimeOrUnknown } from "../../util/DateTimeUtil";
import type { FolderOption } from "./CreateItemDialog";
import { CreateItemMenu } from "./CreateItemMenu";
import { SpaceFilterMenu } from "./SpaceFilterMenu";
import { SpaceSearch } from "./SpaceSearch";
import { SpaceSearchResults } from "./SpaceSearchResults";
import { SpaceSortMenu } from "./SpaceSortMenu";
import { SpaceSwitcher } from "./SpaceSwitcher";
import { TrashView } from "./TrashView";
import { TreeItem } from "./TreeItem";
import { TreeItemDragOverlay } from "./TreeItemDragOverlay";
import type { DocDraftContentType, SyncChangesetWithSummary } from "jolli-common";
import {
	Archive,
	ArrowLeft,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	FolderPlus,
	MoreVertical,
	Settings,
} from "lucide-react";
import type { ReactElement, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Extracts a flat list of folder options from the tree data for parent folder selection.
 * Each folder includes its depth for indentation display.
 */
/* v8 ignore start -- Tested via TreeItem's MoveItemDialog which passes folders prop */
function extractFoldersFromTree(treeData: Array<TreeNode>, depth = 0): Array<FolderOption> {
	const folders: Array<FolderOption> = [];
	for (const node of treeData) {
		if (node.doc.docType === "folder") {
			folders.push({
				id: node.doc.id,
				name: node.doc.contentMetadata?.title || node.doc.jrn,
				depth,
			});
			if (node.children.length > 0) {
				folders.push(...extractFoldersFromTree(node.children, depth + 1));
			}
		}
	}
	return folders;
}
/* v8 ignore stop */

/**
 * Finds a document node in the tree by ID.
 * @param nodes The tree nodes to search
 * @param docId The document ID to find
 * @returns The matching tree node, or undefined if not found
 */
/* v8 ignore start -- Recursive tree search: all branches tested indirectly via handleDelete/handleRestore */
function findDocInTree(nodes: Array<TreeNode>, docId: number): TreeNode | undefined {
	for (const node of nodes) {
		if (node.doc.id === docId) {
			return node;
		}
		const found = findDocInTree(node.children, docId);
		if (found) {
			return found;
		}
	}
	return;
}
/* v8 ignore stop */

const INDENTATION_WIDTH = 16;
const BASE_PADDING = 8;
const ICON_OFFSET = 20;
const BUNDLE_PAGE_SIZE = 50;

interface DropLineOverlay {
	top: number;
	left: number;
	isValid: boolean;
}

interface FolderHighlightOverlay {
	top: number;
	height: number;
	isValid: boolean;
}

/* v8 ignore start -- DOM measurement functions rely on getBoundingClientRect/elementFromPoint which cannot be meaningfully tested in jsdom/happy-dom */
function getTreeItemMetrics(
	container: HTMLElement,
	itemId: number,
	layoutCache?: DragLayoutCache,
): { top: number; height: number } | null {
	const cached = layoutCache?.itemRects.get(itemId);
	if (cached && cached.top !== undefined) {
		return { top: cached.top, height: cached.height };
	}
	const element = container.querySelector(`[data-testid="tree-item-${itemId}"]`) as HTMLElement | null;
	if (!element) {
		return null;
	}
	const containerRect = container.getBoundingClientRect();
	const rect = element.getBoundingClientRect();
	const top = rect.top - containerRect.top + container.scrollTop;
	const height = rect.height;
	return { top, height };
}

function getTreeIconLeft(container: HTMLElement, itemId: number, layoutCache?: DragLayoutCache): number | null {
	const cached = layoutCache?.itemRects.get(itemId);
	if (cached?.iconLeft !== undefined) {
		return cached.iconLeft;
	}
	const element = container.querySelector(`[data-testid="tree-item-${itemId}"]`) as HTMLElement | null;
	if (!element) {
		return null;
	}
	const icon = element.querySelector('[data-tree-icon="true"]') as HTMLElement | null;
	if (!icon) {
		return null;
	}
	const containerRect = container.getBoundingClientRect();
	const iconRect = icon.getBoundingClientRect();
	return iconRect.left - containerRect.left + container.scrollLeft;
}

function getDropLineOverlay(
	projection: ProjectedDrop,
	container: HTMLElement,
	items: Array<FlattenedItem>,
	layoutCache?: DragLayoutCache,
): DropLineOverlay | null {
	if (projection.isOnFolderHeader) {
		return null;
	}

	let referenceId = projection.referenceDocId;
	if (referenceId == null) {
		const children = items.filter(item => item.parentId === projection.parentId);
		const lastChild = children[children.length - 1];
		if (!lastChild) {
			return null;
		}
		referenceId = lastChild.id;
	}

	const metrics = getTreeItemMetrics(container, referenceId, layoutCache);
	if (!metrics) {
		return null;
	}

	const lineTop = projection.dropPosition === "before" ? metrics.top : metrics.top + metrics.height;
	const referenceItem = findItemById(items, referenceId);
	const parentItem = projection.parentId != null ? findItemById(items, projection.parentId) : undefined;
	const depthForLine = referenceItem?.depth ?? (projection.parentId != null ? (parentItem?.depth ?? 0) + 1 : 0);
	const iconLeft = getTreeIconLeft(container, referenceId, layoutCache);
	const left = iconLeft != null ? iconLeft : depthForLine * INDENTATION_WIDTH + BASE_PADDING + ICON_OFFSET;

	return { top: lineTop, left, isValid: projection.isValid };
}

function getFolderHighlightOverlay(
	projection: ProjectedDrop,
	container: HTMLElement,
	layoutCache?: DragLayoutCache,
): FolderHighlightOverlay | null {
	if (!projection.isOnFolderHeader || projection.parentId == null) {
		return null;
	}

	const metrics = getTreeItemMetrics(container, projection.parentId, layoutCache);
	if (!metrics) {
		return null;
	}

	return { top: metrics.top, height: metrics.height, isValid: projection.isValid };
}

function getOverIdFromPoint(clientX: number, clientY: number): number | null {
	const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
	if (!element) {
		return null;
	}
	const itemElement = element.closest('[data-testid^="tree-item-"]') as HTMLElement | null;
	if (!itemElement) {
		return null;
	}
	const testId = itemElement.getAttribute("data-testid");
	if (!testId) {
		return null;
	}
	const match = testId.match(/tree-item-(\d+)/);
	if (!match) {
		return null;
	}
	return Number.parseInt(match[1], 10);
}
/* v8 ignore stop */

/**
 * Builds a set of folder IDs that have descendants with pending suggestions.
 * This propagates the "has suggestions" indicator up through the tree hierarchy.
 */
function computeFoldersWithSuggestions(nodes: Array<TreeNode>, docsWithSuggestions: Set<number>): Set<number> {
	const result = new Set<number>();

	function traverse(node: TreeNode): boolean {
		let hasSuggestion = docsWithSuggestions.has(node.doc.id);
		for (const child of node.children) {
			if (traverse(child)) {
				hasSuggestion = true;
			}
		}
		if (hasSuggestion && node.doc.docType === "folder") {
			result.add(node.doc.id);
		}
		return hasSuggestion;
	}

	for (const node of nodes) {
		traverse(node);
	}
	return result;
}

export interface SpaceTreeNavProps {
	state: SpaceTreeState;
	actions: SpaceTreeActions;
	/** Callback when the panel should collapse (for pinned mode) */
	onCollapse?: () => void;
	/** Callback when dropdown open state changes (for hover panel) */
	onDropdownOpenChange?: (open: boolean) => void;
	/** Callback when space is switched (for hover panel) */
	onSpaceSwitch?: () => void;
	/** Set of doc IDs that have pending suggestions */
	docsWithSuggestions?: Set<number>;
	/** Currently selected sync changeset bundle */
	selectedChangesetId?: number | undefined;
	/** Bundle selection callback (undefined clears selection) */
	onSelectChangeset?: ((changeset: SyncChangesetWithSummary | undefined) => void) | undefined;
	/** Triggers bundle reload when incremented by parent */
	bundleRefreshKey?: number | undefined;
}

export function SpaceTreeNav({
	state,
	actions,
	onCollapse,
	onDropdownOpenChange: _onDropdownOpenChange,
	onSpaceSwitch: _onSpaceSwitch,
	docsWithSuggestions,
	selectedChangesetId,
	onSelectChangeset,
	bundleRefreshKey,
}: SpaceTreeNavProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const client = useClient();
	const space = useCurrentSpace();
	const { navigate } = useNavigation();
	const {
		treeData,
		trashData,
		loading,
		hasTrash,
		selectedDocId,
		showTrash,
		searchQuery,
		isSearching,
		sortMode,
		isDefaultSort,
		isMatchingSpaceDefault,
		filters,
		filterCount,
		isMatchingSpaceDefaultFilters,
	} = state;
	const [bundlesExpanded, setBundlesExpanded] = useState(true);
	const [isBundlesLoading, setIsBundlesLoading] = useState(false);
	const [bundleLoadError, setBundleLoadError] = useState<string | undefined>();
	const [changesetBundles, setChangesetBundles] = useState<Array<SyncChangesetWithSummary>>([]);
	const [hasMoreBundles, setHasMoreBundles] = useState(false);
	const [nextBundlesBeforeId, setNextBundlesBeforeId] = useState<number | undefined>();
	const [isLoadingMoreBundles, setIsLoadingMoreBundles] = useState(false);

	// Calculate folders list once for the entire tree (optimization: avoid recalculating in each TreeItem)
	const folders = useMemo(() => extractFoldersFromTree(treeData), [treeData]);

	// Compute which folders have descendants with pending suggestions
	const foldersWithSuggestions = useMemo(
		() => (docsWithSuggestions ? computeFoldersWithSuggestions(treeData, docsWithSuggestions) : new Set<number>()),
		[treeData, docsWithSuggestions],
	);

	// Drag-and-drop state
	const [activeId, setActiveId] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragOffsetRef = useRef(0);
	const treeContainerRef = useRef<HTMLDivElement | null>(null);
	const dragPointerIdRef = useRef<number | null>(null);
	const dragStartPointRef = useRef({ x: 0, y: 0 });
	const pendingDragIdRef = useRef<number | null>(null);
	const lastProjectionRef = useRef<ProjectedDrop | null>(null);
	const dragRafRef = useRef<number | null>(null);
	const lastPointerRef = useRef({ x: 0, y: 0 });
	const didDragRef = useRef(false);
	const isDraggingRef = useRef(false);
	const activeIdRef = useRef<number | null>(null);
	const dropLineRef = useRef<HTMLDivElement | null>(null);
	const folderHighlightRef = useRef<HTMLDivElement | null>(null);
	const dragOverlayRef = useRef<HTMLDivElement | null>(null);
	const dragLayoutRef = useRef<DragLayoutCache | null>(null);
	const dragUserSelectRef = useRef<string | null>(null);
	const dragCursorRef = useRef<string | null>(null);

	// Dropdown open states for hover panel persistence
	const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
	const [isSpaceSwitcherOpen, setIsSpaceSwitcherOpen] = useState(false);
	const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
	const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
	const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

	// Propagate dropdown open state to parent (for hover panel persistence)
	useEffect(() => {
		const isAnyDropdownOpen =
			isMoreMenuOpen || isSpaceSwitcherOpen || isSortMenuOpen || isFilterMenuOpen || isCreateMenuOpen;
		_onDropdownOpenChange?.(isAnyDropdownOpen);
	}, [
		isMoreMenuOpen,
		isSpaceSwitcherOpen,
		isSortMenuOpen,
		isFilterMenuOpen,
		isCreateMenuOpen,
		_onDropdownOpenChange,
	]);

	useEffect(() => {
		let cancelled = false;
		if (!space?.slug) {
			setChangesetBundles([]);
			setBundleLoadError(undefined);
			setIsBundlesLoading(false);
			setHasMoreBundles(false);
			setNextBundlesBeforeId(undefined);
			setIsLoadingMoreBundles(false);
			return;
		}

		const currentSlug = space.slug;
		async function loadBundles() {
			setIsBundlesLoading(true);
			setBundleLoadError(undefined);
			try {
				const page = await client.syncChangesets().listChangesetsPage({
					spaceSlug: currentSlug,
					limit: BUNDLE_PAGE_SIZE,
				});
				if (cancelled) {
					return;
				}
				setChangesetBundles(page.changesets);
				setHasMoreBundles(Boolean(page.hasMore && page.nextBeforeId !== undefined));
				setNextBundlesBeforeId(page.nextBeforeId);
			} catch {
				if (cancelled) {
					return;
				}
				setBundleLoadError("Failed to load bundles");
				setChangesetBundles([]);
				setHasMoreBundles(false);
				setNextBundlesBeforeId(undefined);
			} finally {
				if (!cancelled) {
					setIsBundlesLoading(false);
				}
			}
		}

		loadBundles();
		return () => {
			cancelled = true;
		};
	}, [bundleRefreshKey, client, space?.slug]);

	const handleLoadMoreBundles = useCallback(async () => {
		const slug = space?.slug;
		if (!slug || !hasMoreBundles || nextBundlesBeforeId === undefined || isLoadingMoreBundles) {
			return;
		}
		setIsLoadingMoreBundles(true);
		try {
			const page = await client.syncChangesets().listChangesetsPage({
				spaceSlug: slug,
				limit: BUNDLE_PAGE_SIZE,
				beforeId: nextBundlesBeforeId,
			});
			setChangesetBundles(previous => {
				const existingIds = new Set(previous.map(bundle => bundle.id));
				const nextPage = page.changesets.filter(bundle => !existingIds.has(bundle.id));
				return [...previous, ...nextPage];
			});
			setHasMoreBundles(Boolean(page.hasMore && page.nextBeforeId !== undefined));
			setNextBundlesBeforeId(page.nextBeforeId);
		} catch {
			toast.error("Failed to load more bundles");
		} finally {
			setIsLoadingMoreBundles(false);
		}
	}, [client, hasMoreBundles, isLoadingMoreBundles, nextBundlesBeforeId, space?.slug]);

	// Permission flags for drag-and-drop
	// Same-level reordering is only allowed in default sort mode
	const canReorder = isDefaultSort;
	const canMoveTo = true; // Cross-folder move permission

	// Flatten tree for drag calculations
	const flattenedItems = useMemo(() => flattenTree(treeData), [treeData]);

	// Get the active item for overlay
	/* v8 ignore start -- Active drag item state, only populated during drag operations */
	const activeItem = useMemo(() => {
		if (activeId == null) {
			return null;
		}
		return findItemById(flattenedItems, activeId) ?? null;
	}, [activeId, flattenedItems]);

	useEffect(() => {
		activeIdRef.current = activeId;
	}, [activeId]);

	useEffect(() => {
		if (!isDragging || activeId == null) {
			return;
		}
		const overlayEl = dragOverlayRef.current;
		if (!overlayEl) {
			return;
		}

		const cachedRect = dragLayoutRef.current?.itemRects.get(activeId);
		let width = cachedRect?.width;
		if (!width) {
			const container = treeContainerRef.current;
			const element = container?.querySelector(`[data-testid="tree-item-${activeId}"]`) as HTMLElement | null;
			width = element?.getBoundingClientRect().width;
		}

		if (width) {
			const containerWidth = treeContainerRef.current?.clientWidth;
			const maxWidth =
				containerWidth && containerWidth > 0 ? Math.min(280, Math.max(0, containerWidth - 16)) : 280;
			const finalWidth = Math.min(width, maxWidth);
			overlayEl.style.width = `${finalWidth}px`;
		} else {
			overlayEl.style.removeProperty("width");
		}
	}, [isDragging, activeId]);

	// Count children for folder overlay badge
	const activeChildCount = useMemo(() => {
		if (!activeItem?.isFolder) {
			return 0;
		}
		return activeItem.descendantIds.size;
	}, [activeItem]);
	/* v8 ignore stop */

	/* v8 ignore start -- buildDragLayoutCache and all drag/drop DOM interaction code below rely on getBoundingClientRect, elementFromPoint, pointer events, rAF, and scroll handling that cannot be meaningfully tested in jsdom */
	const buildDragLayoutCache = useCallback((): DragLayoutCache | null => {
		const container = treeContainerRef.current;
		if (!container) {
			return null;
		}

		const containerRect = container.getBoundingClientRect();
		const itemRects = new Map<number, DragLayoutItemRect>();
		const childrenByParent = new Map<number | undefined, Array<number>>();

		for (const item of flattenedItems) {
			const element = container.querySelector(`[data-testid="tree-item-${item.id}"]`) as HTMLElement | null;
			if (!element) {
				continue;
			}
			const rect = element.getBoundingClientRect();
			const top = rect.top - containerRect.top + container.scrollTop;
			const icon = element.querySelector('[data-tree-icon="true"]') as HTMLElement | null;
			const iconLeft = icon
				? icon.getBoundingClientRect().left - containerRect.left + container.scrollLeft
				: undefined;

			const rectEntry: DragLayoutItemRect = {
				rectTop: rect.top,
				rectBottom: rect.bottom,
				height: rect.height,
				top,
				width: rect.width,
			};
			if (iconLeft !== undefined) {
				rectEntry.iconLeft = iconLeft;
			}
			itemRects.set(item.id, rectEntry);

			const siblings = childrenByParent.get(item.parentId) ?? [];
			siblings.push(item.id);
			childrenByParent.set(item.parentId, siblings);
		}

		return {
			itemRects,
			childrenByParent,
			containerTop: containerRect.top,
			scrollTop: container.scrollTop,
			scrollLeft: container.scrollLeft,
		};
	}, [flattenedItems]);
	const updateDropIndicators = useCallback(
		(projection: ProjectedDrop | null, items: Array<FlattenedItem>, layoutCache?: DragLayoutCache | null) => {
			const container = treeContainerRef.current;
			if (!container) {
				return;
			}

			const dropLineEl = dropLineRef.current;
			const folderHighlightEl = folderHighlightRef.current;

			if (!projection) {
				if (dropLineEl) {
					dropLineEl.style.display = "none";
				}
				if (folderHighlightEl) {
					folderHighlightEl.style.display = "none";
				}
				return;
			}

			const dropLine = getDropLineOverlay(projection, container, items, layoutCache ?? undefined);
			const folderHighlight = getFolderHighlightOverlay(projection, container, layoutCache ?? undefined);

			if (dropLineEl) {
				if (!dropLine) {
					dropLineEl.style.display = "none";
				} else {
					dropLineEl.style.display = "block";
					// Use content coordinates so the overlay naturally scrolls with the container.
					dropLineEl.style.top = `${dropLine.top}px`;
					dropLineEl.style.left = `${dropLine.left}px`;
					dropLineEl.style.right = "0";
					dropLineEl.className = dropLine.isValid
						? "absolute h-0.5 pointer-events-none z-20 bg-primary"
						: "absolute h-0.5 pointer-events-none z-20 bg-destructive";
				}
			}

			if (folderHighlightEl) {
				if (!folderHighlight) {
					folderHighlightEl.style.display = "none";
				} else {
					folderHighlightEl.style.display = "block";
					// Use content coordinates so the overlay naturally scrolls with the container.
					folderHighlightEl.style.top = `${folderHighlight.top}px`;
					folderHighlightEl.style.height = `${folderHighlight.height}px`;
					folderHighlightEl.style.left = `${BASE_PADDING}px`;
					folderHighlightEl.style.right = `${BASE_PADDING}px`;
					folderHighlightEl.className = folderHighlight.isValid
						? "absolute rounded-md pointer-events-none ring-2 ring-primary bg-primary/10"
						: "absolute rounded-md pointer-events-none ring-2 ring-destructive bg-destructive/10 cursor-not-allowed";
				}
			}
		},
		[],
	);
	const updateDragOverlayPosition = useCallback((clientX: number, clientY: number) => {
		const overlayEl = dragOverlayRef.current;
		if (!overlayEl) {
			return;
		}
		overlayEl.style.transform = `translate3d(${clientX + 12}px, ${clientY + 8}px, 0)`;
	}, []);

	const handleDragPointerDown = useCallback((docId: number, event: ReactPointerEvent) => {
		if (isDraggingRef.current) {
			return;
		}
		if (event.button !== 0) {
			return;
		}
		pendingDragIdRef.current = docId;
		dragPointerIdRef.current = event.pointerId;
		dragStartPointRef.current = { x: event.clientX, y: event.clientY };
		lastPointerRef.current = { x: event.clientX, y: event.clientY };
		isDraggingRef.current = false;
		didDragRef.current = false;
	}, []);

	useEffect(() => {
		// Keep cached scroll metrics in sync so drop calculations stay aligned during scroll.
		function updateLayoutScrollMetrics() {
			const container = treeContainerRef.current;
			const layoutCache = dragLayoutRef.current;
			if (!container || !layoutCache) {
				return;
			}
			layoutCache.scrollTop = container.scrollTop;
			layoutCache.scrollLeft = container.scrollLeft;
			layoutCache.containerTop = container.getBoundingClientRect().top;
		}

		function getAutoScrollDelta(container: HTMLDivElement, pointerX: number, pointerY: number): number {
			const rect = container.getBoundingClientRect();
			if (pointerX < rect.left || pointerX > rect.right) {
				return 0;
			}

			const edgeThreshold = 20;
			const maxSpeed = 2;
			const maxScrollTop = container.scrollHeight - container.clientHeight;

			if (pointerY < rect.top) {
				const ratio = Math.min(1, (rect.top - pointerY) / edgeThreshold);
				const delta = -Math.ceil(maxSpeed * ratio);
				return container.scrollTop <= 0 ? 0 : delta;
			}

			if (pointerY > rect.bottom) {
				const ratio = Math.min(1, (pointerY - rect.bottom) / edgeThreshold);
				const delta = Math.ceil(maxSpeed * ratio);
				return container.scrollTop >= maxScrollTop ? 0 : delta;
			}

			return 0;
		}

		// Batch drag calculations into a single rAF tick so pointer move and scroll share the same path.
		function scheduleDragFrame() {
			if (!isDraggingRef.current) {
				return;
			}
			if (dragRafRef.current != null) {
				return;
			}

			// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Drag frame batches auto-scroll, projection, and overlay updates.
			dragRafRef.current = requestAnimationFrame(() => {
				dragRafRef.current = null;

				updateLayoutScrollMetrics();

				const container = treeContainerRef.current;
				const { x, y } = lastPointerRef.current;
				if (container) {
					const autoScrollDelta = getAutoScrollDelta(container, x, y);
					if (autoScrollDelta !== 0) {
						const nextScrollTop = Math.max(
							0,
							Math.min(
								container.scrollHeight - container.clientHeight,
								container.scrollTop + autoScrollDelta,
							),
						);
						if (nextScrollTop !== container.scrollTop) {
							container.scrollTop = nextScrollTop;
							updateLayoutScrollMetrics();
						}
					}
				}

				const activeDocId = pendingDragIdRef.current;
				updateDragOverlayPosition(x, y);

				let projection: ProjectedDrop | null = null;
				const overId = getOverIdFromPoint(x, y);
				if (activeDocId != null && overId != null && activeDocId !== overId) {
					projection = getProjection(
						flattenedItems,
						activeDocId,
						overId,
						dragOffsetRef.current,
						isDefaultSort,
						y,
						dragLayoutRef.current ?? undefined,
					);

					if (projection) {
						if (!canReorder) {
							if (projection.isSameParent || !canMoveTo) {
								projection = null;
							} else {
								projection.isOnFolderHeader = true;
								projection.referenceDocId = null;
							}
						} else if (!projection.isSameParent && !canMoveTo) {
							projection.isValid = false;
						}
					}
				}

				lastProjectionRef.current = projection;
				updateDropIndicators(projection, flattenedItems, dragLayoutRef.current);

				if (container) {
					const autoScrollDelta = getAutoScrollDelta(container, x, y);
					if (autoScrollDelta !== 0) {
						scheduleDragFrame();
					}
				}
			});
		}

		function handlePointerMove(event: PointerEvent) {
			if (dragPointerIdRef.current == null || event.pointerId !== dragPointerIdRef.current) {
				return;
			}

			lastPointerRef.current = { x: event.clientX, y: event.clientY };
			const dx = event.clientX - dragStartPointRef.current.x;
			const dy = event.clientY - dragStartPointRef.current.y;

			if (!isDraggingRef.current) {
				if (Math.hypot(dx, dy) < 5) {
					return;
				}
				isDraggingRef.current = true;
				didDragRef.current = true;
				setIsDragging(true);
				if (pendingDragIdRef.current != null) {
					setActiveId(pendingDragIdRef.current);
				}
				dragLayoutRef.current = buildDragLayoutCache();
				if (typeof window !== "undefined") {
					window.getSelection()?.removeAllRanges();
				}
				if (typeof document !== "undefined" && document.body) {
					dragUserSelectRef.current = document.body.style.userSelect;
					document.body.style.userSelect = "none";
					dragCursorRef.current = document.body.style.cursor;
					document.body.style.cursor = "grabbing";
				}
				dragOffsetRef.current = 0;
			}

			if (!isDraggingRef.current) {
				return;
			}

			dragOffsetRef.current = dx;
			scheduleDragFrame();
		}

		function handleScroll() {
			if (!isDraggingRef.current) {
				return;
			}
			scheduleDragFrame();
		}

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Drag end handler coordinates cleanup and persistence actions.
		async function handlePointerUp(event: PointerEvent) {
			if (dragPointerIdRef.current == null || event.pointerId !== dragPointerIdRef.current) {
				return;
			}

			dragPointerIdRef.current = null;
			pendingDragIdRef.current = null;

			if (dragRafRef.current != null) {
				cancelAnimationFrame(dragRafRef.current);
				dragRafRef.current = null;
			}

			const projection = lastProjectionRef.current;
			lastProjectionRef.current = null;
			updateDropIndicators(null, flattenedItems, dragLayoutRef.current);

			const activeDocId = activeIdRef.current;
			setActiveId(null);
			setIsDragging(false);
			isDraggingRef.current = false;
			dragOffsetRef.current = 0;
			dragLayoutRef.current = null;
			if (typeof document !== "undefined" && document.body) {
				if (dragUserSelectRef.current !== null) {
					document.body.style.userSelect = dragUserSelectRef.current;
					dragUserSelectRef.current = null;
				}
				if (dragCursorRef.current !== null) {
					document.body.style.cursor = dragCursorRef.current;
					dragCursorRef.current = null;
				}
			}

			if (!activeDocId || !projection || !projection.isValid) {
				return;
			}

			const activeItem = findItemById(flattenedItems, activeDocId);
			if (!activeItem) {
				return;
			}

			try {
				if (canReorder && projection.isSameParent && isDefaultSort) {
					await actions.reorderAt(activeDocId, projection.referenceDocId, projection.dropPosition);
				} else if (canMoveTo && !projection.isSameParent) {
					const newParentId = projection.parentId;
					if (canReorder) {
						await actions.moveTo(
							activeDocId,
							newParentId,
							projection.referenceDocId,
							projection.dropPosition,
						);
					} else {
						await actions.moveTo(activeDocId, newParentId);
					}
					const itemName = activeItem.doc.contentMetadata?.title || activeItem.doc.jrn;
					toast.success(content.moveSuccess({ name: itemName }).value);
				}
			} catch (_error) {
				toast.error(content.moveFailed.value);
			}
		}

		const container = treeContainerRef.current;

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerUp);
		container?.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
			container?.removeEventListener("scroll", handleScroll);
		};
	}, [
		flattenedItems,
		isDefaultSort,
		canReorder,
		canMoveTo,
		actions,
		content,
		buildDragLayoutCache,
		updateDragOverlayPosition,
		updateDropIndicators,
	]);
	/* v8 ignore stop */

	// Clear selected document when space changes
	function handleSpaceChange() {
		actions.selectDoc(undefined);
	}

	const handleSelectDoc = useCallback(
		(docId: number) => {
			if (didDragRef.current) {
				didDragRef.current = false;
				return;
			}
			actions.selectDoc(docId);
		},
		[actions],
	);

	async function handleCreateFolder(parentId: number | undefined, name: string) {
		try {
			const doc = await actions.createFolder(parentId, name);
			/* v8 ignore next 4 -- Success toast timing is difficult to test with fake timers; covered by error path test */
			if (doc) {
				actions.selectDoc(doc.id);
				toast.success(content.createFolderSuccess({ name }).value);
			}
		} catch {
			toast.error(content.createFolderFailed.value);
		}
	}

	async function handleCreateDoc(parentId: number | undefined, name: string, contentType?: DocDraftContentType) {
		try {
			const doc = await actions.createDoc(parentId, name, contentType);
			/* v8 ignore next 4 -- Success toast timing is difficult to test with fake timers; covered by error path test */
			if (doc) {
				actions.selectDoc(doc.id);
				toast.success(content.createDocSuccess({ name }).value);
			}
		} catch {
			toast.error(content.createDocFailed.value);
		}
	}

	async function handleDelete(docId: number) {
		// Find the doc to get its name for success toast
		const doc = findDocInTree(treeData, docId);
		/* v8 ignore next -- Fallback chain: jrn/empty fallback branches only reached when doc has no title */
		const itemName = doc?.doc.contentMetadata?.title || doc?.doc.jrn || "";

		try {
			await actions.softDelete(docId);
			toast.success(content.deleteSuccess({ name: itemName }).value);
		} catch {
			toast.error(content.deleteFailed.value);
		}
	}

	async function handleRename(docId: number, newName: string) {
		try {
			await actions.rename(docId, newName);
			toast.success(content.renameSuccess({ name: newName }).value);
		} catch {
			toast.error(content.renameFailed.value);
		}
	}

	async function handleRestore(docId: number) {
		// Find the doc in trash to get its name for toast
		const doc = trashData.find(d => d.id === docId);
		/* v8 ignore next -- Fallback chain: jrn/empty fallback branches only reached when doc has no title */
		const itemName = doc?.contentMetadata?.title || doc?.jrn || "";

		try {
			await actions.restore(docId);
			toast.success(content.restoreSuccess({ name: itemName }).value);
		} catch {
			toast.error(content.restoreFailed.value);
		}
	}

	function handleShowTrash() {
		actions.loadTrash();
		actions.setShowTrash(true);
	}

	function handleHideTrash() {
		actions.setShowTrash(false);
	}

	function handleSearchQueryChange(query: string) {
		actions.setSearchQuery(query);
	}

	function handleClearSearch() {
		actions.clearSearch();
	}

	function handleSearchResultClick(docId: number) {
		actions.selectDoc(docId);
	}

	async function handleReorderDoc(docId: number, direction: "up" | "down") {
		try {
			await actions.reorderDoc(docId, direction);
			toast.success(content.reorderSuccess.value);
		} catch {
			toast.error(content.reorderFailed.value);
		}
	}

	async function handleMoveTo(docId: number, parentId: number | undefined) {
		try {
			await actions.moveTo(docId, parentId);
			// Find the moved doc to get its name for toast
			const movedDoc = findDocInTree(treeData, docId);
			/* v8 ignore next -- Fallback for unexpected missing tree nodes. */
			const itemName = movedDoc?.doc.contentMetadata?.title || movedDoc?.doc.jrn || "";
			toast.success(content.moveSuccess({ name: itemName }).value);
		} catch (_error) {
			toast.error(content.moveFailed.value);
		}
	}

	function handleBundleSelection(bundle: SyncChangesetWithSummary): void {
		if (selectedChangesetId === bundle.id) {
			onSelectChangeset?.(undefined);
			return;
		}
		onSelectChangeset?.(bundle);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header with space switcher and collapse button */}
			<div className="flex items-center h-12 shrink-0">
				<div className="flex-1 min-w-0">
					<SpaceSwitcher onSpaceChange={handleSpaceChange} onOpenChange={setIsSpaceSwitcherOpen} />
				</div>
				{/* v8 ignore start -- Collapse button only rendered when onCollapse prop provided */}
				{onCollapse && (
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 shrink-0 mr-2"
						onClick={onCollapse}
						title={content.collapseSidebar.value}
						data-testid="pinned-panel-collapse-button"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
				)}
				{/* v8 ignore stop */}
			</div>

			{/* Trash header - shown when viewing trash */}
			{showTrash ? (
				<div className="flex items-center gap-2 px-3 py-2" data-testid="trash-header">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={handleHideTrash}
						data-testid="trash-back-button"
					>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<span className="font-medium text-sm">{content.trash}</span>
				</div>
			) : (
				<>
					{/* Search box - hidden when viewing trash */}
					<SpaceSearch onSearch={handleSearchQueryChange} onClear={handleClearSearch} />

					{/* Header with sort, filter, create and more menu - hidden when searching */}
					{!isSearching && (
						<div className="flex items-center justify-between gap-1 px-4 pb-3">
							<div className="flex items-center gap-1">
								<SpaceFilterMenu
									filters={filters}
									isMatchingSpaceDefault={isMatchingSpaceDefaultFilters}
									filterCount={filterCount}
									onFiltersChange={actions.setFilters}
									onResetToDefault={actions.resetToDefaultFilters}
									onOpenChange={setIsFilterMenuOpen}
								/>
								<SpaceSortMenu
									sortMode={sortMode}
									isMatchingSpaceDefault={isMatchingSpaceDefault}
									onSortModeChange={actions.setSortMode}
									onResetToDefault={actions.resetToDefaultSort}
									onOpenChange={setIsSortMenuOpen}
								/>
							</div>
							<div className="flex items-center gap-1">
								<CreateItemMenu
									treeData={treeData}
									onCreateFolder={handleCreateFolder}
									onCreateDoc={handleCreateDoc}
									onOpenChange={setIsCreateMenuOpen}
								/>
								{hasTrash && (
									<DropdownMenu onOpenChange={setIsMoreMenuOpen}>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												data-testid="space-more-menu-trigger"
											>
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={handleShowTrash} data-testid="show-trash-option">
												<Archive className="h-4 w-4 mr-2" />
												{content.trash}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</div>
						</div>
					)}
				</>
			)}

			{/* Content area */}
			<div
				className={`flex-1 overflow-y-auto scrollbar-thin px-2 relative${isDragging ? " select-none" : ""}`}
				data-testid={showTrash ? "trash-content" : undefined}
				ref={treeContainerRef}
			>
				{showTrash ? (
					<TrashView trashData={trashData} onRestore={handleRestore} />
				) : isSearching ? (
					<SpaceSearchResults
						spaceId={space?.id}
						query={searchQuery}
						onResultClick={handleSearchResultClick}
						selectedDocId={selectedDocId}
					/>
				) : (
					<>
						<div
							ref={folderHighlightRef}
							data-testid="folder-highlight-overlay"
							style={{ display: "none" }}
						/>
						<div role="tree" data-testid="space-tree" className="relative z-10">
							{loading ? (
								<div className="space-y-2">
									<Skeleton className="h-8 w-full" />
									<Skeleton className="h-8 w-5/6 ml-4" />
									<Skeleton className="h-8 w-4/6 ml-4" />
									<Skeleton className="h-8 w-full" />
									<Skeleton className="h-8 w-5/6 ml-4" />
								</div>
							) : treeData.length === 0 ? (
								<Empty
									icon={<FolderPlus className="h-12 w-12" />}
									title={content.empty}
									description={content.emptyTreeDescription}
								/>
							) : (
								treeData.map((node, index) => (
									<TreeItem
										key={node.doc.id}
										node={node}
										depth={0}
										selectedDocId={selectedDocId}
										treeData={treeData}
										folders={folders}
										onSelect={handleSelectDoc}
										onToggleExpand={actions.toggleExpanded}
										onDelete={handleDelete}
										onRename={handleRename}
										onCreateFolder={handleCreateFolder}
										onCreateDoc={handleCreateDoc}
										isDefaultSort={isDefaultSort}
										siblingIndex={index}
										siblingCount={treeData.length}
										onReorderDoc={handleReorderDoc}
										onMoveTo={handleMoveTo}
										docsWithSuggestions={docsWithSuggestions}
										foldersWithSuggestions={foldersWithSuggestions}
										isDragging={activeId === node.doc.id}
										isDragInteraction={isDragging}
										activeId={activeId}
										onDragPointerDown={handleDragPointerDown}
										/* v8 ignore next 3 -- Conditional drag state, requires active drag to test */
										{...(activeItem?.descendantIds && {
											draggedDescendantIds: activeItem.descendantIds,
										})}
									/>
								))
							)}
						</div>
						{isDragging && activeItem && (
							<div ref={dragOverlayRef} className="fixed top-0 left-0 pointer-events-none z-30">
								<TreeItemDragOverlay item={activeItem} childCount={activeChildCount} />
							</div>
						)}
						<div ref={dropLineRef} data-testid="drop-line-overlay" style={{ display: "none" }} />
					</>
				)}
			</div>

			{space && !showTrash && !isSearching && (
				<>
					<div className="border-t border-sidebar-border p-2" data-testid="changeset-bundles-section">
						<button
							type="button"
							onClick={() => setBundlesExpanded(previous => !previous)}
							className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
							data-testid="changeset-bundles-toggle"
						>
							<span>Commit Bundles</span>
							{bundlesExpanded ? (
								<ChevronDown className="h-3.5 w-3.5" />
							) : (
								<ChevronRight className="h-3.5 w-3.5" />
							)}
						</button>
						{bundlesExpanded && (
							<div
								className="mt-2 max-h-48 overflow-y-auto space-y-1"
								data-testid="changeset-bundles-list"
							>
								{isBundlesLoading && (
									<div className="text-xs text-muted-foreground px-2 py-1">Loading bundles...</div>
								)}
								{!isBundlesLoading && bundleLoadError && (
									<div className="text-xs text-destructive px-2 py-1">{bundleLoadError}</div>
								)}
								{!isBundlesLoading && !bundleLoadError && changesetBundles.length === 0 && (
									<div className="text-xs text-muted-foreground px-2 py-1">
										No bundles for this space
									</div>
								)}
								{!isBundlesLoading &&
									!bundleLoadError &&
									changesetBundles.map(bundle => {
										const isSelected = selectedChangesetId === bundle.id;
										return (
											<button
												type="button"
												key={bundle.id}
												onClick={() => handleBundleSelection(bundle)}
												className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors ${
													isSelected
														? "bg-accent border-primary/40"
														: "bg-background hover:bg-accent/50"
												}`}
												data-testid={`changeset-bundle-${bundle.id}`}
											>
												<div className="flex items-center justify-between gap-2">
													<span className="text-xs font-medium">#{bundle.id}</span>
													<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
														{bundle.status}
													</span>
												</div>
												<div className="mt-0.5 text-[10px] text-muted-foreground">
													{formatDateTimeOrUnknown(bundle.createdAt)}
												</div>
												{bundle.message && (
													<div className="mt-1 text-[11px] text-foreground truncate">
														{bundle.message}
													</div>
												)}
												<div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
													<span>{bundle.summary.totalFiles} files</span>
													<span>
														+{bundle.summary.additions} / -{bundle.summary.deletions}
													</span>
												</div>
											</button>
										);
									})}
								{!isBundlesLoading && !bundleLoadError && hasMoreBundles && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={handleLoadMoreBundles}
										disabled={isLoadingMoreBundles}
										className="w-full justify-center text-xs"
										data-testid="changeset-bundles-load-more"
									>
										{isLoadingMoreBundles ? "Loading..." : "Load more"}
									</Button>
								)}
							</div>
						)}
					</div>
					<div
						className="h-12 border-t border-sidebar-border flex items-center px-3"
						data-testid="space-settings-footer"
					>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => navigate(`/spaces/${space.id}/settings/general`)}
							className="justify-start text-muted-foreground hover:text-foreground"
							data-testid="space-settings-button"
						>
							<Settings className="h-4 w-4 mr-2" />
							{content.settings}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
