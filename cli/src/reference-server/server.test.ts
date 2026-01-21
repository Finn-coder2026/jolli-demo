import { integrityHashFromContent } from "../shared/sync-helpers";
import { createServer } from "./server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

type ServerStatus = {
	cursor: number;
	fileCount: number;
	files: Record<string, { fileId: string; version: number }>;
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

	async function push(body: unknown) {
		const res = await fetch(`${baseUrl}/v1/sync/push`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		return res.json();
	}

	async function status(): Promise<ServerStatus> {
		const res = await fetch(`${baseUrl}/v1/sync/status`);
		return res.json();
	}

	test("push idempotency returns same response for same requestId", async () => {
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

		const first = await push({ requestId: "REQ1", ops });
		const second = await push({ requestId: "REQ1", ops });

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

		const result = (await push({ requestId: "REQ2", ops })) as {
			results: Array<{ status: string }>;
			newCursor: number;
		};

		expect(result.results[0]?.status).toBe("bad_hash");
		expect(result.newCursor).toBe(0);

		const current = await status();
		expect(current.cursor).toBe(0);
		expect(current.fileCount).toBe(0);
		expect(current.files.BAD1).toBeUndefined();
	});
});
