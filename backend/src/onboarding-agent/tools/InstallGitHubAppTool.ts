/**
 * InstallGitHubApp Tool - Opens the GitHub App installation page.
 *
 * Always opens the install page, allowing users to add more GitHub App
 * installations even if some already exist.
 */

import type { OnboardingTool } from "../types";

export const installGitHubAppTool: OnboardingTool = {
	definition: {
		name: "install_github_app",
		description:
			"Open the GitHub App installation page. Only call this after the user confirms they want to install the app. This will open a dialog that redirects the user to GitHub.",
		parameters: {
			type: "object",
			properties: {},
		},
	},
	handler: (_args, _context) => {
		return {
			success: true,
			content: "Opening GitHub App installation page...",
			uiAction: {
				type: "open_github_install",
				message: "Install Jolli GitHub App",
			},
		};
	},
};
