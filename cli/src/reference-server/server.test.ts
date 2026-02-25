import { integrityHashFromContent } from "../sync";
import { createServer } from "./server";
import type { PullResponse, PushResponse } from "./types";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

type ServerStatus = {
	cursor: number;
	fileCount: number;
	files: Record<string, { fileId: string; version: number; content: string; deleted: boolean }>;
	recentChanges: Array<{ seq: number; fileId: string }>;
};

describe("sync server", () => {
	let server: ReturnType<typeof createServer>;
	let baseUrl: string;

	beforeEach(() => {
		server = createServer({ port: 0 });
		baseUrl = `http://localhost:${server.port}`;
	});

	afterEach(async () => {
		await server.stop(true);
	});

	async function push(body: unknown): Promise<PushResponse> {
		const res = await fetch(`${baseUrl}/v1/sync/push`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		return res.json();
	}

	async function pull(sinceCursor: number): Promise<PullResponse> {
		const res = await fetch(`${baseUrl}/v1/sync/pull`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sinceCursor }),
		});
		return res.json();
	}

	async function status(): Promise<ServerStatus> {
		const res = await fetch(`${baseUrl}/v1/sync/status`);
		return res.json();
	}

	test("push idempotency returns same response for same clientChangesetId", async () => {
		const ops = [
			{
				type: "upsert",
				fileId: "FILE1",
				serverPath: "notes/a.md",
				baseVersion: 0,
				content: "Hello",
				contentHash: integrityHashFromContent("Hello"),
			},
		];

		const first = await push({ clientChangesetId: "REQ1", targetBranch: "main", ops });
		const second = await push({ clientChangesetId: "REQ1", targetBranch: "main", ops });

		expect(second).toEqual(first);

		const current = await status();
		expect(current.cursor).toBe(1);
		expect(current.fileCount).toBe(1);
		expect(current.files.FILE1?.version).toBe(1);
	});

	test("rejects upsert when contentHash mismatches", async () => {
		const ops = [
			{
				type: "upsert",
				fileId: "BAD1",
				serverPath: "notes/bad.md",
				baseVersion: 0,
				content: "Hello",
				contentHash: "deadbeef",
			},
		];

		const result = await push({ clientChangesetId: "REQ2", targetBranch: "main", ops });

		expect(result.results[0]?.status).toBe("bad_hash");
		expect(result.newCursor).toBe(0);

		const current = await status();
		expect(current.cursor).toBe(0);
		expect(current.fileCount).toBe(0);
		expect(current.files.BAD1).toBeUndefined();
	});

	test("push with clientChangesetId works", async () => {
		const ops = [
			{
				type: "upsert",
				fileId: "FILE2",
				serverPath: "notes/b.md",
				baseVersion: 0,
				content: "No request ID",
				contentHash: integrityHashFromContent("No request ID"),
			},
		];

		const result = await push({ clientChangesetId: "REQ3", targetBranch: "main", ops });
		expect(result.results[0]?.status).toBe("ok");
		expect(result.results[0]?.newVersion).toBe(1);
	});

	test("push returns conflict for wrong baseVersion", async () => {
		// First create a file
		await push({
			clientChangesetId: "CREATE1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE3",
					serverPath: "notes/c.md",
					baseVersion: 0,
					content: "Version 1",
					contentHash: integrityHashFromContent("Version 1"),
				},
			],
		});

		// Try to update with wrong baseVersion
		const result = await push({
			clientChangesetId: "UPDATE1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE3",
					serverPath: "notes/c.md",
					baseVersion: 0, // Wrong! Should be 1
					content: "Version 2",
					contentHash: integrityHashFromContent("Version 2"),
				},
			],
		});

		expect(result.results[0]?.status).toBe("conflict");
		expect(result.results[0]?.serverVersion).toBe(1);
	});

	test("push delete operation", async () => {
		// First create a file
		await push({
			clientChangesetId: "CREATE-DELETE1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE4",
					serverPath: "notes/d.md",
					baseVersion: 0,
					content: "To be deleted",
					contentHash: integrityHashFromContent("To be deleted"),
				},
			],
		});

		// Delete the file
		const result = await push({
			clientChangesetId: "DELETE1",
			targetBranch: "main",
			ops: [
				{
					type: "delete",
					fileId: "FILE4",
					serverPath: "notes/d.md",
					baseVersion: 1,
				},
			],
		});

		expect(result.results[0]?.status).toBe("ok");
		expect(result.results[0]?.newVersion).toBe(2);

		const current = await status();
		expect(current.files.FILE4?.deleted).toBe(true);
	});

	test("pull with sinceCursor 0 returns all files", async () => {
		// Create some files
		await push({
			clientChangesetId: "PULL-ALL1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE5",
					serverPath: "notes/e.md",
					baseVersion: 0,
					content: "File E",
					contentHash: integrityHashFromContent("File E"),
				},
				{
					type: "upsert",
					fileId: "FILE6",
					serverPath: "notes/f.md",
					baseVersion: 0,
					content: "File F",
					contentHash: integrityHashFromContent("File F"),
				},
			],
		});

		const result = await pull(0);

		expect(result.changes.length).toBe(2);
		expect(result.newCursor).toBe(2);

		const fileIds = result.changes.map(c => c.fileId);
		expect(fileIds).toContain("FILE5");
		expect(fileIds).toContain("FILE6");
	});

	test("pull with sinceCursor returns only new changes", async () => {
		// Create first file
		await push({
			clientChangesetId: "PULL-DELTA1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE7",
					serverPath: "notes/g.md",
					baseVersion: 0,
					content: "File G",
					contentHash: integrityHashFromContent("File G"),
				},
			],
		});

		const firstPull = await pull(0);
		const cursor = firstPull.newCursor;

		// Create second file
		await push({
			clientChangesetId: "PULL-DELTA2",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE8",
					serverPath: "notes/h.md",
					baseVersion: 0,
					content: "File H",
					contentHash: integrityHashFromContent("File H"),
				},
			],
		});

		const secondPull = await pull(cursor);

		expect(secondPull.changes.length).toBe(1);
		expect(secondPull.changes[0]?.fileId).toBe("FILE8");
	});

	test("pull deduplicates multiple changes to same file", async () => {
		// Create and update a file multiple times
		await push({
			clientChangesetId: "UPDATE-LATEST1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE9",
					serverPath: "notes/i.md",
					baseVersion: 0,
					content: "Version 1",
					contentHash: integrityHashFromContent("Version 1"),
				},
			],
		});

		await push({
			clientChangesetId: "UPDATE-LATEST2",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE9",
					serverPath: "notes/i.md",
					baseVersion: 1,
					content: "Version 2",
					contentHash: integrityHashFromContent("Version 2"),
				},
			],
		});

		await push({
			clientChangesetId: "UPDATE-LATEST3",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE9",
					serverPath: "notes/i.md",
					baseVersion: 2,
					content: "Version 3",
					contentHash: integrityHashFromContent("Version 3"),
				},
			],
		});

		// Pull from start - should get only latest version
		const result = await pull(0);

		expect(result.changes.length).toBe(1);
		expect(result.changes[0]?.fileId).toBe("FILE9");
		expect(result.changes[0]?.version).toBe(3);
		expect(result.changes[0]?.content).toBe("Version 3");
	});

	test("pull excludes deleted files from initial sync", async () => {
		// Create and delete a file
		await push({
			clientChangesetId: "INIT-DEL1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE10",
					serverPath: "notes/j.md",
					baseVersion: 0,
					content: "Will be deleted",
					contentHash: integrityHashFromContent("Will be deleted"),
				},
			],
		});

		await push({
			clientChangesetId: "INIT-DEL2",
			targetBranch: "main",
			ops: [
				{
					type: "delete",
					fileId: "FILE10",
					serverPath: "notes/j.md",
					baseVersion: 1,
				},
			],
		});

		// Initial pull should not include deleted file
		const result = await pull(0);
		expect(result.changes.length).toBe(0);
	});

	test("pull includes content hash for non-deleted files", async () => {
		const content = "Hash test content";
		await push({
			clientChangesetId: "HASH-TEST1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE11",
					serverPath: "notes/k.md",
					baseVersion: 0,
					content,
					contentHash: integrityHashFromContent(content),
				},
			],
		});

		const result = await pull(0);

		expect(result.changes[0]?.contentHash).toBe(integrityHashFromContent(content));
	});

	test("status endpoint returns server state", async () => {
		await push({
			clientChangesetId: "STATUS-TEST1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE12",
					serverPath: "notes/l.md",
					baseVersion: 0,
					content: "Status test",
					contentHash: integrityHashFromContent("Status test"),
				},
			],
		});

		const result = await status();

		expect(result.cursor).toBe(1);
		expect(result.fileCount).toBe(1);
		expect(result.files.FILE12).toBeDefined();
		expect(result.files.FILE12?.version).toBe(1);
		expect(result.recentChanges).toBeDefined();
	});

	test("returns 404 for unknown routes", async () => {
		const res = await fetch(`${baseUrl}/unknown/path`);
		expect(res.status).toBe(404);
	});

	test("push without content hash still works", async () => {
		const result = await push({
			clientChangesetId: "NO-HASH1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "FILE13",
					serverPath: "notes/m.md",
					baseVersion: 0,
					content: "No hash",
				},
			],
		});

		expect(result.results[0]?.status).toBe("ok");
	});

	// =========================================================================
	// Soft-delete endpoint tests (simulates web UI delete)
	// =========================================================================

	async function softDelete(fileId: string): Promise<Response> {
		return fetch(`${baseUrl}/v1/sync/files/${encodeURIComponent(fileId)}`, {
			method: "DELETE",
		});
	}

	test("soft-delete marks file as deleted and advances cursor", async () => {
		// Create a file first
		await push({
			clientChangesetId: "SOFT-DEL1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "SOFT_DEL_1",
					serverPath: "notes/soft-del.md",
					baseVersion: 0,
					content: "To be soft-deleted",
					contentHash: integrityHashFromContent("To be soft-deleted"),
				},
			],
		});

		const cursorBefore = (await status()).cursor;

		// Soft-delete from "web UI"
		const res = await softDelete("SOFT_DEL_1");
		expect(res.status).toBe(200);

		const body = (await res.json()) as { fileId: string; newVersion: number; deleted: boolean };
		expect(body.fileId).toBe("SOFT_DEL_1");
		expect(body.newVersion).toBe(2);
		expect(body.deleted).toBe(true);

		// Verify server state
		const current = await status();
		expect(current.cursor).toBe(cursorBefore + 1);
		expect(current.files.SOFT_DEL_1?.deleted).toBe(true);
		expect(current.files.SOFT_DEL_1?.version).toBe(2);
	});

	test("soft-delete returns 404 for non-existent file", async () => {
		const res = await softDelete("NON_EXISTENT");
		expect(res.status).toBe(404);
	});

	test("soft-delete returns 409 for already deleted file", async () => {
		// Create and delete via push
		await push({
			clientChangesetId: "ALREADY-DEL1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "ALREADY_DEL",
					serverPath: "notes/already-del.md",
					baseVersion: 0,
					content: "Will be deleted twice",
					contentHash: integrityHashFromContent("Will be deleted twice"),
				},
			],
		});

		// First soft-delete
		const first = await softDelete("ALREADY_DEL");
		expect(first.status).toBe(200);

		// Second soft-delete should fail
		const second = await softDelete("ALREADY_DEL");
		expect(second.status).toBe(409);
	});

	test("soft-deleted file appears in incremental pull with deleted=true", async () => {
		// Create a file
		await push({
			clientChangesetId: "PULL-DEL1",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "PULL_DEL_1",
					serverPath: "notes/pull-del.md",
					baseVersion: 0,
					content: "Will be soft-deleted",
					contentHash: integrityHashFromContent("Will be soft-deleted"),
				},
			],
		});

		// Get current cursor
		const firstPull = await pull(0);
		const cursorAfterCreate = firstPull.newCursor;
		expect(firstPull.changes.find(c => c.fileId === "PULL_DEL_1")).toBeDefined();

		// Soft-delete from web
		await softDelete("PULL_DEL_1");

		// Incremental pull should show the delete
		const secondPull = await pull(cursorAfterCreate);
		expect(secondPull.changes.length).toBe(1);
		expect(secondPull.changes[0]?.fileId).toBe("PULL_DEL_1");
		expect(secondPull.changes[0]?.deleted).toBe(true);
		expect(secondPull.changes[0]?.version).toBe(2);
	});

	test("soft-deleted file excluded from initial pull (cursor=0)", async () => {
		// Create a file
		await push({
			clientChangesetId: "INIT-DEL3",
			targetBranch: "main",
			ops: [
				{
					type: "upsert",
					fileId: "INIT_DEL_1",
					serverPath: "notes/init-del.md",
					baseVersion: 0,
					content: "Will be soft-deleted before initial sync",
					contentHash: integrityHashFromContent("Will be soft-deleted before initial sync"),
				},
			],
		});

		// Soft-delete it
		await softDelete("INIT_DEL_1");

		// Initial pull should not include the deleted file
		const result = await pull(0);
		expect(result.changes.find(c => c.fileId === "INIT_DEL_1")).toBeUndefined();
	});
});
