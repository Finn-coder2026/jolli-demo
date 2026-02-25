import { countLineChanges } from "./DiffStats";
import { describe, expect, it } from "vitest";

describe("countLineChanges", () => {
	it("returns zero changes for identical content", () => {
		expect(countLineChanges("line 1\nline 2", "line 1\nline 2")).toEqual({ additions: 0, deletions: 0 });
	});

	it("counts additions and deletions using LCS semantics", () => {
		expect(countLineChanges("a\nb\nc", "a\nx\nc\nd")).toEqual({ additions: 2, deletions: 1 });
	});

	it("handles empty content", () => {
		expect(countLineChanges("", "a\nb")).toEqual({ additions: 2, deletions: 0 });
		expect(countLineChanges("a\nb", "")).toEqual({ additions: 0, deletions: 2 });
	});
});
