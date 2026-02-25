/**
 * Tool definition and executor for the scan_repo_docs agent hub tool.
 * Scans a connected repository for markdown/documentation files.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { findGitHubIntegration } from "./GitHubToolUtils";
import { z } from "zod";

const log = getLog(import.meta);

const GITHUB_API_BASE = "https://api.github.com";

/** Zod schema for scan_repo_docs arguments. */
export const scanRepoDocsArgsSchema = z.object({
	repository: z.string().min(1),
});

/** Returns the tool definition for scan_repo_docs. */
export function createScanRepoDocsToolDefinition(): ToolDef {
	return {
		name: "scan_repo_docs",
		description: "Scan a connected repository for markdown (.md, .mdx) documentation files.",
		parameters: {
			type: "object",
			properties: {
				repository: {
					type: "string",
					description: "Repository in 'owner/repo' format (e.g., 'acme/docs')",
				},
			},
			required: ["repository"],
		},
	};
}

/**
 * Fetches the repository tree from GitHub API.
 * Returns undefined when the API call fails (e.g. 404 for wrong branch, 403 for no access).
 */
async function fetchRepoTree(
	accessToken: string,
	owner: string,
	repo: string,
	branch: string,
): Promise<Array<{ path: string; type: string; size?: number }> | undefined> {
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
		return;
	}

	const data = await response.json();
	return data.tree || [];
}

/** Executes the scan_repo_docs tool. */
export async function executeScanRepoDocsTool(
	deps: AgentHubToolDeps,
	args: z.infer<typeof scanRepoDocsArgsSchema>,
): Promise<string> {
	const { repository } = args;
	const parts = repository.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return JSON.stringify({ error: "Invalid repository format. Use 'owner/repo' format." });
	}
	const [owner, repo] = parts;

	// Resolve GitHub integration and access token
	const integrationDao = deps.integrationDaoProvider.getDao(getTenantContext());
	const integration = await findGitHubIntegration(integrationDao, repository);

	if (!integration) {
		return JSON.stringify({
			error: `Cannot access repository ${repository}. Make sure it's accessible through a connected GitHub integration.`,
		});
	}

	const { accessToken, branch } = integration;
	const tree = await fetchRepoTree(accessToken, owner, repo, branch);
	if (!tree) {
		return JSON.stringify({
			error: `Failed to read repository tree for ${repository} on branch '${branch}'. The branch may not exist or the integration may lack access.`,
		});
	}

	const markdownFiles = tree
		.filter(item => item.type === "blob" && (item.path.endsWith(".md") || item.path.endsWith(".mdx")))
		.map(item => ({ path: item.path, size: item.size }));

	return JSON.stringify({
		files: markdownFiles,
		totalCount: markdownFiles.length,
		repository,
		branch,
	});
}
