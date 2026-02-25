import type { UserInvitation } from "./UserInvitation";

export function mockUserInvitation(partial?: Partial<UserInvitation>): UserInvitation {
	return {
		id: 1,
		email: "invitee@example.com",
		invitedBy: 1,
		role: "member",
		name: null,
		verificationId: 100,
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
		status: "pending",
		createdAt: new Date(),
		...partial,
	};
}
