import { type DocDraft, defineDocDrafts } from "../model/DocDraft";
import {
	type DocDraftSectionChanges,
	defineDocDraftChanges,
	type NewDocDraftSectionChanges,
} from "../model/DocDraftSectionChanges";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import type { DocDraftSectionChange, DocDraftSectionComment } from "jolli-common";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * DocDraftSectionChanges DAO
 */
export interface DocDraftSectionChangesDao {
	/**
	 * Creates a new DocDraftSectionChanges entry.
	 * @param changes the changes to create.
	 */
	createDocDraftSectionChanges(changes: NewDocDraftSectionChanges): Promise<DocDraftSectionChanges>;

	/**
	 * Gets section changes by ID.
	 * @param id the section changes ID.
	 */
	getDocDraftSectionChanges(id: number): Promise<DocDraftSectionChanges | undefined>;

	/**
	 * Lists all section changes with pagination.
	 * @param limit maximum number of section changes to return.
	 * @param offset number of section changes to skip.
	 */
	listDocDraftSectionChanges(limit?: number, offset?: number): Promise<Array<DocDraftSectionChanges>>;

	/**
	 * Finds section changes for a specific draft.
	 * @param draftId the draft ID.
	 */
	findByDraftId(draftId: number): Promise<Array<DocDraftSectionChanges>>;

	/**
	 * Updates section changes.
	 * @param id the section changes ID.
	 * @param updates partial updates to apply.
	 */
	updateDocDraftSectionChanges(
		id: number,
		updates: Partial<
			Pick<DocDraftSectionChanges, "changeType" | "path" | "content" | "proposed" | "comments" | "applied">
		>,
	): Promise<DocDraftSectionChanges | undefined>;

	/**
	 * Adds a comment to section changes.
	 * @param id the section changes ID.
	 * @param comment the comment to add.
	 */
	addComment(id: number, comment: DocDraftSectionComment): Promise<DocDraftSectionChanges | undefined>;

	/**
	 * Adds a proposed change to section changes.
	 * @param id the section changes ID.
	 * @param change the proposed change to add.
	 */
	addProposedChange(id: number, change: DocDraftSectionChange): Promise<DocDraftSectionChanges | undefined>;

	/**
	 * Dismisses a section change.
	 * @param id the section changes ID.
	 * @param userId the ID of the user dismissing the change.
	 */
	dismissDocDraftSectionChange(id: number, userId: number): Promise<DocDraftSectionChanges | undefined>;

	/**
	 * Deletes section changes.
	 * @param id the section changes ID.
	 */
	deleteDocDraftSectionChanges(id: number): Promise<boolean>;

	/**
	 * Deletes all section changes for a specific draft.
	 * @param draftId the draft ID.
	 */
	deleteByDraftId(draftId: number): Promise<number>;

	/**
	 * Deletes all section changes (for testing).
	 */
	deleteAllDocDraftSectionChanges(): Promise<void>;
}

export function createDocDraftSectionChangesDao(sequelize: Sequelize): DocDraftSectionChangesDao {
	const DocDraftSectionChanges = defineDocDraftChanges(sequelize);
	const DocDrafts = defineDocDrafts(sequelize);

	return {
		createDocDraftSectionChanges,
		getDocDraftSectionChanges,
		listDocDraftSectionChanges,
		findByDraftId,
		updateDocDraftSectionChanges,
		addComment,
		addProposedChange,
		dismissDocDraftSectionChange,
		deleteDocDraftSectionChanges,
		deleteByDraftId,
		deleteAllDocDraftSectionChanges,
	};

	async function createDocDraftSectionChanges(changes: NewDocDraftSectionChanges): Promise<DocDraftSectionChanges> {
		// Look up the draft to validate it exists and has a docId
		const draft = await DocDrafts.findOne({ where: { id: changes.draftId } });

		if (!draft) {
			const errorMsg = `Cannot create section changes: Draft ${changes.draftId} not found`;
			log.error(errorMsg);
			throw new Error(errorMsg);
		}

		const draftData = draft.get({ plain: true }) as DocDraft;

		if (!draftData.docId) {
			const errorMsg = `Cannot create section changes: Draft ${changes.draftId} does not have a docId. Section changes can only be created for drafts editing existing articles.`;
			log.error(errorMsg);
			throw new Error(errorMsg);
		}

		// Validate that the provided docId matches the draft's docId
		if (changes.docId !== draftData.docId) {
			const errorMsg = `Cannot create section changes: Provided docId ${changes.docId} does not match draft's docId ${draftData.docId}`;
			log.error(errorMsg);
			throw new Error(errorMsg);
		}

		log.info(
			"Creating section change for draft %d (article %d), changeType: %s",
			changes.draftId,
			changes.docId,
			changes.changeType,
		);

		return await DocDraftSectionChanges.create(changes as never);
	}

	async function getDocDraftSectionChanges(id: number): Promise<DocDraftSectionChanges | undefined> {
		const changes = await DocDraftSectionChanges.findOne({ where: { id } });
		return changes ? changes.get({ plain: true }) : undefined;
	}

	async function listDocDraftSectionChanges(limit?: number, offset?: number): Promise<Array<DocDraftSectionChanges>> {
		const options: {
			order: Array<[string, string]>;
			limit?: number;
			offset?: number;
		} = {
			order: [["updatedAt", "DESC"]],
		};

		if (limit !== undefined) {
			options.limit = limit;
		}
		if (offset !== undefined) {
			options.offset = offset;
		}

		const changes = await DocDraftSectionChanges.findAll(options);
		return changes.map(change => change.get({ plain: true }));
	}

	async function findByDraftId(draftId: number): Promise<Array<DocDraftSectionChanges>> {
		const changes = await DocDraftSectionChanges.findAll({
			where: { draftId },
			order: [["updatedAt", "DESC"]],
		});
		return changes.map(change => change.get({ plain: true }));
	}

	async function updateDocDraftSectionChanges(
		id: number,
		updates: Partial<
			Pick<DocDraftSectionChanges, "changeType" | "path" | "content" | "proposed" | "comments" | "applied">
		>,
	): Promise<DocDraftSectionChanges | undefined> {
		const changes = await getDocDraftSectionChanges(id);
		if (!changes) {
			return;
		}

		await DocDraftSectionChanges.update(updates, { where: { id } });
		return getDocDraftSectionChanges(id);
	}

	async function addComment(
		id: number,
		comment: DocDraftSectionComment,
	): Promise<DocDraftSectionChanges | undefined> {
		const changes = await getDocDraftSectionChanges(id);
		if (!changes) {
			return;
		}

		const updatedComments = [...changes.comments, comment];
		await DocDraftSectionChanges.update({ comments: updatedComments }, { where: { id } });
		return getDocDraftSectionChanges(id);
	}

	async function addProposedChange(
		id: number,
		change: DocDraftSectionChange,
	): Promise<DocDraftSectionChanges | undefined> {
		const changes = await getDocDraftSectionChanges(id);
		if (!changes) {
			return;
		}

		const updatedProposed = [...changes.proposed, change];
		await DocDraftSectionChanges.update({ proposed: updatedProposed }, { where: { id } });
		return getDocDraftSectionChanges(id);
	}

	async function dismissDocDraftSectionChange(
		id: number,
		userId: number,
	): Promise<DocDraftSectionChanges | undefined> {
		const changes = await getDocDraftSectionChanges(id);
		if (!changes) {
			return;
		}

		await DocDraftSectionChanges.update(
			{
				dismissed: true,
				dismissedAt: new Date(),
				dismissedBy: userId,
			},
			{ where: { id } },
		);
		return getDocDraftSectionChanges(id);
	}

	async function deleteDocDraftSectionChanges(id: number): Promise<boolean> {
		const deleted = await DocDraftSectionChanges.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteByDraftId(draftId: number): Promise<number> {
		return await DocDraftSectionChanges.destroy({ where: { draftId } });
	}

	async function deleteAllDocDraftSectionChanges(): Promise<void> {
		await DocDraftSectionChanges.destroy({ where: {} });
	}
}

export function createDocDraftSectionChangesDaoProvider(
	defaultDao: DocDraftSectionChangesDao,
): DaoProvider<DocDraftSectionChangesDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocDraftSectionChangesDao {
			return context?.database.docDraftSectionChangesDao ?? defaultDao;
		},
	};
}
