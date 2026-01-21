import type { SyncArticleDao } from "./SyncArticleDao";
import { vi } from "vitest";

export function mockSyncArticleDao(partial?: Partial<SyncArticleDao>): SyncArticleDao {
	return {
		getSyncArticle: vi.fn(),
		upsertSyncArticle: vi.fn(),
		getSyncArticlesSince: vi.fn(),
		getCurrentCursor: vi.fn(),
		advanceCursor: vi.fn(),
		deleteAllSyncArticles: vi.fn(),
		...partial,
	};
}
