import { describe, expect, it, vi } from "vitest";
import { git } from "../GitDiff.js";
import { detectEnvContracts } from "./EnvDetector.js";

describe("EnvDetector", () => {
	describe("detectEnvContracts", () => {
		it("should detect added env vars from .env file", async () => {
			vi.spyOn(git, "execFileAsync").mockImplementation(async (_cmd, args) => {
				if (args.includes("--name-only")) {
					return { stdout: ".env\n", stderr: "" };
				}
				return {
					stdout: `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1,2 @@
+NEW_VAR=value
`,
					stderr: "",
				};
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.source).toBe("env");
			expect(result.summary.added).toEqual(["NEW_VAR"]);
			expect(result.changed_contract_refs).toEqual([{ type: "config", key: "NEW_VAR" }]);

			vi.restoreAllMocks();
		});

		it("should detect removed env vars from .env file", async () => {
			vi.spyOn(git, "execFileAsync").mockImplementation(async (_cmd, args) => {
				if (args.includes("--name-only")) {
					return { stdout: ".env.example\n", stderr: "" };
				}
				return {
					stdout: `diff --git a/.env.example b/.env.example
--- a/.env.example
+++ b/.env.example
@@ -1,2 +1 @@
-OLD_VAR=value
`,
					stderr: "",
				};
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.summary.removed).toEqual(["OLD_VAR"]);

			vi.restoreAllMocks();
		});

		it("should detect changed env vars (same key, different value)", async () => {
			vi.spyOn(git, "execFileAsync").mockImplementation(async (_cmd, args) => {
				if (args.includes("--name-only")) {
					return { stdout: ".env\n", stderr: "" };
				}
				return {
					stdout: `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1 @@
-API_KEY=old_value
+API_KEY=new_value
`,
					stderr: "",
				};
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.summary.changed).toEqual(["API_KEY"]);
			expect(result.summary.added).toEqual([]);
			expect(result.summary.removed).toEqual([]);

			vi.restoreAllMocks();
		});

		it("should detect process.env references in source files", async () => {
			vi.spyOn(git, "execFileAsync").mockImplementation(async (_cmd, args) => {
				if (args.includes("--name-only")) {
					return { stdout: "src/config.ts\n", stderr: "" };
				}
				return {
					stdout: `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1 +1,2 @@
+const api = process.env.API_URL;
`,
					stderr: "",
				};
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.summary.changed).toEqual(["API_URL"]);

			vi.restoreAllMocks();
		});

		it("should combine env file and source file changes", async () => {
			vi.spyOn(git, "execFileAsync").mockImplementation(async (_cmd, args) => {
				if (args.includes("--name-only")) {
					return { stdout: ".env\nsrc/app.ts\n", stderr: "" };
				}
				const filePath = args[args.length - 1];
				if (filePath === ".env") {
					return {
						stdout: `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1 @@
-OLD_VAR=test
+NEW_VAR=test
`,
						stderr: "",
					};
				}
				return {
					stdout: `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
+const x = process.env.CODE_REF;
`,
					stderr: "",
				};
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.summary.added).toEqual(["NEW_VAR"]);
			expect(result.summary.removed).toEqual(["OLD_VAR"]);
			expect(result.summary.changed).toEqual(["CODE_REF"]);

			vi.restoreAllMocks();
		});

		it("should not duplicate vars already in added/removed as changed", async () => {
			vi.spyOn(git, "execFileAsync").mockImplementation(async (_cmd, args) => {
				if (args.includes("--name-only")) {
					return { stdout: ".env\nsrc/app.ts\n", stderr: "" };
				}
				const filePath = args[args.length - 1];
				if (filePath === ".env") {
					return {
						stdout: `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1,2 @@
+API_KEY=test
`,
						stderr: "",
					};
				}
				return {
					stdout: `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
+const key = process.env.API_KEY;
`,
					stderr: "",
				};
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.summary.added).toEqual(["API_KEY"]);
			expect(result.summary.changed).toEqual([]);

			vi.restoreAllMocks();
		});

		it("should handle no changed files", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({ stdout: "", stderr: "" });

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.changed_contract_refs).toEqual([]);
			expect(result.summary).toEqual({ added: [], removed: [], changed: [] });

			vi.restoreAllMocks();
		});

		it("should ignore non-env and non-source files", async () => {
			vi.spyOn(git, "execFileAsync").mockResolvedValue({
				stdout: "README.md\npackage.json\nimage.png\n",
				stderr: "",
			});

			const result = await detectEnvContracts({
				detector: "env",
				base: "origin/main",
				output: "out.json",
				cwd: "/test",
			});

			expect(result.changed_contract_refs).toEqual([]);

			vi.restoreAllMocks();
		});
	});
});
