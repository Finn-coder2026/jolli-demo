import type { Integration } from "./Integration";

export function mockIntegration(partial?: Partial<Integration>): Integration {
	return {
		id: 0,
		type: "github",
		name: "myrepo",
		status: "active",
		metadata: undefined,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...partial,
	};
}
