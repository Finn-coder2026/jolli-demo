/**
 * Tool definition and executor for the list_github_repos agent hub tool.
 * Lists available GitHub repositories from connected installations.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import type { GithubRepoIntegration } from "../../model/Integration";
import { getTenantContext } from "../../tenant/TenantContext";
import { fetchInstallationRepositories } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";

const log = getLog(import.meta);

/** Returns the tool definition for list_github_repos. */
export function createListGitHubReposToolDefinition(): ToolDef {
	return {
		name: "list_github_repos",
		description: "List available GitHub repositories from connected installations.",
		parameters: { type: "object", properties: {}, required: [] },
	};
}

/** Executes the list_github_repos tool. */
export async function executeListGitHubReposTool(deps: AgentHubToolDeps): Promise<string> {
	const app = getCoreJolliGithubApp();
	if (!app || app.appId < 0) {
		return JSON.stringify({ repos: [], message: "GitHub App is not configured." });
	}

	const integrationDao = deps.integrationDaoProvider.getDao(getTenantContext());
	const integrations = await integrationDao.listIntegrations();
	const githubIntegrations = integrations.filter(
		(i): i is GithubRepoIntegration => i.type === "github" && i.status === "active",
	);

	if (githubIntegrations.length === 0) {
		return JSON.stringify({
			repos: [],
			message: "No active GitHub integrations found. Connect GitHub from the Integrations page first.",
		});
	}

	// Collect installation IDs from active integrations (deduplicate)
	const seenInstallationIds = new Set<number>();
	const allRepos: Array<string> = [];

	for (const integration of githubIntegrations) {
		const installationId = integration.metadata.installationId;
		if (!installationId || seenInstallationIds.has(installationId)) {
			continue;
		}
		seenInstallationIds.add(installationId);

		const result = await fetchInstallationRepositories(app, installationId);
		if (Array.isArray(result)) {
			allRepos.push(...result);
		} else {
			log.warn("Failed to fetch repos for installation %d: %s", installationId, result.error);
		}
	}

	if (allRepos.length === 0) {
		return JSON.stringify({
			repos: [],
			message: "No repositories found. Make sure the Jolli GitHub App has access to your repositories.",
		});
	}

	return JSON.stringify({ repos: allRepos });
}
