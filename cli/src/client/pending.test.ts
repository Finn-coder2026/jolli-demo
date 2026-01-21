import { clearPendingOps, loadPendingOps, type PendingOps, savePendingOps } from "./pending";
import { afterEach, describe, expect, test } from "vitest";

const TEST_PENDING_PATH = ".jolli/pending-ops.test.json";

afterEach(async () => {
	await clearPendingOps(TEST_PENDING_PATH);
});

describe("pending ops storage", () => {
	test("loadPendingOps returns null when file is missing", async () => {
		const pending = await loadPendingOps(TEST_PENDING_PATH);
		expect(pending).toBeNull();
	});

	test("savePendingOps and loadPendingOps roundtrip", async () => {
		const data: PendingOps = {
			requestId: "REQ123",
			createdAt: Date.now(),
			ops: [
				{
					type: "upsert",
					fileId: "FILE1",
					serverPath: "notes/a.md",
					baseVersion: 0,
					content: "Hello",
					contentHash: "abcd",
				},
			],
		};

		await savePendingOps(data, TEST_PENDING_PATH);
		const loaded = await loadPendingOps(TEST_PENDING_PATH);
		expect(loaded).toEqual(data);
	});
});
