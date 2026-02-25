import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import type { TreeNode } from "../../hooks/useSpaceTree";
import { CreateItemDialog, type FolderOption } from "./CreateItemDialog";
import type { DocDraftContentType } from "jolli-common";
import { FileText, Folder, Plus } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface CreateItemMenuProps {
	treeData: Array<TreeNode>;
	defaultParentId?: number;
	align?: "start" | "end";
	onCreateFolder: (parentId: number | undefined, name: string) => Promise<void>;
	onCreateDoc: (parentId: number | undefined, name: string, contentType?: DocDraftContentType) => Promise<void>;
	onOpenChange?: (open: boolean) => void;
}

function extractFolders(treeData: Array<TreeNode>): Array<FolderOption> {
	const folders: Array<FolderOption> = [];

	function traverse(nodes: Array<TreeNode>, depth: number): void {
		for (const node of nodes) {
			if (node.doc.docType === "folder") {
				const title = (node.doc.contentMetadata as { title?: string })?.title ?? node.doc.jrn;
				folders.push({
					id: node.doc.id,
					name: title,
					depth,
				});
				traverse(node.children, depth + 1);
			}
		}
	}

	traverse(treeData, 0);
	return folders;
}

export function CreateItemMenu({
	treeData,
	defaultParentId,
	align = "start",
	onCreateFolder,
	onCreateDoc,
	onOpenChange,
}: CreateItemMenuProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [creating, setCreating] = useState(false);

	function handleOpenFolder(): void {
		setDialogOpen(true);
	}

	/** Creates an article immediately with default "Untitled" name, skipping the dialog */
	async function handleCreateArticle(): Promise<void> {
		await onCreateDoc(defaultParentId, content.untitledArticle.value, "text/markdown");
	}

	function handleClose(): void {
		setDialogOpen(false);
	}

	async function handleConfirm(params: {
		name: string;
		parentId: number | undefined;
		contentType?: DocDraftContentType;
	}): Promise<void> {
		setCreating(true);
		try {
			await onCreateFolder(params.parentId, params.name);
			setDialogOpen(false);
		} finally {
			setCreating(false);
		}
	}

	const folders = extractFolders(treeData);

	return (
		<>
			<DropdownMenu {...(onOpenChange ? { onOpenChange } : {})}>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-6 w-6" data-testid="create-item-menu-trigger">
						<Plus className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align={align}>
					<DropdownMenuItem onClick={handleOpenFolder} data-testid="create-folder-option">
						<Folder className="h-4 w-4 mr-2" />
						{content.createFolder}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCreateArticle} data-testid="create-doc-option">
						<FileText className="h-4 w-4 mr-2" />
						{content.createDoc}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{dialogOpen && (
				<CreateItemDialog
					mode="folder"
					open={dialogOpen && !creating}
					folders={folders}
					defaultParentId={defaultParentId}
					onConfirm={handleConfirm}
					onClose={handleClose}
				/>
			)}
		</>
	);
}
