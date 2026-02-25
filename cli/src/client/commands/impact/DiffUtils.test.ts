import { createSimpleDiff, createUnifiedDiff } from "./DiffUtils";
import { describe, expect, test } from "vitest";

describe("DiffUtils", () => {
	describe("createSimpleDiff", () => {
		test("returns empty string for identical content", () => {
			const content = "line 1\nline 2\nline 3";
			const diff = createSimpleDiff(content, content, "test.md");
			expect(diff).toBe("");
		});

		test("shows added lines", () => {
			const original = "line 1\nline 2";
			const updated = "line 1\nline 2\nline 3";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toContain("--- a/test.md");
			expect(diff).toContain("+++ b/test.md");
			expect(diff).toContain("+line 3");
		});

		test("shows removed lines", () => {
			const original = "line 1\nline 2\nline 3";
			const updated = "line 1\nline 2";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toContain("-line 3");
		});

		test("shows modified lines", () => {
			const original = "line 1\nold line\nline 3";
			const updated = "line 1\nnew line\nline 3";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toContain("-old line");
			expect(diff).toContain("+new line");
		});

		test("includes context lines", () => {
			const original = "line 1\nline 2\nline 3\nline 4\nline 5";
			const updated = "line 1\nline 2\nmodified\nline 4\nline 5";
			const diff = createSimpleDiff(original, updated, "test.md");

			// Should include context around the change
			expect(diff).toContain(" line 2");
			expect(diff).toContain(" line 4");
		});

		test("handles empty original file", () => {
			const original = "";
			const updated = "new content";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toContain("+new content");
		});

		test("handles empty updated file", () => {
			const original = "old content";
			const updated = "";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toContain("-old content");
		});

		test("includes hunk headers", () => {
			const original = "line 1\nline 2";
			const updated = "line 1\nmodified";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
		});

		test("handles multi-line changes", () => {
			const original = "a\nb\nc\nd\ne";
			const updated = "a\nx\ny\nz\ne";
			const diff = createSimpleDiff(original, updated, "test.md");

			expect(diff).toContain("-b");
			expect(diff).toContain("-c");
			expect(diff).toContain("-d");
			expect(diff).toContain("+x");
			expect(diff).toContain("+y");
			expect(diff).toContain("+z");
		});
	});

	describe("createUnifiedDiff", () => {
		test("returns empty string for identical content", () => {
			const content = "line 1\nline 2";
			const diff = createUnifiedDiff(content, content, "test.md");
			expect(diff).toBe("");
		});

		test("includes file headers", () => {
			const original = "old";
			const updated = "new";
			const diff = createUnifiedDiff(original, updated, "docs/test.md");

			expect(diff).toContain("--- a/docs/test.md");
			expect(diff).toContain("+++ b/docs/test.md");
		});
	});
});
