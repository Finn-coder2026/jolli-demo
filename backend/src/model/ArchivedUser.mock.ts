import type { ArchivedUser } from "./ArchivedUser";

export function mockArchivedUser(partial?: Partial<ArchivedUser>): ArchivedUser {
	return {
		id: 1,
		userId: 100,
		email: "archived@example.com",
		name: "Archived User",
		role: "member",
		removedBy: 1,
		removedByName: "Admin User",
		reason: null,
		removedAt: new Date(),
		...partial,
	};
}
