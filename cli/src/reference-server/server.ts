// Markdown Sync Server - In-memory store, one-way push

import { getLog } from "../shared/logger";
import { integrityHashFromContent } from "../shared/sync-helpers";
import type { PushOp, PushRequest, PushResponse } from "./types";

const logger = getLog(import.meta);

const DEFAULT_PORT = 3001;

// --- Internal Types ---
type ServerFile = {
	fileId: string;
	serverPath: string;
	version: number;
	content: string;
	deleted: boolean;
	updatedAt: number;
};

type ChangeEntry = {
	seq: number;
	fileId: string;
	serverPath: string;
	version: number;
	deleted: boolean;
	updatedAt: number;
};

type CreateServerOptions = {
	port?: number;
};

export function createServer(options: CreateServerOptions = {}): ReturnType<typeof Bun.serve> {
	const port = options.port ?? DEFAULT_PORT;

	// --- In-Memory Store ---
	const files = new Map<string, ServerFile>();
	const changes: Array<ChangeEntry> = [];
	let cursor = 0;
	const pushResponses = new Map<string, PushResponse>();

	// --- Handlers ---
	function handlePush(ops: Array<PushOp>): PushResponse {
		const results = ops.map(op => {
			const existing = files.get(op.fileId);
			const currentVersion = existing?.version ?? 0;

			// Conflict check
			if (op.baseVersion !== currentVersion) {
				return { fileId: op.fileId, status: "conflict", serverVersion: currentVersion };
			}

			const newVersion = currentVersion + 1;
			const now = Date.now();

			if (op.type === "delete") {
				files.set(op.fileId, {
					fileId: op.fileId,
					serverPath: op.serverPath,
					version: newVersion,
					content: existing?.content ?? "",
					deleted: true,
					updatedAt: now,
				});
			} else {
				const content = op.content ?? "";
				if (op.contentHash) {
					const computed = integrityHashFromContent(content);
					if (computed !== op.contentHash) {
						return { fileId: op.fileId, status: "bad_hash" };
					}
				}
				files.set(op.fileId, {
					fileId: op.fileId,
					serverPath: op.serverPath,
					version: newVersion,
					content,
					deleted: false,
					updatedAt: now,
				});
			}

			// Append to change log
			changes.push({
				seq: ++cursor,
				fileId: op.fileId,
				serverPath: op.serverPath,
				version: newVersion,
				deleted: op.type === "delete",
				updatedAt: now,
			});

			return { fileId: op.fileId, status: "ok", newVersion };
		});

		return { results, newCursor: cursor };
	}

	return Bun.serve({
		port,
		async fetch(req) {
			const url = new URL(req.url);

			// POST /v1/sync/push
			if (req.method === "POST" && url.pathname === "/v1/sync/push") {
				const body = (await req.json()) as PushRequest;
				if (body.requestId && pushResponses.has(body.requestId)) {
					return Response.json(pushResponses.get(body.requestId));
				}

				const result = handlePush(body.ops);
				if (body.requestId) {
					pushResponses.set(body.requestId, result);
				}
				return Response.json(result);
			}

			// POST /v1/sync/pull
			if (req.method === "POST" && url.pathname === "/v1/sync/pull") {
				const body = (await req.json()) as { sinceCursor: number };
				const sinceCursor = body.sinceCursor ?? 0;

				// Initial sync (cursor 0): send current state of all files
				if (sinceCursor === 0) {
					const allFiles = [...files.values()]
						.filter(f => !f.deleted)
						.map(f => ({
							fileId: f.fileId,
							serverPath: f.serverPath,
							version: f.version,
							deleted: false,
							content: f.content,
							contentHash: integrityHashFromContent(f.content),
						}));
					return Response.json({ newCursor: cursor, changes: allFiles });
				}

				// Incremental sync: get changes since cursor, dedupe to latest per file
				const newChanges = changes.filter(c => c.seq > sinceCursor);

				// Keep only the latest change per fileId
				const latestByFileId = new Map<string, ChangeEntry>();
				for (const c of newChanges) {
					latestByFileId.set(c.fileId, c);
				}

				// Build response with content for non-deleted files
				const changesWithContent = [...latestByFileId.values()].map(c => {
					const file = files.get(c.fileId);
					const content = c.deleted ? undefined : file?.content;
					return {
						fileId: c.fileId,
						serverPath: c.serverPath,
						version: c.version,
						deleted: c.deleted,
						content,
						contentHash: content ? integrityHashFromContent(content) : undefined,
					};
				});

				return Response.json({ newCursor: cursor, changes: changesWithContent });
			}

			// GET /v1/sync/status (debug)
			if (req.method === "GET" && url.pathname === "/v1/sync/status") {
				return Response.json({
					cursor,
					fileCount: files.size,
					files: Object.fromEntries(files),
					recentChanges: changes.slice(-10),
				});
			}

			return new Response("Not Found", { status: 404 });
		},
	});
}

if (import.meta.main) {
	const server = createServer({ port: DEFAULT_PORT });
	logger.info(`Sync server running on http://localhost:${server.port}`);
}
