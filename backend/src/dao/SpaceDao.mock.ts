import type { SpaceDao } from "./SpaceDao";
import { vi } from "vitest";

export function mockSpaceDao(partial?: Partial<SpaceDao>): SpaceDao {
	return {
		createSpace: vi.fn(),
		getSpace: vi.fn(),
		getSpaceByJrn: vi.fn(),
		getSpaceBySlug: vi.fn(),
		listSpaces: vi.fn(),
		updateSpace: vi.fn(),
		deleteSpace: vi.fn(),
		getOrCreateDefaultSpace: vi.fn(),
		...partial,
	};
}
