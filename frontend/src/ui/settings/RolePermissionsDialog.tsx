/**
 * RolePermissionsDialog - Dialog for viewing/editing role permissions.
 */

import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../components/ui/Dialog";
import { Label } from "../../components/ui/Label";
import { useClient } from "../../contexts/ClientContext";
import type { Permission, PermissionsByCategory, RoleWithPermissions } from "jolli-common";
import { type ReactElement, useCallback, useEffect, useState } from "react";

export interface RolePermissionsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	role: RoleWithPermissions;
	onSaved: () => void;
	/** Force read-only mode (e.g., when user lacks roles.edit permission) */
	readOnly?: boolean;
}

/**
 * Dialog component for viewing and editing role permissions.
 */
export function RolePermissionsDialog({
	open,
	onOpenChange,
	role,
	onSaved,
	readOnly,
}: RolePermissionsDialogProps): ReactElement {
	const client = useClient();
	const [permissionsByCategory, setPermissionsByCategory] = useState<PermissionsByCategory | null>(null);
	const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();

	// Initialize selected permissions from role
	useEffect(() => {
		setSelectedSlugs(new Set(role.permissions.map(p => p.slug)));
	}, [role]);

	// Load all permissions grouped by category
	const loadPermissions = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(undefined);
			const grouped = await client.roles().listPermissionsGrouped();
			setPermissionsByCategory(grouped);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load permissions");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		if (open) {
			loadPermissions().then();
		}
	}, [open, loadPermissions]);

	function handlePermissionToggle(slug: string): void {
		setSelectedSlugs(prev => {
			const newSet = new Set(prev);
			if (newSet.has(slug)) {
				newSet.delete(slug);
			} else {
				newSet.add(slug);
			}
			return newSet;
		});
	}

	async function handleSave(): Promise<void> {
		// Note: Save button is only rendered for non-built-in roles, so no need
		// to check role.isBuiltIn here. The UI prevents this from being called
		// for built-in roles.
		try {
			setIsSaving(true);
			setError(undefined);
			await client.roles().setRolePermissions(role.id, Array.from(selectedSlugs));
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save permissions");
		} finally {
			setIsSaving(false);
		}
	}

	function handleOpenChange(newOpen: boolean): void {
		if (!newOpen) {
			setError(undefined);
		}
		onOpenChange(newOpen);
	}

	const isReadOnly = role.isBuiltIn || readOnly === true;
	const hasChanges =
		!isReadOnly &&
		(selectedSlugs.size !== role.permissions.length || !role.permissions.every(p => selectedSlugs.has(p.slug)));

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>
						{isReadOnly ? "View" : "Edit"} Permissions - {role.name}
					</DialogTitle>
					<DialogDescription>
						{role.isBuiltIn
							? "Built-in roles cannot be modified. Clone this role to create a customizable copy."
							: isReadOnly
								? "You don't have permission to modify role permissions."
								: "Select the permissions for this role. Changes are saved when you click Save."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto py-4 scrollbar-thin">
					{isLoading ? (
						<div className="flex items-center justify-center py-8">
							<span className="text-muted-foreground">Loading permissions...</span>
						</div>
					) : error ? (
						<div className="flex flex-col items-center justify-center py-8 gap-4">
							<span className="text-destructive">{error}</span>
							<Button variant="outline" size="sm" onClick={loadPermissions}>
								Retry
							</Button>
						</div>
					) : permissionsByCategory ? (
						<div className="space-y-6">
							{Object.entries(permissionsByCategory).map(([category, permissions]) => (
								<PermissionCategory
									key={category}
									category={category}
									permissions={permissions}
									selectedSlugs={selectedSlugs}
									onToggle={handlePermissionToggle}
									disabled={isReadOnly}
								/>
							))}
						</div>
					) : null}
				</div>

				<DialogFooter>
					{!isReadOnly && hasChanges && (
						<span className="text-sm text-muted-foreground mr-auto">Unsaved changes</span>
					)}
					<Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
						{isReadOnly ? "Close" : "Cancel"}
					</Button>
					{!isReadOnly && (
						<Button onClick={handleSave} disabled={isSaving || !hasChanges}>
							{isSaving ? "Saving..." : "Save"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface PermissionCategoryProps {
	category: string;
	permissions: Array<Permission>;
	selectedSlugs: Set<string>;
	onToggle: (slug: string) => void;
	disabled: boolean;
}

function PermissionCategory({
	category,
	permissions,
	selectedSlugs,
	onToggle,
	disabled,
}: PermissionCategoryProps): ReactElement | null {
	if (permissions.length === 0) {
		return null;
	}

	const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

	return (
		<div>
			<h4 className="font-medium text-sm mb-2 text-muted-foreground uppercase tracking-wide">{categoryName}</h4>
			<div className="space-y-2 pl-2">
				{permissions.map(permission => (
					<div key={permission.slug} className="flex items-start space-x-3">
						<Checkbox
							id={`perm-${permission.slug}`}
							checked={selectedSlugs.has(permission.slug)}
							onCheckedChange={() => onToggle(permission.slug)}
							disabled={disabled}
						/>
						<div className="grid gap-0.5 leading-none">
							<Label
								htmlFor={`perm-${permission.slug}`}
								className={`text-sm font-medium ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
							>
								{permission.name}
							</Label>
							{permission.description && (
								<p className="text-xs text-muted-foreground">{permission.description}</p>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
