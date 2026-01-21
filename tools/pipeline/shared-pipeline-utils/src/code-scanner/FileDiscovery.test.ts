import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { glob } from "glob";
import {
	DEFAULT_MAX_FILE_SIZE,
	DEFAULT_PATTERNS,
	DEFAULT_EXCLUDES,
	discoverCodeFiles,
	countCodeFiles,
} from "./FileDiscovery.js";

vi.mock("node:fs/promises");
vi.mock("glob");

describe("FileDiscovery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("DEFAULT_MAX_FILE_SIZE", () => {
		it("should be 500KB", () => {
			expect(DEFAULT_MAX_FILE_SIZE).toBe(500 * 1024);
		});
	});

	describe("DEFAULT_PATTERNS", () => {
		it("should include common route patterns", () => {
			expect(DEFAULT_PATTERNS).toContain("**/routes/**/*.{ts,js,mjs}");
			expect(DEFAULT_PATTERNS).toContain("**/controllers/**/*.{ts,js,mjs}");
			expect(DEFAULT_PATTERNS).toContain("**/api/**/*.{ts,js,mjs}");
			expect(DEFAULT_PATTERNS).toContain("**/*router*.{ts,js,mjs}");
		});

		it("should include entry point patterns", () => {
			expect(DEFAULT_PATTERNS).toContain("**/server.{ts,js,mjs}");
			expect(DEFAULT_PATTERNS).toContain("**/app.{ts,js,mjs}");
			expect(DEFAULT_PATTERNS).toContain("**/index.{ts,js,mjs}");
		});
	});

	describe("DEFAULT_EXCLUDES", () => {
		it("should exclude node_modules", () => {
			expect(DEFAULT_EXCLUDES).toContain("**/node_modules/**");
		});

		it("should exclude build directories", () => {
			expect(DEFAULT_EXCLUDES).toContain("**/dist/**");
			expect(DEFAULT_EXCLUDES).toContain("**/build/**");
		});

		it("should exclude test files", () => {
			expect(DEFAULT_EXCLUDES).toContain("**/*.test.{ts,js,mjs}");
			expect(DEFAULT_EXCLUDES).toContain("**/*.spec.{ts,js,mjs}");
		});
	});

	describe("discoverCodeFiles", () => {
		it("should yield files from glob iterator", async () => {
			const mockFiles = ["/repo/routes/users.ts", "/repo/routes/posts.ts"];

			// Create an async iterator mock
			async function* mockIterator(): AsyncGenerator<string> {
				for (const file of mockFiles) {
					yield file;
				}
			}

			vi.mocked(glob.iterate).mockReturnValue(mockIterator() as ReturnType<typeof glob.iterate>);
			vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as Awaited<ReturnType<typeof fs.stat>>);

			const files: Array<string> = [];
			for await (const file of discoverCodeFiles("/repo")) {
				files.push(file);
			}

			// Each pattern yields the same files, but dedup should work
			expect(files.length).toBeGreaterThan(0);
		});

		it("should skip files larger than maxFileSizeBytes", async () => {
			const mockFiles = ["/repo/large.ts", "/repo/small.ts"];

			async function* mockIterator(): AsyncGenerator<string> {
				for (const file of mockFiles) {
					yield file;
				}
			}

			vi.mocked(glob.iterate).mockReturnValue(mockIterator() as ReturnType<typeof glob.iterate>);
			vi.mocked(fs.stat)
				.mockResolvedValueOnce({ size: 600 * 1024 } as Awaited<ReturnType<typeof fs.stat>>) // large.ts - 600KB
				.mockResolvedValueOnce({ size: 1000 } as Awaited<ReturnType<typeof fs.stat>>); // small.ts - 1KB

			const files: Array<string> = [];
			const skippedFiles: Array<{ path: string; size: number }> = [];

			for await (const file of discoverCodeFiles("/repo", {
				onFileSkipped: (path, size) => skippedFiles.push({ path, size }),
			})) {
				files.push(file);
			}

			// large.ts should be skipped, small.ts should be included
			expect(files).toContain("/repo/small.ts");
			expect(files).not.toContain("/repo/large.ts");
			expect(skippedFiles).toHaveLength(1);
			expect(skippedFiles[0].path).toBe("/repo/large.ts");
		});

		it("should deduplicate files matched by multiple patterns", async () => {
			const seenPatterns: Array<string> = [];

			// Track which patterns are called
			vi.mocked(glob.iterate).mockImplementation((pattern: string | string[]) => {
				seenPatterns.push(pattern as string);

				async function* mockIterator(): AsyncGenerator<string> {
					// Return same file for multiple patterns to test dedup
					if (pattern.includes("routes")) {
						yield "/repo/routes/users.ts";
					}
					if (pattern.includes("router")) {
						yield "/repo/routes/users.ts"; // Duplicate
					}
				}

				return mockIterator() as ReturnType<typeof glob.iterate>;
			});

			vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as Awaited<ReturnType<typeof fs.stat>>);

			const files: Array<string> = [];
			for await (const file of discoverCodeFiles("/repo")) {
				files.push(file);
			}

			// Count occurrences of the same file - should only appear once
			const usersTsCount = files.filter(f => f === "/repo/routes/users.ts").length;
			expect(usersTsCount).toBe(1);
		});

		it("should skip files that fail stat", async () => {
			async function* mockIterator(): AsyncGenerator<string> {
				yield "/repo/missing.ts";
				yield "/repo/exists.ts";
			}

			vi.mocked(glob.iterate).mockReturnValue(mockIterator() as ReturnType<typeof glob.iterate>);
			vi.mocked(fs.stat)
				.mockRejectedValueOnce(new Error("ENOENT"))
				.mockResolvedValueOnce({ size: 1000 } as Awaited<ReturnType<typeof fs.stat>>);

			const files: Array<string> = [];
			for await (const file of discoverCodeFiles("/repo")) {
				files.push(file);
			}

			expect(files).toContain("/repo/exists.ts");
			expect(files).not.toContain("/repo/missing.ts");
		});

		it("should respect custom patterns option", async () => {
			const usedPatterns: Array<string> = [];

			vi.mocked(glob.iterate).mockImplementation((pattern: string | string[]) => {
				usedPatterns.push(pattern as string);

				async function* emptyIterator(): AsyncGenerator<string> {
					// Empty
				}

				return emptyIterator() as ReturnType<typeof glob.iterate>;
			});

			const files: Array<string> = [];
			for await (const file of discoverCodeFiles("/repo", {
				patterns: ["**/custom/**/*.ts"],
			})) {
				files.push(file);
			}

			expect(usedPatterns).toContain("**/custom/**/*.ts");
		});

		it("should respect custom excludeDirs option", async () => {
			let usedIgnore: Array<string> | undefined;

			vi.mocked(glob.iterate).mockImplementation((_pattern: string | string[], options) => {
				if (options && "ignore" in options) {
					usedIgnore = options.ignore as Array<string>;
				}

				async function* emptyIterator(): AsyncGenerator<string> {
					// Empty
				}

				return emptyIterator() as ReturnType<typeof glob.iterate>;
			});

			const files: Array<string> = [];
			for await (const file of discoverCodeFiles("/repo", {
				excludeDirs: ["**/custom-exclude/**"],
			})) {
				files.push(file);
			}

			expect(usedIgnore).toContain("**/custom-exclude/**");
		});

		it("should allow disabling file size limit with 0", async () => {
			const mockFiles = ["/repo/huge.ts"];

			async function* mockIterator(): AsyncGenerator<string> {
				for (const file of mockFiles) {
					yield file;
				}
			}

			vi.mocked(glob.iterate).mockReturnValue(mockIterator() as ReturnType<typeof glob.iterate>);
			// Even though file is huge, it should NOT be skipped when limit is 0
			vi.mocked(fs.stat).mockResolvedValue({ size: 10 * 1024 * 1024 } as Awaited<ReturnType<typeof fs.stat>>); // 10MB

			const files: Array<string> = [];
			for await (const file of discoverCodeFiles("/repo", { maxFileSizeBytes: 0 })) {
				files.push(file);
			}

			expect(files).toContain("/repo/huge.ts");
		});
	});

	describe("countCodeFiles", () => {
		it("should return total count of discovered files", async () => {
			const mockFiles = ["/repo/a.ts", "/repo/b.ts", "/repo/c.ts"];

			async function* mockIterator(): AsyncGenerator<string> {
				for (const file of mockFiles) {
					yield file;
				}
			}

			vi.mocked(glob.iterate).mockReturnValue(mockIterator() as ReturnType<typeof glob.iterate>);
			vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as Awaited<ReturnType<typeof fs.stat>>);

			const count = await countCodeFiles("/repo");

			expect(count).toBeGreaterThan(0);
		});
	});
});
