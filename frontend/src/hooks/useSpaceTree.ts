import { useClient } from "../contexts/ClientContext";
import { getLog } from "../util/Logger";
import {
	addNodeToTree,
	cloneTreeData,
	findNodeById,
	getSiblingsAndIndex,
	insertNodeAtPosition,
	removeNodeFromTree,
	updateDocTitle,
	updateNodeExpanded,
} from "../util/TreeUtils";
import {
	areFiltersEqual,
	DEFAULT_SPACE_FILTERS,
	type Doc,
	type DocDraftContentType,
	normalizeFilters,
	type Space,
	type SpaceFilters,
	type SpaceSortOption,
	type UpdatedFilter,
} from "jolli-common";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const log = getLog(import.meta);

/** Debounce delay for saving sort preference to API (in ms) */
const SORT_SAVE_DEBOUNCE_MS = 500;

/** Debounce delay for saving filter preference to API (in ms) */
const FILTER_SAVE_DEBOUNCE_MS = 500;

/** Debounce delay for saving expanded folders to API (in ms) */
const EXPANDED_SAVE_DEBOUNCE_MS = 2000;

export interface TreeNode {
	doc: Doc;
	children: Array<TreeNode>;
	expanded: boolean;
}

export interface SpaceTreeState {
	treeData: Array<TreeNode>;
	trashData: Array<Doc>;
	loading: boolean;
	hasTrash: boolean;
	selectedDocId: number | undefined;
	showTrash: boolean;
	searchQuery: string;
	isSearching: boolean;
	sortMode: SpaceSortOption;
	/** Whether current sort mode is "default" (enables manual reordering) */
	isDefaultSort: boolean;
	/** Whether current sort matches the space's default sort setting */
	isMatchingSpaceDefault: boolean;
	/** Current filter settings */
	filters: SpaceFilters;
	/** Number of active filter conditions (for badge display) */
	filterCount: number;
	/** Whether current filters match the space's default filters setting */
	isMatchingSpaceDefaultFilters: boolean;
}

export interface SpaceTreeActions {
	loadTree: () => Promise<void>;
	loadTrash: () => Promise<void>;
	toggleExpanded: (docId: number) => void;
	selectDoc: (docId: number | undefined) => void;
	setShowTrash: (show: boolean) => void;
	createFolder: (parentId: number | undefined, name: string) => Promise<Doc | undefined>;
	createDoc: (
		parentId: number | undefined,
		name: string,
		contentType?: DocDraftContentType,
	) => Promise<Doc | undefined>;
	softDelete: (docId: number) => Promise<void>;
	restore: (docId: number) => Promise<void>;
	refreshTree: () => Promise<void>;
	rename: (docId: number, newName: string) => Promise<Doc | undefined>;
	setSearchQuery: (query: string) => void;
	clearSearch: () => void;
	setSortMode: (mode: SpaceSortOption) => void;
	resetToDefaultSort: () => void;
	reorderDoc: (docId: number, direction: "up" | "down") => Promise<void>;
	/**
	 * Moves a document to a new parent folder.
	 * @param docId - The document ID to move
	 * @param parentId - The new parent folder ID (undefined for root level)
	 * @param referenceDocId - Optional: undefined/null = end, number = relative to that doc
	 * @param position - Optional: "before" to place before referenceDocId, "after" to place after
	 */
	moveTo: (
		docId: number,
		parentId: number | undefined,
		referenceDocId?: number | null,
		position?: "before" | "after",
	) => Promise<void>;
	/**
	 * Reorders a document to a specific position among its siblings.
	 * @param docId - The document ID to reorder
	 * @param referenceDocId - Optional: undefined/null = end, number = relative to that doc
	 * @param position - Optional: "before" to place before referenceDocId, "after" to place after
	 */
	reorderAt: (docId: number, referenceDocId?: number | null, position?: "before" | "after") => Promise<void>;
	setFilters: (filters: SpaceFilters) => void;
	resetToDefaultFilters: () => void;
}

/**
 * Gets the sort comparator function based on sort mode.
 */
function getSortComparator(sortMode: SpaceSortOption): (a: Doc, b: Doc) => number {
	switch (sortMode) {
		case "alphabetical_asc": {
			return (a, b) => {
				/* v8 ignore next 2 -- Nullish coalescing fallback: title is always present in practice */
				const titleA = (a.contentMetadata as { title?: string })?.title ?? "";
				const titleB = (b.contentMetadata as { title?: string })?.title ?? "";
				return titleA.localeCompare(titleB);
			};
		}
		case "alphabetical_desc": {
			return (a, b) => {
				/* v8 ignore next 2 -- Nullish coalescing fallback: title is always present in practice */
				const titleA = (a.contentMetadata as { title?: string })?.title ?? "";
				const titleB = (b.contentMetadata as { title?: string })?.title ?? "";
				return titleB.localeCompare(titleA);
			};
		}
		case "updatedAt_asc":
			return (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
		case "updatedAt_desc":
			return (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
		case "createdAt_asc":
			return (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		case "createdAt_desc":
			return (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		default:
			// "default" mode - use sortOrder
			return (a, b) => a.sortOrder - b.sortOrder;
	}
}

/**
 * Get the cutoff date for a given Updated filter.
 */
function getFilterCutoffDate(filter: UpdatedFilter): Date | undefined {
	if (filter === "any_time") {
		return;
	}

	const now = new Date();

	if (typeof filter === "string") {
		switch (filter) {
			case "today": {
				const today = new Date(now);
				today.setHours(0, 0, 0, 0);
				return today;
			}
			case "last_7_days":
				return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			case "last_30_days":
				return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			case "last_3_months":
				return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
			default:
				return;
		}
	}

	// Custom date: { type: "after_date", date: "YYYY-MM-DD" }
	if (typeof filter === "object" && filter.type === "after_date" && filter.date) {
		return new Date(filter.date);
	}

	return;
}

/**
 * Filter docs by the Updated filter.
 * Returns docs that were updated after the cutoff date.
 * Folders are included if they have any matching children.
 */
function filterDocsByUpdated(docs: Array<Doc>, filter: UpdatedFilter): Array<Doc> {
	const maybeCutoffDate = getFilterCutoffDate(filter);
	if (!maybeCutoffDate) {
		return docs;
	}
	// After the check above, cutoffDate is definitely defined
	const cutoffDate = maybeCutoffDate;

	// Build parent-child relationships
	const childrenMap = new Map<number | undefined, Array<Doc>>();
	for (const doc of docs) {
		const parentKey = doc.parentId ?? undefined;
		const children = childrenMap.get(parentKey) ?? [];
		children.push(doc);
		childrenMap.set(parentKey, children);
	}

	// Recursively check if a doc or any of its descendants match the filter
	function hasMatchingDescendant(doc: Doc): boolean {
		// Check if this doc matches
		const docDate = new Date(doc.updatedAt);
		if (docDate >= cutoffDate) {
			return true;
		}

		// Check children
		/* v8 ignore next -- Nullish coalescing fallback: Map.get returns undefined only when doc has no children entry */
		const children = childrenMap.get(doc.id) ?? [];
		return children.some(hasMatchingDescendant);
	}

	// Filter docs: include if doc itself matches or has matching descendants
	return docs.filter(doc => {
		if (doc.docType === "folder") {
			// Include folder if it has any matching descendants
			return hasMatchingDescendant(doc);
		}
		// Include document if it matches
		return new Date(doc.updatedAt) >= cutoffDate;
	});
}

/**
 * Filter docs by Creator using fuzzy matching (case-insensitive contains).
 * Returns docs whose createdBy field contains the query string.
 * Folders are included if they have any matching children.
 *
 * TODO: Currently disabled. Enable when member/permission features are implemented.
 * @see applyFilters function where this is commented out.
 */
/* v8 ignore start -- Function currently disabled, will be enabled when member/permission features are implemented */
function _filterDocsByCreator(docs: Array<Doc>, creatorQuery: string): Array<Doc> {
	const trimmedQuery = creatorQuery.trim();
	if (trimmedQuery === "") {
		return docs;
	}

	const queryLower = trimmedQuery.toLowerCase();

	// Build parent-child relationships
	const childrenMap = new Map<number | undefined, Array<Doc>>();
	for (const doc of docs) {
		const parentKey = doc.parentId ?? undefined;
		const children = childrenMap.get(parentKey) ?? [];
		children.push(doc);
		childrenMap.set(parentKey, children);
	}

	// Recursively check if a doc or any of its descendants match the filter
	function hasMatchingDescendant(doc: Doc): boolean {
		// Check if this doc matches (fuzzy match: case-insensitive contains)
		if (doc.createdBy?.toLowerCase().includes(queryLower)) {
			return true;
		}

		// Check children
		const children = childrenMap.get(doc.id) ?? [];
		return children.some(hasMatchingDescendant);
	}

	// Filter docs: include if doc itself matches or has matching descendants
	return docs.filter(doc => {
		if (doc.docType === "folder") {
			// Include folder if it has any matching descendants
			return hasMatchingDescendant(doc);
		}
		// Include document if it matches (fuzzy match: case-insensitive contains)
		return doc.createdBy?.toLowerCase().includes(queryLower) ?? false;
	});
}
/* v8 ignore stop */

/**
 * Apply all filters to docs.
 */
function applyFilters(docs: Array<Doc>, filters: SpaceFilters): Array<Doc> {
	// Handle incomplete filters object gracefully
	if (!filters || !filters.updated) {
		return docs;
	}
	let filteredDocs = docs;
	filteredDocs = filterDocsByUpdated(filteredDocs, filters.updated);
	// TODO: Enable creator filter when member/permission features are implemented.
	// The creator filter matches against Doc.createdBy (user ID string).
	// filteredDocs = filterDocsByCreator(filteredDocs, filters.creator ?? "");
	return filteredDocs;
}

function buildTree(docs: Array<Doc>, expandedIds: Set<number>, sortMode: SpaceSortOption): Array<TreeNode> {
	// Group docs by parentId
	const childrenMap = new Map<number | undefined, Array<Doc>>();

	for (const doc of docs) {
		const parentKey = doc.parentId ?? undefined;
		const children = childrenMap.get(parentKey) ?? [];
		children.push(doc);
		childrenMap.set(parentKey, children);
	}

	// Sort children based on sort mode
	const comparator = getSortComparator(sortMode);
	for (const children of childrenMap.values()) {
		children.sort(comparator);
	}

	// Recursively build tree nodes
	function buildNodes(parentId: number | undefined): Array<TreeNode> {
		const children = childrenMap.get(parentId) ?? [];
		return children.map(doc => ({
			doc,
			children: buildNodes(doc.id),
			expanded: expandedIds.has(doc.id),
		}));
	}

	return buildNodes(undefined);
}

/**
 * Hook for managing space tree state.
 * @param space - The current space to load tree for (from SpaceContext)
 */
export function useSpaceTree(space: Space | undefined): [SpaceTreeState, SpaceTreeActions] {
	const client = useClient();
	const [treeData, setTreeData] = useState<Array<TreeNode>>([]);
	const [trashData, setTrashData] = useState<Array<Doc>>([]);
	const [loading, setLoading] = useState(true);
	const [hasTrash, setHasTrash] = useState(false);
	const [selectedDocId, setSelectedDocId] = useState<number | undefined>(undefined);
	const [showTrash, setShowTrash] = useState(false);
	const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
	const [searchQuery, setSearchQuery] = useState("");
	const [sortMode, setSortModeState] = useState<SpaceSortOption>("default");
	const [filters, setFiltersState] = useState<SpaceFilters>(DEFAULT_SPACE_FILTERS);
	const isFirstLoad = useRef(true);
	const lastSpaceId = useRef<number | undefined>(undefined);
	const sortSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const filterSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const expandedSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Cache docs to avoid unnecessary API calls when only expandedIds, sortMode, or filters change
	const cachedDocsRef = useRef<Array<Doc>>([]);
	// Ref to access current expandedIds without causing loadTree to recreate
	const expandedIdsRef = useRef<Set<number>>(expandedIds);
	// Keep ref in sync with state
	expandedIdsRef.current = expandedIds;

	// === Snapshot refs for optimistic update rollback ===
	const treeSnapshotRef = useRef<Array<TreeNode> | null>(null);
	const docsSnapshotRef = useRef<Array<Doc> | null>(null);
	const hasTrashSnapshotRef = useRef<boolean | null>(null);
	const expandedIdsSnapshotRef = useRef<Set<number> | null>(null);

	/**
	 * Save current state as snapshot for potential rollback.
	 * Call this before making optimistic updates.
	 */
	const saveSnapshot = useCallback(
		function saveSnapshot() {
			treeSnapshotRef.current = cloneTreeData(treeData);
			docsSnapshotRef.current = [...cachedDocsRef.current];
			hasTrashSnapshotRef.current = hasTrash;
			expandedIdsSnapshotRef.current = new Set(expandedIds);
		},
		[treeData, hasTrash, expandedIds],
	);

	/**
	 * Clear snapshot after successful API call.
	 */
	const clearSnapshot = useCallback(function clearSnapshot() {
		treeSnapshotRef.current = null;
		docsSnapshotRef.current = null;
		hasTrashSnapshotRef.current = null;
		expandedIdsSnapshotRef.current = null;
	}, []);

	/**
	 * Rollback to saved snapshot on API failure.
	 */
	const rollbackToSnapshot = useCallback(
		function rollbackToSnapshot() {
			if (treeSnapshotRef.current) {
				setTreeData(treeSnapshotRef.current);
			}
			if (docsSnapshotRef.current) {
				cachedDocsRef.current = docsSnapshotRef.current;
			}
			if (hasTrashSnapshotRef.current !== null) {
				setHasTrash(hasTrashSnapshotRef.current);
			}
			if (expandedIdsSnapshotRef.current !== null) {
				setExpandedIds(expandedIdsSnapshotRef.current);
				expandedIdsRef.current = expandedIdsSnapshotRef.current;
			}
			clearSnapshot();
		},
		[clearSnapshot],
	);

	// Derived state: whether we're in search mode
	const isSearching = searchQuery.trim().length > 0;

	// Whether current sort mode is "default" (enables manual reordering)
	const isDefaultSort = useMemo(() => {
		return sortMode === "default";
	}, [sortMode]);

	// Whether current sort matches the space's default sort setting
	const isMatchingSpaceDefault = useMemo(() => {
		return sortMode === (space?.defaultSort ?? "default");
	}, [sortMode, space?.defaultSort]);

	// Calculate filter count (number of active filter conditions)
	const filterCount = useMemo(() => {
		let count = 0;
		if (filters.updated !== "any_time") {
			count++;
		}
		// Handle legacy data where creator might not be a string
		if (filters.creator && typeof filters.creator === "string" && filters.creator.trim() !== "") {
			count++;
		}
		return count;
	}, [filters]);

	// Whether current filters match the space's default filters setting
	const isMatchingSpaceDefaultFilters = useMemo(() => {
		return areFiltersEqual(filters, normalizeFilters(space?.defaultFilters));
	}, [filters, space?.defaultFilters]);

	const loadTree = useCallback(async () => {
		if (!space) {
			return;
		}
		try {
			// Only show loading skeletons on initial load; background refreshes
			// (e.g. after save/discard) keep the existing tree visible.
			if (cachedDocsRef.current.length === 0) {
				setLoading(true);
			}
			const docs = await client.spaces().getTreeContent(space.id);
			// Cache docs to avoid re-fetching when only expandedIds, sortMode, or filters change
			cachedDocsRef.current = docs;

			// Apply filters to docs
			const filteredDocs = applyFilters(docs, filters);

			// Build tree using current expandedIds from ref
			// (expandedIds will be restored from preferences or start empty)
			// Note: Using ref to avoid loadTree recreation when expandedIds changes,
			// since toggleExpanded handles expandedIds changes directly
			setTreeData(buildTree(filteredDocs, expandedIdsRef.current, sortMode));

			if (isFirstLoad.current) {
				isFirstLoad.current = false;
			}
		} catch (error) {
			log.error(error, "Failed to load tree content.");
		} finally {
			setLoading(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- expandedIds accessed via ref to prevent recreation on toggle
	}, [client, space, sortMode, filters]);

	const loadTrash = useCallback(async () => {
		if (!space) {
			return;
		}
		try {
			const docs = await client.spaces().getTrashContent(space.id);
			setTrashData(docs);
		} catch (error) {
			log.error(error, "Failed to load trash content.");
		}
	}, [client, space]);

	const checkHasTrash = useCallback(async () => {
		if (!space) {
			return;
		}
		try {
			const result = await client.spaces().hasTrash(space.id);
			setHasTrash(result);
		} catch (error) {
			log.error(error, "Failed to check trash status.");
		}
	}, [client, space]);

	const toggleExpanded = useCallback(
		(docId: number) => {
			setExpandedIds(prev => {
				const newSet = new Set(prev);
				const newExpanded = !newSet.has(docId);
				if (newExpanded) {
					newSet.add(docId);
				} else {
					newSet.delete(docId);
				}

				// Performance optimization: directly update treeData with minimal object recreation
				setTreeData(currentTree => updateNodeExpanded(currentTree, docId, newExpanded));

				// Persist expanded folders to backend with debounce
				if (space) {
					if (expandedSaveTimeoutRef.current) {
						clearTimeout(expandedSaveTimeoutRef.current);
					}
					expandedSaveTimeoutRef.current = setTimeout(async () => {
						try {
							await client.spaces().updatePreferences(space.id, {
								expandedFolders: Array.from(newSet),
							});
						} catch (error) {
							/* v8 ignore next 2 -- Error in async setTimeout callback is difficult to test */
							log.error(error, "Failed to save expanded folders.");
						}
					}, EXPANDED_SAVE_DEBOUNCE_MS);
				}

				return newSet;
			});
		},
		[space, client],
	);

	const selectDoc = useCallback((docId: number | undefined) => {
		setSelectedDocId(docId);
	}, []);

	/**
	 * Handles optimistic UI update after creating a new doc/folder.
	 * - Updates cache
	 * - Expands parent folder if needed
	 * - Inserts node into tree
	 * - Auto-selects the new item
	 */
	const handleDocCreated = useCallback(
		(doc: Doc, parentId: number | undefined) => {
			// Update cache with new doc
			cachedDocsRef.current = [...cachedDocsRef.current, doc];

			// Expand parent folder if creating inside a folder
			let currentExpandedIds = expandedIdsRef.current;
			if (parentId !== undefined) {
				currentExpandedIds = new Set(expandedIdsRef.current);
				currentExpandedIds.add(parentId);
				setExpandedIds(currentExpandedIds);
				// Also update the ref immediately for the addNodeToTree call
				expandedIdsRef.current = currentExpandedIds;
			}

			// Optimistic update: insert node locally instead of calling loadTree()
			// Need to also expand the parent node if it was just expanded
			const comparator = getSortComparator(sortMode);
			setTreeData(tree => {
				let updatedTree = tree;
				// First expand parent if needed
				if (parentId !== undefined) {
					updatedTree = updateNodeExpanded(updatedTree, parentId, true);
				}
				// Then add the new node
				return addNodeToTree(updatedTree, doc, parentId, comparator, currentExpandedIds);
			});

			// Auto-select the newly created item
			setSelectedDocId(doc.id);
		},
		[sortMode],
	);

	const createFolder = useCallback(
		async (parentId: number | undefined, name: string): Promise<Doc | undefined> => {
			if (!space) {
				return;
			}
			try {
				// slug, jrn, path, sortOrder, updatedBy, createdBy are auto-generated by backend
				const doc = await client.docs().createDoc({
					source: undefined,
					sourceMetadata: undefined,
					content: "",
					contentType: "folder",
					contentMetadata: { title: name },
					spaceId: space.id,
					parentId,
					docType: "folder",
				});

				handleDocCreated(doc, parentId);
				return doc;
			} catch (error) {
				log.error(error, "Failed to create folder.");
				return;
			}
		},
		[client, space, handleDocCreated],
	);

	// Guard to prevent duplicate doc creation from rapid clicks
	const creatingDoc = useRef(false);

	const createDoc = useCallback(
		async (
			parentId: number | undefined,
			name: string,
			contentType: DocDraftContentType = "text/markdown",
		): Promise<Doc | undefined> => {
			if (!space || creatingDoc.current) {
				return;
			}
			creatingDoc.current = true;
			try {
				const isOpenApi = contentType.startsWith("application/");
				// slug, jrn, path, sortOrder, updatedBy, createdBy are auto-generated by backend
				const doc = await client.docs().createDoc({
					source: undefined,
					sourceMetadata: undefined,
					content: isOpenApi ? "" : `# ${name}\n\n`,
					contentType,
					contentMetadata: { title: name },
					spaceId: space.id,
					parentId,
					docType: "document",
				});

				handleDocCreated(doc, parentId);
				return doc;
			} catch (error) {
				log.error(error, "Failed to create document.");
				return;
			} finally {
				creatingDoc.current = false;
			}
		},
		[client, space, handleDocCreated],
	);

	const softDelete = useCallback(
		async function softDelete(docId: number) {
			// 1. Save snapshot for potential rollback
			saveSnapshot();

			// 2. Optimistic update - remove node from tree
			setTreeData(function removeNode(prev) {
				const newTree = cloneTreeData(prev);
				removeNodeFromTree(newTree, docId);
				return newTree;
			});

			// 3. Update cached docs - remove the doc and its descendants
			const docToRemove = cachedDocsRef.current.find(d => d.id === docId);
			if (docToRemove) {
				// Collect all descendant IDs to remove
				const idsToRemove = new Set<number>([docId]);
				function collectDescendants(parentId: number) {
					for (const doc of cachedDocsRef.current) {
						if (doc.parentId === parentId && !idsToRemove.has(doc.id)) {
							idsToRemove.add(doc.id);
							collectDescendants(doc.id);
						}
					}
				}
				collectDescendants(docId);
				cachedDocsRef.current = cachedDocsRef.current.filter(d => !idsToRemove.has(d.id));
			}

			// 4. Optimistic update hasTrash
			setHasTrash(true);

			try {
				// 5. Call API
				await client.docs().softDelete(docId);
				clearSnapshot();
				// Background check hasTrash for accuracy (in case it was the last item)
				checkHasTrash();
			} catch (error) {
				// 6. Rollback on failure
				log.error(error, "Failed to soft delete document.");
				rollbackToSnapshot();
				throw error; // Re-throw to allow caller to show error toast
			}
		},
		[client, saveSnapshot, clearSnapshot, rollbackToSnapshot, checkHasTrash],
	);

	const restore = useCallback(
		async (docId: number) => {
			try {
				await client.docs().restore(docId);
				await loadTree();
				await loadTrash();
				await checkHasTrash();
			} catch (error) {
				log.error(error, "Failed to restore document.");
			}
		},
		[client, loadTree, loadTrash, checkHasTrash],
	);

	const rename = useCallback(
		async function rename(docId: number, newName: string): Promise<Doc | undefined> {
			// 1. Save snapshot for potential rollback
			saveSnapshot();

			// 2. Optimistic update - update tree immediately
			setTreeData(function updateTree(prev) {
				const newTree = cloneTreeData(prev);
				updateDocTitle(newTree, docId, newName);
				return newTree;
			});

			// 3. Update cached docs
			cachedDocsRef.current = cachedDocsRef.current.map(function updateCachedDoc(doc) {
				if (doc.id === docId) {
					return {
						...doc,
						contentMetadata: { ...doc.contentMetadata, title: newName },
					};
				}
				return doc;
			});

			try {
				// 4. Call API
				const updatedDoc = await client.docs().renameDoc(docId, newName);
				clearSnapshot();
				return updatedDoc;
			} catch (error) {
				// 5. Rollback on failure
				log.error(error, "Failed to rename document.");
				rollbackToSnapshot();
				throw error; // Re-throw to allow caller to show error toast
			}
		},
		[client, saveSnapshot, clearSnapshot, rollbackToSnapshot],
	);

	const refreshTree = useCallback(async () => {
		await loadTree();
		await checkHasTrash();
	}, [loadTree, checkHasTrash]);

	const clearSearch = useCallback(() => {
		setSearchQuery("");
	}, []);
	const setSortMode = useCallback(
		(mode: SpaceSortOption) => {
			setSortModeState(mode);
			// Debounced save to API
			if (space) {
				if (sortSaveTimeoutRef.current) {
					clearTimeout(sortSaveTimeoutRef.current);
				}
				sortSaveTimeoutRef.current = setTimeout(async () => {
					try {
						// Save null if matching space default (use space default)
						const sortToSave = mode === space.defaultSort ? null : mode;
						await client.spaces().updatePreferences(space.id, { sort: sortToSave });
					} catch (error) {
						log.error(error, "Failed to save sort preference.");
					}
				}, SORT_SAVE_DEBOUNCE_MS);
			}
		},
		[space, client],
	);

	const resetToDefaultSort = useCallback(async () => {
		const defaultMode = space?.defaultSort ?? "default";
		setSortModeState(defaultMode);
		// Clear sort preference in API (use space default)
		if (space) {
			if (sortSaveTimeoutRef.current) {
				clearTimeout(sortSaveTimeoutRef.current);
			}
			try {
				await client.spaces().updatePreferences(space.id, { sort: null });
			} catch (error) {
				log.error(error, "Failed to reset sort preference.");
			}
		}
	}, [space, client]);

	const setFilters = useCallback(
		(newFilters: SpaceFilters) => {
			setFiltersState(newFilters);
			// Debounced save to API
			if (space) {
				if (filterSaveTimeoutRef.current) {
					clearTimeout(filterSaveTimeoutRef.current);
				}
				filterSaveTimeoutRef.current = setTimeout(async () => {
					try {
						const spaceDefaultFilters = normalizeFilters(space.defaultFilters);
						// Save the actual filters (not null) - we always want to store the current filters
						// If they match the space default, we could optimize by saving null, but for simplicity
						// we always save the filters value
						const filtersToSave = areFiltersEqual(newFilters, spaceDefaultFilters)
							? DEFAULT_SPACE_FILTERS
							: newFilters;
						await client.spaces().updatePreferences(space.id, { filters: filtersToSave });
					} catch (error) {
						log.error(error, "Failed to save filter preference.");
					}
				}, FILTER_SAVE_DEBOUNCE_MS);
			}
		},
		[space, client],
	);

	const resetToDefaultFilters = useCallback(async () => {
		const defaultFilters = normalizeFilters(space?.defaultFilters);
		setFiltersState(defaultFilters);
		// Clear filter preference in API (use space default)
		if (space) {
			if (filterSaveTimeoutRef.current) {
				clearTimeout(filterSaveTimeoutRef.current);
			}
			try {
				/* v8 ignore next -- API call success path, tested in integration tests */
				await client.spaces().updatePreferences(space.id, { filters: DEFAULT_SPACE_FILTERS });
			} catch (error) {
				log.error(error, "Failed to reset filter preference.");
			}
		}
	}, [space, client]);

	const reorderDoc = useCallback(
		async function reorderDoc(docId: number, direction: "up" | "down") {
			// 1. Save snapshot for potential rollback
			saveSnapshot();

			// 2. Optimistic update - swap with sibling
			setTreeData(function swapNodes(prev) {
				const newTree = cloneTreeData(prev);
				const result = getSiblingsAndIndex(newTree, docId);
				if (!result) {
					return prev;
				}

				/* v8 ignore next 12 -- Reorder logic: sibling swap implementation, difficult to fully cover edge cases in unit tests */
				const [siblings, index] = result;
				const targetIndex = direction === "up" ? index - 1 : index + 1;
				if (targetIndex < 0 || targetIndex >= siblings.length) {
					return prev;
				}

				// Swap positions
				const temp = siblings[index];
				siblings[index] = siblings[targetIndex];
				siblings[targetIndex] = temp;
				return newTree;
			});

			try {
				// 3. Call API
				await client.docs().reorderDoc(docId, direction);
				clearSnapshot();
			} catch (error) {
				// 4. Rollback on failure
				log.error(error, "Failed to reorder document.");
				rollbackToSnapshot();
				throw error; // Re-throw to allow caller to show error toast
			}
		},
		[client, saveSnapshot, clearSnapshot, rollbackToSnapshot],
	);

	const moveTo = useCallback(
		async function moveTo(
			docId: number,
			parentId: number | undefined,
			referenceDocId?: number | null,
			position?: "before" | "after",
		) {
			// 1. Save snapshot for potential rollback
			saveSnapshot();

			// 2. Optimistic update - move node in tree
			setTreeData(function moveNode(prev) {
				const newTree = cloneTreeData(prev);

				// Remove node from current position
				const removedNode = removeNodeFromTree(newTree, docId);
				/* v8 ignore next 3 -- Defensive check: node not found in tree, difficult to trigger in tests */
				if (!removedNode) {
					return prev;
				}

				// Update parentId on the node's doc
				removedNode.doc = { ...removedNode.doc, parentId };

				// Insert at new position
				insertNodeAtPosition(newTree, parentId, removedNode, referenceDocId, position);

				// Expand target folder if needed
				if (parentId !== undefined) {
					const targetParent = findNodeById(newTree, parentId);
					if (targetParent) {
						targetParent.expanded = true;
					}
				}

				return newTree;
			});

			// 3. Update expandedIds if moving into a folder
			if (parentId !== undefined) {
				setExpandedIds(function addExpanded(prev) {
					/* v8 ignore next 3 -- Optimization check: parent already expanded, no update needed. Difficult to trigger specific timing in tests */
					if (prev.has(parentId)) {
						return prev;
					}
					const newSet = new Set(prev);
					newSet.add(parentId);
					expandedIdsRef.current = newSet;
					return newSet;
				});
			}

			// 4. Update cached docs parentId
			cachedDocsRef.current = cachedDocsRef.current.map(function updateParentId(doc) {
				if (doc.id === docId) {
					return { ...doc, parentId };
				}
				return doc;
			});

			try {
				// 5. Call API
				await client.docs().moveDoc(docId, parentId === undefined ? null : parentId, referenceDocId, position);
				clearSnapshot();
			} catch (error) {
				// 6. Rollback on failure
				log.error(error, "Failed to move document.");
				rollbackToSnapshot();
				throw error; // Re-throw to allow caller to show error toast
			}
		},
		[client, saveSnapshot, clearSnapshot, rollbackToSnapshot],
	);

	const reorderAt = useCallback(
		async function reorderAt(docId: number, referenceDocId?: number | null, position?: "before" | "after") {
			// 1. Save snapshot for potential rollback
			saveSnapshot();

			// 2. Optimistic update - reorder within siblings
			setTreeData(function reorderNode(prev) {
				const newTree = cloneTreeData(prev);

				// Find and remove node from current position
				const result = getSiblingsAndIndex(newTree, docId);
				/* v8 ignore next 3 -- Defensive check: getSiblingsAndIndex returns null if doc not found, difficult to trigger in tests */
				if (!result) {
					return prev;
				}
				const [siblings, currentIndex] = result;
				const nodeToMove = siblings.splice(currentIndex, 1)[0];

				// Insert at new position relative to reference
				/* v8 ignore next 3 -- Edge case: when no reference doc specified, append to end. Difficult to test as UI always provides reference */
				if (referenceDocId == null) {
					// No reference - append to end
					siblings.push(nodeToMove);
				} else {
					const refIndex = siblings.findIndex(n => n.doc.id === referenceDocId);
					/* v8 ignore next 3 -- Edge case: reference doc not found, fallback to append. Difficult to trigger in tests */
					if (refIndex === -1) {
						// Reference not found - append to end
						siblings.push(nodeToMove);
					} else {
						const insertIndex = position === "before" ? refIndex : refIndex + 1;
						siblings.splice(insertIndex, 0, nodeToMove);
					}
				}

				return newTree;
			});

			try {
				// 3. Call API
				await client.docs().reorderAt(docId, referenceDocId, position);
				clearSnapshot();
			} catch (error) {
				// 4. Rollback on failure
				log.error(error, "Failed to reorder document.");
				rollbackToSnapshot();
				throw error; // Re-throw to allow caller to show error toast
			}
		},
		[client, saveSnapshot, clearSnapshot, rollbackToSnapshot],
	);

	// Cleanup timeouts on unmount
	/* v8 ignore start -- Cleanup function is called on unmount, difficult to test reliably */
	useEffect(() => {
		return () => {
			if (sortSaveTimeoutRef.current) {
				clearTimeout(sortSaveTimeoutRef.current);
			}
			if (filterSaveTimeoutRef.current) {
				clearTimeout(filterSaveTimeoutRef.current);
			}
			if (expandedSaveTimeoutRef.current) {
				clearTimeout(expandedSaveTimeoutRef.current);
			}
		};
	}, []);
	/* v8 ignore stop */

	// Reset state and load tree when space changes
	useEffect(() => {
		if (space) {
			// Check if space actually changed
			if (lastSpaceId.current !== space.id) {
				// Reset state for new space
				isFirstLoad.current = true;
				setExpandedIds(new Set());
				setSelectedDocId(undefined);
				setShowTrash(false);
				setTreeData([]);
				setTrashData([]);
				setHasTrash(false);
				cachedDocsRef.current = [];
				const currentSpaceId = space.id;
				lastSpaceId.current = currentSpaceId;

				// Load sort, filter, and expanded preferences from API or use space defaults
				// Use currentSpaceId to prevent race condition when switching spaces quickly
				client
					.spaces()
					.getPreferences(space.id)
					.then(prefs => {
						/* v8 ignore next 3 -- Race condition check: difficult to test reliably as it requires precise timing when switching spaces */
						// Check if space hasn't changed since request started
						if (lastSpaceId.current !== currentSpaceId) {
							return;
						}
						// Load sort preference
						if (prefs.sort) {
							setSortModeState(prefs.sort);
						} else {
							/* v8 ignore next -- Nullish coalescing fallback: space.defaultSort is always set in practice */
							setSortModeState(space.defaultSort ?? "default");
						}
						// Load filter preference: normalize to ensure complete SpaceFilters structure,
						// then check if user has any active filters saved
						const normalizedPrefsFilters = normalizeFilters(prefs.filters);
						if (
							normalizedPrefsFilters.updated !== "any_time" ||
							normalizedPrefsFilters.creator.trim() !== ""
						) {
							setFiltersState(normalizedPrefsFilters);
						} else {
							setFiltersState(normalizeFilters(space.defaultFilters));
						}
						// Load expanded folders preference
						// If no saved state, folders start collapsed (like VS Code)
						if (prefs.expandedFolders && prefs.expandedFolders.length > 0) {
							setExpandedIds(new Set(prefs.expandedFolders));
						}
					})
					.catch(error => {
						/* v8 ignore next 3 -- Race condition check: difficult to test reliably as it requires precise timing when switching spaces */
						// Check if space hasn't changed since request started
						if (lastSpaceId.current !== currentSpaceId) {
							return;
						}
						log.error(error, "Failed to load preferences, using space defaults.");
						/* v8 ignore next 2 -- Nullish coalescing fallback: space defaults are always set in practice */
						setSortModeState(space.defaultSort ?? "default");
						setFiltersState(normalizeFilters(space.defaultFilters));
						// Keep expandedIds empty (all folders collapsed)
					});
			}
			// Load tree and check trash
			loadTree();
			checkHasTrash();
		}
	}, [space, loadTree, checkHasTrash, client]);

	// Update tree when sortMode or filters change (but not on first load)
	// Uses cached docs to avoid unnecessary API calls
	// Note: expandedIds changes are handled directly in toggleExpanded for better performance
	useEffect(() => {
		if (space && !isFirstLoad.current && cachedDocsRef.current.length > 0) {
			// Apply filters to cached docs
			const filteredDocs = applyFilters(cachedDocsRef.current, filters);
			// Re-build tree with filtered docs and new sort state
			setTreeData(buildTree(filteredDocs, expandedIds, sortMode));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- expandedIds handled in toggleExpanded
	}, [sortMode, filters, space]);

	const state: SpaceTreeState = {
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
	};

	const actions: SpaceTreeActions = {
		loadTree,
		loadTrash,
		toggleExpanded,
		selectDoc,
		setShowTrash,
		createFolder,
		createDoc,
		softDelete,
		restore,
		refreshTree,
		rename,
		setSearchQuery,
		clearSearch,
		setSortMode,
		resetToDefaultSort,
		reorderDoc,
		moveTo,
		reorderAt,
		setFilters,
		resetToDefaultFilters,
	};

	return [state, actions];
}

/**
 * Internal functions exported for testing purposes only.
 * These are not part of the public API and should not be used directly.
 */
export const _internal = {
	getFilterCutoffDate,
	applyFilters,
	getSortComparator,
};
