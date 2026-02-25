/**
 * RBAC (Role-Based Access Control) types for the frontend.
 */

/**
 * Permission categories
 */
export const PERMISSION_CATEGORIES = [
	"users",
	"spaces",
	"integrations",
	"sites",
	"roles",
	"dashboard",
	"articles",
] as const;
export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

/**
 * Permission definition
 */
export interface Permission {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly description: string | null;
	readonly category: PermissionCategory;
	readonly createdAt: string;
}

/**
 * Role definition
 */
export interface Role {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly description: string | null;
	readonly isBuiltIn: boolean;
	readonly isDefault: boolean;
	readonly priority: number;
	readonly clonedFrom: number | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Role with its assigned permissions
 */
export interface RoleWithPermissions extends Role {
	readonly permissions: Array<Permission>;
}

/**
 * Request body for cloning a role
 */
export interface CloneRoleRequest {
	readonly name: string;
	readonly slug?: string;
	readonly description?: string;
}

/**
 * Request body for updating a role
 */
export interface UpdateRoleRequest {
	readonly name?: string;
	readonly description?: string;
	readonly isDefault?: boolean;
	readonly priority?: number;
}

/**
 * Request body for setting role permissions (by slug)
 */
export interface SetPermissionsRequest {
	readonly permissionSlugs: Array<string>;
}

/**
 * Permissions grouped by category
 */
export type PermissionsByCategory = Record<PermissionCategory, Array<Permission>>;

/**
 * User permissions response from API
 */
export interface UserPermissionsResponse {
	readonly permissions: Array<string>;
	readonly role: RoleWithPermissions | null;
}
