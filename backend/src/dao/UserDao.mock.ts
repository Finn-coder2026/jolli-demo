import type { UserDao } from "./UserDao";
import { vi } from "vitest";

export function mockUserDao(partial?: Partial<UserDao>): UserDao {
	return {
		countUsers: vi.fn(),
		findUser: vi.fn(),
		findUserById: vi.fn(),
		createUser: vi.fn(),
		updateUser: vi.fn(),
		...partial,
	};
}
