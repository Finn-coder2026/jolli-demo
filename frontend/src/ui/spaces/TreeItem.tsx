import { cn } from "../../common/ClassNameUtils";
import type { TreeNode } from "../../hooks/useSpaceTree";
import { CreateItemMenu } from "./CreateItemMenu";
import { ItemActionMenu } from "./ItemActionMenu";
import { RenameItemDialog } from "./RenameItemDialog";
import type { DocDraftContentType } from "jolli-common";
import { ChevronDown, ChevronRight, File, Folder } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

export interface TreeItemProps {
	node: TreeNode;
	depth: number;
	selectedDocId: number | undefined;
	treeData: Array<TreeNode>;
	onSelect: (docId: number) => void;
	onToggleExpand: (docId: number) => void;
	onDelete: (docId: number) => Promise<void>;
	onRename: (docId: number, newName: string) => Promise<void>;
	onCreateFolder: (parentId: number | undefined, name: string) => Promise<void>;
	onCreateDoc: (parentId: number | undefined, name: string, contentType?: DocDraftContentType) => Promise<void>;
}

export function TreeItem({
	node,
	depth,
	selectedDocId,
	treeData,
	onSelect,
	onToggleExpand,
	onDelete,
	onRename,
	onCreateFolder,
	onCreateDoc,
}: TreeItemProps): ReactElement {
	const [isHovered, setIsHovered] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [showRenameDialog, setShowRenameDialog] = useState(false);
	const { doc, children, expanded } = node;
	const isSelected = selectedDocId === doc.id;
	const title = doc.contentMetadata?.title || doc.jrn;

	function handleClick() {
		// Select the item (both folders and documents)
		onSelect(doc.id);
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

	async function handleRenameConfirm(newName: string) {
		await onRename(doc.id, newName);
		setShowRenameDialog(false);
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
		<div>
			<div
				className={cn(
					"flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer text-sm",
					"hover:bg-accent/50 transition-colors",
					isSelected && "bg-accent",
				)}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
				onClick={handleClick}
				onKeyDown={handleKeyDown}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				role="treeitem"
				tabIndex={0}
				aria-selected={isSelected}
				aria-expanded={doc.docType === "folder" ? expanded : undefined}
				data-testid={`tree-item-${doc.id}`}
			>
				{doc.docType === "folder" ? (
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
						<Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
					</>
				) : (
					<>
						<span className="w-4" />
						<File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
					</>
				)}
				<span className="truncate flex-1">{title}</span>
				<div
					className={cn(
						"flex items-center gap-0.5 transition-opacity",
						isHovered || isMenuOpen ? "opacity-100" : "opacity-0",
					)}
					onClick={e => e.stopPropagation()}
				>
					{doc.docType === "folder" && (
						<CreateItemMenu
							treeData={treeData}
							defaultParentId={doc.id}
							align="end"
							onCreateFolder={onCreateFolder}
							onCreateDoc={onCreateDoc}
							onOpenChange={setIsMenuOpen}
						/>
					)}
					<ItemActionMenu
						itemName={title}
						isFolder={doc.docType === "folder"}
						childCount={doc.docType === "folder" ? countDescendants(node) : 0}
						onRename={() => setShowRenameDialog(true)}
						onDelete={handleDelete}
						onOpenChange={setIsMenuOpen}
					/>
				</div>
			</div>
			{doc.docType === "folder" && expanded && children.length > 0 && (
				<div role="group">
					{children.map(childNode => (
						<TreeItem
							key={childNode.doc.id}
							node={childNode}
							depth={depth + 1}
							selectedDocId={selectedDocId}
							treeData={treeData}
							onSelect={onSelect}
							onToggleExpand={onToggleExpand}
							onDelete={onDelete}
							onRename={onRename}
							onCreateFolder={onCreateFolder}
							onCreateDoc={onCreateDoc}
						/>
					))}
				</div>
			)}
			<RenameItemDialog
				open={showRenameDialog}
				itemName={title}
				isFolder={doc.docType === "folder"}
				onConfirm={handleRenameConfirm}
				onClose={() => setShowRenameDialog(false)}
			/>
		</div>
	);
}
