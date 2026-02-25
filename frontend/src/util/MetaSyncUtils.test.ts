import { addMetaEntry, findEntryBoundaries, getEntryValue, removeMetaEntry, renameMetaEntry } from "./MetaSyncUtils";
import { describe, expect, it } from "vitest";

describe("MetaSyncUtils", () => {
	describe("findEntryBoundaries", () => {
		it("should find unquoted key with string value", () => {
			const content = `export default {
	introduction: "Getting Started",
	overview: "Overview"
}`;
			const result = findEntryBoundaries(content, "introduction");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("introduction");
		});

		it("should find double-quoted key", () => {
			const content = `export default {
	"my-key": "My Value",
}`;
			const result = findEntryBoundaries(content, "my-key");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain('"my-key"');
		});

		it("should find single-quoted key", () => {
			const content = `export default {
	'another-key': "Another Value",
}`;
			const result = findEntryBoundaries(content, "another-key");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("'another-key'");
		});

		it("should return null for non-existent key", () => {
			const content = `export default {
	foo: "bar",
}`;
			const result = findEntryBoundaries(content, "nonexistent");
			expect(result).toBeNull();
		});

		it("should handle object values with nested braces", () => {
			const content = `export default {
	complex: {
		title: "Complex",
		nested: {
			deep: "value"
		}
	},
	simple: "Simple"
}`;
			const result = findEntryBoundaries(content, "complex");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("nested");
			expect(result?.entryText).toContain("deep");
		});

		it("should handle string values with escaped quotes", () => {
			const content = `export default {
	escaped: "He said \\"hello\\"",
	normal: "Normal"
}`;
			const result = findEntryBoundaries(content, "escaped");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain('\\"hello\\"');
		});

		it("should handle single-quoted string values with escaped quotes", () => {
			const content = `export default {
	escaped: 'It\\'s working',
	normal: "Normal"
}`;
			const result = findEntryBoundaries(content, "escaped");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("'s working");
		});

		it("should handle numeric values", () => {
			const content = `export default {
	order: 42,
	name: "Test"
}`;
			const result = findEntryBoundaries(content, "order");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("42");
		});

		it("should handle identifier values (references)", () => {
			const content = `export default {
	ref: someVariable,
	name: "Test"
}`;
			const result = findEntryBoundaries(content, "ref");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("someVariable");
		});

		it("should handle boolean values", () => {
			const content = `export default {
	hidden: true,
	visible: false,
	name: "Test"
}`;
			const resultTrue = findEntryBoundaries(content, "hidden");
			expect(resultTrue).not.toBeNull();
			expect(resultTrue?.entryText).toContain("true");

			const resultFalse = findEntryBoundaries(content, "visible");
			expect(resultFalse).not.toBeNull();
			expect(resultFalse?.entryText).toContain("false");
		});

		it("should handle value at end of object without trailing comma", () => {
			const content = `export default {
	first: "First",
	last: 100
}`;
			const result = findEntryBoundaries(content, "last");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("100");
		});

		it("should handle value with trailing whitespace before comma", () => {
			const content = `export default {
	spaced: someRef   ,
	next: "Next"
}`;
			const result = findEntryBoundaries(content, "spaced");
			expect(result).not.toBeNull();
		});

		it("should handle object values with strings containing braces", () => {
			const content = `export default {
	tricky: {
		title: "Object with {braces} in string"
	},
	next: "Next"
}`;
			const result = findEntryBoundaries(content, "tricky");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("{braces}");
		});

		it("should find the first matching key when multiple patterns could match", () => {
			const content = `export default {
	test: "First",
	"test": "Should not match - test already found"
}`;
			const result = findEntryBoundaries(content, "test");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("First");
		});

		it("should handle keys with special regex characters", () => {
			const content = `export default {
	"key.with.dots": "Value",
	"key[0]": "Brackets"
}`;
			const resultDots = findEntryBoundaries(content, "key.with.dots");
			expect(resultDots).not.toBeNull();

			const resultBrackets = findEntryBoundaries(content, "key[0]");
			expect(resultBrackets).not.toBeNull();
		});

		it("should return null when colon is not found after key", () => {
			// This is an edge case for malformed content
			const content = `export default {
	brokenKey
}`;
			const result = findEntryBoundaries(content, "brokenKey");
			// The key matches but there's no colon, so it should return null
			expect(result).toBeNull();
		});

		it("should handle entry at the very start after opening brace", () => {
			const content = `export default {first: "First", second: "Second"}`;
			const result = findEntryBoundaries(content, "first");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("first");
		});

		it("should handle key at very start without leading character", () => {
			// This tests the match[1] || "" fallback on line 114
			// The regex should match but the leading char capture group may be empty
			const content = `export default {
first: "First"
}`;
			const result = findEntryBoundaries(content, "first");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("first");
		});

		it("should handle value that ends at newline", () => {
			const content = `export default {
	identifier: myVar
	next: "Next"
}`;
			const result = findEntryBoundaries(content, "identifier");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("myVar");
		});

		it("should handle value that ends at closing brace", () => {
			const content = `export default {
	only: myOnlyVar}`;
			const result = findEntryBoundaries(content, "only");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("myOnlyVar");
		});
	});

	describe("getEntryValue", () => {
		it("should return string value", () => {
			const content = `export default {
	title: "My Title",
}`;
			const result = getEntryValue(content, "title");
			expect(result).toBe('"My Title"');
		});

		it("should return object value", () => {
			const content = `export default {
	complex: {
		title: "Complex",
		hidden: true
	},
}`;
			const result = getEntryValue(content, "complex");
			expect(result).toContain("title");
			expect(result).toContain("hidden");
		});

		it("should return null for non-existent key", () => {
			const content = `export default {
	foo: "bar",
}`;
			const result = getEntryValue(content, "missing");
			expect(result).toBeNull();
		});

		it("should return numeric value", () => {
			const content = `export default {
	order: 5,
}`;
			const result = getEntryValue(content, "order");
			expect(result).toBe("5");
		});

		it("should return identifier value", () => {
			const content = `export default {
	ref: myReference,
}`;
			const result = getEntryValue(content, "ref");
			expect(result).toBe("myReference");
		});

		it("should handle value without trailing comma", () => {
			const content = `export default {
	last: "Last Value"
}`;
			const result = getEntryValue(content, "last");
			expect(result).toBe('"Last Value"');
		});

		it("should handle value with extra whitespace after", () => {
			const content = `export default {
	spaced: "Value"   ,
}`;
			const result = getEntryValue(content, "spaced");
			expect(result).toBe('"Value"');
		});
	});

	describe("removeMetaEntry", () => {
		it("should remove a simple entry", () => {
			const content = `export default {
	first: "First",
	second: "Second",
	third: "Third",
}`;
			const result = removeMetaEntry(content, "second");
			expect(result).not.toContain("second");
			expect(result).toContain("first");
			expect(result).toContain("third");
		});

		it("should return unchanged content for non-existent key", () => {
			const content = `export default {
	foo: "bar",
}`;
			const result = removeMetaEntry(content, "missing");
			expect(result).toBe(content);
		});

		it("should remove object entry", () => {
			const content = `export default {
	simple: "Simple",
	complex: {
		title: "Complex",
		nested: {
			deep: true
		}
	},
	another: "Another",
}`;
			const result = removeMetaEntry(content, "complex");
			expect(result).not.toContain("complex");
			expect(result).not.toContain("nested");
			expect(result).toContain("simple");
			expect(result).toContain("another");
		});

		it("should clean up trailing comma before closing brace", () => {
			const content = `export default {
	first: "First",
	last: "Last",
}`;
			const result = removeMetaEntry(content, "last");
			// Should not have comma before closing brace
			expect(result).not.toMatch(/,\s*}/);
		});

		it("should clean up multiple newlines", () => {
			const content = `export default {
	first: "First",

	middle: "Middle",

	last: "Last",
}`;
			const result = removeMetaEntry(content, "middle");
			// Should not have triple newlines
			expect(result).not.toMatch(/\n\s*\n\s*\n/);
		});

		it("should handle removing the only entry", () => {
			const content = `export default {
	only: "Only",
}`;
			const result = removeMetaEntry(content, "only");
			expect(result).not.toContain("only");
			expect(result).toContain("export default");
		});

		it("should handle removing entry with numeric value", () => {
			const content = `export default {
	order: 42,
	name: "Test",
}`;
			const result = removeMetaEntry(content, "order");
			expect(result).not.toContain("42");
			expect(result).toContain("name");
		});
	});

	describe("addMetaEntry", () => {
		it("should add entry to empty object", () => {
			const content = `export default {
}`;
			const result = addMetaEntry(content, "newEntry", "New Entry");
			expect(result).toContain("newEntry");
			expect(result).toContain('"New Entry"');
		});

		it("should add entry to object with existing entries", () => {
			const content = `export default {
	existing: "Existing",
}`;
			const result = addMetaEntry(content, "newEntry", "New Entry");
			expect(result).toContain("newEntry");
			expect(result).toContain("existing");
		});

		it("should add comma to previous entry if needed", () => {
			const content = `export default {
	existing: "Existing"
}`;
			const result = addMetaEntry(content, "newEntry", "New Entry");
			expect(result).toContain('existing: "Existing",');
		});

		it("should quote slug with special characters", () => {
			const content = `export default {
	existing: "Existing",
}`;
			const result = addMetaEntry(content, "my-slug", "My Slug");
			expect(result).toContain('"my-slug"');
		});

		it("should not quote simple slug", () => {
			const content = `export default {
	existing: "Existing",
}`;
			const result = addMetaEntry(content, "simpleSlug", "Simple Slug");
			expect(result).toMatch(/\bsimpleSlug:/);
			expect(result).not.toContain('"simpleSlug"');
		});

		it("should escape special characters in title", () => {
			const content = `export default {
}`;
			const result = addMetaEntry(content, "test", 'Title with "quotes" and \\backslash');
			expect(result).toContain('\\"quotes\\"');
			expect(result).toContain("\\\\backslash");
		});

		it("should return unchanged content if no export default", () => {
			const content = `const meta = {
	foo: "bar",
}`;
			const result = addMetaEntry(content, "new", "New");
			expect(result).toBe(content);
		});

		it("should detect and use existing indentation", () => {
			const content = `export default {
    fourSpaces: "Value",
}`;
			const result = addMetaEntry(content, "newEntry", "New Entry");
			expect(result).toContain("    newEntry");
		});

		it("should use tab indentation by default", () => {
			const content = `export default {}`;
			const result = addMetaEntry(content, "newEntry", "New Entry");
			expect(result).toContain("\tnewEntry");
		});

		it("should handle nested object in existing content", () => {
			const content = `export default {
	nested: {
		inner: "value"
	},
}`;
			const result = addMetaEntry(content, "newEntry", "New Entry");
			expect(result).toContain("newEntry");
			expect(result).toContain("nested");
		});
	});

	describe("renameMetaEntry", () => {
		it("should rename a simple entry", () => {
			const content = `export default {
	oldName: "My Title",
}`;
			const result = renameMetaEntry(content, "oldName", "newName");
			expect(result).not.toContain("oldName");
			expect(result).toContain("newName");
			expect(result).toContain('"My Title"');
		});

		it("should return unchanged content for non-existent key", () => {
			const content = `export default {
	foo: "bar",
}`;
			const result = renameMetaEntry(content, "missing", "new");
			expect(result).toBe(content);
		});

		it("should preserve object value", () => {
			const content = `export default {
	oldName: {
		title: "Complex",
		hidden: true
	},
}`;
			const result = renameMetaEntry(content, "oldName", "newName");
			expect(result).not.toContain("oldName");
			expect(result).toContain("newName");
			expect(result).toContain("Complex");
			expect(result).toContain("hidden");
		});

		it("should quote new slug with special characters", () => {
			const content = `export default {
	simple: "Value",
}`;
			const result = renameMetaEntry(content, "simple", "new-slug");
			expect(result).toContain('"new-slug"');
		});

		it("should not quote simple new slug", () => {
			const content = `export default {
	"old-slug": "Value",
}`;
			const result = renameMetaEntry(content, "old-slug", "newSlug");
			expect(result).toMatch(/\bnewSlug:/);
		});

		it("should preserve trailing comma", () => {
			const content = `export default {
	first: "First",
	second: "Second",
}`;
			const result = renameMetaEntry(content, "first", "renamed");
			expect(result).toContain('renamed: "First",');
		});

		it("should not add trailing comma if not present", () => {
			const content = `export default {
	only: "Only"
}`;
			const result = renameMetaEntry(content, "only", "renamed");
			expect(result).toMatch(/renamed: "Only"\s*\n?\s*}/);
		});

		it("should preserve leading whitespace", () => {
			const content = `export default {
	indented: "Value",
}`;
			const result = renameMetaEntry(content, "indented", "renamed");
			expect(result).toContain("\n\trenamed:");
		});

		it("should handle renaming entry with numeric value", () => {
			const content = `export default {
	oldOrder: 42,
}`;
			const result = renameMetaEntry(content, "oldOrder", "newOrder");
			expect(result).not.toContain("oldOrder");
			expect(result).toContain("newOrder: 42");
		});

		it("should handle renaming entry with identifier value", () => {
			const content = `export default {
	oldRef: someVariable,
}`;
			const result = renameMetaEntry(content, "oldRef", "newRef");
			expect(result).not.toContain("oldRef");
			expect(result).toContain("newRef: someVariable");
		});

		it("should handle renaming entry without leading whitespace", () => {
			// This tests the leadingWhitespace fallback on line 340
			const content = `export default {oldName: "Value"}`;
			const result = renameMetaEntry(content, "oldName", "newName");
			expect(result).not.toContain("oldName");
			expect(result).toContain("newName");
			expect(result).toContain('"Value"');
		});
	});

	describe("edge cases", () => {
		it("should handle object value with escaped quotes inside strings", () => {
			// This tests the escaped character handling inside findMatchingBrace (lines 34-36)
			const content = `export default {
	complex: {
		title: "String with \\"escaped\\" quotes inside",
		another: "More \\'quotes\\'"
	},
	next: "Next"
}`;
			const result = findEntryBoundaries(content, "complex");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("escaped");
			expect(result?.entryText).toContain("another");
		});

		it("should handle malformed content with unclosed brace", () => {
			// This tests the fallback return in findMatchingBrace (lines 56-57)
			const content = `export default {
	broken: {
		title: "Never closed"
`;
			const result = findEntryBoundaries(content, "broken");
			// Should still return something, using content.length as the end
			expect(result).not.toBeNull();
		});

		it("should handle malformed content with unclosed string", () => {
			// This tests the fallback return in findClosingQuote (lines 84-85)
			const content = `export default {
	broken: "Never closed string
}`;
			const result = findEntryBoundaries(content, "broken");
			// Should still return something, using content.length as the end
			expect(result).not.toBeNull();
		});

		it("should handle object with escaped backslash inside string", () => {
			const content = `export default {
	path: {
		windows: "C:\\\\Users\\\\name"
	},
}`;
			const result = findEntryBoundaries(content, "path");
			expect(result).not.toBeNull();
			expect(result?.entryText).toContain("windows");
		});

		it("should handle content with template literals in strings", () => {
			const content = `export default {
	template: "Value with \${expression}",
}`;
			const result = getEntryValue(content, "template");
			// biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal template syntax in content
			expect(result).toContain("${expression}");
		});

		it("should handle content with comments", () => {
			const content = `export default {
	// This is a comment
	entry: "Value",
}`;
			const result = findEntryBoundaries(content, "entry");
			expect(result).not.toBeNull();
		});

		it("should handle minified content", () => {
			const content = `export default {a:"A",b:"B",c:"C"}`;
			const result = getEntryValue(content, "b");
			expect(result).toBe('"B"');
		});

		it("should handle content with unicode characters", () => {
			const content = `export default {
	unicode: "Hello \u4e16\u754c",
}`;
			const result = getEntryValue(content, "unicode");
			expect(result).toContain("\u4e16\u754c");
		});

		it("should handle empty string value", () => {
			const content = `export default {
	empty: "",
}`;
			const result = getEntryValue(content, "empty");
			expect(result).toBe('""');
		});

		it("should handle null-like identifier value", () => {
			const content = `export default {
	nullable: null,
}`;
			const result = getEntryValue(content, "nullable");
			expect(result).toBe("null");
		});

		it("should handle undefined-like identifier value", () => {
			const content = `export default {
	undef: undefined,
}`;
			const result = getEntryValue(content, "undef");
			expect(result).toBe("undefined");
		});
	});
});
