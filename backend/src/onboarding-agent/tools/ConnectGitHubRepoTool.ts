/**
 * ConnectGitHubRepo Tool - Opens repository selection UI.
 *
 * Requires GitHub App to be installed first. Requires user confirmation before calling.
 */

import { getLog } from "../../util/Logger";
import type { OnboardingTool } from "../types";
import { getActiveGithubIntegration } from "./ToolUtils";

const log = getLog(import.meta);

export const connectGitHubRepoTool: OnboardingTool = {
	definition: {
		name: "connect_github_repo",
		description:
			"Open repository selection to connect a GitHub repository. Requires the GitHub App to be installed first. Only call this after the user confirms they want to connect a repository.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	handler: async (_args, context) => {
		try {
			// Check if already connected
			const githubIntegration = await getActiveGithubIntegration(context);
			if (githubIntegration) {
				const metadata = githubIntegration.metadata;
				return {
					success: true,
					content: `A repository is already connected: ${metadata.repo} (branch: ${metadata.branch}). You can proceed to scan for documentation files.`,
				};
			}

			// Log local installation count for debugging
			const installations = await context.githubInstallationDao.listInstallations();
			log.info(
				{ userId: context.userId, localInstallationCount: installations.length },
				"Opening GitHub repo selection (frontend will check GitHub API directly)",
			);

			// Open modal in "auto" mode - frontend will query GitHub API directly
			// and handle both cases: showing repo selection if app is installed,
			// or redirecting to GitHub App installation if not.
			// This is more reliable than checking local DB which may be out of sync.
			return {
				success: true,
				content: "Opening GitHub connection...",
				uiAction: {
					type: "open_github_connect",
					message: "Connect your GitHub repository",
				},
			};
		} catch (error) {
			log.error(error, "Error in connect_github_repo tool");
			return {
				success: false,
				content: `Failed to open repository selection: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
