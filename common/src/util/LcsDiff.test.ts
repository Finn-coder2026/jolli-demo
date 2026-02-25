import { computeDiffOps, countLineChangesFromLines } from "./LcsDiff";
import { describe, expect, it } from "vitest";

describe("computeDiffOps", () => {
	it("returns empty array for two empty inputs", () => {
		expect(computeDiffOps([], [])).toEqual([]);
	});

	it("returns delete ops when other is empty", () => {
		const ops = computeDiffOps(["a", "b"], []);
		expect(ops).toEqual([
			{ type: "delete", line: "a" },
			{ type: "delete", line: "b" },
		]);
	});

	it("returns insert ops when base is empty", () => {
		const ops = computeDiffOps([], ["x", "y"]);
		expect(ops).toEqual([
			{ type: "insert", line: "x" },
			{ type: "insert", line: "y" },
		]);
	});

	it("returns equal ops for identical inputs", () => {
		const ops = computeDiffOps(["a", "b"], ["a", "b"]);
		expect(ops).toEqual([
			{ type: "equal", line: "a" },
			{ type: "equal", line: "b" },
		]);
	});

	it("detects a mix of equal, insert, and delete", () => {
		const ops = computeDiffOps(["a", "b", "c"], ["a", "x", "c"]);
		const types = ops.map(op => op.type);
		expect(types).toContain("equal");
		expect(ops.find(op => op.type === "equal")?.line).toBe("a");
	});

	it("falls back to delete-all/insert-all for very large inputs", () => {
		// MAX_LCS_MATRIX_CELLS is 1_000_000, so 1001 x 1001 = 1_002_001 exceeds it
		const base = Array.from({ length: 1001 }, (_, i) => `base-${i}`);
		const other = Array.from({ length: 1001 }, (_, i) => `other-${i}`);
		const ops = computeDiffOps(base, other);

		const deletes = ops.filter(op => op.type === "delete");
		const inserts = ops.filter(op => op.type === "insert");
		const equals = ops.filter(op => op.type === "equal");

		expect(deletes).toHaveLength(1001);
		expect(inserts).toHaveLength(1001);
		expect(equals).toHaveLength(0);
		expect(deletes[0].line).toBe("base-0");
		expect(inserts[0].line).toBe("other-0");
	});
});

describe("countLineChangesFromLines", () => {
	it("returns zero changes for identical inputs", () => {
		expect(countLineChangesFromLines(["a", "b"], ["a", "b"])).toEqual({
			additions: 0,
			deletions: 0,
		});
	});

	it("counts additions and deletions", () => {
		expect(countLineChangesFromLines(["a", "b"], ["a", "c"])).toEqual({
			additions: 1,
			deletions: 1,
		});
	});
});
