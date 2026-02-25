/**
 * EditRoleDialog - Dialog for editing a custom role's name and description.
 */

import { Button } from "../../components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/Dialog";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Textarea } from "../../components/ui/Textarea";
import { useClient } from "../../contexts/ClientContext";
import type { Role } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";

export interface EditRoleDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role: Role;
	onSuccess: () => void;
}

/**
 * Dialog component for editing a custom role's name and description.
 */
export function EditRoleDialog({ open, onOpenChange, role, onSuccess }: EditRoleDialogProps): ReactElement {
	const client = useClient();
	const [name, setName] = useState(role.name);
	const [description, setDescription] = useState(role.description ?? "");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | undefined>();

	// Reset form when role changes or dialog opens
	useEffect(() => {
		if (open) {
			setName(role.name);
			setDescription(role.description ?? "");
			setError(undefined);
		}
	}, [open, role]);

	async function handleSubmit(e: React.FormEvent): Promise<void> {
		e.preventDefault();

		const trimmedName = name.trim();
		if (!trimmedName) {
			setError("Name is required");
			return;
		}

		// Check if anything changed
		const trimmedDescription = description.trim();
		const descriptionChanged = trimmedDescription !== (role.description ?? "");
		const nameChanged = trimmedName !== role.name;

		if (!nameChanged && !descriptionChanged) {
			// Nothing changed, just close the dialog
			onOpenChange(false);
			return;
		}

		try {
			setIsSubmitting(true);
			setError(undefined);

			await client.roles().updateRole(role.id, {
				name: trimmedName,
				description: trimmedDescription || "",
			});

			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update role");
		} finally {
			setIsSubmitting(false);
		}
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen) {
			// Reset form when closing
			setName(role.name);
			setDescription(role.description ?? "");
			setError(undefined);
		}
		onOpenChange(newOpen);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Edit Role</DialogTitle>
						<DialogDescription>Update the name and description for this custom role.</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="edit-role-name">Name</Label>
							<Input
								id="edit-role-name"
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder="Enter role name"
								disabled={isSubmitting}
								data-testid="edit-role-name-input"
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="edit-role-description">Description (optional)</Label>
							<Textarea
								id="edit-role-description"
								value={description}
								onChange={e => setDescription(e.target.value)}
								placeholder="Enter role description"
								disabled={isSubmitting}
								rows={3}
								data-testid="edit-role-description-input"
							/>
						</div>

						{error && (
							<p className="text-sm text-destructive" data-testid="edit-role-error">
								{error}
							</p>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
							data-testid="edit-role-cancel-button"
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting} data-testid="edit-role-save-button">
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
