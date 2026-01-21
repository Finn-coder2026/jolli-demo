import type { Integration } from "../types/Integration";
import type { ClientAuth } from "./Client";

export interface GitHubSetupRedirectResponse {
	redirectUrl?: string;
	success?: boolean;
	error?: string;
}

export interface GitHubSummaryResponse {
	orgCount: number;
	totalRepos: number;
	enabledRepos: number;
	needsAttention: number;
	lastSync: string;
}

export interface GitHubInstallation {
	id: number;
	installationId: number;
	name: string;
	githubAppId: number;
	appSlug: string;
	totalRepos: number;
	enabledRepos: number;
	needsAttention: number;
	containerType: "org" | "user";
	appName: string;
	installationStatus?: "active" | "not_installed";
}

export interface GitHubRepository {
	fullName: string;
	defaultBranch: string;
	enabled: boolean;
	status: "active" | "needs_repo_access" | "error" | "available";
	integrationId?: number;
	lastAccessCheck?: string;
	accessError?: string;
}

export interface GitHubApp {
	appId: number;
	name: string;
	slug: string;
	htmlUrl: string;
	createdAt: string;
	orgCount: number;
	totalRepos: number;
	enabledRepos: number;
}

export interface InstallationReposResponse {
	repos: Array<GitHubRepository>;
	installationStatus: "active" | "not_installed";
}

/**
 * An installation available to connect to the current tenant/org.
 * Used when an installation already exists on GitHub but hasn't been connected.
 */
export interface AvailableGitHubInstallation {
	/** Account login (org or user name) */
	accountLogin: string;
	/** Account type */
	accountType: "Organization" | "User";
	/** Installation ID from GitHub */
	installationId: number;
	/** Repository names the installation has access to */
	repos: Array<string>;
	/** Whether this installation is already connected to the current tenant+org */
	alreadyConnectedToCurrentOrg: boolean;
}

export interface ListAvailableInstallationsResponse {
	installations: Array<AvailableGitHubInstallation>;
}

export interface ConnectExistingInstallationResponse {
	success: boolean;
	redirectUrl?: string;
	error?: string;
}

export interface GitHubClient {
	/**
	 * Gets the redirect URL for installing the Jolli GitHub App
	 * @throws Error if the API call fails
	 */
	setupGitHubRedirect(): Promise<GitHubSetupRedirectResponse>;
	/**
	 * Gets summary statistics for GitHub integrations
	 * @throws Error if the API call fails
	 */
	getGitHubSummary(): Promise<GitHubSummaryResponse>;
	/**
	 * Gets all GitHub Apps with their stats
	 * @throws Error if the API call fails
	 */
	getGitHubApps(): Promise<Array<GitHubApp>>;
	/**
	 * Gets all GitHub installations (orgs and users) with their accessible repositories
	 * @param appId Optional filter by specific GitHub App
	 * @throws Error if the API call fails
	 */
	getGitHubInstallations(appId?: number): Promise<Array<GitHubInstallation>>;
	/**
	 * Manually syncs all GitHub installations from GitHub API
	 * @throws Error if the API call fails
	 */
	syncGitHubInstallations(): Promise<{ message: string; syncedCount: number }>;
	/**
	 * Gets all repositories for a specific GitHub installation
	 * @param installationId The installation ID
	 * @throws Error if the API call fails
	 */
	getInstallationRepos(installationId: number): Promise<InstallationReposResponse>;
	/**
	 * Enables a repository for Jolli
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param branch The branch to track (optional, defaults to repo's default branch)
	 * @throws Error if the API call fails
	 */
	enableRepo(owner: string, repo: string, branch?: string): Promise<Integration>;
	/**
	 * Disables a repository for Jolli
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @throws Error if the API call fails
	 */
	disableRepo(owner: string, repo: string): Promise<Integration>;
	/**
	 * Deletes a GitHub installation (org or user) and all its associated integrations
	 * @param installationId The installation database ID (not the GitHub installation ID)
	 * @throws Error if the API call fails
	 */
	deleteGitHubInstallation(installationId: number): Promise<{ success: boolean; deletedIntegrations: number }>;
	/**
	 * Lists available GitHub installations that can be connected to the current tenant/org.
	 * Returns installations that exist on GitHub but may not be connected to this tenant.
	 * @throws Error if the API call fails
	 */
	listAvailableInstallations(): Promise<ListAvailableInstallationsResponse>;
	/**
	 * Connects an existing GitHub installation to the current tenant/org.
	 * Used when the GitHub App is already installed on a GitHub org elsewhere.
	 * @param installationId The GitHub installation ID to connect
	 * @throws Error if the API call fails
	 */
	connectExistingInstallation(installationId: number): Promise<ConnectExistingInstallationResponse>;
}

export function createGitHubClient(baseUrl: string, auth: ClientAuth): GitHubClient {
	const { createRequest } = auth;
	return {
		setupGitHubRedirect,
		getGitHubSummary,
		getGitHubApps,
		getGitHubInstallations,
		syncGitHubInstallations,
		getInstallationRepos,
		enableRepo,
		disableRepo,
		deleteGitHubInstallation,
		listAvailableInstallations,
		connectExistingInstallation,
	};

	async function setupGitHubRedirect(): Promise<GitHubSetupRedirectResponse> {
		const response = await fetch(`${baseUrl}/api/github/setup/redirect`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const data = (await response.json()) as { error?: string };
			throw new Error(data.error || "Failed to setup GitHub redirect");
		}

		return (await response.json()) as GitHubSetupRedirectResponse;
	}

	async function getGitHubSummary(): Promise<GitHubSummaryResponse> {
		const response = await fetch(`${baseUrl}/api/github/summary`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get GitHub summary: ${response.statusText}`);
		}

		return (await response.json()) as GitHubSummaryResponse;
	}

	async function getGitHubApps(): Promise<Array<GitHubApp>> {
		const response = await fetch(`${baseUrl}/api/github/apps`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get GitHub apps: ${response.statusText}`);
		}

		return (await response.json()) as Array<GitHubApp>;
	}

	async function getGitHubInstallations(appId?: number): Promise<Array<GitHubInstallation>> {
		const url = appId
			? `${baseUrl}/api/github/installations?appId=${appId}`
			: `${baseUrl}/api/github/installations`;
		const response = await fetch(url, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get GitHub installations: ${response.statusText}`);
		}

		return (await response.json()) as Array<GitHubInstallation>;
	}

	async function syncGitHubInstallations(): Promise<{ message: string; syncedCount: number }> {
		const response = await fetch(`${baseUrl}/api/github/installations/sync`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to sync GitHub installations: ${response.statusText}`);
		}

		return (await response.json()) as { message: string; syncedCount: number };
	}

	async function getInstallationRepos(installationId: number): Promise<InstallationReposResponse> {
		const response = await fetch(
			`${baseUrl}/api/github/installations/${installationId}/repos`,
			createRequest("GET"),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get installation repos: ${response.statusText}`);
		}

		return (await response.json()) as InstallationReposResponse;
	}

	async function enableRepo(owner: string, repo: string, branch?: string): Promise<Integration> {
		const response = await fetch(`${baseUrl}/api/github/repos/${owner}/${repo}`, createRequest("POST", { branch }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to enable repository: ${response.statusText}`);
		}

		return (await response.json()) as Integration;
	}

	async function disableRepo(owner: string, repo: string): Promise<Integration> {
		const response = await fetch(`${baseUrl}/api/github/repos/${owner}/${repo}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to remove repository: ${response.statusText}`);
		}

		return (await response.json()) as Integration;
	}

	async function deleteGitHubInstallation(
		installationId: number,
	): Promise<{ success: boolean; deletedIntegrations: number }> {
		const response = await fetch(`${baseUrl}/api/github/installations/${installationId}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete installation: ${response.statusText}`);
		}

		return (await response.json()) as { success: boolean; deletedIntegrations: number };
	}

	async function listAvailableInstallations(): Promise<ListAvailableInstallationsResponse> {
		const response = await fetch(`${baseUrl}/api/connect/github/list-available`, createRequest("POST", {}));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list available installations: ${response.statusText}`);
		}

		return (await response.json()) as ListAvailableInstallationsResponse;
	}

	async function connectExistingInstallation(installationId: number): Promise<ConnectExistingInstallationResponse> {
		const response = await fetch(
			`${baseUrl}/api/connect/github/connect-existing`,
			createRequest("POST", { installationId }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			const data = (await response.json()) as ConnectExistingInstallationResponse;
			return { success: false, error: data.error || "Failed to connect installation" };
		}

		return (await response.json()) as ConnectExistingInstallationResponse;
	}
}
