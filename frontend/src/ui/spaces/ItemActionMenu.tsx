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
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
}

export function ItemActionMenu({
	itemName,
	isFolder,
	childCount,
	onRename,
	onDelete,
	onOpenChange,
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
					<DropdownMenuItem onClick={onRename} data-testid="rename-item-option">
						<Pencil className="h-4 w-4 mr-2" />
						{content.rename}
					</DropdownMenuItem>
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
