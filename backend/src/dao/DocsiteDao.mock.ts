import type { DocsiteDao } from "./DocsiteDao";
import { vi } from "vitest";

export function mockDocsiteDao(): DocsiteDao {
	return {
		createDocsite: vi.fn(),
		getDocsite: vi.fn(),
		getDocsiteByName: vi.fn(),
		listDocsites: vi.fn(),
		listDocsitesByUser: vi.fn(),
		listDocsitesByVisibility: vi.fn(),
		listDocsitesByStatus: vi.fn(),
		updateDocsite: vi.fn(),
		deleteDocsite: vi.fn(),
		deleteAllDocsites: vi.fn(),
	};
}
