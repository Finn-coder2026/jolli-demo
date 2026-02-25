/**
 * ListRepos Tool - Lists repositories from connected GitHub installations.
 */

import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import { fetchInstallationRepositories } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { OnboardingTool } from "../types";

const log = getLog(import.meta);

export const listReposTool: OnboardingTool = {
	definition: {
		name: "list_repos",
		description:
			"List all GitHub repositories accessible through the connected installations. Use this to see which repositories can be scanned for documentation.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	handler: async (_args, context) => {
		try {
			// Get GitHub installations
			const installations = await context.githubInstallationDao.listInstallations();

			if (installations.length === 0) {
				return {
					success: false,
					content: "No GitHub installations found. Please connect GitHub first using connect_github.",
				};
			}

			// Collect all repos from installations
			const allRepos: Array<string> = [];
			const app = getCoreJolliGithubApp();

			if (!app || app.appId < 0) {
				return {
					success: false,
					content: "GitHub App is not configured. Please contact support.",
				};
			}

			for (const installation of installations) {
				if (installation.installationId) {
					const reposResult = await fetchInstallationRepositories(app, installation.installationId);
					if (Array.isArray(reposResult)) {
						allRepos.push(...reposResult);
					}
				}
			}

			if (allRepos.length === 0) {
				return {
					success: true,
					content:
						"No repositories found in your GitHub installations. Make sure the Jolli GitHub App has access to your repositories.",
				};
			}

			return {
				success: true,
				content: `Found ${allRepos.length} accessible repositories:\n${allRepos.map(r => `- ${r}`).join("\n")}\n\nYou can use scan_repository to find markdown files in any of these.`,
			};
		} catch (error) {
			log.error(error, "Error in list_repos tool");
			return {
				success: false,
				content: `Failed to list repositories: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
