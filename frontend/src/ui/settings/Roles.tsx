/**
 * Roles - Role management component for the settings page.
 *
 * Displays a list of roles and allows managing custom roles:
 * - View all roles (built-in and custom)
 * - Clone roles to create custom variants
 * - Edit custom role permissions
 * - Delete custom roles
 */

import { PermissionGuard } from "../../components/PermissionGuard";
import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { useClient } from "../../contexts/ClientContext";
import { useHasPermission } from "../../contexts/PermissionContext";
import { CloneRoleDialog } from "./CloneRoleDialog";
import { EditRoleDialog } from "./EditRoleDialog";
import { RolePermissionsDialog } from "./RolePermissionsDialog";
import type { Role, RoleWithPermissions } from "jolli-common";
import { Copy, Lock, MoreHorizontal, Pencil, Shield, Trash2 } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useState } from "react";

/**
 * Roles management component.
 */
export function Roles(): ReactElement {
	const client = useClient();
	const canManageRoles = useHasPermission("roles.edit");
	const [roles, setRoles] = useState<Array<Role>>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();

	// Dialog states
	const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
	const [cloneSourceRole, setCloneSourceRole] = useState<Role | null>(null);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editRole, setEditRole] = useState<Role | null>(null);
	const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
	const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);

	const loadRoles = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(undefined);
			const data = await client.roles().listRoles();
			setRoles(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load roles");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		loadRoles().then();
	}, [loadRoles]);

	function handleClone(role: Role): void {
		setCloneSourceRole(role);
		setCloneDialogOpen(true);
	}

	function handleEdit(role: Role): void {
		setEditRole(role);
		setEditDialogOpen(true);
	}

	async function handleViewPermissions(role: Role): Promise<void> {
		try {
			const roleWithPermissions = await client.roles().getRole(role.id);
			setSelectedRole(roleWithPermissions);
			setPermissionsDialogOpen(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load role permissions");
		}
	}

	async function handleDelete(role: Role): Promise<void> {
		if (!window.confirm(`Are you sure you want to delete the role "${role.name}"?`)) {
			return;
		}
		try {
			await client.roles().deleteRole(role.id);
			await loadRoles();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete role");
		}
	}

	function handleCloneSuccess(): void {
		setCloneDialogOpen(false);
		setCloneSourceRole(null);
		loadRoles().then();
	}

	function handleEditSuccess(): void {
		setEditDialogOpen(false);
		setEditRole(null);
		loadRoles().then();
	}

	function handlePermissionsSaved(): void {
		setPermissionsDialogOpen(false);
		setSelectedRole(null);
		loadRoles().then();
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<span className="text-muted-foreground">Loading roles...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-8 gap-4">
				<span className="text-destructive">{error}</span>
				<Button variant="outline" size="sm" onClick={() => loadRoles()}>
					Retry
				</Button>
			</div>
		);
	}

	const builtInRoles = roles.filter(r => r.isBuiltIn);
	const customRoles = roles.filter(r => !r.isBuiltIn);

	return (
		<div className="space-y-6">
			{/* Built-in Roles */}
			<div>
				<h3 className="text-lg font-medium mb-3 flex items-center gap-2">
					<Lock className="h-4 w-4 text-muted-foreground" />
					Built-in Roles
				</h3>
				<p className="text-sm text-muted-foreground mb-4">
					These roles are system-defined and cannot be modified. Clone them to create custom variants.
				</p>
				<div className="border rounded-lg divide-y">
					{builtInRoles.map(role => (
						<RoleRow
							key={role.id}
							role={role}
							onClone={() => handleClone(role)}
							onViewPermissions={() => handleViewPermissions(role)}
							canManageRoles={canManageRoles}
						/>
					))}
				</div>
			</div>

			{/* Custom Roles */}
			<div>
				<h3 className="text-lg font-medium mb-3 flex items-center gap-2">
					<Shield className="h-4 w-4 text-muted-foreground" />
					Custom Roles
				</h3>
				{customRoles.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No custom roles yet. Clone a built-in role to create a custom variant.
					</p>
				) : (
					<div className="border rounded-lg divide-y">
						{customRoles.map(role => (
							<RoleRow
								key={role.id}
								role={role}
								onClone={() => handleClone(role)}
								onEdit={() => handleEdit(role)}
								onViewPermissions={() => handleViewPermissions(role)}
								onDelete={() => handleDelete(role)}
								canManageRoles={canManageRoles}
							/>
						))}
					</div>
				)}
			</div>

			{/* Clone Role Dialog */}
			{cloneSourceRole && (
				<CloneRoleDialog
					open={cloneDialogOpen}
					onOpenChange={setCloneDialogOpen}
					sourceRole={cloneSourceRole}
					onSuccess={handleCloneSuccess}
				/>
			)}

			{/* Edit Role Dialog */}
			{editRole && (
				<EditRoleDialog
					open={editDialogOpen}
					onOpenChange={setEditDialogOpen}
					role={editRole}
					onSuccess={handleEditSuccess}
				/>
			)}

			{/* Permissions Dialog */}
			{selectedRole && (
				<RolePermissionsDialog
					open={permissionsDialogOpen}
					onOpenChange={setPermissionsDialogOpen}
					role={selectedRole}
					onSaved={handlePermissionsSaved}
					readOnly={!canManageRoles}
				/>
			)}
		</div>
	);
}

interface RoleRowProps {
	role: Role;
	onClone: () => void;
	onEdit?: () => void;
	onViewPermissions: () => void;
	onDelete?: () => void;
	/** Whether user has permission to manage roles */
	canManageRoles: boolean;
}

function RoleRow({ role, onClone, onEdit, onViewPermissions, onDelete, canManageRoles }: RoleRowProps): ReactElement {
	return (
		<div className="flex items-center justify-between p-4 hover:bg-muted/50">
			<div className="flex items-center gap-3">
				<div>
					<div className="font-medium flex items-center gap-2">
						{role.name}
						{role.isBuiltIn && <Lock className="h-3 w-3 text-muted-foreground" />}
						{role.isDefault && (
							<span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Default</span>
						)}
					</div>
					{role.description && <div className="text-sm text-muted-foreground">{role.description}</div>}
					{role.clonedFrom && (
						<div className="text-xs text-muted-foreground mt-1">Cloned from another role</div>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="sm" onClick={onViewPermissions}>
					{role.isBuiltIn || !canManageRoles ? "View" : "Edit"} Permissions
				</Button>
				<PermissionGuard permissions="roles.edit">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon">
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{!role.isBuiltIn && onEdit && (
								<DropdownMenuItem onClick={onEdit}>
									<Pencil className="h-4 w-4 mr-2" />
									Edit Role
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={onClone}>
								<Copy className="h-4 w-4 mr-2" />
								Clone Role
							</DropdownMenuItem>
							{!role.isBuiltIn && onDelete && (
								<DropdownMenuItem onClick={onDelete} className="text-destructive">
									<Trash2 className="h-4 w-4 mr-2" />
									Delete Role
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</PermissionGuard>
			</div>
		</div>
	);
}
