import { describe, expect, test } from "vitest";
import type { DocAttention } from "./AttentionParser";
import type { RawFileChange } from "./Types";
import { buildImpactMatches, collectChangedFiles, selectImpactSources } from "./search";

describe("impact search helpers", () => {
	test("collectChangedFiles includes renamed old and new paths", () => {
		const changes: Array<RawFileChange> = [
			{ status: "renamed", file: "src/new.ts", oldFile: "src/old.ts" },
		];
		const files = collectChangedFiles(changes);
		expect(files).toContain("src/new.ts");
		expect(files).toContain("src/old.ts");
	});

	test("buildImpactMatches uses renamed paths for matching", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_RENAME",
				docPath: "docs/rename.md",
				rules: [{ op: "file", path: "src/old.ts" }],
			},
		];
		const changes: Array<RawFileChange> = [
			{ status: "renamed", file: "src/new.ts", oldFile: "src/old.ts" },
		];
		const matches = buildImpactMatches(docs, changes);
		expect(matches).toHaveLength(1);
		expect(matches[0]?.matches[0]?.changedFile).toBe("src/old.ts");
		expect(matches[0]?.matches[0]?.source).toBe("<local>");
	});

	test("buildImpactMatches respects per-source attention rules", () => {
		const docs: Array<DocAttention> = [
			{
				docId: "DOC_BACKEND",
				docPath: "docs/backend.md",
				rules: [{ op: "file", source: "backend", path: "src/auth/login.ts" }],
			},
			{
				docId: "DOC_FRONTEND",
				docPath: "docs/frontend.md",
				rules: [{ op: "file", source: "frontend", path: "src/auth/login.ts" }],
			},
		];
		const changes = [
			{ status: "modified" as const, file: "src/auth/login.ts", source: "backend" },
			{ status: "modified" as const, file: "src/auth/login.ts", source: "frontend" },
		];
		const matches = buildImpactMatches(docs, changes);

		expect(matches).toHaveLength(2);
		expect(matches.find(match => match.docId === "DOC_BACKEND")?.matches[0]?.source).toBe("backend");
		expect(matches.find(match => match.docId === "DOC_FRONTEND")?.matches[0]?.source).toBe("frontend");
	});

	test("selectImpactSources filters to requested source", () => {
		const resolved = {
			sources: [
				{ source: "<local>", repoRoot: "/tmp/local" },
				{ source: "backend", repoRoot: "/tmp/backend" },
			],
			warnings: ['Source "frontend" is referenced by attention rules but missing from .jolli/sources.json; skipping.'],
			referencedSources: ["<local>", "backend", "frontend"],
			unresolvedSources: [
				{
					source: "frontend",
					warning: 'Source "frontend" is referenced by attention rules but missing from .jolli/sources.json; skipping.',
				},
			],
		};

		const selected = selectImpactSources(resolved, {
			source: "backend",
			commandName: "impact search",
		});

		expect(selected.sources).toEqual([{ source: "backend", repoRoot: "/tmp/backend" }]);
		expect(selected.warnings).toEqual([]);
		expect(selected.selectedSource).toBe("backend");
	});

	test("selectImpactSources supports local alias", () => {
		const resolved = {
			sources: [{ source: "<local>", repoRoot: "/tmp/local" }],
			warnings: [],
			referencedSources: ["<local>"],
			unresolvedSources: [],
		};

		const selected = selectImpactSources(resolved, {
			source: "local",
			commandName: "impact search",
		});

		expect(selected.sources).toHaveLength(1);
		expect(selected.sources[0]?.source).toBe("<local>");
		expect(selected.selectedSource).toBe("<local>");
	});

	test("selectImpactSources throws for unknown requested source", () => {
		const resolved = {
			sources: [{ source: "<local>", repoRoot: "/tmp/local" }],
			warnings: [],
			referencedSources: ["<local>"],
			unresolvedSources: [],
		};

		expect(() =>
			selectImpactSources(resolved, {
				source: "backend",
				commandName: "impact search",
			}),
		).toThrow('Source "backend" is not referenced by any attention rule.');
	});

	test("selectImpactSources throws in strict mode when unresolved sources exist", () => {
		const warning = 'Source "backend" is referenced by attention rules but missing from .jolli/sources.json; skipping.';
		const resolved = {
			sources: [{ source: "<local>", repoRoot: "/tmp/local" }],
			warnings: [warning],
			referencedSources: ["<local>", "backend"],
			unresolvedSources: [{ source: "backend", warning }],
		};

		expect(() =>
			selectImpactSources(resolved, {
				strict: true,
				commandName: "impact search",
			}),
		).toThrow("impact search failed in strict mode");
	});

	test("selectImpactSources strict mode only validates selected source", () => {
		const warning = 'Source "frontend" is referenced by attention rules but missing from .jolli/sources.json; skipping.';
		const resolved = {
			sources: [
				{ source: "<local>", repoRoot: "/tmp/local" },
				{ source: "backend", repoRoot: "/tmp/backend" },
			],
			warnings: [warning],
			referencedSources: ["<local>", "backend", "frontend"],
			unresolvedSources: [{ source: "frontend", warning }],
		};

		const selected = selectImpactSources(resolved, {
			source: "backend",
			strict: true,
			commandName: "impact search",
		});

		expect(selected.sources).toEqual([{ source: "backend", repoRoot: "/tmp/backend" }]);
		expect(selected.warnings).toEqual([]);
	});
});
