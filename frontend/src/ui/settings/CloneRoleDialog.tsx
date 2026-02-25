/**
 * CloneRoleDialog - Dialog for cloning a role to create a custom variant.
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
import { type ReactElement, useState } from "react";

export interface CloneRoleDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sourceRole: Role;
	onSuccess: () => void;
}

/**
 * Dialog component for cloning a role.
 */
export function CloneRoleDialog({ open, onOpenChange, sourceRole, onSuccess }: CloneRoleDialogProps): ReactElement {
	const client = useClient();
	const [name, setName] = useState(`${sourceRole.name} (Copy)`);
	const [description, setDescription] = useState(sourceRole.description ?? "");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | undefined>();

	async function handleSubmit(e: React.FormEvent): Promise<void> {
		e.preventDefault();

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		try {
			setIsSubmitting(true);
			setError(undefined);

			const trimmedDescription = description.trim();
			await client.roles().cloneRole(sourceRole.id, {
				name: name.trim(),
				...(trimmedDescription && { description: trimmedDescription }),
			});

			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to clone role");
		} finally {
			setIsSubmitting(false);
		}
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen) {
			// Reset form when closing
			setName(`${sourceRole.name} (Copy)`);
			setDescription(sourceRole.description ?? "");
			setError(undefined);
		}
		onOpenChange(newOpen);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Clone Role</DialogTitle>
						<DialogDescription>
							Create a new custom role based on &quot;{sourceRole.name}&quot;. The new role will have the
							same permissions, which you can then customize.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder="Enter role name"
								disabled={isSubmitting}
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={e => setDescription(e.target.value)}
								placeholder="Enter role description"
								disabled={isSubmitting}
								rows={3}
							/>
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create Role"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
