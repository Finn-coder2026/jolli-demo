import { describe, expect, it } from "vitest";
import { analyzeCodeRefs, extractEnvRefsFromLine, extractEnvRefsFromLines } from "./CodeRefDetector.js";

describe("CodeRefDetector", () => {
	describe("extractEnvRefsFromLine", () => {
		it("should extract dot notation reference", () => {
			const result = extractEnvRefsFromLine("const val = process.env.MY_VAR;");

			expect(result).toEqual(["MY_VAR"]);
		});

		it("should extract bracket notation with double quotes", () => {
			const result = extractEnvRefsFromLine('const val = process.env["MY_VAR"];');

			expect(result).toEqual(["MY_VAR"]);
		});

		it("should extract bracket notation with single quotes", () => {
			const result = extractEnvRefsFromLine("const val = process.env['MY_VAR'];");

			expect(result).toEqual(["MY_VAR"]);
		});

		it("should extract multiple references from one line", () => {
			const result = extractEnvRefsFromLine(
				'const a = process.env.VAR1 || process.env["VAR2"] || process.env.VAR3;',
			);

			// Order depends on regex matching order (dot notation first, then bracket)
			expect(result).toHaveLength(3);
			expect(result).toContain("VAR1");
			expect(result).toContain("VAR2");
			expect(result).toContain("VAR3");
		});

		it("should handle variables with underscores and numbers", () => {
			const result = extractEnvRefsFromLine("const val = process.env.MY_VAR_123;");

			expect(result).toEqual(["MY_VAR_123"]);
		});

		it("should handle variable starting with underscore", () => {
			const result = extractEnvRefsFromLine("const val = process.env._PRIVATE;");

			expect(result).toEqual(["_PRIVATE"]);
		});

		it("should return empty array for no references", () => {
			const result = extractEnvRefsFromLine("const val = 'hello world';");

			expect(result).toEqual([]);
		});

		it("should return empty array for process.env without specific var", () => {
			const result = extractEnvRefsFromLine("const env = process.env;");

			expect(result).toEqual([]);
		});

		it("should not match dynamic access", () => {
			// Dynamic access like process.env[varName] should not be matched
			const result = extractEnvRefsFromLine("const val = process.env[varName];");

			expect(result).toEqual([]);
		});

		it("should handle realistic config file patterns", () => {
			const result = extractEnvRefsFromLine(
				'    port: parseInt(process.env.PORT || "3000", 10),',
			);

			expect(result).toEqual(["PORT"]);
		});

		it("should handle conditional expressions", () => {
			const result = extractEnvRefsFromLine(
				"const isDev = process.env.NODE_ENV !== 'production';",
			);

			expect(result).toEqual(["NODE_ENV"]);
		});
	});

	describe("extractEnvRefsFromLines", () => {
		it("should extract all references from multiple lines", () => {
			const lines = [
				"const port = process.env.PORT;",
				"const host = process.env.HOST;",
				"const db = process.env.DATABASE_URL;",
			];

			const result = extractEnvRefsFromLines(lines);

			expect(result).toEqual(new Set(["PORT", "HOST", "DATABASE_URL"]));
		});

		it("should deduplicate references", () => {
			const lines = [
				"const a = process.env.MY_VAR;",
				"const b = process.env.MY_VAR;",
			];

			const result = extractEnvRefsFromLines(lines);

			expect(result).toEqual(new Set(["MY_VAR"]));
		});

		it("should handle lines without references", () => {
			const lines = [
				"const a = 1;",
				"const port = process.env.PORT;",
				"console.log('hello');",
			];

			const result = extractEnvRefsFromLines(lines);

			expect(result).toEqual(new Set(["PORT"]));
		});

		it("should return empty set for no references", () => {
			const lines = ["const a = 1;", "const b = 2;"];

			const result = extractEnvRefsFromLines(lines);

			expect(result).toEqual(new Set());
		});
	});

	describe("analyzeCodeRefs", () => {
		it("should combine refs from added and removed lines", () => {
			const addedLines = ["const a = process.env.ADDED_REF;"];
			const removedLines = ["const b = process.env.REMOVED_REF;"];

			const result = analyzeCodeRefs(addedLines, removedLines);

			expect(result).toEqual(new Set(["ADDED_REF", "REMOVED_REF"]));
		});

		it("should deduplicate refs that appear in both", () => {
			const addedLines = ["const a = process.env.SAME_VAR || 'default';"];
			const removedLines = ["const a = process.env.SAME_VAR;"];

			const result = analyzeCodeRefs(addedLines, removedLines);

			expect(result).toEqual(new Set(["SAME_VAR"]));
		});

		it("should handle empty inputs", () => {
			const result = analyzeCodeRefs([], []);

			expect(result).toEqual(new Set());
		});

		it("should handle mixed content", () => {
			const addedLines = [
				"// Configure server",
				"const port = process.env.PORT;",
				"const host = process.env.HOST;",
			];
			const removedLines = [
				"const oldPort = process.env.OLD_PORT;",
			];

			const result = analyzeCodeRefs(addedLines, removedLines);

			expect(result).toEqual(new Set(["PORT", "HOST", "OLD_PORT"]));
		});
	});
});
