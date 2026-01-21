import { computeHunks, smartMerge, threeWayMerge } from "./smart-merge";
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

describe("threeWayMerge", () => {
	test("merges non-overlapping edits", () => {
		const base = `# Doc

## Intro
Hello

## List
- A
- B

## Footer
End`;

		const local = `# Doc

## Intro
Hello

## List
- A (local)
- B

## Footer
End`;

		const server = `# Doc

## Intro
Hello

## List
- A
- B

## Footer
End (server)`;

		const result = threeWayMerge(base, local, server);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe(`# Doc

## Intro
Hello

## List
- A (local)
- B

## Footer
End (server)`);
	});

	test("conflicts on overlapping edits", () => {
		const base = `alpha
beta
gamma`;
		const local = `alpha
beta-local
gamma`;
		const server = `alpha
beta-server
gamma`;

		const result = threeWayMerge(base, local, server);
		expect(result.hasConflict).toBe(true);
		expect(result.merged).toContain("<<<<<<< LOCAL");
		expect(result.merged).toContain("beta-local");
		expect(result.merged).toContain("beta-server");
	});

	test("fast-forward when one side unchanged", () => {
		const base = "one\ntwo";
		const local = base;
		const server = "one\ntwo\nthree";
		const result = threeWayMerge(base, local, server);
		expect(result.hasConflict).toBe(false);
		expect(result.merged).toBe(server);
	});
});
