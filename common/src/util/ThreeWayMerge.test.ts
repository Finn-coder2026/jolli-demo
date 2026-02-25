import { threeWayMerge } from "./ThreeWayMerge";
import { describe, expect, it } from "vitest";

describe("threeWayMerge", () => {
	it("prefers incoming when current matches base", () => {
		const result = threeWayMerge("alpha", "alpha", "beta");
		expect(result).toEqual({ merged: "beta", hasConflict: false });
	});

	it("prefers current when incoming matches base", () => {
		const result = threeWayMerge("original", "modified", "original");
		expect(result).toEqual({ merged: "modified", hasConflict: false });
	});

	it("returns either side when both are identical", () => {
		const result = threeWayMerge("base", "same", "same");
		expect(result).toEqual({ merged: "same", hasConflict: false });
	});

	it("combines non-overlapping edits without conflict markers", () => {
		const result = threeWayMerge(
			["line 1", "line 2", "line 3"].join("\n"),
			["line 1", "line 2 changed", "line 3"].join("\n"),
			["line 1", "line 2", "line 3", "line 4"].join("\n"),
		);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toContain("line 2 changed");
		expect(result.merged).toContain("line 4");
	});

	it("adds conflict markers when both sides change the same region", () => {
		const result = threeWayMerge("line", "line current", "line incoming");
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< CURRENT");
		expect(result.merged).toContain("line current");
		expect(result.merged).toContain("line incoming");
		expect(result.merged).toContain(">>>>>>> INCOMING");
	});

	it("merges non-overlapping multi-section edits", () => {
		const base = `# Doc

## Intro
Hello

## List
- A
- B

## Footer
End`;

		const current = `# Doc

## Intro
Hello

## List
- A (current)
- B

## Footer
End`;

		const incoming = `# Doc

## Intro
Hello

## List
- A
- B

## Footer
End (incoming)`;

		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe(`# Doc

## Intro
Hello

## List
- A (current)
- B

## Footer
End (incoming)`);
	});

	it("conflicts on overlapping edits", () => {
		const base = `alpha
beta
gamma`;
		const current = `alpha
beta-current
gamma`;
		const incoming = `alpha
beta-incoming
gamma`;

		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< CURRENT");
		expect(result.merged).toContain("beta-current");
		expect(result.merged).toContain("beta-incoming");
	});

	it("fast-forwards when one side is unchanged", () => {
		const base = "one\ntwo";
		const current = base;
		const incoming = "one\ntwo\nthree";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe(incoming);
	});

	it("handles empty base with both sides adding content", () => {
		const result = threeWayMerge("", "current content", "incoming content");
		expect(result.hasConflict).toBe(true);
	});

	it("handles multiple non-overlapping changes across the file", () => {
		const base = `line 1
line 2
line 3
line 4
line 5`;
		const current = `line 1 modified
line 2
line 3
line 4
line 5`;
		const incoming = `line 1
line 2
line 3
line 4
line 5 modified`;
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toContain("line 1 modified");
		expect(result.merged).toContain("line 5 modified");
	});

	it("supports custom conflict labels", () => {
		const result = threeWayMerge("base", "mine", "theirs", "MINE", "THEIRS");
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< MINE");
		expect(result.merged).toContain(">>>>>>> THEIRS");
	});

	it("merges without conflict when both sides make the same edit", () => {
		const base = "a\nb\nc";
		const current = "a\nX\nc";
		const incoming = "a\nX\nc";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe("a\nX\nc");
	});

	it("conflicts when both sides insert at the same position", () => {
		const base = "a\nc";
		const current = "a\nb-current\nc";
		const incoming = "a\nb-incoming\nc";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("b-current");
		expect(result.merged).toContain("b-incoming");
	});

	it("handles one side deleting and the other modifying", () => {
		const base = "a\nb\nc\nd";
		const current = "a\nd";
		const incoming = "a\nB\nc\nd";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< CURRENT");
	});

	it("handles deletion on one side with no change on other", () => {
		const base = "a\nb\nc";
		const current = "a\nc";
		const incoming = "a\nb\nc";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe("a\nc");
	});

	it("handles interleaved non-overlapping edits from both sides", () => {
		const base = "1\n2\n3\n4\n5\n6";
		const current = "1\nA\n3\n4\nC\n6";
		const incoming = "1\n2\nB\n4\n5\nD";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toContain("A");
		expect(result.merged).toContain("B");
		expect(result.merged).toContain("C");
		expect(result.merged).toContain("D");
	});

	it("resolves overlapping edits that produce the same result without conflict", () => {
		const base = "a\nb\nc\nd";
		const current = "a\nX\nc\nY";
		const incoming = "a\nX\nc\nZ";
		const result = threeWayMerge(base, current, incoming);
		// Both sides change b→X identically, but d differs
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("<<<<<<< CURRENT");
	});

	it("expands overlapping edits when additional edits fall within the union range", () => {
		const base = "a\nb\nc\nd";
		const current = "a\nX\nY\nd";
		const incoming = "a\nZ\nW\nd";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("a");
		expect(result.merged).toContain("d");
	});

	it("handles insertion overlapping with a replacement edit", () => {
		const base = "a\nb\nc\nd";
		const current = "X\nY\nc\nd";
		const incoming = "a\nZ\nb\nc\nd";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
	});

	it("expands current edits into a wider overlap group", () => {
		// Current has two non-adjacent edits (b→X, d→Y)
		// Incoming replaces the entire b,c,d region with Z
		// The second current edit gets pulled into the overlap group
		const base = "a\nb\nc\nd\ne";
		const current = "a\nX\nc\nY\ne";
		const incoming = "a\nZ\ne";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< CURRENT");
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("Y");
		expect(result.merged).toContain("Z");
	});

	it("expands incoming edits into a wider overlap group", () => {
		// Current replaces the entire b,c,d region with Z
		// Incoming has two non-adjacent edits (b→X, d→Y)
		// The second incoming edit gets pulled into the overlap group
		const base = "a\nb\nc\nd\ne";
		const current = "a\nZ\ne";
		const incoming = "a\nX\nc\nY\ne";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< CURRENT");
		expect(result.merged).toContain("Z");
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("Y");
	});

	it("handles pure insertions at adjacent positions with expansion", () => {
		// Current replaces b,c,d with X (wide edit)
		// Incoming inserts Y between b,c and Z between c,d (pure insertions inside the range)
		// The second insertion should be pulled in during overlap expansion
		const base = "a\nb\nc\nd\ne\nf";
		const current = "a\nX\ne\nf";
		const incoming = "a\nb\nY\nc\nZ\nd\ne\nf";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("Y");
		expect(result.merged).toContain("Z");
	});

	it("handles point-range overlap check with insertions at different positions", () => {
		// Both sides insert at position 1, creating a point-range union
		// Current also inserts at position 2, which should NOT overlap the point range at 1
		const base = "a\nb\nc";
		const current = "a\nX\nb\nZ\nc";
		const incoming = "a\nY\nb\nc";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("Y");
	});

	it("handles truncation where one side deletes trailing lines", () => {
		// Both sides differ from base to avoid early returns
		// Current deletes b,c; incoming changes a→X. Non-overlapping, so no conflict.
		const base = "a\nb\nc";
		const current = "a";
		const incoming = "X\nb\nc";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe("X");
	});

	it("prefers current insertion when both sides have edits at same position", () => {
		// Current inserts X before b (pure insertion at position 1)
		// Incoming replaces b with Y (replacement at position 1)
		// These are non-overlapping by the algorithm, insertion applied first
		const base = "a\nb\nc";
		const current = "a\nX\nb\nc";
		const incoming = "a\nY\nc";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("Y");
	});

	it("handles insertion inside the other side's replacement range", () => {
		// Current inserts X between b and c (pure insertion at position 2)
		// Incoming replaces b,c,d with Y (wide replacement)
		// The insertion overlaps the replacement range
		const base = "a\nb\nc\nd\ne";
		const current = "a\nb\nX\nc\nd\ne";
		const incoming = "a\nY\ne";
		const result = threeWayMerge(base, current, incoming);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("X");
		expect(result.merged).toContain("Y");
	});
});
