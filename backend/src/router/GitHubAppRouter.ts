import express, { type Router } from "express";
import "../types/SessionTypes";
import { getConfig } from "../config/Config";
import { connectProviderRegistry, isEncryptedState } from "../connect";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import type { IntegrationsManager } from "../integrations/IntegrationsManager";
import { getCoreJolliGithubApp } from "../model/GitHubApp";
import type { GitHubInstallation } from "../model/GitHubInstallation";
import type { Integration } from "../model/Integration";
import { getTenantContext } from "../tenant/TenantContext";
import type { GithubAppRouterOptions } from "../types/GithubTypes";
import {
	createGitHubAppJWT,
	fetchInstallationRepositories,
	findInstallationInGithubApp,
	generateInstallationUrl,
	generateSlug,
	getInstallations,
	getRepositoriesForInstallation,
	syncAllInstallationsForApp,
	upsertInstallationContainer,
} from "../util/GithubAppUtil";
import { cleanupOrphanedGitHubIntegrations } from "../util/IntegrationUtil";
import { getLog } from "../util/Logger";
import type { GithubRepoIntegrationMetadata } from "jolli-common";

const log = getLog(import.meta);

function getAppName() {
	return getCoreJolliGithubApp().name;
}

/**
 * Handle jolli-app setup redirect
 * Returns redirect URL or error
 */
function handleJolliAppRedirect():
	| { success: true; redirectUrl: string }
	| { success: false; error: string; statusCode: number } {
	// Use the centralized Jolli app
	const jolliAppSlug = generateSlug(getAppName());

	// Check if app exists in database
	const existingApp = getCoreJolliGithubApp();

	/* v8 ignore next 7 */
	if (!existingApp) {
		return {
			success: false,
			error: "Jolli GitHub App is not configured. Please contact your administrator.",
			statusCode: 400,
		};
	}

	// Always direct to installation page to allow multiple org/user installations
	// Pass the origin in the state parameter so GitHub redirects back to the correct customer instance
	const origin = getConfig().ORIGIN;
	const state = encodeURIComponent(origin);
	log.info(
		{ jolliAppSlug, origin },
		"Redirecting to Jolli GitHub App installation with state parameter for multi-tenant redirect",
	);

	return {
		success: true,
		redirectUrl: `https://github.com/apps/${jolliAppSlug}/installations/new?state=${state}`,
	};
}

export function createGitHubAppRouter(
	githubInstallationDaoProvider: DaoProvider<GitHubInstallationDao>,
	integrationsManager: IntegrationsManager,
	_options: GithubAppRouterOptions,
): Router {
	const router = express.Router();

	/**
	 * Get the installation URL for an integration that needs access
	 * This allows users to grant access to the repository (for pending installations or to restore access)
	 */
	router.get("/installation-url/:integrationId", async (req, res) => {
		try {
			const integrationId = Number.parseInt(req.params.integrationId, 10);
			if (Number.isNaN(integrationId)) {
				res.status(400).json({ error: "Invalid integration ID" });
				return;
			}

			// Get the integration
			const integrations = await integrationsManager.listIntegrations();
			const integration = integrations.find(i => i.id === integrationId);

			if (!integration) {
				res.status(404).json({ error: "Integration not found" });
				return;
			}

			// Allow getting installation URL for both pending installations and integrations that need repo access
			if (integration.status !== "pending_installation" && integration.status !== "needs_repo_access") {
				res.status(400).json({ error: "Integration does not need installation or repo access" });
				return;
			}

			const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			const repoFullName = metadata?.repo;
			const githubAppId = metadata?.githubAppId;

			if (!repoFullName || !githubAppId) {
				res.status(400).json({ error: "Integration is missing repository or app information" });
				return;
			}

			const githubApp = getCoreJolliGithubApp();

			/* v8 ignore next 4 */
			if (!githubApp) {
				res.status(404).json({ error: "GitHub App not found" });
				return;
			}

			// Extract owner from repo full name
			const [owner] = repoFullName.split("/");

			// Generate installation URL
			const installUrl = await generateInstallationUrl(githubApp, owner);

			res.json({ installUrl });
		} catch (error) {
			log.error(error, "Error getting installation URL:");
			res.status(500).json({ error: "Failed to get installation URL" });
		}
	});

	/**
	 * Get redirect URL for GitHub App setup
	 * Returns the GitHub installation URL
	 *
	 * In multi-tenant mode, delegates to the GitHubConnectProvider which uses encrypted state.
	 * In single-tenant mode, uses the existing flow with plain origin state.
	 */
	router.post("/setup/redirect", async (req, res) => {
		try {
			const config = getConfig();

			// Multi-tenant mode: delegate to connect provider
			if (config.MULTI_TENANT_ENABLED) {
				const tenantContext = getTenantContext();
				if (!tenantContext) {
					res.status(400).json({ error: "Tenant context required for multi-tenant GitHub setup" });
					return;
				}

				const provider = connectProviderRegistry.get("github");
				/* v8 ignore next 4 */
				if (!provider) {
					res.status(500).json({ error: "GitHub connect provider not registered" });
					return;
				}

				// In multi-tenant mode, use the tenant-scoped ORIGIN from config (not the static origin parameter)
				const tenantOrigin = config.ORIGIN;
				const returnTo = req.body?.returnTo || tenantOrigin;
				const redirectUrl = await provider.getSetupRedirectUrl(
					tenantContext.tenant.slug,
					tenantContext.org.slug,
					returnTo,
				);
				res.json({ redirectUrl });
				return;
			}

			// Single-tenant mode: existing logic unchanged
			const result = handleJolliAppRedirect();
			if (result.success) {
				res.json({ redirectUrl: result.redirectUrl });
				/* v8 ignore next 3 */
			} else {
				res.status(result.statusCode).json({ error: result.error });
			}
			/* v8 ignore next 4 */
		} catch (error) {
			log.error(error, "Error generating GitHub redirect:");
			res.status(500).json({ error: "Failed to generate redirect URL" });
		}
	});

	/**
	 * Handle callback from GitHub after app installation
	 * Create the integration record
	 *
	 * In multi-tenant mode with encrypted state, this callback is handled by the ConnectRouter
	 * on the connect gateway. This endpoint is for single-tenant mode or backward compatibility.
	 */
	router.get("/installation/callback", async (req, res) => {
		const { installation_id, setup_action, state } = req.query;

		// Check if state is encrypted (multi-tenant mode via connect gateway)
		// If someone accidentally hits this endpoint with an encrypted state,
		// redirect them to use the connect gateway
		if (state && typeof state === "string" && isEncryptedState(state)) {
			log.warn("GitHub callback received encrypted state - should use connect gateway");
			return res.redirect(`${getConfig().ORIGIN}/?error=use_connect_gateway`);
		}

		// Single-tenant mode: existing logic unchanged
		const githubInstallationDao = githubInstallationDaoProvider.getDao(getTenantContext());

		// Extract the customer's origin from state parameter (for multi-tenant support)
		// If not provided, fall back to the current origin from config
		const targetOrigin = state && typeof state === "string" ? decodeURIComponent(state) : getConfig().ORIGIN;

		try {
			if (setup_action !== "install") {
				return res.redirect(`${targetOrigin}/?error=setup_cancelled`);
			}

			if (!installation_id || typeof installation_id !== "string") {
				return res.redirect(`${targetOrigin}/?error=no_installation_id`);
			}

			const installationId = Number.parseInt(installation_id);
			const app = getCoreJolliGithubApp();

			/* v8 ignore next 3 */
			if (!app) {
				return res.redirect(`${targetOrigin}/?error=app_not_found`);
			}
			const installation = await findInstallationInGithubApp(app, installationId);

			if (!installation) {
				log.warn({ installationId }, "Installation not found in configured app");
				return res.redirect(`${targetOrigin}/?error=installation_not_found`);
			}

			// Get repositories for this installation
			const repoNamesOrError = await fetchInstallationRepositories(app, installationId);

			if (!Array.isArray(repoNamesOrError)) {
				return res.redirect(`${targetOrigin}/?error=${repoNamesOrError.error}`);
			}

			// Create or update installation entry
			await upsertInstallationContainer(
				installation,
				installationId,
				repoNamesOrError,
				githubInstallationDao,
				"setup flow",
			);

			// Determine account type and name for redirect
			const accountLogin = installation.account.login;
			const targetType = installation.target_type || installation.account.type;
			const isOrgInstallation = targetType === "Organization";

			log.info({ installationId, accountLogin, isOrg: isOrgInstallation }, "GitHub App installed successfully");

			// Redirect to the appropriate org/user repo list page
			const containerType = isOrgInstallation ? "org" : "user";
			res.redirect(`${targetOrigin}/integrations/github/${containerType}/${accountLogin}?new_installation=true`);
		} catch (error) {
			log.error(error, "Error in GitHub App installation callback:");
			res.redirect(`${targetOrigin}/?error=installation_failed`);
		}
	});

	async function cleanupOrphanedIntegrations(
		githubInstallationDao: GitHubInstallationDao,
		allInstallations?: Array<GitHubInstallation>,
		allIntegrations?: Array<Integration>,
	): Promise<number> {
		return await cleanupOrphanedGitHubIntegrations(
			integrationsManager,
			allInstallations ?? (await githubInstallationDao.listInstallations()),
			allIntegrations ?? (await integrationsManager.listIntegrations()),
		);
	}

	/**
	 * GET /api/github/summary
	 * Returns summary statistics for GitHub integrations
	 */
	router.get("/summary", async (_req, res) => {
		try {
			const githubInstallationDao = githubInstallationDaoProvider.getDao(getTenantContext());
			// Clean up orphaned integrations before calculating summary
			const allInstallations = await githubInstallationDao.listInstallations();
			const allIntegrations = await integrationsManager.listIntegrations();
			const orphaned = await cleanupOrphanedIntegrations(
				githubInstallationDao,
				allInstallations,
				allIntegrations,
			);

			// Fetch fresh integrations list after cleanup if there were any cleaned up orphans
			const integrations = orphaned ? await integrationsManager.listIntegrations() : allIntegrations;
			const githubIntegrations = integrations.filter(i => i.type === "github");

			let enabledCount = 0;
			let needsAttentionCount = 0;

			for (const integration of githubIntegrations) {
				enabledCount++;
				if (integration.status === "needs_repo_access" || integration.status === "error") {
					needsAttentionCount++;
				}
			}

			const app = getCoreJolliGithubApp();

			// Count total accessible repositories across all installations
			let totalRepoCount = 0;

			for (const installation of allInstallations) {
				try {
					const token = createGitHubAppJWT(app.appId, app.privateKey);
					const repos = await getRepositoriesForInstallation(installation.installationId, token);
					if (repos) {
						totalRepoCount += repos.length;
					}
				} catch (error) {
					log.warn(
						{ installationId: installation.installationId, error },
						"Failed to fetch repos for installation in summary",
					);
					// Continue to next installation
				}
			}

			res.json({
				orgCount: allInstallations.length,
				totalRepos: totalRepoCount,
				enabledRepos: enabledCount,
				needsAttention: needsAttentionCount,
				lastSync: new Date().toISOString(),
			});
		} catch (error) {
			log.error(error, "Error fetching GitHub integration summary");
			res.status(500).json({ error: "Failed to fetch summary" });
		}
	});

	/**
	 * Helper to check installation status
	 */
	async function checkInstallationStatus(installationId: number): Promise<"active" | "not_installed"> {
		const app = getCoreJolliGithubApp();
		/* v8 ignore next 3 */
		if (!app) {
			return "not_installed";
		}

		try {
			const token = createGitHubAppJWT(app.appId, app.privateKey);
			const repos = await getRepositoriesForInstallation(installationId, token);
			if (repos) {
				return "active";
			}
			return "not_installed";
		} catch {
			return "not_installed";
		}
	}

	/**
	 * GET /api/github/installations?appId=123
	 * Returns all GitHub installations (orgs and users) with repo counts
	 * Optional query param: appId - filter by specific GitHub App
	 */
	router.get("/installations", async (_req, res) => {
		try {
			const githubInstallationDao = githubInstallationDaoProvider.getDao(getTenantContext());
			// Fetch all installations from database - single call!
			const installations = await githubInstallationDao.listInstallations();
			const integrations = await integrationsManager.listIntegrations();

			// Clean up any orphaned integrations
			await cleanupOrphanedIntegrations(githubInstallationDao, installations, integrations);

			const app = getCoreJolliGithubApp();
			const appName = app.name;
			// Build response array with installation data
			const result = [];

			for (const installation of installations) {
				// Get integration stats for this installation
				const enabledRepos = integrations.filter(i => {
					const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
					return i.type === "github" && metadata?.installationId === installation.installationId;
				});
				const needsAttention = integrations.filter(i => {
					const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
					return (
						i.type === "github" &&
						metadata?.installationId === installation.installationId &&
						i.status === "needs_repo_access"
					);
				});

				// Check installation status
				const installationStatus = await checkInstallationStatus(installation.installationId);

				result.push({
					id: installation.id,
					installationId: installation.installationId,
					name: installation.name,
					githubAppId: app.appId,
					appSlug: app.slug,
					totalRepos: installation.repos.length,
					enabledRepos: enabledRepos.length,
					needsAttention: needsAttention.length,
					containerType: installation.containerType,
					appName,
					installationStatus,
				});
			}

			res.json(result);
		} catch (error) {
			log.error(error, "Error fetching GitHub installations");
			res.status(500).json({ error: "Failed to fetch installations" });
		}
	});

	/**
	 * POST /api/github/installations/sync
	 * Manually sync all installations from GitHub for all apps
	 */
	router.post("/installations/sync", async (_req, res) => {
		try {
			const githubInstallationDao = githubInstallationDaoProvider.getDao(getTenantContext());
			const app = getCoreJolliGithubApp();
			try {
				await syncAllInstallationsForApp(app, githubInstallationDao);
			} catch (error) {
				log.error({ appId: app.appId, error }, "Failed to sync installations for app");
			}

			// Clean up any orphaned integrations after sync
			try {
				await cleanupOrphanedIntegrations(githubInstallationDao);
			} catch (error) {
				log.error({ error }, "Failed to cleanup orphaned integrations");
			}

			// Heal integrations that now have access
			let healedCount = 0;
			try {
				const integrations = await integrationsManager.listIntegrations();
				const integrationsWithErrors = integrations.filter(integration => {
					const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
					return integration.type === "github" && metadata?.accessError;
				});

				for (const integration of integrationsWithErrors) {
					try {
						// Check if the integration now has access
						const response = await integrationsManager.handleAccessCheck(integration);
						if (response.result?.hasAccess) {
							healedCount++;
							const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
							log.info(
								{ integrationId: integration.id, repo: metadata?.repo },
								"Integration healed during sync",
							);
						}
					} catch (error) {
						// Ignore errors during healing - the integration will remain in error state
						log.debug(
							{ integrationId: integration.id, error },
							"Failed to check access during sync healing",
						);
					}
				}
			} catch (error) {
				log.error({ error }, "Failed to heal integrations during sync");
			}

			res.json({ message: `Synced GitHub Installations for App`, healedCount });
		} catch (error) {
			log.error(error, "Error syncing GitHub installations");
			res.status(500).json({ error: "Failed to sync installations" });
		}
	});

	/**
	 * GET /api/github/installations/:installationId/repos
	 * Returns all repositories for a specific GitHub installation
	 */
	router.get("/installations/:installationId/repos", async (req, res) => {
		try {
			const githubInstallationDao = githubInstallationDaoProvider.getDao(getTenantContext());
			const installationId = Number.parseInt(req.params.installationId);
			if (Number.isNaN(installationId)) {
				res.status(400).json({ error: "Invalid installation ID" });
				return;
			}

			// Find the GitHub App for this installation
			const installation = await githubInstallationDao.lookupByInstallationId(installationId);

			if (!installation) {
				res.status(404).json({ error: "Installation not found" });
				return;
			}

			const app = getCoreJolliGithubApp();
			/* v8 ignore next 4 */
			if (!app) {
				res.status(404).json({ error: "GitHub App not found" });
				return;
			}

			// Get integrations for enrichment and cleanup
			const integrations = await integrationsManager.listIntegrations();
			const allInstallations = await githubInstallationDao.listInstallations();

			// Clean up any orphaned integrations
			await cleanupOrphanedIntegrations(githubInstallationDao, allInstallations, integrations);

			// Get repositories for this installation
			const token = createGitHubAppJWT(app.appId, app.privateKey);
			const repos = await getRepositoriesForInstallation(installationId, token);

			// Check if we couldn't get repos because the app is uninstalled
			if (!repos) {
				// App is likely uninstalled - return special status
				res.json({
					repos: [],
					installationStatus: "not_installed",
				});
				return;
			}

			// Enrich repo data with integration status
			const repoData = repos.map(repo => {
				const integration = integrations.find(i => {
					const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
					return i.type === "github" && metadata?.repo === repo.full_name;
				});

				const integrationMetadata = integration?.metadata as GithubRepoIntegrationMetadata | undefined;
				return {
					fullName: repo.full_name,
					defaultBranch: repo.default_branch,
					enabled: !!integration,
					status: integration?.status || "available",
					integrationId: integration?.id,
					lastAccessCheck: integrationMetadata?.lastAccessCheck,
					accessError: integrationMetadata?.accessError,
				};
			});

			// Add repos that have integrations but are no longer in the GitHub installation
			const repoNamesFromGithub = new Set(repos.map(r => r.full_name));
			const integrationsForThisInstallation = integrations.filter(i => {
				const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
				return (
					i.type === "github" &&
					metadata?.installationId === installationId &&
					!repoNamesFromGithub.has(metadata?.repo || "")
				);
			});

			for (const integration of integrationsForThisInstallation) {
				const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
				if (!metadata?.repo) {
					continue;
				}

				repoData.push({
					fullName: metadata.repo,
					enabled: true,
					defaultBranch: metadata.branch || "main",
					status: "needs_repo_access",
					integrationId: integration.id,
					lastAccessCheck: metadata.lastAccessCheck,
					accessError: "repoNotAccessibleViaInstallation",
				});
			}

			res.json({
				repos: repoData,
				installationStatus: "active",
			});
		} catch (error) {
			log.error(error, "Error fetching installation repositories");
			res.status(500).json({ error: "Failed to fetch repositories" });
		}
	});

	/**
	 * DELETE /api/github/installations/:id
	 * Deletes a GitHub installation (org or user) and all its integrations
	 */
	router.delete("/installations/:id", async (req, res) => {
		try {
			const githubInstallationDao = githubInstallationDaoProvider.getDao(getTenantContext());
			const installationDbId = Number.parseInt(req.params.id);
			if (Number.isNaN(installationDbId)) {
				res.status(400).json({ error: "Invalid installation ID" });
				return;
			}

			// Look up the installation
			const installations = await githubInstallationDao.listInstallations();
			const installation = installations.find(inst => inst.id === installationDbId);

			if (!installation) {
				res.status(404).json({ error: "Installation not found" });
				return;
			}

			// Delete all integrations for this installation
			// This includes:
			// 1. Integrations with matching installationId
			// 2. Integrations from repos owned by this org/user (even without installationId)
			const integrations = await integrationsManager.listIntegrations();
			const ownerPrefix = `${installation.name}/`;
			const installationIntegrations = integrations.filter(i => {
				const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
				return (
					i.type === "github" &&
					(metadata?.installationId === installation.installationId ||
						metadata?.repo?.startsWith(ownerPrefix))
				);
			});

			for (const integration of installationIntegrations) {
				await integrationsManager.deleteIntegration(integration);
			}

			// Delete the installation
			await githubInstallationDao.deleteInstallation(installationDbId);

			log.info(
				{
					installationId: installationDbId,
					name: installation.name,
					containerType: installation.containerType,
					deletedIntegrations: installationIntegrations.length,
				},
				"Deleted GitHub installation",
			);

			res.json({ success: true, deletedIntegrations: installationIntegrations.length });
		} catch (error) {
			log.error(error, "Error deleting GitHub installation");
			res.status(500).json({ error: "Failed to delete installation" });
		}
	});

	/**
	 * POST /api/github/repos/:owner/:repo
	 * Enables a repository for Jolli if not already enabled.
	 */
	router.post("/repos/:owner/:repo", async (req, res) => {
		try {
			const { owner, repo } = req.params;
			const repoFullName = `${owner}/${repo}`;
			const branch = req.body.branch || "main";

			// Find existing integration for this repo
			const integrations = await integrationsManager.listIntegrations();
			const existing = integrations.find(i => {
				const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
				return i.type === "github" && metadata?.repo === repoFullName;
			});

			if (existing) {
				// already exists, return existing
				res.status(200).json(existing);
			} else {
				// Find the installation and GitHub App for this repo

				let foundInstallation: { installationId: number; githubAppId: number } | undefined;

				const app = getCoreJolliGithubApp();
				const token = createGitHubAppJWT(app.appId, app.privateKey);
				const installations = await getInstallations(app.appId, token);

				if (installations) {
					for (const installation of installations) {
						const repos = await getRepositoriesForInstallation(installation.id, token);
						if (repos?.some(r => r.full_name === repoFullName)) {
							foundInstallation = {
								installationId: installation.id,
								githubAppId: app.appId,
							};
							break;
						}
					}
				}

				if (!foundInstallation) {
					res.status(404).json({ error: "Repository not found in any GitHub App installation" });
					return;
				}

				// Create new integration
				const newIntegration = await integrationsManager.createIntegration({
					type: "github",
					name: repoFullName,
					status: "active",
					metadata: {
						repo: repoFullName,
						branch,
						features: [],
						githubAppId: foundInstallation.githubAppId,
						installationId: foundInstallation.installationId,
						lastAccessCheck: new Date().toISOString(),
					},
				});

				res.status(201).json(newIntegration);
			}
		} catch (error) {
			log.error(error, "Error enabling repository");
			res.status(500).json({ error: "Failed to enable repository" });
		}
	});

	/**
	 * DELETE /api/github/repos/:owner/:repo
	 * Removes a repository integration from Jolli
	 */
	router.delete("/repos/:owner/:repo", async (req, res) => {
		try {
			const { owner, repo } = req.params;
			const repoFullName = `${owner}/${repo}`;

			// Find existing integration for this repo
			const integrations = await integrationsManager.listIntegrations();
			const existing = integrations.find(i => {
				const metadata = i.metadata as GithubRepoIntegrationMetadata | undefined;
				return i.type === "github" && metadata?.repo === repoFullName;
			});

			if (!existing) {
				res.status(404).json({ error: "Integration not found" });
				return;
			}

			// Delete the integration
			await integrationsManager.deleteIntegration(existing);

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Error removing repository integration");
			res.status(500).json({ error: "Failed to remove repository integration" });
		}
	});

	return router;
}
