import { getAllReservedWords, isReservedSlug } from "./reserved-words.js";
import { describe, expect, it } from "vitest";

describe("reserved-words", () => {
	describe("isReservedSlug", () => {
		it("should detect JavaScript reserved words", () => {
			const jsReserved = [
				"break",
				"case",
				"catch",
				"class",
				"const",
				"continue",
				"debugger",
				"default",
				"delete",
				"do",
				"else",
				"export",
				"extends",
				"false",
				"finally",
				"for",
				"function",
				"if",
				"import",
				"in",
				"instanceof",
				"let",
				"new",
				"null",
				"return",
				"static",
				"super",
				"switch",
				"this",
				"throw",
				"true",
				"try",
				"typeof",
				"var",
				"void",
				"while",
				"with",
				"yield",
			];

			for (const word of jsReserved) {
				expect(isReservedSlug(word), `Expected '${word}' to be reserved`).toBe(true);
			}
		});

		it("should detect strict mode reserved words", () => {
			const strictModeReserved = [
				"arguments",
				"eval",
				"implements",
				"interface",
				"package",
				"private",
				"protected",
				"public",
				"await",
				"enum",
			];

			for (const word of strictModeReserved) {
				expect(isReservedSlug(word), `Expected '${word}' to be reserved`).toBe(true);
			}
		});

		it("should detect TypeScript keywords", () => {
			const tsKeywords = [
				"abstract",
				"any",
				"as",
				"asserts",
				"async",
				"bigint",
				"boolean",
				"declare",
				"get",
				"infer",
				"is",
				"keyof",
				"module",
				"namespace",
				"never",
				"number",
				"object",
				"override",
				"readonly",
				"require",
				"set",
				"string",
				"symbol",
				"type",
				"undefined",
				"unique",
				"unknown",
			];

			for (const word of tsKeywords) {
				expect(isReservedSlug(word), `Expected '${word}' to be reserved`).toBe(true);
			}
		});

		it("should detect problematic identifiers", () => {
			const problematic = ["__proto__", "prototype", "constructor", "index"];

			for (const word of problematic) {
				expect(isReservedSlug(word), `Expected '${word}' to be problematic`).toBe(true);
			}
		});

		it("should allow normal slugs", () => {
			const normalSlugs = [
				"getting-started",
				"api-reference",
				"introduction",
				"installation",
				"configuration",
				"my-guide",
				"hello-world",
				"readme",
				"changelog",
				"contributing",
			];

			for (const slug of normalSlugs) {
				expect(isReservedSlug(slug), `Expected '${slug}' to be allowed`).toBe(false);
			}
		});

		it("should be case-sensitive (slugs should be lowercase)", () => {
			// Reserved words are stored in lowercase, so uppercase versions should not match
			expect(isReservedSlug("Import")).toBe(false);
			expect(isReservedSlug("CLASS")).toBe(false);
			expect(isReservedSlug("Import")).toBe(false);

			// But lowercase should match
			expect(isReservedSlug("import")).toBe(true);
			expect(isReservedSlug("class")).toBe(true);
		});
	});

	describe("getAllReservedWords", () => {
		it("should return all reserved words", () => {
			const allWords = getAllReservedWords();

			expect(allWords.length).toBeGreaterThan(50);
			expect(allWords).toContain("import");
			expect(allWords).toContain("interface");
			expect(allWords).toContain("__proto__");
			expect(allWords).toContain("index");
		});

		it("should return an array of strings", () => {
			const allWords = getAllReservedWords();

			for (const word of allWords) {
				expect(typeof word).toBe("string");
			}
		});
	});
});
