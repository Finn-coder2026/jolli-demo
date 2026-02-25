/**
 * Shared utilities for onboarding tools.
 *
 * Contains common helper functions used across multiple tools.
 */

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import type { GithubRepoIntegration } from "../../model/Integration";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { OnboardingToolContext } from "../types";
import { DEFAULT_SPACE_FILTERS, type GithubRepoIntegrationMetadata } from "jolli-common";
import { generateSlug } from "jolli-common/server";

const log = getLog(import.meta);

export const GITHUB_API_BASE = "https://api.github.com";

/**
 * Get an active GitHub integration from the context.
 */
export async function getActiveGithubIntegration(
	context: OnboardingToolContext,
): Promise<GithubRepoIntegration | undefined> {
	const integrations = await context.integrationDao.listIntegrations();
	return integrations.find((i): i is GithubRepoIntegration => i.type === "github" && i.status === "active");
}

/**
 * Get access token for a GitHub integration's installation.
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
 * Fetch repository tree from GitHub API.
 */
export async function fetchRepoTree(
	accessToken: string,
	owner: string,
	repo: string,
	branch: string,
): Promise<Array<{ path: string; type: string; sha: string }>> {
	const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!response.ok) {
		log.warn("Failed to fetch repo tree: %d %s", response.status, response.statusText);
		return [];
	}

	const data = await response.json();
	return data.tree || [];
}

/**
 * Fetch file content from GitHub API.
 */
export async function fetchFileContent(
	accessToken: string,
	owner: string,
	repo: string,
	path: string,
	branch: string,
): Promise<{ content: string; sha: string } | undefined> {
	const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!response.ok) {
		log.warn("Failed to fetch file content: %d %s", response.status, response.statusText);
		return;
	}

	const data = await response.json();
	if (data.encoding === "base64" && data.content) {
		const content = Buffer.from(data.content, "base64").toString("utf-8");
		return { content, sha: data.sha };
	}
	return;
}

/**
 * Extract title from markdown content.
 * Looks for YAML frontmatter title or first heading.
 */
export function extractTitleFromContent(content: string): string {
	// Check for YAML frontmatter title
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (frontmatterMatch) {
		const titleMatch = frontmatterMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
		if (titleMatch) {
			return titleMatch[1].trim();
		}
	}

	// Check for first H1 heading
	const headingMatch = content.match(/^#\s+(.+)$/m);
	if (headingMatch) {
		return headingMatch[1].trim();
	}

	return "Untitled";
}

/**
 * Match user input against a list of available repository names.
 *
 * Matching rules (in order of priority):
 * 1. Exact match (case-insensitive): "acme/docs" matches "acme/docs"
 * 2. Repo-name-only match: "docs" matches "acme/docs" (only if unambiguous)
 * 3. Prefix/substring match: "doc" matches "acme/docs" (only if unambiguous)
 *
 * Returns the matched full repo name, or undefined if no unambiguous match.
 */
export function matchRepoName(userInput: string, availableRepos: Array<string>): string | undefined {
	// Strip markdown formatting (e.g., **bold**) and trim whitespace
	const input = userInput
		.replace(/\*{1,2}/g, "")
		.trim()
		.toLowerCase();
	if (!input) {
		return;
	}

	// 1. Exact match (case-insensitive)
	const exact = availableRepos.find(r => r.toLowerCase() === input);
	if (exact) {
		return exact;
	}

	// 2. Repo-name-only match (e.g., "docs" matches "acme/docs")
	const repoNameMatches = availableRepos.filter(r => {
		const parts = r.split("/");
		return parts.length === 2 && parts[1].toLowerCase() === input;
	});
	if (repoNameMatches.length === 1) {
		return repoNameMatches[0];
	}

	// 3. Substring match in repo name portion (e.g., "doc" matches "acme/docs")
	const substringMatches = availableRepos.filter(r => {
		const repoName = r.split("/").pop() ?? r;
		return repoName.toLowerCase().includes(input);
	});
	if (substringMatches.length === 1) {
		return substringMatches[0];
	}

	return;
}

/**
 * Create an integration record directly for a given repo, without opening a modal dialog.
 *
 * Finds the GitHub installation that has the repo, then creates an integration record.
 * Returns the integration ID and installation ID, or undefined if the repo was not found.
 */
export async function connectRepoDirectly(
	repoFullName: string,
	context: OnboardingToolContext,
): Promise<{ integrationId: number; installationId: number } | undefined> {
	// Find the installation that has this repo
	const installations = await context.githubInstallationDao.listInstallations();
	const installation = installations.find(inst =>
		inst.repos.some(r => r.toLowerCase() === repoFullName.toLowerCase()),
	);

	if (!installation) {
		log.warn("No installation found for repo '%s'", repoFullName);
		return;
	}

	const app = getCoreJolliGithubApp();
	const appId = app.appId > 0 ? app.appId : undefined;

	const integration = await context.integrationDao.createIntegration({
		type: "github",
		name: repoFullName,
		status: "active",
		metadata: {
			repo: repoFullName,
			branch: "main",
			features: ["auto_sync"],
			...(appId && { githubAppId: appId }),
			installationId: installation.installationId,
		},
	});

	log.info("Created integration id=%d for repo '%s' via chat-based selection", integration.id, repoFullName);
	return { integrationId: integration.id, installationId: installation.installationId };
}

/**
 * Fetch the latest commit SHA for a given branch from the GitHub API.
 *
 * Used by sync detection to compare current HEAD with the state at import time.
 * Returns the SHA string, or undefined on failure.
 */
export async function fetchLatestCommitSha(
	accessToken: string,
	owner: string,
	repo: string,
	branch: string,
): Promise<string | undefined> {
	const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1&sha=${encodeURIComponent(branch)}`;
	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${accessToken}`,
				"X-GitHub-Api-Version": "2022-11-28",
			},
		});

		if (!response.ok) {
			log.warn("Failed to fetch latest commit: %d %s", response.status, response.statusText);
			return;
		}

		const data = await response.json();
		if (Array.isArray(data) && data.length > 0 && data[0].sha) {
			return data[0].sha as string;
		}
		return;
	} catch (error) {
		log.warn(error, "Error fetching latest commit SHA");
		return;
	}
}

/**
 * Extracts the repository name from a full repo identifier (e.g., "owner/repo" → "repo").
 */
function extractRepoName(repoFullName: string): string {
	const parts = repoFullName.split("/");
	return parts.length === 2 ? parts[1] : repoFullName;
}

/**
 * Get or create a space named after the connected repository.
 *
 * Looks up an existing space by slug derived from the repo name.
 * If not found, creates a new space. Falls back to the default space
 * if no connected repo exists.
 */
export async function getOrCreateRepoSpace(context: OnboardingToolContext): Promise<number> {
	const connectedRepo = context.stepData.connectedRepo;

	if (connectedRepo) {
		const repoName = extractRepoName(connectedRepo);
		const spaceSlug = generateSlug(repoName);

		// Try to find existing space with this slug
		const existingSpace = await context.spaceDao.getSpaceBySlug(spaceSlug);
		if (existingSpace) {
			log.info("Resolved repo space: existing slug='%s' id=%d", spaceSlug, existingSpace.id);
			await context.updateStepData({ spaceId: existingSpace.id, spaceName: existingSpace.name });
			return existingSpace.id;
		}

		// Create a new space named after the repo
		const newSpace = await context.spaceDao.createSpace({
			name: repoName,
			slug: spaceSlug,
			description: `Documentation space for ${connectedRepo}`,
			ownerId: context.userId,
			isPersonal: false,
			defaultSort: "default",
			defaultFilters: { ...DEFAULT_SPACE_FILTERS },
		});
		log.info("Created repo space: slug='%s' id=%d for repo '%s'", spaceSlug, newSpace.id, connectedRepo);
		await context.updateStepData({ spaceId: newSpace.id, spaceName: newSpace.name });
		return newSpace.id;
	}

	// Fallback to default space
	let space = await context.spaceDao.getDefaultSpace();
	if (!space) {
		space = await context.spaceDao.createDefaultSpaceIfNeeded(context.userId);
	}
	await context.updateStepData({ spaceId: space.id });
	return space.id;
}
