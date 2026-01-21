import type { DocDao } from "./DocDao";
import { vi } from "vitest";

export function mockDocDao(partial?: Partial<DocDao>): DocDao {
	return {
		createDoc: vi.fn(),
		readDoc: vi.fn(),
		readDocById: vi.fn(),
		listDocs: vi.fn(),
		updateDoc: vi.fn(),
		updateDocIfVersion: vi.fn(),
		deleteDoc: vi.fn(),
		deleteAllDocs: vi.fn(),
		searchDocsByTitle: vi.fn(),
		// Space tree methods
		getTreeContent: vi.fn(),
		getTrashContent: vi.fn(),
		softDelete: vi.fn(),
		restore: vi.fn(),
		renameDoc: vi.fn(),
		getMaxSortOrder: vi.fn(),
		hasDeletedDocs: vi.fn(),
		...partial,
	};
}
