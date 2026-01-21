import type { User } from "./User";

export function mockUser(partial?: Partial<User>): User {
	return {
		id: 1,
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
		isAgent: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		...partial,
	};
}
