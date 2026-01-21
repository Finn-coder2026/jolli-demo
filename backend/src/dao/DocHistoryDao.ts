import { type DocHistory, type DocHistorySummary, defineDocHistories, type NewDocHistory } from "../model/DocHistory";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize, Transaction } from "sequelize";

/**
 * Options for paginated doc history queries.
 */
export interface DocHistoryPaginationOptions {
	/** Document ID (required) */
	docId: number;
	/** User ID (optional filter) */
	userId?: number;
	/** Page number (1-based, default: 1) */
	page?: number;
	/** Number of items per page (default: 20) */
	pageSize?: number;
}

/**
 * Paginated result for doc history queries.
 */
export interface DocHistoryPaginatedResult {
	/** List of doc history summaries (without docSnapshot) */
	items: Array<DocHistorySummary>;
	/** Total count of matching records */
	total: number;
	/** Current page number (1-based) */
	page: number;
	/** Number of items per page */
	pageSize: number;
	/** Total number of pages */
	totalPages: number;
}

/**
 * DocHistory DAO for managing document version snapshots.
 */
export interface DocHistoryDao {
	/**
	 * Creates a new DocHistory record.
	 * @param history the history record to create.
	 * @param transaction optional transaction to use for the create.
	 */
	createDocHistory(history: NewDocHistory, transaction?: Transaction): Promise<DocHistory>;

	/**
	 * Gets a DocHistory record by ID.
	 * @param id the history record ID.
	 */
	getDocHistory(id: number): Promise<DocHistory | undefined>;

	/**
	 * Gets a specific version of a document's history.
	 * @param docId the document ID.
	 * @param version the version number.
	 */
	getDocHistoryByVersion(docId: number, version: number): Promise<DocHistory | undefined>;

	/**
	 * Lists all history records for a document, ordered by version descending.
	 * @param docId the document ID.
	 */
	listDocHistoryByDocId(docId: number): Promise<Array<DocHistory>>;

	/**
	 * Gets the latest history record for a document.
	 * @param docId the document ID.
	 */
	getLatestDocHistory(docId: number): Promise<DocHistory | undefined>;

	/**
	 * Updates a DocHistory record.
	 * @param id the history record ID.
	 * @param updates partial updates to apply.
	 */
	updateDocHistory(
		id: number,
		updates: Partial<Pick<DocHistory, "docSnapshot" | "version">>,
	): Promise<DocHistory | undefined>;

	/**
	 * Deletes a DocHistory record.
	 * @param id the history record ID.
	 */
	deleteDocHistory(id: number): Promise<boolean>;

	/**
	 * Deletes all history records for a document.
	 * @param docId the document ID.
	 */
	deleteDocHistoryByDocId(docId: number): Promise<number>;

	/**
	 * Deletes all DocHistory records (for testing).
	 */
	deleteAllDocHistories(): Promise<void>;

	/**
	 * Lists doc history records with pagination, excluding docSnapshot field.
	 * @param options pagination options including docId, optional userId, page, and pageSize.
	 */
	listDocHistoryPaginated(options: DocHistoryPaginationOptions): Promise<DocHistoryPaginatedResult>;
}

export function createDocHistoryDao(sequelize: Sequelize): DocHistoryDao {
	const DocHistories = defineDocHistories(sequelize);

	return {
		createDocHistory,
		getDocHistory,
		getDocHistoryByVersion,
		listDocHistoryByDocId,
		getLatestDocHistory,
		updateDocHistory,
		deleteDocHistory,
		deleteDocHistoryByDocId,
		deleteAllDocHistories,
		listDocHistoryPaginated,
	};

	async function createDocHistory(history: NewDocHistory, transaction?: Transaction): Promise<DocHistory> {
		return await DocHistories.create(history as never, { transaction: transaction ?? null });
	}

	async function getDocHistory(id: number): Promise<DocHistory | undefined> {
		const history = await DocHistories.findOne({ where: { id } });
		return history ? history.get({ plain: true }) : undefined;
	}

	async function getDocHistoryByVersion(docId: number, version: number): Promise<DocHistory | undefined> {
		const history = await DocHistories.findOne({ where: { docId, version } });
		return history ? history.get({ plain: true }) : undefined;
	}

	async function listDocHistoryByDocId(docId: number): Promise<Array<DocHistory>> {
		const histories = await DocHistories.findAll({
			where: { docId },
			order: [["version", "DESC"]],
		});
		return histories.map(h => h.get({ plain: true }));
	}

	async function getLatestDocHistory(docId: number): Promise<DocHistory | undefined> {
		const history = await DocHistories.findOne({
			where: { docId },
			order: [["version", "DESC"]],
		});
		return history ? history.get({ plain: true }) : undefined;
	}

	async function updateDocHistory(
		id: number,
		updates: Partial<Pick<DocHistory, "docSnapshot" | "version">>,
	): Promise<DocHistory | undefined> {
		const history = await getDocHistory(id);
		if (!history) {
			return;
		}

		await DocHistories.update(updates, { where: { id } });
		return getDocHistory(id);
	}

	async function deleteDocHistory(id: number): Promise<boolean> {
		const deleted = await DocHistories.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteDocHistoryByDocId(docId: number): Promise<number> {
		return await DocHistories.destroy({ where: { docId } });
	}

	async function deleteAllDocHistories(): Promise<void> {
		await DocHistories.destroy({ where: {} });
	}

	async function listDocHistoryPaginated(options: DocHistoryPaginationOptions): Promise<DocHistoryPaginatedResult> {
		const { docId, userId, page = 1, pageSize = 20 } = options;

		// Build where clause
		const where: Record<string, unknown> = { docId };
		if (userId !== undefined) {
			where.userId = userId;
		}

		// Calculate offset
		const offset = (page - 1) * pageSize;

		// Query with count and pagination, excluding docSnapshot
		const { count, rows } = await DocHistories.findAndCountAll({
			where,
			attributes: ["id", "docId", "userId", "version", "createdAt"],
			order: [["version", "DESC"]],
			limit: pageSize,
			offset,
		});

		const items = rows.map(row => {
			const plain = row.get({ plain: true });
			// Ensure docSnapshot is not included
			const { docSnapshot: _, ...summary } = plain as DocHistory;
			return summary;
		});

		return {
			items,
			total: count,
			page,
			pageSize,
			totalPages: Math.ceil(count / pageSize),
		};
	}
}

export function createDocHistoryDaoProvider(defaultDao: DocHistoryDao): DaoProvider<DocHistoryDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocHistoryDao {
			return context?.database.docHistoryDao ?? defaultDao;
		},
	};
}
