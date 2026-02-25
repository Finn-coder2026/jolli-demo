import { getConfig } from "../config/Config";
import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { SyncArticleDao } from "../dao/SyncArticleDao";
import type { NewSyncCommitFileInput, SyncCommitDao, SyncCommitSummary } from "../dao/SyncCommitDao";
import type { Space } from "../model/Space";
import { createFolderResolutionService, type FolderResolutionService } from "../services/FolderResolutionService";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "../util/Logger";
import { integrityHashFromContent } from "../util/SyncHelpers";
import crypto from "node:crypto";
import express, { type Request, type Router } from "express";
import { countLineChanges } from "jolli-common";

const log = getLog(import.meta);

interface PushOp {
	type: "upsert" | "delete";
	fileId: string;
	serverPath: string;
	baseVersion: number;
	content?: string;
	contentHash?: string;
}

interface PushRequest {
	clientChangesetId?: string;
	targetBranch?: string;
	message?: string;
	mergePrompt?: string;
	ops?: Array<PushOp>;
}

interface PullRequest {
	sinceCursor?: number;
}

interface PushOpResult {
	fileId: string;
	status: "ok";
}

interface CommitFileReviewRequest {
	decision?: "accept" | "reject" | "amend";
	amendedContent?: string;
	comment?: string;
}

interface PublishFileReport {
	id: number;
	fileId: string;
	docJrn: string;
	status: "published" | "conflict" | "rejected" | "missing_review";
	reason?: string;
	currentVersion?: number;
}

const REVIEW_DECISIONS = new Set(["accept", "reject", "amend"]);
const MUTABLE_CHANGESET_STATUSES = ["proposed", "reviewing", "ready", "rejected"] as const;
const PUBLISHING_CHANGESET_STATUS = "publishing" as const;
/** If a changeset has been in "publishing" status longer than this, treat the lock as stale. */
const STALE_PUBLISH_LOCK_MS = 10 * 60 * 1000;
const DEFAULT_CHANGESET_LIST_LIMIT = 50;
const MAX_CHANGESET_LIST_LIMIT = 200;
type MutableChangesetStatus = (typeof MUTABLE_CHANGESET_STATUSES)[number];

function isMutableChangesetStatus(status: string): status is MutableChangesetStatus {
	return MUTABLE_CHANGESET_STATUSES.includes(status as MutableChangesetStatus);
}

function extractTitleFromServerPath(serverPath: string): string {
	const lastSlash = serverPath.lastIndexOf("/");
	const filename = lastSlash === -1 ? serverPath : serverPath.substring(lastSlash + 1);
	return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}

async function resolveSpaceFromHeader(req: Request, spaceDao: SpaceDao): Promise<Space | null> {
	const spaceSlug = req.headers["x-jolli-space"] as string | undefined;
	if (!spaceSlug) {
		return null;
	}
	const space = await spaceDao.getSpaceBySlug(spaceSlug);
	if (!space) {
		throw new SpaceNotFoundError(spaceSlug);
	}
	return space;
}

class SpaceNotFoundError extends Error {
	constructor(slug: string) {
		super(`Space not found: "${slug}"`);
		this.name = "SpaceNotFoundError";
	}
}

function canonicalPayloadHash(request: {
	targetBranch: string;
	message?: string;
	mergePrompt?: string;
	ops: Array<PushOp>;
}): string {
	const normalizedOps = request.ops
		.map(op => ({
			type: op.type,
			fileId: op.fileId,
			serverPath: op.serverPath,
			baseVersion: op.baseVersion,
			content: op.content ?? null,
			contentHash: op.contentHash ?? null,
		}))
		.sort((a, b) => {
			if (a.fileId !== b.fileId) {
				return a.fileId.localeCompare(b.fileId);
			}
			if (a.serverPath !== b.serverPath) {
				return a.serverPath.localeCompare(b.serverPath);
			}
			return a.type.localeCompare(b.type);
		});

	const canonical = JSON.stringify({
		targetBranch: request.targetBranch,
		message: request.message ?? null,
		mergePrompt: request.mergePrompt ?? null,
		ops: normalizedOps,
	});
	return crypto.createHash("sha256").update(canonical).digest("hex");
}

function parseNumericParam(value: string, name: string): number | Error {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return new Error(`Invalid ${name}`);
	}
	return parsed;
}

function parseOptionalPositiveInt(value: unknown, name: string): number | Error | undefined {
	if (value === undefined) {
		return;
	}
	if (Array.isArray(value)) {
		return new Error(`Invalid ${name}`);
	}
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return new Error(`Invalid ${name}`);
	}
	return parsed;
}

function getReviewerId(req: Request): string | undefined {
	const userId = req.orgUser?.id;
	return userId !== undefined ? String(userId) : undefined;
}

function withChangesetAlias<T extends Record<string, unknown>>(
	changeset: unknown,
	payload: T,
): T & { changeset: unknown; commit: unknown } {
	return {
		...payload,
		changeset,
		commit: changeset,
	};
}

async function resolveTargetSpace(
	req: Request,
	spaceDao: SpaceDao,
): Promise<Space | { error: string; status: number }> {
	const space = await resolveSpaceFromHeader(req, spaceDao);
	const targetSpace = space ?? (await spaceDao.getDefaultSpace());
	if (!targetSpace) {
		return { error: "No space available", status: 500 };
	}
	return targetSpace;
}

function getCommitScopeKeyForSpace(space: Space): string {
	return `space:${space.id}`;
}

async function resolveCommitScopeKey(
	req: Request,
	spaceDao: SpaceDao,
): Promise<string | { error: string; status: number }> {
	const targetSpace = await resolveTargetSpace(req, spaceDao);
	if ("error" in targetSpace) {
		return targetSpace;
	}
	return getCommitScopeKeyForSpace(targetSpace);
}

function emptyCommitSummary(): SyncCommitSummary {
	return {
		totalFiles: 0,
		accepted: 0,
		rejected: 0,
		amended: 0,
		pending: 0,
		additions: 0,
		deletions: 0,
	};
}

/** Maximum number of file operations allowed in a single push request. */
const MAX_PUSH_OPS = 500;

function validatePushOp(op: PushOp, index: number): string | undefined {
	if (op.type !== "upsert" && op.type !== "delete") {
		return `ops[${index}].type must be "upsert" or "delete"`;
	}
	if (!op.fileId || typeof op.fileId !== "string") {
		return `ops[${index}].fileId must be a non-empty string`;
	}
	if (op.fileId.includes("/") || op.fileId.includes("\\") || op.fileId.includes("..")) {
		return `ops[${index}].fileId contains invalid path characters`;
	}
	if (!op.serverPath || typeof op.serverPath !== "string") {
		return `ops[${index}].serverPath is required`;
	}
	if (typeof op.baseVersion !== "number") {
		return `ops[${index}].baseVersion must be a number`;
	}
	return;
}

function validatePushRequest(body: PushRequest): string | undefined {
	if (!body.clientChangesetId || typeof body.clientChangesetId !== "string") {
		return "clientChangesetId is required";
	}
	if (body.message !== undefined && typeof body.message !== "string") {
		return "message must be a string when provided";
	}
	if (body.mergePrompt !== undefined && typeof body.mergePrompt !== "string") {
		return "mergePrompt must be a string when provided";
	}
	if (body.targetBranch !== "main") {
		return "targetBranch must be 'main'";
	}
	if (!Array.isArray(body.ops) || body.ops.length === 0) {
		return "ops must be a non-empty array";
	}
	if (body.ops.length > MAX_PUSH_OPS) {
		return `ops array exceeds maximum of ${MAX_PUSH_OPS} operations`;
	}
	for (let i = 0; i < body.ops.length; i++) {
		const opError = validatePushOp(body.ops[i], i);
		if (opError) {
			return opError;
		}
	}
	return;
}

function validateReviewRequest(body: CommitFileReviewRequest): string | undefined {
	if (!body.decision || !REVIEW_DECISIONS.has(body.decision)) {
		return "decision must be one of accept|reject|amend";
	}
	if (body.decision === "amend" && typeof body.amendedContent !== "string") {
		return "amendedContent is required when decision=amend";
	}
	return;
}

interface RouteErrorResponse {
	status: number;
	payload: {
		error: string;
		code?: string;
	};
}

function getReviewableCommitError(
	commit:
		| {
				commitScopeKey: string;
				status: string;
		  }
		| undefined,
	expectedCommitScopeKey: string,
): RouteErrorResponse | undefined {
	if (!commit || commit.commitScopeKey !== expectedCommitScopeKey) {
		return { status: 404, payload: { error: "Changeset not found" } };
	}
	if (commit.status === "published") {
		return { status: 409, payload: { error: "Changeset is already published" } };
	}
	if (commit.status === PUBLISHING_CHANGESET_STATUS) {
		return {
			status: 409,
			payload: {
				error: "Changeset publish is already in progress",
				code: "PUBLISH_IN_PROGRESS",
			},
		};
	}
	return;
}

/**
 * Determines the next changeset status based on file review decisions.
 * - "reviewing": not all files have been reviewed yet
 * - "rejected": every file was rejected — nothing to publish
 * - "ready": at least one file is accepted/amended and ready to publish
 *   (rejected files are skipped during publish)
 */
function getNextReviewStatus(
	allFiles: Array<{ id: number }>,
	latestReviews: Map<number, { decision: "accept" | "reject" | "amend" }>,
): "reviewing" | "ready" | "rejected" {
	if (!allFiles.every(file => latestReviews.has(file.id))) {
		return "reviewing";
	}
	return allFiles.every(file => latestReviews.get(file.id)?.decision === "reject") ? "rejected" : "ready";
}

function isScopeClientChangesetUniqueViolation(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	const typed = error as {
		name?: string;
		message?: string;
		original?: { code?: string; constraint?: string };
		parent?: { code?: string; constraint?: string };
	};
	const code = typed.original?.code ?? typed.parent?.code;
	const constraint = typed.original?.constraint ?? typed.parent?.constraint;
	if (code === "23505" && constraint === "sync_commits_scope_client_changeset_key") {
		return true;
	}
	if (typed.name === "SequelizeUniqueConstraintError") {
		if (constraint === "sync_commits_scope_client_changeset_key") {
			return true;
		}
		if (typeof typed.message === "string" && typed.message.includes("sync_commits_scope_client_changeset_key")) {
			return true;
		}
	}
	return false;
}

async function buildCommitFilesFromOps(
	ops: Array<PushOp>,
	docDao: DocDao,
	syncJrnPrefix: string,
): Promise<{ files: Array<NewSyncCommitFileInput>; badHashFileId?: string }> {
	const files: Array<NewSyncCommitFileInput> = [];
	for (const op of ops) {
		const jrn = `${syncJrnPrefix}${op.fileId}`;
		const existing = await docDao.readDoc(jrn);
		const baseContent = existing?.content ?? "";
		const baseVersion = existing?.version ?? 0;
		const incomingContent = op.type === "delete" ? undefined : (op.content ?? existing?.content ?? "");

		if (op.type === "upsert" && op.contentHash) {
			const computed = integrityHashFromContent(incomingContent ?? "");
			if (computed !== op.contentHash) {
				return { files: [], badHashFileId: op.fileId };
			}
		}
		const incomingContentHash =
			op.type === "upsert" ? (op.contentHash ?? integrityHashFromContent(incomingContent ?? "")) : undefined;
		const diffStats = countLineChanges(baseContent, op.type === "delete" ? "" : (incomingContent ?? ""));
		const file: NewSyncCommitFileInput = {
			fileId: op.fileId,
			docJrn: jrn,
			serverPath: op.serverPath,
			baseContent,
			baseVersion,
			opType: op.type,
			lineAdditions: diffStats.additions,
			lineDeletions: diffStats.deletions,
			...(incomingContent !== undefined ? { incomingContent } : {}),
			...(incomingContentHash !== undefined ? { incomingContentHash } : {}),
		};
		files.push(file);
	}
	return { files };
}

async function applyPublishedUpsert(
	file: {
		id: number;
		fileId: string;
		docJrn: string;
		serverPath: string;
		baseContent: string;
		baseVersion: number;
	},
	incomingContent: string,
	docDao: DocDao,
	syncArticleDao: SyncArticleDao,
	folderService: FolderResolutionService,
	spaceId: number,
): Promise<PublishFileReport> {
	const existing = await docDao.readDoc(file.docJrn);
	const syncInfo = {
		fileId: file.fileId,
		serverPath: file.serverPath,
		contentHash: integrityHashFromContent(incomingContent),
	};

	if (existing) {
		// Commit publish is changeset-only: no automatic 3-way merge here.
		// If main changed since proposal base, mark conflict for manual/agent resolution.
		if (existing.version !== file.baseVersion || existing.content !== file.baseContent) {
			return {
				id: file.id,
				fileId: file.fileId,
				docJrn: file.docJrn,
				status: "conflict",
				reason: "BASE_CHANGED",
				currentVersion: existing.version,
			};
		}

		const existingServerPath = (existing.contentMetadata as { sync?: { serverPath?: string } })?.sync?.serverPath;
		let newParentId = existing.parentId;
		let newSpaceId = existing.spaceId;
		if (existingServerPath !== file.serverPath) {
			const resolved = await folderService.resolveFolderHierarchy(file.serverPath, spaceId, docDao);
			newParentId = resolved.parentId;
			newSpaceId = resolved.spaceId;
		}

		const result = await docDao.updateDocIfVersion(
			{
				...existing,
				content: incomingContent,
				contentMetadata: { ...existing.contentMetadata, sync: syncInfo },
				version: existing.version + 1,
				spaceId: newSpaceId,
				parentId: (newParentId ?? null) as number | undefined,
				deletedAt: existing.deletedAt,
				explicitlyDeleted: false,
			},
			existing.version,
		);
		if (result === "conflict") {
			return {
				id: file.id,
				fileId: file.fileId,
				docJrn: file.docJrn,
				status: "conflict",
				reason: "VERSION_CONFLICT",
				currentVersion: existing.version,
			};
		}
		await syncArticleDao.advanceCursor(file.docJrn);
		return {
			id: file.id,
			fileId: file.fileId,
			docJrn: file.docJrn,
			status: "published",
			currentVersion: result.version,
		};
	}

	if (file.baseVersion !== 0 || file.baseContent !== "") {
		return {
			id: file.id,
			fileId: file.fileId,
			docJrn: file.docJrn,
			status: "conflict",
			reason: "BASE_DOC_MISSING",
			currentVersion: 0,
		};
	}

	const { parentId } = await folderService.resolveFolderHierarchy(file.serverPath, spaceId, docDao);
	const title = extractTitleFromServerPath(file.serverPath);
	const created = await docDao.createDoc({
		jrn: file.docJrn,
		content: incomingContent,
		contentType: "text/markdown",
		updatedBy: "sync-server",
		contentMetadata: { title, sync: syncInfo },
		source: undefined,
		sourceMetadata: undefined,
		spaceId,
		parentId,
		docType: "document",
		createdBy: "sync-server",
	});
	await syncArticleDao.advanceCursor(file.docJrn);
	return {
		id: file.id,
		fileId: file.fileId,
		docJrn: file.docJrn,
		status: "published",
		currentVersion: created.version,
	};
}

async function applyPublishedDelete(
	file: {
		id: number;
		fileId: string;
		docJrn: string;
		serverPath: string;
		baseContent: string;
		baseVersion: number;
	},
	docDao: DocDao,
	syncArticleDao: SyncArticleDao,
): Promise<PublishFileReport> {
	const existing = await docDao.readDoc(file.docJrn);
	if (!existing) {
		return {
			id: file.id,
			fileId: file.fileId,
			docJrn: file.docJrn,
			status: "published",
			reason: "ALREADY_MISSING",
		};
	}

	if (existing.version !== file.baseVersion || existing.content !== file.baseContent) {
		return {
			id: file.id,
			fileId: file.fileId,
			docJrn: file.docJrn,
			status: "conflict",
			reason: "DELETE_BASE_MISMATCH",
			currentVersion: existing.version,
		};
	}

	const deleteTimestamp = new Date();
	const result = await docDao.updateDocIfVersion(
		{
			...existing,
			contentMetadata: {
				...existing.contentMetadata,
				sync: {
					fileId: file.fileId,
					serverPath: file.serverPath,
					deleted: true,
					deletedAt: Date.now(),
				},
			},
			version: existing.version + 1,
			deletedAt: deleteTimestamp as Date | undefined,
			explicitlyDeleted: true,
		},
		existing.version,
	);

	if (result === "conflict") {
		return {
			id: file.id,
			fileId: file.fileId,
			docJrn: file.docJrn,
			status: "conflict",
			reason: "VERSION_CONFLICT",
			currentVersion: existing.version,
		};
	}

	await syncArticleDao.advanceCursor(file.docJrn);
	return {
		id: file.id,
		fileId: file.fileId,
		docJrn: file.docJrn,
		status: "published",
		currentVersion: result.version,
	};
}

export function createSyncRouter(
	docDaoProvider: DaoProvider<DocDao>,
	syncArticleDaoProvider: DaoProvider<SyncArticleDao>,
	syncCommitDaoProvider: DaoProvider<SyncCommitDao>,
	spaceDaoProvider: DaoProvider<SpaceDao>,
): Router {
	const router = express.Router();

	router.post("/pull", async (req, res) => {
		try {
			const config = getConfig();
			const syncJrnPrefix = config.SYNC_JRN_PREFIX;
			const docDao = docDaoProvider.getDao(getTenantContext());
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const { sinceCursor = 0 } = req.body as PullRequest;

			const space = await resolveSpaceFromHeader(req, spaceDao);
			if (sinceCursor === 0) {
				const docs = await docDao.listDocs({
					startsWithJrn: syncJrnPrefix,
					...(space ? { spaceId: space.id } : {}),
				});
				const changes = docs
					.filter(d => !d.deletedAt && !d.contentMetadata?.sync?.deleted)
					.map(d => ({
						fileId: d.contentMetadata?.sync?.fileId,
						serverPath: d.contentMetadata?.sync?.serverPath,
						version: d.version,
						deleted: false,
						content: d.content,
						contentHash: integrityHashFromContent(d.content),
					}));
				const cursor = await syncArticleDao.getCurrentCursor();
				res.json({ newCursor: cursor, changes });
				return;
			}

			const syncArticles = await syncArticleDao.getSyncArticlesSince(sinceCursor);
			const changes = await Promise.all(
				syncArticles.map(async sa => {
					const doc = await docDao.readDoc(sa.docJrn);
					if (!doc) {
						return null;
					}
					if (space && doc.spaceId !== space.id) {
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
			res.json({ newCursor: cursor, changes: changes.filter(Boolean) });
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			log.error(error, "Error in pull endpoint.");
			res.status(500).json({ error: "Failed to pull changes" });
		}
	});

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Push handler requires validation, idempotency checks, and conflict resolution in a single transaction flow.
	router.post("/push", async (req, res) => {
		try {
			const config = getConfig();
			const syncJrnPrefix = config.SYNC_JRN_PREFIX;
			const docDao = docDaoProvider.getDao(getTenantContext());
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			const syncCommitDao = syncCommitDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const body = req.body as PushRequest;

			const validationError = validatePushRequest(body);
			if (validationError) {
				res.status(400).json({ error: validationError });
				return;
			}
			// Guaranteed by validatePushRequest above
			const clientChangesetId = body.clientChangesetId as string;

			const targetSpace = await resolveTargetSpace(req, spaceDao);
			if ("error" in targetSpace) {
				res.status(targetSpace.status).json({ error: targetSpace.error });
				return;
			}

			const commitScopeKey = getCommitScopeKeyForSpace(targetSpace);
			const payloadHash = canonicalPayloadHash({
				targetBranch: body.targetBranch ?? "main",
				ops: body.ops ?? [],
				...(body.message !== undefined ? { message: body.message } : {}),
				...(body.mergePrompt !== undefined ? { mergePrompt: body.mergePrompt } : {}),
			});

			const existing = await syncCommitDao.findCommitByScopeAndClientChangesetId(
				commitScopeKey,
				clientChangesetId,
			);
			if (existing) {
				if (existing.payloadHash !== payloadHash) {
					res.status(409).json({
						error: "clientChangesetId was already used with a different payload",
						code: "CLIENT_CHANGESET_ID_REUSED",
					});
					return;
				}
				const files = await syncCommitDao.getCommitFiles(existing.id);
				const cursor = await syncArticleDao.getCurrentCursor();
				const results: Array<PushOpResult> = (body.ops ?? []).map(op => ({ fileId: op.fileId, status: "ok" }));
				res.json(withChangesetAlias(existing, { files, results, newCursor: cursor, replayed: true }));
				return;
			}

			const { files, badHashFileId } = await buildCommitFilesFromOps(body.ops ?? [], docDao, syncJrnPrefix);
			if (badHashFileId) {
				res.status(400).json({
					error: `content hash mismatch for ${badHashFileId}`,
					code: "BAD_HASH",
					fileId: badHashFileId,
				});
				return;
			}

			const seq = await syncArticleDao.getCurrentCursor();
			const pushedBy = getReviewerId(req);
			let created: Awaited<ReturnType<SyncCommitDao["createProposedCommit"]>>;
			try {
				created = await syncCommitDao.createProposedCommit({
					seq,
					clientChangesetId,
					commitScopeKey,
					targetBranch: "main",
					payloadHash,
					files,
					...(body.message !== undefined ? { message: body.message } : {}),
					...(body.mergePrompt !== undefined ? { mergePrompt: body.mergePrompt } : {}),
					...(pushedBy !== undefined ? { pushedBy } : {}),
				});
			} catch (error) {
				if (!isScopeClientChangesetUniqueViolation(error)) {
					throw error;
				}

				const raced = await syncCommitDao.findCommitByScopeAndClientChangesetId(
					commitScopeKey,
					clientChangesetId,
				);
				if (!raced) {
					throw error;
				}
				if (raced.payloadHash !== payloadHash) {
					res.status(409).json({
						error: "clientChangesetId was already used with a different payload",
						code: "CLIENT_CHANGESET_ID_REUSED",
					});
					return;
				}
				const racedFiles = await syncCommitDao.getCommitFiles(raced.id);
				const cursor = await syncArticleDao.getCurrentCursor();
				const results: Array<PushOpResult> = (body.ops ?? []).map(op => ({ fileId: op.fileId, status: "ok" }));
				res.json(withChangesetAlias(raced, { files: racedFiles, results, newCursor: cursor, replayed: true }));
				return;
			}

			const results: Array<PushOpResult> = (body.ops ?? []).map(op => ({ fileId: op.fileId, status: "ok" }));
			const cursor = await syncArticleDao.getCurrentCursor();
			res.json(
				withChangesetAlias(created.commit, {
					files: created.files,
					results,
					newCursor: cursor,
					replayed: false,
				}),
			);
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			log.error(error, "Error in push endpoint.");
			res.status(500).json({ error: "Failed to push changes" });
		}
	});

	const listChangesets = async (req: Request, res: express.Response): Promise<void> => {
		try {
			const syncCommitDao = syncCommitDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const parsedLimit = parseOptionalPositiveInt(req.query.limit, "limit");
			if (parsedLimit instanceof Error) {
				res.status(400).json({ error: parsedLimit.message });
				return;
			}
			const parsedBeforeId = parseOptionalPositiveInt(req.query.beforeId, "beforeId");
			if (parsedBeforeId instanceof Error) {
				res.status(400).json({ error: parsedBeforeId.message });
				return;
			}

			const limit = Math.min(parsedLimit ?? DEFAULT_CHANGESET_LIST_LIMIT, MAX_CHANGESET_LIST_LIMIT);
			const targetSpace = await resolveTargetSpace(req, spaceDao);
			if ("error" in targetSpace) {
				res.status(targetSpace.status).json({ error: targetSpace.error });
				return;
			}

			const commitScopeKey = getCommitScopeKeyForSpace(targetSpace);
			const changesets = await syncCommitDao.listCommitsByScope(commitScopeKey, {
				limit: limit + 1,
				...(parsedBeforeId !== undefined ? { beforeId: parsedBeforeId } : {}),
			});
			const hasMore = changesets.length > limit;
			const pagedChangesets = hasMore ? changesets.slice(0, limit) : changesets;
			const summaries = await syncCommitDao.listCommitSummaries(pagedChangesets.map(changeset => changeset.id));
			const payload = pagedChangesets.map(changeset => ({
				...changeset,
				summary: summaries.get(changeset.id) ?? emptyCommitSummary(),
			}));
			const nextBeforeId = hasMore ? payload[payload.length - 1]?.id : undefined;

			res.json({
				changesets: payload,
				commits: payload,
				hasMore,
				...(nextBeforeId !== undefined ? { nextBeforeId } : {}),
			});
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			log.error(error, "Error in list changesets endpoint.");
			res.status(500).json({ error: "Failed to list changesets" });
		}
	};
	router.get("/changesets", listChangesets);
	router.get("/commits", listChangesets);

	const getChangeset = async (req: Request, res: express.Response): Promise<void> => {
		try {
			const parsed = parseNumericParam(req.params.id, "changeset id");
			if (parsed instanceof Error) {
				res.status(400).json({ error: parsed.message });
				return;
			}

			const syncCommitDao = syncCommitDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const expectedCommitScopeKey = await resolveCommitScopeKey(req, spaceDao);
			if (typeof expectedCommitScopeKey !== "string") {
				res.status(expectedCommitScopeKey.status).json({ error: expectedCommitScopeKey.error });
				return;
			}
			const changeset = await syncCommitDao.getCommit(parsed);
			if (!changeset) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}
			if (changeset.commitScopeKey !== expectedCommitScopeKey) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}

			const summary = (await syncCommitDao.listCommitSummaries([changeset.id])).get(changeset.id);

			res.json(
				withChangesetAlias(changeset, {
					summary: summary ?? emptyCommitSummary(),
				}),
			);
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			log.error(error, "Error in get changeset endpoint.");
			res.status(500).json({ error: "Failed to get changeset" });
		}
	};
	router.get("/changesets/:id", getChangeset);
	router.get("/commits/:id", getChangeset);

	const getChangesetFiles = async (req: Request, res: express.Response): Promise<void> => {
		try {
			const parsed = parseNumericParam(req.params.id, "changeset id");
			if (parsed instanceof Error) {
				res.status(400).json({ error: parsed.message });
				return;
			}

			const docDao = docDaoProvider.getDao(getTenantContext());
			const syncCommitDao = syncCommitDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const targetSpace = await resolveTargetSpace(req, spaceDao);
			if ("error" in targetSpace) {
				res.status(targetSpace.status).json({ error: targetSpace.error });
				return;
			}
			const expectedCommitScopeKey = getCommitScopeKeyForSpace(targetSpace);
			const changeset = await syncCommitDao.getCommit(parsed);
			if (!changeset) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}
			if (changeset.commitScopeKey !== expectedCommitScopeKey) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}

			const files = await syncCommitDao.getCommitFiles(changeset.id);
			const [latestReviews, docsByJrn] = await Promise.all([
				syncCommitDao.getLatestReviewsForCommit(changeset.id),
				docDao.readDocsByJrns(files.map(file => file.docJrn)),
			]);
			const filesWithCurrent = files.map(file => {
				const currentDoc = docsByJrn.get(file.docJrn);
				const inTargetSpace = Boolean(currentDoc && currentDoc.spaceId === targetSpace.id);
				const syncMetadata = (
					currentDoc?.contentMetadata as
						| {
								sync?: {
									serverPath?: string;
									deleted?: boolean;
								};
						  }
						| undefined
				)?.sync;
				const currentServerPath = typeof syncMetadata?.serverPath === "string" ? syncMetadata.serverPath : null;
				const isMissing =
					!currentDoc || !inTargetSpace || Boolean(currentDoc.deletedAt || syncMetadata?.deleted);
				const currentStatus: "ok" | "missing" | "moved" = isMissing
					? "missing"
					: currentServerPath && currentServerPath !== file.serverPath
						? "moved"
						: "ok";

				return {
					...file,
					incomingContent: file.incomingContent ?? null,
					incomingContentHash: file.incomingContentHash ?? null,
					currentContent: !isMissing && currentDoc ? currentDoc.content : null,
					currentVersion: !isMissing && currentDoc ? currentDoc.version : null,
					currentServerPath,
					currentStatus,
					latestReview: latestReviews.get(file.id) ?? null,
				};
			});

			res.json({
				files: filesWithCurrent,
			});
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			log.error(error, "Error in get changeset files endpoint.");
			res.status(500).json({ error: "Failed to get changeset files" });
		}
	};
	router.get("/changesets/:id/files", getChangesetFiles);
	router.get("/commits/:id/files", getChangesetFiles);

	const reviewChangesetFile = async (req: Request, res: express.Response): Promise<void> => {
		try {
			const commitId = parseNumericParam(req.params.id, "changeset id");
			const commitFileId = parseNumericParam(req.params.fileId, "changeset file id");
			if (commitId instanceof Error || commitFileId instanceof Error) {
				res.status(400).json({ error: "Invalid changeset id or file id" });
				return;
			}

			const body = req.body as CommitFileReviewRequest;
			const reviewValidationError = validateReviewRequest(body);
			if (reviewValidationError) {
				res.status(400).json({ error: reviewValidationError });
				return;
			}
			const decision = body.decision as NonNullable<CommitFileReviewRequest["decision"]>;
			const amendedContent = decision === "amend" ? (body.amendedContent as string) : undefined;

			const syncCommitDao = syncCommitDaoProvider.getDao(getTenantContext());
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const expectedCommitScopeKey = await resolveCommitScopeKey(req, spaceDao);
			if (typeof expectedCommitScopeKey !== "string") {
				res.status(expectedCommitScopeKey.status).json({ error: expectedCommitScopeKey.error });
				return;
			}
			const commit = await syncCommitDao.getCommit(commitId);
			const reviewableCommitError = getReviewableCommitError(commit, expectedCommitScopeKey);
			if (reviewableCommitError) {
				res.status(reviewableCommitError.status).json(reviewableCommitError.payload);
				return;
			}

			const commitFile = await syncCommitDao.getCommitFile(commitId, commitFileId);
			if (!commitFile) {
				res.status(404).json({ error: "Changeset file not found" });
				return;
			}

			const review = await syncCommitDao.createFileReview({
				commitFileId: commitFile.id,
				decision,
				amendedContent,
				reviewedBy: getReviewerId(req),
				comment: body.comment,
			});

			const allFiles = await syncCommitDao.getCommitFiles(commitId);
			const latestReviews = await syncCommitDao.getLatestReviewsForCommit(commitId);
			const nextStatus = getNextReviewStatus(allFiles, latestReviews);

			const updatedCommit = await syncCommitDao.updateCommit(commitId, { status: nextStatus }, undefined, {
				expectedCurrentStatuses: [...MUTABLE_CHANGESET_STATUSES],
			});
			const latestCommit = updatedCommit ?? (await syncCommitDao.getCommit(commitId));
			/* v8 ignore next 4 - defensive: commit was just found above, cannot disappear */
			if (!latestCommit) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}
			res.json(withChangesetAlias(latestCommit, { review }));
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			log.error(error, "Error in changeset review endpoint.");
			res.status(500).json({ error: "Failed to set review decision" });
		}
	};
	router.patch("/changesets/:id/files/:fileId/review", reviewChangesetFile);
	router.patch("/commits/:id/files/:fileId/review", reviewChangesetFile);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Publish handler requires multi-step merge, conflict detection, and transactional article updates.
	const publishChangeset = async (req: Request, res: express.Response): Promise<void> => {
		let claimedCommitId: number | undefined;
		let prePublishStatus: MutableChangesetStatus | undefined;
		let syncCommitDaoForUnlock: SyncCommitDao | undefined;
		try {
			const commitId = parseNumericParam(req.params.id, "changeset id");
			if (commitId instanceof Error) {
				res.status(400).json({ error: commitId.message });
				return;
			}

			const docDao = docDaoProvider.getDao(getTenantContext());
			const syncArticleDao = syncArticleDaoProvider.getDao(getTenantContext());
			const syncCommitDao = syncCommitDaoProvider.getDao(getTenantContext());
			syncCommitDaoForUnlock = syncCommitDao;
			const spaceDao = spaceDaoProvider.getDao(getTenantContext());
			const targetSpace = await resolveTargetSpace(req, spaceDao);
			if ("error" in targetSpace) {
				res.status(targetSpace.status).json({ error: targetSpace.error });
				return;
			}

			let commit = await syncCommitDao.getCommit(commitId);
			if (!commit) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}
			const expectedCommitScopeKey = getCommitScopeKeyForSpace(targetSpace);
			if (commit.commitScopeKey !== expectedCommitScopeKey) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}
			if (commit.targetBranch !== "main") {
				res.status(400).json({ error: "Only targetBranch=main is supported" });
				return;
			}
			if (commit.status === "published") {
				const files = await syncCommitDao.getCommitFiles(commit.id);
				const emptyReports: Array<PublishFileReport> = files.map(file => ({
					id: file.id,
					fileId: file.fileId,
					docJrn: file.docJrn,
					status: "published",
					reason: "ALREADY_PUBLISHED",
				}));
				res.json(withChangesetAlias(commit, { files: emptyReports, hasConflicts: false }));
				return;
			}
			if (commit.status === PUBLISHING_CHANGESET_STATUS) {
				// Check for stale publish lock (e.g., server crash mid-publish)
				const lockAge = Date.now() - commit.createdAt.getTime();
				if (lockAge > STALE_PUBLISH_LOCK_MS) {
					log.warn("Recovering stale publish lock on changeset %d (age=%dms)", commit.id, lockAge);
					await syncCommitDao.updateCommit(commit.id, { status: "reviewing" }, undefined, {
						expectedCurrentStatuses: [PUBLISHING_CHANGESET_STATUS],
					});
					// Re-read the updated commit to continue the publish flow
					const refreshed = await syncCommitDao.getCommit(commit.id);
					if (!refreshed) {
						res.status(404).json({ error: "Changeset not found" });
						return;
					}
					commit = refreshed;
				} else {
					res.status(409).json({
						error: "Changeset publish is already in progress",
						code: "PUBLISH_IN_PROGRESS",
					});
					return;
				}
			}
			if (!isMutableChangesetStatus(commit.status)) {
				res.status(409).json({
					error: `Changeset in status "${commit.status}" cannot be published`,
					code: "CHANGESET_NOT_PUBLISHABLE",
				});
				return;
			}

			const claimedCommit = await syncCommitDao.updateCommit(
				commit.id,
				{ status: PUBLISHING_CHANGESET_STATUS },
				undefined,
				{ expectedCurrentStatuses: [...MUTABLE_CHANGESET_STATUSES] },
			);
			if (!claimedCommit) {
				const latestCommit = await syncCommitDao.getCommit(commit.id);
				/* v8 ignore next 4 - defensive: commit was just found above, cannot disappear */
				if (!latestCommit) {
					res.status(404).json({ error: "Changeset not found" });
					return;
				}
				if (latestCommit.status === "published") {
					const files = await syncCommitDao.getCommitFiles(latestCommit.id);
					const emptyReports: Array<PublishFileReport> = files.map(file => ({
						id: file.id,
						fileId: file.fileId,
						docJrn: file.docJrn,
						status: "published",
						reason: "ALREADY_PUBLISHED",
					}));
					res.json(withChangesetAlias(latestCommit, { files: emptyReports, hasConflicts: false }));
					return;
				}
				if (latestCommit.status === PUBLISHING_CHANGESET_STATUS) {
					res.status(409).json({
						error: "Changeset publish is already in progress",
						code: "PUBLISH_IN_PROGRESS",
					});
					return;
				}
				res.status(409).json({
					error: `Changeset in status "${latestCommit.status}" cannot be published`,
					code: "CHANGESET_NOT_PUBLISHABLE",
				});
				return;
			}
			claimedCommitId = claimedCommit.id;
			prePublishStatus = commit.status;

			const files = await syncCommitDao.getCommitFiles(claimedCommit.id);
			const latestReviews = await syncCommitDao.getLatestReviewsForCommit(claimedCommit.id);
			const folderService = createFolderResolutionService();
			const reports: Array<PublishFileReport> = [];
			let hasConflicts = false;

			for (const file of files) {
				const review = latestReviews.get(file.id);
				if (!review) {
					reports.push({
						id: file.id,
						fileId: file.fileId,
						docJrn: file.docJrn,
						status: "missing_review",
						reason: "MISSING_REVIEW",
					});
					hasConflicts = true;
					continue;
				}

				if (review.decision === "reject") {
					reports.push({
						id: file.id,
						fileId: file.fileId,
						docJrn: file.docJrn,
						status: "rejected",
						reason: "REJECTED",
					});
					continue;
				}

				if (file.opType === "delete") {
					const report = await applyPublishedDelete(file, docDao, syncArticleDao);
					reports.push(report);
					if (report.status === "conflict") {
						hasConflicts = true;
					}
					continue;
				}

				const incomingContent =
					review.decision === "amend" ? (review.amendedContent ?? "") : (file.incomingContent ?? "");
				const report = await applyPublishedUpsert(
					file,
					incomingContent,
					docDao,
					syncArticleDao,
					folderService,
					targetSpace.id,
				);
				reports.push(report);
				if (report.status === "conflict") {
					hasConflicts = true;
				}
			}

			folderService.clearCache();

			const status = hasConflicts ? "reviewing" : "published";
			const publishedBy = hasConflicts ? undefined : getReviewerId(req);
			const publishedAt = hasConflicts ? undefined : new Date();
			const updatedCommit = await syncCommitDao.updateCommit(
				claimedCommit.id,
				{
					status,
					...(publishedBy ? { publishedBy } : {}),
					...(publishedAt ? { publishedAt } : {}),
				},
				undefined,
				{ expectedCurrentStatuses: [PUBLISHING_CHANGESET_STATUS] },
			);
			const latestCommit = updatedCommit ?? (await syncCommitDao.getCommit(claimedCommit.id));
			claimedCommitId = undefined;
			prePublishStatus = undefined;
			/* v8 ignore next 4 - defensive: commit was just found above, cannot disappear */
			if (!latestCommit) {
				res.status(404).json({ error: "Changeset not found" });
				return;
			}

			res.json(
				withChangesetAlias(latestCommit, {
					files: reports,
					hasConflicts: latestCommit.status === "published" ? false : hasConflicts,
				}),
			);
		} catch (error) {
			if (error instanceof SpaceNotFoundError) {
				res.status(404).json({ error: error.message });
				return;
			}
			if (syncCommitDaoForUnlock && claimedCommitId !== undefined && prePublishStatus !== undefined) {
				try {
					await syncCommitDaoForUnlock.updateCommit(
						claimedCommitId,
						{ status: prePublishStatus },
						undefined,
						{ expectedCurrentStatuses: [PUBLISHING_CHANGESET_STATUS] },
					);
				} catch (unlockError) {
					log.error(unlockError, "Failed to release changeset publish lock.");
				}
			}
			log.error(error, "Error in publish changeset endpoint.");
			res.status(500).json({ error: "Failed to publish changeset" });
		}
	};
	router.post("/changesets/:id/publish", publishChangeset);
	router.post("/commits/:id/publish", publishChangeset);

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
