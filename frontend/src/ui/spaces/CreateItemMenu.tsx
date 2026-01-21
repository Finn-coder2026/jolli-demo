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
import { File, Folder, Plus } from "lucide-react";
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
	const [dialogMode, setDialogMode] = useState<"folder" | "article" | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [creating, setCreating] = useState(false);

	function handleOpenFolder(): void {
		setDialogMode("folder");
		setDialogOpen(true);
	}

	function handleOpenArticle(): void {
		setDialogMode("article");
		setDialogOpen(true);
	}

	function handleClose(): void {
		setDialogOpen(false);
		// Delay clearing mode to allow close animation
		setTimeout(() => setDialogMode(null), 150);
	}

	async function handleConfirm(params: {
		name: string;
		parentId: number | undefined;
		contentType?: DocDraftContentType;
	}): Promise<void> {
		setCreating(true);
		try {
			if (dialogMode === "folder") {
				await onCreateFolder(params.parentId, params.name);
			} else {
				await onCreateDoc(params.parentId, params.name, params.contentType);
			}
			setDialogOpen(false);
			setTimeout(() => setDialogMode(null), 150);
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
					<DropdownMenuItem onClick={handleOpenArticle} data-testid="create-doc-option">
						<File className="h-4 w-4 mr-2" />
						{content.createDoc}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{dialogMode !== null && (
				<CreateItemDialog
					mode={dialogMode}
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
