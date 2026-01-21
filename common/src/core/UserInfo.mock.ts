import type { UserInfo } from "./UserInfo";

export function mockUserInfo(partial?: Partial<UserInfo>): UserInfo {
	return {
		email: "test@example.com",
		name: "Test User",
		picture: undefined,
		userId: 34,
		...partial,
	};
}
