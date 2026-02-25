import { Button } from "../../components/ui/Button";
import { Empty } from "../../components/ui/Empty";
import type { Doc } from "jolli-common";
import { FileText, Folder, RotateCcw, Trash } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface TrashViewProps {
	trashData: Array<Doc>;
	onRestore: (docId: number) => Promise<void>;
}

/**
 * Displays deleted items in the trash with restore functionality.
 * This component only renders the content area - the header is managed by SpaceTreeNav.
 */
export function TrashView({ trashData, onRestore }: TrashViewProps): ReactElement {
	const content = useIntlayer("space-tree-nav");

	async function handleRestore(docId: number) {
		await onRestore(docId);
	}

	if (trashData.length === 0) {
		return (
			<Empty
				icon={<Trash className="h-12 w-12" />}
				title={content.trashEmpty}
				description={content.trashEmptyDescription}
			/>
		);
	}

	return (
		<div className="space-y-1">
			{trashData.map(doc => {
				const title = doc.contentMetadata?.title || doc.jrn;
				return (
					<div
						key={doc.id}
						className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-accent/50"
						data-testid={`trash-item-${doc.id}`}
					>
						{doc.docType === "folder" ? (
							<Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
						) : (
							<FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
						)}
						<span className="truncate flex-1 text-sm">{title}</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={() => handleRestore(doc.id)}
							data-testid={`restore-item-${doc.id}`}
						>
							<RotateCcw className="h-4 w-4" />
						</Button>
					</div>
				);
			})}
		</div>
	);
}
