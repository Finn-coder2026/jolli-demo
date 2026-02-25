import {
	extractErrorPosition,
	formatMdxValidationErrors,
	getFormatFromContentType,
	validateMdxBatch,
	validateMdxContent,
} from "./MdxValidation";
import { describe, expect, it } from "vitest";

describe("MdxValidation", () => {
	describe("getFormatFromContentType", () => {
		it("should return 'mdx' for text/mdx content type", () => {
			expect(getFormatFromContentType("text/mdx")).toBe("mdx");
		});

		it("should return 'md' for text/markdown content type", () => {
			expect(getFormatFromContentType("text/markdown")).toBe("md");
		});

		it("should return 'md' for undefined content type", () => {
			expect(getFormatFromContentType(undefined)).toBe("md");
		});

		it("should return 'md' for any other content type", () => {
			expect(getFormatFromContentType("application/json")).toBe("md");
			expect(getFormatFromContentType("text/plain")).toBe("md");
		});
	});

	describe("validateMdxContent", () => {
		describe("valid MDX", () => {
			it("should pass validation for plain markdown", async () => {
				const content = `# Hello World

This is a paragraph with **bold** and *italic* text.

- Item 1
- Item 2
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for MDX with frontmatter", async () => {
				const content = `---
title: My Article
description: A test article
---

# Hello World

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for MDX with JSX", async () => {
				const content = `# Hello World

<div className="container">
  <p>Some content</p>
</div>
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for MDX with expressions", async () => {
				const content = `# Hello World

The answer is {40 + 2}.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for MDX with imports", async () => {
				const content = `import { Button } from './Button'

# Hello World

<Button>Click me</Button>
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with HTML comments", async () => {
				const content = `# Hello World

<!-- This is an HTML comment -->

Some content here.

<!-- Another comment -->
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with multi-line HTML comments", async () => {
				const content = `# Hello World

<!--
  This is a multi-line
  HTML comment that spans
  several lines
-->

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with MDX comments", async () => {
				const content = `# Hello World

{/* This is an MDX comment */}

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for mixed HTML and MDX comments", async () => {
				const content = `# Hello World

<!-- HTML comment -->
{/* MDX comment */}

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with URL autolinks", async () => {
				const content = `# Hello World

Latest Version: <https://cdn.jsdelivr.net/npm/mermaid@11>

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with email autolinks", async () => {
				const content = `# Security

To report a vulnerability, please e-mail <security@mermaid.live>.

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with mixed autolinks and comments", async () => {
				const content = `# Contact Us

<!-- Contact information -->

Visit <https://example.com> or email <support@example.com> for help.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with style tags", async () => {
				const content = `# Styled Page

<style scoped>
.badges > p {
  display: flex;
}
</style>

Some content here.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass validation for content with code blocks containing problematic syntax", async () => {
				const content = `# Documentation

Here's how to write a comment:

\`\`\`html
<!-- This is an HTML comment -->
<style>.foo { color: red; }</style>
\`\`\`

And use \`<user@example.com>\` for email autolinks.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});
		});

		describe("invalid JSX syntax (contentType: text/mdx)", () => {
			it("should detect unclosed JSX tags with contentType: text/mdx", async () => {
				const content = `# Hello World

<div>
  <p>Unclosed paragraph
</div>
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].severity).toBe("error");
			});

			it("should pass unclosed JSX tags with contentType: text/markdown (default)", async () => {
				const content = `# Hello World

<div>
  <p>Unclosed paragraph
</div>
`;
				const result = await validateMdxContent(content);

				// With contentType: text/markdown, unclosed tags are treated as text
				expect(result.isValid).toBe(true);
			});

			it("should detect self-closing tag errors with contentType: text/mdx", async () => {
				const content = `# Hello World

<div
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			});

			it("should pass incomplete tags with contentType: text/markdown (default)", async () => {
				const content = `# Hello World

<div
`;
				const result = await validateMdxContent(content);

				// With contentType: text/markdown, incomplete tags are treated as text
				expect(result.isValid).toBe(true);
			});

			it("should detect invalid JSX attributes", async () => {
				const content = `# Hello World

<div class="foo">Content</div>
`;
				// Note: This might pass in MDX as it allows HTML attributes
				// The test documents current behavior
				const result = await validateMdxContent(content);
				// MDX is lenient with HTML attributes, so this passes
				expect(result.isValid).toBe(true);
			});
		});

		describe("malformed expressions", () => {
			it("should detect unclosed expression braces with contentType: text/mdx", async () => {
				const content = `# Hello World

The value is {42 +
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].severity).toBe("error");
			});

			it("should pass unclosed braces with contentType: text/markdown (default)", async () => {
				const content = `# Hello World

The value is {42 +
`;
				const result = await validateMdxContent(content);

				// With contentType: text/markdown, unclosed braces are treated as text
				expect(result.isValid).toBe(true);
			});

			it("should detect syntax error in expression with contentType: text/mdx", async () => {
				const content = `# Hello World

The value is {42 +++ 3}.
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			});

			it("should pass literal curly braces with contentType: text/markdown (default)", async () => {
				const content = `# Hello World

Use {placeholder} syntax for templates.
`;
				const result = await validateMdxContent(content);

				// With contentType: text/markdown, curly braces are treated as literal text
				expect(result.isValid).toBe(true);
			});

			it("should fail invalid JS expression with contentType: text/mdx", async () => {
				// Need truly invalid JS syntax - {42 +++ 3} fails acorn parsing
				const content = `# Hello World

The value is {42 +++ 3}.
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				// With contentType: text/mdx, invalid JS in curly braces fails
				expect(result.isValid).toBe(false);
			});
		});

		describe("frontmatter validation", () => {
			it("should detect invalid YAML in frontmatter", async () => {
				const content = `---
title: [invalid yaml
---

# Hello World
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].message).toContain("Frontmatter YAML error");
			});

			it("should detect YAML syntax errors with line info", async () => {
				const content = `---
title: My Article
invalid: key: value
---

# Hello World
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				// Line should be within frontmatter section (lines 2-4)
				expect(result.errors[0].line).toBeGreaterThan(0);
			});

			it("should pass with valid frontmatter", async () => {
				const content = `---
title: My Article
tags:
  - javascript
  - mdx
nested:
  key: value
---

# Hello World
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
			});

			it("should use default line 2 when YAML error has no line position", async () => {
				// This YAML error produces an error without specific line position
				const content = `---
*invalid
---

# Hello World
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].message).toContain("Frontmatter YAML error");
				// Should have a line number (either from error or default of 2)
				expect(result.errors[0].line).toBeGreaterThanOrEqual(2);
			});
		});

		describe("import statements", () => {
			it("should detect invalid import syntax with contentType: text/mdx", async () => {
				const content = `import { Button from './Button'

# Hello World
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			});

			it("should pass invalid import-like text with contentType: text/markdown", async () => {
				// With contentType: text/markdown, import-like text is treated as regular text
				const content = `import { Button from './Button'

# Hello World
`;
				const result = await validateMdxContent(content);

				// contentType: text/markdown is lenient and treats this as text
				expect(result.isValid).toBe(true);
			});

			it("should pass with valid import", async () => {
				const content = `import { Button } from './Button'
import Default from './Default'
import * as Utils from './utils'

# Hello World
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(true);
			});
		});

		describe("error line numbers", () => {
			it("should provide line numbers for errors with contentType: text/mdx", async () => {
				const content = `# Line 1

Line 3

<div>
  <p>Unclosed on line 6
</div>
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors[0].line).toBeDefined();
				expect(result.errors[0].line).toBeGreaterThan(0);
			});

			it("should extract line/column from message when not in error properties", async () => {
				// This tests the case where MDX includes position in the message like "(5:1-5:6)"
				const content = `# Article

<div>
  This div is never closed

More content.
`;
				const result = await validateMdxContent(content, undefined, "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors[0].line).toBe(3);
				expect(result.errors[0].column).toBe(1);
				// The message should still contain the full error description
				expect(result.errors[0].message).toContain("Expected a closing tag");
			});

			it("should return empty position when error message has no position pattern", () => {
				// Test the fallback when position extraction fails (lines 140-141 in MdxValidation.ts)
				// The extractErrorPosition function returns {} when no position can be extracted
				// This happens when the error has no line/position and message doesn't match regex
				const errorWithNoPosition = {
					message: "Some error without position info",
					reason: "Generic error",
				};

				const result = extractErrorPosition(errorWithNoPosition);

				// Should return empty object when no position can be extracted
				expect(result).toEqual({});
			});
		});

		it("should handle error with no reason or message", () => {
			const result = extractErrorPosition({});
			expect(result).toEqual({});
		});

		describe("file path in errors", () => {
			it("should include file path in error when provided", async () => {
				const content = "<div>";
				const result = await validateMdxContent(content, "content/article.mdx", "text/mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors[0].path).toBe("content/article.mdx");
			});
		});

		describe("format parameter", () => {
			it("should default to contentType: text/markdown", async () => {
				// Literal curly braces pass with default format
				const content = "Use {placeholder} syntax";
				const result = await validateMdxContent(content);
				expect(result.isValid).toBe(true);
			});

			it("should still support valid JSX with contentType: text/markdown", async () => {
				const content = `# Hello

<Button onClick={() => console.log('clicked')}>Click me</Button>
`;
				const result = await validateMdxContent(content);
				expect(result.isValid).toBe(true);
			});

			it("should still support valid expressions with contentType: text/markdown", async () => {
				const content = `# Hello

The sum is {1 + 2 + 3}.
`;
				const result = await validateMdxContent(content);
				expect(result.isValid).toBe(true);
			});

			it("should treat angle brackets as text with contentType: text/markdown", async () => {
				const content = "Use <angle brackets> for emphasis.";
				const result = await validateMdxContent(content);
				expect(result.isValid).toBe(true);
			});

			it("should fail angle brackets with contentType: text/mdx", async () => {
				const content = "Use <angle brackets> for emphasis.";
				const result = await validateMdxContent(content, undefined, "text/mdx");
				expect(result.isValid).toBe(false);
			});
		});
	});

	describe("validateMdxBatch", () => {
		it("should validate multiple files in parallel", async () => {
			const files = new Map([
				["valid.mdx", "# Valid\n\nContent here."],
				["also-valid.mdx", "# Also Valid\n\n<div>JSX</div>"],
			]);

			const result = await validateMdxBatch(files);

			expect(result.isValid).toBe(true);
			expect(result.errorCount).toBe(0);
			expect(result.results.size).toBe(2);
		});

		it("should detect errors in batch with contentType: text/mdx", async () => {
			const files = new Map([
				["valid.mdx", "# Valid\n\nContent here."],
				["invalid.mdx", "<div>"],
				["another-valid.mdx", "# Another\n\nValid content."],
			]);

			const result = await validateMdxBatch(files, 10, "text/mdx");

			expect(result.isValid).toBe(false);
			expect(result.errorCount).toBeGreaterThan(0);
			expect(result.results.get("valid.mdx")?.isValid).toBe(true);
			expect(result.results.get("invalid.mdx")?.isValid).toBe(false);
			expect(result.results.get("another-valid.mdx")?.isValid).toBe(true);
		});

		it("should pass unclosed tags in batch with contentType: text/markdown (default)", async () => {
			const files = new Map([
				["valid.mdx", "# Valid\n\nContent here."],
				["unclosed.mdx", "<div>"],
				["another-valid.mdx", "# Another\n\nValid content."],
			]);

			const result = await validateMdxBatch(files);

			// With contentType: text/markdown, unclosed tags are treated as text
			expect(result.isValid).toBe(true);
			expect(result.errorCount).toBe(0);
		});

		it("should count errors and warnings correctly with contentType: text/mdx", async () => {
			const files = new Map([
				["error1.mdx", "<div>"],
				["error2.mdx", "{42 +"],
			]);

			const result = await validateMdxBatch(files, 10, "text/mdx");

			expect(result.isValid).toBe(false);
			expect(result.errorCount).toBe(2);
			expect(result.warningCount).toBe(0);
		});

		it("should handle empty file map", async () => {
			const files = new Map<string, string>();

			const result = await validateMdxBatch(files);

			expect(result.isValid).toBe(true);
			expect(result.errorCount).toBe(0);
			expect(result.results.size).toBe(0);
		});

		it("should respect concurrency limit", async () => {
			// Create more files than default concurrency
			const files = new Map<string, string>();
			for (let i = 0; i < 25; i++) {
				files.set(`file${i}.mdx`, `# File ${i}\n\nContent.`);
			}

			const result = await validateMdxBatch(files, 5);

			expect(result.isValid).toBe(true);
			expect(result.results.size).toBe(25);
		});

		it("should pass format parameter to individual validations", async () => {
			// Use invalid JS syntax that will fail in mdx mode - {42 +++ 3} fails acorn
			const files = new Map([["invalid.mdx", "Value: {42 +++ 3}"]]);

			// With contentType: text/markdown (default), this passes (treated as text)
			const mdResult = await validateMdxBatch(files);
			expect(mdResult.isValid).toBe(true);

			// With contentType: text/mdx, this fails (invalid JS expression)
			const mdxResult = await validateMdxBatch(files, 10, "text/mdx");
			expect(mdxResult.isValid).toBe(false);
		});
	});

	describe("formatMdxValidationErrors", () => {
		it("should return 'No errors' for empty array", () => {
			const result = formatMdxValidationErrors([]);

			expect(result).toBe("No errors");
		});

		it("should format single error with line and column", () => {
			const errors = [
				{
					message: "Unexpected token",
					path: "content/article.mdx",
					line: 10,
					column: 5,
					severity: "error" as const,
				},
			];

			const result = formatMdxValidationErrors(errors);

			expect(result).toContain("content/article.mdx:10:5");
			expect(result).toContain("[Error]");
			expect(result).toContain("Unexpected token");
		});

		it("should format error with only line number", () => {
			const errors = [
				{
					message: "Something went wrong",
					path: "file.mdx",
					line: 5,
					severity: "error" as const,
				},
			];

			const result = formatMdxValidationErrors(errors);

			expect(result).toContain("file.mdx:5");
			expect(result).not.toContain(":5:");
		});

		it("should format error without path", () => {
			const errors = [
				{
					message: "General error",
					line: 3,
					column: 1,
					severity: "error" as const,
				},
			];

			const result = formatMdxValidationErrors(errors);

			expect(result).toContain("line 3");
			expect(result).toContain("column 1");
			expect(result).toContain("General error");
		});

		it("should format error with path but no line number", () => {
			const errors = [
				{
					message: "File-level error",
					path: "content/broken.mdx",
					severity: "error" as const,
				},
			];

			const result = formatMdxValidationErrors(errors);

			expect(result).toContain("content/broken.mdx");
			expect(result).toContain("[Error]");
			expect(result).toContain("File-level error");
			// Should not have line number format
			expect(result).not.toContain("content/broken.mdx:");
		});

		it("should format warning differently", () => {
			const errors = [
				{
					message: "This is a warning",
					severity: "warning" as const,
				},
			];

			const result = formatMdxValidationErrors(errors);

			expect(result).toContain("[Warning]");
			expect(result).toContain("This is a warning");
		});

		it("should format multiple errors with separators", () => {
			const errors = [
				{
					message: "Error 1",
					path: "file1.mdx",
					line: 1,
					severity: "error" as const,
				},
				{
					message: "Error 2",
					path: "file2.mdx",
					line: 2,
					severity: "error" as const,
				},
			];

			const result = formatMdxValidationErrors(errors);

			expect(result).toContain("file1.mdx");
			expect(result).toContain("file2.mdx");
			expect(result).toContain("Error 1");
			expect(result).toContain("Error 2");
			// Should have separator between errors
			expect(result.split("\n\n").length).toBe(2);
		});
	});
});
