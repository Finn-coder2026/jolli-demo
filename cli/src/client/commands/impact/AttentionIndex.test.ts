import { describe, expect, test } from "vitest";
import { buildAttentionIndex, LOCAL_SOURCE_NAME } from "./AttentionIndex";
import type { DocAttention } from "./AttentionParser";

describe("AttentionIndex", () => {
	test("indexes exact and glob patterns with normalization", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_001",
				docPath: "./docs/auth/guide.md",
				rules: [
					{ op: "file", path: "./src/auth/../auth/login.ts" },
					{ op: "file", path: "src/auth/**/*.ts" },
					{ op: "file", path: "src/{auth,users}/*.ts" },
				],
			},
		];

		const index = buildAttentionIndex(docs);
		const localIndex = index.bySource.get(LOCAL_SOURCE_NAME);
		expect(localIndex?.exact.has("src/auth/login.ts")).toBe(true);
		expect(localIndex?.globs.map(entry => entry.pattern)).toEqual([
			"src/auth/**/*.ts",
			"src/{auth,users}/*.ts",
		]);
	});

	test("normalizes backslashes and leading slashes", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_002",
				docPath: "\\docs\\path\\file.md",
				rules: [{ op: "file", path: "\\src\\auth\\login.ts" }],
			},
		];

		const index = buildAttentionIndex(docs);
		const localIndex = index.bySource.get(LOCAL_SOURCE_NAME);
		expect(localIndex?.exact.has("src/auth/login.ts")).toBe(true);
	});

	test("groups rules by source", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_003",
				docPath: "docs/auth.md",
				rules: [
					{ op: "file", source: "backend", path: "src/auth/login.ts" },
					{ op: "file", source: "frontend", path: "src/components/Login.tsx" },
					{ op: "file", path: "docs/api/auth.md" },
				],
			},
		];

		const index = buildAttentionIndex(docs);
		expect(index.bySource.get("backend")?.exact.has("src/auth/login.ts")).toBe(true);
		expect(index.bySource.get("frontend")?.exact.has("src/components/Login.tsx")).toBe(true);
		expect(index.bySource.get(LOCAL_SOURCE_NAME)?.exact.has("docs/api/auth.md")).toBe(true);
	});
});
