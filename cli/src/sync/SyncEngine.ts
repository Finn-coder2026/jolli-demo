import { type PullResponse, type PushOp, PushOpSchema, type PushResponse } from "../reference-server/types";
import type { Logger } from "../shared/logger";
import { logError } from "../shared/logger";
import { threeWayMerge } from "jolli-common";
import {
	extractJrn,
	formatConflictMarkers,
	hasConflictMarkers,
	injectJrn,
	integrityHashFromContent,
} from "./SyncHelpers";
import { rewindStateForPendingOps } from "./StateRewind";
import type {
	ConflictInfo,
	FileEntry,
	FileScanner,
	FingerprintStrategy,
	MergeResult,
	MergeStrategy,
	PathObfuscator,
	SyncMode,
	SyncState,
} from "./Types";
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

export const PendingOpsSchema = z.object({
	clientChangesetId: z.string(),
	createdAt: z.number(),
	targetBranch: z.literal("main").default("main"),
	message: z.string().optional(),
	mergePrompt: z.string().optional(),
	ops: z.array(PushOpSchema),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type PendingOps = z.infer<typeof PendingOpsSchema>;
export type PushMetadata = {
	message?: string;
	mergePrompt?: string;
};

export type FileStore = {
	readText: (path: string) => Promise<string>;
	writeText: (path: string, content: string) => Promise<void>;
	exists: (path: string) => Promise<boolean>;
	moveToTrash: (path: string) => Promise<string | null>;
	rename: (oldPath: string, newPath: string) => Promise<boolean>;
};

export type StateStore = {
	load: () => Promise<SyncState>;
	save: (state: SyncState) => Promise<void>;
};

export type PendingOpsStore = {
	load: () => Promise<PendingOps | null>;
	save: (pending: PendingOps) => Promise<void>;
	clear: () => Promise<void>;
};

export type SnapshotStore = {
	load: (fileId: string) => Promise<string | null>;
	save: (fileId: string, content: string) => Promise<void>;
	remove: (fileId: string) => Promise<void>;
	purge?: (state: SyncState) => Promise<void>;
};

export type SyncTransport = {
	pull: (sinceCursor: number) => Promise<PullResponse>;
	push: (clientChangesetId: string, ops: Array<PushOp>, metadata?: PushMetadata) => Promise<PushResponse>;
};

export type SyncDependencies = {
	logger: Logger;
	transport: SyncTransport;
	fileStore: FileStore;
	stateStore: StateStore;
	pendingStore: PendingOpsStore;
	scanner: FileScanner;
	obfuscator: PathObfuscator;
	fingerprinter: FingerprintStrategy;
	snapshotStore?: SnapshotStore;
	merger?: MergeStrategy;
	idGenerator: () => string;
	pushMetadata?: PushMetadata;
	normalizePath?: (path: string) => string;
	now?: () => number;
};

const defaultNormalize = (path: string): string => path;
const defaultNow = (): number => Date.now();

export const conflictMarkerStrategy: MergeStrategy = {
	merge: conflicts => {
		const results: Array<MergeResult> = [];
		for (const conflict of conflicts) {
			if (conflict.baseContent !== null && conflict.baseContent !== undefined) {
				const merged = threeWayMerge(conflict.baseContent, conflict.localContent, conflict.serverContent, "LOCAL", "SERVER");
				results.push({
					fileId: conflict.fileId,
					clientPath: conflict.clientPath,
					resolved: merged.merged,
					action: merged.hasConflict ? "conflict-marker" : "merged",
				});
			} else {
				results.push({
					fileId: conflict.fileId,
					clientPath: conflict.clientPath,
					resolved: formatConflictMarkers(conflict.localContent, conflict.serverContent),
					action: "conflict-marker",
				});
			}
		}
		return Promise.resolve(results);
	},
};

function getDeletedFileIds(ops: Array<PushOp>): Set<string> {
	return new Set(ops.filter(op => op.type === "delete").map(op => op.fileId));
}

type SyncErrorWithStatus = {
	code?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isNonRetriableClientChangesetReuse(error: unknown): boolean {
	if (!isObject(error)) {
		return false;
	}
	const typed = error as SyncErrorWithStatus;
	return typed.code === "CLIENT_CHANGESET_ID_REUSED";
}

function cloneSyncState(state: SyncState): SyncState {
	return {
		lastCursor: state.lastCursor,
		space: state.space,
		config: state.config
			? {
					...(state.config.include ? { include: [...state.config.include] } : {}),
					...(state.config.exclude ? { exclude: [...state.config.exclude] } : {}),
				}
			: undefined,
		files: state.files.map(file => ({ ...file })),
	};
}

function restoreSyncState(target: SyncState, source: SyncState): void {
	target.lastCursor = source.lastCursor;
	target.space = source.space;
	target.config = source.config
		? {
				...(source.config.include ? { include: [...source.config.include] } : {}),
				...(source.config.exclude ? { exclude: [...source.config.exclude] } : {}),
			}
		: undefined;
	target.files = source.files.map(file => ({ ...file }));
}

function rebuildFileMaps(
	state: SyncState,
	fileMapByPath: Map<string, FileEntry>,
	fileMapById: Map<string, FileEntry>,
): void {
	fileMapByPath.clear();
	fileMapById.clear();
	for (const file of state.files) {
		fileMapById.set(file.fileId, file);
		if (!file.deleted) {
			fileMapByPath.set(file.clientPath, file);
		}
	}
}

async function handleDeleteResult(
	state: SyncState,
	fileMapByPath: Map<string, FileEntry>,
	r: PushResponse["results"][number],
	now: () => number,
	logger: Logger,
	snapshotStore?: SnapshotStore,
): Promise<void> {
	const entry = state.files.find(f => f.fileId === r.fileId);
	if (entry) {
		entry.deleted = true;
		entry.deletedAt = now();
		entry.trashPath = undefined;
		if (r.newVersion) {
			entry.serverVersion = r.newVersion;
		}
		fileMapByPath.delete(entry.clientPath);
	}
	if (snapshotStore) {
		await snapshotStore.remove(r.fileId);
	}
	logger.info(`✓ ${r.fileId} deleted (tombstoned)`);
}

async function handleUpsertResult(
	state: SyncState,
	r: PushResponse["results"][number],
	logger: Logger,
	snapshotStore?: SnapshotStore,
	contentByFileId?: Map<string, string>,
): Promise<void> {
	if (snapshotStore && contentByFileId?.has(r.fileId)) {
		await snapshotStore.save(r.fileId, contentByFileId.get(r.fileId) ?? "");
	}
	if (r.newVersion) {
		const entry = state.files.find(f => f.fileId === r.fileId);
		if (entry) {
			entry.serverVersion = r.newVersion;
		}
		logger.info(`✓ ${r.fileId} -> v${r.newVersion}`);
	}
}

async function applyPushResults(
	state: SyncState,
	fileMapByPath: Map<string, FileEntry>,
	results: PushResponse["results"],
	deletedFileIds: Set<string>,
	logger: Logger,
	now: () => number,
	snapshotStore?: SnapshotStore,
	contentByFileId?: Map<string, string>,
): Promise<void> {
	for (const r of results) {
		if (r.status === "ok") {
			if (deletedFileIds.has(r.fileId)) {
				await handleDeleteResult(state, fileMapByPath, r, now, logger, snapshotStore);
			} else {
				await handleUpsertResult(state, r, logger, snapshotStore, contentByFileId);
			}
		} else if (r.status === "conflict") {
			logger.warn(`✗ ${r.fileId} CONFLICT (server has v${r.serverVersion}) - re-run sync`);
		} else if (r.status === "bad_hash") {
			logger.error(`✗ ${r.fileId} INTEGRITY CHECK FAILED (server rejected content hash)`);
		}
	}
}

type PullContext = {
	state: SyncState;
	fileMapById: Map<string, FileEntry>;
	fileMapByPath: Map<string, FileEntry>;
	obfuscator: PathObfuscator;
	fingerprinter: FingerprintStrategy;
	logger: Logger;
	fileStore: FileStore;
	normalizePath: (path: string) => string;
	now: () => number;
	snapshotStore?: SnapshotStore;
	serverChangedFiles: Set<string>;
	conflicts: Array<ConflictInfo>;
	conflictChanges: Map<string, { change: PullResponse["changes"][number]; existing: FileEntry; fingerprint: string }>;
};

type ChangeWithPath = {
	change: PullResponse["changes"][number];
	clientPath: string;
	existing: FileEntry | undefined;
	wasRenamed: boolean;
	oldClientPath: string | undefined;
};

function prepareChangeContext(ctx: PullContext, change: PullResponse["changes"][number]): ChangeWithPath {
	const existing = ctx.fileMapById.get(change.fileId);
	const clientPath = ctx.normalizePath(existing?.clientPath ?? ctx.obfuscator.deobfuscate(change.serverPath));

	let wasRenamed = false;
	let oldClientPath: string | undefined;
	if (existing && existing.clientPath !== clientPath) {
		oldClientPath = existing.clientPath;
		ctx.fileMapByPath.delete(existing.clientPath);
		existing.clientPath = clientPath;
		if (!existing.deleted) {
			ctx.fileMapByPath.set(clientPath, existing);
		}
		wasRenamed = true;
	}

	return { change, clientPath, existing, wasRenamed, oldClientPath };
}

async function handleDeletedChange(ctx: PullContext, info: ChangeWithPath): Promise<void> {
	const { clientPath, existing, change } = info;
	if (existing) {
		const trashPath = await ctx.fileStore.moveToTrash(clientPath);
		if (trashPath) {
			ctx.logger.info(`[TRASHED] ${clientPath} -> ${trashPath}`);
		}
		existing.deleted = true;
		existing.deletedAt = ctx.now();
		existing.trashPath = trashPath ?? existing.trashPath;
		existing.serverVersion = change.version;
		ctx.fileMapByPath.delete(clientPath);
		ctx.logger.info(`[DELETED] ${clientPath}`);
		if (ctx.snapshotStore) {
			await ctx.snapshotStore.remove(change.fileId);
		}
	} else {
		ctx.logger.warn(`PULL: delete for unknown fileId ${change.fileId}`);
	}
}

function validateContentHash(ctx: PullContext, change: PullResponse["changes"][number]): boolean {
	if (change.contentHash) {
		const integrityHash = integrityHashFromContent(change.content ?? "");
		if (integrityHash !== change.contentHash) {
			ctx.logger.error(`PULL: integrity check failed for ${change.fileId} (${change.serverPath}) - skipping`);
			return false;
		}
	} else {
		ctx.logger.warn(`PULL: missing content hash for ${change.fileId} (${change.serverPath})`);
	}
	return true;
}

async function handleServerRename(ctx: PullContext, info: ChangeWithPath): Promise<void> {
	const { existing, wasRenamed, oldClientPath, clientPath, change } = info;
	if (!existing || !wasRenamed || !oldClientPath) {
		return;
	}
	if (await ctx.fileStore.exists(oldClientPath)) {
		const renamed = await ctx.fileStore.rename(oldClientPath, clientPath);
		if (renamed) {
			ctx.logger.info(`[MOVED] ${oldClientPath} -> ${clientPath}`);
			existing.serverPath = change.serverPath;
			ctx.serverChangedFiles.add(clientPath);
		} else {
			ctx.logger.warn(`PULL: failed to rename ${oldClientPath} -> ${clientPath}`);
		}
	}
}

async function writeServerContent(
	ctx: PullContext,
	existing: FileEntry,
	clientPath: string,
	change: PullResponse["changes"][number],
	fingerprint: string,
): Promise<void> {
	if (change.content === undefined) {
		return;
	}
	// Inject frontmatter with fileId to ensure tracking works after pull
	const contentWithJrn = injectJrn(change.content, change.fileId);
	const fingerprintWithJrn = ctx.fingerprinter.computeFromContent(contentWithJrn);

	await ctx.fileStore.writeText(clientPath, contentWithJrn);
	existing.serverVersion = change.version;
	existing.fingerprint = fingerprintWithJrn;
	existing.conflicted = false;
	existing.conflictAt = undefined;
	existing.conflictServerVersion = undefined;
	if (ctx.snapshotStore) {
		await ctx.snapshotStore.save(change.fileId, contentWithJrn);
	}
	ctx.logger.info(`[UPDATED] ${clientPath} -> v${change.version}`);
	ctx.serverChangedFiles.add(clientPath);
}

async function handleExistingFileUpdate(ctx: PullContext, info: ChangeWithPath, fingerprint: string): Promise<void> {
	const { existing, clientPath, change } = info;
	if (!existing || change.content === undefined) {
		return;
	}

	const serverIsNewer = existing.serverVersion < change.version;

	if (!(await ctx.fileStore.exists(clientPath))) {
		// File doesn't exist locally - write server content if newer
		if (serverIsNewer) {
			await writeServerContent(ctx, existing, clientPath, change, fingerprint);
		}
		return;
	}

	const localContent = await ctx.fileStore.readText(clientPath);
	const localFingerprint = ctx.fingerprinter.computeFromContent(localContent);
	const hasLocalChanges = localFingerprint !== existing.fingerprint;

	if (hasLocalChanges && serverIsNewer) {
		const baseContent = ctx.snapshotStore ? await ctx.snapshotStore.load(change.fileId) : null;
		ctx.conflicts.push({
			fileId: change.fileId,
			clientPath,
			localContent,
			serverContent: change.content,
			serverVersion: change.version,
			baseContent,
		});
		ctx.conflictChanges.set(change.fileId, { change, existing, fingerprint });
	} else if (serverIsNewer) {
		await writeServerContent(ctx, existing, clientPath, change, fingerprint);
	}
}

async function handlePulledNewFile(ctx: PullContext, info: ChangeWithPath, fingerprint: string): Promise<void> {
	const { clientPath, change } = info;
	if (change.content === undefined) {
		return;
	}

	// Inject frontmatter with fileId so CLI can track this file for future pushes
	const contentWithJrn = injectJrn(change.content, change.fileId);
	const fingerprintWithJrn = ctx.fingerprinter.computeFromContent(contentWithJrn);

	await ctx.fileStore.writeText(clientPath, contentWithJrn);
	const newEntry = {
		clientPath,
		fileId: change.fileId,
		serverPath: change.serverPath,
		fingerprint: fingerprintWithJrn,
		serverVersion: change.version,
	};
	ctx.state.files.push(newEntry);
	ctx.fileMapByPath.set(clientPath, newEntry);
	ctx.fileMapById.set(change.fileId, newEntry);
	if (ctx.snapshotStore) {
		await ctx.snapshotStore.save(change.fileId, contentWithJrn);
	}
	ctx.logger.info(`[NEW] ${clientPath} (v${change.version})`);
	ctx.serverChangedFiles.add(clientPath);
}

async function handleContentChange(ctx: PullContext, info: ChangeWithPath): Promise<void> {
	const { existing, change, clientPath } = info;
	if (change.content === undefined) {
		return;
	}

	if (!validateContentHash(ctx, change)) {
		return;
	}

	const fingerprint = ctx.fingerprinter.computeFromContent(change.content);

	if (existing) {
		if (existing.deleted) {
			existing.deleted = false;
			existing.deletedAt = undefined;
			existing.trashPath = undefined;
			ctx.fileMapByPath.set(clientPath, existing);
		}

		await handleServerRename(ctx, info);
		await handleExistingFileUpdate(ctx, info, fingerprint);
	} else {
		await handlePulledNewFile(ctx, info, fingerprint);
	}
}

async function processMergeResults(ctx: PullContext, merger: MergeStrategy): Promise<void> {
	if (ctx.conflicts.length === 0) {
		return;
	}

	ctx.logger.warn(`MERGE: Handling ${ctx.conflicts.length} conflict(s)...`);
	const mergeResults = await merger.merge(ctx.conflicts);

	for (const result of mergeResults) {
		const meta = ctx.conflictChanges.get(result.fileId);
		if (!meta) {
			continue;
		}

		// Ensure frontmatter is present after merge (merge might lose it in edge cases)
		const contentWithJrn = injectJrn(result.resolved, result.fileId);
		await ctx.fileStore.writeText(result.clientPath, contentWithJrn);
		meta.existing.fingerprint = ctx.fingerprinter.computeFromContent(contentWithJrn);
		meta.existing.serverVersion = meta.change.version;

		if (ctx.snapshotStore && meta.change.content !== undefined) {
			const snapshotWithJrn = injectJrn(meta.change.content, result.fileId);
			await ctx.snapshotStore.save(result.fileId, snapshotWithJrn);
		}

		if (result.action === "conflict-marker") {
			meta.existing.conflicted = true;
			meta.existing.conflictAt = ctx.now();
			meta.existing.conflictServerVersion = meta.change.version;
			ctx.logger.warn(`[CONFLICT] ${result.clientPath} marked with conflict markers`);
		} else {
			meta.existing.conflicted = false;
			meta.existing.conflictAt = undefined;
			meta.existing.conflictServerVersion = undefined;
			ctx.logger.info(`[RESOLVED] ${result.clientPath} (${result.action})`);
		}
		ctx.serverChangedFiles.add(result.clientPath);
	}
}

async function pullFromServer(
	state: SyncState,
	fileMapById: Map<string, FileEntry>,
	fileMapByPath: Map<string, FileEntry>,
	obfuscator: PathObfuscator,
	fingerprinter: FingerprintStrategy,
	merger: MergeStrategy,
	logger: Logger,
	fileStore: FileStore,
	transport: SyncTransport,
	normalizePath: (path: string) => string,
	now: () => number,
	snapshotStore?: SnapshotStore,
): Promise<Set<string>> {
	logger.info("PULL: Fetching server changes...");

	let pullRes: PullResponse;
	try {
		pullRes = await transport.pull(state.lastCursor);
	} catch (err) {
		logError(logger, err, "Pull failed");
		return new Set<string>();
	}

	const { newCursor, changes } = pullRes;
	const ctx: PullContext = {
		state,
		fileMapById,
		fileMapByPath,
		obfuscator,
		fingerprinter,
		logger,
		fileStore,
		normalizePath,
		now,
		snapshotStore,
		serverChangedFiles: new Set<string>(),
		conflicts: [],
		conflictChanges: new Map(),
	};

	if (changes.length > 0) {
		logger.info(`PULL: Received ${changes.length} change(s) from server`);

		for (const change of changes) {
			const info = prepareChangeContext(ctx, change);

			if (change.deleted) {
				await handleDeletedChange(ctx, info);
			} else if (change.content !== undefined) {
				await handleContentChange(ctx, info);
			}
		}

		await processMergeResults(ctx, merger);
	} else {
		logger.info("PULL: Already up to date with server");
	}

	state.lastCursor = newCursor;
	return ctx.serverChangedFiles;
}

type PushContext = {
	state: SyncState;
	fileMapByPath: Map<string, FileEntry>;
	fileMapById: Map<string, FileEntry>;
	obfuscator: PathObfuscator;
	fingerprinter: FingerprintStrategy;
	logger: Logger;
	fileStore: FileStore;
	idGenerator: () => string;
	ops: Array<PushOp>;
	contentByFileId: Map<string, string>;
	processedFileIds: Set<string>;
};

type FileInfo = {
	clientPath: string;
	content: string;
	frontmatterId: string | null;
	existingByPath: FileEntry | undefined;
};

function checkConflictMarkers(ctx: PushContext, info: FileInfo): boolean {
	const { existingByPath, clientPath, content } = info;

	if (existingByPath?.conflicted) {
		if (hasConflictMarkers(content)) {
			ctx.logger.warn(`[SKIP-CONFLICT] ${clientPath} has unresolved conflict markers`);
			ctx.processedFileIds.add(existingByPath.fileId);
			return true;
		}
		existingByPath.conflicted = false;
		existingByPath.conflictAt = undefined;
		existingByPath.conflictServerVersion = undefined;
		ctx.logger.info(`[RESOLVED] ${clientPath} conflict markers cleared`);
	} else if (hasConflictMarkers(content)) {
		ctx.logger.warn(`[SKIP-CONFLICT] ${clientPath} has unresolved conflict markers`);
		if (existingByPath) {
			ctx.processedFileIds.add(existingByPath.fileId);
		}
		return true;
	}
	return false;
}

function handleRenamedOrRestoredFile(ctx: PushContext, info: FileInfo): boolean {
	const { frontmatterId, clientPath, content } = info;
	if (!frontmatterId) {
		return false;
	}

	const existingById = ctx.fileMapById.get(frontmatterId);
	if (!existingById || (existingById.clientPath === clientPath && !existingById.deleted)) {
		return false;
	}

	const previousPath = existingById.clientPath;
	const wasDeleted = existingById.deleted === true;
	const newServerPath = ctx.obfuscator.obfuscate(clientPath);
	const fingerprint = ctx.fingerprinter.computeFromContent(content);

	ctx.ops.push({
		type: "upsert",
		fileId: frontmatterId,
		serverPath: newServerPath,
		baseVersion: existingById.serverVersion,
		content,
		contentHash: integrityHashFromContent(content),
	});
	ctx.contentByFileId.set(frontmatterId, content);

	existingById.clientPath = clientPath;
	existingById.serverPath = newServerPath;
	existingById.fingerprint = fingerprint;
	existingById.deleted = false;
	existingById.deletedAt = undefined;
	existingById.trashPath = undefined;
	if (!wasDeleted) {
		ctx.fileMapByPath.delete(previousPath);
	}
	ctx.fileMapByPath.set(clientPath, existingById);
	ctx.processedFileIds.add(frontmatterId);

	const label = wasDeleted ? "RESTORED" : "RENAMED";
	ctx.logger.info(`[${label}] ${previousPath} -> ${clientPath}`);
	return true;
}

async function handlePushedNewFile(ctx: PushContext, info: FileInfo, fingerprint: string): Promise<void> {
	const { clientPath, content, frontmatterId } = info;
	const fileId = frontmatterId ?? ctx.idGenerator();
	const serverPath = ctx.obfuscator.obfuscate(clientPath);

	let contentToSend = content;
	if (!frontmatterId) {
		contentToSend = injectJrn(content, fileId);
		await ctx.fileStore.writeText(clientPath, contentToSend);
	}

	ctx.ops.push({
		type: "upsert",
		fileId,
		serverPath,
		baseVersion: 0,
		content: contentToSend,
		contentHash: integrityHashFromContent(contentToSend),
	});
	ctx.contentByFileId.set(fileId, contentToSend);
	const newEntry: FileEntry = { clientPath, fileId, serverPath, fingerprint, serverVersion: 0 };
	ctx.state.files.push(newEntry);
	ctx.fileMapByPath.set(clientPath, newEntry);
	ctx.fileMapById.set(fileId, newEntry);
	ctx.processedFileIds.add(fileId);
	ctx.logger.info(`[NEW] ${clientPath}`);
}

async function handleChangedFile(ctx: PushContext, info: FileInfo, fingerprint: string): Promise<void> {
	const { clientPath, content, frontmatterId, existingByPath } = info;
	if (!existingByPath) {
		return;
	}

	ctx.processedFileIds.add(existingByPath.fileId);

	let contentToSend = content;
	if (!frontmatterId) {
		contentToSend = injectJrn(content, existingByPath.fileId);
		await ctx.fileStore.writeText(clientPath, contentToSend);
	}

	ctx.ops.push({
		type: "upsert",
		fileId: existingByPath.fileId,
		serverPath: existingByPath.serverPath,
		baseVersion: existingByPath.serverVersion,
		content: contentToSend,
		contentHash: integrityHashFromContent(contentToSend),
	});
	ctx.contentByFileId.set(existingByPath.fileId, contentToSend);
	existingByPath.fingerprint = fingerprint;
	ctx.logger.info(`[CHANGED] ${clientPath}`);
}

function collectDeleteOps(ctx: PushContext, localPathSet: Set<string>): void {
	for (const entry of ctx.state.files) {
		if (entry.deleted) {
			continue;
		}
		if (!localPathSet.has(entry.clientPath) && !ctx.processedFileIds.has(entry.fileId)) {
			ctx.ops.push({
				type: "delete",
				fileId: entry.fileId,
				serverPath: entry.serverPath,
				baseVersion: entry.serverVersion,
			});
			ctx.logger.info(`[DELETED] ${entry.clientPath}`);
		}
	}
}

async function pushToServer(
	state: SyncState,
	fileMapByPath: Map<string, FileEntry>,
	fileMapById: Map<string, FileEntry>,
	obfuscator: PathObfuscator,
	fingerprinter: FingerprintStrategy,
	scanner: FileScanner,
	skipFiles: Set<string>,
	logger: Logger,
	fileStore: FileStore,
	transport: SyncTransport,
	idGenerator: () => string,
	normalizePath: (path: string) => string,
	pendingStore: PendingOpsStore,
	now: () => number,
	stateStore: StateStore,
	pushMetadata?: PushMetadata,
	snapshotStore?: SnapshotStore,
): Promise<void> {
	logger.info("PUSH: Scanning local changes...");
	const stateBeforeScan = cloneSyncState(state);
	const localFiles = await scanner.getFiles(state.config);
	const localPathSet = new Set(localFiles.map(p => normalizePath(p)));

	const ctx: PushContext = {
		state,
		fileMapByPath,
		fileMapById,
		obfuscator,
		fingerprinter,
		logger,
		fileStore,
		idGenerator,
		ops: [],
		contentByFileId: new Map<string, string>(),
		processedFileIds: new Set<string>(),
	};

	for (const rawPath of localFiles) {
		const clientPath = normalizePath(rawPath);
		if (skipFiles.has(clientPath)) {
			logger.info(`[SKIP-PUSH] ${clientPath} (just pulled)`);
			continue;
		}

		const content = await fileStore.readText(clientPath);
		const info: FileInfo = {
			clientPath,
			content,
			frontmatterId: extractJrn(content),
			existingByPath: fileMapByPath.get(clientPath),
		};

		if (checkConflictMarkers(ctx, info)) {
			continue;
		}

		if (handleRenamedOrRestoredFile(ctx, info)) {
			continue;
		}

		const fingerprint = fingerprinter.computeFromContent(content);

		if (!info.existingByPath) {
			await handlePushedNewFile(ctx, info, fingerprint);
		} else if (info.existingByPath.fingerprint !== fingerprint) {
			await handleChangedFile(ctx, info, fingerprint);
		} else {
			ctx.processedFileIds.add(info.existingByPath.fileId);
		}
	}

	collectDeleteOps(ctx, localPathSet);

	if (ctx.ops.length === 0) {
		logger.info("PUSH: No local changes to push");
		return;
	}

	const clientChangesetId = idGenerator();
	await pendingStore.save({
		clientChangesetId,
		createdAt: now(),
		targetBranch: "main",
		ops: ctx.ops,
		...(pushMetadata?.message !== undefined ? { message: pushMetadata.message } : {}),
		...(pushMetadata?.mergePrompt !== undefined ? { mergePrompt: pushMetadata.mergePrompt } : {}),
	});
	await stateStore.save(state);

	const deletedFileIdSet = getDeletedFileIds(ctx.ops);
	logger.info(`PUSH: Pushing ${ctx.ops.length} file(s)...`);

	let pushRes: PushResponse;
	try {
		pushRes = await transport.push(clientChangesetId, ctx.ops, pushMetadata);
	} catch (err) {
		if (isNonRetriableClientChangesetReuse(err)) {
			restoreSyncState(state, stateBeforeScan);
			rebuildFileMaps(state, fileMapByPath, fileMapById);
			await pendingStore.clear();
			await stateStore.save(state);
			logger.warn(
				"PUSH: detected non-retriable clientChangesetId conflict; rolled back local sync state and cleared pending ops",
			);
		}
		logError(logger, err, "Push failed");
		return;
	}

	await applyPushResults(
		state,
		fileMapByPath,
		pushRes.results,
		deletedFileIdSet,
		logger,
		now,
		snapshotStore,
		ctx.contentByFileId,
	);
	state.lastCursor = pushRes.newCursor;
	await pendingStore.clear();
}

export async function sync(deps: SyncDependencies, mode: SyncMode = "full"): Promise<void> {
	const {
		logger,
		transport,
		fileStore,
		stateStore,
		pendingStore,
		scanner,
		obfuscator,
		fingerprinter,
		snapshotStore,
		merger = conflictMarkerStrategy,
		idGenerator,
		pushMetadata,
		normalizePath = defaultNormalize,
		now = defaultNow,
	} = deps;

	const modeLabel = mode === "full" ? "full sync" : mode === "up-only" ? "push only" : "pull only";
	logger.info(`SYNC: Starting ${modeLabel}...`);

	const state = await stateStore.load();
	const fileMapByPath = new Map(state.files.filter(f => !f.deleted).map(f => [f.clientPath, f]));
	const fileMapById = new Map(state.files.map(f => [f.fileId, f]));
	if (snapshotStore?.purge) {
		await snapshotStore.purge(state);
	}

	const pending = await pendingStore.load();
	if (pending) {
		logger.warn(`PENDING: Found ${pending.ops.length} op(s), resending ${pending.clientChangesetId}`);
		const deletedFileIdSet = getDeletedFileIds(pending.ops);
		let pendingRes: PushResponse;
		try {
			pendingRes = await transport.push(pending.clientChangesetId, pending.ops, {
				...(pending.message !== undefined ? { message: pending.message } : {}),
				...(pending.mergePrompt !== undefined ? { mergePrompt: pending.mergePrompt } : {}),
			});
		} catch (err) {
			if (isNonRetriableClientChangesetReuse(err)) {
				const rewound = rewindStateForPendingOps(state, pending, `PENDING_REWIND_${now()}`);
				await pendingStore.clear();
				logger.warn(
					`PENDING: detected non-retriable clientChangesetId conflict; cleared pending ops and rewound ${rewound} file state entr${rewound === 1 ? "y" : "ies"}`,
				);
			}
			logError(logger, err, "PENDING: push failed");
			await stateStore.save(state);
			return;
		}

		const pendingContentByFileId = new Map<string, string>();
		for (const op of pending.ops) {
			if (op.type === "upsert" && op.content !== undefined) {
				pendingContentByFileId.set(op.fileId, op.content);
			}
		}
		await applyPushResults(
			state,
			fileMapByPath,
			pendingRes.results,
			deletedFileIdSet,
			logger,
			now,
			snapshotStore,
			pendingContentByFileId,
		);
		state.lastCursor = pendingRes.newCursor;
		await pendingStore.clear();
	}

	let serverChangedFiles = new Set<string>();

	if (mode === "full" || mode === "down-only") {
		serverChangedFiles = await pullFromServer(
			state,
			fileMapById,
			fileMapByPath,
			obfuscator,
			fingerprinter,
			merger,
			logger,
			fileStore,
			transport,
			normalizePath,
			now,
			snapshotStore,
		);
	}

	if (mode === "full" || mode === "up-only") {
		await pushToServer(
			state,
			fileMapByPath,
			fileMapById,
			obfuscator,
			fingerprinter,
			scanner,
			serverChangedFiles,
			logger,
			fileStore,
			transport,
			idGenerator,
			normalizePath,
			pendingStore,
			now,
			stateStore,
			pushMetadata,
			snapshotStore,
		);
	}

	await stateStore.save(state);
	logger.info("SYNC: Complete.");
}
