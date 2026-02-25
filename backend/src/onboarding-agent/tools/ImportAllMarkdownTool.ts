/**
 * ImportAllMarkdown Tool - Bulk imports markdown files with deduplication.
 */

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { OnboardingTool, OnboardingToolContext, OnboardingToolExecutionResult } from "../types";
import {
	extractTitleFromContent,
	fetchFileContent,
	getAccessTokenForIntegration,
	getActiveGithubIntegration,
	getOrCreateRepoSpace,
} from "./ToolUtils";
import { injectGitPushTriggerFrontmatter } from "jolli-common";

const log = getLog(import.meta);

/**
 * Result for a single file import attempt.
 */
interface ImportResult {
	filePath: string;
	status: "imported" | "skipped_same" | "skipped_exists" | "failed";
	title?: string;
	docJrn?: string;
	error?: string;
}

/**
 * Repository information needed for imports.
 */
interface RepoInfo {
	accessToken: string;
	owner: string;
	repo: string;
	branch: string;
	integrationId?: number;
}

/**
 * Existing doc info for deduplication.
 */
interface ExistingDocInfo {
	content: string;
	jrn: string;
	id: number;
	spaceId: number;
}

/**
 * Compares content to determine if they're the same (after normalizing whitespace).
 */
function contentMatches(content1: string, content2: string): boolean {
	const normalize = (s: string) => s.trim().replace(/\r\n/g, "\n").replace(/\s+$/gm, "");
	return normalize(content1) === normalize(content2);
}

/**
 * Get repository info from integration or connected repo.
 */
async function getRepoInfo(context: OnboardingToolContext): Promise<RepoInfo | { error: string }> {
	const githubIntegration = await getActiveGithubIntegration(context);
	const connectedRepo = context.stepData.connectedRepo;

	if (githubIntegration) {
		const metadata = githubIntegration.metadata;
		const [owner, repo] = metadata.repo.split("/");
		const branch = metadata.branch || "main";
		const accessToken = await getAccessTokenForIntegration(metadata);
		if (!accessToken) {
			return { error: "Could not get access to the repository. Please reconnect GitHub." };
		}
		return { accessToken, owner, repo, branch, integrationId: githubIntegration.id };
	}

	if (connectedRepo) {
		const [owner, repo] = connectedRepo.split("/");
		const installations = await context.githubInstallationDao.listInstallations();
		const matchingInstallation = installations.find(
			inst => inst.name.toLowerCase() === owner.toLowerCase() && inst.installationId,
		);

		if (matchingInstallation?.installationId) {
			const app = getCoreJolliGithubApp();
			if (app && app.appId > 0) {
				const accessToken = await getAccessTokenForGitHubAppInstallation(
					app,
					matchingInstallation.installationId,
				);
				if (accessToken) {
					return { accessToken, owner, repo, branch: "main" };
				}
			}
		}
		return { error: "Could not get access to the repository. Please reconnect GitHub." };
	}

	return { error: "No repository connected. Run scan_repository first." };
}

/**
 * Process a single file import.
 */
async function processFile(
	filePath: string,
	repoInfo: RepoInfo,
	spaceId: number,
	existing: ExistingDocInfo | undefined,
	context: OnboardingToolContext,
): Promise<ImportResult> {
	const { accessToken, owner, repo, branch, integrationId } = repoInfo;

	const fileData = await fetchFileContent(accessToken, owner, repo, filePath, branch);
	if (!fileData) {
		return { filePath, status: "failed", error: "Could not fetch file" };
	}

	// Check for existing doc with same source path
	if (existing) {
		if (contentMatches(existing.content, fileData.content)) {
			return { filePath, status: "skipped_same", docJrn: existing.jrn };
		}
		return { filePath, status: "skipped_exists", docJrn: existing.jrn };
	}

	// Inject GIT_PUSH trigger for markdown files so push webhooks auto-trigger workflows
	const isMarkdown = /\.mdx?$/i.test(filePath);
	const contentToStore = isMarkdown
		? injectGitPushTriggerFrontmatter(fileData.content, owner, repo, branch)
		: fileData.content;

	// Create new article
	const title = extractTitleFromContent(contentToStore);
	// Normalize the file path before storing (remove leading "./" and trim)
	const normalizedPath = filePath.replace(/^\.\//, "").trim();
	const sourceInfo = integrationId
		? {
				source: { integrationId, type: "github" as const },
				sourceMetadata: {
					filename: normalizedPath.split("/").pop() || normalizedPath,
					path: normalizedPath,
					branch,
					sha: fileData.sha,
					importedAt: new Date().toISOString(),
				},
			}
		: { source: undefined, sourceMetadata: undefined };

	const doc = await context.docDao.createDoc({
		updatedBy: "onboarding",
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
		createdBy: "onboarding",
		source: sourceInfo.source,
		sourceMetadata: sourceInfo.sourceMetadata,
	});

	return { filePath, status: "imported", title, docJrn: doc.jrn };
}

/**
 * Build import summary from results.
 */
function buildSummary(results: Array<ImportResult>): string {
	const imported = results.filter(r => r.status === "imported");
	const skippedSame = results.filter(r => r.status === "skipped_same");
	const skippedExists = results.filter(r => r.status === "skipped_exists");
	const failed = results.filter(r => r.status === "failed");

	let summary = `Import complete:\n`;
	summary += `- Imported: ${imported.length} files\n`;
	if (skippedSame.length > 0) {
		summary += `- Skipped (identical content): ${skippedSame.length} files\n`;
	}
	if (skippedExists.length > 0) {
		summary += `- Skipped (content changed - review needed): ${skippedExists.length} files\n`;
		summary += `  Files needing review: ${skippedExists.map(r => r.filePath).join(", ")}\n`;
	}
	if (failed.length > 0) {
		summary += `- Failed: ${failed.length} files\n`;
		summary += `  Failures: ${failed.map(r => `${r.filePath}: ${r.error}`).join(", ")}\n`;
	}
	if (imported.length > 0) {
		summary += `\nImported articles:\n${imported.map(r => `- "${r.title}" from ${r.filePath}`).join("\n")}`;
	}
	return summary;
}

export const importAllMarkdownTool: OnboardingTool = {
	definition: {
		name: "import_all_markdown",
		description:
			"Import all discovered markdown files from the repository. " +
			"Applies deduplication: skips files with identical content, " +
			"and reports files that need attention if content has changed. " +
			"Run scan_repository first to discover files.",
		parameters: {
			type: "object",
			properties: {
				file_paths: {
					type: "string",
					description:
						"Optional comma-separated list of file paths to import. " +
						"If not provided, imports all files from discoveredFiles in step data.",
				},
				space_id: {
					type: "string",
					description: "Optional space ID to import into. Uses stepData.spaceId if not provided.",
				},
			},
			required: [],
		},
	},
	handler: async (args, context): Promise<OnboardingToolExecutionResult> => {
		try {
			// Get files to import
			const filePaths =
				args.file_paths && typeof args.file_paths === "string"
					? args.file_paths.split(",").map(p => p.trim())
					: context.stepData.discoveredFiles || [];

			if (filePaths.length === 0) {
				return {
					success: false,
					content: "No files to import. Run scan_repository first to discover markdown files.",
				};
			}

			// Get space ID — prefer repo-named space over default
			let spaceId = args.space_id ? Number(args.space_id) : context.stepData.spaceId;
			if (!spaceId) {
				spaceId = await getOrCreateRepoSpace(context);
			}

			// Get repository info
			const repoInfoResult = await getRepoInfo(context);
			if ("error" in repoInfoResult) {
				return { success: false, content: repoInfoResult.error };
			}
			const repoInfo = repoInfoResult;

			// Process each file - look up existing docs across ALL spaces
			const results: Array<ImportResult> = [];
			const importedJrns: Array<string> = [];

			for (const filePath of filePaths) {
				try {
					// Look for existing doc with same source path across ALL spaces
					const hasRealDao = typeof context.docDao?.findDocBySourcePathAnySpace === "function";
					log.info("ImportAllMarkdownTool: Checking path='%s', hasRealDao=%s", filePath, hasRealDao);
					const existingDoc = await context.docDao.findDocBySourcePathAnySpace(
						filePath,
						repoInfo.integrationId,
					);
					log.info(
						"ImportAllMarkdownTool: Lookup result for path='%s': %s",
						filePath,
						existingDoc ? `found doc id=${existingDoc.id} spaceId=${existingDoc.spaceId}` : "not found",
					);
					let existing: ExistingDocInfo | undefined;
					if (existingDoc?.spaceId) {
						existing = {
							content: existingDoc.content,
							jrn: existingDoc.jrn,
							id: existingDoc.id,
							spaceId: existingDoc.spaceId,
						};
					}

					// Use existing doc's space if found, otherwise use default space
					const targetSpaceId = existing?.spaceId ?? spaceId;

					const result = await processFile(filePath, repoInfo, targetSpaceId, existing, context);
					results.push(result);
					if (result.status === "imported" && result.docJrn) {
						importedJrns.push(result.docJrn);
					}
				} catch (error) {
					log.warn(error, "Failed to import file: %s", filePath);
					results.push({
						filePath,
						status: "failed",
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			// Update step data
			const existingImported = context.stepData.importedArticles || [];
			await context.updateStepData({ importedArticles: [...existingImported, ...importedJrns], spaceId });

			// Build summary
			const summary = buildSummary(results);
			const imported = results.filter(r => r.status === "imported");

			return {
				success: imported.length > 0 || results.some(r => r.status === "skipped_same"),
				content: summary,
				uiAction:
					imported.length > 0
						? {
								type: "import_completed",
								jobId: `bulk-import-${Date.now()}`,
								message: `Imported ${imported.length} articles`,
							}
						: undefined,
			};
		} catch (error) {
			log.error(error, "Error in import_all_markdown tool");
			return {
				success: false,
				content: `Failed to import files: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
