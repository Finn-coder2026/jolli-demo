import { Button } from "../../components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { validateItemName } from "../../util/NameValidation";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface RenameItemDialogProps {
	open: boolean;
	itemName: string;
	isFolder: boolean;
	onConfirm: (newName: string) => void;
	onClose: () => void;
}

/**
 * Dialog component for renaming folders and documents in the space tree.
 * Validates that names are non-empty and don't contain invalid characters.
 */
export function RenameItemDialog({
	open,
	itemName,
	isFolder,
	onConfirm,
	onClose,
}: RenameItemDialogProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const [name, setName] = useState(itemName);
	const [error, setError] = useState<string | null>(null);

	// Reset state when dialog opens
	useEffect(() => {
		if (open) {
			setName(itemName);
			setError(null);
		}
	}, [open, itemName]);

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

	function handleSave(): void {
		const trimmedName = name.trim();
		const validationError = validateName(trimmedName);
		if (validationError) {
			setError(validationError);
			return;
		}
		onConfirm(trimmedName);
	}

	function handleOpenChange(isOpen: boolean): void {
		if (!isOpen) {
			onClose();
		}
	}

	function handleNameChange(value: string): void {
		setName(value);
		// Clear error when user starts typing
		if (error) {
			setError(null);
		}
	}

	const title = isFolder ? content.renameFolderTitle : content.renameDocTitle;
	const subtitle = isFolder ? content.renameFolderSubtitle : content.renameDocSubtitle;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md" data-testid="rename-item-dialog-content">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{subtitle}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<div>
						<Label htmlFor="rename-item-name">{content.nameLabel}</Label>
						<Input
							id="rename-item-name"
							type="text"
							value={name}
							onChange={e => handleNameChange(e.target.value)}
							onKeyDown={e => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleSave();
								}
							}}
							autoFocus
							onFocus={e => e.target.select()}
							data-testid="rename-item-name-input"
							aria-invalid={!!error}
							aria-describedby={error ? "rename-error" : undefined}
						/>
						{error && (
							<p
								id="rename-error"
								className="text-sm text-destructive mt-1"
								data-testid="rename-error-message"
							>
								{error}
							</p>
						)}
					</div>
				</div>

				<div className="flex gap-3 justify-end pt-4">
					<Button variant="outline" onClick={onClose} data-testid="rename-cancel-button">
						{content.cancel}
					</Button>
					<Button onClick={handleSave} data-testid="rename-save-button">
						{content.save}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
