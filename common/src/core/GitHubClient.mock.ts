import type { Integration } from "../types/Integration";
import type {
	ConnectExistingInstallationResponse,
	GitHubApp,
	GitHubClient,
	GitHubInstallation,
	GitHubSetupRedirectResponse,
	GitHubSummaryResponse,
	InstallationReposResponse,
	ListAvailableInstallationsResponse,
} from "./GitHubClient";

export function createMockGitHubClient(): GitHubClient {
	return {
		setupGitHubRedirect: async (): Promise<GitHubSetupRedirectResponse> => ({
			redirectUrl: "https://github.com/apps/test-app/installations/new",
			success: true,
		}),
		getGitHubSummary: async (): Promise<GitHubSummaryResponse> => ({
			orgCount: 2,
			totalRepos: 10,
			enabledRepos: 5,
			needsAttention: 1,
			lastSync: new Date().toISOString(),
		}),
		getGitHubApps: async (): Promise<Array<GitHubApp>> => [
			{
				appId: 12345,
				name: "Test App",
				slug: "test-app",
				htmlUrl: "https://github.com/apps/test-app",
				createdAt: new Date().toISOString(),
				orgCount: 2,
				totalRepos: 10,
				enabledRepos: 5,
			},
		],
		getGitHubInstallations: async (_appId?: number): Promise<Array<GitHubInstallation>> => [
			{
				id: 1,
				installationId: 1,
				name: "test-org",
				githubAppId: 12345,
				appSlug: "test-app",
				totalRepos: 5,
				enabledRepos: 3,
				needsAttention: 1,
				containerType: "org",
				appName: "Test App",
				installationStatus: "active",
			},
		],
		syncGitHubInstallations: async (): Promise<{ message: string; syncedCount: number }> => ({
			message: "Synced successfully",
			syncedCount: 2,
		}),
		getInstallationRepos: async (_installationId: number): Promise<InstallationReposResponse> => ({
			repos: [
				{
					fullName: "test-org/test-repo",
					defaultBranch: "main",
					enabled: true,
					status: "active",
					integrationId: 1,
				},
			],
			installationStatus: "active",
		}),
		enableRepo: async (_owner: string, _repo: string, _branch?: string): Promise<Integration> => ({
			id: 1,
			type: "github",
			name: "test-repo",
			status: "active",
			metadata: {
				repo: "test-org/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}),
		disableRepo: async (_owner: string, _repo: string): Promise<Integration> => ({
			id: 1,
			type: "github",
			name: "test-repo",
			status: "active",
			metadata: {
				repo: "test-org/test-repo",
				branch: "main",
				features: [],
			},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}),
		deleteGitHubInstallation: async (): Promise<{ success: boolean; deletedIntegrations: number }> => ({
			success: true,
			deletedIntegrations: 3,
		}),
		listAvailableInstallations: async (): Promise<ListAvailableInstallationsResponse> => ({
			installations: [
				{
					accountLogin: "acme-org",
					accountType: "Organization",
					installationId: 123,
					repos: ["acme-org/repo1", "acme-org/repo2"],
					alreadyConnectedToCurrentOrg: false,
				},
			],
		}),
		connectExistingInstallation: async (_installationId: number): Promise<ConnectExistingInstallationResponse> => ({
			success: true,
			redirectUrl: "https://tenant.example.com/integrations/github/org/acme-org?new_installation=true",
		}),
	};
}
