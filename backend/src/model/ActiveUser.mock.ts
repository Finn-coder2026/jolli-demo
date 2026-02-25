import type { ActiveUser } from "./ActiveUser";

export function mockActiveUser(partial?: Partial<ActiveUser>): ActiveUser {
	return {
		id: 1,
		email: "test@example.com",
		role: "member",
		roleId: null,
		isActive: true,
		isAgent: false,
		name: "Test User",
		image: null,
		jobTitle: null,
		phone: null,
		language: "en",
		timezone: "UTC",
		location: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...partial,
	};
}
