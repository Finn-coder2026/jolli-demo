import {
	extractBrainContent,
	injectGitPushTriggerFrontmatter,
	parseAttentionFrontmatter,
	parseYamlFrontmatter,
	stripJolliFrontmatter,
} from "./Frontmatter.js";
import { describe, expect, it } from "vitest";

describe("parseYamlFrontmatter", () => {
	it("returns null when no frontmatter", () => {
		expect(parseYamlFrontmatter("# Title")).toBeNull();
	});

	it("parses YAML frontmatter", () => {
		const content =
			`---
` +
			`jrn: DOC_001
` +
			`title: Test
` +
			`---
` +
			`# Title`;
		const result = parseYamlFrontmatter(content);
		expect(result?.raw).toContain("jrn: DOC_001");
		expect(result?.data?.jrn).toBe("DOC_001");
	});

	it("returns raw without data for invalid YAML", () => {
		const content = `---
invalid: [unclosed
---
# Title`;
		const result = parseYamlFrontmatter(content);
		expect(result?.raw).toBe("invalid: [unclosed");
		expect(result?.data).toBeUndefined();
	});

	it("returns raw without data when YAML is not a record", () => {
		const content = `---
just a string
---
# Title`;
		const result = parseYamlFrontmatter(content);
		expect(result?.raw).toBe("just a string");
		expect(result?.data).toBeUndefined();
	});

	it("returns raw without data when YAML is an array", () => {
		const content = `---
- item1
- item2
---
# Title`;
		const result = parseYamlFrontmatter(content);
		expect(result?.raw).toBe("- item1\n- item2");
		expect(result?.data).toBeUndefined();
	});

	it("handles UTF-8 BOM marker", () => {
		const content = "\ufeff---\njrn: DOC_001\n---\n# Title";
		const result = parseYamlFrontmatter(content);
		expect(result?.data?.jrn).toBe("DOC_001");
	});
});

describe("parseAttentionFrontmatter", () => {
	it("returns null when frontmatter has no data (invalid YAML)", () => {
		const content = `---
invalid: [unclosed
---
# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	it("parses attention file rules", () => {
		const content =
			`---
` +
			`jrn: DOC_002
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth/login.ts
` +
			`    keywords: [oauth, token]
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.docId).toBe("DOC_002");
		expect(result?.rules[0]).toEqual({
			op: "file",
			path: "src/auth/login.ts",
			keywords: ["oauth", "token"],
		});
	});

	it("parses optional source field on attention rules", () => {
		const content =
			`---
` +
			`jrn: DOC_002A
` +
			`attention:
` +
			`  - op: file
` +
			`    source: backend
` +
			`    path: src/auth/login.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules[0]).toEqual({
			op: "file",
			source: "backend",
			path: "src/auth/login.ts",
		});
	});

	it("omits source when source is empty", () => {
		const content =
			`---
` +
			`jrn: DOC_002B
` +
			`attention:
` +
			`  - op: file
` +
			`    source: "   "
` +
			`    path: src/auth/login.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules[0]).toEqual({
			op: "file",
			path: "src/auth/login.ts",
		});
	});

	it("ignores non-file attention ops", () => {
		const content =
			`---
` +
			`jrn: DOC_003
` +
			`attention:
` +
			`  - op: symbol
` +
			`    path: src/auth/login.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	it("accepts keywords as string", () => {
		const content =
			`---
` +
			`jrn: DOC_004
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth/login.ts
` +
			`    keywords: oauth
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules[0]?.keywords).toEqual(["oauth"]);
	});

	it("filters out non-string and empty keywords from array", () => {
		const content =
			`---
` +
			`jrn: DOC_009
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth.ts
` +
			`    keywords:
` +
			`      - valid
` +
			`      - 123
` +
			`      - ""
` +
			`      - "   "
` +
			`      - another
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules[0]?.keywords).toEqual(["valid", "another"]);
	});

	it("omits keywords when array contains only invalid items", () => {
		const content =
			`---
` +
			`jrn: DOC_010
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth.ts
` +
			`    keywords:
` +
			`      - 123
` +
			`      - ""
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules[0]?.keywords).toBeUndefined();
	});

	it("skips attention items with empty or missing path", () => {
		const content =
			`---
` +
			`jrn: DOC_005
` +
			`attention:
` +
			`  - op: file
` +
			`    path: ""
` +
			`  - op: file
` +
			`    path: "   "
` +
			`  - op: file
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	it("returns null when jrn is missing", () => {
		const content =
			`---
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	it("returns null when jrn is empty", () => {
		const content =
			`---
` +
			`jrn: ""
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	it("returns null when attention is not an array", () => {
		const content =
			`---
` +
			`jrn: DOC_006
` +
			`attention: not-an-array
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	it("skips attention items that are not records", () => {
		const content =
			`---
` +
			`jrn: DOC_007
` +
			`attention:
` +
			`  - just a string
` +
			`  - op: file
` +
			`    path: src/auth.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules).toHaveLength(1);
		expect(result?.rules[0]?.path).toBe("src/auth.ts");
	});

	it("skips attention items with non-string or missing op", () => {
		const content =
			`---
` +
			`jrn: DOC_008
` +
			`attention:
` +
			`  - op: 123
` +
			`    path: src/ignored.ts
` +
			`  - path: src/ignored2.ts
` +
			`  - op: file
` +
			`    path: src/auth.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttentionFrontmatter(content, "docs/auth.md");
		expect(result?.rules).toHaveLength(1);
		expect(result?.rules[0]?.path).toBe("src/auth.ts");
	});
});

describe("extractBrainContent", () => {
	it("returns empty brain and full content when no frontmatter", () => {
		const content = "# Title\nSome content";
		const result = extractBrainContent(content);
		expect(result.brainContent).toBe("");
		expect(result.articleContent).toBe(content);
	});

	it("extracts brain and article content from frontmatter", () => {
		const content = "---\njrn: DOC_001\nattention:\n  - op: file\n    path: src/auth.ts\n---\n# Title\nBody text";
		const result = extractBrainContent(content);
		expect(result.brainContent).toBe("jrn: DOC_001\nattention:\n  - op: file\n    path: src/auth.ts");
		expect(result.articleContent).toBe("# Title\nBody text");
	});

	it("strips the entire frontmatter block including non-jolli fields", () => {
		const content = "---\njrn: DOC_001\ncustom: value\n---\n# Title";
		const result = extractBrainContent(content);
		expect(result.brainContent).toContain("custom: value");
		expect(result.articleContent).toBe("# Title");
	});

	it("handles content with only frontmatter and no body", () => {
		const content = "---\njrn: DOC_001\n---";
		const result = extractBrainContent(content);
		expect(result.brainContent).toBe("jrn: DOC_001");
		expect(result.articleContent).toBe("");
	});

	it("preserves subsequent frontmatter-like blocks in article content", () => {
		const content = "---\njrn: DOC_001\n---\n# Title\n\n---\nsecond: block\n---\nMore content";
		const result = extractBrainContent(content);
		expect(result.brainContent).toBe("jrn: DOC_001");
		expect(result.articleContent).toContain("---\nsecond: block\n---");
	});

	it("handles Windows-style line endings (CRLF)", () => {
		const content = "---\r\njrn: DOC_001\r\n---\r\n# Title";
		const result = extractBrainContent(content);
		expect(result.brainContent).toBe("jrn: DOC_001");
		expect(result.articleContent).toBe("# Title");
	});
});

describe("stripJolliFrontmatter", () => {
	it("returns content unchanged when no frontmatter", () => {
		const content = "# Title\nSome content";
		expect(stripJolliFrontmatter(content)).toBe(content);
	});

	it("removes entire frontmatter when only jrn field", () => {
		const content = `---
jrn: DOC_001
---
# Title`;
		expect(stripJolliFrontmatter(content)).toBe("# Title");
	});

	it("removes entire frontmatter when only attention field", () => {
		const content = `---
attention:
  - op: file
    path: src/auth.ts
---
# Title`;
		expect(stripJolliFrontmatter(content)).toBe("# Title");
	});

	it("removes entire frontmatter when only jrn and attention", () => {
		const content = `---
jrn: DOC_001
attention:
  - op: file
    path: src/auth.ts
---
# Title`;
		expect(stripJolliFrontmatter(content)).toBe("# Title");
	});

	it("preserves other fields while removing jrn", () => {
		const content = `---
jrn: DOC_001
title: My Document
---
# Title`;
		const result = stripJolliFrontmatter(content);
		expect(result).toContain("title: My Document");
		expect(result).not.toContain("jrn:");
		expect(result).toContain("---");
	});

	it("preserves other fields while removing attention", () => {
		const content = `---
title: My Document
attention:
  - op: file
    path: src/auth.ts
author: John
---
# Title`;
		const result = stripJolliFrontmatter(content);
		expect(result).toContain("title: My Document");
		expect(result).toContain("author: John");
		expect(result).not.toContain("attention:");
		expect(result).not.toContain("op: file");
	});

	it("preserves other fields while removing both jrn and attention", () => {
		const content = `---
jrn: DOC_001
title: My Document
attention:
  - op: file
    path: src/auth.ts
author: John
---
# Title`;
		const result = stripJolliFrontmatter(content);
		expect(result).toContain("title: My Document");
		expect(result).toContain("author: John");
		expect(result).not.toContain("jrn:");
		expect(result).not.toContain("attention:");
	});

	it("handles UTF-8 BOM marker", () => {
		const content = "\ufeff---\njrn: DOC_001\n---\n# Title";
		expect(stripJolliFrontmatter(content)).toBe("# Title");
	});

	it("returns unchanged content for invalid YAML", () => {
		const content = `---
invalid: [unclosed
---
# Title`;
		expect(stripJolliFrontmatter(content)).toBe(content);
	});

	it("returns unchanged content when YAML is not a record", () => {
		const content = `---
just a string
---
# Title`;
		expect(stripJolliFrontmatter(content)).toBe(content);
	});

	it("handles frontmatter without trailing newline", () => {
		// Note: Content immediately follows --- without newline
		const content = "---\njrn: DOC_001\n---Content starts here";
		const result = stripJolliFrontmatter(content);
		expect(result).toBe("Content starts here");
	});
});

describe("injectGitPushTriggerFrontmatter", () => {
	const org = "jolliai";
	const repo = "code-to-doc-demo";
	const branch = "main";
	const expectedJrn = "jrn:*:path:/home/*/sources/github/jolliai/code-to-doc-demo/main";

	it("adds frontmatter with on: trigger when no frontmatter exists", () => {
		const content = "# Hello World\n\nSome content.";
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain("---\n");
		expect(result).toContain(`jrn: ${expectedJrn}`);
		expect(result).toContain("verb: GIT_PUSH");
		expect(result).toContain("# Hello World");
	});

	it("adds on: field to existing frontmatter without on:", () => {
		const content = `---
title: My Doc
author: John
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain("title: My Doc");
		expect(result).toContain("author: John");
		expect(result).toContain(`jrn: ${expectedJrn}`);
		expect(result).toContain("verb: GIT_PUSH");
		expect(result).toContain("# Hello World");
	});

	it("appends trigger when on: exists with different triggers", () => {
		const content = `---
on:
  - jrn: "jrn:*:path:/home/*/sources/github/other-org/other-repo/main"
    verb: GIT_PUSH
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain("other-org/other-repo/main");
		expect(result).toContain(expectedJrn);
		expect(result).toContain("# Hello World");
	});

	it("returns content unchanged when matching trigger already exists", () => {
		const content = `---
on:
  - jrn: "${expectedJrn}"
    verb: GIT_PUSH
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toBe(content);
	});

	it("normalizes single on: object to array and appends new trigger", () => {
		const content = `---
on:
  jrn: "jrn:*:path:/home/*/sources/github/other-org/other-repo/dev"
  verb: GIT_PUSH
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain("other-org/other-repo/dev");
		expect(result).toContain(expectedJrn);
	});

	it("returns unchanged when single on: object already matches", () => {
		const content = `---
on:
  jrn: "${expectedJrn}"
  verb: GIT_PUSH
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toBe(content);
	});

	it("preserves all existing frontmatter fields", () => {
		const content = `---
title: My Document
author: Jane
tags:
  - tutorial
  - guide
---
# Content`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain("title: My Document");
		expect(result).toContain("author: Jane");
		expect(result).toContain("- tutorial");
		expect(result).toContain("- guide");
		expect(result).toContain("verb: GIT_PUSH");
	});

	it("appends trigger when on: array contains non-record entries", () => {
		const content = `---
on:
  - just a string
  - jrn: "jrn:*:path:/home/*/sources/github/other-org/other-repo/main"
    verb: GIT_PUSH
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain(expectedJrn);
		expect(result).toContain("other-org/other-repo/main");
	});

	it("appends trigger when on: is a non-array, non-object value", () => {
		const content = `---
on: some-string-value
---
# Hello World`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain(`jrn: ${expectedJrn}`);
		expect(result).toContain("verb: GIT_PUSH");
	});

	it("adds trigger to frontmatter without trailing newline after closing ---", () => {
		const content = "---\ntitle: Test\n---Content starts here";
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain("title: Test");
		expect(result).toContain(`jrn: ${expectedJrn}`);
		expect(result).toContain("verb: GIT_PUSH");
		expect(result).toContain("Content starts here");
	});

	it("returns unchanged for invalid YAML frontmatter", () => {
		const content = `---
invalid: [unclosed
---
# Title`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toBe(content);
	});

	it("returns unchanged when YAML is not a record", () => {
		const content = `---
just a string
---
# Title`;
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toBe(content);
	});

	it("handles UTF-8 BOM marker", () => {
		const content = "\ufeff# Hello World";
		const result = injectGitPushTriggerFrontmatter(content, org, repo, branch);
		expect(result).toContain(`jrn: ${expectedJrn}`);
		expect(result).toContain("verb: GIT_PUSH");
		expect(result).toContain("# Hello World");
		// BOM should be stripped
		expect(result.startsWith("\ufeff")).toBe(false);
	});
});
