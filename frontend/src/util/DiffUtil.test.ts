import { createUnifiedDiff } from "./DiffUtil";
import { describe, expect, it } from "vitest";

describe("DiffUtil", () => {
	describe("createUnifiedDiff", () => {
		it("should return empty string when contents are identical", () => {
			const content = "line 1\nline 2\nline 3";
			const result = createUnifiedDiff(content, content);
			expect(result).toBe("");
		});

		it("should generate diff for added lines", () => {
			const oldContent = "line 1\nline 2";
			const newContent = "line 1\nline 2\nline 3";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("---");
			expect(result).toContain("+++");
			expect(result).toContain("@@");
			expect(result).toContain("+line 3");
		});

		it("should generate diff for removed lines", () => {
			const oldContent = "line 1\nline 2\nline 3";
			const newContent = "line 1\nline 2";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-line 3");
		});

		it("should generate diff for modified lines", () => {
			const oldContent = "line 1\nold line\nline 3";
			const newContent = "line 1\nnew line\nline 3";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-old line");
			expect(result).toContain("+new line");
		});

		it("should include context lines around changes", () => {
			const oldContent = "line 1\nline 2\nline 3\nline 4\nline 5";
			const newContent = "line 1\nline 2\nmodified\nline 4\nline 5";

			const result = createUnifiedDiff(oldContent, newContent);

			// Should include unchanged context lines
			expect(result).toContain(" line 2");
			expect(result).toContain(" line 4");
		});

		it("should use custom file names in header", () => {
			const oldContent = "old";
			const newContent = "new";

			const result = createUnifiedDiff(oldContent, newContent, "file_v1.txt", "file_v2.txt");

			expect(result).toContain("--- file_v1.txt");
			expect(result).toContain("+++ file_v2.txt");
		});

		it("should handle empty old content", () => {
			const oldContent = "";
			const newContent = "line 1\nline 2";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("+line 1");
			expect(result).toContain("+line 2");
		});

		it("should handle empty new content", () => {
			const oldContent = "line 1\nline 2";
			const newContent = "";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-line 1");
			expect(result).toContain("-line 2");
		});

		it("should generate proper hunk headers", () => {
			const oldContent = "line 1\nline 2\nline 3";
			const newContent = "line 1\nmodified\nline 3";

			const result = createUnifiedDiff(oldContent, newContent);

			// Should have hunk header with line numbers
			expect(result).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
		});

		it("should handle multiple separate changes", () => {
			const oldContent = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj";
			const newContent = "a\nB\nc\nd\ne\nf\ng\nH\ni\nj";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-b");
			expect(result).toContain("+B");
			expect(result).toContain("-h");
			expect(result).toContain("+H");
		});

		it("should handle single line files", () => {
			const oldContent = "old line";
			const newContent = "new line";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-old line");
			expect(result).toContain("+new line");
		});

		it("should preserve whitespace in lines", () => {
			const oldContent = "  indented";
			const newContent = "    more indented";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-  indented");
			expect(result).toContain("+    more indented");
		});

		it("should calculate correct line numbers when changes start after first line", () => {
			// Create content where changes start after context lines
			const oldContent = "line1\nline2\nline3\nline4\nline5\nline6\nline7\noldline\nline9\nline10";
			const newContent = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nnewline\nline9\nline10";

			const result = createUnifiedDiff(oldContent, newContent);

			// The hunk should start with context lines and show correct line numbers
			expect(result).toContain("-oldline");
			expect(result).toContain("+newline");
			// Should have proper hunk header with starting line numbers > 1
			expect(result).toMatch(/@@ -[5-8],\d+ \+[5-8],\d+ @@/);
		});

		it("should handle changes at the start with removed and added lines separately", () => {
			const oldContent = "removed1\nremoved2\ncommon\nmore";
			const newContent = "added1\ncommon\nmore";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-removed1");
			expect(result).toContain("-removed2");
			expect(result).toContain("+added1");
		});

		it("should handle changes with only removed lines at start", () => {
			const oldContent = "to-remove\nkeep1\nkeep2";
			const newContent = "keep1\nkeep2";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("-to-remove");
			expect(result).toContain(" keep1");
		});

		it("should handle changes with only added lines at start", () => {
			const oldContent = "keep1\nkeep2";
			const newContent = "to-add\nkeep1\nkeep2";

			const result = createUnifiedDiff(oldContent, newContent);

			expect(result).toContain("+to-add");
			expect(result).toContain(" keep1");
		});

		it("should create separate hunks for distant changes", () => {
			// Create content with changes far apart (more than 2*contextLines = 6 lines)
			const lines = [];
			for (let i = 1; i <= 20; i++) {
				lines.push(`line${i}`);
			}
			const oldContent = lines.join("\n");

			// Change line 2 and line 18 - they should be in separate hunks
			const newLines = [...lines];
			newLines[1] = "changed2";
			newLines[17] = "changed18";
			const newContent = newLines.join("\n");

			const result = createUnifiedDiff(oldContent, newContent);

			// Should have two separate @@ hunk headers
			const hunkHeaders = result.match(/@@ -\d+,\d+ \+\d+,\d+ @@/g);
			expect(hunkHeaders).toHaveLength(2);

			// Verify both changes are present
			expect(result).toContain("-line2");
			expect(result).toContain("+changed2");
			expect(result).toContain("-line18");
			expect(result).toContain("+changed18");
		});
	});
});
