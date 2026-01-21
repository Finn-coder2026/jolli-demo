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

		it("should parse --version argument", () => {
			const result = parseArgs(["--version", "v1"]);

			expect(result.version).toBe("v1");
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
				"--version",
				"v2",
				"--artifactsDir",
				"/output",
			]);

			expect(result.source).toBe("test-api");
			expect(result.version).toBe("v2");
			expect(result.artifactsDir).toContain("output");
		});

		it("should parse --direct-only flag", () => {
			const result = parseArgs(["--direct-only"]);

			expect(result.directOnly).toBe(true);
		});

		it("should default directOnly to undefined", () => {
			const result = parseArgs([]);

			expect(result.directOnly).toBeUndefined();
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
			expect(output).toContain("jolli-docs-impact-analyzer");
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

		it("should return 1 when analysis fails", () => {
			const exitCode = main([
				"--source",
				"nonexistent",
				"--version",
				"v1",
				"--artifactsDir",
				"/nonexistent",
			]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should return 0 when analysis succeeds", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "cli-test-"));

			try {
				const sourceDir = join(tempDir, "test-api");
				const versionDir = join(sourceDir, "v1");
				mkdirSync(versionDir, { recursive: true });

				const changes = {
					source: "test-api",
					changed_contract_refs: [{ type: "openapi", key: "Op1" }],
				};
				// New format with SectionCoverage objects
				const reverseIndex = {
					"openapi:Op1": [
						{ section_id: "docs::section", coverage_type: "direct" },
						{ section_id: "docs::listed", coverage_type: "listed" },
					],
				};

				writeFileSync(
					join(sourceDir, "changed_contract_refs.json"),
					JSON.stringify(changes),
					"utf-8",
				);
				writeFileSync(
					join(versionDir, "reverse_index.json"),
					JSON.stringify(reverseIndex),
					"utf-8",
				);

				const exitCode = main([
					"--source",
					"test-api",
					"--version",
					"v1",
					"--artifactsDir",
					tempDir,
				]);

				expect(exitCode).toBe(0);
				expect(consoleSpy).toHaveBeenCalled();

				const output = consoleSpy.mock.calls.flat().join("\n");
				expect(output).toContain("Analysis complete!");
				expect(output).toContain("Contracts changed:");
				expect(output).toContain("Sections impacted: 2");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("should filter to direct-only sections when --direct-only is passed", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "cli-test-"));

			try {
				const sourceDir = join(tempDir, "test-api");
				const versionDir = join(sourceDir, "v1");
				mkdirSync(versionDir, { recursive: true });

				const changes = {
					source: "test-api",
					changed_contract_refs: [{ type: "openapi", key: "Op1" }],
				};
				// 2 sections: 1 direct, 1 listed
				const reverseIndex = {
					"openapi:Op1": [
						{ section_id: "docs::direct-section", coverage_type: "direct" },
						{ section_id: "docs::listed-section", coverage_type: "listed" },
					],
				};

				writeFileSync(
					join(sourceDir, "changed_contract_refs.json"),
					JSON.stringify(changes),
					"utf-8",
				);
				writeFileSync(
					join(versionDir, "reverse_index.json"),
					JSON.stringify(reverseIndex),
					"utf-8",
				);

				const exitCode = main([
					"--source",
					"test-api",
					"--version",
					"v1",
					"--artifactsDir",
					tempDir,
					"--direct-only",
				]);

				expect(exitCode).toBe(0);
				expect(consoleSpy).toHaveBeenCalled();

				const output = consoleSpy.mock.calls.flat().join("\n");
				expect(output).toContain("Direct Only: enabled");
				// Only 1 direct section should be impacted
				expect(output).toContain("Sections impacted: 1");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
});
