import { SpaceIcon } from "../components/SpaceIcon";
import { ContentShell } from "../components/ui/ContentShell";
import { Empty } from "../components/ui/Empty";
import { FloatingPanel } from "../components/ui/FloatingPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/Resizable";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { usePreferencesService } from "../contexts/PreferencesContext";
import { useCurrentSpace, useSpace } from "../contexts/SpaceContext";
import { usePreference, usePreferenceValue } from "../hooks/usePreference";
import { type TreeNode, useSpaceTree } from "../hooks/useSpaceTree";
import { useSpaceTreeUrlSync } from "../hooks/useSpaceTreeUrlSync";
import { PREFERENCES } from "../services/preferences/PreferencesRegistry";
import { SUGGESTIONS_CHANGED_EVENT } from "../util/SuggestionEvents";
import { ArticleSitesBadge } from "./spaces/ArticleSitesBadge";
import { ChangesetReviewWorkbench } from "./spaces/ChangesetReviewWorkbench";
import { type BreadcrumbPathItem, buildBreadcrumbPath, CollapsibleBreadcrumb } from "./spaces/CollapsibleBreadcrumb";
import { SpaceTreeNav } from "./spaces/SpaceTreeNav";
import type { SyncChangesetWithSummary } from "jolli-common";
import { ChevronRight, FileQuestion, PanelLeft } from "lucide-react";
import { lazy, type ReactElement, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/** Lazy-loaded — defers the tiptap editor (~620 KB vendor) until inline editing. */
const LazyArticleDraft = lazy(() => import("./ArticleDraft").then(mod => ({ default: mod.ArticleDraft })));

/**
 * Finds the first non-folder document in the tree via depth-first traversal.
 * Returns the doc ID or undefined if no documents exist.
 */
function findFirstDocument(nodes: Array<TreeNode>): number | undefined {
	for (const node of nodes) {
		if (node.doc.docType !== "folder") {
			return node.doc.id;
		}
		const found = findFirstDocument(node.children);
		if (found !== undefined) {
			return found;
		}
	}
	return;
}

/**
 * Checks if a document with the given ID exists anywhere in the tree.
 */
function docExistsInTree(nodes: Array<TreeNode>, docId: number): boolean {
	for (const node of nodes) {
		if (node.doc.id === docId) {
			return true;
		}
		if (docExistsInTree(node.children, docId)) {
			return true;
		}
	}
	return false;
}

/**
 * Spaces page component.
 * Uses the global SpaceProvider from MainElement, sharing state with the unified sidebar.
 * Displays a tree navigation on the left and article content on the right.
 * The tree panel can be pinned (expanded) or collapsed to a thin rail with an expand button.
 */
export function Spaces(): ReactElement {
	const content = useIntlayer("spaces");
	const client = useClient();
	const { inlineEditDraftId, selectedDocId: urlDocId } = useNavigation();
	const currentSpace = useCurrentSpace();
	const [treeState, treeActions] = useSpaceTree(currentSpace);
	const syncedActions = useSpaceTreeUrlSync(treeState, treeActions);
	const { switchSpace } = useSpace();
	const [isTreePinned, setIsTreePinned] = usePreference(PREFERENCES.spacesTreePanelPinned);
	const preferencesService = usePreferencesService();
	const sidebarCollapsed = usePreferenceValue(PREFERENCES.sidebarCollapsed);
	const [docIdsWithSuggestions, setDocIdsWithSuggestions] = useState<Array<number>>([]);
	/** Ref element for the portal target where ArticleDraft renders header actions */
	const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(null);
	const [selectedChangeset, setSelectedChangeset] = useState<SyncChangesetWithSummary | undefined>();
	const [bundleRefreshKey, setBundleRefreshKey] = useState(0);
	const hasCheckedUrlDocSpace = useRef(false);
	const hasAutoSelected = useRef(false);

	// Fetch docs with pending suggestions
	const fetchDocsWithSuggestions = useCallback(async () => {
		try {
			const draftsWithChanges = await client.docDrafts().getDraftsWithPendingChanges();
			const docIds = draftsWithChanges.filter(d => d.draft.docId !== undefined).map(d => d.draft.docId as number);
			setDocIdsWithSuggestions(docIds);
		} catch (error) {
			// Non-critical: suggestion dots are a visual indicator only
			console.error("Failed to fetch docs with pending suggestions:", error);
		}
	}, [client]);

	// Initial fetch on mount
	useEffect(() => {
		fetchDocsWithSuggestions();
	}, [fetchDocsWithSuggestions]);

	// Re-fetch when suggestions change (apply/dismiss/create) in other components
	useEffect(() => {
		window.addEventListener(SUGGESTIONS_CHANGED_EVENT, fetchDocsWithSuggestions);
		return () => window.removeEventListener(SUGGESTIONS_CHANGED_EVENT, fetchDocsWithSuggestions);
	}, [fetchDocsWithSuggestions]);

	// On mount, if URL has ?doc=ID, check if the doc belongs to a different Space and switch
	useEffect(() => {
		if (hasCheckedUrlDocSpace.current || urlDocId === undefined || !currentSpace) {
			return;
		}
		hasCheckedUrlDocSpace.current = true;

		async function checkAndSwitchSpace() {
			try {
				const doc = await client.docs().getDocById(urlDocId as number);
				if (doc?.spaceId && doc.spaceId !== currentSpace?.id) {
					await switchSpace(doc.spaceId);
				}
			} catch {
				// Non-critical: if fetch fails, stay on current space
			}
		}
		checkAndSwitchSpace();
	}, [urlDocId, currentSpace, client, switchSpace]);

	// Memoize the Set for performance
	const docsWithSuggestions = useMemo(() => new Set(docIdsWithSuggestions), [docIdsWithSuggestions]);

	// Reset auto-select flag and changeset selection when space changes
	useEffect(() => {
		hasAutoSelected.current = false;
		setSelectedChangeset(undefined);
	}, [currentSpace?.id]);

	const handleChangesetMutation = useCallback(() => {
		setBundleRefreshKey(previous => previous + 1);
	}, []);

	// Auto-select article when tree loads and no doc is selected.
	// Checks localStorage for last-viewed article, falls back to first document in the tree.
	useEffect(() => {
		if (
			treeState.loading ||
			treeState.treeData.length === 0 ||
			treeState.selectedDocId !== undefined ||
			urlDocId !== undefined ||
			inlineEditDraftId !== undefined ||
			!currentSpace ||
			hasAutoSelected.current
		) {
			return;
		}
		hasAutoSelected.current = true;

		const lastViewedId = preferencesService.get(PREFERENCES.lastViewedArticle(currentSpace.id));
		if (lastViewedId !== null && docExistsInTree(treeState.treeData, lastViewedId)) {
			syncedActions.selectDoc(lastViewedId);
		} else {
			const firstDocId = findFirstDocument(treeState.treeData);
			if (firstDocId !== undefined) {
				syncedActions.selectDoc(firstDocId);
			}
		}
	}, [
		treeState.loading,
		treeState.treeData,
		treeState.selectedDocId,
		urlDocId,
		inlineEditDraftId,
		currentSpace,
		syncedActions,
		preferencesService,
	]);

	// Track the space ID that the current persist belongs to, so we skip stale writes on space switch
	const persistSpaceId = useRef<number | undefined>(currentSpace?.id);
	useEffect(() => {
		if (currentSpace?.id !== persistSpaceId.current) {
			// Space just changed — update ref and skip this render (selectedDocId is stale from previous space)
			persistSpaceId.current = currentSpace?.id;
			return;
		}
		if (treeState.selectedDocId !== undefined && currentSpace) {
			preferencesService.set(PREFERENCES.lastViewedArticle(currentSpace.id), treeState.selectedDocId);
		}
	}, [treeState.selectedDocId, currentSpace, preferencesService]);

	// Get the selected document for the right panel (memoized to avoid full tree traversal on every render)
	const selectedDoc = useMemo(() => {
		return treeState.treeData
			.flatMap(function flattenNodes(node): Array<{ doc: typeof node.doc }> {
				return [{ doc: node.doc }, ...node.children.flatMap(flattenNodes)];
			})
			.find(item => item.doc.id === treeState.selectedDocId);
	}, [treeState.treeData, treeState.selectedDocId]);

	const selectedJrn = selectedDoc?.doc.jrn;

	// Build breadcrumb path for the selected article
	const breadcrumbPath = useMemo((): Array<BreadcrumbPathItem> => {
		if (treeState.selectedDocId === undefined) {
			return [];
		}
		return buildBreadcrumbPath(treeState.treeData, treeState.selectedDocId);
	}, [treeState.treeData, treeState.selectedDocId]);

	// Handle breadcrumb folder navigation — select the folder in the tree
	const handleBreadcrumbNavigate = useCallback(
		(item: BreadcrumbPathItem) => {
			syncedActions.selectDoc(item.id);
		},
		[syncedActions],
	);

	/** Renders the space name with the SpaceIcon (matching sidebar/switcher colors). */
	function renderSpaceLabel(): ReactElement | null {
		/* v8 ignore next 3 - defensive: Spaces component always has a currentSpace set */
		if (!currentSpace) {
			return null;
		}
		return (
			<div className="flex items-center gap-1.5 shrink-0 min-w-0">
				<SpaceIcon name={currentSpace.name} size={5} isPersonal={currentSpace.isPersonal} />
				<span className="text-sm font-medium truncate">{currentSpace.name}</span>
			</div>
		);
	}

	/** Renders the tree-expand button used in all collapsed-panel headers. */
	function renderExpandButton(testId: string): ReactElement {
		return (
			<button
				type="button"
				className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
				onClick={() => setIsTreePinned(true)}
				title={content.expandTree.value}
				aria-label={content.expandTree.value}
				data-testid={testId}
			>
				<PanelLeft className="h-4 w-4" />
			</button>
		);
	}

	/** Handles article deletion from within the editor — refreshes tree after API delete */
	const handleArticleDeleted = useCallback(
		(_docId: number) => {
			// Article already soft-deleted via API in ArticleDraft.
			// Refresh the tree to reflect the removal.
			treeActions.refreshTree();
		},
		[treeActions],
	);

	/** Renders the always-editable article editor (lazy-loaded). */
	function renderArticleEditor(): ReactElement {
		const selectedTitle = selectedDoc?.doc.contentMetadata?.title ?? selectedDoc?.doc.slug;
		return (
			<Suspense fallback={<div className="flex h-full items-center justify-center" />}>
				<LazyArticleDraft
					key={selectedJrn ?? "new"}
					{...(inlineEditDraftId !== undefined ? { draftId: inlineEditDraftId } : {})}
					{...(selectedJrn && inlineEditDraftId === undefined
						? { articleJrn: selectedJrn, articleTitle: selectedTitle }
						: {})}
					onArticleDeleted={handleArticleDeleted}
					headerActionsContainer={headerActionsEl}
				/>
			</Suspense>
		);
	}

	// Single layout for both pinned and collapsed modes.
	// Using a stable DOM tree prevents ArticleDraft from remounting (which would
	// destroy TOC state, editor state, SSE connections, etc.) when the tree panel
	// is collapsed or expanded.
	return (
		<ContentShell>
			<ResizablePanelGroup direction="horizontal" className="h-full">
				{/* Left side: Tree navigation — hidden when collapsed */}
				{isTreePinned && (
					<>
						<ResizablePanel
							key="tree"
							defaultSize={17}
							minSize={15}
							maxSize={35}
							data-testid="pinned-tree-panel"
						>
							<FloatingPanel className="h-full overflow-hidden">
								<SpaceTreeNav
									state={treeState}
									actions={syncedActions}
									onCollapse={() => setIsTreePinned(false)}
									docsWithSuggestions={docsWithSuggestions}
									selectedChangesetId={selectedChangeset?.id}
									onSelectChangeset={setSelectedChangeset}
									bundleRefreshKey={bundleRefreshKey}
								/>
							</FloatingPanel>
						</ResizablePanel>
						<ResizableHandle
							key="handle"
							withHandle
							className="bg-transparent"
							data-testid="pinned-panel-resize-handle"
						/>
					</>
				)}

				{/* Right side: Content area — always at the same key so React reuses it */}
				<ResizablePanel key="content" defaultSize={isTreePinned ? 83 : 100} minSize={65}>
					<div className="h-full pl-[3px] flex flex-col gap-1">
						{selectedChangeset ? (
							<ChangesetReviewWorkbench
								changeset={selectedChangeset}
								spaceSlug={currentSpace?.slug}
								onCloseReview={() => setSelectedChangeset(undefined)}
								onChangesetMutated={handleChangesetMutation}
							/>
						) : selectedJrn || inlineEditDraftId !== undefined ? (
							<>
								{/* Header panel — breadcrumb + article actions */}
								<FloatingPanel className="shrink-0">
									<div className="h-12 px-4 flex items-center gap-2">
										{!isTreePinned && renderExpandButton("collapsed-rail-expand-button")}
										{!isTreePinned && renderSpaceLabel()}
										{!isTreePinned && breadcrumbPath.length > 0 && (
											<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										)}
										{currentSpace && breadcrumbPath.length > 0 && (
											<CollapsibleBreadcrumb
												spaceName={currentSpace.name}
												path={breadcrumbPath}
												sidebarCollapsed={sidebarCollapsed}
												onNavigate={handleBreadcrumbNavigate}
												hideSpaceName
											/>
										)}
										{selectedJrn && <ArticleSitesBadge articleJrn={selectedJrn} />}
										{/* Portal target — ArticleDraft renders its header actions here */}
										<div ref={setHeaderActionsEl} className="ml-auto flex items-center gap-2" />
									</div>
								</FloatingPanel>
								{/* Editor panel */}
								<FloatingPanel className="flex-1 overflow-hidden">
									{renderArticleEditor()}
								</FloatingPanel>
							</>
						) : (
							<>
								{/* Header panel — expand button + space name */}
								{!isTreePinned && (
									<FloatingPanel className="shrink-0">
										<div className="h-12 px-4 flex items-center gap-2">
											{renderExpandButton("collapsed-rail-expand-button-empty")}
											{renderSpaceLabel()}
										</div>
									</FloatingPanel>
								)}
								{/* Empty state */}
								<FloatingPanel className="flex-1">
									<Empty
										icon={<FileQuestion className="h-12 w-12" />}
										title={content.selectDocument}
										description={content.selectDocumentDescription}
										className="h-full"
									/>
								</FloatingPanel>
							</>
						)}
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</ContentShell>
	);
}
