import { INVALID_NAME_CHARS, validateItemName } from "./NameValidation";
import { describe, expect, it } from "vitest";

describe("NameValidation", () => {
	describe("INVALID_NAME_CHARS", () => {
		it("should match forward slash", () => {
			expect(INVALID_NAME_CHARS.test("test/name")).toBe(true);
		});

		it("should match backslash", () => {
			expect(INVALID_NAME_CHARS.test("test\\name")).toBe(true);
		});

		it("should match colon", () => {
			expect(INVALID_NAME_CHARS.test("test:name")).toBe(true);
		});

		it("should match asterisk", () => {
			expect(INVALID_NAME_CHARS.test("test*name")).toBe(true);
		});

		it("should match question mark", () => {
			expect(INVALID_NAME_CHARS.test("test?name")).toBe(true);
		});

		it("should match double quote", () => {
			expect(INVALID_NAME_CHARS.test('test"name')).toBe(true);
		});

		it("should match less than", () => {
			expect(INVALID_NAME_CHARS.test("test<name")).toBe(true);
		});

		it("should match greater than", () => {
			expect(INVALID_NAME_CHARS.test("test>name")).toBe(true);
		});

		it("should match pipe", () => {
			expect(INVALID_NAME_CHARS.test("test|name")).toBe(true);
		});

		it("should not match valid characters", () => {
			expect(INVALID_NAME_CHARS.test("valid-name_123")).toBe(false);
		});

		it("should not match spaces", () => {
			expect(INVALID_NAME_CHARS.test("name with spaces")).toBe(false);
		});

		it("should not match dots", () => {
			expect(INVALID_NAME_CHARS.test("file.name")).toBe(false);
		});

		it("should not match unicode characters", () => {
			expect(INVALID_NAME_CHARS.test("文档名称")).toBe(false);
		});
	});

	describe("validateItemName", () => {
		it("should return valid for normal names", () => {
			expect(validateItemName("My Document")).toEqual({ valid: true });
		});

		it("should return valid for names with dashes and underscores", () => {
			expect(validateItemName("my-document_v2")).toEqual({ valid: true });
		});

		it("should return valid for names with dots", () => {
			expect(validateItemName("config.json")).toEqual({ valid: true });
		});

		it("should return valid for unicode names", () => {
			expect(validateItemName("我的文档")).toEqual({ valid: true });
		});

		it("should return empty error for empty string", () => {
			expect(validateItemName("")).toEqual({ valid: false, error: "empty" });
		});

		it("should return empty error for whitespace only", () => {
			expect(validateItemName("   ")).toEqual({ valid: false, error: "empty" });
		});

		it("should return empty error for tabs only", () => {
			expect(validateItemName("\t\t")).toEqual({ valid: false, error: "empty" });
		});

		it("should return invalidChars error for forward slash", () => {
			expect(validateItemName("path/to/file")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for backslash", () => {
			expect(validateItemName("path\\to\\file")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for colon", () => {
			expect(validateItemName("C:file")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for asterisk", () => {
			expect(validateItemName("file*")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for question mark", () => {
			expect(validateItemName("file?")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for double quote", () => {
			expect(validateItemName('"file"')).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for angle brackets", () => {
			expect(validateItemName("<file>")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should return invalidChars error for pipe", () => {
			expect(validateItemName("file|name")).toEqual({ valid: false, error: "invalidChars" });
		});

		it("should trim whitespace before validation", () => {
			expect(validateItemName("  valid name  ")).toEqual({ valid: true });
		});

		it("should detect invalid chars after trimming", () => {
			expect(validateItemName("  invalid/name  ")).toEqual({ valid: false, error: "invalidChars" });
		});
	});
});
