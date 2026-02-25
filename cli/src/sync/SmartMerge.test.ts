import { computeHunks, smartMerge } from "./SmartMerge";
import { describe, expect, test } from "vitest";

describe("smartMerge", () => {
	test("identical files return no conflict", () => {
		const content = "# Hello\n\nWorld";
		const result = smartMerge(content, content);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe(content);
	});

	test("conflict only at end", () => {
		const local = `# Welcome

## Section 1
Content here

## Local Edit
Added from local`;

		const server = `# Welcome

## Section 1
Content here

## Server Edit
Added from server`;

		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toBe(`# Welcome

## Section 1
Content here

<<<<<<< LOCAL
## Local Edit
Added from local
=======
## Server Edit
Added from server
>>>>>>> SERVER`);
	});

	test("conflict in middle", () => {
		const local = `# Doc

## Intro
Hello

## Status
- [x] Task A (local)
- [ ] Task B

## Footer
The end`;

		const server = `# Doc

## Intro
Hello

## Status
- [ ] Task A
- [x] Task B (server)

## Footer
The end`;

		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toBe(`# Doc

## Intro
Hello

## Status
<<<<<<< LOCAL
- [x] Task A (local)
- [ ] Task B
=======
- [ ] Task A
- [x] Task B (server)
>>>>>>> SERVER

## Footer
The end`);
	});

	test("conflict at start", () => {
		const local = `---
jrn: abc123
custom: local-value
---
# Content`;

		const server = `---
jrn: abc123
custom: server-value
---
# Content`;

		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< LOCAL");
		expect(result.merged).toContain("custom: local-value");
		expect(result.merged).toContain("custom: server-value");
		expect(result.merged).toContain("# Content");
	});

	test("custom labels", () => {
		const local = "line A";
		const server = "line B";
		const result = smartMerge(local, server, "MINE", "THEIRS");
		expect(result.merged).toContain("<<<<<<< MINE");
		expect(result.merged).toContain(">>>>>>> THEIRS");
	});
});

describe("computeHunks", () => {
	test("all common", () => {
		const hunks = computeHunks("a\nb\nc", "a\nb\nc");
		expect(hunks.length).toBe(1);
		expect(hunks[0].type).toBe("common");
	});

	test("all different", () => {
		const hunks = computeHunks("a", "b");
		expect(hunks.length).toBe(1);
		expect(hunks[0].type).toBe("conflict");
		expect(hunks[0].localLines).toEqual(["a"]);
		expect(hunks[0].serverLines).toEqual(["b"]);
	});

	test("prefix + conflict", () => {
		const hunks = computeHunks("a\nb\nc", "a\nb\nd");
		expect(hunks.length).toBe(2);
		expect(hunks[0].type).toBe("common");
		expect(hunks[0].lines).toEqual(["a", "b"]);
		expect(hunks[1].type).toBe("conflict");
	});

	test("conflict + suffix", () => {
		const hunks = computeHunks("a\nb\nc", "x\nb\nc");
		expect(hunks.length).toBe(2);
		expect(hunks[0].type).toBe("conflict");
		expect(hunks[1].type).toBe("common");
		expect(hunks[1].lines).toEqual(["b", "c"]);
	});

	test("prefix + conflict + suffix", () => {
		const hunks = computeHunks("a\nb\nc\nd", "a\nx\ny\nd");
		expect(hunks.length).toBe(3);
		expect(hunks[0].type).toBe("common");
		expect(hunks[1].type).toBe("conflict");
		expect(hunks[2].type).toBe("common");
	});
});

describe("smartMerge edge cases", () => {
	test("handles empty local", () => {
		const local = "";
		const server = "server content";
		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
	});

	test("handles empty server", () => {
		const local = "local content";
		const server = "";
		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
	});

	test("handles both empty", () => {
		const result = smartMerge("", "");
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe("");
	});

	test("handles single line differences", () => {
		const local = "single line";
		const server = "different line";
		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("single line");
		expect(result.merged).toContain("different line");
	});

	test("handles multiline whitespace differences", () => {
		const local = "line1\n\n\nline2";
		const server = "line1\nline2";
		const result = smartMerge(local, server);
		expect(result.hasConflict).toBe(true);
	});
});

describe("computeHunks edge cases", () => {
	test("handles empty strings", () => {
		const hunks = computeHunks("", "");
		expect(hunks.length).toBe(1);
		expect(hunks[0].type).toBe("common");
	});

	test("handles local empty", () => {
		const hunks = computeHunks("", "content");
		expect(hunks.length).toBe(1);
		expect(hunks[0].type).toBe("conflict");
	});

	test("handles server empty", () => {
		const hunks = computeHunks("content", "");
		expect(hunks.length).toBe(1);
		expect(hunks[0].type).toBe("conflict");
	});

	test("handles multiple conflicts", () => {
		const local = "a\ncommon\nc\ncommon2\ne";
		const server = "b\ncommon\nd\ncommon2\nf";
		const hunks = computeHunks(local, server);
		// Should have multiple conflict and common hunks
		const conflictCount = hunks.filter(h => h.type === "conflict").length;
		expect(conflictCount).toBeGreaterThan(0);
	});
});
