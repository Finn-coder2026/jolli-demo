import { Button } from "../../components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Textarea } from "../../components/ui/Textarea";
import { validateItemName } from "../../util/NameValidation";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface CreateSpaceDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when space is created */
	onConfirm: (name: string, description?: string) => Promise<void>;
	/** Callback when dialog is closed */
	onClose: () => void;
}

/**
 * Dialog for creating a new space.
 * Shows input fields for name (required) and description (optional).
 */
export function CreateSpaceDialog({ open, onConfirm, onClose }: CreateSpaceDialogProps): ReactElement {
	const content = useIntlayer("space-switcher");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Reset state when dialog opens
	useEffect(() => {
		if (open) {
			setName("");
			setDescription("");
			setError(null);
			setIsSubmitting(false);
		}
	}, [open]);

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

	async function handleCreate(): Promise<void> {
		const trimmedName = name.trim();
		const validationError = validateName(trimmedName);
		if (validationError) {
			setError(validationError);
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			await onConfirm(trimmedName, description.trim() || undefined);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.createError.value);
			setIsSubmitting(false);
		}
	}

	function handleNameChange(value: string): void {
		setName(value);
		if (error) {
			setError(null);
		}
	}

	function handleOpenChange(isOpen: boolean): void {
		if (!isOpen && !isSubmitting) {
			onClose();
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md" data-testid="create-space-dialog-content">
				<DialogHeader>
					<DialogTitle>{content.createSpaceTitle}</DialogTitle>
					<DialogDescription>{content.createSpaceSubtitle}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					<div>
						<Label htmlFor="space-name">{content.spaceNameLabel}</Label>
						<Input
							id="space-name"
							type="text"
							placeholder={content.spaceNamePlaceholder.value}
							value={name}
							onChange={e => handleNameChange(e.target.value)}
							onKeyDown={e => {
								if (e.key === "Enter" && !isSubmitting) {
									e.preventDefault();
									handleCreate();
								}
							}}
							autoFocus
							disabled={isSubmitting}
							data-testid="create-space-name-input"
							aria-invalid={!!error}
							aria-describedby={error ? "create-space-error" : undefined}
						/>
						{error && (
							<p
								id="create-space-error"
								className="text-sm text-destructive mt-1"
								data-testid="create-space-error-message"
							>
								{error}
							</p>
						)}
					</div>

					<div>
						<Label htmlFor="space-description">{content.spaceDescriptionLabel}</Label>
						<Textarea
							id="space-description"
							placeholder={content.spaceDescriptionPlaceholder.value}
							value={description}
							onChange={e => setDescription(e.target.value)}
							disabled={isSubmitting}
							rows={3}
							data-testid="create-space-description-input"
						/>
						<p className="text-xs text-muted-foreground mt-1">{content.spaceDescriptionHelp}</p>
					</div>
				</div>

				<div className="flex gap-3 justify-end pt-4">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={isSubmitting}
						data-testid="create-space-cancel-button"
					>
						{content.cancel}
					</Button>
					<Button
						onClick={handleCreate}
						disabled={!name.trim() || isSubmitting}
						data-testid="create-space-submit-button"
					>
						{isSubmitting ? content.creating : content.create}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
