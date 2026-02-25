import type { DocDao } from "./DocDao";
import { vi } from "vitest";

export function mockDocDao(partial?: Partial<DocDao>): DocDao {
	return {
		createDoc: vi.fn(),
		readDoc: vi.fn(),
		readDocsByJrns: vi.fn().mockResolvedValue(new Map()),
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
		getAllContent: vi.fn().mockResolvedValue([]),
		searchInSpace: vi.fn(),
		reorderDoc: vi.fn(),
		moveDoc: vi.fn(),
		reorderAt: vi.fn(),
		findFolderByName: vi.fn(),
		findDocBySourcePath: vi.fn(),
		findDocBySourcePathAnySpace: vi.fn(),
		searchArticlesForLink: vi.fn(),
		...partial,
	};
}
