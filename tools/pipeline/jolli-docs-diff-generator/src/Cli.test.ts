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

		it("should parse --from argument", () => {
			const result = parseArgs(["--from", "v1"]);

			expect(result.fromVersion).toBe("v1");
		});

		it("should parse --to argument", () => {
			const result = parseArgs(["--to", "v2"]);

			expect(result.toVersion).toBe("v2");
		});

		it("should parse --artifactsDir argument", () => {
			const result = parseArgs(["--artifactsDir", "/artifacts"]);

			expect(result.artifactsDir).toContain("artifacts");
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
				"--from",
				"v1",
				"--to",
				"v2",
				"--artifactsDir",
				"/output",
			]);

			expect(result.source).toBe("test-api");
			expect(result.fromVersion).toBe("v1");
			expect(result.toVersion).toBe("v2");
			expect(result.artifactsDir).toContain("output");
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
			expect(output).toContain("jolli-docs-diff-generator");
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

		it("should return 1 when diff generation fails", () => {
			const exitCode = main([
				"--source",
				"nonexistent",
				"--from",
				"v1",
				"--to",
				"v2",
				"--artifactsDir",
				"/nonexistent",
			]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should return 0 when diff generation succeeds", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "cli-test-"));

			try {
				const sourceDir = join(tempDir, "test-api");
				const v1Dir = join(sourceDir, "v1");
				const v2Dir = join(sourceDir, "v2");
				mkdirSync(v1Dir, { recursive: true });
				mkdirSync(v2Dir, { recursive: true });

				const graphV1 = {
					version: "v1",
					generated_at: "2025-01-01T00:00:00.000Z",
					sections: [
						{
							section_id: "doc::sec1",
							doc_path: "doc.mdx",
							heading: "Section 1",
							heading_level: 2,
							content_hash: "sha256:abc123",
							covers: [],
							word_count: 50,
						},
					],
				};

				const graphV2 = {
					version: "v2",
					generated_at: "2025-01-02T00:00:00.000Z",
					sections: [
						{
							section_id: "doc::sec1",
							doc_path: "doc.mdx",
							heading: "Section 1",
							heading_level: 2,
							content_hash: "sha256:xyz789",
							covers: [],
							word_count: 60,
						},
					],
				};

				writeFileSync(
					join(v1Dir, "graph.json"),
					JSON.stringify(graphV1),
					"utf-8",
				);
				writeFileSync(
					join(v2Dir, "graph.json"),
					JSON.stringify(graphV2),
					"utf-8",
				);

				const exitCode = main([
					"--source",
					"test-api",
					"--from",
					"v1",
					"--to",
					"v2",
					"--artifactsDir",
					tempDir,
				]);

				expect(exitCode).toBe(0);
				expect(consoleSpy).toHaveBeenCalled();

				const output = consoleSpy.mock.calls.flat().join("\n");
				expect(output).toContain("Diff generation complete!");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});
