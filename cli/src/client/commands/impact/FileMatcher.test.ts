import { describe, expect, test } from "vitest";
import { buildAttentionIndex } from "./AttentionIndex";
import { matchFiles } from "./FileMatcher";
import type { DocAttention } from "./AttentionParser";

describe("FileMatcher", () => {
	test("matches exact paths", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_001",
				docPath: "docs/auth.md",
				rules: [{ op: "file", path: "src/auth/login.ts" }],
			},
		];
		const index = buildAttentionIndex(docs);
		const matches = matchFiles(["src/auth/login.ts"], index);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.matches[0]).toEqual({
			changedFile: "src/auth/login.ts",
			pattern: "src/auth/login.ts",
			matchType: "exact",
			source: "<local>",
		});
	});

	test("matches glob patterns", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_002",
				docPath: "docs/auth.md",
				rules: [{ op: "file", path: "src/auth/**/*.ts" }],
			},
		];
		const index = buildAttentionIndex(docs);
		const matches = matchFiles(["src/auth/flows/login.ts"], index);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.matches[0]?.matchType).toBe("glob");
		expect(matches[0]?.matches[0]?.source).toBe("<local>");
	});

	test("matches brace expansion", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_003",
				docPath: "docs/auth.md",
				rules: [{ op: "file", path: "src/{auth,users}/*.ts" }],
			},
		];
		const index = buildAttentionIndex(docs);
		const matches = matchFiles(["src/users/index.ts"], index);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.matches[0]?.pattern).toBe("src/{auth,users}/*.ts");
		expect(matches[0]?.matches[0]?.source).toBe("<local>");
	});

	test("normalizes changed file paths", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_004",
				docPath: "docs/auth.md",
				rules: [{ op: "file", path: "src/auth/login.ts" }],
			},
		];
		const index = buildAttentionIndex(docs);
		const matches = matchFiles(["./src/auth/../auth/login.ts"], index);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.matches[0]?.changedFile).toBe("src/auth/login.ts");
		expect(matches[0]?.matches[0]?.source).toBe("<local>");
	});

	test("matches only rules for the given source", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_005",
				docPath: "docs/backend.md",
				rules: [{ op: "file", source: "backend", path: "src/auth/login.ts" }],
			},
			{
				docId: "DOC_006",
				docPath: "docs/frontend.md",
				rules: [{ op: "file", source: "frontend", path: "src/auth/login.ts" }],
			},
		];
		const index = buildAttentionIndex(docs);
		const backendMatches = matchFiles(["src/auth/login.ts"], index, "backend");
		const frontendMatches = matchFiles(["src/auth/login.ts"], index, "frontend");

		expect(backendMatches).toHaveLength(1);
		expect(backendMatches[0]?.docId).toBe("DOC_005");
		expect(backendMatches[0]?.matches[0]?.source).toBe("backend");

		expect(frontendMatches).toHaveLength(1);
		expect(frontendMatches[0]?.docId).toBe("DOC_006");
		expect(frontendMatches[0]?.matches[0]?.source).toBe("frontend");
	});
});
