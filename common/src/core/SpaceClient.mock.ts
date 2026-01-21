import { mockSpace } from "../types/Space.mock";
import { mockDoc } from "./Doc.mock";
import type { SpaceClient } from "./SpaceClient";

export function mockSpaceClient(partial?: Partial<SpaceClient>): SpaceClient {
	const space = mockSpace();
	const doc = mockDoc();
	return {
		listSpaces: async () => [space],
		getDefaultSpace: async () => space,
		getSpace: async () => space,
		createSpace: async () => space,
		updateSpace: async () => space,
		deleteSpace: async () => void 0,
		getTreeContent: async () => [doc],
		getTrashContent: async () => [],
		hasTrash: async () => false,
		...partial,
	} as SpaceClient;
}
