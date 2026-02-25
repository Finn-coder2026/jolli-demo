import type { Database } from "../core/Database";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import {
	GITHUB_INSTALLATION_CREATED,
	GITHUB_INSTALLATION_DELETED,
	GITHUB_INSTALLATION_REPOSITORIES_ADDED,
	GITHUB_INSTALLATION_REPOSITORIES_REMOVED,
} from "../events/GithubEvents";
import { jobDefinitionBuilder } from "../jobs/JobDefinitions";
import { getCoreJolliGithubApp } from "../model/GitHubApp";
import type { Integration, NewIntegration } from "../model/Integration";
import { getTenantContext } from "../tenant/TenantContext";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import type {
	GitHubAccount,
	GitHubAppInstallation,
	GitHubAppRepository,
	GitHubInstallationPayload,
	GitHubInstallationRepositoriesPayload,
} from "../types/GithubTypes";
import type { IntegrationCheckResponse, IntegrationContext, IntegrationTypeBehavior } from "../types/IntegrationTypes";
import type { JobContext, JobDefinition } from "../types/JobTypes";
import {
	createGitHubAppJWT,
	getInstallations,
	getRepositoriesForInstallation,
	syncAllInstallationsForApp,
} from "../util/GithubAppUtil";
import { getLog } from "../util/Logger";
import type { IntegrationsManager } from "./IntegrationsManager";
import type { GithubRepoIntegrationMetadata, MutableFields } from "jolli-common";
import { z } from "zod";

const log = getLog(import.meta);

async function checkRepositoryAccess(
	app: { appId: number; privateKey: string },
	repoFullName: string,
): Promise<{ hasAccess: boolean; installationId?: number }> {
	try {
		const token = createGitHubAppJWT(app.appId, app.privateKey);
		const installations = await getInstallations(app.appId, token);

		if (!installations) {
			return { hasAccess: false };
		}

		for (const installation of installations) {
			const repos = await getRepositoriesForInstallation(installation.id, token);
			if (repos?.some(r => r.full_name === repoFullName)) {
				return { hasAccess: true, installationId: installation.id };
			}
		}

		return { hasAccess: false };
	} catch (error) {
		log.error({ error, repoFullName }, "Error checking repository access");
		return { hasAccess: false };
	}
}

export function createIntegrationTypeBehavior(
	defaultDb: Database,
	integrationsManager: IntegrationsManager,
	registryClient?: TenantRegistryClient,
): IntegrationTypeBehavior {
	/**
	 * Get the database to use - prefers tenant context, falls back to default.
	 * This enables multi-tenant support while maintaining backward compatibility.
	 * In worker mode, job handlers run within runWithTenantContext(), so
	 * getTenantContext() returns the tenant-specific database.
	 * In single-tenant mode, defaultDb is a real database instance.
	 */
	function getDatabase(): Database {
		const tenantContext = getTenantContext();
		if (tenantContext?.database) {
			return tenantContext.database;
		}
		return defaultDb;
	}

	/** Get the GitHubInstallationDao from the current database context. */
	function getGithubInstallationDao(): GitHubInstallationDao {
		return getDatabase().githubInstallationDao;
	}

	return {
		preCreate,
		handleAccessCheck,
		getJobDefinitions,
	};

	async function preCreate(
		newIntegration: MutableFields<NewIntegration, "status" | "metadata">,
		context: IntegrationContext,
	): Promise<boolean> {
		const { manager } = context;
		const metadata = newIntegration.metadata as GithubRepoIntegrationMetadata | undefined;
		// Check if any other github integrations are enabled and remove them
		if (metadata?.installationId && metadata?.githubAppId) {
			const allIntegrations = await manager.listIntegrations();
			const otherActiveGithubRepoIntegrations = allIntegrations.filter(
				i => i.type === "github" && i.status === "active",
			);
			// Only uninstall the GitHub App if this is the last integration using it
			if (otherActiveGithubRepoIntegrations.length > 0) {
				for (const integration of otherActiveGithubRepoIntegrations) {
					log.info(
						"removing %s github repo integration since we are adding %s",
						integration.name,
						newIntegration.name,
					);
					await integrationsManager.deleteIntegration(integration);
				}
			}
		}
		return true;
	}

	async function handleAccessCheck(
		integration: Integration,
		context: IntegrationContext,
	): Promise<IntegrationCheckResponse> {
		const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
		const { manager } = context;

		// Only check GitHub integrations
		if (!metadata?.githubAppId || !metadata?.repo) {
			return {
				error: {
					code: 400,
					reason: "Integration does not support access checks",
				},
			};
		}

		const { repo } = metadata;

		// Get the GitHub App
		const app = getCoreJolliGithubApp();
		/* v8 ignore next 8 */
		if (!app) {
			return {
				error: {
					code: 400,
					reason: "GitHub App not found",
				},
			};
		}

		const accessCheck = await checkRepositoryAccess(app, repo);

		if (accessCheck.hasAccess && accessCheck.installationId) {
			// Repository has access - mark as active and save installationId
			const { accessError: _accessError, ...metadataWithoutError } = metadata;
			await manager.updateIntegration(integration, {
				...integration,
				status: "active",
				metadata: {
					...metadataWithoutError,
					installationId: accessCheck.installationId,
					lastAccessCheck: new Date().toISOString(),
				},
			});
			return {
				result: { hasAccess: true, status: "active" },
			};
		} else {
			// Repository does not have access - mark as needs_repo_access
			await manager.updateIntegration(integration, {
				...integration,
				status: "needs_repo_access",
				metadata: {
					...metadata,
					lastAccessCheck: new Date().toISOString(),
					accessError: "repoNotAccessibleByApp",
				},
			});
			return {
				result: { hasAccess: false, status: "needs_repo_access" },
			};
		}
	}

	function getIntegrationsManager(): IntegrationsManager {
		return integrationsManager;
	}

	function getAccountSchema(): z.ZodType<GitHubAccount> {
		return z.object({
			id: z.number(),
			login: z.string(),
			type: z.enum(["Organization", "User"]),
		});
	}

	function getInstallationSchema(): z.ZodType<GitHubAppInstallation> {
		return z.object({
			id: z.number(),
			app_id: z.number(),
			account: getAccountSchema(),
		});
	}

	function getAppRepositorySchema(): z.ZodType<GitHubAppRepository> {
		return z.object({
			full_name: z.string(),
			default_branch: z.string().optional(),
		});
	}

	/**
	 * Defines a job to handle the github installation.created event.
	 */
	function getInstallationCreatedJobDefinition(): JobDefinition {
		return jobDefinitionBuilder()
			.category("github")
			.name("handle-installation-created")
			.title("GitHub App Installed")
			.description(
				"Handles GitHub App installation created event - creates installation tracking and heals broken integrations",
			)
			.schema(
				z.object({
					action: z.string(),
					installation: getInstallationSchema().optional(),
					organization: getAccountSchema().optional(),
					sender: getAccountSchema().optional(),
					repositories: z.array(getAppRepositorySchema()).optional(),
				}),
			)
			.handler(async (params: unknown, context: JobContext) => {
				await handleInstallationCreated(
					params as GitHubInstallationPayload,
					getIntegrationsManager(),
					getGithubInstallationDao(),
					context,
				);
			})
			.triggerEvents([GITHUB_INSTALLATION_CREATED])
			.build();
	}

	/**
	 * Defines a job to handle the github installation.deleted event.
	 */
	function getInstallationDeletedJobDefinition(): JobDefinition {
		return {
			name: "github:handle-installation-deleted",
			title: "GitHub App Uninstalled",
			description:
				"Handles GitHub App installation deleted event - marks installation as uninstalled and disables affected integrations",
			category: "github",
			schema: z.object({
				installation: getInstallationSchema(),
			}),
			handler: async (params: unknown, context: JobContext) => {
				await handleInstallationDeleted(
					params as GitHubInstallationPayload,
					getIntegrationsManager(),
					getGithubInstallationDao(),
					context,
				);
			},
			triggerEvents: [GITHUB_INSTALLATION_DELETED],
		};
	}

	function getReposAddedJobDefinition(): JobDefinition {
		// Job to handle installation_repositories.added event
		return {
			name: "github:handle-repositories-added",
			title: "GitHub Repos Added to App Install",
			description:
				"Handles repositories added to GitHub App installation event - updates installation tracking and heals broken integrations",
			category: "github",
			schema: z.object({
				installation: getInstallationSchema(),
				repositories_added: z.array(z.unknown()).optional(),
			}),
			handler: async (params: unknown, context: JobContext) => {
				await handleRepositoriesAdded(
					params as GitHubInstallationRepositoriesPayload,
					getIntegrationsManager(),
					getGithubInstallationDao(),
					context,
				);
			},
			triggerEvents: [GITHUB_INSTALLATION_REPOSITORIES_ADDED],
		};
	}

	function getReposRemovedJobDefinition(): JobDefinition {
		// Job to handle installation_repositories.removed event
		return {
			name: "github:handle-repositories-removed",
			title: "GitHub Repos Removed from App Install",
			description:
				"Handles repositories removed from GitHub App installation event - updates installation tracking and disables affected integrations",
			category: "github",
			schema: z.object({
				installation: getInstallationSchema(),
				repositories_removed: z.array(z.unknown()).optional(),
			}),
			handler: async (params: unknown, context: JobContext) => {
				await handleRepositoriesRemoved(
					params as GitHubInstallationRepositoriesPayload,
					getIntegrationsManager(),
					getGithubInstallationDao(),
					context,
				);
			},
			triggerEvents: [GITHUB_INSTALLATION_REPOSITORIES_REMOVED],
		};
	}

	function getJobDefinitions(): Array<JobDefinition> {
		return [
			getInstallationCreatedJobDefinition(),
			getInstallationDeletedJobDefinition(),
			getReposAddedJobDefinition(),
			getReposRemovedJobDefinition(),
		];
	}

	/**
	 * Handle installation.created event - when app is installed and repositories are selected
	 * Create entry in github_installations table to track the installation and heal any broken integrations
	 */
	async function handleInstallationCreated(
		payload: GitHubInstallationPayload,
		integrationsManager: IntegrationsManager,
		githubInstallationDao: GitHubInstallationDao,
		context: JobContext,
	): Promise<void> {
		const installationId = payload.installation?.id;
		const appId = payload.installation?.app_id;
		const repositories = payload.repositories || [];

		if (!installationId || !appId) {
			context.log("missing-installation-info", { eventType: "installation.created" }, "warn");
			return;
		}

		// Sync all installations for this app to ensure database is up to date
		// Note: getCoreJolliGithubApp() is guaranteed to be non-null here because
		// signature verification at the route handler level already checked this
		await syncAllInstallationsForApp(getCoreJolliGithubApp(), githubInstallationDao);

		// Heal any integrations that were broken due to app being uninstalled
		// Note: When GitHub app is reinstalled, it gets a NEW installation ID, so we can't match on installationId
		// Instead, we look for integrations that:
		// 1. Match the githubAppId
		// 2. Have the uninstall error message
		// 3. Don't have an installationId (it was removed during uninstall)
		const existingIntegrations = await integrationsManager.listIntegrations();
		const brokenIntegrations = existingIntegrations.filter(integration => {
			const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			return (
				integration.type === "github" &&
				metadata?.githubAppId === appId &&
				!metadata?.installationId && // installationId was removed during uninstall
				metadata?.accessError === "appInstallationUninstalled"
			);
		});

		for (const integration of brokenIntegrations) {
			// Remove the access error and restore to active status with new installationId
			const {
				accessError: _removedError,
				lastAccessCheck: _removedCheck,
				...cleanMetadata
			} = integration.metadata as GithubRepoIntegrationMetadata & {
				accessError?: string;
				lastAccessCheck?: string;
			};

			await integrationsManager.updateIntegration(integration, {
				...integration,
				status: "active",
				metadata: {
					...cleanMetadata,
					installationId, // Add the new installation ID
				},
			});

			const repoMetadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			context.log(
				"integration-healed",
				{ integrationId: integration.id, repo: repoMetadata?.repo || "unknown" },
				"info",
			);
		}

		context.log(
			"processing-complete",
			{ installationId, appId, repoCount: repositories.length, healedCount: brokenIntegrations.length },
			"info",
		);
	}

	/**
	 * Handle installation_repositories.added event - when repositories are added to existing installation
	 * Update the repos list in github_installations table and heal any integrations that were broken
	 */
	async function handleRepositoriesAdded(
		payload: GitHubInstallationRepositoriesPayload,
		integrationsManager: IntegrationsManager,
		githubInstallationDao: GitHubInstallationDao,
		context: JobContext,
	): Promise<void> {
		const installationId = payload.installation?.id;
		const appId = payload.installation?.app_id;
		const addedRepos = payload.repositories_added || [];

		if (!installationId || !appId) {
			context.log("missing-installation-info", { eventType: "installation_repositories.added" }, "warn");
			return;
		}

		// Sync all installations for this app to ensure database is up to date
		// Note: getCoreJolliGithubApp() is guaranteed to be non-null here because
		// signature verification at the route handler level already checked this
		await syncAllInstallationsForApp(getCoreJolliGithubApp(), githubInstallationDao);

		// Heal any integrations that were broken due to repos being removed
		// Find integrations that:
		// 1. Match the installationId
		// 2. Have the "repoRemovedFromInstallation" error
		// 3. The repo is in the addedRepos list
		const addedRepoNames = new Set(addedRepos.map(r => r.full_name));
		const existingIntegrations = await integrationsManager.listIntegrations();
		const brokenIntegrations = existingIntegrations.filter(integration => {
			const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			return (
				integration.type === "github" &&
				metadata?.installationId === installationId &&
				metadata?.accessError === "repoRemovedFromInstallation" &&
				addedRepoNames.has(metadata?.repo || "")
			);
		});

		for (const integration of brokenIntegrations) {
			// Remove the access error and restore to active status
			const {
				accessError: _removedError,
				lastAccessCheck: _removedCheck,
				...cleanMetadata
			} = integration.metadata as GithubRepoIntegrationMetadata & {
				accessError?: string;
				lastAccessCheck?: string;
			};

			await integrationsManager.updateIntegration(integration, {
				...integration,
				status: "active",
				metadata: {
					...cleanMetadata,
					lastAccessCheck: new Date().toISOString(),
				},
			});

			const repoMetadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			context.log(
				"integration-healed",
				{ integrationId: integration.id, repo: repoMetadata?.repo || "unknown" },
				"info",
			);
		}

		context.log(
			"repos-added-complete",
			{ installationId, appId, addedCount: addedRepos.length, healedCount: brokenIntegrations.length },
			"info",
		);
	}

	/**
	 * Handle installation_repositories.removed event - when repositories are removed from existing installation
	 * Update the repos list in github_installations table and disable any associated integrations
	 */
	async function handleRepositoriesRemoved(
		payload: GitHubInstallationRepositoriesPayload,
		integrationsManager: IntegrationsManager,
		githubInstallationDao: GitHubInstallationDao,
		context: JobContext,
	): Promise<void> {
		const installationId = payload.installation?.id;
		const appId = payload.installation?.app_id;
		const removedRepos = payload.repositories_removed || [];

		if (!installationId || !appId) {
			context.log("missing-installation-info", { eventType: "installation_repositories.removed" }, "warn");
			return;
		}

		// Sync all installations for this app to ensure database is up to date
		// Note: getCoreJolliGithubApp() is guaranteed to be non-null here because
		// signature verification at the route handler level already checked this
		await syncAllInstallationsForApp(getCoreJolliGithubApp(), githubInstallationDao);

		// Also disable any integrations for the removed repositories
		for (const repo of removedRepos) {
			const repoFullName = repo.full_name;

			// Find matching integration
			const existingIntegrations = await integrationsManager.listIntegrations();
			const integration = existingIntegrations.find(integration => {
				const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
				return metadata?.repo === repoFullName && metadata?.githubAppId === appId;
			});

			if (!integration) {
				context.log("no-integration-found", { repo: repoFullName }, "info");
				continue;
			}

			// Update integration: disable it and mark status as needs_repo_access
			await integrationsManager.updateIntegration(integration, {
				...integration,
				status: "needs_repo_access",
				metadata: {
					...(integration.metadata as GithubRepoIntegrationMetadata),
					accessError: "repoRemovedFromInstallation",
					lastAccessCheck: new Date().toISOString(),
				},
			});

			context.log(
				"integration-disabled",
				{ integrationId: integration.id, repo: repoFullName, reason: "repo-removed" },
				"warn",
			);
		}

		context.log("repos-removed-complete", { installationId, appId, removedCount: removedRepos.length }, "info");
	}

	/**
	 * Handle installation.deleted event - when the entire GitHub App installation is uninstalled
	 * Mark the installation as uninstalled (clear repos) and disable all integrations that use this installation
	 */
	async function handleInstallationDeleted(
		payload: GitHubInstallationPayload,
		integrationsManager: IntegrationsManager,
		githubInstallationDao: GitHubInstallationDao,
		context: JobContext,
	): Promise<void> {
		const installationId = payload.installation?.id;
		const appId = payload.installation?.app_id;

		if (!installationId || !appId) {
			context.log("missing-installation-info", { eventType: "installation.deleted" }, "warn");
			return;
		}

		// Note: getCoreJolliGithubApp() is guaranteed to be non-null here because
		// signature verification at the route handler level already checked this

		// Find and update the installation entry to mark it as uninstalled (clear repos)
		const installation = await githubInstallationDao.lookupByInstallationId(installationId);
		if (installation) {
			await githubInstallationDao.updateInstallation({
				...installation,
				repos: [], // Clear repos to indicate app is no longer installed
			});
			context.log("installation-marked-uninstalled", { name: installation.name, installationId }, "info");
		} else {
			context.log("installation-not-found", { installationId }, "warn");
		}

		// Delete the installation mapping from the registry (for multi-tenant webhook routing)
		if (registryClient) {
			try {
				await registryClient.deleteInstallationMapping(installationId);
				context.log("installation-mapping-deleted", { installationId }, "info");
			} catch (error) {
				// Log but don't fail - the mapping may not exist
				log.warn({ error, installationId }, "Failed to delete installation mapping");
			}
		}

		// Find all integrations that use this installation
		const existingIntegrations = await integrationsManager.listIntegrations();
		const affectedIntegrations = existingIntegrations.filter(integration => {
			const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			return metadata?.githubAppId === appId && metadata?.installationId === installationId;
		});

		// Disable each affected integration
		for (const integration of affectedIntegrations) {
			// Remove installationId from metadata since it's no longer valid
			const { installationId: _removedInstallationId, ...metadataWithoutInstallation } =
				integration.metadata as GithubRepoIntegrationMetadata;

			await integrationsManager.updateIntegration(integration, {
				...integration,
				status: "needs_repo_access",
				metadata: {
					...metadataWithoutInstallation,
					accessError: "appInstallationUninstalled",
					lastAccessCheck: new Date().toISOString(),
				},
			});

			const repoMetadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
			context.log(
				"integration-disabled",
				{
					integrationId: integration.id,
					repo: repoMetadata?.repo || "unknown",
					reason: "app-uninstalled",
				},
				"warn",
			);
		}

		context.log(
			"installation-deleted-complete",
			{ installationId, appId, affectedCount: affectedIntegrations.length },
			"info",
		);
	}
}
