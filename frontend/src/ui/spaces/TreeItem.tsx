import { cn } from "../../common/ClassNameUtils";
import { HoverTooltip } from "../../components/ui/HoverTooltip";
import type { TreeNode } from "../../hooks/useSpaceTree";
import { CreateItemDialog, type FolderOption } from "./CreateItemDialog";
import { ItemActionMenu } from "./ItemActionMenu";
import { MoveItemDialog } from "./MoveItemDialog";
import { RenameItemDialog } from "./RenameItemDialog";
import styles from "./TreeItem.module.css";
import type { DocDraftContentType } from "jolli-common";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import type { ReactElement, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Recursively collects all descendant IDs from a tree node.
 * Used to prevent moving a folder into itself or its descendants.
 */
function getAllDescendantIds(node: TreeNode): Array<number> {
	const ids: Array<number> = [];
	for (const child of node.children) {
		ids.push(child.doc.id);
		ids.push(...getAllDescendantIds(child));
	}
	return ids;
}

/** Delay before resetting createDialogMode after dialog closes, allowing close animation to complete */
const DIALOG_CLOSE_ANIMATION_MS = 150;

export interface TreeItemProps {
	node: TreeNode;
	depth: number;
	selectedDocId: number | undefined;
	treeData: Array<TreeNode>;
	folders: Array<FolderOption>;
	onSelect: (docId: number) => void;
	onToggleExpand: (docId: number) => void;
	onDelete: (docId: number) => Promise<void>;
	onRename: (docId: number, newName: string) => Promise<void>;
	onCreateFolder: (parentId: number | undefined, name: string) => Promise<void>;
	onCreateDoc: (parentId: number | undefined, name: string, contentType?: DocDraftContentType) => Promise<void>;
	/** Whether the current sort mode is "default" (enables Move Up/Down) */
	isDefaultSort?: boolean;
	/** Index of this item among its siblings (for determining Move Up/Down availability) */
	siblingIndex?: number;
	/** Total count of siblings (for determining Move Down availability) */
	siblingCount?: number;
	/** Called when Move Up/Down is clicked */
	onReorderDoc?: ((docId: number, direction: "up" | "down") => Promise<void>) | undefined;
	/** Called when Move to is clicked */
	onMoveTo?: ((docId: number, parentId: number | undefined) => Promise<void>) | undefined;
	/** Set of doc IDs that have pending suggestions (for articles) */
	docsWithSuggestions?: Set<number> | undefined;
	/** Set of folder IDs whose descendants have pending suggestions */
	foldersWithSuggestions?: Set<number> | undefined;
	/** Whether this item is currently being dragged */
	isDragging?: boolean;
	/** The ID of the currently dragged item (for recursive children) */
	activeId?: number | null;
	/** Whether a drag interaction is active (used to freeze hover/selection visuals) */
	isDragInteraction?: boolean;
	/** IDs of all descendants of the currently dragged item (for graying out descendants) */
	draggedDescendantIds?: Set<number>;
	/** Pointer down handler for custom drag */
	onDragPointerDown?: ((docId: number, event: ReactPointerEvent) => void) | undefined;
}

export function TreeItem({
	node,
	depth,
	selectedDocId,
	treeData,
	folders,
	onSelect,
	onToggleExpand,
	onDelete,
	onRename,
	onCreateFolder,
	onCreateDoc,
	isDefaultSort = false,
	siblingIndex = 0,
	siblingCount = 1,
	onReorderDoc,
	onMoveTo,
	docsWithSuggestions,
	foldersWithSuggestions,
	isDragging = false,
	activeId = null,
	isDragInteraction = false,
	draggedDescendantIds,
	onDragPointerDown,
}: TreeItemProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const [isHovered, setIsHovered] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [showRenameDialog, setShowRenameDialog] = useState(false);
	const [showMoveDialog, setShowMoveDialog] = useState(false);
	const [createDialogMode, setCreateDialogMode] = useState<"folder" | "article" | null>(null);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const { doc, children, expanded } = node;
	const isSelected = selectedDocId === doc.id;
	const title = doc.contentMetadata?.title || doc.jrn;
	const isFolder = doc.docType === "folder";

	// Determine if this item should show the "has suggestions" yellow dot
	const hasSuggestions = isFolder
		? (foldersWithSuggestions?.has(doc.id) ?? false)
		: (docsWithSuggestions?.has(doc.id) ?? false);

	useEffect(() => {
		if (isDragInteraction) {
			setIsHovered(false);
		}
	}, [isDragInteraction]);

	// Calculate excluded folder IDs (self and descendants) to prevent circular references
	const excludedIds = useMemo(() => {
		const excluded = new Set<number>();
		excluded.add(doc.id); // Cannot move to itself
		if (isFolder) {
			// Cannot move folder to its descendants
			const descendantIds = getAllDescendantIds(node);
			for (const id of descendantIds) {
				excluded.add(id);
			}
		}
		return excluded;
	}, [doc.id, isFolder, node]);

	// Calculate Move Up/Down availability based on sibling position
	const canMoveUp = siblingIndex > 0;
	const canMoveDown = siblingIndex < siblingCount - 1;

	function handleClick() {
		if (isDragInteraction) {
			return;
		}
		// Select the item (both folders and documents)
		onSelect(doc.id);
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (isDragInteraction) {
			return;
		}
		const target = event.target as HTMLElement;
		if (target.closest('button, [role="button"], [data-no-drag="true"]')) {
			return;
		}
		onDragPointerDown?.(doc.id, event);
	}

	function handleChevronClick(e: React.MouseEvent) {
		e.stopPropagation(); // Prevent triggering handleClick
		onToggleExpand(doc.id);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	}

	async function handleDelete() {
		await onDelete(doc.id);
	}

	function handleRenameConfirm(newName: string) {
		setShowRenameDialog(false);
		onRename(doc.id, newName);
	}

	function handleMoveUp() {
		if (onReorderDoc && canMoveUp) {
			onReorderDoc(doc.id, "up");
		}
	}

	function handleMoveDown() {
		if (onReorderDoc && canMoveDown) {
			onReorderDoc(doc.id, "down");
		}
	}

	function handleMoveToConfirm(parentId: number | undefined) {
		if (onMoveTo) {
			setShowMoveDialog(false);
			onMoveTo(doc.id, parentId);
		}
	}

	// Create dialog handler (for folder "Add Folder" action — articles skip the dialog)
	function handleOpenCreateFolderDialog() {
		setCreateDialogMode("folder");
		setShowCreateDialog(true);
	}

	/** Creates an article immediately with default "Untitled" name, skipping the dialog */
	async function handleCreateArticle() {
		await onCreateDoc(doc.id, content.untitledArticle.value, "text/markdown");
	}

	async function handleCreateFolderConfirm(params: { name: string; parentId: number | undefined }) {
		setIsCreating(true);
		try {
			await onCreateFolder(params.parentId, params.name);
			setShowCreateDialog(false);
			setTimeout(() => setCreateDialogMode(null), DIALOG_CLOSE_ANIMATION_MS);
		} finally {
			setIsCreating(false);
		}
	}

	function handleCreateDialogClose() {
		setShowCreateDialog(false);
		setTimeout(() => setCreateDialogMode(null), DIALOG_CLOSE_ANIMATION_MS);
	}

	// Count all descendants recursively for folder delete confirmation
	function countDescendants(treeNode: TreeNode): number {
		let count = treeNode.children.length;
		for (const child of treeNode.children) {
			count += countDescendants(child);
		}
		return count;
	}

	return (
		<div className="relative">
			<div
				className={cn(
					"flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm transition-colors",
					styles.rowGap,
					isSelected ? styles.selected : isDragInteraction ? "" : styles.hover,
					(isDragging || draggedDescendantIds?.has(doc.id)) && "opacity-30",
				)}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
				onPointerDown={handlePointerDown}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onMouseEnter={() => !isDragInteraction && setIsHovered(true)}
				onMouseLeave={() => !isDragInteraction && setIsHovered(false)}
				role="treeitem"
				tabIndex={0}
				aria-selected={isSelected}
				aria-expanded={isFolder ? expanded : undefined}
				data-testid={`tree-item-${doc.id}`}
				data-folder-header-id={isFolder ? doc.id : undefined}
			>
				{isFolder ? (
					<>
						<button
							type="button"
							onClick={handleChevronClick}
							className="p-0 border-0 bg-transparent cursor-pointer"
							aria-label={expanded ? "Collapse folder" : "Expand folder"}
						>
							{expanded ? (
								<ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
							) : (
								<ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
							)}
						</button>
						<Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" data-tree-icon="true" />
					</>
				) : (
					<>
						<span className="w-4" />
						<FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" data-tree-icon="true" />
					</>
				)}
				{/* Title and suggestion dot grouped together so dot stays adjacent to text */}
				<div className="flex items-center gap-1.5 min-w-0 flex-1">
					<span className="truncate">{title}</span>
					{hasSuggestions && (
						<HoverTooltip content={content.hasSuggestedUpdates} side="right" contentClassName="text-xs">
							<span
								className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
								data-testid={`suggestion-dot-${doc.id}`}
							/>
						</HoverTooltip>
					)}
				</div>
				<div
					className={cn(
						"flex items-center gap-0.5 transition-opacity",
						isHovered || isMenuOpen ? "opacity-100" : "opacity-0",
					)}
					onClick={e => e.stopPropagation()}
				>
					<ItemActionMenu
						itemName={title}
						isFolder={isFolder}
						childCount={isFolder ? countDescendants(node) : 0}
						onRename={() => setShowRenameDialog(true)}
						onDelete={handleDelete}
						onOpenChange={setIsMenuOpen}
						isDefaultSort={isDefaultSort}
						canMoveUp={canMoveUp}
						canMoveDown={canMoveDown}
						onMoveUp={handleMoveUp}
						onMoveDown={handleMoveDown}
						onMoveTo={onMoveTo ? () => setShowMoveDialog(true) : undefined}
						onAddArticle={isFolder ? handleCreateArticle : undefined}
						onAddFolder={isFolder ? handleOpenCreateFolderDialog : undefined}
					/>
				</div>
			</div>
			{isFolder && expanded && children.length > 0 && (
				<div role="group">
					{children.map((childNode, index) => (
						<TreeItem
							key={childNode.doc.id}
							node={childNode}
							depth={depth + 1}
							selectedDocId={selectedDocId}
							treeData={treeData}
							folders={folders}
							onSelect={onSelect}
							onToggleExpand={onToggleExpand}
							onDelete={onDelete}
							onRename={onRename}
							onCreateFolder={onCreateFolder}
							onCreateDoc={onCreateDoc}
							isDefaultSort={isDefaultSort}
							siblingIndex={index}
							siblingCount={children.length}
							onReorderDoc={onReorderDoc}
							onMoveTo={onMoveTo}
							docsWithSuggestions={docsWithSuggestions}
							foldersWithSuggestions={foldersWithSuggestions}
							isDragging={activeId === childNode.doc.id}
							activeId={activeId}
							isDragInteraction={isDragInteraction}
							onDragPointerDown={onDragPointerDown}
							{...(draggedDescendantIds && { draggedDescendantIds })}
						/>
					))}
				</div>
			)}
			<RenameItemDialog
				open={showRenameDialog}
				itemName={title}
				isFolder={isFolder}
				onConfirm={handleRenameConfirm}
				onClose={() => setShowRenameDialog(false)}
			/>
			{onMoveTo && (
				<MoveItemDialog
					open={showMoveDialog}
					itemToMove={doc}
					folders={folders}
					excludedIds={excludedIds}
					onConfirm={handleMoveToConfirm}
					onClose={() => setShowMoveDialog(false)}
				/>
			)}
			{createDialogMode !== null && (
				<CreateItemDialog
					mode={createDialogMode}
					open={showCreateDialog && !isCreating}
					folders={folders}
					defaultParentId={doc.id}
					onConfirm={handleCreateFolderConfirm}
					onClose={handleCreateDialogClose}
				/>
			)}
		</div>
	);
}
