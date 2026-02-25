import type { DaoPostSyncHook, Database } from "../core/Database";
import { defineSyncCommits, type SyncCommit, type SyncCommitStatus } from "../model/SyncCommit";
import { defineSyncCommitFiles, type SyncCommitFile } from "../model/SyncCommitFile";
import {
	defineSyncCommitFileReviews,
	type NewSyncCommitFileReview,
	type SyncCommitFileDecision,
	type SyncCommitFileReview,
} from "../model/SyncCommitFileReview";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import type { DaoProvider } from "./DaoProvider";
import type { SyncChangesetSummary } from "jolli-common";
import { Op, QueryTypes, type Sequelize, type Transaction } from "sequelize";

export interface CreateProposedCommitInput {
	readonly seq: number;
	readonly message?: string;
	readonly mergePrompt?: string;
	readonly pushedBy?: string;
	readonly clientChangesetId: string;
	readonly commitScopeKey: string;
	readonly targetBranch: "main";
	readonly payloadHash: string;
	readonly files: Array<NewSyncCommitFileInput>;
}

export interface NewSyncCommitFileInput {
	readonly fileId: string;
	readonly docJrn: string;
	readonly serverPath: string;
	readonly baseContent: string;
	readonly baseVersion: number;
	readonly incomingContent?: string;
	readonly incomingContentHash?: string;
	readonly lineAdditions?: number;
	readonly lineDeletions?: number;
	readonly opType: "upsert" | "delete";
}

export type SyncCommitSummary = SyncChangesetSummary;

export interface SyncCommitDao {
	createProposedCommit(
		input: CreateProposedCommitInput,
	): Promise<{ commit: SyncCommit; files: Array<SyncCommitFile> }>;
	findCommitByScopeAndClientChangesetId(
		commitScopeKey: string,
		clientChangesetId: string,
	): Promise<SyncCommit | undefined>;
	listCommitsByScope(
		commitScopeKey: string,
		options?: {
			limit?: number;
			beforeId?: number;
		},
	): Promise<Array<SyncCommit>>;
	listCommitSummaries(commitIds: Array<number>): Promise<Map<number, SyncCommitSummary>>;
	getCommit(id: number): Promise<SyncCommit | undefined>;
	getCommitFiles(commitId: number): Promise<Array<SyncCommitFile>>;
	getCommitFile(commitId: number, commitFileId: number): Promise<SyncCommitFile | undefined>;
	createFileReview(input: NewSyncCommitFileReview): Promise<SyncCommitFileReview>;
	getLatestReviewsForCommit(commitId: number): Promise<Map<number, SyncCommitFileReview>>;
	getLatestReviewForFile(commitFileId: number): Promise<SyncCommitFileReview | undefined>;
	updateCommit(
		id: number,
		update: Partial<{
			status: SyncCommitStatus;
			publishedAt: Date;
			publishedBy: string;
		}>,
		transaction?: Transaction,
		options?: {
			expectedCurrentStatuses?: Array<SyncCommitStatus>;
		},
	): Promise<SyncCommit | undefined>;
}

const log = getLog(import.meta);

export function createSyncCommitDao(sequelize: Sequelize): SyncCommitDao & DaoPostSyncHook {
	const SyncCommits = defineSyncCommits(sequelize);
	const SyncCommitFiles = defineSyncCommitFiles(sequelize);
	const SyncCommitFileReviews = defineSyncCommitFileReviews(sequelize);

	return {
		postSync,
		createProposedCommit,
		findCommitByScopeAndClientChangesetId,
		listCommitsByScope,
		listCommitSummaries,
		getCommit,
		getCommitFiles,
		getCommitFile,
		createFileReview,
		getLatestReviewsForCommit,
		getLatestReviewForFile,
		updateCommit,
	};

	async function postSync(_sequelize: Sequelize, _db: Database): Promise<void> {
		await ensureSyncCommitsTable();
		await ensureSyncCommitFilesTable();
		await ensureSyncCommitFileReviewsTable();
	}

	async function ensureSyncCommitsTable(): Promise<void> {
		try {
			await sequelize.query(`
				CREATE TABLE IF NOT EXISTS sync_commits (
					id SERIAL PRIMARY KEY,
					seq BIGINT NOT NULL DEFAULT 0,
					message TEXT,
					merge_prompt TEXT,
					pushed_by TEXT,
					client_changeset_id TEXT,
					status TEXT NOT NULL DEFAULT 'proposed',
					commit_scope_key TEXT,
					target_branch TEXT NOT NULL DEFAULT 'main',
					payload_hash TEXT,
					published_at TIMESTAMP,
					published_by TEXT,
					created_at TIMESTAMP NOT NULL DEFAULT NOW()
				);
			`);

			// Migration: add columns that may not exist in older schemas
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS client_changeset_id TEXT`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS status TEXT`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS commit_scope_key TEXT`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS target_branch TEXT`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS payload_hash TEXT`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS merge_prompt TEXT`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS published_at TIMESTAMP`);
			await sequelize.query(`ALTER TABLE sync_commits ADD COLUMN IF NOT EXISTS published_by TEXT`);

			await sequelize.query(`UPDATE sync_commits SET status = 'proposed' WHERE status IS NULL`);
			await sequelize.query(`UPDATE sync_commits SET target_branch = 'main' WHERE target_branch IS NULL`);

			await sequelize.query(`
				CREATE UNIQUE INDEX IF NOT EXISTS sync_commits_scope_client_changeset_key
				ON sync_commits (commit_scope_key, client_changeset_id);
			`);
			await sequelize.query(`CREATE INDEX IF NOT EXISTS sync_commits_seq_idx ON sync_commits (seq)`);
		} catch (error) {
			log.error(error, "Failed to ensure sync_commits table (may be concurrent startup)");
		}
	}

	async function ensureSyncCommitFilesTable(): Promise<void> {
		try {
			await sequelize.query(`
				CREATE TABLE IF NOT EXISTS sync_commit_files (
					id SERIAL PRIMARY KEY,
					commit_id INTEGER NOT NULL REFERENCES sync_commits(id) ON DELETE CASCADE,
					file_id TEXT,
					doc_jrn TEXT NOT NULL,
					server_path TEXT,
					base_content TEXT NOT NULL DEFAULT '',
					base_version INTEGER NOT NULL DEFAULT 0,
					incoming_content TEXT,
					incoming_content_hash TEXT,
					line_additions INTEGER NOT NULL DEFAULT 0,
					line_deletions INTEGER NOT NULL DEFAULT 0,
					op_type TEXT NOT NULL DEFAULT 'upsert',
					created_at TIMESTAMP NOT NULL DEFAULT NOW()
				);
			`);

			// Migration: add columns that may not exist in older schemas
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS file_id TEXT`);
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS server_path TEXT`);
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS incoming_content TEXT`);
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS incoming_content_hash TEXT`);
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS line_additions INTEGER`);
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS line_deletions INTEGER`);
			await sequelize.query(`ALTER TABLE sync_commit_files ADD COLUMN IF NOT EXISTS created_at TIMESTAMP`);

			await sequelize.query(`UPDATE sync_commit_files SET file_id = doc_jrn WHERE file_id IS NULL`);
			await sequelize.query(`UPDATE sync_commit_files SET server_path = doc_jrn WHERE server_path IS NULL`);
			await sequelize.query(`UPDATE sync_commit_files SET line_additions = 0 WHERE line_additions IS NULL`);
			await sequelize.query(`UPDATE sync_commit_files SET line_deletions = 0 WHERE line_deletions IS NULL`);
			await sequelize.query(`ALTER TABLE sync_commit_files ALTER COLUMN line_additions SET DEFAULT 0`);
			await sequelize.query(`ALTER TABLE sync_commit_files ALTER COLUMN line_deletions SET DEFAULT 0`);
			await sequelize.query(`ALTER TABLE sync_commit_files ALTER COLUMN line_additions SET NOT NULL`);
			await sequelize.query(`ALTER TABLE sync_commit_files ALTER COLUMN line_deletions SET NOT NULL`);
			await sequelize.query(`UPDATE sync_commit_files SET created_at = NOW() WHERE created_at IS NULL`);

			await sequelize.query(`
				CREATE UNIQUE INDEX IF NOT EXISTS sync_commit_files_commit_file_key
				ON sync_commit_files (commit_id, file_id);
			`);
			await sequelize.query(
				`CREATE INDEX IF NOT EXISTS sync_commit_files_commit_idx ON sync_commit_files (commit_id)`,
			);
			await sequelize.query(
				`CREATE INDEX IF NOT EXISTS sync_commit_files_doc_jrn_idx ON sync_commit_files (doc_jrn)`,
			);
		} catch (error) {
			log.error(error, "Failed to ensure sync_commit_files table (may be concurrent startup)");
		}
	}

	async function ensureSyncCommitFileReviewsTable(): Promise<void> {
		try {
			await sequelize.query(`
				CREATE TABLE IF NOT EXISTS sync_commit_file_reviews (
					id SERIAL PRIMARY KEY,
					commit_file_id INTEGER NOT NULL REFERENCES sync_commit_files(id) ON DELETE CASCADE,
					decision TEXT NOT NULL,
					amended_content TEXT,
					reviewed_by TEXT,
					reviewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
					comment TEXT
				);
			`);
			await sequelize.query(`
				CREATE INDEX IF NOT EXISTS sync_commit_file_reviews_commit_file_idx
				ON sync_commit_file_reviews (commit_file_id, reviewed_at DESC);
			`);
		} catch (error) {
			log.error(error, "Failed to ensure sync_commit_file_reviews table (may be concurrent startup)");
		}
	}

	function createProposedCommit(
		input: CreateProposedCommitInput,
	): Promise<{ commit: SyncCommit; files: Array<SyncCommitFile> }> {
		return sequelize.transaction(async transaction => {
			const commitRow = await SyncCommits.create(
				{
					seq: input.seq,
					message: input.message,
					mergePrompt: input.mergePrompt,
					pushedBy: input.pushedBy,
					clientChangesetId: input.clientChangesetId,
					status: "proposed",
					commitScopeKey: input.commitScopeKey,
					targetBranch: input.targetBranch,
					payloadHash: input.payloadHash,
				} as never,
				{ transaction },
			);

			const commit = commitRow.get({ plain: true }) as SyncCommit;
			const files: Array<SyncCommitFile> = [];
			for (const file of input.files) {
				const row = await SyncCommitFiles.create(
					{
						commitId: commit.id,
						fileId: file.fileId,
						docJrn: file.docJrn,
						serverPath: file.serverPath,
						baseContent: file.baseContent,
						baseVersion: file.baseVersion,
						incomingContent: file.incomingContent,
						incomingContentHash: file.incomingContentHash,
						lineAdditions: file.lineAdditions ?? 0,
						lineDeletions: file.lineDeletions ?? 0,
						opType: file.opType,
					} as never,
					{ transaction },
				);
				files.push(row.get({ plain: true }) as SyncCommitFile);
			}

			return { commit, files };
		});
	}

	async function findCommitByScopeAndClientChangesetId(
		commitScopeKey: string,
		clientChangesetId: string,
	): Promise<SyncCommit | undefined> {
		const row = await SyncCommits.findOne({
			where: {
				commitScopeKey,
				clientChangesetId,
			},
		});
		return row ? (row.get({ plain: true }) as SyncCommit) : undefined;
	}

	async function getCommit(id: number): Promise<SyncCommit | undefined> {
		const row = await SyncCommits.findByPk(id);
		return row ? (row.get({ plain: true }) as SyncCommit) : undefined;
	}

	async function listCommitsByScope(
		commitScopeKey: string,
		options?: {
			limit?: number;
			beforeId?: number;
		},
	): Promise<Array<SyncCommit>> {
		const where: {
			commitScopeKey: string;
			id?: { [Op.lt]: number };
		} = { commitScopeKey };
		if (options?.beforeId !== undefined) {
			where.id = { [Op.lt]: options.beforeId };
		}
		const rows = await SyncCommits.findAll({
			where,
			order: [
				["createdAt", "DESC"],
				["id", "DESC"],
			],
			...(options?.limit !== undefined ? { limit: options.limit } : {}),
		});
		return rows.map(row => row.get({ plain: true }) as SyncCommit);
	}

	async function listCommitSummaries(commitIds: Array<number>): Promise<Map<number, SyncCommitSummary>> {
		const summaries = new Map<number, SyncCommitSummary>();
		if (commitIds.length === 0) {
			return summaries;
		}

		const rows = (await sequelize.query(
			`
			WITH latest_reviews AS (
				SELECT DISTINCT ON (r.commit_file_id)
					r.commit_file_id,
					r.decision
				FROM sync_commit_file_reviews r
				INNER JOIN sync_commit_files f ON f.id = r.commit_file_id
				WHERE f.commit_id IN (:commitIds)
				ORDER BY r.commit_file_id, r.reviewed_at DESC, r.id DESC
			)
			SELECT
				f.commit_id,
				COUNT(*)::int AS total_files,
				COALESCE(SUM(CASE WHEN lr.decision = 'accept' THEN 1 ELSE 0 END), 0)::int AS accepted,
				COALESCE(SUM(CASE WHEN lr.decision = 'reject' THEN 1 ELSE 0 END), 0)::int AS rejected,
				COALESCE(SUM(CASE WHEN lr.decision = 'amend' THEN 1 ELSE 0 END), 0)::int AS amended,
				COALESCE(SUM(CASE WHEN lr.decision IS NULL THEN 1 ELSE 0 END), 0)::int AS pending,
				COALESCE(SUM(COALESCE(f.line_additions, 0)), 0)::int AS additions,
				COALESCE(SUM(COALESCE(f.line_deletions, 0)), 0)::int AS deletions
			FROM sync_commit_files f
			LEFT JOIN latest_reviews lr ON lr.commit_file_id = f.id
			WHERE f.commit_id IN (:commitIds)
			GROUP BY f.commit_id
			`,
			{
				replacements: { commitIds },
				type: QueryTypes.SELECT,
			},
		)) as Array<{
			commit_id: number;
			total_files: number;
			accepted: number;
			rejected: number;
			amended: number;
			pending: number;
			additions: number;
			deletions: number;
		}>;

		for (const row of rows) {
			summaries.set(row.commit_id, {
				totalFiles: row.total_files,
				accepted: row.accepted,
				rejected: row.rejected,
				amended: row.amended,
				pending: row.pending,
				additions: row.additions,
				deletions: row.deletions,
			});
		}
		return summaries;
	}

	async function getCommitFiles(commitId: number): Promise<Array<SyncCommitFile>> {
		const rows = await SyncCommitFiles.findAll({
			where: { commitId },
			order: [["id", "ASC"]],
		});
		return rows.map(row => row.get({ plain: true }) as SyncCommitFile);
	}

	async function getCommitFile(commitId: number, commitFileId: number): Promise<SyncCommitFile | undefined> {
		const row = await SyncCommitFiles.findOne({
			where: {
				id: commitFileId,
				commitId,
			},
		});
		return row ? (row.get({ plain: true }) as SyncCommitFile) : undefined;
	}

	async function createFileReview(input: NewSyncCommitFileReview): Promise<SyncCommitFileReview> {
		validateDecision(input.decision);
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize create typing is stricter than our plain interface.
		const row = await SyncCommitFileReviews.create(input as any);
		return row.get({ plain: true }) as SyncCommitFileReview;
	}

	async function getLatestReviewsForCommit(commitId: number): Promise<Map<number, SyncCommitFileReview>> {
		const rows = (await sequelize.query(
			`
			SELECT DISTINCT ON (r.commit_file_id)
				r.id,
				r.commit_file_id,
				r.decision,
				r.amended_content,
				r.reviewed_by,
				r.reviewed_at,
				r.comment
			FROM sync_commit_file_reviews r
			INNER JOIN sync_commit_files f ON f.id = r.commit_file_id
			WHERE f.commit_id = :commitId
			ORDER BY r.commit_file_id, r.reviewed_at DESC, r.id DESC
			`,
			{
				replacements: { commitId },
				type: QueryTypes.SELECT,
			},
		)) as Array<{
			id: number;
			commit_file_id: number;
			decision: SyncCommitFileDecision;
			amended_content?: string;
			reviewed_by?: string;
			reviewed_at: Date;
			comment?: string;
		}>;

		const reviewsByCommitFileId = new Map<number, SyncCommitFileReview>();
		for (const row of rows) {
			reviewsByCommitFileId.set(row.commit_file_id, {
				id: row.id,
				commitFileId: row.commit_file_id,
				decision: row.decision,
				amendedContent: row.amended_content,
				reviewedBy: row.reviewed_by,
				reviewedAt: row.reviewed_at,
				comment: row.comment,
			});
		}
		return reviewsByCommitFileId;
	}

	async function getLatestReviewForFile(commitFileId: number): Promise<SyncCommitFileReview | undefined> {
		const row = await SyncCommitFileReviews.findOne({
			where: { commitFileId },
			order: [
				["reviewedAt", "DESC"],
				["id", "DESC"],
			],
		});
		return row ? (row.get({ plain: true }) as SyncCommitFileReview) : undefined;
	}

	async function updateCommit(
		id: number,
		update: Partial<{ status: SyncCommitStatus; publishedAt: Date; publishedBy: string }>,
		transaction?: Transaction,
		options?: {
			expectedCurrentStatuses?: Array<SyncCommitStatus>;
		},
	): Promise<SyncCommit | undefined> {
		if (Object.keys(update).length === 0) {
			return getCommit(id);
		}
		const where: {
			id: number;
			status?: Array<SyncCommitStatus>;
		} = { id };
		if (options?.expectedCurrentStatuses && options.expectedCurrentStatuses.length > 0) {
			where.status = options.expectedCurrentStatuses;
		}
		const [updatedCount] = await SyncCommits.update(update, { where, ...(transaction ? { transaction } : {}) });
		if (updatedCount === 0 && options?.expectedCurrentStatuses) {
			return;
		}
		const row = await SyncCommits.findByPk(id, transaction ? { transaction } : undefined);
		return row ? (row.get({ plain: true }) as SyncCommit) : undefined;
	}
}

function validateDecision(decision: string): asserts decision is SyncCommitFileDecision {
	if (decision !== "accept" && decision !== "reject" && decision !== "amend") {
		throw new Error(`Invalid review decision: ${decision}`);
	}
}

export function createSyncCommitDaoProvider(defaultDao: SyncCommitDao): DaoProvider<SyncCommitDao> {
	return {
		getDao(context: TenantOrgContext | undefined): SyncCommitDao {
			return context?.database.syncCommitDao ?? defaultDao;
		},
	};
}
