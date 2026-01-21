import {
	type DocDraftEditHistory,
	defineDocDraftEditHistory,
	type NewDocDraftEditHistory,
} from "../model/DocDraftEditHistory";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

/**
 * DocDraftEditHistory DAO
 */
export interface DocDraftEditHistoryDao {
	/**
	 * Creates a new edit history entry.
	 * @param entry the history entry to create.
	 */
	createEditHistory(entry: NewDocDraftEditHistory): Promise<DocDraftEditHistory>;

	/**
	 * Lists edit history entries for a draft.
	 * @param draftId the draft ID.
	 * @param limit maximum number of entries to return (default 50).
	 */
	listByDraftId(draftId: number, limit?: number): Promise<Array<DocDraftEditHistory>>;

	/**
	 * Deletes all edit history entries for a draft.
	 * @param draftId the draft ID.
	 */
	deleteByDraftId(draftId: number): Promise<void>;

	/**
	 * Deletes all edit history entries (for testing).
	 */
	deleteAll(): Promise<void>;
}

export function createDocDraftEditHistoryDao(sequelize: Sequelize): DocDraftEditHistoryDao {
	const EditHistory = defineDocDraftEditHistory(sequelize);

	return {
		createEditHistory,
		listByDraftId,
		deleteByDraftId,
		deleteAll,
	};

	async function createEditHistory(entry: NewDocDraftEditHistory): Promise<DocDraftEditHistory> {
		return await EditHistory.create(entry as never);
	}

	async function listByDraftId(draftId: number, limit = 50): Promise<Array<DocDraftEditHistory>> {
		const entries = await EditHistory.findAll({
			where: { draftId },
			order: [["editedAt", "DESC"]],
			limit,
		});
		return entries.map(entry => entry.get({ plain: true }));
	}

	async function deleteByDraftId(draftId: number): Promise<void> {
		await EditHistory.destroy({ where: { draftId } });
	}

	async function deleteAll(): Promise<void> {
		await EditHistory.destroy({ where: {} });
	}
}

export function createDocDraftEditHistoryDaoProvider(
	defaultDao: DocDraftEditHistoryDao,
): DaoProvider<DocDraftEditHistoryDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocDraftEditHistoryDao {
			return context?.database.docDraftEditHistoryDao ?? defaultDao;
		},
	};
}
