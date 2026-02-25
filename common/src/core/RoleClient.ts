import type {
	CloneRoleRequest,
	Permission,
	PermissionsByCategory,
	Role,
	RoleWithPermissions,
	SetPermissionsRequest,
	UpdateRoleRequest,
	UserPermissionsResponse,
} from "../types/Rbac";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/roles";

export interface RoleClient {
	/**
	 * List all roles
	 */
	listRoles(): Promise<Array<Role>>;

	/**
	 * Get a role with its permissions
	 */
	getRole(id: number): Promise<RoleWithPermissions>;

	/**
	 * Clone a role to create a new custom role
	 */
	cloneRole(sourceId: number, data: CloneRoleRequest): Promise<RoleWithPermissions>;

	/**
	 * Update a custom role
	 */
	updateRole(id: number, data: UpdateRoleRequest): Promise<Role>;

	/**
	 * Delete a custom role
	 */
	deleteRole(id: number): Promise<void>;

	/**
	 * Set permissions for a custom role (by permission slug)
	 */
	setRolePermissions(roleId: number, permissionSlugs: Array<string>): Promise<RoleWithPermissions>;

	/**
	 * List all permissions
	 */
	listPermissions(): Promise<Array<Permission>>;

	/**
	 * List permissions grouped by category
	 */
	listPermissionsGrouped(): Promise<PermissionsByCategory>;

	/**
	 * Get current user's permissions
	 */
	getCurrentUserPermissions(): Promise<UserPermissionsResponse>;
}

export function createRoleClient(baseUrl: string, auth: ClientAuth): RoleClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listRoles,
		getRole,
		cloneRole,
		updateRole,
		deleteRole,
		setRolePermissions,
		listPermissions,
		listPermissionsGrouped,
		getCurrentUserPermissions,
	};

	async function listRoles(): Promise<Array<Role>> {
		const response = await fetch(basePath, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list roles: ${response.statusText}`);
		}

		return (await response.json()) as Array<Role>;
	}

	async function getRole(id: number): Promise<RoleWithPermissions> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error("Role not found");
			}
			throw new Error(`Failed to get role: ${response.statusText}`);
		}

		return (await response.json()) as RoleWithPermissions;
	}

	async function cloneRole(sourceId: number, data: CloneRoleRequest): Promise<RoleWithPermissions> {
		const response = await fetch(`${basePath}/${sourceId}/clone`, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json()) as { error: string };
			throw new Error(errorData.error || `Failed to clone role: ${response.statusText}`);
		}

		return (await response.json()) as RoleWithPermissions;
	}

	async function updateRole(id: number, data: UpdateRoleRequest): Promise<Role> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PUT", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json()) as { error: string };
			throw new Error(errorData.error || `Failed to update role: ${response.statusText}`);
		}

		return (await response.json()) as Role;
	}

	async function deleteRole(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json()) as { error: string };
			throw new Error(errorData.error || `Failed to delete role: ${response.statusText}`);
		}
	}

	async function setRolePermissions(roleId: number, permissionSlugs: Array<string>): Promise<RoleWithPermissions> {
		const body: SetPermissionsRequest = { permissionSlugs };
		const response = await fetch(`${basePath}/${roleId}/permissions`, createRequest("PUT", body));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json()) as { error: string };
			throw new Error(errorData.error || `Failed to set role permissions: ${response.statusText}`);
		}

		return (await response.json()) as RoleWithPermissions;
	}

	async function listPermissions(): Promise<Array<Permission>> {
		const response = await fetch(`${basePath}/permissions`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list permissions: ${response.statusText}`);
		}

		return (await response.json()) as Array<Permission>;
	}

	async function listPermissionsGrouped(): Promise<PermissionsByCategory> {
		const response = await fetch(`${basePath}/permissions/grouped`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list grouped permissions: ${response.statusText}`);
		}

		return (await response.json()) as PermissionsByCategory;
	}

	async function getCurrentUserPermissions(): Promise<UserPermissionsResponse> {
		const response = await fetch(`${basePath}/me/permissions`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get current user permissions: ${response.statusText}`);
		}

		return (await response.json()) as UserPermissionsResponse;
	}
}
