import type { AuthDao } from "./AuthDao";
import { vi } from "vitest";

export function mockAuthDao(partial?: Partial<AuthDao>): AuthDao {
	return {
		findAuth: vi.fn(),
		createAuth: vi.fn(),
		updateAuth: vi.fn(),
		...partial,
	};
}
