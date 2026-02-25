import {
	extractJrn,
	fingerprintFromContent,
	formatConflictMarkers,
	hasConflictMarkers,
	injectJrn,
	integrityHashFromContent,
	normalizeClientPath,
	normalizeGlobPattern,
	removeJrnFromContent,
} from "./SyncHelpers";
import { describe, expect, test } from "vitest";

describe("normalizeClientPath", () => {
	test("converts backslashes to slashes", () => {
		expect(normalizeClientPath("docs\\readme.md")).toBe("docs/readme.md");
	});

	test("removes leading ./", () => {
		expect(normalizeClientPath("./docs/readme.md")).toBe("docs/readme.md");
	});

	test("collapses duplicate slashes", () => {
		expect(normalizeClientPath("docs//nested///file.md")).toBe("docs/nested/file.md");
	});

	test("preserves trailing slashes for directories", () => {
		// The implementation preserves trailing slashes
		expect(normalizeClientPath("docs/folder/")).toBe("docs/folder/");
	});

	test("handles complex paths", () => {
		expect(normalizeClientPath(".\\docs\\\\nested///file.md")).toBe("docs/nested/file.md");
	});
});

describe("normalizeGlobPattern", () => {
	test("converts backslashes to slashes", () => {
		expect(normalizeGlobPattern("docs\\**\\*.md")).toBe("docs/**/*.md");
	});

	test("handles already normalized patterns", () => {
		expect(normalizeGlobPattern("**/*.md")).toBe("**/*.md");
	});
});

describe("conflict markers", () => {
	test("formats conflict markers with both sides", () => {
		const result = formatConflictMarkers("local", "server");
		expect(result).toContain("<<<<<<< LOCAL");
		expect(result).toContain("local");
		expect(result).toContain("=======");
		expect(result).toContain("server");
		expect(result).toContain(">>>>>>> SERVER");
	});

	test("detects conflict markers in content", () => {
		const content = formatConflictMarkers("local", "server");
		expect(hasConflictMarkers(content)).toBe(true);
		expect(hasConflictMarkers("plain content")).toBe(false);
	});

	test("detects partial conflict markers", () => {
		expect(hasConflictMarkers("<<<<<<< LOCAL")).toBe(true);
		expect(hasConflictMarkers(">>>>>>> SERVER")).toBe(true);
		expect(hasConflictMarkers("=======")).toBe(true);
	});
});

describe("jrn handling", () => {
	test("extractJrn gets jrn from frontmatter", () => {
		const content = `---
jrn: ABC123
title: Test
---
# Content`;
		expect(extractJrn(content)).toBe("ABC123");
	});

	test("extractJrn returns null when no jrn", () => {
		const content = `---
title: Test
---
# Content`;
		expect(extractJrn(content)).toBeNull();
	});

	test("extractJrn returns null for content without frontmatter", () => {
		const content = "# Just content";
		expect(extractJrn(content)).toBeNull();
	});

	test("injectJrn adds jrn to content without frontmatter", () => {
		const content = "# My Note";
		const result = injectJrn(content, "NEW123");
		expect(result).toContain("jrn: NEW123");
		expect(result).toContain("# My Note");
	});

	test("injectJrn replaces existing jrn", () => {
		const content = `---
jrn: OLD123
---
# Content`;
		const result = injectJrn(content, "NEW123");
		expect(result).toContain("jrn: NEW123");
		expect(result).not.toContain("OLD123");
	});

	test("injectJrn adds jrn to existing frontmatter", () => {
		const content = `---
title: Test
---
# Content`;
		const result = injectJrn(content, "NEW123");
		expect(result).toContain("jrn: NEW123");
		expect(result).toContain("title: Test");
	});

	test("removeJrnFromContent removes jrn line", () => {
		const content = `---
jrn: ABC123
title: Test
---
# Content`;
		const result = removeJrnFromContent(content);
		expect(result).not.toContain("jrn: ABC123");
		expect(result).toContain("title: Test");
	});

	test("removeJrnFromContent handles content without jrn", () => {
		const content = "# Just content";
		const result = removeJrnFromContent(content);
		expect(result).toBe(content);
	});

	test("removeJrnFromContent removes jrn from middle of frontmatter", () => {
		const content = `---
author: Jane
jrn: ABC123
tags: [api, docs]
---
# Content`;
		const result = removeJrnFromContent(content);
		expect(result).not.toContain("jrn:");
		expect(result).toContain("author: Jane");
		expect(result).toContain("tags: [api, docs]");
		expect(result).toBe(`---
author: Jane
tags: [api, docs]
---
# Content`);
	});

	test("removeJrnFromContent removes jrn from end of frontmatter", () => {
		const content = `---
author: Jane
jrn: ABC123
---
# Content`;
		const result = removeJrnFromContent(content);
		expect(result).not.toContain("jrn:");
		expect(result).toContain("author: Jane");
		expect(result).toBe(`---
author: Jane
---
# Content`);
	});

	test("removeJrnFromContent preserves all user frontmatter", () => {
		const content = `---
jrn: ABC123
title: My Doc
author: Jane Doe
tags: [api, docs, important]
date: 2024-01-15
---
# Content here`;
		const result = removeJrnFromContent(content);
		expect(result).not.toContain("jrn:");
		expect(result).toContain("title: My Doc");
		expect(result).toContain("author: Jane Doe");
		expect(result).toContain("tags: [api, docs, important]");
		expect(result).toContain("date: 2024-01-15");
	});
});

describe("fingerprint functions", () => {
	test("fingerprintFromContent generates consistent hash", () => {
		const content = "Hello, World!";
		const hash1 = fingerprintFromContent(content);
		const hash2 = fingerprintFromContent(content);
		expect(hash1).toBe(hash2);
	});

	test("fingerprintFromContent ignores jrn when computing hash", () => {
		const withJrn = `---
jrn: ABC123
---
# Note`;
		const withoutJrn = `---
---
# Note`;
		const hash1 = fingerprintFromContent(withJrn);
		const hash2 = fingerprintFromContent(withoutJrn);
		expect(hash1).toBe(hash2);
	});

	test("fingerprintFromContent returns hex string", () => {
		const hash = fingerprintFromContent("test content");
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});
});

describe("integrityHashFromContent", () => {
	test("generates consistent hash", () => {
		const content = "Hello, World!";
		const hash1 = integrityHashFromContent(content);
		const hash2 = integrityHashFromContent(content);
		expect(hash1).toBe(hash2);
	});

	test("generates different hash for different content", () => {
		const hash1 = integrityHashFromContent("Hello");
		const hash2 = integrityHashFromContent("World");
		expect(hash1).not.toBe(hash2);
	});

	test("returns hex string", () => {
		const hash = integrityHashFromContent("test");
		expect(hash).toMatch(/^[0-9a-f]+$/);
	});
});
