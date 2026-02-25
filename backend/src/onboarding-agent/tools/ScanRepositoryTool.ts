/**
 * ScanRepository Tool - Scans a repository for markdown files using GitHub API.
 */

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { getAccessTokenForGitHubAppInstallation } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { OnboardingTool } from "../types";
import { fetchRepoTree, getAccessTokenForIntegration, getActiveGithubIntegration } from "./ToolUtils";

const log = getLog(import.meta);

export const scanRepositoryTool: OnboardingTool = {
	definition: {
		name: "scan_repository",
		description:
			"Scan a GitHub repository for markdown (.md, .mdx) files that could be imported as documentation articles. Requires a connected GitHub integration.",
		parameters: {
			type: "object",
			properties: {
				repository: {
					type: "string",
					description: "The repository to scan in format 'owner/repo' (e.g., 'acme/docs')",
				},
			},
			required: ["repository"],
		},
	},
	handler: async (args, context) => {
		const repository = args.repository as string;

		try {
			// Validate repository format
			const [owner, repo] = repository.split("/");
			if (!owner || !repo) {
				return {
					success: false,
					content: "Invalid repository format. Please use 'owner/repo' format (e.g., 'acme/docs').",
				};
			}

			// Check for active integration or use installation directly
			let accessToken: string | undefined;
			let branch = "main";

			const githubIntegration = await getActiveGithubIntegration(context);
			if (githubIntegration && githubIntegration.metadata.repo === repository) {
				accessToken = await getAccessTokenForIntegration(githubIntegration.metadata);
				branch = githubIntegration.metadata.branch || "main";
			} else {
				// Try to find installation for this repo's owner
				const installations = await context.githubInstallationDao.listInstallations();
				const matchingInstallation = installations.find(
					inst => inst.name.toLowerCase() === owner.toLowerCase() && inst.installationId,
				);

				if (matchingInstallation?.installationId) {
					const app = getCoreJolliGithubApp();
					if (app && app.appId > 0) {
						accessToken = await getAccessTokenForGitHubAppInstallation(
							app,
							matchingInstallation.installationId,
						);
					}
				}
			}

			if (!accessToken) {
				return {
					success: false,
					content: `Cannot access repository ${repository}. Make sure it's accessible through your GitHub integration.`,
				};
			}

			// Fetch repository tree
			const tree = await fetchRepoTree(accessToken, owner, repo, branch);
			const markdownFiles = tree
				.filter(item => item.type === "blob" && (item.path.endsWith(".md") || item.path.endsWith(".mdx")))
				.map(item => item.path);

			if (markdownFiles.length === 0) {
				return {
					success: true,
					content: `No markdown files found in ${repository}. You can still generate new documentation.`,
				};
			}

			// Store discovered files
			await context.updateStepData({
				connectedRepo: repository,
				discoveredFiles: markdownFiles,
			});

			// Limit display to first 20 files
			const displayFiles = markdownFiles.slice(0, 20);
			const moreFilesMsg =
				markdownFiles.length > 20 ? `\n\n(... and ${markdownFiles.length - 20} more files)` : "";

			return {
				success: true,
				content: `Found ${markdownFiles.length} markdown files in ${repository}:\n${displayFiles.map(f => `- ${f}`).join("\n")}${moreFilesMsg}\n\nUse import_markdown to import any of these files as articles.`,
			};
		} catch (error) {
			log.error(error, "Error in scan_repository tool");
			return {
				success: false,
				content: `Failed to scan repository: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
