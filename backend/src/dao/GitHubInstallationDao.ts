import {
	defineGitHubInstallations,
	type GitHubInstallation,
	type GitHubInstallationContainerType,
	type NewGitHubInstallation,
} from "../model/GitHubInstallation";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

/**
 * GitHub Installations DAO - unified DAO for both org and user installations
 */
export interface GitHubInstallationDao {
	/**
	 * Creates a new GitHub Installation.
	 * @param installation the GitHub installation to create.
	 */
	createInstallation(installation: NewGitHubInstallation): Promise<GitHubInstallation>;
	/**
	 * Looks up a GitHub Installation by name.
	 * @param name the installation name.
	 */
	lookupByName(name: string): Promise<GitHubInstallation | undefined>;
	/**
	 * Looks up a GitHub Installation by installation ID.
	 * @param installationId the installation ID.
	 */
	lookupByInstallationId(installationId: number): Promise<GitHubInstallation | undefined>;
	/**
	 * Lists all GitHub Installations, optionally filtered by container type.
	 * @param containerType optional filter by org or user.
	 */
	listInstallations(containerType?: GitHubInstallationContainerType): Promise<Array<GitHubInstallation>>;
	/**
	 * Updates a GitHub Installation.
	 * @param installation the GitHub installation to update.
	 */
	updateInstallation(installation: GitHubInstallation): Promise<GitHubInstallation>;
	/**
	 * Deletes a GitHub Installation.
	 * @param id the id of the GitHub Installation to delete.
	 */
	deleteInstallation(id: number): Promise<void>;
	/**
	 * Deletes all GitHub Installations.
	 */
	deleteAllInstallations(): Promise<void>;
}

export function createGitHubInstallationDao(sequelize: Sequelize): GitHubInstallationDao {
	const GitHubInstallations = defineGitHubInstallations(sequelize);

	return {
		createInstallation,
		lookupByName,
		lookupByInstallationId,
		listInstallations,
		updateInstallation,
		deleteInstallation,
		deleteAllInstallations,
	};

	async function createInstallation(installation: NewGitHubInstallation): Promise<GitHubInstallation> {
		const created = await GitHubInstallations.create(installation as never);
		return created.get({ plain: true }) as GitHubInstallation;
	}

	async function lookupByName(name: string): Promise<GitHubInstallation | undefined> {
		const installation = await GitHubInstallations.findOne({
			where: {
				name,
			},
		});
		return installation ? (installation.get({ plain: true }) as GitHubInstallation) : undefined;
	}

	async function lookupByInstallationId(installationId: number): Promise<GitHubInstallation | undefined> {
		const installation = await GitHubInstallations.findOne({
			where: {
				installationId,
			},
		});
		return installation ? (installation.get({ plain: true }) as GitHubInstallation) : undefined;
	}

	async function listInstallations(
		containerType?: GitHubInstallationContainerType,
	): Promise<Array<GitHubInstallation>> {
		const where = containerType ? { containerType } : {};
		const installations = await GitHubInstallations.findAll({
			where,
			order: [["id", "DESC"]],
		});
		return installations.map(installation => installation.get({ plain: true }) as GitHubInstallation);
	}

	async function updateInstallation(installation: GitHubInstallation): Promise<GitHubInstallation> {
		await GitHubInstallations.update(installation as never, {
			where: {
				id: installation.id,
			},
		});
		const updated = await GitHubInstallations.findOne({
			where: {
				id: installation.id,
			},
		});
		if (!updated) {
			throw new Error(`GitHub Installation with id ${installation.id} not found after update`);
		}
		return updated.get({ plain: true }) as GitHubInstallation;
	}

	async function deleteInstallation(id: number): Promise<void> {
		await GitHubInstallations.destroy({
			where: {
				id,
			},
		});
	}

	async function deleteAllInstallations(): Promise<void> {
		await GitHubInstallations.destroy({ where: {} });
	}
}

export function createGitHubInstallationDaoProvider(
	defaultDao: GitHubInstallationDao,
): DaoProvider<GitHubInstallationDao> {
	return {
		getDao(context: TenantOrgContext | undefined): GitHubInstallationDao {
			return context?.database.githubInstallationDao ?? defaultDao;
		},
	};
}
