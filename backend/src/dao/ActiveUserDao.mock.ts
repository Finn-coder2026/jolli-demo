import type { ActiveUserDao } from "./ActiveUserDao";
import { vi } from "vitest";

export function mockActiveUserDao(partial?: Partial<ActiveUserDao>): ActiveUserDao {
	return {
		findById: vi.fn(),
		findByEmail: vi.fn(),
		listActive: vi.fn(),
		listAll: vi.fn(),
		listByRole: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		deactivate: vi.fn(),
		reactivate: vi.fn(),
		delete: vi.fn(),
		countActive: vi.fn(),
		countAll: vi.fn(),
		countByRole: vi.fn(),
		...partial,
	};
}
