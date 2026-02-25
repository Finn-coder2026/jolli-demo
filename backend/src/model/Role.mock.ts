import type { Role } from "./Role";

/**
 * Creates a mock Role for testing.
 */
export function mockRole(overrides: Partial<Role> = {}): Role {
	return {
		id: 1,
		name: "Admin",
		slug: "admin",
		description: "Administrative access",
		isBuiltIn: true,
		isDefault: false,
		priority: 80,
		clonedFrom: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

/**
 * Creates mock built-in roles for testing.
 */
export function mockBuiltInRoles(): Array<Role> {
	return [
		mockRole({ id: 1, name: "Owner", slug: "owner", priority: 100, isDefault: false }),
		mockRole({ id: 2, name: "Admin", slug: "admin", priority: 80, isDefault: false }),
		mockRole({ id: 3, name: "Member", slug: "member", priority: 50, isDefault: true }),
	];
}
