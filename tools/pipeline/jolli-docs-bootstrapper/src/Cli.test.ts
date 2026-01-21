import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, parseArgs } from "./Cli.js";

describe("Cli", () => {
	describe("parseArgs", () => {
		it("should return default values when no args provided", () => {
			const result = parseArgs([]);

			expect(result.help).toBe(false);
			expect(result.aiEnhance).toBeUndefined();
		});

		it("should parse --source argument", () => {
			const result = parseArgs(["--source", "openapi-demo"]);

			expect(result.source).toBe("openapi-demo");
		});

		it("should parse --repo argument", () => {
			const result = parseArgs(["--repo", "/external/repo"]);

			expect(result.repo).toContain("external");
			expect(result.repo).toContain("repo");
		});

		it("should parse --docsDir argument", () => {
			const result = parseArgs(["--docsDir", "/docs"]);

			expect(result.docsDir).toContain("docs");
		});

		it("should parse --ai-enhance flag", () => {
			const result = parseArgs(["--ai-enhance"]);

			expect(result.aiEnhance).toBe(true);
		});

		it("should parse --help flag", () => {
			const result = parseArgs(["--help"]);

			expect(result.help).toBe(true);
		});

		it("should parse multiple arguments", () => {
			const result = parseArgs([
				"--source",
				"test-api",
				"--repo",
				"/repo",
				"--docsDir",
				"/docs",
				"--ai-enhance",
			]);

			expect(result.source).toBe("test-api");
			expect(result.repo).toContain("repo");
			expect(result.docsDir).toContain("docs");
			expect(result.aiEnhance).toBe(true);
		});
	});

	describe("main", () => {
		let consoleSpy: ReturnType<typeof vi.spyOn>;
		let errorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		afterEach(() => {
			consoleSpy.mockRestore();
			errorSpy.mockRestore();
		});

		it("should display help and return 0 when --help is passed", async () => {
			const exitCode = await main(["--help"]);

			expect(exitCode).toBe(0);
			expect(consoleSpy).toHaveBeenCalled();

			const output = consoleSpy.mock.calls.flat().join("\n");
			expect(output).toContain("jolli-docs-bootstrapper");
			expect(output).toContain("Usage:");
		});

		it("should return 1 when required options are missing", async () => {
			const exitCode = await main([]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();

			const output = errorSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Missing required options");
		});

		it("should return 1 when only source is provided", async () => {
			const exitCode = await main(["--source", "test"]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should return 1 when bootstrap fails", async () => {
			const exitCode = await main([
				"--source",
				"test",
				"--repo",
				"/nonexistent",
				"--docsDir",
				"/docs",
			]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should return 0 when bootstrap succeeds with ai-enhance", async () => {
			const tempDir = mkdtempSync(join(tmpdir(), "cli-test-"));
			const repoDir = join(tempDir, "repo");
			const docsDir = join(tempDir, "docs");

			try {
				// Create repo with sample route files
				mkdirSync(join(repoDir, "routes"), { recursive: true });
				writeFileSync(join(repoDir, "routes", "users.get.ts"), "export default {}");

				const exitCode = await main([
					"--source",
					"test-api",
					"--repo",
					repoDir,
					"--docsDir",
					docsDir,
					"--ai-enhance",
				]);

				expect(exitCode).toBe(0);
				expect(consoleSpy).toHaveBeenCalled();

				const output = consoleSpy.mock.calls.flat().join("\n");
				expect(output).toContain("AI Enhance: enabled");
				expect(output).toContain("Bootstrap complete!");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});
