import type { SyncCommitDao } from "./SyncCommitDao";
import { vi } from "vitest";

export function mockSyncCommitDao(partial?: Partial<SyncCommitDao>): SyncCommitDao {
	return {
		createProposedCommit: vi.fn(),
		findCommitByScopeAndClientChangesetId: vi.fn(),
		listCommitsByScope: vi.fn(),
		listCommitSummaries: vi.fn(),
		getCommit: vi.fn(),
		getCommitFiles: vi.fn(),
		getCommitFile: vi.fn(),
		createFileReview: vi.fn(),
		getLatestReviewsForCommit: vi.fn(),
		getLatestReviewForFile: vi.fn(),
		updateCommit: vi.fn(),
		...partial,
	};
}
