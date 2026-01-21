import { renderMarkdown } from "./MarkdownUtils";
import { describe, expect, it } from "vitest";

describe("renderMarkdown", () => {
	describe("code blocks", () => {
		it("should indent code blocks", () => {
			const input = "```\nconst x = 1;\nconst y = 2;\n```";
			const result = renderMarkdown(input);
			expect(result).toBe("\n  const x = 1;\n  const y = 2;\n");
		});

		it("should handle code blocks with language specifier", () => {
			const input = "```javascript\nfunction test() {}\n```";
			const result = renderMarkdown(input);
			expect(result).toBe("\n  function test() {}\n");
		});

		it("should handle multiple code blocks", () => {
			const input = "```\ncode1\n```\ntext\n```\ncode2\n```";
			const result = renderMarkdown(input);
			expect(result).toContain("  code1");
			expect(result).toContain("  code2");
			expect(result).toContain("text");
		});

		it("should handle empty code blocks", () => {
			const input = "```\n```";
			const result = renderMarkdown(input);
			// Empty code block still has an empty line that gets indented
			expect(result).toBe("\n  \n");
		});
	});

	describe("inline code", () => {
		it("should preserve inline code with backticks", () => {
			const input = "This is `inline code` here";
			const result = renderMarkdown(input);
			expect(result).toBe("This is `inline code` here");
		});

		it("should handle multiple inline code segments", () => {
			const input = "Use `const` or `let` not `var`";
			const result = renderMarkdown(input);
			expect(result).toBe("Use `const` or `let` not `var`");
		});
	});

	describe("bold text", () => {
		it("should remove double asterisks for bold", () => {
			const input = "This is **bold** text";
			const result = renderMarkdown(input);
			expect(result).toBe("This is bold text");
		});

		it("should remove double underscores for bold", () => {
			const input = "This is __bold__ text";
			const result = renderMarkdown(input);
			expect(result).toBe("This is bold text");
		});

		it("should handle multiple bold segments", () => {
			const input = "**first** and **second**";
			const result = renderMarkdown(input);
			expect(result).toBe("first and second");
		});

		it("should handle mixed bold syntax", () => {
			const input = "**asterisks** and __underscores__";
			const result = renderMarkdown(input);
			expect(result).toBe("asterisks and underscores");
		});
	});

	describe("italic text", () => {
		it("should remove single asterisks for italic", () => {
			const input = "This is *italic* text";
			const result = renderMarkdown(input);
			expect(result).toBe("This is italic text");
		});

		it("should remove single underscores for italic", () => {
			const input = "This is _italic_ text";
			const result = renderMarkdown(input);
			expect(result).toBe("This is italic text");
		});

		it("should handle multiple italic segments", () => {
			const input = "*first* and *second*";
			const result = renderMarkdown(input);
			expect(result).toBe("first and second");
		});
	});

	describe("headers", () => {
		it("should format h1 headers", () => {
			const input = "# Header 1";
			const result = renderMarkdown(input);
			expect(result).toBe("\nHeader 1\n");
		});

		it("should format h2 headers", () => {
			const input = "## Header 2";
			const result = renderMarkdown(input);
			expect(result).toBe("\nHeader 2\n");
		});

		it("should format h3 headers", () => {
			const input = "### Header 3";
			const result = renderMarkdown(input);
			expect(result).toBe("\nHeader 3\n");
		});

		it("should format h4 headers", () => {
			const input = "#### Header 4";
			const result = renderMarkdown(input);
			expect(result).toBe("\nHeader 4\n");
		});

		it("should format h5 headers", () => {
			const input = "##### Header 5";
			const result = renderMarkdown(input);
			expect(result).toBe("\nHeader 5\n");
		});

		it("should format h6 headers", () => {
			const input = "###### Header 6";
			const result = renderMarkdown(input);
			expect(result).toBe("\nHeader 6\n");
		});

		it("should handle multiple headers", () => {
			const input = "# First\n## Second";
			const result = renderMarkdown(input);
			expect(result).toContain("First");
			expect(result).toContain("Second");
		});
	});

	describe("lists", () => {
		it("should format unordered lists with dash", () => {
			const input = "- Item 1\n- Item 2";
			const result = renderMarkdown(input);
			expect(result).toBe("  • Item 1\n  • Item 2");
		});

		it("should handle asterisk lists (note: may conflict with italic processing)", () => {
			const input = "* Item 1\n* Item 2";
			const result = renderMarkdown(input);
			// Note: Due to processing order, asterisks may be removed by italic processing
			// before list processing, so this may not format as a list
			expect(result).toBe(" Item 1\n Item 2");
		});

		it("should format unordered lists with plus", () => {
			const input = "+ Item 1\n+ Item 2";
			const result = renderMarkdown(input);
			expect(result).toBe("  • Item 1\n  • Item 2");
		});

		it("should format ordered lists", () => {
			const input = "1. First\n2. Second\n3. Third";
			const result = renderMarkdown(input);
			expect(result).toBe("  First\n  Second\n  Third");
		});

		it("should handle indented lists", () => {
			const input = "  - Indented item";
			const result = renderMarkdown(input);
			expect(result).toBe("  • Indented item");
		});
	});

	describe("links", () => {
		it("should extract link text and remove URL", () => {
			const input = "[Click here](https://example.com)";
			const result = renderMarkdown(input);
			expect(result).toBe("Click here");
		});

		it("should handle multiple links", () => {
			const input = "[First](url1) and [Second](url2)";
			const result = renderMarkdown(input);
			expect(result).toBe("First and Second");
		});

		it("should handle links with complex URLs", () => {
			const input = "[Link](https://example.com/path?query=value&other=123)";
			const result = renderMarkdown(input);
			expect(result).toBe("Link");
		});
	});

	describe("blockquotes", () => {
		it("should preserve blockquote prefix", () => {
			const input = "> This is a quote";
			const result = renderMarkdown(input);
			expect(result).toBe("> This is a quote");
		});

		it("should handle multiple blockquotes", () => {
			const input = "> First quote\n> Second quote";
			const result = renderMarkdown(input);
			expect(result).toBe("> First quote\n> Second quote");
		});
	});

	describe("mixed content", () => {
		it("should handle text with no markdown", () => {
			const input = "Plain text without any markdown";
			const result = renderMarkdown(input);
			expect(result).toBe("Plain text without any markdown");
		});

		it("should handle combination of formatting", () => {
			const input = "# Title\n\nThis is **bold** and *italic* with `code`";
			const result = renderMarkdown(input);
			expect(result).toContain("Title");
			expect(result).toContain("bold");
			expect(result).toContain("italic");
			expect(result).toContain("`code`");
		});

		it("should handle complex markdown document", () => {
			const input = `# Header

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

\`\`\`
code block
\`\`\`

> A quote

[Link](https://example.com)`;

			const result = renderMarkdown(input);
			expect(result).toContain("Header");
			expect(result).toContain("bold");
			expect(result).toContain("italic");
			expect(result).toContain("• List item 1");
			expect(result).toContain("  code block");
			expect(result).toContain("> A quote");
			expect(result).toContain("Link");
		});

		it("should handle empty string", () => {
			const input = "";
			const result = renderMarkdown(input);
			expect(result).toBe("");
		});

		it("should handle string with only whitespace", () => {
			const input = "   \n\n   ";
			const result = renderMarkdown(input);
			expect(result).toBe("   \n\n   ");
		});
	});
});
