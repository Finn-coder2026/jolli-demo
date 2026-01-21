import { type DocDraft, defineDocDrafts, type NewDocDraft } from "../model/DocDraft";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { DocDraftSectionChangesDao } from "./DocDraftSectionChangesDao";
import type { Sequelize } from "sequelize";

/**
 * Represents a draft with pending section changes metadata.
 * Note: The dates are Date objects here in the DAO layer.
 * They will be serialized to ISO strings at the API layer.
 */
export interface DocDraftWithPendingChanges {
	draft: DocDraft;
	pendingChangesCount: number;
	lastChangeUpdatedAt: Date;
}

/**
 * DocDrafts DAO
 */
export interface DocDraftDao {
	/**
	 * Creates a new DocDraft.
	 * @param draft the draft to create.
	 */
	createDocDraft(draft: NewDocDraft): Promise<DocDraft>;

	/**
	 * Gets a draft by ID.
	 * @param id the draft ID.
	 */
	getDocDraft(id: number): Promise<DocDraft | undefined>;

	/**
	 * Lists all drafts with pagination.
	 * @param limit maximum number of drafts to return.
	 * @param offset number of drafts to skip.
	 */
	listDocDrafts(limit?: number, offset?: number): Promise<Array<DocDraft>>;

	/**
	 * Lists drafts created by a specific user.
	 * @param userId the user ID.
	 * @param limit maximum number of drafts to return.
	 * @param offset number of drafts to skip.
	 */
	listDocDraftsByUser(userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>>;

	/**
	 * Finds drafts for a specific document.
	 * @param docId the document ID.
	 */
	findByDocId(docId: number): Promise<Array<DocDraft>>;

	/**
	 * Updates a draft.
	 * @param id the draft ID.
	 * @param updates partial updates to apply.
	 */
	updateDocDraft(
		id: number,
		updates: Partial<
			Pick<
				DocDraft,
				"title" | "content" | "contentType" | "contentLastEditedAt" | "contentLastEditedBy" | "contentMetadata"
			>
		>,
	): Promise<DocDraft | undefined>;

	/**
	 * Deletes a draft.
	 * @param id the draft ID.
	 */
	deleteDocDraft(id: number): Promise<boolean>;

	/**
	 * Deletes all drafts (for testing).
	 */
	deleteAllDocDrafts(): Promise<void>;

	/**
	 * Searches for drafts by title (case-insensitive).
	 * @param title the title to search for.
	 * @param userId the user ID to filter by.
	 */
	searchDocDraftsByTitle(title: string, userId: number): Promise<Array<DocDraft>>;

	/**
	 * Gets drafts that have pending section changes (unapplied and undismissed).
	 * Returns drafts with metadata about their pending changes, ordered by most recent change.
	 */
	getDraftsWithPendingChanges(): Promise<Array<DocDraftWithPendingChanges>>;

	/**
	 * Lists drafts accessible to a user based on visibility rules:
	 * - User owns the draft (createdBy = userId) OR
	 * - Draft is shared (isShared = true) OR
	 * - Draft was created by an agent (createdByAgent = true) OR
	 * - Draft has a docId (existing article edit - always visible)
	 * @param userId the user ID.
	 * @param limit maximum number of drafts to return.
	 * @param offset number of drafts to skip.
	 */
	listAccessibleDrafts(userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>>;

	/**
	 * Finds new article drafts (no docId) by exact title match (case-insensitive).
	 * Used for name conflict detection.
	 * @param title the exact title to search for.
	 */
	findDraftsByExactTitle(title: string): Promise<Array<DocDraft>>;

	/**
	 * Finds the single draft for an existing article (only one allowed per article).
	 * @param docId the document ID.
	 */
	findDraftByDocId(docId: number): Promise<DocDraft | undefined>;

	/**
	 * Marks a draft as shared.
	 * @param draftId the draft ID to share.
	 * @param sharedBy the user ID sharing the draft.
	 */
	shareDraft(draftId: number, sharedBy: number): Promise<DocDraft | undefined>;

	/**
	 * Lists drafts shared with a user (agent-created + explicitly shared, excluding user's own).
	 * @param userId the user ID.
	 * @param limit maximum number of drafts to return.
	 * @param offset number of drafts to skip.
	 */
	listSharedDrafts(userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>>;

	/**
	 * Counts new drafts owned by user that are not shared.
	 * @param userId the user ID.
	 */
	countMyNewDrafts(userId: number): Promise<number>;

	/**
	 * Counts new drafts owned by user that ARE shared.
	 * @param userId the user ID.
	 */
	countMySharedNewDrafts(userId: number): Promise<number>;

	/**
	 * Counts drafts shared with user (agent-created + explicitly shared, excluding user's own new drafts).
	 * @param userId the user ID.
	 */
	countSharedWithMeDrafts(userId: number): Promise<number>;

	/**
	 * Counts articles (docs) that have drafts with pending agent suggestions.
	 */
	countArticlesWithAgentSuggestions(): Promise<number>;
}

export function createDocDraftDao(
	sequelize: Sequelize,
	docDraftSectionChangesDao: DocDraftSectionChangesDao,
): DocDraftDao {
	const DocDrafts = defineDocDrafts(sequelize);

	return {
		createDocDraft,
		getDocDraft,
		listDocDrafts,
		listDocDraftsByUser,
		findByDocId,
		updateDocDraft,
		deleteDocDraft,
		deleteAllDocDrafts,
		searchDocDraftsByTitle,
		getDraftsWithPendingChanges,
		listAccessibleDrafts,
		findDraftsByExactTitle,
		findDraftByDocId,
		shareDraft,
		listSharedDrafts,
		countMyNewDrafts,
		countMySharedNewDrafts,
		countSharedWithMeDrafts,
		countArticlesWithAgentSuggestions,
	};

	async function createDocDraft(draft: NewDocDraft): Promise<DocDraft> {
		return await DocDrafts.create(draft as never);
	}

	async function getDocDraft(id: number): Promise<DocDraft | undefined> {
		const draft = await DocDrafts.findOne({ where: { id } });
		return draft ? draft.get({ plain: true }) : undefined;
	}

	async function listDocDrafts(limit?: number, offset?: number): Promise<Array<DocDraft>> {
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

		const drafts = await DocDrafts.findAll(options);
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function listDocDraftsByUser(userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>> {
		const options: {
			where: { createdBy: number };
			order: Array<[string, string]>;
			limit?: number;
			offset?: number;
		} = {
			where: { createdBy: userId },
			order: [["updatedAt", "DESC"]],
		};

		if (limit !== undefined) {
			options.limit = limit;
		}
		if (offset !== undefined) {
			options.offset = offset;
		}

		const drafts = await DocDrafts.findAll(options);
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function findByDocId(docId: number): Promise<Array<DocDraft>> {
		const drafts = await DocDrafts.findAll({
			where: { docId },
			order: [["updatedAt", "DESC"]],
		});
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function updateDocDraft(
		id: number,
		updates: Partial<
			Pick<
				DocDraft,
				"title" | "content" | "contentType" | "contentLastEditedAt" | "contentLastEditedBy" | "contentMetadata"
			>
		>,
	): Promise<DocDraft | undefined> {
		const draft = await getDocDraft(id);
		if (!draft) {
			return;
		}

		await DocDrafts.update(updates, { where: { id } });
		return getDocDraft(id);
	}

	async function deleteDocDraft(id: number): Promise<boolean> {
		// Delete associated section changes first to avoid foreign key constraint violations
		// Note: The database also has CASCADE, but we do this explicitly for clarity and testability
		await docDraftSectionChangesDao.deleteByDraftId(id);

		const deleted = await DocDrafts.destroy({ where: { id } });
		return deleted > 0;
	}

	async function deleteAllDocDrafts(): Promise<void> {
		await DocDrafts.destroy({ where: {} });
	}

	async function searchDocDraftsByTitle(title: string, userId: number): Promise<Array<DocDraft>> {
		const { Op } = await import("sequelize");
		const drafts = await DocDrafts.findAll({
			where: {
				createdBy: userId,
				title: {
					[Op.iLike]: `%${title}%`,
				},
			},
			order: [["updatedAt", "DESC"]],
		});
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function getDraftsWithPendingChanges(): Promise<Array<DocDraftWithPendingChanges>> {
		const { QueryTypes } = await import("sequelize");

		// Query to get drafts with pending section changes
		// Joins doc_drafts -> doc_draft_section_changes
		// Filters for changes where applied=false and dismissed=false
		// Groups by draft to get count and most recent change timestamp
		const results = await sequelize.query<{
			id: number;
			doc_id: number | undefined;
			title: string;
			content: string;
			content_type: string;
			created_by: number;
			createdAt: Date;
			updatedAt: Date;
			content_last_edited_at: Date | null;
			content_last_edited_by: number | null;
			content_metadata: unknown | undefined;
			is_shared: boolean;
			shared_at: Date | null;
			shared_by: number | null;
			created_by_agent: boolean;
			pendingChangesCount: string;
			lastChangeUpdatedAt: Date;
		}>(
			`
			SELECT
				dd.*,
				COUNT(ddsc.id)::text as "pendingChangesCount",
				MAX(ddsc.updated_at) as "lastChangeUpdatedAt"
			FROM doc_drafts dd
			INNER JOIN doc_draft_section_changes ddsc ON dd.id = ddsc.draft_id
			WHERE ddsc.applied = false AND ddsc.dismissed = false
			GROUP BY dd.id
			ORDER BY MAX(ddsc.updated_at) DESC
			`,
			{ type: QueryTypes.SELECT },
		);

		return results.map(row => ({
			draft: {
				id: row.id,
				docId: row.doc_id,
				title: row.title,
				content: row.content,
				contentType: row.content_type,
				createdBy: row.created_by,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
				contentLastEditedAt: row.content_last_edited_at,
				contentLastEditedBy: row.content_last_edited_by,
				contentMetadata: row.content_metadata,
				isShared: row.is_shared,
				sharedAt: row.shared_at,
				sharedBy: row.shared_by,
				createdByAgent: row.created_by_agent,
			},
			pendingChangesCount: Number.parseInt(row.pendingChangesCount, 10),
			lastChangeUpdatedAt: row.lastChangeUpdatedAt,
		}));
	}

	async function listAccessibleDrafts(userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>> {
		const { Op } = await import("sequelize");

		const where = {
			[Op.or]: [
				{ createdBy: userId }, // User owns it
				{ isShared: true }, // Draft is shared
				{ createdByAgent: true }, // Created by agent
				{ docId: { [Op.ne]: null } }, // Existing article edit (has docId)
			],
		};

		const options: Parameters<typeof DocDrafts.findAll>[0] = {
			where: where as never,
			order: [["updatedAt", "DESC"]],
		};

		if (limit !== undefined) {
			options.limit = limit;
		}
		if (offset !== undefined) {
			options.offset = offset;
		}

		const drafts = await DocDrafts.findAll(options);
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function findDraftsByExactTitle(title: string): Promise<Array<DocDraft>> {
		const { Op, literal } = await import("sequelize");
		// Only search new article drafts (no docId)
		const drafts = await DocDrafts.findAll({
			where: {
				docId: literal('"doc_draft".doc_id IS NULL'),
				title: {
					[Op.iLike]: title, // Exact match, case-insensitive
				},
			},
			order: [["updatedAt", "DESC"]],
		});
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function findDraftByDocId(docId: number): Promise<DocDraft | undefined> {
		// Return the first draft for this docId (only one should exist)
		const draft = await DocDrafts.findOne({
			where: { docId },
			order: [["updatedAt", "DESC"]],
		});
		return draft ? draft.get({ plain: true }) : undefined;
	}

	async function shareDraft(draftId: number, sharedBy: number): Promise<DocDraft | undefined> {
		const draft = await getDocDraft(draftId);
		if (!draft) {
			return;
		}

		await DocDrafts.update(
			{
				isShared: true,
				sharedAt: new Date(),
				sharedBy,
			},
			{ where: { id: draftId } },
		);

		return getDocDraft(draftId);
	}

	async function listSharedDrafts(userId: number, limit?: number, offset?: number): Promise<Array<DocDraft>> {
		const { Op, literal } = await import("sequelize");

		// Get new drafts (no docId) that are shared or agent-created, excluding user's own
		const where = {
			[Op.and]: [
				literal('"doc_draft".doc_id IS NULL'), // Only new drafts
				{ createdBy: { [Op.ne]: userId } }, // Not user's own
				{
					[Op.or]: [{ isShared: true }, { createdByAgent: true }],
				},
			],
		};

		const options: Parameters<typeof DocDrafts.findAll>[0] = {
			where: where as never,
			order: [["updatedAt", "DESC"]],
		};

		if (limit !== undefined) {
			options.limit = limit;
		}
		if (offset !== undefined) {
			options.offset = offset;
		}

		const drafts = await DocDrafts.findAll(options);
		return drafts.map(draft => draft.get({ plain: true }));
	}

	async function countMyNewDrafts(userId: number): Promise<number> {
		const { literal } = await import("sequelize");
		// Count new drafts (no docId) owned by user that are not shared
		return DocDrafts.count({
			where: {
				createdBy: userId,
				docId: literal('"doc_draft".doc_id IS NULL'),
				isShared: false,
			},
		});
	}

	async function countMySharedNewDrafts(userId: number): Promise<number> {
		const { literal } = await import("sequelize");
		// Count new drafts (no docId) owned by user that ARE shared
		return DocDrafts.count({
			where: {
				createdBy: userId,
				docId: literal('"doc_draft".doc_id IS NULL'),
				isShared: true,
			},
		});
	}

	async function countSharedWithMeDrafts(userId: number): Promise<number> {
		const { Op, literal } = await import("sequelize");
		// Count new drafts shared with user (not their own)
		return DocDrafts.count({
			where: {
				[Op.and]: [
					literal('"doc_draft".doc_id IS NULL'), // Only new drafts
					{ createdBy: { [Op.ne]: userId } }, // Not user's own
					{
						[Op.or]: [{ isShared: true }, { createdByAgent: true }],
					},
				],
			},
		});
	}

	async function countArticlesWithAgentSuggestions(): Promise<number> {
		const { QueryTypes } = await import("sequelize");
		// Count distinct docs (articles) that have drafts editing them
		const result = await sequelize.query<{ count: string }>(
			`
			SELECT COUNT(DISTINCT doc_id)::text as count
			FROM doc_drafts
			WHERE doc_id IS NOT NULL
			`,
			{ type: QueryTypes.SELECT },
		);
		return result.length > 0 ? Number.parseInt(result[0].count, 10) : 0;
	}
}

export function createDocDraftDaoProvider(defaultDao: DocDraftDao): DaoProvider<DocDraftDao> {
	return {
		getDao(context: TenantOrgContext | undefined): DocDraftDao {
			return context?.database.docDraftDao ?? defaultDao;
		},
	};
}
