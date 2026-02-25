import type { SourceDao } from "./SourceDao";
import { vi } from "vitest";

export function mockSourceDao(partial?: Partial<SourceDao>): SourceDao {
	return {
		createSource: vi.fn(),
		getSource: vi.fn(),
		listSources: vi.fn().mockResolvedValue([]),
		updateSource: vi.fn(),
		deleteSource: vi.fn(),
		updateCursor: vi.fn(),
		bindSourceToSpace: vi.fn(),
		unbindSourceFromSpace: vi.fn(),
		listSourcesForSpace: vi.fn().mockResolvedValue([]),
		listSpacesForSource: vi.fn().mockResolvedValue([]),
		findSourcesMatchingJrn: vi.fn().mockResolvedValue([]),
		...partial,
	};
}
