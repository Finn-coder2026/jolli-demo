import { extractFrontmatter, stripJolliScriptFrontmatter } from "./ContentUtil";
import { describe, expect, it } from "vitest";

// JRN Format History:
// - v1 (path-based): /root/integrations/{org}/{repo}/{branch}
//   Example: /root/integrations/my-org/my-repo/main
//   Wildcards: /root/integrations/*/*/*
//
// - v2 (structured): jrn:/global:sources:github/{org}/{repo}/{branch}
//   Example: jrn:/global:sources:github/my-org/my-repo/main
//   Wildcards: jrn:*/*:sources:github/**
//
// These tests use v1 format in test fixtures to validate stripping of
// jolliscript frontmatter. The DEMO_MIGRATE_JRNS job handles migration
// from v1 to v2 format.
describe("ContentUtil", () => {
	describe("extractFrontmatter", () => {
		it("should extract frontmatter from markdown content", () => {
			const content = `---
title: Test Article
description: A test
---

# Hello World

This is the content.`;

			const result = extractFrontmatter(content);
			expect(result.frontmatter).toEqual({
				title: "Test Article",
				description: "A test",
			});
			expect(result.contentWithoutFrontmatter).toBe(`
# Hello World

This is the content.`);
		});

		it("should return null frontmatter when no frontmatter present", () => {
			const content = `# Hello World

This is the content.`;

			const result = extractFrontmatter(content);
			expect(result.frontmatter).toBeNull();
			expect(result.contentWithoutFrontmatter).toBe(content);
		});

		it("should handle empty frontmatter", () => {
			const content = `---
---

# Hello World`;

			const result = extractFrontmatter(content);
			// Empty YAML parses as null
			expect(result.frontmatter).toBeNull();
			// But frontmatter block is still removed
			expect(result.contentWithoutFrontmatter).toBe(`
# Hello World`);
		});

		it("should handle content with only frontmatter", () => {
			const content = `---
title: Only Frontmatter
---
`;

			const result = extractFrontmatter(content);
			expect(result.frontmatter).toEqual({ title: "Only Frontmatter" });
			expect(result.contentWithoutFrontmatter).toBe("");
		});

		it("should return null frontmatter when YAML has no valid key-value pairs", () => {
			// Content between --- markers that doesn't match key: value pattern
			const content = `---
this is just some text without keys
another line without structure
---

# Hello World`;

			const result = extractFrontmatter(content);
			// parseSimpleYaml returns null when no valid key-value pairs found
			expect(result.frontmatter).toBeNull();
			expect(result.contentWithoutFrontmatter).toBe(`
# Hello World`);
		});

		it("should handle Windows line endings", () => {
			const content = `---\r\ntitle: Windows\r\n---\r\n\r\n# Content`;

			const result = extractFrontmatter(content);
			expect(result.frontmatter).toEqual({ title: "Windows" });
			expect(result.contentWithoutFrontmatter).toBe("\r\n# Content");
		});

		it("should handle quoted values", () => {
			const content = `---
title: "Quoted Title"
description: 'Single Quoted'
---

# Content`;

			const result = extractFrontmatter(content);
			expect(result.frontmatter).toEqual({
				title: "Quoted Title",
				description: "Single Quoted",
			});
		});
	});

	describe("stripJolliScriptFrontmatter", () => {
		it("should strip jolliscript frontmatter", () => {
			// Uses v1 (path-based) JRN format in test fixture
			const content = `---
article_type: jolliscript
on:
  - jrn: /root/integrations/*/*/*
    verb: GIT_PUSH
job:
  steps:
    - name: "Update Article"
      run_prompt: |
        check out the repo and see the last change
---

# My Article

This is the article content.

## Section 1

Some text here.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(`# My Article

This is the article content.

## Section 1

Some text here.`);
		});

		it("should not strip non-jolliscript frontmatter", () => {
			const content = `---
title: Normal Article
description: Just a normal article
---

# My Article

This is the article content.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(content);
		});

		it("should not strip frontmatter with different article_type", () => {
			const content = `---
article_type: blog
title: Blog Post
---

# Blog Post

Content here.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(content);
		});

		it("should handle content without frontmatter", () => {
			const content = `# No Frontmatter

Just regular markdown content.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(content);
		});

		it("should handle empty content", () => {
			const result = stripJolliScriptFrontmatter("");
			expect(result).toBe("");
		});

		it("should handle undefined content", () => {
			const result = stripJolliScriptFrontmatter(undefined);
			expect(result).toBe("");
		});

		it("should handle content with only jolliscript frontmatter", () => {
			const content = `---
article_type: jolliscript
on:
  - jrn: /root/*
    verb: GIT_PUSH
---
`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe("");
		});

		it("should preserve leading whitespace after stripping", () => {
			const content = `---
article_type: jolliscript
job:
  steps: []
---


# Article With Space

Content.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(`# Article With Space

Content.`);
		});

		it("should handle complex jolliscript frontmatter", () => {
			// Uses v1 (path-based) JRN format in test fixture
			const content = `---
article_type: jolliscript
on:
  - jrn: /root/integrations/*/*/*
    verb: GIT_PUSH
  - jrn: /root/scripts/*
    verb: SYNC
job:
  steps:
    - name: "Update Article"
      run_prompt: |
        check out the repo and see the last change both summary and details,
        if the article contains factual differences with what has just changed
        in the repository, make edits via the add/delete/update_section tool.
    - name: "Notify"
      run_prompt: "Send notification"
---

# Documentation

This document gets auto-updated.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(`# Documentation

This document gets auto-updated.`);
		});

		it("should not strip when article_type is missing but has on/job fields", () => {
			const content = `---
on:
  - jrn: /root/*
job:
  steps: []
---

# Article

Content.`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe(content);
		});

		it("should strip jolliscript frontmatter with uppercase article_type", () => {
			const content = `---
article_type: JOLLISCRIPT
on:
  - jrn: /root/*
---

# Article`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe("# Article");
		});

		it("should strip jolliscript frontmatter with mixed case article_type", () => {
			const content = `---
article_type: JolliScript
on:
  - jrn: /root/*
---

# Article`;

			const result = stripJolliScriptFrontmatter(content);
			expect(result).toBe("# Article");
		});
	});
});
