import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../components/ui/AlertDialog";
import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { ArrowDown, ArrowUp, FileText, Folder, FolderInput, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface ItemActionMenuProps {
	itemName: string;
	isFolder: boolean;
	childCount: number;
	onRename: () => void;
	onDelete: () => Promise<void>;
	onOpenChange?: (open: boolean) => void;
	/** Whether the current sort mode is "default" (enables Move Up/Down) */
	isDefaultSort?: boolean;
	/** Whether this item can move up (not first among siblings) */
	canMoveUp?: boolean;
	/** Whether this item can move down (not last among siblings) */
	canMoveDown?: boolean;
	/** Called when Move Up is clicked */
	onMoveUp?: (() => void) | undefined;
	/** Called when Move Down is clicked */
	onMoveDown?: (() => void) | undefined;
	/** Called when Move to is clicked */
	onMoveTo?: (() => void) | undefined;
	/** Called when New Article is clicked (folders only) */
	onAddArticle?: (() => void) | undefined;
	/** Called when New Folder is clicked (folders only) */
	onAddFolder?: (() => void) | undefined;
}

export function ItemActionMenu({
	itemName,
	isFolder,
	childCount,
	onRename,
	onDelete,
	onOpenChange,
	isDefaultSort = false,
	canMoveUp = false,
	canMoveDown = false,
	onMoveUp,
	onMoveDown,
	onMoveTo,
	onAddArticle,
	onAddFolder,
}: ItemActionMenuProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	async function handleConfirmDelete() {
		await onDelete();
		setShowDeleteDialog(false);
	}

	function getDeleteDescription(): ReactNode {
		if (!isFolder) {
			return content.deleteDocDescription;
		}
		if (childCount === 0) {
			return content.deleteEmptyFolderDescription;
		}
		return content.deleteFolderWithContentsDescription({ count: childCount });
	}

	return (
		<>
			<DropdownMenu {...(onOpenChange ? { onOpenChange } : {})}>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-6 w-6" data-testid="item-action-menu-trigger">
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{onAddFolder && (
						<>
							<DropdownMenuItem onClick={onAddFolder} data-testid="add-folder-option">
								<Folder className="h-4 w-4 mr-2" />
								{content.newFolder}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={onAddArticle} data-testid="add-article-option">
								<FileText className="h-4 w-4 mr-2" />
								{content.newArticle}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onClick={onRename} data-testid="rename-item-option">
						<Pencil className="h-4 w-4 mr-2" />
						{content.rename}
					</DropdownMenuItem>
					{onMoveTo && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onMoveTo} data-testid="move-to-option">
								<FolderInput className="h-4 w-4 mr-2" />
								{content.moveTo}
							</DropdownMenuItem>
						</>
					)}
					{isDefaultSort && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onMoveUp} disabled={!canMoveUp} data-testid="move-up-option">
								<ArrowUp className="h-4 w-4 mr-2" />
								{content.moveUp}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={onMoveDown}
								disabled={!canMoveDown}
								data-testid="move-down-option"
							>
								<ArrowDown className="h-4 w-4 mr-2" />
								{content.moveDown}
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setShowDeleteDialog(true)}
						className="text-destructive focus:text-destructive"
						data-testid="delete-item-option"
					>
						<Trash2 className="h-4 w-4 mr-2" />
						{content.delete}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.deleteConfirmTitle({ name: itemName })}</AlertDialogTitle>
						<AlertDialogDescription>{getDeleteDescription()}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="delete-cancel-button">{content.cancel}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							data-testid="delete-confirm-button"
						>
							{content.confirmDelete}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
