import type { DaoPostSyncHook } from "../core/Database";
import { defineSyncArticles, type SyncArticle } from "../model/SyncArticle";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * SyncArticle DAO for tracking sync cursor positions.
 * Phase 1: Just model definition and postSync hook for sequence creation.
 */
export interface SyncArticleDao {
	/** Get sync metadata for a doc */
	getSyncArticle(docJrn: string): Promise<SyncArticle | undefined>;

	/** Create or update sync metadata, advancing cursor */
	upsertSyncArticle(docJrn: string): Promise<SyncArticle>;

	/** Get all sync articles with cursor > sinceCursor */
	getSyncArticlesSince(sinceCursor: number): Promise<Array<SyncArticle>>;

	/** Get current max cursor value */
	getCurrentCursor(): Promise<number>;

	/** Advance cursor for a doc (used on web edit) */
	advanceCursor(docJrn: string): Promise<number>;

	/** Delete all sync articles (for dev tools data clearer) */
	deleteAllSyncArticles(): Promise<void>;
}

export function createSyncArticleDao(sequelize: Sequelize): SyncArticleDao & DaoPostSyncHook {
	const SyncArticles = defineSyncArticles(sequelize);

	return {
		postSync,
		getSyncArticle,
		upsertSyncArticle,
		getSyncArticlesSince,
		getCurrentCursor,
		advanceCursor,
		deleteAllSyncArticles,
	};

	/**
	 * Post-sync hook to create the cursor sequence and index.
	 */
	async function postSync(): Promise<void> {
		log.info("Creating sync_articles_cursor_seq sequence if not exists");
		await sequelize.query(`
			CREATE SEQUENCE IF NOT EXISTS sync_articles_cursor_seq;
		`);

		log.info("Creating sync_articles_last_seq_idx index if not exists");
		await sequelize.query(`
			CREATE INDEX IF NOT EXISTS sync_articles_last_seq_idx
			ON sync_articles(last_seq);
		`);
	}

	async function getSyncArticle(docJrn: string): Promise<SyncArticle | undefined> {
		const row = await SyncArticles.findByPk(docJrn);
		return row ? row.get({ plain: true }) : undefined;
	}

	async function upsertSyncArticle(docJrn: string): Promise<SyncArticle> {
		const [[result]] = (await sequelize.query(
			`INSERT INTO sync_articles (doc_jrn, last_seq)
			 VALUES (:docJrn, nextval('sync_articles_cursor_seq'))
			 ON CONFLICT (doc_jrn)
			 DO UPDATE SET last_seq = nextval('sync_articles_cursor_seq')
			 RETURNING last_seq`,
			{ replacements: { docJrn } },
		)) as [[{ last_seq: string }], unknown];
		return { docJrn, lastSeq: Number(result.last_seq) };
	}

	async function getSyncArticlesSince(sinceCursor: number): Promise<Array<SyncArticle>> {
		const rows = await SyncArticles.findAll({
			where: sequelize.literal(`last_seq > ${sinceCursor}`),
			order: [["lastSeq", "ASC"]],
		});
		return rows.map(r => r.get({ plain: true }));
	}

	async function getCurrentCursor(): Promise<number> {
		const [[result]] = (await sequelize.query(`SELECT last_value FROM sync_articles_cursor_seq`)) as [
			[{ last_value: string }] | [],
			unknown,
		];
		return Number(result?.last_value ?? 0);
	}

	async function advanceCursor(docJrn: string): Promise<number> {
		const syncArticle = await upsertSyncArticle(docJrn);
		return syncArticle.lastSeq;
	}

	async function deleteAllSyncArticles(): Promise<void> {
		await SyncArticles.destroy({ where: {} });
		// Reset the sequence to start fresh
		await sequelize.query(`ALTER SEQUENCE IF EXISTS sync_articles_cursor_seq RESTART WITH 1`);
		log.info("Deleted all sync articles and reset cursor sequence");
	}
}

export function createSyncArticleDaoProvider(defaultDao: SyncArticleDao): DaoProvider<SyncArticleDao> {
	return {
		getDao(context: TenantOrgContext | undefined): SyncArticleDao {
			return context?.database.syncArticleDao ?? defaultDao;
		},
	};
}
