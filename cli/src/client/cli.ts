// Jolli CLI
// Usage: bun src/client/cli.ts [command]

import type { PullResponse, PushResponse } from "../reference-server/types";
import { getConfig } from "../shared/config";
import { getLog, logError } from "../shared/logger";
import type {
	FileStore,
	PendingOpsStore,
	SnapshotStore,
	StateStore,
	SyncDependencies,
	SyncTransport,
} from "../shared/sync";
import { conflictMarkerStrategy, sync as runSync } from "../shared/sync";
import {
	extractJrn,
	fingerprintFromContent,
	injectJrn,
	normalizeClientPath,
	normalizeGlobPattern,
	removeJrnFromContent,
} from "../shared/sync-helpers";
import { clearAuthToken, loadAuthToken } from "./auth/config";
import { browserLogin } from "./auth/login";
import { clearPendingOps, loadPendingOps, savePendingOps } from "./pending";
import type {
	FileScanner,
	FingerprintStrategy,
	MergeResult,
	MergeStrategy,
	PathObfuscator,
	SyncConfig,
	SyncMode,
	SyncState,
} from "./types";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";

const config = getConfig();
const STATE_FILE = ".jolli/sync.md";
const TRASH_DIR = ".sync/trash";
const SNAPSHOT_DIR = ".jolli/snapshots";
const TOMBSTONE_RETENTION_DAYS = 30;
const TOMBSTONE_RETENTION_MS = TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const logger = getLog(import.meta);
const RETRY_BACKOFF_MS = 500;
const MAX_RETRIES = 1;

function shouldRetryStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function wait(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
	let attempt = 0;
	logger.info(`${label}: ${init.method ?? "GET"} ${url}`);

	while (true) {
		try {
			const res = await fetch(url, init);
			if (!res.ok && shouldRetryStatus(res.status) && attempt < MAX_RETRIES) {
				attempt += 1;
				logger.warn(
					`${label}: ${res.status} - retrying in ${RETRY_BACKOFF_MS}ms (attempt ${attempt}/${MAX_RETRIES})`,
				);
				await wait(RETRY_BACKOFF_MS);
				continue;
			}
			if (!res.ok) {
				logger.warn(`${label}: response ${res.status} ${res.statusText}`);
			}
			return res;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			if (attempt < MAX_RETRIES) {
				attempt += 1;
				logger.warn(
					`${label}: network error (${errMsg}) - retrying in ${RETRY_BACKOFF_MS}ms (attempt ${attempt}/${MAX_RETRIES})`,
				);
				await wait(RETRY_BACKOFF_MS);
				continue;
			}
			logger.error(`${label}: failed to connect to ${url} - ${errMsg}`);
			throw err;
		}
	}
}

async function ensureDir(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true });
}

function sanitizeSnapshotKey(fileId: string): string {
	return fileId.replace(/[^A-Za-z0-9_-]/g, "_");
}

function snapshotPath(fileId: string): string {
	const safeId = sanitizeSnapshotKey(fileId);
	return normalizeClientPath(path.posix.join(SNAPSHOT_DIR, `${safeId}.md`));
}

function legacySnapshotPath(fileId: string): string {
	const safeId = sanitizeSnapshotKey(fileId);
	return normalizeClientPath(path.posix.join(SNAPSHOT_DIR, `${safeId}.txt`));
}

async function readSnapshot(fileId: string): Promise<string | null> {
	try {
		const filePath = snapshotPath(fileId);
		const file = Bun.file(filePath);
		if (await file.exists()) {
			return file.text();
		}

		const legacyPath = legacySnapshotPath(fileId);
		const legacyFile = Bun.file(legacyPath);
		if (await legacyFile.exists()) {
			return legacyFile.text();
		}
		return null;
	} catch (err) {
		logError(logger, err, `SNAPSHOT: failed to read snapshot for ${fileId}`);
		return null;
	}
}

async function writeSnapshot(fileId: string, content: string): Promise<void> {
	const filePath = snapshotPath(fileId);
	try {
		await ensureDir(path.posix.dirname(filePath));
		await Bun.write(filePath, content);
	} catch (err) {
		logError(logger, err, `SNAPSHOT: failed to write ${filePath}`);
	}
}

async function removeSnapshot(fileId: string): Promise<void> {
	try {
		await rm(snapshotPath(fileId), { force: true });
		await rm(legacySnapshotPath(fileId), { force: true });
	} catch (err) {
		if (err && typeof err === "object" && "code" in err) {
			const code = (err as { code?: string }).code;
			if (code === "ENOENT") {
				return;
			}
		}
		logger.warn(`SNAPSHOT: failed to remove snapshot for ${fileId}`);
	}
}

async function purgeSnapshots(state: SyncState): Promise<void> {
	const snapshotRoot = normalizeClientPath(SNAPSHOT_DIR);
	const activeIds = new Set(state.files.filter(f => !f.deleted).map(f => sanitizeSnapshotKey(f.fileId)));

	try {
		const entries = await readdir(snapshotRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) {
				continue;
			}
			if (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt")) {
				continue;
			}
			const ext = entry.name.endsWith(".md") ? ".md" : ".txt";
			const fileId = entry.name.slice(0, -ext.length);
			if (activeIds.has(fileId)) {
				if (ext === ".txt") {
					const mdPath = normalizeClientPath(path.posix.join(snapshotRoot, `${fileId}.md`));
					if (await Bun.file(mdPath).exists()) {
						const entryPath = normalizeClientPath(path.posix.join(snapshotRoot, entry.name));
						await rm(entryPath, { force: true });
						logger.info(`PURGE: removed legacy snapshot ${entryPath}`);
					}
				}
				continue;
			}
			const entryPath = normalizeClientPath(path.posix.join(snapshotRoot, entry.name));
			await rm(entryPath, { force: true });
			logger.info(`PURGE: removed snapshot ${entryPath}`);
		}
	} catch (err) {
		if (err && typeof err === "object" && "code" in err) {
			const code = (err as { code?: string }).code;
			if (code === "ENOENT") {
				return;
			}
		}
		logger.warn("PURGE: failed to scan snapshot directory");
	}
}

function formatTimestampForPath(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, "-");
}

async function moveToTrash(clientPath: string): Promise<string | null> {
	const file = Bun.file(clientPath);
	if (!(await file.exists())) {
		return null;
	}

	const timestamp = formatTimestampForPath();
	const trashPath = normalizeClientPath(`${TRASH_DIR}/${timestamp}/${clientPath}`);
	const trashDir = path.posix.dirname(trashPath);

	try {
		await ensureDir(trashDir);
		await rename(clientPath, trashPath);
		return trashPath;
	} catch (_err) {
		logger.warn(`TRASH: rename failed for ${clientPath}, falling back to copy`);
		try {
			await ensureDir(trashDir);
			const data = await file.arrayBuffer();
			await Bun.write(trashPath, data);
			await Bun.$`rm ${clientPath}`;
			return trashPath;
		} catch (copyErr) {
			logError(logger, copyErr, `TRASH: failed to move ${clientPath}`);
			return null;
		}
	}
}

async function renameFile(oldPath: string, newPath: string): Promise<boolean> {
	const file = Bun.file(oldPath);
	if (!(await file.exists())) {
		return false;
	}

	const newDir = path.posix.dirname(newPath);
	try {
		await ensureDir(newDir);
		await rename(oldPath, newPath);
		return true;
	} catch (_err) {
		logger.warn(`RENAME: rename failed for ${oldPath} -> ${newPath}, falling back to copy`);
		try {
			await ensureDir(newDir);
			const data = await file.arrayBuffer();
			await Bun.write(newPath, data);
			await rm(oldPath, { force: true });
			return true;
		} catch (copyErr) {
			logError(logger, copyErr, `RENAME: failed to move ${oldPath} -> ${newPath}`);
			return false;
		}
	}
}

async function purgeTrash(): Promise<void> {
	const trashRoot = normalizeClientPath(TRASH_DIR);
	try {
		const entries = await readdir(trashRoot, { withFileTypes: true });
		const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const entryPath = normalizeClientPath(`${trashRoot}/${entry.name}`);
			const stats = await stat(entryPath);
			if (stats.mtimeMs < cutoff) {
				await rm(entryPath, { recursive: true, force: true });
				logger.info(`PURGE: removed ${entryPath}`);
			}
		}
	} catch (err) {
		if (err && typeof err === "object" && "code" in err) {
			const code = (err as { code?: string }).code;
			if (code === "ENOENT") {
				return;
			}
		}
		logger.warn("PURGE: failed to scan trash directory");
	}
}

function purgeTombstones(state: SyncState): void {
	const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
	const before = state.files.length;
	state.files = state.files.filter(f => !(f.deleted && f.deletedAt && f.deletedAt < cutoff));
	const removed = before - state.files.length;
	if (removed > 0) {
		logger.info(`PURGE: removed ${removed} tombstone(s) from state`);
	}
}

// =============================================================================
// SECTION: Filesystem Operations
// Scanning, fingerprinting, path obfuscation
// =============================================================================

const passthroughObfuscator: PathObfuscator = {
	obfuscate: p => p,
	deobfuscate: p => p,
};

const hashFingerprint: FingerprintStrategy = {
	compute: async path => {
		const content = await Bun.file(path).text();
		return fingerprintFromContent(content);
	},
	computeFromContent: content => fingerprintFromContent(content),
};

function matchesAnyGlob(path: string, patterns: Array<string>): boolean {
	const normalizedPath = normalizeClientPath(path);
	return patterns.some(pattern => new Bun.Glob(normalizeGlobPattern(pattern)).match(normalizedPath));
}

const recursiveScanner: FileScanner = {
	getFiles: async (config?: SyncConfig) => {
		const includePatterns = (config?.include ?? ["**/*.md"]).map(normalizeGlobPattern);
		const excludePatterns = (config?.exclude ?? []).map(normalizeGlobPattern);
		const results: Array<string> = [];

		for (const pattern of includePatterns) {
			const glob = new Bun.Glob(pattern);
			for await (const path of glob.scan({ cwd: ".", onlyFiles: true })) {
				const normalizedPath = normalizeClientPath(path);
				if (
					normalizedPath === STATE_FILE ||
					normalizedPath.startsWith(".jolli/") ||
					normalizedPath.startsWith(".sync/")
				) {
					continue;
				}
				if (excludePatterns.length > 0 && matchesAnyGlob(normalizedPath, excludePatterns)) {
					continue;
				}
				if (!results.includes(normalizedPath)) {
					results.push(normalizedPath);
				}
			}
		}
		return results;
	},
};

const keepBothStrategy: MergeStrategy = {
	merge: async conflicts => {
		const results: Array<MergeResult> = [];
		for (const conflict of conflicts) {
			const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
			const ext = conflict.clientPath.match(/\.[^.]+$/)?.[0] ?? "";
			const base = conflict.clientPath.slice(0, -ext.length);
			const conflictPath = `${base} (conflict ${timestamp})${ext}`;
			await Bun.write(conflictPath, conflict.serverContent);
			logger.warn(`[CONFLICT] ${conflict.clientPath} -> created ${conflictPath}`);
			results.push({
				fileId: conflict.fileId,
				clientPath: conflict.clientPath,
				resolved: conflict.localContent,
				action: "keep-both",
			});
		}
		return results;
	},
};

function generateId(): string {
	const t = Date.now().toString(36);
	const r = Math.random().toString(36).slice(2, 10);
	return `${t}${r}`.toUpperCase();
}

// =============================================================================
// SECTION: Parser
// YAML frontmatter parsing and serialization for state file
// =============================================================================

function parseYamlList(yaml: string, key: string): Array<string> {
	const section = yaml.match(new RegExp(`${key}:\\s*\\n((?:\\s+-[^\\n]+\\n?)+)`, "m"));
	if (!section?.[1]) {
		return [];
	}
	return [...section[1].matchAll(/^\s+-\s*"?([^"\n]+)"?\s*$/gm)]
		.map(m => m[1]?.trim())
		.filter((s): s is string => !!s);
}

function parseYamlFrontmatter(content: string): SyncState {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) {
		return { lastCursor: 0, files: [] };
	}
	const yaml = match[1];
	const state: SyncState = { lastCursor: 0, files: [] };

	const cursorMatch = yaml.match(/lastCursor:\s*(\d+)/);
	if (cursorMatch?.[1]) {
		state.lastCursor = Number.parseInt(cursorMatch[1]);
	}

	const include = parseYamlList(yaml, "include");
	const exclude = parseYamlList(yaml, "exclude");
	if (include.length > 0 || exclude.length > 0) {
		state.config = {};
		if (include.length > 0) {
			state.config.include = include;
		}
		if (exclude.length > 0) {
			state.config.exclude = exclude;
		}
	}

	const fileMatches = yaml.matchAll(
		/- clientPath: "([^"]+)"\s+fileId: "([^"]+)"\s+serverPath: "([^"]+)"\s+fingerprint: "([^"]+)"\s+serverVersion: (\d+)(?:\s+deleted: (true|false))?(?:\s+deletedAt: (\d+))?(?:\s+trashPath: "([^"]+)")?(?:\s+conflicted: (true|false))?(?:\s+conflictAt: (\d+))?(?:\s+conflictServerVersion: (\d+))?/g,
	);
	for (const m of fileMatches) {
		if (m[1] && m[2] && m[3] && m[4] && m[5]) {
			const deleted = m[6] ? m[6] === "true" : undefined;
			const deletedAt = m[7] ? Number.parseInt(m[7]) : undefined;
			const trashPath = m[8] ? normalizeClientPath(m[8]) : undefined;
			const conflicted = m[9] ? m[9] === "true" : undefined;
			const conflictAt = m[10] ? Number.parseInt(m[10]) : undefined;
			const conflictServerVersion = m[11] ? Number.parseInt(m[11]) : undefined;
			state.files.push({
				clientPath: normalizeClientPath(m[1]),
				fileId: m[2],
				serverPath: normalizeClientPath(m[3]),
				fingerprint: m[4],
				serverVersion: Number.parseInt(m[5]),
				deleted,
				deletedAt,
				trashPath,
				conflicted,
				conflictAt,
				conflictServerVersion,
			});
		}
	}
	return state;
}

function toYamlFrontmatter(state: SyncState): string {
	const parts: Array<string> = [`lastCursor: ${state.lastCursor}`];

	if (state.config?.include?.length) {
		parts.push(`include:\n${state.config.include.map(p => `  - "${p}"`).join("\n")}`);
	}
	if (state.config?.exclude?.length) {
		parts.push(`exclude:\n${state.config.exclude.map(p => `  - "${p}"`).join("\n")}`);
	}

	const filesYaml = state.files
		.map(f => {
			const lines = [
				`  - clientPath: "${f.clientPath}"`,
				`    fileId: "${f.fileId}"`,
				`    serverPath: "${f.serverPath}"`,
				`    fingerprint: "${f.fingerprint}"`,
				`    serverVersion: ${f.serverVersion}`,
			];
			if (f.deleted !== undefined) {
				lines.push(`    deleted: ${f.deleted}`);
			}
			if (f.deletedAt) {
				lines.push(`    deletedAt: ${f.deletedAt}`);
			}
			if (f.trashPath) {
				lines.push(`    trashPath: "${f.trashPath}"`);
			}
			if (f.conflicted !== undefined) {
				lines.push(`    conflicted: ${f.conflicted}`);
			}
			if (f.conflictAt) {
				lines.push(`    conflictAt: ${f.conflictAt}`);
			}
			if (f.conflictServerVersion) {
				lines.push(`    conflictServerVersion: ${f.conflictServerVersion}`);
			}
			return lines.join("\n");
		})
		.join("\n");
	parts.push(`files:\n${filesYaml}`);

	return `---
${parts.join("\n")}
---
# Jolli Sync State
Do not edit manually.
`;
}

async function loadState(): Promise<SyncState> {
	const file = Bun.file(STATE_FILE);
	if (!(await file.exists())) {
		return { lastCursor: 0, files: [] };
	}
	return parseYamlFrontmatter(await file.text());
}

async function saveState(state: SyncState): Promise<void> {
	await Bun.write(STATE_FILE, toYamlFrontmatter(state));
}

// =============================================================================
// SECTION: Sync Engine Wrapper
// =============================================================================

async function sync(mode: SyncMode = "full"): Promise<void> {
	await purgeTrash();

	const transport: SyncTransport = {
		pull: async sinceCursor => {
			const res = await fetchWithRetry(
				`${config.SYNC_SERVER_URL}/v1/sync/pull`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sinceCursor }),
				},
				"PULL",
			);

			if (!res.ok) {
				throw new Error(`Pull failed (${res.status})`);
			}
			return (await res.json()) as PullResponse;
		},
		push: async (requestId, ops) => {
			const res = await fetchWithRetry(
				`${config.SYNC_SERVER_URL}/v1/sync/push`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ requestId, ops }),
				},
				"PUSH",
			);

			if (!res.ok) {
				throw new Error(`Push failed (${res.status})`);
			}
			return (await res.json()) as PushResponse;
		},
	};

	const fileStore: FileStore = {
		readText: async filePath => Bun.file(filePath).text(),
		writeText: async (filePath, content) => {
			await Bun.write(filePath, content);
		},
		exists: async filePath => Bun.file(filePath).exists(),
		moveToTrash,
		rename: renameFile,
	};

	const stateStore: StateStore = {
		load: async () => {
			const state = await loadState();
			purgeTombstones(state);
			return state;
		},
		save: saveState,
	};

	const pendingStore: PendingOpsStore = {
		load: () => loadPendingOps(),
		save: pending => savePendingOps(pending),
		clear: () => clearPendingOps(),
	};

	const snapshotStore: SnapshotStore = {
		load: readSnapshot,
		save: writeSnapshot,
		remove: removeSnapshot,
		purge: purgeSnapshots,
	};

	const deps: SyncDependencies = {
		logger,
		transport,
		fileStore,
		stateStore,
		pendingStore,
		scanner: recursiveScanner,
		obfuscator: passthroughObfuscator,
		fingerprinter: hashFingerprint,
		snapshotStore,
		merger: conflictMarkerStrategy,
		idGenerator: generateId,
		normalizePath: normalizeClientPath,
		now: () => Date.now(),
	};

	await runSync(deps, mode);
}

// =============================================================================
// SECTION: CLI
// Commander-based CLI with subcommands
// =============================================================================

const program = new Command();
program.name("jolli").description("Jolli CLI tool").version("0.0.1");

// Auth command group
const authCommand = program.command("auth").description("Authentication commands");

authCommand
	.command("login")
	.description("Login to Jolli via browser OAuth")
	.action(async () => {
		try {
			await browserLogin(config.JOLLI_URL);
			console.log("Successfully logged in!");
		} catch (error) {
			console.error("Login failed:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

authCommand
	.command("logout")
	.description("Logout and clear stored credentials")
	.action(async () => {
		await clearAuthToken();
		console.log("Successfully logged out");
	});

authCommand
	.command("status")
	.description("Check authentication status")
	.action(async () => {
		const token = await loadAuthToken();
		if (token) {
			console.log("Authenticated");
		} else {
			console.log("Not authenticated");
		}
	});

// Sync command group
const syncCommand = program.command("sync").description("Sync markdown files with the server");

syncCommand
	.command("up")
	.alias("push")
	.description("Push local changes only (no pull)")
	.action(async () => {
		await sync("up-only");
	});

syncCommand
	.command("down")
	.alias("pull")
	.description("Pull server changes only (no push)")
	.action(async () => {
		await sync("down-only");
	});

syncCommand
	.command("full")
	.description("Full bidirectional sync (default)")
	.action(async () => {
		await sync("full");
	});

// Default sync action (when just running `jolli sync`)
syncCommand.action(async () => {
	await sync("full");
});

// =============================================================================
// SECTION: Exports
// =============================================================================

export {
	parseYamlFrontmatter,
	toYamlFrontmatter,
	parseYamlList,
	generateId,
	matchesAnyGlob,
	hashFingerprint,
	passthroughObfuscator,
	keepBothStrategy,
	conflictMarkerStrategy,
	recursiveScanner,
	sync,
	type parseArgs,
	extractJrn,
	injectJrn,
	removeJrnFromContent,
	purgeSnapshots,
	renameFile,
};
export type { PullChange, PushOp } from "../reference-server/types";
export type {
	ConflictInfo,
	FileEntry,
	FileScanner,
	FingerprintStrategy,
	MergeResult,
	MergeStrategy,
	PathObfuscator,
	SyncConfig,
	SyncMode,
	SyncState,
} from "./types";

// =============================================================================
// SECTION: Main
// =============================================================================

if (import.meta.main) {
	program.parse();
}
