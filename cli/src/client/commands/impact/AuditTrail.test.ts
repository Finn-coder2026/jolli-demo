import {
	type ArticleAuditEntry,
	addArticleToRecord,
	createAuditRecord,
	getLatestGitRecord,
	getLatestRecord,
	getUpdatedArticlePaths,
	getUpdatedArticles,
	type ImpactAuditLog,
	type ImpactAuditRecord,
	loadAuditLog,
	saveAuditRecord,
} from "./AuditTrail";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("AuditTrail", () => {
	const testDir = "/tmp/jolli-audit-test";
	const auditDir = path.join(testDir, ".jolli");
	const auditFile = path.join(auditDir, "impact-audit.json");

	beforeEach(async () => {
		// Create test directory
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("loadAuditLog", () => {
		test("returns empty log when file does not exist", async () => {
			const log = await loadAuditLog(testDir);
			expect(log).toEqual({ version: 1, records: [] });
		});

		test("loads existing log from file", async () => {
			const existingLog: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "test-id-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: {
							base: "origin/main",
							commits: [{ sha: "abc1234", message: "Test commit" }],
							changedFiles: ["src/test.ts"],
						},
						articles: [],
					},
				],
			};

			await fs.mkdir(auditDir, { recursive: true });
			await fs.writeFile(auditFile, JSON.stringify(existingLog), "utf8");

			const log = await loadAuditLog(testDir);
			expect(log.records).toHaveLength(1);
			expect(log.records[0]?.id).toBe("test-id-1");
		});

		test("returns empty log for invalid JSON", async () => {
			await fs.mkdir(auditDir, { recursive: true });
			await fs.writeFile(auditFile, "not valid json", "utf8");

			const log = await loadAuditLog(testDir);
			expect(log).toEqual({ version: 1, records: [] });
		});

		test("returns empty log for unsupported version", async () => {
			const futureLog = { version: 99, records: [] };
			await fs.mkdir(auditDir, { recursive: true });
			await fs.writeFile(auditFile, JSON.stringify(futureLog), "utf8");

			const log = await loadAuditLog(testDir);
			expect(log).toEqual({ version: 1, records: [] });
		});
	});

	describe("saveAuditRecord", () => {
		test("saves record to file", async () => {
			const record = createAuditRecord("git", {
				base: "origin/main",
				commits: [{ sha: "abc1234", message: "Test" }],
				changedFiles: ["src/test.ts"],
			});

			await saveAuditRecord(testDir, record);

			const content = await fs.readFile(auditFile, "utf8");
			const log = JSON.parse(content) as ImpactAuditLog;
			expect(log.records).toHaveLength(1);
			expect(log.records[0]?.id).toBe(record.id);
		});

		test("appends to existing log", async () => {
			const record1 = createAuditRecord("git", {
				commits: [],
				changedFiles: ["src/a.ts"],
			});
			const record2 = createAuditRecord("git", {
				commits: [],
				changedFiles: ["src/b.ts"],
			});

			await saveAuditRecord(testDir, record1);
			await saveAuditRecord(testDir, record2);

			const log = await loadAuditLog(testDir);
			expect(log.records).toHaveLength(2);
		});

		test("prunes old records beyond MAX_RECORDS", async () => {
			// Create 55 records (MAX_RECORDS is 50)
			for (let i = 0; i < 55; i++) {
				const record = createAuditRecord("git", {
					commits: [],
					changedFiles: [`src/file${i}.ts`],
				});
				await saveAuditRecord(testDir, record);
			}

			const log = await loadAuditLog(testDir);
			expect(log.records).toHaveLength(50);
			// Should keep the most recent records
			expect(log.records[0]?.trigger.changedFiles[0]).toBe("src/file5.ts");
			expect(log.records[49]?.trigger.changedFiles[0]).toBe("src/file54.ts");
		});

		test("creates .jolli directory if it does not exist", async () => {
			const record = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});

			await saveAuditRecord(testDir, record);

			const stats = await fs.stat(auditDir);
			expect(stats.isDirectory()).toBe(true);
		});
	});

	describe("createAuditRecord", () => {
		test("creates record with unique ID", () => {
			const record1 = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});
			const record2 = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});

			expect(record1.id).toBeDefined();
			expect(record2.id).toBeDefined();
			expect(record1.id).not.toBe(record2.id);
		});

		test("creates record with ISO timestamp", () => {
			const before = new Date().toISOString();
			const record = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});
			const after = new Date().toISOString();

			expect(record.timestamp).toBeDefined();
			expect(record.timestamp >= before).toBe(true);
			expect(record.timestamp <= after).toBe(true);
		});

		test("creates record with correct source", () => {
			const gitRecord = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});
			const syncRecord = createAuditRecord("sync", {
				commits: [],
				changedFiles: [],
			});

			expect(gitRecord.source).toBe("git");
			expect(syncRecord.source).toBe("sync");
		});

		test("creates record with empty articles array", () => {
			const record = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});

			expect(record.articles).toEqual([]);
		});
	});

	describe("addArticleToRecord", () => {
		test("adds article to record immutably", () => {
			const record = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});

			const entry: ArticleAuditEntry = {
				jrn: "DOC_001",
				path: "docs/test.md",
				status: "updated",
				evidence: [{ changedFile: "src/test.ts", pattern: "src/*.ts", matchType: "glob", source: "<local>" }],
				patch: "@@ -1 +1 @@\n-old\n+new",
			};

			const updated = addArticleToRecord(record, entry);

			// Original unchanged
			expect(record.articles).toHaveLength(0);
			// New record has article
			expect(updated.articles).toHaveLength(1);
			expect(updated.articles[0]).toBe(entry);
		});

		test("preserves existing articles", () => {
			const record = createAuditRecord("git", {
				commits: [],
				changedFiles: [],
			});

			const entry1: ArticleAuditEntry = {
				jrn: "DOC_001",
				path: "docs/a.md",
				status: "updated",
				evidence: [],
			};
			const entry2: ArticleAuditEntry = {
				jrn: "DOC_002",
				path: "docs/b.md",
				status: "skipped",
				evidence: [],
			};

			const withFirst = addArticleToRecord(record, entry1);
			const withBoth = addArticleToRecord(withFirst, entry2);

			expect(withBoth.articles).toHaveLength(2);
			expect(withBoth.articles[0]?.jrn).toBe("DOC_001");
			expect(withBoth.articles[1]?.jrn).toBe("DOC_002");
		});
	});

	describe("getLatestRecord", () => {
		test("returns null for empty log", () => {
			const log: ImpactAuditLog = { version: 1, records: [] };
			expect(getLatestRecord(log)).toBeNull();
		});

		test("returns most recent record", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "older",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "newer",
						timestamp: "2024-01-15T11:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
				],
			};

			const latest = getLatestRecord(log);
			expect(latest?.id).toBe("newer");
		});
	});

	describe("getUpdatedArticles", () => {
		test("filters to only updated articles", () => {
			const record: ImpactAuditRecord = {
				id: "test",
				timestamp: "2024-01-15T10:00:00Z",
				source: "git",
				trigger: { commits: [], changedFiles: [] },
				articles: [
					{ jrn: "DOC_001", path: "a.md", status: "updated", evidence: [] },
					{ jrn: "DOC_002", path: "b.md", status: "skipped", evidence: [] },
					{ jrn: "DOC_003", path: "c.md", status: "unchanged", evidence: [] },
					{ jrn: "DOC_004", path: "d.md", status: "error", evidence: [], error: "Failed" },
					{ jrn: "DOC_005", path: "e.md", status: "updated", evidence: [] },
				],
			};

			const updated = getUpdatedArticles(record);
			expect(updated).toHaveLength(2);
			expect(updated[0]?.jrn).toBe("DOC_001");
			expect(updated[1]?.jrn).toBe("DOC_005");
		});

		test("returns empty array when no updates", () => {
			const record: ImpactAuditRecord = {
				id: "test",
				timestamp: "2024-01-15T10:00:00Z",
				source: "git",
				trigger: { commits: [], changedFiles: [] },
				articles: [{ jrn: "DOC_001", path: "a.md", status: "skipped", evidence: [] }],
			};

			const updated = getUpdatedArticles(record);
			expect(updated).toHaveLength(0);
		});
	});

	describe("getLatestGitRecord", () => {
		test("returns null for empty log", () => {
			const log: ImpactAuditLog = { version: 1, records: [] };
			expect(getLatestGitRecord(log)).toBeNull();
		});

		test("returns null when no git records exist", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "sync-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: ["docs/a.md"] },
						articles: [],
					},
					{
						id: "sync-2",
						timestamp: "2024-01-15T11:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: ["docs/b.md"] },
						articles: [],
					},
				],
			};
			expect(getLatestGitRecord(log)).toBeNull();
		});

		test("returns most recent git record", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "git-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "git-2",
						timestamp: "2024-01-15T11:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
				],
			};

			const latest = getLatestGitRecord(log);
			expect(latest?.id).toBe("git-2");
		});

		test("returns git record even when sync records are more recent", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "git-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "sync-1",
						timestamp: "2024-01-15T11:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "sync-2",
						timestamp: "2024-01-15T12:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
				],
			};

			const latest = getLatestGitRecord(log);
			expect(latest?.id).toBe("git-1");
		});

		test("returns most recent git record when interleaved with sync records", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "git-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "sync-1",
						timestamp: "2024-01-15T11:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "git-2",
						timestamp: "2024-01-15T12:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
					{
						id: "sync-2",
						timestamp: "2024-01-15T13:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: [] },
						articles: [],
					},
				],
			};

			const latest = getLatestGitRecord(log);
			expect(latest?.id).toBe("git-2");
		});
	});

	describe("getUpdatedArticlePaths", () => {
		test("returns paths of updated articles only", () => {
			const record: ImpactAuditRecord = {
				id: "test",
				timestamp: "2024-01-15T10:00:00Z",
				source: "git",
				trigger: { commits: [], changedFiles: [] },
				articles: [
					{ jrn: "DOC_001", path: "docs/a.md", status: "updated", evidence: [] },
					{ jrn: "DOC_002", path: "docs/b.md", status: "skipped", evidence: [] },
					{ jrn: "DOC_003", path: "docs/c.md", status: "unchanged", evidence: [] },
					{ jrn: "DOC_004", path: "docs/d.md", status: "updated", evidence: [] },
					{ jrn: "DOC_005", path: "docs/e.md", status: "error", evidence: [], error: "Failed" },
				],
			};

			const paths = getUpdatedArticlePaths(record);
			expect(paths).toEqual(["docs/a.md", "docs/d.md"]);
		});

		test("returns empty array when no articles updated", () => {
			const record: ImpactAuditRecord = {
				id: "test",
				timestamp: "2024-01-15T10:00:00Z",
				source: "git",
				trigger: { commits: [], changedFiles: [] },
				articles: [
					{ jrn: "DOC_001", path: "docs/a.md", status: "skipped", evidence: [] },
					{ jrn: "DOC_002", path: "docs/b.md", status: "unchanged", evidence: [] },
				],
			};

			const paths = getUpdatedArticlePaths(record);
			expect(paths).toEqual([]);
		});

		test("returns empty array when no articles exist", () => {
			const record: ImpactAuditRecord = {
				id: "test",
				timestamp: "2024-01-15T10:00:00Z",
				source: "git",
				trigger: { commits: [], changedFiles: [] },
				articles: [],
			};

			const paths = getUpdatedArticlePaths(record);
			expect(paths).toEqual([]);
		});
	});
});
