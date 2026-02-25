/**
 * Tool definition and executor for the connect_github_repo agent hub tool.
 * Connects a GitHub repository by creating an integration, or returns an
 * installation URL if the Jolli GitHub App is not yet installed on the owner's org.
 */

import type { ToolDef } from "../../../../tools/jolliagent/src/Types";
import { getCoreJolliGithubApp } from "../../model/GitHubApp";
import type { GithubRepoIntegration } from "../../model/Integration";
import { getTenantContext } from "../../tenant/TenantContext";
import { findExistingInstallation, generateInstallationUrl, parseGitHubRepoUrl } from "../../util/GithubAppUtil";
import { getLog } from "../../util/Logger";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { isGithubRepoMetadata } from "jolli-common";
import { z } from "zod";

const log = getLog(import.meta);

/** Zod schema for connect_github_repo arguments. */
export const connectGitHubRepoArgsSchema = z.object({
	repoUrl: z.string().min(1, "repoUrl is required"),
});

/** Returns the tool definition for connect_github_repo. */
export function createConnectGitHubRepoToolDefinition(): ToolDef {
	return {
		name: "connect_github_repo",
		description:
			"Connect a GitHub repository by URL. Creates an integration automatically if the Jolli GitHub App has access, or returns an installation URL if not.",
		parameters: {
			type: "object",
			properties: {
				repoUrl: {
					type: "string",
					description: "GitHub repository URL (e.g. https://github.com/owner/repo)",
				},
			},
			required: ["repoUrl"],
		},
	};
}

/** Executes the connect_github_repo tool. */
export async function executeConnectGitHubRepoTool(
	deps: AgentHubToolDeps,
	args: z.infer<typeof connectGitHubRepoArgsSchema>,
): Promise<string> {
	const { repoUrl } = args;

	// Validate GitHub App is configured
	const app = getCoreJolliGithubApp();
	if (app.appId < 0) {
		return JSON.stringify({
			error: true,
			message: "GitHub App is not configured. Please contact your administrator.",
		});
	}

	// Parse the repo URL
	let parsed: ReturnType<typeof parseGitHubRepoUrl>;
	try {
		parsed = parseGitHubRepoUrl(repoUrl);
	} catch {
		return JSON.stringify({
			error: true,
			message: `Invalid GitHub repository URL: "${repoUrl}". Expected format: https://github.com/owner/repo`,
		});
	}

	const { owner, repo, repoFullName } = parsed;

	// Check for existing active integration for this repo
	const integrationDao = deps.integrationDaoProvider.getDao(getTenantContext());
	const integrations = await integrationDao.listIntegrations();
	const existingActive = integrations.find(
		(i): i is GithubRepoIntegration =>
			i.type === "github" &&
			i.status === "active" &&
			isGithubRepoMetadata(i.metadata) &&
			i.metadata.repo === repoFullName,
	);

	if (existingActive) {
		return JSON.stringify({
			alreadyConnected: true,
			integration: {
				id: existingActive.id,
				name: existingActive.name,
				repo: existingActive.metadata.repo,
				branch: existingActive.metadata.branch ?? "main",
			},
			message: `Repository ${repoFullName} is already connected.`,
		});
	}

	// Check if the GitHub App has access to this repo
	const installation = await findExistingInstallation(app, repoFullName);

	if (!installation) {
		// App not installed — generate installation URL
		const installUrl = await generateInstallationUrl(app, owner);
		log.info("GitHub App not installed for %s, returning installation URL", repoFullName);
		return JSON.stringify({
			needsInstallation: true,
			installUrl,
			message: `The Jolli GitHub App is not installed on the "${owner}" organization/account. Please install it using the link below, then try again.`,
		});
	}

	// Create integration via IntegrationsManager
	if (!deps.integrationsManager) {
		return JSON.stringify({
			error: true,
			message: "Integration management is not available.",
		});
	}

	const createResult = await deps.integrationsManager.createIntegration({
		type: "github",
		name: repo,
		status: "active",
		metadata: {
			repo: repoFullName,
			branch: installation.defaultBranch,
			features: ["sync"],
			githubAppId: app.appId,
			installationId: installation.installationId,
		},
	});

	if (!createResult.result) {
		const errorMsg = createResult.error?.error ?? "Unknown error creating integration";
		log.error("Failed to create integration for %s: %s", repoFullName, errorMsg);
		return JSON.stringify({
			error: true,
			message: `Failed to connect repository: ${errorMsg}`,
		});
	}

	// Run access check to verify and activate the integration
	const accessCheck = await deps.integrationsManager.handleAccessCheck(createResult.result);
	if (accessCheck.error) {
		log.warn("Access check failed after creating integration for %s: %s", repoFullName, accessCheck.error.reason);
		return JSON.stringify({
			connected: true,
			warning: true,
			integration: {
				id: createResult.result.id,
				name: createResult.result.name,
				repo: repoFullName,
				branch: installation.defaultBranch,
			},
			message: `Repository connected but the access check reported a warning: ${accessCheck.error.reason}. The integration was still created.`,
		});
	}

	log.info("Successfully connected repository %s (integration id=%d)", repoFullName, createResult.result.id);
	return JSON.stringify({
		connected: true,
		integration: {
			id: createResult.result.id,
			name: createResult.result.name,
			repo: repoFullName,
			branch: installation.defaultBranch,
		},
		message: `Successfully connected repository ${repoFullName}.`,
	});
}
