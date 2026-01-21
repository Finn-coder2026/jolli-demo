import { afterEach, describe, expect, it, vi } from "vitest";
import {
	categorizeChangedFiles,
	getChangedFiles,
	getFileDiff,
	git,
	isEnvFile,
	isSourceFile,
	parseUnifiedDiff,
} from "./GitDiff.js";

describe("GitDiff", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getChangedFiles", () => {
		it("should return list of changed files", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: ".env\nsrc/index.ts\npackage.json\n",
				stderr: "",
			});

			const result = await getChangedFiles("origin/main", "/test");

			expect(result).toEqual([".env", "src/index.ts", "package.json"]);
			expect(git.execFileAsync).toHaveBeenCalledWith(
				"git",
				["diff", "--name-only", "origin/main...HEAD"],
				{ cwd: "/test", encoding: "utf-8" },
			);
		});

		it("should filter empty lines", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: ".env\n\n  \nsrc/index.ts\n",
				stderr: "",
			});

			const result = await getChangedFiles("origin/main", "/test");

			expect(result).toEqual([".env", "src/index.ts"]);
		});

		it("should handle no changed files", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: "",
				stderr: "",
			});

			const result = await getChangedFiles("origin/main", "/test");

			expect(result).toEqual([]);
		});
	});

	describe("getFileDiff", () => {
		it("should return parsed diff for a file", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1,2 +1,2 @@
-OLD_VAR=value
+NEW_VAR=value
`,
				stderr: "",
			});

			const result = await getFileDiff(".env", "origin/main", "/test");

			expect(result.filePath).toBe(".env");
			expect(result.addedLines).toEqual(["NEW_VAR=value"]);
			expect(result.removedLines).toEqual(["OLD_VAR=value"]);
			expect(git.execFileAsync).toHaveBeenCalledWith(
				"git",
				["diff", "origin/main...HEAD", "--", ".env"],
				{ cwd: "/test", encoding: "utf-8" },
			);
		});

		it("should return empty diff on error (new/deleted file)", async () => {
			vi.spyOn(git, "execFileAsync").mockRejectedValue(new Error("Git error"));

			const result = await getFileDiff("new-file.ts", "origin/main", "/test");

			expect(result.filePath).toBe("new-file.ts");
			expect(result.addedLines).toEqual([]);
			expect(result.removedLines).toEqual([]);
		});
	});

	describe("parseUnifiedDiff", () => {
		it("should parse added and removed lines from diff output", () => {
			const diffOutput = `diff --git a/.env b/.env
index 1234567..abcdefg 100644
--- a/.env
+++ b/.env
@@ -1,3 +1,4 @@
 EXISTING_VAR=value
-OLD_VAR=old_value
+NEW_VAR=new_value
+ADDED_VAR=added
`;

			const result = parseUnifiedDiff(".env", diffOutput);

			expect(result.filePath).toBe(".env");
			expect(result.addedLines).toEqual(["NEW_VAR=new_value", "ADDED_VAR=added"]);
			expect(result.removedLines).toEqual(["OLD_VAR=old_value"]);
		});

		it("should ignore diff headers", () => {
			const diffOutput = `diff --git a/.env b/.env
index 1234567..abcdefg 100644
--- a/.env
+++ b/.env
@@ -1,2 +1,2 @@
-REMOVED=yes
+ADDED=yes`;

			const result = parseUnifiedDiff(".env", diffOutput);

			expect(result.addedLines).toEqual(["ADDED=yes"]);
			expect(result.removedLines).toEqual(["REMOVED=yes"]);
		});

		it("should handle empty diff", () => {
			const result = parseUnifiedDiff(".env", "");

			expect(result.filePath).toBe(".env");
			expect(result.addedLines).toEqual([]);
			expect(result.removedLines).toEqual([]);
		});

		it("should ignore context lines (no prefix)", () => {
			const diffOutput = `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1,3 +1,3 @@
 UNCHANGED=value
-OLD=value
+NEW=value`;

			const result = parseUnifiedDiff(".env", diffOutput);

			// Context lines (starting with space) should be ignored
			expect(result.addedLines).not.toContain("UNCHANGED=value");
			expect(result.removedLines).not.toContain("UNCHANGED=value");
		});
	});

	describe("isEnvFile", () => {
		it("should return true for .env", () => {
			expect(isEnvFile(".env")).toBe(true);
		});

		it("should return true for .env.example", () => {
			expect(isEnvFile(".env.example")).toBe(true);
		});

		it("should return true for .env.template", () => {
			expect(isEnvFile(".env.template")).toBe(true);
		});

		it("should return true for .env.local", () => {
			expect(isEnvFile(".env.local")).toBe(true);
		});

		it("should return true for nested path .env files", () => {
			expect(isEnvFile("config/.env")).toBe(true);
			expect(isEnvFile("config/.env.example")).toBe(true);
		});

		it("should return false for non-env files", () => {
			expect(isEnvFile("package.json")).toBe(false);
			expect(isEnvFile("src/index.ts")).toBe(false);
			expect(isEnvFile("README.md")).toBe(false);
		});

		it("should return false for files containing env but not .env pattern", () => {
			expect(isEnvFile("environment.ts")).toBe(false);
			expect(isEnvFile("env-config.json")).toBe(false);
		});

		it("should handle empty string path", () => {
			// Edge case: empty string has no "/" so split returns [""]
			// pop() returns "" which is falsy, so fallback to filePath
			expect(isEnvFile("")).toBe(false);
		});
	});

	describe("isSourceFile", () => {
		it("should return true for .js files", () => {
			expect(isSourceFile("index.js")).toBe(true);
		});

		it("should return true for .ts files", () => {
			expect(isSourceFile("index.ts")).toBe(true);
		});

		it("should return true for .jsx files", () => {
			expect(isSourceFile("Component.jsx")).toBe(true);
		});

		it("should return true for .tsx files", () => {
			expect(isSourceFile("Component.tsx")).toBe(true);
		});

		it("should return true for .mjs files", () => {
			expect(isSourceFile("module.mjs")).toBe(true);
		});

		it("should return true for .cjs files", () => {
			expect(isSourceFile("module.cjs")).toBe(true);
		});

		it("should return false for non-source files", () => {
			expect(isSourceFile("package.json")).toBe(false);
			expect(isSourceFile("README.md")).toBe(false);
			expect(isSourceFile(".env")).toBe(false);
			expect(isSourceFile("styles.css")).toBe(false);
		});
	});

	describe("categorizeChangedFiles", () => {
		it("should categorize env and source files correctly", () => {
			const files = [
				".env",
				".env.example",
				"src/config.ts",
				"lib/utils.js",
				"package.json",
				"README.md",
			];

			const result = categorizeChangedFiles(files);

			expect(result.envFiles).toEqual([".env", ".env.example"]);
			expect(result.sourceFiles).toEqual(["src/config.ts", "lib/utils.js"]);
		});

		it("should return empty arrays when no matching files", () => {
			const files = ["package.json", "README.md", "styles.css"];

			const result = categorizeChangedFiles(files);

			expect(result.envFiles).toEqual([]);
			expect(result.sourceFiles).toEqual([]);
		});

		it("should handle empty input", () => {
			const result = categorizeChangedFiles([]);

			expect(result.envFiles).toEqual([]);
			expect(result.sourceFiles).toEqual([]);
		});
	});
});
