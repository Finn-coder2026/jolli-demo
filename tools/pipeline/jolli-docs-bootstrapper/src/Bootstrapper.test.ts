import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapDocumentation, isDirectoryEmpty } from "./Bootstrapper.js";

describe("Bootstrapper", () => {
	describe("isDirectoryEmpty", () => {
		it("should return true for non-existent directory", () => {
			const result = isDirectoryEmpty("/nonexistent/path/that/does/not/exist");
			expect(result).toBe(true);
		});

		it("should return false for current directory (has files)", () => {
			const result = isDirectoryEmpty(".");
			expect(result).toBe(false);
		});
	});

	describe("bootstrapDocumentation", () => {
		let tempDir: string;
		let docsDir: string;
		let repoDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "bootstrap-test-"));
			docsDir = join(tempDir, "docs");
			repoDir = join(tempDir, "repo");

			// Create repo with sample route files
			mkdirSync(join(repoDir, "routes"), { recursive: true });
			writeFileSync(join(repoDir, "routes", "users.get.ts"), "export default {}");
			writeFileSync(join(repoDir, "routes", "posts.post.ts"), "export default {}");
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should bootstrap documentation from empty directory", async () => {
			mkdirSync(docsDir);

			const result = await bootstrapDocumentation({
				source: "test-api",
				repo: repoDir,
				docsDir,
			});

			expect(result.source).toBe("test-api");
			expect(result.filesCreated).toBeGreaterThan(0);
			expect(result.createdFiles.length).toBeGreaterThan(0);

			// Check files were created
			const files = readdirSync(docsDir, { recursive: true });
			expect(files.length).toBeGreaterThan(0);
		});

		it("should throw error if directory is not empty", async () => {
			mkdirSync(docsDir);
			writeFileSync(join(docsDir, "existing.md"), "content");

			await expect(
				bootstrapDocumentation({
					source: "test-api",
					repo: repoDir,
					docsDir,
				})
			).rejects.toThrow("not empty");
		});

		it("should create docs directory if it does not exist", async () => {
			const result = await bootstrapDocumentation({
				source: "test-api",
				repo: repoDir,
				docsDir,
			});

			expect(result.source).toBe("test-api");
			expect(result.filesCreated).toBeGreaterThan(0);
			expect(readdirSync(docsDir)).toBeDefined();
		});

		it("should throw error if repo does not exist", async () => {
			mkdirSync(docsDir);

			await expect(
				bootstrapDocumentation({
					source: "test-api",
					repo: "/nonexistent/repo",
					docsDir,
				})
			).rejects.toThrow();
		});

		it("should throw error if no endpoints found", async () => {
			// Create a new empty temp dir without route files
			const emptyRepoDir = join(tempDir, "empty-repo");
			mkdirSync(emptyRepoDir);
			mkdirSync(docsDir);

			await expect(
				bootstrapDocumentation({
					source: "test-api",
					repo: emptyRepoDir,
					docsDir,
				})
			).rejects.toThrow("No API endpoints found");
		});
	});
});
