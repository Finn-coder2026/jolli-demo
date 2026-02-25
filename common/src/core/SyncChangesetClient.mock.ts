import type { SyncChangesetClient } from "./SyncChangesetClient";
import { vi } from "vitest";

export function mockSyncChangesetClient(partial?: Partial<SyncChangesetClient>): SyncChangesetClient {
	return {
		listChangesets: vi.fn().mockResolvedValue([]),
		listChangesetsPage: vi.fn().mockResolvedValue({ changesets: [], hasMore: false }),
		getChangeset: vi.fn(),
		getChangesetFiles: vi.fn().mockResolvedValue([]),
		reviewChangesetFile: vi.fn(),
		publishChangeset: vi.fn(),
		...partial,
	};
}
