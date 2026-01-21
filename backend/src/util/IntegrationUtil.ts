import type { IntegrationDao } from "../dao/IntegrationDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { getCoreJolliGithubApp } from "../model/GitHubApp";
import type { GithubRepoIntegration, Integration } from "../model/Integration";
import { getAccessTokenForGitHubAppInstallation } from "./GithubAppUtil";
import { getLog } from "./Logger";
import type { GithubRepoIntegrationMetadata } from "jolli-common";

const log = getLog(import.meta);

function getInstallationIdFromIntegrationMetadata(integrationMetadata: GithubRepoIntegrationMetadata): number {
	const installationId = integrationMetadata.installationId;
	if (typeof installationId !== "number") {
		throw new Error("GitHub App installation ID is missing in integration metadata");
	}
	return installationId;
}

function getGitHubRepoIntegrationMetadata(integration: Integration): GithubRepoIntegrationMetadata {
	const integrationMetadata = integration.metadata;
	if (
		typeof integrationMetadata === "object" &&
		integrationMetadata !== null &&
		"repo" in integrationMetadata &&
		"branch" in integrationMetadata &&
		"features" in integrationMetadata
	) {
		return integrationMetadata as GithubRepoIntegrationMetadata;
	}
	throw new Error("Invalid GitHub repo integration metadata");
}

export async function lookupGithubRepoIntegration(
	integrationsDao: IntegrationDao,
	id: number,
): Promise<GithubRepoIntegration | undefined> {
	return await integrationsDao.lookupIntegration<GithubRepoIntegration>(id);
}

/**
 * Get an access token for the GitHub App installation associated with the given GitHub repo integration.
 * You should be able to use this access token to clone the repo specified in the integration metadata.
 * See https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
 * @param integration the GitHub repo integration.
 * @returns the access token.
 */
export async function getAccessTokenForGithubRepoIntegration(
	integration: Integration,
	withRepoDetails: true,
): Promise<{ accessToken: string; owner: string; repo: string }>;
export async function getAccessTokenForGithubRepoIntegration(integration: Integration): Promise<string>;
export async function getAccessTokenForGithubRepoIntegration(
	integration: Integration,
	withRepoDetails?: boolean,
): Promise<string | { accessToken: string; owner: string; repo: string }> {
	const app = getCoreJolliGithubApp();
	if (!app) {
		throw new Error("GitHub App not found for integration");
	}
	const integrationMetadata = getGitHubRepoIntegrationMetadata(integration);
	const installationId = getInstallationIdFromIntegrationMetadata(integrationMetadata);
	const accessToken = await getAccessTokenForGitHubAppInstallation(app, installationId);
	if (!accessToken) {
		throw new Error(`Failed to get access token for GitHub App installation ID ${installationId}`);
	}

	if (withRepoDetails) {
		// Extract org/owner and repo name from metadata.repo (format: "owner/name")
		const fullRepo = integrationMetadata.repo || "";
		const [owner, repo] = fullRepo.split("/", 2);
		if (!owner || !repo) {
			throw new Error("Invalid repo format in integration metadata; expected 'owner/repo'");
		}
		return { accessToken, owner, repo };
	}

	return accessToken;
}

/**
 * Clean up orphaned GitHub integrations (integrations whose installationId no longer exists
 * or that have no installationId and can't be accessed)
 * @param integrationsManager the integration manager for deleting orphaned integrations
 * @param installations the list of current GitHub installations
 * @param integrations the list of current integrations
 * @returns the number of orphaned integrations deleted
 */
export async function cleanupOrphanedGitHubIntegrations(
	integrationsManager: IntegrationsManager,
	installations: Array<{ installationId: number }>,
	integrations: Array<Integration>,
): Promise<number> {
	const validInstallationIds = new Set(installations.map(inst => inst.installationId));

	const orphanedIntegrations = integrations.filter(i => {
		if (i.type !== "github") {
			return false;
		}

		const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
		const installationId = metadata?.installationId;

		// Case 1: Has an installationId, but it's no longer valid
		if (installationId !== undefined && !validInstallationIds.has(installationId)) {
			return true;
		}

		// Case 2: Has no installationId and is in needs_repo_access or error state
		// These are failed integration attempts that should be cleaned up
		return installationId === undefined && (i.status === "needs_repo_access" || i.status === "error");
	});

	for (const integration of orphanedIntegrations) {
		await integrationsManager.deleteIntegration(integration);
		const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
		log.info(
			{
				integrationId: integration.id,
				repo: metadata?.repo,
				installationId: metadata?.installationId,
				status: integration.status,
			},
			"Deleted orphaned integration",
		);
	}

	return orphanedIntegrations.length;
}
