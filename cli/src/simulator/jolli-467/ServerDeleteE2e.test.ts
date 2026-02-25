/**
 * End-to-end test for server-side delete propagation.
 *
 * Flow:
 * 1. Client creates a file locally
 * 2. Client syncs up to server
 * 3. Server soft-deletes the file (simulating web UI delete)
 * 4. Client syncs down
 * 5. Verify: local file is deleted, state shows tombstone
 */

import type { SyncConfig, SyncState } from "../../sync/Types";
import type { PullResponse, PushResponse } from "../../reference-server/types";
import type {
	FileStore,
	PendingOps,
	PendingOpsStore,
	SnapshotStore,
	StateStore,
	SyncDependencies,
	SyncTransport,
} from "../../sync/SyncEngine";
import { sync } from "../../sync/SyncEngine";
import { integrityHashFromContent } from "../../sync/SyncHelpers";
import { createServer } from "../../reference-server/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * Creates a mock client with in-memory file system that talks to a real HTTP server.
 */
function createHttpClient(clientName: string, baseUrl: string) {
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

	// HTTP transport that talks to the real server
	const transport: SyncTransport = {
		pull: async (sinceCursor: number): Promise<PullResponse> => {
			const res = await fetch(`${baseUrl}/v1/sync/pull`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sinceCursor }),
			});
			return res.json();
		},
		push: async (clientChangesetId: string, ops): Promise<PushResponse> => {
			const res = await fetch(`${baseUrl}/v1/sync/push`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ clientChangesetId, targetBranch: "main", ops }),
			});
			return res.json();
		},
	};

	return {
		name: clientName,
		files,
		state,
		snapshots,

		createDeps: (): SyncDependencies => ({
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
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
			normalizePath: (p: string) => p,
			now: () => Date.now(),
		}),
	};
}

describe("server delete e2e", () => {
	let server: ReturnType<typeof createServer>;
	let baseUrl: string;

	beforeEach(() => {
		server = createServer({ port: 0 });
		baseUrl = `http://localhost:${server.port}`;
	});

	afterEach(async () => {
		await server.stop(true);
	});

	async function softDeleteOnServer(fileId: string): Promise<void> {
		const res = await fetch(`${baseUrl}/v1/sync/files/${encodeURIComponent(fileId)}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			throw new Error(`Soft-delete failed: ${res.status}`);
		}
	}

	test("e2e: create file → sync up → server delete → sync down → file removed", async () => {
		const client = createHttpClient("CLI", baseUrl);

		// Step 1: Create a file locally
		client.files.set("my-doc.md", "# My Document\n\nThis will be deleted from the server.");

		// Step 2: Sync up to server
		await sync(client.createDeps());

		// Verify file was synced
		expect(client.state.files.length).toBe(1);
		const fileEntry = client.state.files[0];
		expect(fileEntry).toBeDefined();
		expect(fileEntry?.serverPath).toBe("my-doc.md");
		expect(fileEntry?.deleted).toBeFalsy();

		const fileId = fileEntry!.fileId;
		const versionAfterCreate = fileEntry!.serverVersion;

		// Step 3: Server soft-deletes the file (simulating web UI)
		await softDeleteOnServer(fileId);

		// Step 4: Sync down
		await sync(client.createDeps(), "down-only");

		// Step 5: Verify local state
		// File should be removed from local filesystem
		expect(client.files.has("my-doc.md")).toBe(false);

		// State should show tombstone (deleted=true)
		const updatedEntry = client.state.files.find(f => f.fileId === fileId);
		expect(updatedEntry).toBeDefined();
		expect(updatedEntry?.deleted).toBe(true);
		expect(updatedEntry?.deletedAt).toBeDefined();
		expect(updatedEntry?.serverVersion).toBe(versionAfterCreate + 1);

		// Snapshot should be removed
		expect(client.snapshots.has(fileId)).toBe(false);
	});

	test("e2e: two clients - one creates, server deletes, other syncs", async () => {
		const clientA = createHttpClient("A", baseUrl);
		const clientB = createHttpClient("B", baseUrl);

		// Client A creates a file and syncs
		clientA.files.set("shared.md", "# Shared Doc\n\nCreated by A.");
		await sync(clientA.createDeps());

		const fileId = clientA.state.files[0]!.fileId;

		// Client B syncs and gets the file
		await sync(clientB.createDeps());
		expect(clientB.files.has("shared.md")).toBe(true);
		expect(clientB.state.files.find(f => f.fileId === fileId)).toBeDefined();

		// Server soft-deletes the file
		await softDeleteOnServer(fileId);

		// Client B syncs down - should see the delete
		await sync(clientB.createDeps(), "down-only");

		expect(clientB.files.has("shared.md")).toBe(false);
		const bEntry = clientB.state.files.find(f => f.fileId === fileId);
		expect(bEntry?.deleted).toBe(true);

		// Client A syncs down - should also see the delete
		await sync(clientA.createDeps(), "down-only");

		expect(clientA.files.has("shared.md")).toBe(false);
		const aEntry = clientA.state.files.find(f => f.fileId === fileId);
		expect(aEntry?.deleted).toBe(true);
	});

	test("e2e: server delete does not affect other files", async () => {
		const client = createHttpClient("CLI", baseUrl);

		// Create two files
		client.files.set("keep.md", "# Keep Me\n\nThis should stay.");
		client.files.set("delete.md", "# Delete Me\n\nThis will be deleted.");

		await sync(client.createDeps());

		expect(client.state.files.length).toBe(2);

		const deleteEntry = client.state.files.find(f => f.serverPath === "delete.md");
		const keepEntry = client.state.files.find(f => f.serverPath === "keep.md");

		// Server deletes only one file
		await softDeleteOnServer(deleteEntry!.fileId);

		// Sync down
		await sync(client.createDeps(), "down-only");

		// "delete.md" should be gone
		expect(client.files.has("delete.md")).toBe(false);
		expect(client.state.files.find(f => f.fileId === deleteEntry!.fileId)?.deleted).toBe(true);

		// "keep.md" should still exist
		expect(client.files.has("keep.md")).toBe(true);
		expect(client.state.files.find(f => f.fileId === keepEntry!.fileId)?.deleted).toBeFalsy();
	});
});
