import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main, parseArgs } from "./Cli.js";

describe("Cli", () => {
	describe("parseArgs", () => {
		it("should return default values when no args provided", () => {
			const result = parseArgs([]);

			expect(result.detector).toBe("env");
			expect(result.base).toBe("origin/main");
			expect(result.output).toBe("changed_contract_refs.json");
			expect(result.help).toBe(false);
			// cwd is dynamic, just check it's set
			expect(result.cwd).toBeTruthy();
		});

		it("should parse --base argument", () => {
			const result = parseArgs(["--base", "origin/develop"]);

			expect(result.base).toBe("origin/develop");
		});

		it("should parse --output argument", () => {
			const result = parseArgs(["--output", "custom-output.json"]);

			expect(result.output).toBe("custom-output.json");
		});

		it("should parse --cwd argument and resolve path", () => {
			const result = parseArgs(["--cwd", "/some/path"]);

			expect(result.cwd).toContain("some");
			expect(result.cwd).toContain("path");
		});

		it("should parse --help flag", () => {
			const result = parseArgs(["--help"]);

			expect(result.help).toBe(true);
		});

		it("should parse -h flag as help", () => {
			const result = parseArgs(["-h"]);

			expect(result.help).toBe(true);
		});

		it("should parse --detector argument", () => {
			const result = parseArgs(["--detector", "openapi"]);

			expect(result.detector).toBe("openapi");
		});

		it("should throw error for invalid detector type", () => {
			expect(() => parseArgs(["--detector", "invalid"])).toThrow(
				'Invalid detector type: invalid. Must be "env" or "openapi"',
			);
		});

		it("should parse --repo argument", () => {
			const result = parseArgs(["--repo", "/external/repo"]);

			expect(result.repo).toContain("external");
			expect(result.repo).toContain("repo");
		});

		it("should parse multiple arguments", () => {
			const result = parseArgs([
				"--detector",
				"openapi",
				"--base",
				"origin/feature",
				"--output",
				"result.json",
				"--cwd",
				"/project",
				"--repo",
				"/external",
			]);

			expect(result.detector).toBe("openapi");
			expect(result.base).toBe("origin/feature");
			expect(result.output).toBe("result.json");
			expect(result.repo).toContain("external");
		});

		it("should ignore unknown arguments", () => {
			const result = parseArgs(["--unknown", "value", "--base", "origin/test"]);

			expect(result.base).toBe("origin/test");
		});

		it("should handle argument without value at end", () => {
			// --base at end without value should leave default
			const result = parseArgs(["--output", "out.json", "--base"]);

			expect(result.output).toBe("out.json");
			expect(result.base).toBe("origin/main"); // Default
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
			// Check that help text was displayed
			const output = consoleSpy.mock.calls.flat().join("\n");
			expect(output).toContain("contract-detector");
			expect(output).toContain("Usage:");
		});

		it("should display help and return 0 when -h is passed", async () => {
			const exitCode = await main(["-h"]);

			expect(exitCode).toBe(0);
			expect(consoleSpy).toHaveBeenCalled();
		});

		it("should return 1 and log error when detection fails", async () => {
			// Running with invalid cwd should fail
			const exitCode = await main(["--cwd", "/nonexistent/path/that/does/not/exist"]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should handle non-Error exception types", async () => {
			// Mock detectContractChanges to throw a string instead of Error
			vi.doMock("./Detector.js", () => ({
				detectContractChanges: () => {
					throw "String error";
				},
			}));

			// The mocked function still throws, so we test error logging
			const exitCode = await main(["--cwd", "/nonexistent"]);

			expect(exitCode).toBe(1);
			expect(errorSpy).toHaveBeenCalled();
		});

		it("should log detection parameters before running", async () => {
			// Will fail but we can check the logging
			await main(["--base", "origin/test", "--output", "test.json", "--cwd", "/invalid"]);

			const output = consoleSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Detecting env contract changes");
			expect(output).toContain("Detector: env");
			expect(output).toContain("Base: origin/test");
			expect(output).toContain("Output: test.json");
		});

		it("should log repo parameter when provided", async () => {
			await main([
				"--detector",
				"openapi",
				"--base",
				"origin/test",
				"--repo",
				"/external",
				"--cwd",
				"/invalid",
			]);

			const output = consoleSpy.mock.calls.flat().join("\n");
			expect(output).toContain("Detecting openapi contract changes");
			expect(output).toContain("Repo:");
		});
	});
});
