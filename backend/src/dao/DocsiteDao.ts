import { type Docsite, type DocsiteStatus, type DocsiteVisibility, defineDocsites, type Site } from "../model/Docsite";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

/**
 * Docsites DAO
 */
export interface DocsiteDao {
	/**
	 * Creates a site.
	 * @param docsite the docsite to create.
	 */
	createDocsite(docsite: Site): Promise<Docsite>;
	/**
	 * Gets a docsite by ID.
	 * @param id the id to look up the docsite by.
	 */
	getDocsite(id: number): Promise<Docsite | undefined>;
	/**
	 * Gets a docsite by unique name/slug.
	 * @param name the name to look up the docsite by.
	 */
	getDocsiteByName(name: string): Promise<Docsite | undefined>;
	/**
	 * Lists all docsites.
	 */
	listDocsites(): Promise<Array<Docsite>>;
	/**
	 * Lists docsites by user ID.
	 * @param userId the user id to filter by.
	 */
	listDocsitesByUser(userId: number): Promise<Array<Docsite>>;
	/**
	 * Lists docsites by visibility (internal or external).
	 * @param visibility the visibility to filter by.
	 */
	listDocsitesByVisibility(visibility: DocsiteVisibility): Promise<Array<Docsite>>;
	/**
	 * Lists docsites by status.
	 * @param status the status to filter by.
	 */
	listDocsitesByStatus(status: DocsiteStatus): Promise<Array<Docsite>>;
	/**
	 * Updates a docsite.
	 * @param docsite the docsite update.
	 */
	updateDocsite(docsite: Docsite): Promise<Docsite | undefined>;
	/**
	 * Deletes a docsite by ID.
	 * @param id the id of the docsite to delete.
	 */
	deleteDocsite(id: number): Promise<void>;
	/**
	 * Deletes all docsites.
	 */
	deleteAllDocsites(): Promise<void>;
}

export function createDocsiteDao(sequelize: Sequelize): DocsiteDao {
	const Docsites = defineDocsites(sequelize);

	return {
		createDocsite,
		getDocsite,
		getDocsiteByName,
		listDocsites,
		listDocsitesByUser,
		listDocsitesByVisibility,
		listDocsitesByStatus,
		updateDocsite,
		deleteDocsite,
		deleteAllDocsites,
	};

	async function createDocsite(docsite: Site): Promise<Docsite> {
		const created = await Docsites.create(docsite as never);
		return created.get({ plain: true });
	}

	async function getDocsite(id: number): Promise<Docsite | undefined> {
		const docsite = await Docsites.findByPk(id);
		return docsite ? docsite.get({ plain: true }) : undefined;
	}

	async function getDocsiteByName(name: string): Promise<Docsite | undefined> {
		const docsite = await Docsites.findOne({ where: { name } });
		return docsite ? docsite.get({ plain: true }) : undefined;
	}

	async function listDocsites(): Promise<Array<Docsite>> {
		const docsites = await Docsites.findAll({ order: [["createdAt", "DESC"]] });
		return docsites.map(d => d.get({ plain: true }));
	}

	async function listDocsitesByUser(userId: number): Promise<Array<Docsite>> {
		const docsites = await Docsites.findAll({
			where: { userId },
			order: [["createdAt", "DESC"]],
		});
		return docsites.map(d => d.get({ plain: true }));
	}

	async function listDocsitesByVisibility(visibility: DocsiteVisibility): Promise<Array<Docsite>> {
		const docsites = await Docsites.findAll({
			where: { visibility },
			order: [["createdAt", "DESC"]],
		});
		return docsites.map(d => d.get({ plain: true }));
	}

	async function listDocsitesByStatus(status: DocsiteStatus): Promise<Array<Docsite>> {
		const docsites = await Docsites.findAll({
			where: { status },
			order: [["createdAt", "DESC"]],
		});
		return docsites.map(d => d.get({ plain: true }));
	}

	async function updateDocsite(docsite: Docsite): Promise<Docsite | undefined> {
		const existing = await Docsites.findByPk(docsite.id);
		if (existing) {
			await Docsites.update(docsite, { where: { id: docsite.id } });
			return getDocsite(docsite.id);
		}
		return;
	}

	async function deleteDocsite(id: number): Promise<void> {
		await Docsites.destroy({ where: { id } });
	}

	async function deleteAllDocsites(): Promise<void> {
		await Docsites.destroy({ where: {} });
	}
}

export function createDocsiteDaoProvider(defaultDao: DocsiteDao): DaoProvider<DocsiteDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocsiteDao {
			return context?.database.docsiteDao ?? defaultDao;
		},
	};
}
