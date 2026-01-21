import { extractErrorPosition, formatMdxValidationErrors, validateMdxBatch, validateMdxContent } from "./MdxValidation";
import { describe, expect, it } from "vitest";

describe("MdxValidation", () => {
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
		});

		describe("invalid JSX syntax", () => {
			it("should detect unclosed JSX tags", async () => {
				const content = `# Hello World

<div>
  <p>Unclosed paragraph
</div>
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].severity).toBe("error");
			});

			it("should detect self-closing tag errors", async () => {
				const content = `# Hello World

<div
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
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
			it("should detect unclosed expression braces", async () => {
				const content = `# Hello World

The value is {42 +
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
				expect(result.errors[0].severity).toBe("error");
			});

			it("should detect syntax error in expression", async () => {
				const content = `# Hello World

The value is {42 +++ 3}.
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
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
			it("should detect invalid import syntax", async () => {
				const content = `import { Button from './Button'

# Hello World
`;
				const result = await validateMdxContent(content);

				expect(result.isValid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
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
			it("should provide line numbers for errors", async () => {
				const content = `# Line 1

Line 3

<div>
  <p>Unclosed on line 6
</div>
`;
				const result = await validateMdxContent(content);

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
				const result = await validateMdxContent(content);

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

		describe("file path in errors", () => {
			it("should include file path in error when provided", async () => {
				const content = "<div>";
				const result = await validateMdxContent(content, "content/article.mdx");

				expect(result.isValid).toBe(false);
				expect(result.errors[0].path).toBe("content/article.mdx");
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

		it("should detect errors in batch", async () => {
			const files = new Map([
				["valid.mdx", "# Valid\n\nContent here."],
				["invalid.mdx", "<div>"],
				["another-valid.mdx", "# Another\n\nValid content."],
			]);

			const result = await validateMdxBatch(files);

			expect(result.isValid).toBe(false);
			expect(result.errorCount).toBeGreaterThan(0);
			expect(result.results.get("valid.mdx")?.isValid).toBe(true);
			expect(result.results.get("invalid.mdx")?.isValid).toBe(false);
			expect(result.results.get("another-valid.mdx")?.isValid).toBe(true);
		});

		it("should count errors and warnings correctly", async () => {
			const files = new Map([
				["error1.mdx", "<div>"],
				["error2.mdx", "{42 +"],
			]);

			const result = await validateMdxBatch(files);

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
