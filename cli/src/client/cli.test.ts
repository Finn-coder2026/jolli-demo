import {
	generateId,
	hashFingerprint,
	matchesAnyGlob,
	parseYamlFrontmatter,
	parseYamlList,
	passthroughObfuscator,
	purgeSnapshots,
	renameFile,
	type SyncState,
	toYamlFrontmatter,
} from "./cli";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("parseYamlList", () => {
	test("parses simple list", () => {
		const yaml = `include:
  - "**/*.md"
  - "docs/**"`;
		expect(parseYamlList(yaml, "include")).toEqual(["**/*.md", "docs/**"]);
	});

	test("parses list without quotes", () => {
		const yaml = `exclude:
  - node_modules
  - .git`;
		expect(parseYamlList(yaml, "exclude")).toEqual(["node_modules", ".git"]);
	});

	test("returns empty array for missing key", () => {
		const yaml = `include:
  - "**/*.md"`;
		expect(parseYamlList(yaml, "exclude")).toEqual([]);
	});

	test("returns empty array for empty yaml", () => {
		expect(parseYamlList("", "include")).toEqual([]);
	});
});

describe("parseYamlFrontmatter", () => {
	test("parses empty state", () => {
		const content = `---
lastCursor: 0
files:
---
# Jolli Sync State`;
		const state = parseYamlFrontmatter(content);
		expect(state.lastCursor).toBe(0);
		expect(state.files).toEqual([]);
	});

	test("parses state with cursor", () => {
		const content = `---
lastCursor: 42
files:
---`;
		const state = parseYamlFrontmatter(content);
		expect(state.lastCursor).toBe(42);
	});

	test("parses state with files", () => {
		const content = `---
lastCursor: 5
files:
  - clientPath: "docs/readme.md"
    fileId: "ABC123"
    serverPath: "docs/readme.md"
    fingerprint: "deadbeef"
    serverVersion: 3
---`;
		const state = parseYamlFrontmatter(content);
		expect(state.files).toHaveLength(1);
		expect(state.files[0]).toEqual({
			clientPath: "docs/readme.md",
			fileId: "ABC123",
			serverPath: "docs/readme.md",
			fingerprint: "deadbeef",
			serverVersion: 3,
		});
	});

	test("parses state with config", () => {
		const content = `---
lastCursor: 0
include:
  - "**/*.md"
  - "**/*.txt"
exclude:
  - "node_modules/**"
files:
---`;
		const state = parseYamlFrontmatter(content);
		expect(state.config?.include).toEqual(["**/*.md", "**/*.txt"]);
		expect(state.config?.exclude).toEqual(["node_modules/**"]);
	});

	test("returns default state for invalid content", () => {
		const state = parseYamlFrontmatter("not yaml frontmatter");
		expect(state.lastCursor).toBe(0);
		expect(state.files).toEqual([]);
	});

	test("parses multiple files", () => {
		const content = `---
lastCursor: 10
files:
  - clientPath: "file1.md"
    fileId: "ID1"
    serverPath: "file1.md"
    fingerprint: "fp1"
    serverVersion: 1
  - clientPath: "file2.md"
    fileId: "ID2"
    serverPath: "file2.md"
    fingerprint: "fp2"
    serverVersion: 2
---`;
		const state = parseYamlFrontmatter(content);
		expect(state.files).toHaveLength(2);
		expect(state.files[0].fileId).toBe("ID1");
		expect(state.files[1].fileId).toBe("ID2");
	});
});

describe("toYamlFrontmatter", () => {
	test("serializes empty state", () => {
		const state: SyncState = { lastCursor: 0, files: [] };
		const yaml = toYamlFrontmatter(state);
		expect(yaml).toContain("lastCursor: 0");
		expect(yaml).toContain("files:");
	});

	test("serializes state with files", () => {
		const state: SyncState = {
			lastCursor: 5,
			files: [
				{
					clientPath: "test.md",
					fileId: "TEST123",
					serverPath: "test.md",
					fingerprint: "abc123",
					serverVersion: 2,
				},
			],
		};
		const yaml = toYamlFrontmatter(state);
		expect(yaml).toContain("lastCursor: 5");
		expect(yaml).toContain('clientPath: "test.md"');
		expect(yaml).toContain('fileId: "TEST123"');
		expect(yaml).toContain('serverPath: "test.md"');
		expect(yaml).toContain('fingerprint: "abc123"');
		expect(yaml).toContain("serverVersion: 2");
	});

	test("serializes state with config", () => {
		const state: SyncState = {
			lastCursor: 0,
			config: {
				include: ["**/*.md"],
				exclude: ["node_modules/**"],
			},
			files: [],
		};
		const yaml = toYamlFrontmatter(state);
		expect(yaml).toContain("include:");
		expect(yaml).toContain('"**/*.md"');
		expect(yaml).toContain("exclude:");
		expect(yaml).toContain('"node_modules/**"');
	});

	test("roundtrip: parse then serialize preserves data", () => {
		const original: SyncState = {
			lastCursor: 42,
			config: {
				include: ["**/*.md", "docs/**/*.txt"],
				exclude: ["node_modules/**"],
			},
			files: [
				{
					clientPath: "readme.md",
					fileId: "FILE1",
					serverPath: "readme.md",
					fingerprint: "hash1",
					serverVersion: 5,
					conflicted: true,
					conflictAt: 1700000000000,
					conflictServerVersion: 6,
				},
				{
					clientPath: "docs/guide.md",
					fileId: "FILE2",
					serverPath: "docs/guide.md",
					fingerprint: "hash2",
					serverVersion: 3,
				},
			],
		};
		const yaml = toYamlFrontmatter(original);
		const parsed = parseYamlFrontmatter(yaml);

		expect(parsed.lastCursor).toBe(original.lastCursor);
		expect(parsed.config?.include).toEqual(original.config?.include);
		expect(parsed.config?.exclude).toEqual(original.config?.exclude);
		expect(parsed.files).toHaveLength(original.files.length);
		expect(parsed.files[0]).toEqual(original.files[0]);
		expect(parsed.files[1]).toEqual(original.files[1]);
	});
});

describe("generateId", () => {
	test("generates uppercase string", () => {
		const id = generateId();
		expect(id).toBe(id.toUpperCase());
	});

	test("generates unique ids", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateId());
		}
		expect(ids.size).toBe(100);
	});

	test("generates non-empty string", () => {
		const id = generateId();
		expect(id.length).toBeGreaterThan(0);
	});
});

describe("matchesAnyGlob", () => {
	test("matches simple pattern", () => {
		expect(matchesAnyGlob("file.md", ["*.md"])).toBe(true);
		expect(matchesAnyGlob("file.txt", ["*.md"])).toBe(false);
	});

	test("matches any of multiple patterns", () => {
		expect(matchesAnyGlob("file.md", ["*.txt", "*.md"])).toBe(true);
		expect(matchesAnyGlob("file.js", ["*.txt", "*.md"])).toBe(false);
	});

	test("matches nested paths", () => {
		expect(matchesAnyGlob("docs/readme.md", ["**/*.md"])).toBe(true);
		expect(matchesAnyGlob("deep/nested/file.md", ["**/*.md"])).toBe(true);
	});

	test("returns false for empty patterns", () => {
		expect(matchesAnyGlob("file.md", [])).toBe(false);
	});
});

describe("hashFingerprint", () => {
	test("computeFromContent returns consistent hash", () => {
		const content = "Hello, World!";
		const hash1 = hashFingerprint.computeFromContent(content);
		const hash2 = hashFingerprint.computeFromContent(content);
		expect(hash1).toBe(hash2);
	});

	test("computeFromContent ignores jrn line", () => {
		const withJrn = `---\njrn: ABC123\n---\n# Note`;
		const withoutJrn = `---\n---\n# Note`;
		const hashWith = hashFingerprint.computeFromContent(withJrn);
		const hashWithout = hashFingerprint.computeFromContent(withoutJrn);
		expect(hashWith).toBe(hashWithout);
	});

	test("computeFromContent returns different hash for different content", () => {
		const hash1 = hashFingerprint.computeFromContent("Hello");
		const hash2 = hashFingerprint.computeFromContent("World");
		expect(hash1).not.toBe(hash2);
	});

	test("computeFromContent returns hex string", () => {
		const hash = hashFingerprint.computeFromContent("test");
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});
});

describe("passthroughObfuscator", () => {
	test("obfuscate returns same path", () => {
		expect(passthroughObfuscator.obfuscate("docs/readme.md")).toBe("docs/readme.md");
	});

	test("deobfuscate returns same path", () => {
		expect(passthroughObfuscator.deobfuscate("docs/readme.md")).toBe("docs/readme.md");
	});

	test("roundtrip preserves path", () => {
		const path = "deep/nested/file.md";
		const obfuscated = passthroughObfuscator.obfuscate(path);
		const deobfuscated = passthroughObfuscator.deobfuscate(obfuscated);
		expect(deobfuscated).toBe(path);
	});
});

describe("hashFingerprint.compute", () => {
	const testFile = "/tmp/jolli-test-fingerprint.md";

	beforeEach(async () => {
		await writeFile(testFile, "test content for fingerprinting");
	});

	afterEach(async () => {
		try {
			await rm(testFile, { force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	test("computes hash from file", async () => {
		const hash = await hashFingerprint.compute(testFile);
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});

	test("file hash matches content hash", async () => {
		const content = "test content for fingerprinting";
		const fileHash = await hashFingerprint.compute(testFile);
		const contentHash = hashFingerprint.computeFromContent(content);
		expect(fileHash).toBe(contentHash);
	});
});

describe("purgeSnapshots", () => {
	const snapshotDir = ".jolli/snapshots";
	const activeId = "ACTIVE123";
	const staleId = "STALE123";
	const activePath = `${snapshotDir}/${activeId}.md`;
	const stalePath = `${snapshotDir}/${staleId}.md`;

	beforeEach(async () => {
		await mkdir(snapshotDir, { recursive: true });
		await writeFile(activePath, "active");
		await writeFile(stalePath, "stale");
	});

	afterEach(async () => {
		await rm(activePath, { force: true });
		await rm(stalePath, { force: true });
		try {
			const entries = await readdir(snapshotDir);
			if (entries.length === 0) {
				await rm(snapshotDir, { recursive: true, force: true });
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	test("removes snapshots not present in state", async () => {
		const state: SyncState = {
			lastCursor: 0,
			files: [
				{
					clientPath: "docs/readme.md",
					fileId: activeId,
					serverPath: "docs/readme.md",
					fingerprint: "hash",
					serverVersion: 1,
				},
			],
		};

		await purgeSnapshots(state);

		expect(existsSync(activePath)).toBe(true);
		expect(existsSync(stalePath)).toBe(false);
	});
});

describe("renameFile", () => {
	const testDir = "/tmp/jolli-rename-test";
	const oldPath = `${testDir}/old.md`;
	const newPath = `${testDir}/subdir/new.md`;

	beforeEach(async () => {
		await mkdir(testDir, { recursive: true });
		await writeFile(oldPath, "test content");
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test("renames file to new path", async () => {
		const result = await renameFile(oldPath, newPath);

		expect(result).toBe(true);
		expect(existsSync(oldPath)).toBe(false);
		expect(existsSync(newPath)).toBe(true);
	});

	test("creates parent directories if needed", async () => {
		const deepPath = `${testDir}/a/b/c/renamed.md`;
		const result = await renameFile(oldPath, deepPath);

		expect(result).toBe(true);
		expect(existsSync(deepPath)).toBe(true);
	});

	test("returns false if source file does not exist", async () => {
		const result = await renameFile(`${testDir}/nonexistent.md`, newPath);

		expect(result).toBe(false);
	});

	test("preserves file content after rename", async () => {
		const content = "preserved content";
		await writeFile(oldPath, content);

		await renameFile(oldPath, newPath);

		const { readFile } = await import("node:fs/promises");
		const resultContent = await readFile(newPath, "utf-8");
		expect(resultContent).toBe(content);
	});
});
