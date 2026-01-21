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
			expect(result.source).toBeUndefined();
		});

		it("should parse --source argument", () => {
			const result = parseArgs(["--source", "openapi-demo"]);

			expect(result.source).toBe("openapi-demo");
		});

		it("should parse --docsDir argument", () => {
			const result = parseArgs(["--docsDir", "/docs"]);

			expect(result.docsDir).toContain("docs");
		});

		it("should parse --version argument", () => {
			const result = parseArgs(["--version", "v1"]);

			expect(result.version).toBe("v1");
		});

		it("should parse --out argument", () => {
			const result = parseArgs(["--out", "/artifacts"]);

			expect(result.outputDir).toContain("artifacts");
		});

		it("should parse --outputDir as alias for --out", () => {
			const result = parseArgs(["--outputDir", "/output"]);

			expect(result.outputDir).toContain("output");
		});

		it("should parse --help flag", () => {
			const result = parseArgs(["--help"]);

			expect(result.help).toBe(true);
		});

		it("should parse -h flag", () => {
			const result = parseArgs(["-h"]);

			expect(result.help).toBe(true);
		});

		it("should parse multiple arguments", () => {
			const result = parseArgs([
				"--source",
				"test-api",
				"--docsDir",
				"/docs",
				"--version",
				"v2",
				"--out",
				"/output",
			]);

			expect(result.source).toBe("test-api");
			expect(result.docsDir).toContain("docs");
			expect(result.version).toBe("v2");
			expect(result.outputDir).toContain("output");
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

		it("should display help and return 0 when --help is passed", () => {
			const exitCode = main(["--help"]);

			expect(exitCode).toBe(0);
			expect(consoleSpy).toHaveBeenCalled();

			const output = consoleSpy.mock.calls.flat().join("\n");
			expect(output).toContain("jolli-docs-compiler");
			expect(output).toContain("Usage:");
		});

		it("should return 1 when required options are missing", () => {
			const exitCode = main([]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();

			const output = errorSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Missing required options");
		});

		it("should return 1 when only source is provided", () => {
			const exitCode = main(["--source", "test"]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should return 1 when compilation fails", () => {
			const exitCode = main([
				"--source",
				"test",
				"--docsDir",
				"/nonexistent",
				"--version",
				"v1",
				"--out",
				"/output",
			]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should return 0 when compilation succeeds", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "cli-test-"));
			const docsDir = join(tempDir, "docs");
			const outputDir = join(tempDir, "artifacts");

			try {
				mkdirSync(docsDir, { recursive: true });
				writeFileSync(join(docsDir, "test.mdx"), "## Test\nContent", "utf-8");

				const exitCode = main([
					"--source",
					"test-api",
					"--docsDir",
					docsDir,
					"--version",
					"v1",
					"--out",
					outputDir,
				]);

				expect(exitCode).toBe(0);
				expect(consoleSpy).toHaveBeenCalled();

				const output = consoleSpy.mock.calls.flat().join("\n");
				expect(output).toContain("Compilation complete!");
				expect(output).toContain("Documents processed:");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});
