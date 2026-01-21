import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	parseMdxFile,
	splitByHeadings,
	generateHeadingSlug,
	generateSectionId,
} from "./MdxParser.js";

describe("MdxParser", () => {
	describe("splitByHeadings", () => {
		it("should split content by level 2 headings", () => {
			const content = `## Overview
This is the overview section.

## Getting Started
This is the getting started section.`;

			const result = splitByHeadings(content);

			expect(result).toHaveLength(2);
			expect(result[0].heading).toBe("Overview");
			expect(result[0].headingLevel).toBe(2);
			expect(result[0].content).toContain("overview section");
			expect(result[1].heading).toBe("Getting Started");
		});

		it("should handle multiple heading levels", () => {
			const content = `## Section 1
Content 1

### Subsection 1.1
Content 1.1

## Section 2
Content 2`;

			const result = splitByHeadings(content);

			expect(result).toHaveLength(3);
			expect(result[0].headingLevel).toBe(2);
			expect(result[1].headingLevel).toBe(3);
			expect(result[2].headingLevel).toBe(2);
		});

		it("should handle content before first heading", () => {
			const content = `This is intro content.

## First Section
Section content.`;

			const result = splitByHeadings(content);

			// Content before first heading is not captured as a section
			expect(result).toHaveLength(1);
			expect(result[0].heading).toBe("First Section");
		});

		it("should handle empty content", () => {
			const result = splitByHeadings("");

			expect(result).toHaveLength(0);
		});

		it("should handle content with no headings", () => {
			const content = "Just some regular content without headings.";

			const result = splitByHeadings(content);

			expect(result).toHaveLength(0);
		});

		it("should trim section content", () => {
			const content = `## Section


Content with extra newlines


`;

			const result = splitByHeadings(content);

			expect(result[0].content).toBe("Content with extra newlines");
		});
	});

	describe("generateHeadingSlug", () => {
		it("should convert heading to lowercase slug", () => {
			const result = generateHeadingSlug("Getting Started");

			expect(result).toBe("getting-started");
		});

		it("should remove special characters", () => {
			const result = generateHeadingSlug("API's & SDK's");

			expect(result).toBe("apis-sdks");
		});

		it("should replace multiple spaces with single hyphen", () => {
			const result = generateHeadingSlug("Multiple   Spaces   Here");

			expect(result).toBe("multiple-spaces-here");
		});

		it("should remove leading and trailing hyphens", () => {
			const result = generateHeadingSlug("-Leading and Trailing-");

			expect(result).toBe("leading-and-trailing");
		});

		it("should handle already slug-like text", () => {
			const result = generateHeadingSlug("already-a-slug");

			expect(result).toBe("already-a-slug");
		});
	});

	describe("generateSectionId", () => {
		it("should generate section ID with doc path and slug", () => {
			const result = generateSectionId("api/users/get.mdx", "overview");

			expect(result).toBe("api/users/get::overview");
		});

		it("should remove .mdx extension", () => {
			const result = generateSectionId("guides/quickstart.mdx", "prerequisites");

			expect(result).toBe("guides/quickstart::prerequisites");
		});

		it("should normalize Windows path separators", () => {
			const result = generateSectionId("api\\users\\post.mdx", "request-body");

			expect(result).toBe("api/users/post::request-body");
		});

		it("should handle nested paths", () => {
			const result = generateSectionId(
				"api/v1/resources/users.mdx",
				"authentication",
			);

			expect(result).toBe("api/v1/resources/users::authentication");
		});
	});

	describe("parseMdxFile", () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "mdx-parser-test-"));
		});

		afterEach(() => {
			rmSync(tempDir, { recursive: true, force: true });
		});

		it("should parse MDX file with frontmatter and sections", () => {
			const mdxContent = `---
title: API Reference
covers:
  - openapi:UsersService_get
tags: [api, reference]
---

## Overview
This is the API overview.

## Request
Details about the request.`;

			const filePath = join(tempDir, "test.mdx");
			writeFileSync(filePath, mdxContent, "utf-8");

			const result = parseMdxFile(filePath, "test.mdx");

			expect(result.filePath).toBe("test.mdx");
			expect(result.frontmatter.title).toBe("API Reference");
			expect(result.frontmatter.covers).toContain("openapi:UsersService_get");
			expect(result.sections).toHaveLength(2);
			expect(result.sections[0].heading).toBe("Overview");
			expect(result.sections[1].heading).toBe("Request");
		});

		it("should handle MDX without frontmatter", () => {
			const mdxContent = `## Section One
Content here.`;

			const filePath = join(tempDir, "no-frontmatter.mdx");
			writeFileSync(filePath, mdxContent, "utf-8");

			const result = parseMdxFile(filePath, "no-frontmatter.mdx");

			expect(result.frontmatter).toEqual({});
			expect(result.sections).toHaveLength(1);
		});

		it("should handle empty MDX file", () => {
			const filePath = join(tempDir, "empty.mdx");
			writeFileSync(filePath, "", "utf-8");

			const result = parseMdxFile(filePath, "empty.mdx");

			expect(result.frontmatter).toEqual({});
			expect(result.sections).toHaveLength(0);
		});
	});
});
