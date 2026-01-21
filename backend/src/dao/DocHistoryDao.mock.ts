import type { DocHistoryDao } from "./DocHistoryDao";
import { vi } from "vitest";

export function mockDocHistoryDao(partial?: Partial<DocHistoryDao>): DocHistoryDao {
	return {
		createDocHistory: vi.fn(),
		getDocHistory: vi.fn(),
		getDocHistoryByVersion: vi.fn(),
		listDocHistoryByDocId: vi.fn(),
		getLatestDocHistory: vi.fn(),
		updateDocHistory: vi.fn(),
		deleteDocHistory: vi.fn(),
		deleteDocHistoryByDocId: vi.fn(),
		deleteAllDocHistories: vi.fn(),
		listDocHistoryPaginated: vi.fn(),
		...partial,
	};
}
