import type { DaoPostSyncHook, Database } from "../core/Database";
import { getCoreJolliGithubApp } from "../model/GitHubApp";
import {
	defineIntegrations,
	type GithubRepoIntegration,
	type Integration,
	type NewIntegration,
} from "../model/Integration";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { GitHubAppInstallation } from "../types/GithubTypes";
import { syncAllInstallationsForApp } from "../util/GithubAppUtil";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import type { GithubRepoIntegrationMetadata } from "jolli-common";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Integrations DAO
 */
export interface IntegrationDao {
	/**
	 * Creates a new Integration.
	 * @param integration the integration to create.
	 */
	createIntegration(integration: NewIntegration): Promise<Integration>;
	/**
	 * Looks up an Integration for the given id.
	 * @param id the id to look up the integration by.
	 */
	getIntegration(id: number): Promise<Integration | undefined>;
	/**
	 * Lists all Integrations currently in the repository.
	 */
	listIntegrations(): Promise<Array<Integration>>;
	/**
	 * Updates an Integration if one exists.
	 * @param id the integration id to update.
	 * @param update the integration update.
	 * @param preUpdate an optional check that should happen before the update is made.
	 * If this is passed it will do the update in a transaction.
	 */
	updateIntegration(
		id: number,
		update: Partial<Integration>,
		preUpdate?: ((integration: Integration) => Promise<boolean>) | undefined,
	): Promise<Integration | undefined>;
	/**
	 * Deletes an Integration.
	 * @param id the id of the Integration to delete.
	 */
	deleteIntegration(id: number): Promise<void>;
	/**
	 * Removes all github integrations.
	 */
	removeAllGitHubIntegrations(): Promise<void>;
	/**
	 * Removes duplicate GitHub integrations, keeping only the oldest one for each repo+appId combination.
	 * @returns The number of duplicates removed
	 */
	removeDuplicateGitHubIntegrations(): Promise<number>;
	/**
	 * Converts a basic Integration to a GithubRepoIntegration with getApp() method.
	 * @param integration the integration to convert.
	 */
	getGitHubRepoIntegration(integration: Integration): GithubRepoIntegration | undefined;
	/**
	 * Looks up an Integration by id and converts it to the specified type.
	 * @param id the id to look up the integration by.
	 */
	lookupIntegration<IntegrationT extends Integration>(id: number): Promise<IntegrationT | undefined>;
}

export function createIntegrationDao(sequelize: Sequelize): IntegrationDao & DaoPostSyncHook {
	const Integrations = defineIntegrations(sequelize);

	return {
		postSync,
		createIntegration,
		getIntegration,
		listIntegrations,
		updateIntegration,
		deleteIntegration,
		removeAllGitHubIntegrations,
		removeDuplicateGitHubIntegrations,
		getGitHubRepoIntegration,
		lookupIntegration,
	};

	async function createIntegration(integration: NewIntegration): Promise<Integration> {
		// For GitHub integrations, check if one already exists with the same repo and githubAppId
		const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
		if (integration.type === "github" && metadata?.repo && metadata?.githubAppId) {
			const existingIntegrationsInstances = await Integrations.findAll();
			const existingIntegrations = existingIntegrationsInstances.map(i => i.get({ plain: true }));

			const duplicate = existingIntegrations.find(existing => {
				const existingMetadata = existing.metadata as GithubRepoIntegrationMetadata | undefined;
				return (
					existingMetadata?.repo === metadata?.repo && existingMetadata?.githubAppId === metadata?.githubAppId
				);
			});

			if (duplicate) {
				// Return the existing integration instead of creating a duplicate
				return duplicate;
			}
		}

		const created = await Integrations.create(integration as never);
		return created.get({ plain: true });
	}

	async function getIntegration(id: number): Promise<Integration | undefined> {
		const integration = await Integrations.findByPk(id);
		return integration ? integration.get({ plain: true }) : undefined;
	}

	async function listIntegrations(): Promise<Array<Integration>> {
		const integrations = await Integrations.findAll({ order: [["createdAt", "DESC"]] });
		return integrations.map(integration => integration.get({ plain: true }));
	}

	function getGitHubRepoIntegration(integration: Integration): GithubRepoIntegration | undefined {
		return integration && integration.type === "github"
			? ({
					...integration,
					metadata: integration.metadata as unknown as GithubRepoIntegrationMetadata,
				} as GithubRepoIntegration)
			: undefined;
	}

	async function lookupIntegration<IntegrationT extends Integration>(id: number): Promise<IntegrationT | undefined> {
		const integration = await getIntegration(id);
		if (integration && integration.type === "github") {
			return getGitHubRepoIntegration(integration) as unknown as IntegrationT;
		}
		return;
	}

	async function updateIntegration(
		id: number,
		update: Partial<Integration>,
		preUpdate?: (integration: Integration) => Promise<boolean> | undefined,
	): Promise<Integration | undefined> {
		const existing = await Integrations.findByPk(id);
		if (existing) {
			if (preUpdate) {
				await sequelize.transaction(async t => {
					const integration = existing.get({ plain: true });
					if (await preUpdate(integration)) {
						await Integrations.update(update, {
							where: { id },
							transaction: t,
						});
					}
				});
			} else {
				await Integrations.update(update, { where: { id } });
			}
			return getIntegration(id);
		}
	}

	async function deleteIntegration(id: number): Promise<void> {
		await Integrations.destroy({ where: { id } });
	}

	async function removeAllGitHubIntegrations(): Promise<void> {
		await Integrations.destroy({ where: { type: "github" } });
	}

	async function removeDuplicateGitHubIntegrations(): Promise<number> {
		const allIntegrations = await Integrations.findAll({ order: [["createdAt", "ASC"]] });
		const seen = new Map<string, Integration>();
		const duplicatesToDelete: Array<number> = [];

		for (const integration of allIntegrations) {
			const data = integration.get({ plain: true });

			// Only check GitHub integrations
			const metadata = data.metadata as GithubRepoIntegrationMetadata | undefined;
			if (data.type === "github" && metadata?.repo && metadata?.githubAppId) {
				const key = `${metadata.repo}:${metadata.githubAppId}`;

				if (seen.has(key)) {
					// This is a duplicate - mark it for deletion
					duplicatesToDelete.push(data.id);
				} else {
					// First occurrence - keep it
					seen.set(key, data);
				}
			}
		}

		// Delete all duplicates
		if (duplicatesToDelete.length > 0) {
			await Integrations.destroy({ where: { id: duplicatesToDelete } });
		}

		return duplicatesToDelete.length;
	}

	/**
	 * Post-sync hook that runs after database initialization.
	 * Migrates orphaned GitHub integrations by finding matching org/user entries.
	 */
	async function postSync(_sequelize: Sequelize, db: Database): Promise<void> {
		// Run migration sequentially to avoid connection pool exhaustion
		try {
			await migrateOrphanedIntegrations(db);
		} catch (error) {
			log.error(error, "Error during integration migration");
		}
	}

	/**
	 * Migrates GitHub integrations that don't have corresponding installation entries.
	 */
	async function migrateOrphanedIntegrations(db: Database): Promise<void> {
		log.info("Starting migration of orphaned GitHub integrations");

		const githubInstallationDao = db.githubInstallationDao;
		const jolliApp = getCoreJolliGithubApp();

		try {
			const installationsForApp = await syncAllInstallationsForApp(jolliApp, githubInstallationDao);
			let errorCount = 0;
			// Get all GitHub integrations
			const allIntegrations = await listIntegrations();
			const githubIntegrations = allIntegrations.filter(i => i.type === "github");

			log.info({ count: githubIntegrations.length }, "Found GitHub integrations to check");

			for (const integration of githubIntegrations) {
				const metadata = integration.metadata as GithubRepoIntegrationMetadata | undefined;
				if (!metadata?.repo) {
					continue;
				}

				// Parse owner from repo (format: "owner/repo")
				const [owner] = metadata.repo.split("/");
				if (!owner) {
					continue;
				}

				// Check if installation entry already exists
				const existingInstallation = await githubInstallationDao.lookupByName(owner);

				if (existingInstallation) {
					// Entry already exists, skip
					continue;
				}

				log.info({ integrationId: integration.id, owner, repo: metadata.repo }, "Found orphaned integration");
				const hasAccess = await checkOwnerInstalled(installationsForApp, owner);
				if (!hasAccess) {
					log.warn(
						{ integrationId: integration.id, owner, repo: metadata.repo },
						"No app has access to owner",
					);

					// Mark integration as needing repo access
					await updateIntegration(integration.id, {
						...integration,
						status: "needs_repo_access",
						metadata: {
							...metadata,
							accessError: "repoNotAccessibleByApp",
						},
					});
					errorCount++;
				}
			}

			log.info({ errorCount }, "Completed integration migration");
		} catch (error) {
			log.error(error, "Error during integration migration");
			throw error;
		}
	}

	/**
	 * Checks if an array of GithubAppInstallations has an installation for the specified owner.
	 */
	function checkOwnerInstalled(installations: Array<GitHubAppInstallation>, owner: string): boolean {
		return installations.some(installation => installation.account.login.toLowerCase() === owner.toLowerCase());
	}
}

export function createIntegrationDaoProvider(defaultDao: IntegrationDao): DaoProvider<IntegrationDao> {
	return {
		getDao(context: TenantOrgContext | undefined): IntegrationDao {
			return context?.database.integrationDao ?? defaultDao;
		},
	};
}
