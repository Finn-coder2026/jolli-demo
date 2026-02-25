import type { Role, RoleWithPermissions } from "../types/Rbac";
import type { RoleClient } from "./RoleClient";

export function mockRoleClient(): RoleClient {
	return {
		listRoles: async () => [],
		getRole: async () => mockRoleWithPermissions(),
		cloneRole: async () => mockRoleWithPermissions(),
		updateRole: async () => mockRole(),
		deleteRole: async () => void 0,
		setRolePermissions: async () => mockRoleWithPermissions(),
		listPermissions: async () => [],
		listPermissionsGrouped: async () => ({
			users: [],
			spaces: [],
			integrations: [],
			sites: [],
			roles: [],
			dashboard: [],
			articles: [],
		}),
		getCurrentUserPermissions: async () => ({
			role: mockRoleWithPermissions(),
			permissions: [],
		}),
	};
}

export function mockRole(): Role {
	return {
		id: 1,
		name: "Member",
		slug: "member",
		description: "Standard user access",
		isBuiltIn: true,
		isDefault: true,
		priority: 50,
		clonedFrom: null,
		createdAt: "2024-01-01T00:00:00.000Z",
		updatedAt: "2024-01-01T00:00:00.000Z",
	};
}

export function mockRoleWithPermissions(): RoleWithPermissions {
	return {
		...mockRole(),
		permissions: [],
	};
}
