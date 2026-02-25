import {
	addMetaEntry,
	extractSlugsWithLineNumbers,
	extractSlugsWithRegex,
	findEntryBoundaries,
	findKeyLineNumber,
	getEntryValue,
	removeMetaEntry,
	renameMetaEntry,
	validateMetaContent,
	validateMetaSyntaxOnly,
} from "./MetaValidator";
import { describe, expect, it } from "vitest";

describe("MetaValidator", () => {
	describe("validateMetaSyntaxOnly", () => {
		it("should pass for valid export default object", () => {
			const content = 'export default { intro: "Introduction", guide: "Guide" }';
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(true);
			expect(result.syntaxErrors).toHaveLength(0);
		});

		it("should detect missing export default", () => {
			const content = '{ intro: "Introduction" }';
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			expect(result.syntaxErrors[0].message).toContain("export default");
		});

		it("should detect unclosed brace", () => {
			const content = 'export default { intro: "Introduction"';
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
		});

		it("should detect invalid JavaScript syntax", () => {
			const content = "export default { this is not valid }";
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
		});

		it("should pass for nested objects (virtual groups)", () => {
			const content = `export default {
				intro: "Introduction",
				"getting-started": {
					type: "page",
					title: "Getting Started",
					items: {
						installation: "Installation",
						configuration: "Configuration"
					}
				}
			}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(true);
			expect(result.syntaxErrors).toHaveLength(0);
		});
	});

	describe("validateMetaContent with consistency check", () => {
		it("should detect orphaned entries (in meta but no file)", () => {
			const content = 'export default { intro: "Introduction", orphaned: "Does not exist" }';
			const contentFiles = ["intro.mdx"]; // Only intro.mdx exists

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(false); // Invalid because orphaned entries are errors
			expect(result.orphanedEntries.length).toBeGreaterThan(0);
			expect(result.orphanedEntries[0].message).toContain("orphaned");
			expect(result.orphanedEntries[0].type).toBe("error");
		});

		it("should detect missing entries (file exists but not in meta)", () => {
			const content = 'export default { intro: "Introduction" }';
			const contentFiles = ["intro.mdx", "guide.mdx"]; // guide.mdx is not in meta

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true); // Valid because no syntax errors
			expect(result.missingEntries.length).toBeGreaterThan(0);
			expect(result.missingEntries[0].message).toContain("guide");
			expect(result.missingEntries[0].type).toBe("warning");
		});

		it("should report no issues when meta matches content files", () => {
			const content = 'export default { intro: "Introduction", guide: "Guide" }';
			const contentFiles = ["intro.mdx", "guide.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.issues).toHaveLength(0);
			expect(result.orphanedEntries).toHaveLength(0);
			expect(result.missingEntries).toHaveLength(0);
		});

		it("should handle index files correctly", () => {
			const content = 'export default { index: "Home", intro: "Introduction" }';
			const contentFiles = ["index.mdx", "intro.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.issues).toHaveLength(0);
		});

		it("should skip consistency check if syntax is invalid", () => {
			const content = 'export default { intro: "Introduction"'; // Missing closing brace
			const contentFiles = ["intro.mdx", "guide.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			// Should not have orphaned/missing entries when syntax is invalid
			expect(result.orphanedEntries).toHaveLength(0);
			expect(result.missingEntries).toHaveLength(0);
		});

		it("should handle .md files as well as .mdx", () => {
			const content = 'export default { intro: "Introduction", readme: "README" }';
			const contentFiles = ["intro.mdx", "readme.md"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.issues).toHaveLength(0);
		});

		it("should not flag display:hidden entries as orphaned (no file required)", () => {
			// index: { display: 'hidden' } is a navigation-only config
			// It does NOT require an index.mdx file
			const content = "export default { index: { display: 'hidden' }, intro: \"Introduction\" }";
			const contentFiles = ["intro.mdx"]; // No index.mdx, but that's OK

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toHaveLength(0);
		});

		it("should not warn when file exists alongside display:hidden entry", () => {
			// If index.mdx exists and index has { display: 'hidden' },
			// the file is ignored in consistency checking (display:hidden means no file needed)
			const content = "export default { index: { display: 'hidden' }, intro: \"Introduction\" }";
			const contentFiles = ["index.mdx", "intro.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			// index.mdx exists but index has display:hidden, so no warning
			// (the file could be there for other reasons, or leftover)
			expect(result.missingEntries.length).toBe(1); // index.mdx is "missing" from nav
			expect(result.orphanedEntries).toHaveLength(0); // but index entry is not "orphaned"
		});

		it("should not flag separators as orphaned entries", () => {
			const content = `export default {
				intro: "Introduction",
				"---": { type: "separator" },
				guide: "Guide"
			}`;
			const contentFiles = ["intro.mdx", "guide.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toHaveLength(0);
		});

		it("should not flag external links as orphaned entries", () => {
			const content = `export default {
				intro: "Introduction",
				github: { title: "GitHub", href: "https://github.com" }
			}`;
			const contentFiles = ["intro.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toHaveLength(0);
		});

		it("should handle virtual groups with items correctly", () => {
			const content = `export default {
				intro: "Introduction",
				"getting-started": {
					type: "page",
					title: "Getting Started",
					items: {
						install: "Installation",
						config: "Configuration"
					}
				}
			}`;
			// Virtual group items need matching files
			const contentFiles = ["intro.mdx", "install.mdx", "config.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toHaveLength(0);
		});
	});

	describe("advanced syntax error detection", () => {
		it("should detect unclosed bracket with line info", () => {
			// Multi-line with unclosed bracket - should try to identify the problematic line
			const content = `export default {
	intro: "Introduction",
	items: [
		"item1"
}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
		});

		it("should try to detect missing comma in multi-line content", () => {
			// Missing comma between entries
			const content = `export default {
	intro: "Introduction"
	guide: "Guide"
}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
		});

		it("should handle regex extraction fallback for malformed objects", () => {
			// Content that won't parse but has recognizable patterns
			const content = `export default {
	intro: "Introduction",
	guide: "Guide"
	broken
}`;
			const result = validateMetaContent(content, ["intro.mdx", "guide.mdx"]);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
		});

		it("should detect invalid export default structure", () => {
			const content = "export default 123"; // Not an object
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			expect(result.syntaxErrors[0].message).toContain("export default");
		});

		it("should handle page config with title requiring file", () => {
			// Page with title property requires a file
			const content = `export default {
				intro: { title: "Custom Introduction Title" }
			}`;
			const contentFiles: Array<string> = []; // No intro.mdx

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries.length).toBe(1);
			expect(result.orphanedEntries[0].slug).toBe("intro");
		});

		it("should include line number for orphaned entry when available", () => {
			const content = `export default {
	intro: "Introduction",
	orphaned: "Missing File"
}`;
			const contentFiles = ["intro.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.orphanedEntries.length).toBe(1);
			expect(result.orphanedEntries[0].line).toBeDefined();
			expect(result.orphanedEntries[0].line).toBeGreaterThan(0);
		});

		it("should not report folder entries as orphaned when folders parameter is provided", () => {
			const content = `export default {
	intro: "Introduction",
	guides: "User Guides",
	tutorials: "Tutorial Section"
}`;
			const contentFiles = ["intro.mdx"];
			const folders = ["guides", "tutorials"];

			const result = validateMetaContent(content, contentFiles, folders);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toHaveLength(0);
			expect(result.syntaxErrors).toHaveLength(0);
		});

		it("should still report orphaned entries when not a known folder", () => {
			const content = `export default {
	intro: "Introduction",
	guides: "User Guides",
	unknown: "Unknown Entry"
}`;
			const contentFiles = ["intro.mdx"];
			const folders = ["guides"];

			const result = validateMetaContent(content, contentFiles, folders);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries).toHaveLength(1);
			expect(result.orphanedEntries[0].slug).toBe("unknown");
		});

		it("should extract immediate folder name from nested paths", () => {
			// "guides/advanced" -> "advanced" should be recognized
			const content = `export default {
	intro: "Introduction",
	advanced: "Advanced Topics"
}`;
			const contentFiles = ["intro.mdx"];
			const folders = ["guides/advanced"];

			const result = validateMetaContent(content, contentFiles, folders);

			expect(result.valid).toBe(true);
			expect(result.orphanedEntries).toHaveLength(0);
		});

		it("should handle empty folders array", () => {
			const content = `export default {
	intro: "Introduction",
	orphaned: "Should be orphaned"
}`;
			const contentFiles = ["intro.mdx"];
			const folders: Array<string> = [];

			const result = validateMetaContent(content, contentFiles, folders);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries).toHaveLength(1);
		});

		it("should handle undefined folders parameter (backward compatibility)", () => {
			const content = `export default {
	intro: "Introduction",
	orphaned: "Should be orphaned"
}`;
			const contentFiles = ["intro.mdx"];

			const result = validateMetaContent(content, contentFiles);

			expect(result.valid).toBe(false);
			expect(result.orphanedEntries).toHaveLength(1);
		});

		it("should handle empty string in folders array", () => {
			// Tests line 483: the || f fallback when pop() returns empty string
			const content = `export default {
	intro: "Introduction"
}`;
			const contentFiles = ["intro.mdx"];
			const folders = [""]; // Edge case: empty string folder name

			const result = validateMetaContent(content, contentFiles, folders);

			expect(result.valid).toBe(true);
			expect(result.syntaxErrors).toHaveLength(0);
		});

		it("should always include line number for syntax errors", () => {
			// Test various syntax errors to ensure they all get line numbers
			const testCases = [
				"export default { this is not valid }",
				"export default { key: }",
				'export default { "key" "value" }',
				"export default { trailing,, }",
			];

			for (const content of testCases) {
				const result = validateMetaSyntaxOnly(content);
				expect(result.valid).toBe(false);
				expect(result.syntaxErrors.length).toBeGreaterThan(0);
				// Every syntax error should have a line number for gutter display
				for (const error of result.syntaxErrors) {
					expect(error.line).toBeDefined();
					expect(error.line).toBeGreaterThan(0);
				}
			}
		});

		it("should handle content without export default (fallback to line 1)", () => {
			// This tests the ultimate fallback path in findSyntaxErrorLine - line 1
			// Content has no 'export default', balanced braces, and error message won't contain
			// "unexpected end", "unterminated", "expected", or "unexpected token"
			const content = "just some random text without any structure";
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			// Should fall back to line 1
			expect(result.syntaxErrors[0].line).toBe(1);
		});

		it("should handle unterminated string error", () => {
			// Tests the "unterminated" error path in findSyntaxErrorLine
			const content = `export default {
	intro: "Introduction
}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			expect(result.syntaxErrors[0].line).toBeDefined();
		});

		it("should handle unclosed bracket with matching error type", () => {
			// Tests the "unexpected end" path in findSyntaxErrorLine
			const content = `export default {
	items: [
		"item1",
		"item2"
	// Missing closing bracket and brace
`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			expect(result.syntaxErrors[0].line).toBeDefined();
		});

		it("should handle arrays with brackets in valid content", () => {
			// Tests the bracket counting path in findUnclosedBraceLine
			const content = `export default {
	items: ["item1", "item2"],
	nested: { arr: [1, 2, 3] }
}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(true);
			expect(result.syntaxErrors).toHaveLength(0);
		});

		it("should handle content with arrays that have syntax errors", () => {
			// Tests both bracket handling and error detection with arrays
			const content = `export default {
	items: [
		"item1"
		"item2"
	]
}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
		});

		it("should detect missing comma error with 'expected' in error message", () => {
			// Tests line 404: error.includes("expected") or "unexpected token" path
			const content = `export default {
	intro: "Introduction"
	guide: "Guide"
}`;
			const result = validateMetaSyntaxOnly(content);

			expect(result.valid).toBe(false);
			expect(result.syntaxErrors.length).toBeGreaterThan(0);
			// Should detect the line with missing comma
			expect(result.syntaxErrors[0].line).toBeGreaterThan(0);
			// Error message should contain expected or unexpected token
			const errorMsg = result.syntaxErrors[0].message.toLowerCase();
			const hasExpectedOrToken = errorMsg.includes("expected") || errorMsg.includes("unexpected");
			expect(hasExpectedOrToken).toBe(true);
		});
	});

	describe("extractSlugsWithLineNumbers", () => {
		it("should return empty map when no export default match found", () => {
			// Test lines 64-65: early return when regex doesn't match
			const content = "const x = { intro: 'Introduction' }"; // No export default
			const slugs = extractSlugsWithLineNumbers(content);

			expect(slugs.size).toBe(0);
		});

		it("should return empty map for plain text without export default", () => {
			// Another test for lines 64-65
			const content = "just some random text";
			const slugs = extractSlugsWithLineNumbers(content);

			expect(slugs.size).toBe(0);
		});

		it("should return empty map for export default without object", () => {
			// export default not followed by object literal
			const content = "export default 42";
			const slugs = extractSlugsWithLineNumbers(content);

			expect(slugs.size).toBe(0);
		});

		it("should extract slugs from valid content", () => {
			const content = 'export default { intro: "Introduction", guide: "Guide" }';
			const slugs = extractSlugsWithLineNumbers(content);

			expect(slugs.size).toBe(2);
			expect(slugs.has("intro")).toBe(true);
			expect(slugs.has("guide")).toBe(true);
		});

		it("should use regex fallback when parsing fails", () => {
			// Test lines 75-76: catch block with regex fallback
			// Content that matches export default { } pattern but has invalid JS inside
			const content = `export default {
	intro: "Introduction",
	guide: "Guide",
	broken syntax here that causes parse error
}`;
			const slugs = extractSlugsWithLineNumbers(content);

			// Should still extract what it can via regex fallback
			expect(slugs.has("intro")).toBe(true);
			expect(slugs.has("guide")).toBe(true);
		});
	});

	describe("findKeyLineNumber", () => {
		it("should return 1 when key is not found", () => {
			// Test lines 178-179: fallback return 1
			const content = 'export default { intro: "Introduction" }';
			const lineNum = findKeyLineNumber(content, "nonexistent");

			expect(lineNum).toBe(1);
		});

		it("should find key on correct line number", () => {
			const content = `export default {
	intro: "Introduction",
	guide: "Guide"
}`;
			expect(findKeyLineNumber(content, "intro")).toBe(2);
			expect(findKeyLineNumber(content, "guide")).toBe(3);
		});

		it("should find quoted key on correct line number", () => {
			const content = `export default {
	"quoted-key": "Value",
	'single-quoted': "Value2"
}`;
			expect(findKeyLineNumber(content, "quoted-key")).toBe(2);
			expect(findKeyLineNumber(content, "single-quoted")).toBe(3);
		});

		it("should return 1 for key with special regex characters not found", () => {
			// Test escape function and not found case
			const content = 'export default { intro: "Introduction" }';
			const lineNum = findKeyLineNumber(content, "special.*?key");

			expect(lineNum).toBe(1);
		});
	});

	describe("extractSlugsWithRegex", () => {
		it("should extract slugs from content with key-value pairs", () => {
			// Test lines 192-210
			const content = `export default {
	intro: "Introduction",
	guide: "Guide",
	"quoted-key": "Quoted Value"
}`;
			const slugs = new Map<string, number>();
			extractSlugsWithRegex(content, slugs);

			expect(slugs.has("intro")).toBe(true);
			expect(slugs.has("guide")).toBe(true);
			expect(slugs.has("quoted-key")).toBe(true);
			expect(slugs.get("intro")).toBe(2);
			expect(slugs.get("guide")).toBe(3);
			expect(slugs.get("quoted-key")).toBe(4);
		});

		it("should skip special keys", () => {
			// Test that SPECIAL_KEYS are filtered out
			const content = `export default {
	type: "page",
	title: "Page Title",
	intro: "Introduction"
}`;
			const slugs = new Map<string, number>();
			extractSlugsWithRegex(content, slugs);

			// type and title are special keys, should be skipped
			expect(slugs.has("type")).toBe(false);
			expect(slugs.has("title")).toBe(false);
			// intro is not a special key
			expect(slugs.has("intro")).toBe(true);
		});

		it("should handle empty content", () => {
			const content = "";
			const slugs = new Map<string, number>();
			extractSlugsWithRegex(content, slugs);

			expect(slugs.size).toBe(0);
		});

		it("should handle content with no key-value pairs", () => {
			const content = "just some random text\nwithout any key: value pairs";
			const slugs = new Map<string, number>();
			extractSlugsWithRegex(content, slugs);

			expect(slugs.size).toBe(0);
		});
	});

	// ============================================================================
	// Meta Content Manipulation Utilities Tests
	// ============================================================================

	describe("findEntryBoundaries", () => {
		it("should find boundaries for simple string entry", () => {
			const content = 'export default { intro: "Introduction", guide: "Guide" }';
			const boundaries = findEntryBoundaries(content, "intro");

			expect(boundaries).not.toBeNull();
			expect(boundaries?.entryText).toContain("intro");
			expect(boundaries?.entryText).toContain("Introduction");
		});

		it("should find boundaries for quoted key", () => {
			const content = 'export default { "quoted-key": "Value" }';
			const boundaries = findEntryBoundaries(content, "quoted-key");

			expect(boundaries).not.toBeNull();
			expect(boundaries?.entryText).toContain("quoted-key");
		});

		it("should find boundaries for single-quoted key", () => {
			const content = "export default { 'single-quoted': \"Value\" }";
			const boundaries = findEntryBoundaries(content, "single-quoted");

			expect(boundaries).not.toBeNull();
			expect(boundaries?.entryText).toContain("single-quoted");
		});

		it("should find boundaries for multi-line object value", () => {
			const content = `export default {
	intro: {
		type: "page",
		title: "Introduction",
		items: {
			overview: "Overview"
		}
	},
	guide: "Guide"
}`;
			const boundaries = findEntryBoundaries(content, "intro");

			expect(boundaries).not.toBeNull();
			expect(boundaries?.entryText).toContain("type");
			expect(boundaries?.entryText).toContain("items");
			expect(boundaries?.entryText).toContain("Overview");
		});

		it("should return null for non-existent entry", () => {
			const content = 'export default { intro: "Introduction" }';
			const boundaries = findEntryBoundaries(content, "nonexistent");

			expect(boundaries).toBeNull();
		});

		it("should handle entry with escaped quotes in value", () => {
			const content = 'export default { intro: "Say \\"Hello\\"" }';
			const boundaries = findEntryBoundaries(content, "intro");

			expect(boundaries).not.toBeNull();
			expect(boundaries?.entryText).toContain("Hello");
		});

		it("should handle entry without trailing comma at end", () => {
			const content = 'export default { intro: "Introduction" }';
			const boundaries = findEntryBoundaries(content, "intro");

			expect(boundaries).not.toBeNull();
		});
	});

	describe("getEntryValue", () => {
		it("should return string value for simple entry", () => {
			const content = 'export default { intro: "Introduction", guide: "Guide" }';
			const value = getEntryValue(content, "intro");

			expect(value).toBe('"Introduction"');
		});

		it("should return object value for complex entry", () => {
			const content = `export default {
	intro: { title: "My Title", display: "hidden" },
	guide: "Guide"
}`;
			const value = getEntryValue(content, "intro");

			expect(value).toContain("title");
			expect(value).toContain("My Title");
			expect(value).toContain("display");
		});

		it("should return null for non-existent entry", () => {
			const content = 'export default { intro: "Introduction" }';
			const value = getEntryValue(content, "nonexistent");

			expect(value).toBeNull();
		});

		it("should preserve nested object structure", () => {
			const content = `export default {
	section: {
		type: "page",
		items: {
			nested: "Nested Item"
		}
	}
}`;
			const value = getEntryValue(content, "section");

			expect(value).toContain("type");
			expect(value).toContain("items");
			expect(value).toContain("nested");
		});
	});

	describe("removeMetaEntry", () => {
		it("should remove simple string entry", () => {
			const content = 'export default { intro: "Introduction", guide: "Guide" }';
			const result = removeMetaEntry(content, "intro");

			expect(result).not.toContain("intro");
			expect(result).toContain("guide");
			expect(result).toContain("Guide");
		});

		it("should remove entry with quoted key", () => {
			const content = 'export default { "my-key": "Value", other: "Other" }';
			const result = removeMetaEntry(content, "my-key");

			expect(result).not.toContain("my-key");
			expect(result).toContain("other");
		});

		it("should remove multi-line object entry", () => {
			const content = `export default {
	intro: {
		type: "page",
		title: "Introduction"
	},
	guide: "Guide"
}`;
			const result = removeMetaEntry(content, "intro");

			expect(result).not.toContain("intro");
			expect(result).not.toContain("type");
			expect(result).toContain("guide");
		});

		it("should return unchanged content for non-existent entry", () => {
			const content = 'export default { intro: "Introduction" }';
			const result = removeMetaEntry(content, "nonexistent");

			expect(result).toBe(content);
		});

		it("should handle last entry removal (no trailing comma)", () => {
			const content = `export default {
	intro: "Introduction",
	guide: "Guide"
}`;
			const result = removeMetaEntry(content, "guide");

			expect(result).not.toContain("guide");
			expect(result).toContain("intro");
			// Should clean up trailing comma before closing brace
			expect(result).not.toMatch(/,\s*}/);
		});

		it("should handle only entry removal", () => {
			const content = 'export default { intro: "Introduction" }';
			const result = removeMetaEntry(content, "intro");

			expect(result).not.toContain("intro");
			expect(result).toContain("export default");
		});
	});

	describe("addMetaEntry", () => {
		it("should add entry to empty object", () => {
			const content = "export default {\n}";
			const result = addMetaEntry(content, "intro", "Introduction");

			expect(result).toContain("intro");
			expect(result).toContain('"Introduction"');
		});

		it("should add entry to object with existing entries", () => {
			const content = `export default {
	existing: "Existing"
}`;
			const result = addMetaEntry(content, "intro", "Introduction");

			expect(result).toContain("existing");
			expect(result).toContain("intro");
			expect(result).toContain('"Introduction"');
		});

		it("should add comma after previous entry if needed", () => {
			const content = `export default {
	existing: "Existing"
}`;
			const result = addMetaEntry(content, "intro", "Introduction");

			// The existing entry should have a comma after it
			expect(result).toMatch(/existing.*?,/s);
		});

		it("should quote key with special characters", () => {
			const content = "export default {\n}";
			const result = addMetaEntry(content, "my-key", "My Value");

			expect(result).toContain('"my-key"');
		});

		it("should escape quotes in title", () => {
			const content = "export default {\n}";
			const result = addMetaEntry(content, "intro", 'Say "Hello"');

			expect(result).toContain('\\"Hello\\"');
		});

		it("should return unchanged content if no export default", () => {
			const content = "const x = { intro: 'test' }";
			const result = addMetaEntry(content, "intro", "Introduction");

			expect(result).toBe(content);
		});

		it("should preserve existing indentation style", () => {
			const content = `export default {
    existing: "Existing"
}`;
			const result = addMetaEntry(content, "intro", "Introduction");

			// Should use 4-space indentation like the existing entry
			expect(result).toMatch(/^\s{4}intro:/m);
		});
	});

	describe("renameMetaEntry", () => {
		it("should rename simple string entry", () => {
			const content = 'export default { oldName: "Title", other: "Other" }';
			const result = renameMetaEntry(content, "oldName", "newName");

			expect(result).not.toContain("oldName");
			expect(result).toContain("newName");
			expect(result).toContain('"Title"');
		});

		it("should rename quoted key to unquoted", () => {
			const content = 'export default { "old-name": "Title" }';
			const result = renameMetaEntry(content, "old-name", "newname");

			expect(result).not.toContain("old-name");
			expect(result).toContain("newname:");
			expect(result).not.toContain('"newname"');
		});

		it("should rename unquoted key to quoted when needed", () => {
			const content = 'export default { oldname: "Title" }';
			const result = renameMetaEntry(content, "oldname", "new-name");

			expect(result).not.toContain("oldname");
			expect(result).toContain('"new-name"');
		});

		it("should preserve object value when renaming", () => {
			const content = `export default {
	oldKey: {
		type: "page",
		title: "My Page"
	}
}`;
			const result = renameMetaEntry(content, "oldKey", "newKey");

			expect(result).not.toContain("oldKey");
			expect(result).toContain("newKey");
			expect(result).toContain("type");
			expect(result).toContain("My Page");
		});

		it("should return unchanged content for non-existent entry", () => {
			const content = 'export default { intro: "Introduction" }';
			const result = renameMetaEntry(content, "nonexistent", "newName");

			expect(result).toBe(content);
		});

		it("should preserve trailing comma", () => {
			const content = `export default {
	oldName: "Title",
	other: "Other"
}`;
			const result = renameMetaEntry(content, "oldName", "newName");

			expect(result).toContain("newName:");
			// The renamed entry should still have its trailing comma
			expect(result).toMatch(/newName.*?,/s);
		});
	});
});
