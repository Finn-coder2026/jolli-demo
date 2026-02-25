import { describe, expect, test } from "vitest";
import { parseAttention } from "./AttentionParser";

describe("AttentionParser", () => {
	test("parses jrn and file rules from frontmatter", () => {
		const content = `---
` +
			`jrn: DOC_001
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth/login.ts
` +
			`  - op: file
` +
			`    path: src/auth/**/*.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttention(content, "docs/auth.md");
		expect(result?.docId).toBe("DOC_001");
		expect(result?.docPath).toBe("docs/auth.md");
		expect(result?.rules).toHaveLength(2);
		expect(result?.rules[0]).toEqual({ op: "file", path: "src/auth/login.ts" });
	});

	test("parses keywords inline list", () => {
		const content = `---
` +
			`jrn: DOC_002
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth/login.ts
` +
			`    keywords: [oauth, "refresh token"]
` +
			`---
` +
			`# Title`;
		const result = parseAttention(content, "docs/auth.md");
		expect(result?.rules[0]?.keywords).toEqual(["oauth", "refresh token"]);
	});

	test("parses keywords block list", () => {
		const content = `---
` +
			`jrn: DOC_003
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth/login.ts
` +
			`    keywords:
` +
			`      - oauth
` +
			`      - token
` +
			`---
` +
			`# Title`;
		const result = parseAttention(content, "docs/auth.md");
		expect(result?.rules[0]?.keywords).toEqual(["oauth", "token"]);
	});

	test("parses optional source field", () => {
		const content = `---
` +
			`jrn: DOC_003A
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
		const result = parseAttention(content, "docs/auth.md");
		expect(result?.rules[0]).toEqual({
			op: "file",
			source: "backend",
			path: "src/auth/login.ts",
		});
	});

	test("ignores non-file rules", () => {
		const content = `---
` +
			`jrn: DOC_004
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
		const result = parseAttention(content, "docs/auth.md");
		expect(result).toBeNull();
	});

	test("returns null when no frontmatter", () => {
		const result = parseAttention("# No frontmatter", "docs/nope.md");
		expect(result).toBeNull();
	});

	test("returns null when jrn missing", () => {
		const content = `---
` +
			`attention:
` +
			`  - op: file
` +
			`    path: src/auth/login.ts
` +
			`---
` +
			`# Title`;
		const result = parseAttention(content, "docs/auth.md");
		expect(result).toBeNull();
	});
});
