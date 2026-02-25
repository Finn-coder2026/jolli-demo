import type { SourceClient } from "./SourceClient";
import { vi } from "vitest";

export function mockSourceClient(partial?: Partial<SourceClient>): SourceClient {
	return {
		listSources: vi.fn().mockResolvedValue([]),
		createSource: vi.fn(),
		getSource: vi.fn(),
		updateSource: vi.fn(),
		deleteSource: vi.fn(),
		updateCursor: vi.fn(),
		listSpaceSources: vi.fn().mockResolvedValue([]),
		bindSource: vi.fn(),
		unbindSource: vi.fn(),
		...partial,
	};
}
