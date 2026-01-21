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
} from "../client/types";
import { type PullResponse, type PushOp, PushOpSchema, type PushResponse } from "../reference-server/types";
import type { Logger } from "./logger";
import { logError } from "./logger";
import { threeWayMerge } from "./smart-merge";
import {
	extractJrn,
	formatConflictMarkers,
	hasConflictMarkers,
	injectJrn,
	integrityHashFromContent,
} from "./sync-helpers";
import { z } from "zod";

// =============================================================================
// Schemas
// =============================================================================

export const PendingOpsSchema = z.object({
	requestId: z.string(),
	createdAt: z.number(),
	ops: z.array(PushOpSchema),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type PendingOps = z.infer<typeof PendingOpsSchema>;

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
	push: (requestId: string, ops: Array<PushOp>) => Promise<PushResponse>;
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
				const merged = threeWayMerge(conflict.baseContent, conflict.localContent, conflict.serverContent);
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
			} else {
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
		} else if (r.status === "conflict") {
			logger.warn(`✗ ${r.fileId} CONFLICT (server has v${r.serverVersion}) - re-run sync`);
		} else if (r.status === "bad_hash") {
			logger.error(`✗ ${r.fileId} INTEGRITY CHECK FAILED (server rejected content hash)`);
		}
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
	const serverChangedFiles = new Set<string>();

	let pullRes: PullResponse;
	try {
		pullRes = await transport.pull(state.lastCursor);
	} catch (err) {
		logError(logger, err, "Pull failed");
		return serverChangedFiles;
	}

	const { newCursor, changes } = pullRes;
	const conflicts: Array<ConflictInfo> = [];
	const conflictChanges: Map<
		string,
		{ change: PullResponse["changes"][number]; existing: FileEntry; fingerprint: string }
	> = new Map();

	if (changes.length > 0) {
		logger.info(`PULL: Received ${changes.length} change(s) from server`);

		for (const change of changes) {
			const existing = fileMapById.get(change.fileId);
			const clientPath = normalizePath(existing?.clientPath ?? obfuscator.deobfuscate(change.serverPath));

			let wasRenamed = false;
			let oldClientPath: string | undefined;
			if (existing && existing.clientPath !== clientPath) {
				oldClientPath = existing.clientPath;
				fileMapByPath.delete(existing.clientPath);
				existing.clientPath = clientPath;
				if (!existing.deleted) {
					fileMapByPath.set(clientPath, existing);
				}
				wasRenamed = true;
			}

			if (change.deleted) {
				if (existing) {
					const trashPath = await fileStore.moveToTrash(clientPath);
					if (trashPath) {
						logger.info(`[TRASHED] ${clientPath} -> ${trashPath}`);
					}
					existing.deleted = true;
					existing.deletedAt = now();
					existing.trashPath = trashPath ?? existing.trashPath;
					existing.serverVersion = change.version;
					fileMapByPath.delete(clientPath);
					logger.info(`[DELETED] ${clientPath}`);
					if (snapshotStore) {
						await snapshotStore.remove(change.fileId);
					}
				} else {
					logger.warn(`PULL: delete for unknown fileId ${change.fileId}`);
				}
			} else if (change.content !== undefined) {
				if (change.contentHash) {
					const integrityHash = integrityHashFromContent(change.content);
					if (integrityHash !== change.contentHash) {
						logger.error(
							`PULL: integrity check failed for ${change.fileId} (${change.serverPath}) - skipping`,
						);
						continue;
					}
				} else {
					logger.warn(`PULL: missing content hash for ${change.fileId} (${change.serverPath})`);
				}

				const fingerprint = fingerprinter.computeFromContent(change.content);

				if (existing) {
					if (existing.deleted) {
						existing.deleted = false;
						existing.deletedAt = undefined;
						existing.trashPath = undefined;
						fileMapByPath.set(clientPath, existing);
					}

					// Handle server-side rename: move the file on disk
					if (wasRenamed && oldClientPath && (await fileStore.exists(oldClientPath))) {
						const renamed = await fileStore.rename(oldClientPath, clientPath);
						if (renamed) {
							logger.info(`[MOVED] ${oldClientPath} -> ${clientPath}`);
							existing.serverPath = change.serverPath;
							serverChangedFiles.add(clientPath);
						} else {
							logger.warn(`PULL: failed to rename ${oldClientPath} -> ${clientPath}`);
						}
					}

					if (await fileStore.exists(clientPath)) {
						const localContent = await fileStore.readText(clientPath);
						const localFingerprint = fingerprinter.computeFromContent(localContent);

						if (localFingerprint !== existing.fingerprint && existing.serverVersion < change.version) {
							const baseContent = snapshotStore ? await snapshotStore.load(change.fileId) : null;
							conflicts.push({
								fileId: change.fileId,
								clientPath,
								localContent,
								serverContent: change.content,
								serverVersion: change.version,
								baseContent,
							});
							conflictChanges.set(change.fileId, { change, existing, fingerprint });
						} else if (existing.serverVersion < change.version) {
							await fileStore.writeText(clientPath, change.content);
							existing.serverVersion = change.version;
							existing.fingerprint = fingerprint;
							existing.conflicted = false;
							existing.conflictAt = undefined;
							existing.conflictServerVersion = undefined;
							if (snapshotStore) {
								await snapshotStore.save(change.fileId, change.content);
							}
							logger.info(`[UPDATED] ${clientPath} -> v${change.version}`);
							serverChangedFiles.add(clientPath);
						}
					}
				} else {
					await fileStore.writeText(clientPath, change.content);
					const newEntry = {
						clientPath,
						fileId: change.fileId,
						serverPath: change.serverPath,
						fingerprint,
						serverVersion: change.version,
					};
					state.files.push(newEntry);
					fileMapByPath.set(clientPath, newEntry);
					fileMapById.set(change.fileId, newEntry);
					if (snapshotStore) {
						await snapshotStore.save(change.fileId, change.content);
					}
					logger.info(`[NEW] ${clientPath} (v${change.version})`);
					serverChangedFiles.add(clientPath);
				}
			}
		}

		if (conflicts.length > 0) {
			logger.warn(`MERGE: Handling ${conflicts.length} conflict(s)...`);
			const mergeResults = await merger.merge(conflicts);
			for (const result of mergeResults) {
				const meta = conflictChanges.get(result.fileId);
				if (meta) {
					await fileStore.writeText(result.clientPath, result.resolved);
					meta.existing.fingerprint = fingerprinter.computeFromContent(result.resolved);
					meta.existing.serverVersion = meta.change.version;
					if (snapshotStore && meta.change.content !== undefined) {
						await snapshotStore.save(result.fileId, meta.change.content);
					}
					if (result.action === "conflict-marker") {
						meta.existing.conflicted = true;
						meta.existing.conflictAt = now();
						meta.existing.conflictServerVersion = meta.change.version;
						logger.warn(`[CONFLICT] ${result.clientPath} marked with conflict markers`);
					} else {
						meta.existing.conflicted = false;
						meta.existing.conflictAt = undefined;
						meta.existing.conflictServerVersion = undefined;
						logger.info(`[RESOLVED] ${result.clientPath} (${result.action})`);
					}
					serverChangedFiles.add(result.clientPath);
				}
			}
		}
	} else {
		logger.info("PULL: Already up to date with server");
	}

	state.lastCursor = newCursor;
	return serverChangedFiles;
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
	snapshotStore?: SnapshotStore,
): Promise<void> {
	logger.info("PUSH: Scanning local changes...");
	const localFiles = await scanner.getFiles(state.config);
	const localPathSet = new Set(localFiles.map(p => normalizePath(p)));
	const ops: Array<PushOp> = [];
	const contentByFileId = new Map<string, string>();
	const processedFileIds = new Set<string>();

	for (const rawPath of localFiles) {
		const clientPath = normalizePath(rawPath);
		if (skipFiles.has(clientPath)) {
			logger.info(`[SKIP-PUSH] ${clientPath} (just pulled)`);
			continue;
		}

		const content = await fileStore.readText(clientPath);
		const frontmatterId = extractJrn(content);
		const existingByPath = fileMapByPath.get(clientPath);

		if (existingByPath?.conflicted) {
			if (hasConflictMarkers(content)) {
				logger.warn(`[SKIP-CONFLICT] ${clientPath} has unresolved conflict markers`);
				processedFileIds.add(existingByPath.fileId);
				continue;
			}
			existingByPath.conflicted = false;
			existingByPath.conflictAt = undefined;
			existingByPath.conflictServerVersion = undefined;
			logger.info(`[RESOLVED] ${clientPath} conflict markers cleared`);
		} else if (hasConflictMarkers(content)) {
			logger.warn(`[SKIP-CONFLICT] ${clientPath} has unresolved conflict markers`);
			if (existingByPath) {
				processedFileIds.add(existingByPath.fileId);
			}
			continue;
		}

		if (frontmatterId) {
			const existingById = fileMapById.get(frontmatterId);
			if (existingById && (existingById.clientPath !== clientPath || existingById.deleted)) {
				const previousPath = existingById.clientPath;
				const wasDeleted = existingById.deleted === true;
				const newServerPath = obfuscator.obfuscate(clientPath);
				const fingerprint = fingerprinter.computeFromContent(content);

				ops.push({
					type: "upsert",
					fileId: frontmatterId,
					serverPath: newServerPath,
					baseVersion: existingById.serverVersion,
					content,
					contentHash: integrityHashFromContent(content),
				});
				contentByFileId.set(frontmatterId, content);

				existingById.clientPath = clientPath;
				existingById.serverPath = newServerPath;
				existingById.fingerprint = fingerprint;
				existingById.deleted = false;
				existingById.deletedAt = undefined;
				existingById.trashPath = undefined;
				if (!wasDeleted) {
					fileMapByPath.delete(previousPath);
				}
				fileMapByPath.set(clientPath, existingById);
				processedFileIds.add(frontmatterId);

				const label = wasDeleted ? "RESTORED" : "RENAMED";
				logger.info(`[${label}] ${previousPath} -> ${clientPath}`);
				continue;
			}
		}

		const fingerprint = fingerprinter.computeFromContent(content);

		if (!existingByPath) {
			const fileId = frontmatterId ?? idGenerator();
			const serverPath = obfuscator.obfuscate(clientPath);

			let contentToSend = content;
			if (!frontmatterId) {
				contentToSend = injectJrn(content, fileId);
				await fileStore.writeText(clientPath, contentToSend);
			}

			ops.push({
				type: "upsert",
				fileId,
				serverPath,
				baseVersion: 0,
				content: contentToSend,
				contentHash: integrityHashFromContent(contentToSend),
			});
			contentByFileId.set(fileId, contentToSend);
			const newEntry: FileEntry = { clientPath, fileId, serverPath, fingerprint, serverVersion: 0 };
			state.files.push(newEntry);
			fileMapByPath.set(clientPath, newEntry);
			fileMapById.set(fileId, newEntry);
			processedFileIds.add(fileId);
			logger.info(`[NEW] ${clientPath}`);
		} else if (existingByPath.fingerprint !== fingerprint) {
			processedFileIds.add(existingByPath.fileId);

			let contentToSend = content;
			if (!frontmatterId) {
				contentToSend = injectJrn(content, existingByPath.fileId);
				await fileStore.writeText(clientPath, contentToSend);
			}

			ops.push({
				type: "upsert",
				fileId: existingByPath.fileId,
				serverPath: existingByPath.serverPath,
				baseVersion: existingByPath.serverVersion,
				content: contentToSend,
				contentHash: integrityHashFromContent(contentToSend),
			});
			contentByFileId.set(existingByPath.fileId, contentToSend);
			existingByPath.fingerprint = fingerprint;
			logger.info(`[CHANGED] ${clientPath}`);
		} else {
			processedFileIds.add(existingByPath.fileId);
		}
	}

	for (const entry of state.files) {
		if (entry.deleted) {
			continue;
		}
		if (!localPathSet.has(entry.clientPath) && !processedFileIds.has(entry.fileId)) {
			ops.push({
				type: "delete",
				fileId: entry.fileId,
				serverPath: entry.serverPath,
				baseVersion: entry.serverVersion,
			});
			logger.info(`[DELETED] ${entry.clientPath}`);
		}
	}

	if (ops.length === 0) {
		logger.info("PUSH: No local changes to push");
		return;
	}

	const requestId = idGenerator();
	await pendingStore.save({ requestId, createdAt: now(), ops });
	await stateStore.save(state);

	const deletedFileIdSet = getDeletedFileIds(ops);
	logger.info(`PUSH: Pushing ${ops.length} file(s)...`);

	let pushRes: PushResponse;
	try {
		pushRes = await transport.push(requestId, ops);
	} catch (err) {
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
		contentByFileId,
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
		logger.warn(`PENDING: Found ${pending.ops.length} op(s), resending ${pending.requestId}`);
		const deletedFileIdSet = getDeletedFileIds(pending.ops);
		let pendingRes: PushResponse;
		try {
			pendingRes = await transport.push(pending.requestId, pending.ops);
		} catch (err) {
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
			snapshotStore,
		);
	}

	await stateStore.save(state);
	logger.info("SYNC: Complete.");
}
