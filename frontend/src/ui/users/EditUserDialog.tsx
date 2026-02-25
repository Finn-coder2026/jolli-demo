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
import { NativeSelect } from "../../components/ui/NativeSelect";
import type { ActiveUser, OrgUserRole, Role } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface EditUserDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: ActiveUser | null;
	/** Available roles to choose from (loaded from API) */
	roles: Array<Role>;
	/** Whether the current user has permission to edit roles */
	canEditRoles: boolean;
	/** Whether the user being edited is the current logged-in user */
	isSelf: boolean;
	onSave: (userId: number, name: string, role: OrgUserRole) => Promise<void>;
}

/**
 * Gets the display name for a role.
 */
function getRoleDisplayName(
	role: OrgUserRole | undefined,
	roles: Array<Role>,
	content: { roleOwner: { value: string }; roleAdmin: { value: string }; roleMember: { value: string } },
): string {
	if (!role) {
		return "";
	}
	// Try to find in loaded roles first
	const roleRecord = roles.find(r => r.slug === role);
	if (roleRecord) {
		return roleRecord.name;
	}
	// Fall back to localized labels
	switch (role) {
		case "owner":
			return content.roleOwner.value;
		case "admin":
			return content.roleAdmin.value;
		case "member":
			return content.roleMember.value;
		default:
			return role;
	}
}

/**
 * Dialog for editing an existing user's name and role.
 */
export function EditUserDialog({
	open,
	onOpenChange,
	user,
	roles,
	canEditRoles,
	isSelf,
	onSave,
}: EditUserDialogProps): ReactElement {
	const content = useIntlayer("users");

	const [name, setName] = useState("");
	const [role, setRole] = useState<OrgUserRole>("member");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	// Reset form when user changes or dialog opens
	useEffect(() => {
		if (user && open) {
			setName(user.name ?? "");
			setRole(user.role);
			setError(undefined);
		}
	}, [user, open]);

	function handleOpenChange(isOpen: boolean): void {
		if (!isOpen) {
			setError(undefined);
		}
		onOpenChange(isOpen);
	}

	async function handleSubmit(event: React.FormEvent): Promise<void> {
		event.preventDefault();

		if (!user) {
			return;
		}

		setLoading(true);
		setError(undefined);

		try {
			await onSave(user.id, name.trim(), role);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorUpdatingUser.value);
		} finally {
			setLoading(false);
		}
	}

	const isOwner = user?.role === "owner";
	const isRoleReadOnly = isOwner || isSelf || !canEditRoles;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent data-testid="edit-user-dialog">
				<DialogHeader>
					<DialogTitle>{content.editDialogTitle}</DialogTitle>
					<DialogDescription>{content.editDialogDescription}</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit}>
					<div className="space-y-4 py-4">
						{error && (
							<div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
								<p className="text-sm text-destructive">{error}</p>
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="edit-email">{content.editEmailLabel}</Label>
							<Input
								id="edit-email"
								type="email"
								value={user?.email ?? ""}
								disabled
								data-testid="edit-email-input"
								className="bg-muted"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-name">{content.editNameLabel}</Label>
							<Input
								id="edit-name"
								type="text"
								placeholder={content.editNamePlaceholder.value}
								value={name}
								onChange={e => setName(e.target.value)}
								disabled={loading}
								data-testid="edit-name-input"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-role">{content.editRoleLabel}</Label>
							{isRoleReadOnly ? (
								<Input
									id="edit-role"
									type="text"
									value={getRoleDisplayName(user?.role, roles, content)}
									disabled
									data-testid="edit-role-input"
									className="bg-muted"
								/>
							) : (
								<NativeSelect
									id="edit-role"
									value={role}
									onChange={e => setRole(e.target.value as OrgUserRole)}
									disabled={loading}
									data-testid="edit-role-select"
								>
									{roles.length > 0
										? // Use roles from API, excluding owner (can't change to owner)
											roles
												.filter(r => r.slug !== "owner")
												.map(r => (
													<option key={r.id} value={r.slug}>
														{r.name}
													</option>
												))
										: // Fallback to hardcoded options if roles not loaded
											[
												<option key="member" value="member">
													{content.roleMember}
												</option>,
												<option key="admin" value="admin">
													{content.roleAdmin}
												</option>,
											]}
								</NativeSelect>
							)}
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={loading}
						>
							{content.editCancelButton}
						</Button>
						<Button type="submit" disabled={loading} data-testid="edit-submit-button">
							{content.editSaveButton}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
