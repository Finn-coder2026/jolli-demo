import type { Role } from "../types/Rbac";
import type {
	ActiveUser,
	ActiveUsersResponse,
	ArchivedUser,
	InviteUserRequest,
	OrgUserRole,
	PaginatedResponse,
	SuccessResponse,
	UserInvitation,
	UserManagementConfig,
} from "../types/UserManagement";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/user-management";

export interface UserManagementClient {
	/**
	 * Get user management configuration (authorized email patterns)
	 */
	getConfig(): Promise<UserManagementConfig>;

	/**
	 * List all available roles for the current tenant.
	 * Returns roles sorted by priority (highest first).
	 */
	listRoles(): Promise<Array<Role>>;

	/**
	 * List active users with pagination.
	 * Returns canEditRoles flag indicating if current user can change user roles.
	 */
	listActiveUsers(limit?: number, offset?: number): Promise<ActiveUsersResponse>;

	/**
	 * List pending invitations with pagination
	 */
	listPendingInvitations(limit?: number, offset?: number): Promise<PaginatedResponse<UserInvitation>>;

	/**
	 * List archived users with pagination
	 */
	listArchivedUsers(limit?: number, offset?: number): Promise<PaginatedResponse<ArchivedUser>>;

	/**
	 * Invite a new user
	 */
	inviteUser(data: InviteUserRequest): Promise<UserInvitation>;

	/**
	 * Cancel/delete an invitation
	 */
	cancelInvitation(id: number): Promise<SuccessResponse>;

	/**
	 * Resend an invitation (generates new token and expiry)
	 */
	resendInvitation(id: number): Promise<UserInvitation>;

	/**
	 * Update a user's role
	 */
	updateUserRole(userId: number, role: OrgUserRole): Promise<ActiveUser>;

	/**
	 * Update a user's name
	 */
	updateUserName(userId: number, name: string): Promise<ActiveUser>;

	/**
	 * Deactivate a user (soft lock - user cannot log in but remains in system)
	 */
	deactivateUser(userId: number): Promise<ActiveUser>;

	/**
	 * Activate a previously deactivated user
	 */
	activateUser(userId: number): Promise<ActiveUser>;

	/**
	 * Archive/remove a user
	 */
	archiveUser(userId: number, reason?: string): Promise<SuccessResponse>;
}

export function createUserManagementClient(baseUrl: string, auth: ClientAuth): UserManagementClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		getConfig,
		listRoles,
		listActiveUsers,
		listPendingInvitations,
		listArchivedUsers,
		inviteUser,
		cancelInvitation,
		resendInvitation,
		updateUserRole,
		updateUserName,
		deactivateUser,
		activateUser,
		archiveUser,
	};

	async function getConfig(): Promise<UserManagementConfig> {
		const response = await fetch(`${basePath}/config`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get user management config: ${response.statusText}`);
		}

		return (await response.json()) as UserManagementConfig;
	}

	async function listRoles(): Promise<Array<Role>> {
		const response = await fetch(`${basePath}/roles`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list roles: ${response.statusText}`);
		}

		return (await response.json()) as Array<Role>;
	}

	async function listActiveUsers(limit?: number, offset?: number): Promise<ActiveUsersResponse> {
		const params = new URLSearchParams();
		if (limit !== undefined) {
			params.set("limit", String(limit));
		}
		if (offset !== undefined) {
			params.set("offset", String(offset));
		}
		const queryString = params.toString();
		const url = queryString ? `${basePath}/active?${queryString}` : `${basePath}/active`;

		const response = await fetch(url, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		// Handle 404 as empty result - no active users available
		if (response.status === 404) {
			return { data: [], total: 0, canEditRoles: false, canManageUsers: false };
		}

		if (!response.ok) {
			throw new Error(`Failed to list active users: ${response.statusText}`);
		}

		return (await response.json()) as ActiveUsersResponse;
	}

	async function listPendingInvitations(limit?: number, offset?: number): Promise<PaginatedResponse<UserInvitation>> {
		const params = new URLSearchParams();
		if (limit !== undefined) {
			params.set("limit", String(limit));
		}
		if (offset !== undefined) {
			params.set("offset", String(offset));
		}
		const queryString = params.toString();
		const url = queryString ? `${basePath}/pending?${queryString}` : `${basePath}/pending`;

		const response = await fetch(url, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		// Handle 404 as empty result - no pending invitations available
		if (response.status === 404) {
			return { data: [], total: 0 };
		}

		if (!response.ok) {
			throw new Error(`Failed to list pending invitations: ${response.statusText}`);
		}

		return (await response.json()) as PaginatedResponse<UserInvitation>;
	}

	async function listArchivedUsers(limit?: number, offset?: number): Promise<PaginatedResponse<ArchivedUser>> {
		const params = new URLSearchParams();
		if (limit !== undefined) {
			params.set("limit", String(limit));
		}
		if (offset !== undefined) {
			params.set("offset", String(offset));
		}
		const queryString = params.toString();
		const url = queryString ? `${basePath}/archived?${queryString}` : `${basePath}/archived`;

		const response = await fetch(url, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		// Handle 404 as empty result - no archived users available
		if (response.status === 404) {
			return { data: [], total: 0 };
		}

		if (!response.ok) {
			throw new Error(`Failed to list archived users: ${response.statusText}`);
		}

		return (await response.json()) as PaginatedResponse<ArchivedUser>;
	}

	async function inviteUser(data: InviteUserRequest): Promise<UserInvitation> {
		const response = await fetch(`${basePath}/invite`, createRequest("POST", data));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const errorData = (await response.json()) as { error: string };
			throw new Error(errorData.error || `Failed to invite user: ${response.statusText}`);
		}

		return (await response.json()) as UserInvitation;
	}

	async function cancelInvitation(id: number): Promise<SuccessResponse> {
		const response = await fetch(`${basePath}/invitation/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to cancel invitation: ${response.statusText}`);
		}

		return (await response.json()) as SuccessResponse;
	}

	async function resendInvitation(id: number): Promise<UserInvitation> {
		const response = await fetch(`${basePath}/invitation/${id}/resend`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to resend invitation: ${response.statusText}`);
		}

		return (await response.json()) as UserInvitation;
	}

	async function updateUserRole(userId: number, role: OrgUserRole): Promise<ActiveUser> {
		const response = await fetch(`${basePath}/user/${userId}/role`, createRequest("PUT", { role }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update user role: ${response.statusText}`);
		}

		return (await response.json()) as ActiveUser;
	}

	async function updateUserName(userId: number, name: string): Promise<ActiveUser> {
		const response = await fetch(`${basePath}/user/${userId}/name`, createRequest("PUT", { name }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update user name: ${response.statusText}`);
		}

		return (await response.json()) as ActiveUser;
	}

	async function deactivateUser(userId: number): Promise<ActiveUser> {
		const response = await fetch(`${basePath}/user/${userId}/deactivate`, createRequest("PUT"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to deactivate user: ${response.statusText}`);
		}

		return (await response.json()) as ActiveUser;
	}

	async function activateUser(userId: number): Promise<ActiveUser> {
		const response = await fetch(`${basePath}/user/${userId}/activate`, createRequest("PUT"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to activate user: ${response.statusText}`);
		}

		return (await response.json()) as ActiveUser;
	}

	async function archiveUser(userId: number, reason?: string): Promise<SuccessResponse> {
		const body = reason !== undefined ? { reason } : undefined;
		const response = await fetch(`${basePath}/user/${userId}`, createRequest("DELETE", body));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to archive user: ${response.statusText}`);
		}

		return (await response.json()) as SuccessResponse;
	}
}
