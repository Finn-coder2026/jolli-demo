import type { GitHub } from "./GitHub.ts";

export function mockGitHub(partial?: Partial<GitHub>): GitHub {
	return {
		owner: "owner",
		repo: "repo",
		getContent: vi.fn(),
		getPull: vi.fn(),
		streamResults: vi.fn(),
		streamIssues: vi.fn(),
		streamComments: vi.fn(),
		streamReviews: vi.fn(),
		...partial,
	};
}
