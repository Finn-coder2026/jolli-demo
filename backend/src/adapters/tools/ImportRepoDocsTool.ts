/**
 * Tool definition and executor for the import_repo_docs agent hub tool.
 * Imports markdown files from a connected GitHub repository as Articles.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getTenantContext } from "../../tenant/TenantContext";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { findGitHubIntegration, isValidFilePath } from "./GitHubToolUtils";
import { injectGitPushTriggerFrontmatter } from "jolli-common";
import { z } from "zod";

const log = getLog(import.meta);

const GITHUB_API_BASE = "https://api.github.com";

/** Zod schema for import_repo_docs arguments. */
export const importRepoDocsArgsSchema = z.object({
	repository: z.string().min(1),
	filePaths: z.array(z.string().min(1)).min(1).max(50),
	spaceId: z.number(),
});

/** Returns the tool definition for import_repo_docs. */
export function createImportRepoDocsToolDefinition(): ToolDef {
	return {
		name: "import_repo_docs",
		description: "Import markdown files from a connected GitHub repository as Articles.",
		parameters: {
			type: "object",
			properties: {
				repository: {
					type: "string",
					description: "Repository in 'owner/repo' format (e.g., 'acme/docs')",
				},
				filePaths: {
					type: "array",
					items: { type: "string" },
					description: "Array of file paths to import from the repository",
				},
				spaceId: {
					type: "number",
					description: "Space ID to import articles into",
				},
			},
			required: ["repository", "filePaths", "spaceId"],
		},
	};
}

/**
 * Fetches file content from GitHub API.
 */
async function fetchFileContent(
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
		log.warn("Failed to fetch file content for %s: %d %s", path, response.status, response.statusText);
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
 * Extracts a title from markdown content.
 * Checks YAML frontmatter title first, then first H1 heading.
 */
export function extractTitleFromContent(content: string): string {
	// Check YAML frontmatter
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (frontmatterMatch) {
		const titleMatch = frontmatterMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
		if (titleMatch) {
			return titleMatch[1].trim();
		}
	}

	// Check first H1 heading
	const headingMatch = content.match(/^#\s+(.+)$/m);
	if (headingMatch) {
		return headingMatch[1].trim();
	}

	return "Untitled";
}

/** Executes the import_repo_docs tool. */
export async function executeImportRepoDocsTool(
	deps: AgentHubToolDeps,
	userId: number,
	args: z.infer<typeof importRepoDocsArgsSchema>,
): Promise<string> {
	const { repository, filePaths, spaceId } = args;
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

	const { accessToken, branch, integrationId } = integration;

	const docDao = deps.docDaoProvider.getDao(getTenantContext());
	const userIdStr = userId.toString();
	const imported: Array<{ id: number; title: string; path: string }> = [];
	const failed: Array<{ path: string; error: string }> = [];

	for (const filePath of filePaths) {
		if (!isValidFilePath(filePath)) {
			failed.push({ path: filePath, error: "Invalid file path" });
			continue;
		}
		try {
			const fileData = await fetchFileContent(accessToken, owner, repo, filePath, branch);
			if (!fileData) {
				failed.push({ path: filePath, error: "Could not fetch file" });
				continue;
			}

			// Inject GIT_PUSH trigger frontmatter for auto-sync
			const contentToStore = injectGitPushTriggerFrontmatter(fileData.content, owner, repo, branch);
			const title = extractTitleFromContent(contentToStore);
			const normalizedPath = filePath.replace(/^\.\//, "").trim();

			const sourceInfo = {
				source: { integrationId, type: "github" as const },
				sourceMetadata: {
					filename: normalizedPath.split("/").pop() || normalizedPath,
					path: normalizedPath,
					branch,
					sha: fileData.sha,
					importedAt: new Date().toISOString(),
				},
			};

			const doc = await docDao.createDoc({
				updatedBy: userIdStr,
				content: contentToStore,
				contentType: "text/markdown",
				contentMetadata: {
					title,
					sourceName: `${owner}/${repo}`,
					sourceUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${normalizedPath}`,
					isSourceDoc: true,
				},
				docType: "document",
				spaceId,
				parentId: undefined,
				createdBy: userIdStr,
				source: sourceInfo.source,
				sourceMetadata: sourceInfo.sourceMetadata,
			});

			imported.push({ id: doc.id, title, path: filePath });
			log.info("Imported article '%s' from %s/%s:%s", title, owner, repo, filePath);
		} catch (error) {
			log.warn(error, "Failed to import file: %s", filePath);
			failed.push({ path: filePath, error: error instanceof Error ? error.message : "Unknown error" });
		}
	}

	return JSON.stringify({ imported: imported.length, articles: imported, failed });
}
