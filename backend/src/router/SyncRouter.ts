import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { integrityHashFromContent } from "../util/SyncHelpers";
import express, { type Router } from "express";

const log = getLog(import.meta);

/**
 * Push operation from CLI client.
 */
interface PushOp {
	type: "upsert" | "delete";
	fileId: string;
	serverPath: string;
	baseVersion: number;
	content?: string;
	contentHash?: string;
}

/**
 * Push request body.
 */
interface PushRequest {
	requestId?: string;
	ops: Array<PushOp>;
}

/**
 * Pull request body.
 */
interface PullRequest {
	sinceCursor?: number;
}

/**
 * Result of processing a single push operation.
 */
interface PushOpResult {
	fileId: string;
	status: string;
	newVersion?: number;
	serverVersion?: number;
}

/**
 * Process a single push operation.
 */
async function processPushOp(op: PushOp, docDao: DocDao, syncArticleDao: SyncArticleDao): Promise<PushOpResult> {
	const jrn = `jrn:/global:docs:article/sync-${op.fileId}`;
	const existing = await docDao.readDoc(jrn);
	const currentVersion = existing?.version ?? 0;

	// Conflict check
	if (op.baseVersion !== currentVersion) {
		log.info("Push conflict for %s: expected version %d, got %d", op.fileId, op.baseVersion, currentVersion);
		return { fileId: op.fileId, status: "conflict", serverVersion: currentVersion };
	}

	// Hash validation
	if (op.contentHash && op.content) {
		const computed = integrityHashFromContent(op.content);
		if (computed !== op.contentHash) {
			log.warn("Push bad hash for %s: expected %s, got %s", op.fileId, op.contentHash, computed);
			return { fileId: op.fileId, status: "bad_hash" };
		}
	}

	const newVersion = currentVersion + 1;
	const syncInfo = {
		fileId: op.fileId,
		serverPath: op.serverPath,
		...(op.contentHash ? { contentHash: op.contentHash } : {}),
		...(op.type === "delete" ? { deleted: true, deletedAt: Date.now() } : {}),
	};

	if (existing) {
		// Update existing doc
		const result = await docDao.updateDocIfVersion(
			{
				...existing,
				content: op.type === "delete" ? existing.content : (op.content ?? existing.content),
				contentMetadata: { ...existing.contentMetadata, sync: syncInfo },
				version: newVersion,
			},
			currentVersion,
		);

		if (result === "conflict") {
			log.info("Push version conflict during update for %s", op.fileId);
			return { fileId: op.fileId, status: "conflict", serverVersion: currentVersion };
		}
	} else {
		// Create new doc
		await docDao.createDoc({
			jrn,
			content: op.content ?? "",
			contentType: "text/markdown",
			updatedBy: "sync-server",
			contentMetadata: { sync: syncInfo },
			source: undefined,
			sourceMetadata: undefined,
			spaceId: undefined,
			parentId: undefined,
			docType: "document",
			sortOrder: 0,
			createdBy: "sync-server",
		});
	}

	// Advance cursor
	await syncArticleDao.advanceCursor(jrn);
	log.info("Push succeeded for %s: version %d", op.fileId, newVersion);
	return { fileId: op.fileId, status: "ok", newVersion };
}

/**
 * Create a sync router for bi-directional markdown sync.
 * @param docDaoProvider Provider for DocDao.
 * @param syncArticleDaoProvider Provider for SyncArticleDao.
 */
export function createSyncRouter(
	docDaoProvider: DaoProvider<DocDao>,
	syncArticleDaoProvider: DaoProvider<SyncArticleDao>,
): Router {
	const router = express.Router();

	// POST /v1/sync/pull - fetch changes since cursor
	router.post("/pull", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			const { sinceCursor = 0 } = req.body as PullRequest;

			if (sinceCursor === 0) {
				// Initial sync: return all non-deleted sync articles
				const docs = await docDao.listDocs({
					startsWithJrn: "jrn:/global:docs:article/sync-",
				});
				const changes = docs
					.filter(d => !d.contentMetadata?.sync?.deleted)
					.map(d => ({
						fileId: d.contentMetadata?.sync?.fileId,
						serverPath: d.contentMetadata?.sync?.serverPath,
						version: d.version,
						deleted: false,
						content: d.content,
						contentHash: integrityHashFromContent(d.content),
					}));

				const cursor = await syncArticleDao.getCurrentCursor();
				log.info("Pull (initial): returning %d changes, cursor=%d", changes.length, cursor);
				res.json({ newCursor: cursor, changes });
				return;
			}

			// Incremental sync: return changes since cursor
			const syncArticles = await syncArticleDao.getSyncArticlesSince(sinceCursor);
			const changes = await Promise.all(
				syncArticles.map(async sa => {
					const doc = await docDao.readDoc(sa.docJrn);
					if (!doc) {
						return null;
					}

					const sync = doc.contentMetadata?.sync;
					return {
						fileId: sync?.fileId,
						serverPath: sync?.serverPath,
						version: doc.version,
						deleted: sync?.deleted ?? false,
						content: sync?.deleted ? undefined : doc.content,
						contentHash: sync?.deleted ? undefined : integrityHashFromContent(doc.content),
					};
				}),
			);

			const cursor = await syncArticleDao.getCurrentCursor();
			log.info(
				"Pull (incremental from %d): returning %d changes, cursor=%d",
				sinceCursor,
				changes.length,
				cursor,
			);
			res.json({ newCursor: cursor, changes: changes.filter(Boolean) });
		} catch (error) {
			log.error(error, "Error in pull endpoint.");
			res.status(500).json({ error: "Failed to pull changes" });
		}
	});

	// POST /v1/sync/push - push local changes with conflict detection
	router.post("/push", async (req, res) => {
		try {
			const docDao = docDaoProvider.getDao(getTenantContext());
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			const { ops } = req.body as PushRequest;

			// Note: Idempotency is handled by version checks - retries get "conflict" status.
			// With v3 commit table, CLI can query commits to detect successful retries.

			const results: Array<PushOpResult> = [];
			for (const op of ops) {
				const result = await processPushOp(op, docDao, syncArticleDao);
				results.push(result);
			}

			const cursor = await syncArticleDao.getCurrentCursor();
			res.json({ results, newCursor: cursor });
		} catch (error) {
			log.error(error, "Error in push endpoint.");
			res.status(500).json({ error: "Failed to push changes" });
		}
	});

	// GET /v1/sync/status - debug endpoint
	router.get("/status", async (_req, res) => {
		try {
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			const cursor = await syncArticleDao.getCurrentCursor();
			const syncArticles = await syncArticleDao.getSyncArticlesSince(0);
			res.json({
				cursor,
				fileCount: syncArticles.length,
				files: syncArticles,
			});
		} catch (error) {
			log.error(error, "Error in status endpoint.");
			res.status(500).json({ error: "Failed to get status" });
		}
	});

	return router;
}
