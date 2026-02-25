import type { ActiveUser, UserInvitation } from "../types/UserManagement";
import type { UserManagementClient } from "./UserManagementClient";

function createMockActiveUser(): ActiveUser {
	return {
		id: 1,
		email: "test@example.com",
		role: "member",
		roleId: 1,
		isActive: true,
		name: "Test User",
		image: null,
		jobTitle: null,
		phone: null,
		language: "en",
		timezone: "UTC",
		location: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function createMockUserInvitation(): UserInvitation {
	return {
		id: 1,
		email: "test@example.com",
		name: null,
		role: "member",
		tokenHash: "mock-token-hash",
		expiresAt: new Date().toISOString(),
		status: "pending",
		invitedBy: 1,
		createdAt: new Date().toISOString(),
	};
}

export function mockUserManagementClient(partial?: Partial<UserManagementClient>): UserManagementClient {
	return {
		getConfig: async () => ({ authorizedEmailPatterns: ".*" }),
		listRoles: async () => [
			{
				id: 1,
				name: "Owner",
				slug: "owner",
				description: "Full access",
				isBuiltIn: true,
				isDefault: false,
				priority: 100,
				clonedFrom: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: 2,
				name: "Admin",
				slug: "admin",
				description: "Administrative access",
				isBuiltIn: true,
				isDefault: false,
				priority: 80,
				clonedFrom: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: 3,
				name: "Member",
				slug: "member",
				description: "Standard access",
				isBuiltIn: true,
				isDefault: true,
				priority: 50,
				clonedFrom: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		],
		listActiveUsers: async () => ({ data: [], total: 0, canEditRoles: false, canManageUsers: false }),
		listPendingInvitations: async () => ({ data: [], total: 0 }),
		listArchivedUsers: async () => ({ data: [], total: 0 }),
		inviteUser: async () => createMockUserInvitation(),
		cancelInvitation: async () => ({ success: true }),
		resendInvitation: async () => createMockUserInvitation(),
		updateUserRole: async () => createMockActiveUser(),
		updateUserName: async () => createMockActiveUser(),
		deactivateUser: async () => createMockActiveUser(),
		activateUser: async () => createMockActiveUser(),
		archiveUser: async () => ({ success: true }),
		...partial,
	};
}
