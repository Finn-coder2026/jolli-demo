import type { Auth } from "./Auth";

export function mockAuth(partial?: Partial<Auth>): Auth {
	return {
		id: 1,
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
		provider: "google",
		subject: "1234567890",
		createdAt: new Date(),
		updatedAt: new Date(),
		...partial,
	};
}
