import { Button } from "../../components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { SelectBox } from "../../components/ui/SelectBox";
import { validateItemName } from "../../util/NameValidation";
import type { DocDraftContentType } from "jolli-common";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface FolderOption {
	id: number;
	name: string;
	depth: number;
}

export interface CreateItemDialogProps {
	mode: "folder" | "article";
	open: boolean;
	folders: Array<FolderOption>;
	defaultParentId?: number | undefined;
	onConfirm: (params: { name: string; parentId: number | undefined; contentType?: DocDraftContentType }) => void;
	onClose: () => void;
}

export function CreateItemDialog({
	mode,
	open,
	folders,
	defaultParentId,
	onConfirm,
	onClose,
}: CreateItemDialogProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const [name, setName] = useState("");
	const [parentId, setParentId] = useState<string>(defaultParentId !== undefined ? String(defaultParentId) : "root");
	const [contentType, setContentType] = useState<DocDraftContentType>("text/markdown");
	const [error, setError] = useState<string | null>(null);

	// Reset state when dialog opens
	useEffect(() => {
		if (open) {
			setName("");
			setParentId(defaultParentId !== undefined ? String(defaultParentId) : "root");
			setContentType("text/markdown");
			setError(null);
		}
	}, [open, defaultParentId]);

	function validateName(value: string): string | null {
		const result = validateItemName(value);
		if (!result.valid) {
			if (result.error === "empty") {
				return content.nameEmptyError.value;
			}
			if (result.error === "invalidChars") {
				return content.nameInvalidCharsError.value;
			}
		}
		return null;
	}

	function handleCreate(): void {
		const trimmedName = name.trim();
		const validationError = validateName(trimmedName);
		if (validationError) {
			setError(validationError);
			return;
		}
		const params: {
			name: string;
			parentId: number | undefined;
			contentType?: DocDraftContentType;
		} = {
			name: trimmedName,
			parentId: parentId === "root" ? undefined : Number(parentId),
		};
		if (mode === "article") {
			params.contentType = contentType;
		}
		onConfirm(params);
	}

	function handleNameChange(value: string): void {
		setName(value);
		// Clear error when user starts typing
		if (error) {
			setError(null);
		}
	}

	function handleOpenChange(isOpen: boolean): void {
		if (!isOpen) {
			onClose();
		}
	}

	const folderOptions = [
		{ value: "root", label: content.rootFolder.value },
		...folders.map(folder => ({
			value: String(folder.id),
			label: folder.depth > 0 ? "\u00A0\u00A0".repeat(folder.depth) + folder.name : folder.name,
		})),
	];

	const typeOptions = [
		{ value: "text/markdown", label: content.typeMarkdown.value },
		{ value: "application/json", label: content.typeJson.value },
		{ value: "application/yaml", label: content.typeYaml.value },
	];

	const title = mode === "folder" ? content.newFolderTitle : content.newDocTitle;
	const subtitle = mode === "folder" ? content.newFolderSubtitle : content.newArticleSubtitle;
	const placeholder = mode === "folder" ? content.folderNamePlaceholder.value : content.docNamePlaceholder.value;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md" data-testid="create-item-dialog-content">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{subtitle}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<div>
						<Label htmlFor="item-name">
							{mode === "folder" ? content.folderNamePlaceholder : content.docNamePlaceholder}
						</Label>
						<Input
							id="item-name"
							type="text"
							placeholder={placeholder}
							value={name}
							onChange={e => handleNameChange(e.target.value)}
							onKeyDown={e => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleCreate();
								}
							}}
							autoFocus
							data-testid="create-item-name-input"
							aria-invalid={!!error}
							aria-describedby={error ? "create-error" : undefined}
						/>
						{error && (
							<p
								id="create-error"
								className="text-sm text-destructive mt-1"
								data-testid="create-error-message"
							>
								{error}
							</p>
						)}
					</div>

					<div>
						<Label htmlFor="parent-folder">{content.parentFolderLabel}</Label>
						<SelectBox
							value={parentId}
							onValueChange={setParentId}
							options={folderOptions}
							width="100%"
							data-testid="parent-folder-select"
						/>
					</div>

					{mode === "article" && (
						<div>
							<Label htmlFor="content-type">{content.typeLabel}</Label>
							<SelectBox
								value={contentType}
								onValueChange={value => setContentType(value as DocDraftContentType)}
								options={typeOptions}
								width="100%"
								data-testid="content-type-select"
							/>
							<p className="text-xs text-muted-foreground mt-1">{content.typeDescription}</p>
						</div>
					)}
				</div>

				<div className="flex gap-3 justify-end pt-4">
					<Button variant="outline" onClick={onClose} data-testid="cancel-button">
						{content.cancel}
					</Button>
					<Button onClick={handleCreate} disabled={!name.trim()} data-testid="create-button">
						{content.create}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
