import { Button } from "../../components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import type { FolderOption } from "./CreateItemDialog";
import { ParentFolderSelector } from "./ParentFolderSelector";
import type { Doc } from "jolli-common";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface MoveItemDialogProps {
	open: boolean;
	itemToMove: Doc;
	folders: Array<FolderOption>;
	excludedIds: Set<number>;
	onConfirm: (parentId: number | undefined) => void;
	onClose: () => void;
}

export function MoveItemDialog({
	open,
	itemToMove,
	folders,
	excludedIds,
	onConfirm,
	onClose,
}: MoveItemDialogProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const [parentId, setParentId] = useState<string>(
		itemToMove.parentId != null ? String(itemToMove.parentId) : "root",
	);

	// Reset parentId when itemToMove changes
	useEffect(() => {
		setParentId(itemToMove.parentId != null ? String(itemToMove.parentId) : "root");
	}, [itemToMove.parentId]);

	// Check if the selected location is the same as the current location
	const selectedId = parentId === "root" ? undefined : Number(parentId);
	const isSameLocation = (selectedId ?? null) === (itemToMove.parentId ?? null);

	function handleConfirm(): void {
		const newParentId = parentId === "root" ? undefined : Number(parentId);
		onConfirm(newParentId);
	}

	function handleOpenChange(isOpen: boolean): void {
		if (!isOpen) {
			onClose();
		}
	}

	const itemName = itemToMove.contentMetadata?.title || itemToMove.jrn;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md" data-testid="move-item-dialog-content">
				<DialogHeader>
					<DialogTitle>{content.moveItemTitle({ name: itemName })}</DialogTitle>
					<DialogDescription>{content.moveItemSubtitle}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<ParentFolderSelector
						folders={folders}
						value={parentId}
						onChange={setParentId}
						excludedIds={excludedIds}
					/>

					{isSameLocation && (
						<div className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
							{content.moveItemSameLocationWarning}
						</div>
					)}
				</div>

				<div className="flex gap-3 justify-end pt-4">
					<Button variant="outline" onClick={onClose} data-testid="move-dialog-cancel">
						{content.cancel}
					</Button>
					<Button onClick={handleConfirm} disabled={isSameLocation} data-testid="move-dialog-confirm">
						{content.move}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
