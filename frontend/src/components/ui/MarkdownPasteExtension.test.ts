import { containsMarkdownBlockSyntax } from "./MarkdownPasteExtension";
import { describe, expect, it } from "vitest";

describe("containsMarkdownBlockSyntax", () => {
	it("should return false for empty string", () => {
		expect(containsMarkdownBlockSyntax("")).toBe(false);
	});

	it("should return false for plain text without markdown", () => {
		expect(containsMarkdownBlockSyntax("Hello world")).toBe(false);
		expect(containsMarkdownBlockSyntax("Just some normal text\nwith line breaks")).toBe(false);
	});

	describe("tables", () => {
		it("should return false for a single table line", () => {
			expect(containsMarkdownBlockSyntax("| col |")).toBe(false);
		});

		it("should return true for 2+ table lines", () => {
			expect(containsMarkdownBlockSyntax("| a | b |\n| --- | --- |")).toBe(true);
		});

		it("should ignore table-like lines that are too short (length <= 2)", () => {
			expect(containsMarkdownBlockSyntax("||")).toBe(false);
		});

		it("should ignore lines that start with | but do not end with |", () => {
			expect(containsMarkdownBlockSyntax("| no end\n| still no end")).toBe(false);
		});
	});

	describe("headings", () => {
		it("should return true for h1", () => {
			expect(containsMarkdownBlockSyntax("# Heading")).toBe(true);
		});

		it("should return true for h6", () => {
			expect(containsMarkdownBlockSyntax("###### Heading")).toBe(true);
		});

		it("should return false for # without space", () => {
			expect(containsMarkdownBlockSyntax("#NoSpace")).toBe(false);
		});
	});

	describe("code fences", () => {
		it("should return true for triple backticks", () => {
			expect(containsMarkdownBlockSyntax("```js\nconsole.log('hi')\n```")).toBe(true);
		});

		it("should return true for plain triple backticks", () => {
			expect(containsMarkdownBlockSyntax("```")).toBe(true);
		});
	});

	describe("unordered lists", () => {
		it("should return false for a single list item", () => {
			expect(containsMarkdownBlockSyntax("- item")).toBe(false);
		});

		it("should return true for 2+ unordered list items with -", () => {
			expect(containsMarkdownBlockSyntax("- item one\n- item two")).toBe(true);
		});

		it("should return true for 2+ unordered list items with *", () => {
			expect(containsMarkdownBlockSyntax("* item one\n* item two")).toBe(true);
		});

		it("should return true for 2+ unordered list items with +", () => {
			expect(containsMarkdownBlockSyntax("+ item one\n+ item two")).toBe(true);
		});
	});

	describe("ordered lists", () => {
		it("should return false for a single ordered list item", () => {
			expect(containsMarkdownBlockSyntax("1. item")).toBe(false);
		});

		it("should return true for 2+ ordered list items", () => {
			expect(containsMarkdownBlockSyntax("1. first\n2. second")).toBe(true);
		});
	});

	describe("blockquotes", () => {
		it("should return true for blockquote", () => {
			expect(containsMarkdownBlockSyntax("> quoted text")).toBe(true);
		});

		it("should return false for > without trailing space", () => {
			expect(containsMarkdownBlockSyntax(">no space")).toBe(false);
		});
	});

	describe("horizontal rules", () => {
		it("should return true for ---", () => {
			expect(containsMarkdownBlockSyntax("---")).toBe(true);
		});

		it("should return true for ***", () => {
			expect(containsMarkdownBlockSyntax("***")).toBe(true);
		});

		it("should return true for ___", () => {
			expect(containsMarkdownBlockSyntax("___")).toBe(true);
		});

		it("should return true for long dashes with trailing spaces", () => {
			expect(containsMarkdownBlockSyntax("-----  ")).toBe(true);
		});
	});

	describe("mixed content", () => {
		it("should detect heading among plain text", () => {
			expect(containsMarkdownBlockSyntax("hello\n## Section\nworld")).toBe(true);
		});

		it("should detect table among plain text", () => {
			expect(containsMarkdownBlockSyntax("intro\n| a | b |\n| c | d |\noutro")).toBe(true);
		});

		it("should return false when only inline markers are present", () => {
			expect(containsMarkdownBlockSyntax("this is *bold* and _italic_ text")).toBe(false);
		});
	});
});
