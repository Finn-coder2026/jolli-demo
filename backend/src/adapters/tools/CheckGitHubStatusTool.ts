/**
 * Tool definition and executor for the check_github_status agent hub tool.
 * Checks if GitHub is connected and lists active integrations.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import type { GithubRepoIntegration } from "../../model/Integration";
import { getTenantContext } from "../../tenant/TenantContext";
import type { AgentHubToolDeps } from "./AgentHubTools";

/** Returns the tool definition for check_github_status. */
export function createCheckGitHubStatusToolDefinition(): ToolDef {
	return {
		name: "check_github_status",
		description: "Check if GitHub is connected and list active GitHub integrations.",
		parameters: { type: "object", properties: {}, required: [] },
	};
}

/** Executes the check_github_status tool. */
export async function executeCheckGitHubStatusTool(deps: AgentHubToolDeps): Promise<string> {
	const integrationDao = deps.integrationDaoProvider.getDao(getTenantContext());
	const integrations = await integrationDao.listIntegrations();

	const githubIntegrations = integrations.filter(
		(i): i is GithubRepoIntegration => i.type === "github" && i.status === "active",
	);

	if (githubIntegrations.length === 0) {
		return JSON.stringify({
			connected: false,
			integrations: [],
			message: "GitHub is not connected. The user should visit the Integrations page to connect GitHub.",
		});
	}

	const items = githubIntegrations.map(i => ({
		id: i.id,
		name: i.name,
		repo: i.metadata.repo,
		branch: i.metadata.branch ?? "main",
	}));

	return JSON.stringify({ connected: true, integrations: items });
}
