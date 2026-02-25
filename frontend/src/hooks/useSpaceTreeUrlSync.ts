import { useNavigation } from "../contexts/NavigationContext";
import { useLocation } from "../contexts/RouterContext";
import type { SpaceTreeActions, SpaceTreeState } from "./useSpaceTree";
import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Hook that syncs space tree selection with URL parameters.
 *
 * This hook provides:
 * 1. Syncing URL `doc` parameter to tree state when URL changes
 * 2. Refreshing tree when returning from edit mode (to sync any changes like renamed articles)
 * 3. Wrapping selectDoc action to update URL when selection changes
 *
 * @param treeState - The current space tree state from useSpaceTree
 * @param treeActions - The space tree actions from useSpaceTree
 * @returns Wrapped actions with URL-syncing selectDoc
 *
 * @example
 * ```tsx
 * const [treeState, treeActions] = useSpaceTree(currentSpace);
 * const syncedActions = useSpaceTreeUrlSync(treeState, treeActions);
 *
 * // Use syncedActions.selectDoc instead of treeActions.selectDoc
 * <SpaceTreeNav state={treeState} actions={syncedActions} />
 * ```
 */
export function useSpaceTreeUrlSync(treeState: SpaceTreeState, treeActions: SpaceTreeActions): SpaceTreeActions {
	const { selectedDocId: urlDocId, inlineEditDraftId, navigate } = useNavigation();
	const location = useLocation();
	const prevInlineEditDraftIdRef = useRef<number | undefined>(undefined);

	// Sync URL doc parameter to tree state when URL changes (e.g., returning from edit mode)
	useEffect(() => {
		if (urlDocId !== undefined && urlDocId !== treeState.selectedDocId) {
			treeActions.selectDoc(urlDocId);
		}
	}, [urlDocId, treeState.selectedDocId, treeActions]);

	// Refresh tree when returning from edit mode to sync any changes (e.g., renamed article)
	useEffect(() => {
		// Detect transition from edit mode back to normal mode
		if (prevInlineEditDraftIdRef.current !== undefined && inlineEditDraftId === undefined) {
			treeActions.refreshTree();
		}
		prevInlineEditDraftIdRef.current = inlineEditDraftId;
	}, [inlineEditDraftId, treeActions]);

	// Wrapper for selectDoc that also updates URL
	const handleDocSelect = useCallback(
		(docId: number | undefined) => {
			if (docId !== undefined && docId === treeState.selectedDocId) {
				return;
			}
			treeActions.selectDoc(docId);
			const params = new URLSearchParams(location.search);
			params.delete("edit");
			if (docId !== undefined) {
				params.set("doc", String(docId));
			} else {
				params.delete("doc");
			}
			const queryString = params.toString();
			navigate(`/articles${queryString ? `?${queryString}` : ""}`);
		},
		[treeActions, treeState.selectedDocId, location.search, navigate],
	);

	// Create modified actions with URL-syncing selectDoc
	const syncedActions = useMemo(
		() => ({
			...treeActions,
			selectDoc: handleDocSelect,
		}),
		[treeActions, handleDocSelect],
	);

	return syncedActions;
}
