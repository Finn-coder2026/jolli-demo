/**
 * CheckGitHubStatus Tool - Pure read-only query of GitHub status.
 *
 * Returns one of three statuses:
 * - "connected": An active GitHub integration exists (repo already linked)
 * - "installed": GitHub App is installed but no repo is connected yet
 * - "not_installed": No GitHub App installation found in local DB
 *
 * This tool has NO side effects — all state persistence and step advancement
 * is handled by the FSM in handleGitHubCheck.
 */

import { getLog } from "../../util/Logger";
import type { OnboardingTool } from "../types";
import { getActiveGithubIntegration } from "./ToolUtils";

const log = getLog(import.meta);

export const checkGitHubStatusTool: OnboardingTool = {
	definition: {
		name: "check_github_status",
		description:
			"Pure read-only check of GitHub status. Returns 'connected' (active integration with repo/branch info), " +
			"'installed' (app installed with available repos list), or 'not_installed'. " +
			"Checks the local database which may be out of sync with GitHub.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	handler: async (_args, context) => {
		try {
			log.info({ userId: context.userId }, "Checking GitHub status for onboarding");

			// Check for existing active GitHub integration
			const githubIntegration = await getActiveGithubIntegration(context);

			if (githubIntegration) {
				const metadata = githubIntegration.metadata;
				return {
					success: true,
					content: JSON.stringify({
						status: "connected",
						repo: metadata.repo,
						branch: metadata.branch,
						integrationId: githubIntegration.id,
						installationId: metadata.installationId,
					}),
				};
			}

			// Check for GitHub installations that might be available
			const installations = await context.githubInstallationDao.listInstallations();
			log.info(
				{ userId: context.userId, installationCount: installations.length },
				"Checked for GitHub installations",
			);

			if (installations.length > 0) {
				return {
					success: true,
					content: JSON.stringify({
						status: "installed",
						installations: installations.map(inst => ({
							name: inst.name,
							installationId: inst.installationId,
							repos: inst.repos ?? [],
						})),
					}),
				};
			}

			// No installations found in local DB
			log.info({ userId: context.userId }, "No installations found in local DB");
			return {
				success: true,
				content: JSON.stringify({ status: "not_installed" }),
			};
		} catch (error) {
			log.error(error, "Error in check_github_status tool");
			return {
				success: false,
				content: `Failed to check GitHub status: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
};
