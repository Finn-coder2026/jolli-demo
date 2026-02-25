/**
 * Shared utilities for GitHub-related agent hub tools.
 * Extracts common logic used by both ScanRepoDocsTool and ImportRepoDocsTool.
 */

import type { IntegrationDao } from "../../dao/IntegrationDao";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import type { GithubRepoIntegration } from "../../model/Integration";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import type { GithubRepoIntegrationMetadata } from "jolli-common";
import { isGithubRepoMetadata } from "jolli-common";

/** Result of resolving a GitHub integration for a given repository. */
export interface GitHubIntegrationResult {
	/** OAuth/app access token for the GitHub API */
	readonly accessToken: string;
	/** Branch to use (from the matching integration, or "main" as fallback) */
	readonly branch: string;
	/** Integration ID of the resolved integration */
	readonly integrationId: number;
}

/**
 * Gets an access token for a GitHub App installation.
 * Returns undefined if the installation ID is missing or the app is not configured.
 */
export async function getAccessTokenForIntegration(
	metadata: GithubRepoIntegrationMetadata,
): Promise<string | undefined> {
	const { installationId } = metadata;
	if (!installationId) {
		return;
	}
	const app = getCoreJolliGithubApp();
	if (!app || app.appId < 0) {
		return;
	}
	return await getAccessTokenForGitHubAppInstallation(app, installationId);
}

/**
 * Finds a GitHub integration for the given repository, resolves an access token,
 * and returns the branch and integration ID. Falls back to any active GitHub integration
 * if no exact repo match is found.
 *
 * Returns undefined if no usable integration is found.
 */
export async function findGitHubIntegration(
	integrationDao: IntegrationDao,
	repository: string,
): Promise<GitHubIntegrationResult | undefined> {
	const integrations = await integrationDao.listIntegrations();

	// Try exact repo match first
	const matching = integrations.find(
		(i): i is GithubRepoIntegration =>
			i.type === "github" &&
			i.status === "active" &&
			isGithubRepoMetadata(i.metadata) &&
			i.metadata.repo === repository,
	);

	if (matching) {
		const accessToken = await getAccessTokenForIntegration(matching.metadata);
		if (accessToken) {
			return {
				accessToken,
				branch: matching.metadata.branch ?? "main",
				integrationId: matching.id,
			};
		}
		return;
	}

	// Fallback: try any active GitHub integration's installation
	const anyGithub = integrations.find(
		(i): i is GithubRepoIntegration =>
			i.type === "github" &&
			i.status === "active" &&
			isGithubRepoMetadata(i.metadata) &&
			!!i.metadata.installationId,
	);

	if (anyGithub) {
		const accessToken = await getAccessTokenForIntegration(anyGithub.metadata);
		if (accessToken) {
			return {
				accessToken,
				branch: "main",
				integrationId: anyGithub.id,
			};
		}
	}

	return;
}

/**
 * Validates a file path to prevent path traversal attacks.
 * Returns true if the path is safe, false otherwise.
 */
export function isValidFilePath(filePath: string): boolean {
	return !filePath.includes("..") && !filePath.startsWith("/");
}
