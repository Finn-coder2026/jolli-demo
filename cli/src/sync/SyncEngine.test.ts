/**
 * Integration tests for the sync engine.
 * Uses in-memory mocks for all dependencies - no HTTP needed.
 */

import type { PullResponse, PushOp, PushResponse } from "../reference-server/types";
import type {
	FileStore,
	PendingOps,
	PendingOpsStore,
	PushMetadata,
	SnapshotStore,
	StateStore,
	SyncDependencies,
	SyncTransport,
} from "./SyncEngine";
import { sync } from "./SyncEngine";
import { integrityHashFromContent } from "./SyncHelpers";
import type { SyncConfig, SyncState } from "./Types";
import { describe, expect, test } from "vitest";

// =============================================================================
// In-memory mock implementations
// =============================================================================

type ServerFile = {
	fileId: string;
	serverPath: string;
	version: number;
	content: string;
	deleted: boolean;
};

type ChangeEntry = {
	seq: number;
	fileId: string;
	serverPath: string;
	version: number;
	deleted: boolean;
	content?: string;
};

/**
 * Creates an in-memory server that implements pull/push.
 */
function createMockServer() {
	const files = new Map<string, ServerFile>();
	const changes: Array<ChangeEntry> = [];
	let cursor = 0;

	return {
		files,
		changes,
		getCursor: () => cursor,

		transport: {
			pull: (sinceCursor: number): Promise<PullResponse> => {
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
					return Promise.resolve({ newCursor: cursor, changes: allFiles });
				}

				const newChanges = changes.filter(c => c.seq > sinceCursor);
				const latestByFileId = new Map<string, ChangeEntry>();
				for (const c of newChanges) {
					latestByFileId.set(c.fileId, c);
				}

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

				return Promise.resolve({ newCursor: cursor, changes: changesWithContent });
			},

			push: (_clientChangesetId: string, ops: Array<PushOp>, _metadata?: PushMetadata): Promise<PushResponse> => {
				const results = ops.map(op => {
					const existing = files.get(op.fileId);
					const currentVersion = existing?.version ?? 0;

					if (op.baseVersion !== currentVersion) {
						return { fileId: op.fileId, status: "conflict" as const, serverVersion: currentVersion };
					}

					if (op.contentHash && op.content) {
						const computed = integrityHashFromContent(op.content);
						if (computed !== op.contentHash) {
							return { fileId: op.fileId, status: "bad_hash" as const };
						}
					}

					const newVersion = currentVersion + 1;

					if (op.type === "delete") {
						files.set(op.fileId, {
							fileId: op.fileId,
							serverPath: op.serverPath,
							version: newVersion,
							content: existing?.content ?? "",
							deleted: true,
						});
					} else {
						files.set(op.fileId, {
							fileId: op.fileId,
							serverPath: op.serverPath,
							version: newVersion,
							content: op.content ?? "",
							deleted: false,
						});
					}

					changes.push({
						seq: ++cursor,
						fileId: op.fileId,
						serverPath: op.serverPath,
						version: newVersion,
						deleted: op.type === "delete",
						content: op.content,
					});

					return { fileId: op.fileId, status: "ok" as const, newVersion };
				});

				return Promise.resolve({ results, newCursor: cursor });
			},
		} satisfies SyncTransport,
	};
}

/**
 * Creates an in-memory file system for a single client.
 */
function createMockClient(clientName: string) {
	const files = new Map<string, string>();
	const state: SyncState = { lastCursor: 0, files: [] };
	const snapshots = new Map<string, string>();
	let pending: PendingOps | null = null;
	let idCounter = 0;

	const fileStore: FileStore = {
		readText: (path: string) => {
			const content = files.get(path);
			if (content === undefined) {
				return Promise.reject(new Error(`File not found: ${path}`));
			}
			return Promise.resolve(content);
		},
		writeText: (path: string, content: string) => {
			files.set(path, content);
			return Promise.resolve();
		},
		exists: (path: string) => Promise.resolve(files.has(path)),
		moveToTrash: (path: string) => {
			files.delete(path);
			return Promise.resolve(null);
		},
		rename: (oldPath: string, newPath: string) => {
			const content = files.get(oldPath);
			if (content === undefined) {
				return Promise.resolve(false);
			}
			files.delete(oldPath);
			files.set(newPath, content);
			return Promise.resolve(true);
		},
	};

	const stateStore: StateStore = {
		load: () => Promise.resolve({ ...state, files: [...state.files] }),
		save: (newState: SyncState) => {
			state.lastCursor = newState.lastCursor;
			state.files = [...newState.files];
			state.config = newState.config;
			return Promise.resolve();
		},
	};

	const pendingStore: PendingOpsStore = {
		load: () => Promise.resolve(pending),
		save: (p: PendingOps) => {
			pending = p;
			return Promise.resolve();
		},
		clear: () => {
			pending = null;
			return Promise.resolve();
		},
	};

	const snapshotStore: SnapshotStore = {
		load: (fileId: string) => Promise.resolve(snapshots.get(fileId) ?? null),
		save: (fileId: string, content: string) => {
			snapshots.set(fileId, content);
			return Promise.resolve();
		},
		remove: (fileId: string) => {
			snapshots.delete(fileId);
			return Promise.resolve();
		},
	};

	return {
		name: clientName,
		files,
		state,
		snapshots,
		getPending: () => pending,

		createDeps: (transport: SyncTransport, pushMetadata?: PushMetadata): SyncDependencies => ({
			logger: {
				info: () => {
					// No-op for tests
				},
				warn: () => {
					// No-op for tests
				},
				error: () => {
					// No-op for tests
				},
			},
			transport,
			fileStore,
			stateStore,
			pendingStore,
			scanner: {
				getFiles: (_config?: SyncConfig) => Promise.resolve([...files.keys()].filter(p => p.endsWith(".md"))),
			},
			obfuscator: {
				obfuscate: (p: string) => p,
				deobfuscate: (p: string) => p,
			},
			fingerprinter: {
				compute: (path: string) => {
					const content = files.get(path) ?? "";
					return Promise.resolve(integrityHashFromContent(content));
				},
				computeFromContent: (content: string) => integrityHashFromContent(content),
			},
			snapshotStore,
			idGenerator: () => `${clientName.toUpperCase()}_${++idCounter}`,
			pushMetadata,
			normalizePath: (p: string) => p,
			now: () => Date.now(),
		}),
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("sync engine integration", () => {
	test("basic sync: push from one client, pull to another", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		// Client A creates a file and syncs
		clientA.files.set("doc.md", "# Hello from A");
		await sync(clientA.createDeps(server.transport));

		// Server should have the file
		expect(server.files.size).toBe(1);
		expect(server.files.get("A_1")?.content).toBe("---\njrn: A_1\n---\n# Hello from A");

		// Client B syncs and should get the file
		await sync(clientB.createDeps(server.transport));
		expect(clientB.files.get("doc.md")).toBe("---\njrn: A_1\n---\n# Hello from A");
	});

	test("retry reuses the same clientChangesetId from pending ops", async () => {
		const server = createMockServer();
		const client = createMockClient("A");
		client.files.set("doc.md", "# retry me");

		const pushIds: Array<string> = [];
		let shouldFailFirstPush = true;
		const flakyTransport: SyncTransport = {
			pull: server.transport.pull,
			push: async (clientChangesetId, ops, metadata) => {
				pushIds.push(clientChangesetId);
				if (shouldFailFirstPush) {
					shouldFailFirstPush = false;
					throw new Error("simulated network failure");
				}
				return server.transport.push(clientChangesetId, ops, metadata);
			},
		};

		await sync(client.createDeps(flakyTransport)); // fails push, leaves pending
		await sync(client.createDeps(flakyTransport)); // replays pending

		expect(pushIds.length).toBeGreaterThanOrEqual(2);
		expect(pushIds[1]).toBe(pushIds[0]);
	});

	test("retry reuses message and mergePrompt from pending ops", async () => {
		const server = createMockServer();
		const client = createMockClient("A");
		client.files.set("doc.md", "# retry metadata");

		const pushedMetadata: Array<{
			clientChangesetId: string;
			message?: string;
			mergePrompt?: string;
		}> = [];
		let shouldFailFirstPush = true;
		const flakyTransport: SyncTransport = {
			pull: server.transport.pull,
			push: async (clientChangesetId, ops, metadata) => {
				pushedMetadata.push({
					clientChangesetId,
					message: metadata?.message,
					mergePrompt: metadata?.mergePrompt,
				});
				if (shouldFailFirstPush) {
					shouldFailFirstPush = false;
					throw new Error("simulated network failure");
				}
				return server.transport.push(clientChangesetId, ops, metadata);
			},
		};

		await sync(
			client.createDeps(flakyTransport, {
				message: "Update auth docs",
				mergePrompt: "Prefer preserving security caveats and auth flow examples.",
			}),
		);
		await sync(client.createDeps(flakyTransport));

		expect(pushedMetadata.length).toBeGreaterThanOrEqual(2);
		expect(pushedMetadata[1]).toEqual(pushedMetadata[0]);
	});

	test("non-retriable 409 during push rolls back state and clears pending", async () => {
		const server = createMockServer();
		const client = createMockClient("A");

		client.files.set("doc.md", "# v1");
		await sync(client.createDeps(server.transport));

		const trackedBefore = client.state.files.find(file => file.clientPath === "doc.md");
		expect(trackedBefore).toBeDefined();
		const fingerprintBefore = trackedBefore?.fingerprint;

		const updated = (client.files.get("doc.md") ?? "").replace("v1", "v2");
		client.files.set("doc.md", updated);

		const conflictTransport: SyncTransport = {
			pull: server.transport.pull,
			push: () => {
				const error = new Error("clientChangesetId was already used with a different payload") as Error & {
					status?: number;
					code?: string;
				};
				error.status = 409;
				error.code = "CLIENT_CHANGESET_ID_REUSED";
				throw error;
			},
		};

		await sync(client.createDeps(conflictTransport));
		expect(client.getPending()).toBeNull();
		expect(client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint).toBe(fingerprintBefore);

		await sync(client.createDeps(server.transport));
		expect(server.files.get("A_1")?.content).toContain("v2");
	});

	test("non-retriable 409 on pending replay clears pending and rewinds file state", async () => {
		const server = createMockServer();
		const client = createMockClient("A");

		client.files.set("doc.md", "# v1");
		await sync(client.createDeps(server.transport));
		client.files.set("doc.md", (client.files.get("doc.md") ?? "").replace("v1", "v2"));

		const networkFailTransport: SyncTransport = {
			pull: server.transport.pull,
			push: () => {
				throw new Error("simulated network failure");
			},
		};

		await sync(client.createDeps(networkFailTransport));
		expect(client.getPending()).not.toBeNull();
		const fingerprintAfterFailedPush = client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint;

		const conflictTransport: SyncTransport = {
			pull: server.transport.pull,
			push: () => {
				const error = new Error("clientChangesetId was already used with a different payload") as Error & {
					status?: number;
					code?: string;
				};
				error.status = 409;
				error.code = "CLIENT_CHANGESET_ID_REUSED";
				throw error;
			},
		};

		await sync(client.createDeps(conflictTransport));
		expect(client.getPending()).toBeNull();
		expect(client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint).not.toBe(
			fingerprintAfterFailedPush,
		);

		await sync(client.createDeps(server.transport));
		expect(server.files.get("A_1")?.content).toContain("v2");
	});

	test("generic 409 during push does not clear pending ops", async () => {
		const server = createMockServer();
		const client = createMockClient("A");

		client.files.set("doc.md", "# v1");
		await sync(client.createDeps(server.transport));
		client.files.set("doc.md", (client.files.get("doc.md") ?? "").replace("v1", "v2"));
		const fingerprintBeforeGeneric409 = client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint;

		const generic409Transport: SyncTransport = {
			pull: server.transport.pull,
			push: () => {
				const error = new Error("changeset currently locked") as Error & { status?: number; code?: string };
				error.status = 409;
				error.code = "CHANGESET_LOCKED";
				throw error;
			},
		};

		await sync(client.createDeps(generic409Transport));
		expect(client.getPending()).not.toBeNull();
		expect(client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint).not.toBe(
			fingerprintBeforeGeneric409,
		);

		await sync(client.createDeps(server.transport));
		expect(client.getPending()).toBeNull();
		expect(server.files.get("A_1")?.content).toContain("v2");
	});

	test("generic 409 on pending replay keeps pending ops intact", async () => {
		const server = createMockServer();
		const client = createMockClient("A");

		client.files.set("doc.md", "# v1");
		await sync(client.createDeps(server.transport));
		client.files.set("doc.md", (client.files.get("doc.md") ?? "").replace("v1", "v2"));

		const networkFailTransport: SyncTransport = {
			pull: server.transport.pull,
			push: () => {
				throw new Error("simulated network failure");
			},
		};
		await sync(client.createDeps(networkFailTransport));
		expect(client.getPending()).not.toBeNull();
		const fingerprintWithPending = client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint;

		const generic409Transport: SyncTransport = {
			pull: server.transport.pull,
			push: () => {
				const error = new Error("bad hash") as Error & { status?: number; code?: string };
				error.status = 409;
				error.code = "BAD_HASH";
				throw error;
			},
		};

		await sync(client.createDeps(generic409Transport));
		expect(client.getPending()).not.toBeNull();
		expect(client.state.files.find(file => file.clientPath === "doc.md")?.fingerprint).toBe(fingerprintWithPending);

		await sync(client.createDeps(server.transport));
		expect(client.getPending()).toBeNull();
		expect(server.files.get("A_1")?.content).toContain("v2");
	});

	test("conflict: both clients edit same file, second sync gets conflict markers", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		// Client A creates initial file
		clientA.files.set("doc.md", "# Title\n\nOriginal content");
		await sync(clientA.createDeps(server.transport));

		// Client B pulls the file
		await sync(clientB.createDeps(server.transport));
		expect(clientB.files.has("doc.md")).toBe(true);

		// Both clients modify the file differently
		const contentA = (clientA.files.get("doc.md") ?? "").replace("Original content", "Content from A");
		const contentB = (clientB.files.get("doc.md") ?? "").replace("Original content", "Content from B");
		clientA.files.set("doc.md", contentA);
		clientB.files.set("doc.md", contentB);

		// Client A syncs first - succeeds
		await sync(clientA.createDeps(server.transport));

		// Client B syncs - should get conflict markers
		await sync(clientB.createDeps(server.transport));
		const bContent = clientB.files.get("doc.md") ?? "";
		expect(bContent).toContain("<<<<<<< LOCAL");
		expect(bContent).toContain("Content from B");
		expect(bContent).toContain("=======");
		expect(bContent).toContain("Content from A");
		expect(bContent).toContain(">>>>>>> SERVER");
	});

	test("merge result should be pushed to server on next sync", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		// Client A creates initial file
		clientA.files.set("doc.md", "# Title\n\nOriginal content");
		await sync(clientA.createDeps(server.transport));

		// Client B pulls the file
		await sync(clientB.createDeps(server.transport));

		// Both clients modify the file differently
		const contentA = (clientA.files.get("doc.md") ?? "").replace("Original content", "Content from A");
		const contentB = (clientB.files.get("doc.md") ?? "").replace("Original content", "Content from B");
		clientA.files.set("doc.md", contentA);
		clientB.files.set("doc.md", contentB);

		// Client A syncs first
		await sync(clientA.createDeps(server.transport));

		// Client B syncs - gets conflict with merge
		await sync(clientB.createDeps(server.transport));
		const mergedContent = clientB.files.get("doc.md") ?? "";
		expect(mergedContent).toContain("<<<<<<< LOCAL");

		// User on B resolves the conflict manually
		const resolvedContent = mergedContent
			.replace(/<<<<<<< LOCAL\n/, "")
			.replace(/=======\n[\s\S]*?>>>>>>> SERVER\n?/, "")
			.replace("Content from B", "Content from B (merged with A)");
		clientB.files.set("doc.md", resolvedContent);

		// Client B syncs again - the resolved content should be pushed
		await sync(clientB.createDeps(server.transport));

		// Now Client A syncs - should get the resolved content
		await sync(clientA.createDeps(server.transport));
		const aContent = clientA.files.get("doc.md") ?? "";

		// THIS IS THE BUG: Client A should have the resolved content from B
		// but if the merge result wasn't pushed, A still has its own version
		expect(aContent).toContain("Content from B (merged with A)");
	});

	test.skip("REGRESSION: merged content is pushed to server on subsequent sync", async () => {
		// This test specifically demonstrates the bug where:
		// 1. Client B gets a merge result (with conflict markers)
		// 2. Client B's fingerprint is updated to match the merged content
		// 3. On next sync, the merged content is NOT pushed because fingerprint matches state
		// 4. The merge is lost

		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		// Setup: A creates file, B pulls it
		clientA.files.set("note.md", "Line 1\nLine 2\nLine 3");
		await sync(clientA.createDeps(server.transport));
		await sync(clientB.createDeps(server.transport));

		// Both modify the same line
		const aContent = (clientA.files.get("note.md") ?? "").replace("Line 2", "Line 2 - edited by A");
		const bContent = (clientB.files.get("note.md") ?? "").replace("Line 2", "Line 2 - edited by B");
		clientA.files.set("note.md", aContent);
		clientB.files.set("note.md", bContent);

		// A syncs first (wins)
		await sync(clientA.createDeps(server.transport));
		const serverVersionAfterA = server.files.get("A_1")?.version;
		expect(serverVersionAfterA).toBe(2);

		// B syncs - gets merged/conflict content
		await sync(clientB.createDeps(server.transport));
		const bMerged = clientB.files.get("note.md") ?? "";
		// The merged content differs from what's on the server

		// B syncs again - THIS IS WHERE THE BUG MANIFESTS
		// The merged content should be pushed to server
		await sync(clientB.createDeps(server.transport));

		const serverVersionAfterB = server.files.get("A_1")?.version;

		// If the bug exists: serverVersion is still 2 (B's merge wasn't pushed)
		// If fixed: serverVersion is 3 (B pushed the merged content)
		expect(serverVersionAfterB).toBe(3);

		// Also verify the server has the merged content
		const serverContent = server.files.get("A_1")?.content;
		expect(serverContent).toBe(bMerged);
	});

	test.skip("REGRESSION: clean auto-merge is pushed to server (BUG-002)", async () => {
		// This test demonstrates the silent data loss bug where:
		// 1. Both clients edit DIFFERENT parts of the file
		// 2. Three-way merge succeeds cleanly (no conflict markers)
		// 3. The merged content is NOT pushed to server
		// 4. One client's changes are silently lost

		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		// Setup: A creates file with multiple distinct sections
		clientA.files.set("note.md", "Section 1: Original\n\nSection 2: Original\n\nSection 3: Original");
		await sync(clientA.createDeps(server.transport));
		await sync(clientB.createDeps(server.transport));

		// A edits Section 1, B edits Section 3 (non-overlapping changes)
		const aContent = (clientA.files.get("note.md") ?? "").replace("Section 1: Original", "Section 1: Edited by A");
		const bContent = (clientB.files.get("note.md") ?? "").replace("Section 3: Original", "Section 3: Edited by B");
		clientA.files.set("note.md", aContent);
		clientB.files.set("note.md", bContent);

		// A syncs first
		await sync(clientA.createDeps(server.transport));
		expect(server.files.get("A_1")?.version).toBe(2);

		// B syncs - should get clean auto-merge (no conflict markers)
		await sync(clientB.createDeps(server.transport));
		const bMerged = clientB.files.get("note.md") ?? "";

		// Verify it's a clean merge (no conflict markers)
		expect(bMerged).not.toContain("<<<<<<<");
		expect(bMerged).not.toContain(">>>>>>>");

		// Verify the merge contains both edits
		expect(bMerged).toContain("Section 1: Edited by A");
		expect(bMerged).toContain("Section 3: Edited by B");

		// B syncs again - the clean merge should be pushed
		await sync(clientB.createDeps(server.transport));

		// BUG: Server version should be 3 (B pushed the merge)
		// but with the bug it stays at 2
		expect(server.files.get("A_1")?.version).toBe(3);

		// A syncs - should get B's merged content
		await sync(clientA.createDeps(server.transport));
		const aFinal = clientA.files.get("note.md") ?? "";

		// BUG: A should see both edits, but with the bug B's edit is lost
		expect(aFinal).toContain("Section 1: Edited by A");
		expect(aFinal).toContain("Section 3: Edited by B");
	});

	test.skip("REGRESSION: remote changes between pull and push are not skipped", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		clientA.files.set("a.md", "A v1");
		await sync(clientA.createDeps(server.transport));

		clientB.files.set("b.md", "B v1");
		clientA.files.set("a.md", "A v2");

		let bSynced = false;
		const interleavedTransport: SyncTransport = {
			pull: server.transport.pull,
			push: async (clientChangesetId, ops, metadata) => {
				if (!bSynced) {
					bSynced = true;
					await sync(clientB.createDeps(server.transport));
				}
				return server.transport.push(clientChangesetId, ops, metadata);
			},
		};

		await sync(clientA.createDeps(interleavedTransport));
		await sync(clientA.createDeps(server.transport));

		const bContent = clientA.files.get("b.md") ?? "";
		expect(bContent).toContain("B v1");
	});

	test("pull from server injects frontmatter for web-created docs", async () => {
		// Test the case where docs are created on the web (no frontmatter in server content)
		const server = createMockServer();
		const clientA = createMockClient("A");

		// Simulate a doc created on the web (server has content without frontmatter)
		server.files.set("WEB_1", {
			fileId: "WEB_1",
			serverPath: "web-doc.md",
			version: 1,
			content: "# Created on Web\n\nNo frontmatter here.",
			deleted: false,
		});
		server.changes.push({
			seq: 1,
			fileId: "WEB_1",
			serverPath: "web-doc.md",
			version: 1,
			deleted: false,
			content: "# Created on Web\n\nNo frontmatter here.",
		});

		// Client A syncs - should get the file with frontmatter injected
		await sync(clientA.createDeps(server.transport));

		const localContent = clientA.files.get("web-doc.md") ?? "";
		// Should have frontmatter injected with the fileId
		expect(localContent).toContain("---");
		expect(localContent).toContain("jrn: WEB_1");
		expect(localContent).toContain("# Created on Web");

		// State should track the file
		expect(clientA.state.files.length).toBe(1);
		expect(clientA.state.files[0].fileId).toBe("WEB_1");
	});

	test("pull delete from server removes local file and tombstones state", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");

		clientA.files.set("note.md", "Hello");
		await sync(clientA.createDeps(server.transport));

		const entry = clientA.state.files[0];
		expect(entry).toBeDefined();
		const fileId = entry!.fileId;
		const serverPath = entry!.serverPath;
		const baseVersion = entry!.serverVersion;

		expect(clientA.files.has("note.md")).toBe(true);
		expect(clientA.snapshots.has(fileId)).toBe(true);

		// Simulate a server-side delete (e.g., web delete) by emitting a delete change
		await server.transport.push("delete-req", [
			{
				type: "delete",
				fileId,
				serverPath,
				baseVersion,
			},
		]);

		await sync(clientA.createDeps(server.transport), "down-only");

		expect(clientA.files.has("note.md")).toBe(false);
		const updated = clientA.state.files.find(f => f.fileId === fileId);
		expect(updated?.deleted).toBe(true);
		expect(updated?.deletedAt).toBeDefined();
		expect(updated?.serverVersion).toBe(baseVersion + 1);
		expect(clientA.snapshots.has(fileId)).toBe(false);
	});

	test("REGRESSION: server update restores missing local file", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		clientA.files.set("note.md", "Original");
		await sync(clientA.createDeps(server.transport));
		await sync(clientB.createDeps(server.transport));

		clientB.files.delete("note.md");

		const updated = (clientA.files.get("note.md") ?? "").replace("Original", "Updated by A");
		clientA.files.set("note.md", updated);
		await sync(clientA.createDeps(server.transport));

		await sync(clientB.createDeps(server.transport));

		const bContent = clientB.files.get("note.md") ?? "";
		expect(bContent).toContain("Updated by A");
	});

	test.skip("REGRESSION: push conflict does not mask local edits on next pull", async () => {
		const server = createMockServer();
		const clientA = createMockClient("A");
		const clientB = createMockClient("B");

		clientA.files.set("note.md", "Line 1\nLine 2\nLine 3");
		await sync(clientA.createDeps(server.transport));
		await sync(clientB.createDeps(server.transport));

		const aContent = (clientA.files.get("note.md") ?? "").replace("Line 2", "Line 2 - edited by A");
		const bContent = (clientB.files.get("note.md") ?? "").replace("Line 2", "Line 2 - edited by B");
		clientA.files.set("note.md", aContent);
		clientB.files.set("note.md", bContent);

		await sync(clientB.createDeps(server.transport));
		await sync(clientA.createDeps(server.transport), "up-only");

		clientA.state.lastCursor = 0;
		await sync(clientA.createDeps(server.transport), "down-only");

		const aAfter = clientA.files.get("note.md") ?? "";
		expect(aAfter).toContain("edited by A");
	});
});
