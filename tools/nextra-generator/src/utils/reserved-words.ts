/**
 * Reserved words utility for safe slug generation.
 *
 * Detects JavaScript reserved words, TypeScript keywords, and other problematic
 * identifiers that could cause build failures when used as slugs in Nextra sites.
 */

/**
 * JavaScript reserved words (ES6+ including strict mode)
 * These cannot be used as identifiers in JavaScript.
 */
const JS_RESERVED = new Set([
	// Keywords
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
	// Strict mode reserved words
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
]);

/**
 * TypeScript-specific keywords that are not JavaScript reserved words
 * but may cause issues in TypeScript contexts.
 */
const TS_KEYWORDS = new Set([
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
]);

/**
 * Other problematic identifiers that aren't reserved words but can cause
 * issues in object property contexts or have special meanings.
 */
const PROBLEMATIC = new Set([
	"__proto__",
	"prototype",
	"constructor",
	"index", // Nextra uses index for the home page
]);

/**
 * Checks if a slug is a reserved word or problematic identifier.
 *
 * @param slug - The slug to check (should be lowercase)
 * @returns true if the slug is reserved/problematic and needs sanitization
 */
export function isReservedSlug(slug: string): boolean {
	return JS_RESERVED.has(slug) || TS_KEYWORDS.has(slug) || PROBLEMATIC.has(slug);
}

/**
 * Gets all reserved words for testing/debugging purposes.
 */
export function getAllReservedWords(): Array<string> {
	return [...JS_RESERVED, ...TS_KEYWORDS, ...PROBLEMATIC];
}
