import { describe, expect, it } from "vitest";
import { analyzeEnvChanges, extractEnvVarFromLine, extractEnvVarsFromLines } from "./EnvParser.js";

describe("EnvParser", () => {
	describe("extractEnvVarFromLine", () => {
		it("should extract variable name from simple assignment", () => {
			expect(extractEnvVarFromLine("MY_VAR=value")).toBe("MY_VAR");
		});

		it("should extract variable name from assignment with quoted value", () => {
			expect(extractEnvVarFromLine('MY_VAR="quoted value"')).toBe("MY_VAR");
			expect(extractEnvVarFromLine("MY_VAR='single quoted'")).toBe("MY_VAR");
		});

		it("should extract variable name from empty value assignment", () => {
			expect(extractEnvVarFromLine("EMPTY_VAR=")).toBe("EMPTY_VAR");
		});

		it("should handle variables with underscores", () => {
			expect(extractEnvVarFromLine("MY_LONG_VAR_NAME=value")).toBe("MY_LONG_VAR_NAME");
		});

		it("should handle variables starting with underscore", () => {
			expect(extractEnvVarFromLine("_PRIVATE_VAR=value")).toBe("_PRIVATE_VAR");
		});

		it("should handle variables with numbers", () => {
			expect(extractEnvVarFromLine("VAR123=value")).toBe("VAR123");
			expect(extractEnvVarFromLine("VAR_1_2_3=value")).toBe("VAR_1_2_3");
		});

		it("should return null for empty line", () => {
			expect(extractEnvVarFromLine("")).toBeNull();
			expect(extractEnvVarFromLine("   ")).toBeNull();
		});

		it("should return null for comment line", () => {
			expect(extractEnvVarFromLine("# This is a comment")).toBeNull();
			expect(extractEnvVarFromLine("  # Indented comment")).toBeNull();
		});

		it("should return null for lines without assignment", () => {
			expect(extractEnvVarFromLine("just some text")).toBeNull();
			expect(extractEnvVarFromLine("VAR_WITHOUT_EQUALS")).toBeNull();
		});

		it("should return null for invalid variable names", () => {
			// Variables cannot start with numbers
			expect(extractEnvVarFromLine("123VAR=value")).toBeNull();
		});

		it("should handle whitespace before variable", () => {
			expect(extractEnvVarFromLine("  MY_VAR=value")).toBe("MY_VAR");
		});
	});

	describe("extractEnvVarsFromLines", () => {
		it("should extract all variables from multiple lines", () => {
			const lines = ["VAR1=value1", "VAR2=value2", "VAR3=value3"];

			const result = extractEnvVarsFromLines(lines);

			expect(result).toEqual(new Set(["VAR1", "VAR2", "VAR3"]));
		});

		it("should ignore comments and empty lines", () => {
			const lines = ["VAR1=value1", "# comment", "", "VAR2=value2"];

			const result = extractEnvVarsFromLines(lines);

			expect(result).toEqual(new Set(["VAR1", "VAR2"]));
		});

		it("should deduplicate variables", () => {
			const lines = ["VAR=value1", "VAR=value2"];

			const result = extractEnvVarsFromLines(lines);

			expect(result).toEqual(new Set(["VAR"]));
		});

		it("should return empty set for no valid lines", () => {
			const lines = ["# comment", "", "not a var"];

			const result = extractEnvVarsFromLines(lines);

			expect(result).toEqual(new Set());
		});
	});

	describe("analyzeEnvChanges", () => {
		it("should detect added variables", () => {
			const addedLines = ["NEW_VAR=value"];
			const removedLines: Array<string> = [];

			const result = analyzeEnvChanges(addedLines, removedLines);

			expect(result.added).toEqual(new Set(["NEW_VAR"]));
			expect(result.removed).toEqual(new Set());
			expect(result.changed).toEqual(new Set());
		});

		it("should detect removed variables", () => {
			const addedLines: Array<string> = [];
			const removedLines = ["OLD_VAR=value"];

			const result = analyzeEnvChanges(addedLines, removedLines);

			expect(result.added).toEqual(new Set());
			expect(result.removed).toEqual(new Set(["OLD_VAR"]));
			expect(result.changed).toEqual(new Set());
		});

		it("should detect changed variables (same name, different value)", () => {
			const addedLines = ["MY_VAR=new_value"];
			const removedLines = ["MY_VAR=old_value"];

			const result = analyzeEnvChanges(addedLines, removedLines);

			expect(result.added).toEqual(new Set());
			expect(result.removed).toEqual(new Set());
			expect(result.changed).toEqual(new Set(["MY_VAR"]));
		});

		it("should handle mixed changes", () => {
			const addedLines = ["NEW_VAR=new", "CHANGED_VAR=new_value"];
			const removedLines = ["OLD_VAR=old", "CHANGED_VAR=old_value"];

			const result = analyzeEnvChanges(addedLines, removedLines);

			expect(result.added).toEqual(new Set(["NEW_VAR"]));
			expect(result.removed).toEqual(new Set(["OLD_VAR"]));
			expect(result.changed).toEqual(new Set(["CHANGED_VAR"]));
		});

		it("should handle empty inputs", () => {
			const result = analyzeEnvChanges([], []);

			expect(result.added).toEqual(new Set());
			expect(result.removed).toEqual(new Set());
			expect(result.changed).toEqual(new Set());
		});
	});
});
