import { cn } from "../../common/ClassNameUtils";
import type { FlattenedItem } from "../../hooks/useFlattenedTree";
import { FileText, Folder } from "lucide-react";
import type { ReactElement } from "react";

export interface TreeItemDragOverlayProps {
	/** The item being dragged */
	item: FlattenedItem;
	/** Number of children (for folders) to show count badge */
	childCount?: number;
}

/**
 * Simplified tree item component shown during drag operations.
 * Displays only the icon and title without any action buttons.
 */
export function TreeItemDragOverlay({ item, childCount = 0 }: TreeItemDragOverlayProps): ReactElement {
	const title = item.doc.contentMetadata?.title || item.doc.jrn;
	const isFolder = item.isFolder;

	return (
		<div
			className={cn(
				"flex items-center gap-2 py-1.5 px-3 rounded-md text-sm",
				"bg-background border border-border shadow-lg",
				"w-full max-w-[280px]",
			)}
			data-testid="tree-item-drag-overlay"
		>
			{isFolder ? (
				<Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
			) : (
				<FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
			)}
			<span className="truncate flex-1">{title}</span>
			{isFolder && childCount > 0 && (
				<span className="flex-shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-bold">
					{childCount}
				</span>
			)}
		</div>
	);
}
