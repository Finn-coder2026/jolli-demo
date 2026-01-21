import type { GitHubInstallation } from "../model/GitHubInstallation";
import type { GitHubInstallationDao } from "./GitHubInstallationDao";

export function mockGitHubInstallationDao(): GitHubInstallationDao {
	return {
		createInstallation: async () => ({
			id: 1,
			containerType: "org",
			name: "test",
			appId: 1,
			installationId: 1,
			repos: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
		// biome-ignore lint/nursery/noUselessUndefined: TypeScript requires explicit return for this Promise type
		lookupByName: async (_name: string): Promise<GitHubInstallation | undefined> => undefined,
		// biome-ignore lint/nursery/noUselessUndefined: TypeScript requires explicit return for this Promise type
		lookupByInstallationId: async (_installationId: number): Promise<GitHubInstallation | undefined> => undefined,
		listInstallations: async () => [],
		updateInstallation: async installation => installation,
		// biome-ignore lint/suspicious/noEmptyBlockStatements: Mock function intentionally does nothing
		deleteInstallation: async () => {},
		// biome-ignore lint/suspicious/noEmptyBlockStatements: Mock function intentionally does nothing
		deleteAllInstallations: async () => {},
	};
}
