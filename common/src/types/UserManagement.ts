/**
 * Organization user role slug.
 * Built-in roles: "owner", "admin", "member".
 */
export type OrgUserRole = "owner" | "admin" | "member";

/**
 * Invitation status
 */
export type InvitationStatus = "pending" | "accepted" | "expired";

/**
 * Active user within an organization (per-tenant).
 */
export interface ActiveUser {
	readonly id: number;
	readonly email: string;
	readonly role: OrgUserRole;
	readonly roleId: number | null; // FK to roles table (nullable during migration)
	readonly isActive: boolean;
	readonly name: string | null;
	readonly image: string | null;
	readonly jobTitle: string | null;
	readonly phone: string | null;
	readonly language: string;
	readonly timezone: string;
	readonly location: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * User invitation record
 */
export interface UserInvitation {
	readonly id: number;
	readonly email: string;
	readonly invitedBy: number;
	readonly role: OrgUserRole;
	readonly name: string | null;
	readonly tokenHash: string;
	readonly expiresAt: string;
	readonly status: InvitationStatus;
	readonly createdAt: string;
}

/**
 * Archived user record (for removed users)
 */
export interface ArchivedUser {
	readonly id: number;
	readonly userId: number;
	readonly email: string;
	readonly name: string | null;
	readonly role: OrgUserRole | null;
	readonly removedBy: number;
	readonly removedByName: string | null;
	readonly reason: string | null;
	readonly removedAt: string;
}

/**
 * Paginated list response
 */
export interface PaginatedResponse<T> {
	readonly data: Array<T>;
	readonly total: number;
}

/**
 * Response for listing active users with permission info.
 * Extends PaginatedResponse with flags indicating the current user's capabilities.
 */
export interface ActiveUsersResponse extends PaginatedResponse<ActiveUser> {
	/** Whether the current user has permission to edit user roles */
	readonly canEditRoles: boolean;
	/** Whether the current user has permission to manage users (deactivate/activate/delete) */
	readonly canManageUsers: boolean;
}

/**
 * Request to invite a user
 */
export interface InviteUserRequest {
	readonly email: string;
	readonly name?: string;
	readonly role: OrgUserRole;
}

/**
 * Request to update user role
 */
export interface UpdateUserRoleRequest {
	readonly role: OrgUserRole;
}

/**
 * Request to archive a user
 */
export interface ArchiveUserRequest {
	readonly reason?: string;
}

/**
 * Success response for operations that don't return data
 */
export interface SuccessResponse {
	readonly success: boolean;
}

/**
 * User management configuration response
 */
export interface UserManagementConfig {
	/** Authorized email patterns (comma-separated regex patterns, or "*" for all) */
	readonly authorizedEmailPatterns: string;
}

// Note: Role is defined in ./Rbac.ts - import from there or from jolli-common
