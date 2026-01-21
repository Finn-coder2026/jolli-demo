import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { Empty } from "../../components/ui/Empty";
import { Skeleton } from "../../components/ui/Skeleton";
import type { SpaceTreeActions, SpaceTreeState } from "../../hooks/useSpaceTree";
import { CreateItemMenu } from "./CreateItemMenu";
import { TrashView } from "./TrashView";
import { TreeItem } from "./TreeItem";
import type { DocDraftContentType } from "jolli-common";
import { Archive, FolderPlus, MoreVertical } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface SpaceTreeNavProps {
	state: SpaceTreeState;
	actions: SpaceTreeActions;
}

export function SpaceTreeNav({ state, actions }: SpaceTreeNavProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const { space, treeData, trashData, loading, hasTrash, selectedDocId, showTrash } = state;

	async function handleCreateFolder(parentId: number | undefined, name: string) {
		await actions.createFolder(parentId, name);
	}

	async function handleCreateDoc(parentId: number | undefined, name: string, contentType?: DocDraftContentType) {
		await actions.createDoc(parentId, name, contentType);
	}

	async function handleDelete(docId: number) {
		await actions.softDelete(docId);
	}

	async function handleRename(docId: number, newName: string) {
		await actions.rename(docId, newName);
	}

	async function handleRestore(docId: number) {
		await actions.restore(docId);
	}

	function handleShowTrash() {
		actions.loadTrash();
		actions.setShowTrash(true);
	}

	function handleHideTrash() {
		actions.setShowTrash(false);
	}

	if (showTrash) {
		return <TrashView trashData={trashData} onRestore={handleRestore} onBack={handleHideTrash} />;
	}

	return (
		<div className="flex flex-col h-full">
			{/* Space name */}
			{space && (
				<div className="px-3 py-2 border-b">
					<h2 className="font-semibold text-sm truncate" data-testid="space-name">
						{space.name}
					</h2>
				</div>
			)}

			{/* Header with create and more menu */}
			<div className="flex items-center justify-end gap-1 p-2">
				<CreateItemMenu treeData={treeData} onCreateFolder={handleCreateFolder} onCreateDoc={handleCreateDoc} />
				{hasTrash && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								data-testid="space-more-menu-trigger"
							>
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleShowTrash} data-testid="show-trash-option">
								<Archive className="h-4 w-4 mr-2" />
								{content.deletedItems}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{/* Tree content */}
			<div className="flex-1 overflow-y-auto p-2" role="tree" data-testid="space-tree">
				{loading ? (
					<div className="space-y-2">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-5/6 ml-4" />
						<Skeleton className="h-8 w-4/6 ml-4" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-5/6 ml-4" />
					</div>
				) : treeData.length === 0 ? (
					<Empty
						icon={<FolderPlus className="h-12 w-12" />}
						title={content.empty}
						description={content.emptyTreeDescription}
					/>
				) : (
					treeData.map(node => (
						<TreeItem
							key={node.doc.id}
							node={node}
							depth={0}
							selectedDocId={selectedDocId}
							treeData={treeData}
							onSelect={actions.selectDoc}
							onToggleExpand={actions.toggleExpanded}
							onDelete={handleDelete}
							onRename={handleRename}
							onCreateFolder={handleCreateFolder}
							onCreateDoc={handleCreateDoc}
						/>
					))
				)}
			</div>
		</div>
	);
}
