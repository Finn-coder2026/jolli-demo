import { Button } from "../../components/ui/Button";
import { Empty } from "../../components/ui/Empty";
import type { Doc } from "jolli-common";
import { ArrowLeft, File, Folder, RotateCcw, Trash } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface TrashViewProps {
	trashData: Array<Doc>;
	onRestore: (docId: number) => Promise<void>;
	onBack: () => void;
}

export function TrashView({ trashData, onRestore, onBack }: TrashViewProps): ReactElement {
	const content = useIntlayer("space-tree-nav");

	async function handleRestore(docId: number) {
		await onRestore(docId);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 p-2 border-b">
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={onBack}
					data-testid="trash-back-button"
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<span className="font-medium">{content.trash}</span>
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				{trashData.length === 0 ? (
					<Empty
						icon={<Trash className="h-12 w-12" />}
						title={content.trashEmpty}
						description={content.trashEmptyDescription}
					/>
				) : (
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
										<File className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
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
				)}
			</div>
		</div>
	);
}
