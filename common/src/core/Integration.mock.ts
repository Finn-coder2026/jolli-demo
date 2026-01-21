import type { Integration } from "../types/Integration";

export function mockIntegration(partial?: Partial<Integration>): Integration {
	return {
		id: 1,
		type: "github",
		name: "test-repo",
		status: "active",
		metadata: {
			repo: "owner/test-repo",
			branch: "main",
			features: ["push"],
		},
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...partial,
	};
}
