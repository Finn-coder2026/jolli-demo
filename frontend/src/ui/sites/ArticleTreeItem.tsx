import type { Doc } from "jolli-common";
import { Check, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Minus } from "lucide-react";
import { memo, type ReactElement } from "react";

export interface ArticleTreeNode {
	doc: Doc;
	children: Array<ArticleTreeNode>;
	expanded: boolean;
}

export interface FolderStats {
	selectionStates: Map<number, "none" | "some" | "all">;
	descendantCounts: Map<number, number>;
}

export interface ArticleTreeItemProps {
	node: ArticleTreeNode;
	depth: number;
	selectedJrns: Set<string>;
	onToggle: (jrn: string) => void;
	onToggleExpand: (docId: number) => void;
	onSelectFolder: (node: ArticleTreeNode, select: boolean) => void;
	disabled?: boolean;
	folderStats: FolderStats;
	changedJrns?: Set<string> | undefined;
	pendingChangesLabel: string;
	itemCountFormatter: (count: number) => string;
}

export function getAllDocumentJrns(node: ArticleTreeNode): Array<string> {
	const jrns: Array<string> = [];
	// Include the node itself (whether document or folder)
	jrns.push(node.doc.jrn);
	for (const child of node.children) {
		jrns.push(...getAllDocumentJrns(child));
	}
	return jrns;
}

/**
 * Pre-computes folder selection states and descendant counts for the entire tree
 * in a single recursive pass. This avoids O(K*N) repeated traversals.
 */
export function computeFolderStats(nodes: Array<ArticleTreeNode>, selectedJrns: Set<string>): FolderStats {
	const selectionStates = new Map<number, "none" | "some" | "all">();
	const descendantCounts = new Map<number, number>();

	function traverse(node: ArticleTreeNode): { total: number; selected: number; descendants: number } {
		let total = 1; // This node
		let selected = selectedJrns.has(node.doc.jrn) ? 1 : 0;
		let descendants = 0;

		for (const child of node.children) {
			const childResult = traverse(child);
			total += childResult.total;
			selected += childResult.selected;
			descendants += 1 + childResult.descendants;
		}

		if (node.doc.docType === "folder" && node.children.length > 0) {
			descendantCounts.set(node.doc.id, descendants);
			if (selected === 0) {
				selectionStates.set(node.doc.id, "none");
			} else if (selected === total) {
				selectionStates.set(node.doc.id, "all");
			} else {
				selectionStates.set(node.doc.id, "some");
			}
		}

		return { total, selected, descendants };
	}

	for (const node of nodes) {
		traverse(node);
	}

	return { selectionStates, descendantCounts };
}

function getNodeIcon(isFolder: boolean, expanded: boolean): ReactElement {
	if (isFolder) {
		return expanded ? (
			<FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
		) : (
			<Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
		);
	}
	return <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

function getCheckboxIcon(selected: boolean, partial: boolean): ReactElement | null {
	if (selected) {
		return <Check className="h-3 w-3 text-primary-foreground" />;
	}
	if (partial) {
		return <Minus className="h-3 w-3 text-primary-foreground" />;
	}
	return null;
}

/**
 * Recursive tree item for article selection.
 * Both folders and documents are selectable since folders can have content (like index pages).
 */
export const ArticleTreeItem = memo(function ArticleTreeItem({
	node,
	depth,
	selectedJrns,
	onToggle,
	onToggleExpand,
	onSelectFolder,
	disabled = false,
	folderStats,
	changedJrns,
	pendingChangesLabel,
	itemCountFormatter,
}: ArticleTreeItemProps): ReactElement {
	const { doc, children, expanded } = node;
	const isFolder = doc.docType === "folder";
	const title = doc.contentMetadata?.title || doc.slug || doc.jrn;
	const hasChildren = children.length > 0;

	// Check if this specific item is selected
	const isSelected = selectedJrns.has(doc.jrn);
	// Look up pre-computed folder state (avoids recursive traversal per render)
	const folderState = isFolder && hasChildren ? (folderStats.selectionStates.get(doc.id) ?? "none") : "none";
	// Check if this item has pending changes
	const hasChanges = changedJrns?.has(doc.jrn) ?? false;

	function handleClick() {
		if (isFolder && hasChildren) {
			// Toggle expand/collapse for folders with children
			onToggleExpand(doc.id);
		} else {
			// Toggle selection for documents and empty folders
			onToggle(doc.jrn);
		}
	}

	function handleCheckboxClick(e: React.MouseEvent) {
		e.stopPropagation();
		if (isFolder && hasChildren) {
			// Select or deselect folder and all children
			const shouldSelect = folderState !== "all";
			onSelectFolder(node, shouldSelect);
		} else {
			// Toggle just this item
			onToggle(doc.jrn);
		}
	}

	function handleChevronClick(e: React.MouseEvent) {
		e.stopPropagation();
		onToggleExpand(doc.id);
	}

	// Look up pre-computed descendant count
	const descendantCount = isFolder && hasChildren ? (folderStats.descendantCounts.get(doc.id) ?? 0) : 0;

	// Indentation: 16px per depth level
	const paddingLeft = depth * 16 + 8;

	// Determine checkbox state
	const checkboxSelected = isFolder && hasChildren ? folderState === "all" : isSelected;
	const checkboxPartial = isFolder && hasChildren && folderState === "some";
	const checkboxClass = checkboxSelected
		? "bg-primary border-primary"
		: checkboxPartial
			? "bg-primary/50 border-primary"
			: "border-muted-foreground/30";

	const nodeIcon = getNodeIcon(isFolder, expanded);
	const checkboxIcon = getCheckboxIcon(checkboxSelected, checkboxPartial);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleClick();
		}
	}

	return (
		<>
			<div
				role="treeitem"
				tabIndex={disabled ? -1 : 0}
				onClick={disabled ? undefined : handleClick}
				onKeyDown={disabled ? undefined : handleKeyDown}
				aria-expanded={isFolder && hasChildren ? expanded : undefined}
				aria-disabled={disabled || undefined}
				aria-label={title}
				className={`w-full flex items-center gap-2 py-1.5 pr-3 text-left transition-colors hover:bg-muted/50 ${
					isSelected ? "bg-primary/5" : ""
				} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
				style={{ paddingLeft }}
				data-testid={`article-tree-item-${doc.jrn}`}
			>
				{isFolder && hasChildren ? (
					<button
						type="button"
						onClick={handleChevronClick}
						className="p-0.5 rounded hover:bg-muted"
						disabled={disabled}
						data-testid={`folder-expand-${doc.id}`}
					>
						{expanded ? (
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						) : (
							<ChevronRight className="h-4 w-4 text-muted-foreground" />
						)}
					</button>
				) : (
					<div className="w-5" /> // Spacer for alignment
				)}

				<button
					type="button"
					role="checkbox"
					aria-checked={checkboxPartial ? "mixed" : checkboxSelected}
					aria-label={title}
					onClick={handleCheckboxClick}
					disabled={disabled}
					className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checkboxClass}`}
					data-testid={`article-checkbox-${doc.jrn}`}
				>
					{checkboxIcon}
				</button>

				{nodeIcon}

				<span className="text-sm truncate flex-1">{title}</span>

				{hasChanges && (
					<span
						className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0"
						title={pendingChangesLabel}
						data-testid={`change-indicator-${doc.jrn}`}
					/>
				)}

				{/* Total item count for folders (all descendants recursively) */}
				{descendantCount > 0 && (
					<span className="text-xs text-muted-foreground" title={itemCountFormatter(descendantCount)}>
						{descendantCount}
					</span>
				)}
			</div>

			{/* Render children if folder is expanded */}
			{isFolder && expanded && children.length > 0 && (
				<div>
					{children.map(child => (
						<ArticleTreeItem
							key={child.doc.id}
							node={child}
							depth={depth + 1}
							selectedJrns={selectedJrns}
							onToggle={onToggle}
							onToggleExpand={onToggleExpand}
							onSelectFolder={onSelectFolder}
							disabled={disabled}
							folderStats={folderStats}
							changedJrns={changedJrns}
							pendingChangesLabel={pendingChangesLabel}
							itemCountFormatter={itemCountFormatter}
						/>
					))}
				</div>
			)}
		</>
	);
});
