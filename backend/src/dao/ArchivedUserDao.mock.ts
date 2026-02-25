import type { ArchivedUserDao } from "./ArchivedUserDao";
import { vi } from "vitest";

export function mockArchivedUserDao(partial?: Partial<ArchivedUserDao>): ArchivedUserDao {
	return {
		findById: vi.fn(),
		findByUserId: vi.fn(),
		listAll: vi.fn(),
		listByRemover: vi.fn(),
		listByDateRange: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		deleteOlderThan: vi.fn(),
		count: vi.fn(),
		...partial,
	};
}
