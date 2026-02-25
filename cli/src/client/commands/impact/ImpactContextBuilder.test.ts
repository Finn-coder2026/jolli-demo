import type { FileMatch } from "./FileMatcher";
import {
	buildImpactContext,
	buildInitialMessage,
	buildPropagationContext,
	convertEvidence,
	extractCommits,
	extractRelevantChanges,
	formatDiffsForMessage,
	isArticlePropagation,
} from "./ImpactContextBuilder";
import type { ImpactReport } from "./Types";
import { describe, expect, test } from "vitest";

describe("ImpactContextBuilder", () => {
	const createTestReport = (): ImpactReport => ({
		branch: "feature/test",
		base: "origin/main",
		summary: "",
		queryText: "",
		commits: [
			{
				sha: "abc1234",
				message: "Add new feature",
				author: "test@example.com",
				summary: "",
				hunks: [
						{
							file: "src/auth/login.ts",
							source: "<local>",
							status: "modified",
							context: "function login",
							diff: "-old code\n+new code",
							queryText: "",
						},
						{
							file: "src/auth/oauth.ts",
							source: "<local>",
							status: "added",
							context: "function oauth",
							diff: "+new oauth code",
							queryText: "",
					},
				],
			},
			{
				sha: "def5678",
				message: "Fix bug",
				author: "test@example.com",
				summary: "",
				hunks: [
						{
							file: "src/auth/login.ts",
							source: "<local>",
							status: "modified",
							context: "function login",
							diff: "-bug\n+fix",
							queryText: "",
					},
				],
			},
		],
	});

	const createTestArticle = (): FileMatch => ({
		docId: "AUTH_DOC_001",
		docPath: "docs/auth/guide.md",
		matches: [
				{
					changedFile: "src/auth/login.ts",
					pattern: "src/auth/**/*.ts",
					matchType: "glob",
					source: "<local>",
				},
				{
					changedFile: "src/auth/oauth.ts",
					pattern: "src/auth/**/*.ts",
					matchType: "glob",
					source: "<local>",
				},
			],
		});

	describe("extractRelevantChanges", () => {
		test("extracts changes for matched files", () => {
			const report = createTestReport();
			const article = createTestArticle();

			const changes = extractRelevantChanges(report, article.matches);

			expect(changes).toHaveLength(2);
			expect(changes.map(c => c.path).sort()).toEqual(["src/auth/login.ts", "src/auth/oauth.ts"]);
		});

		test("combines diffs from multiple commits for same file", () => {
			const report = createTestReport();
			const article = createTestArticle();

			const changes = extractRelevantChanges(report, article.matches);

			const loginChange = changes.find(c => c.path === "src/auth/login.ts");
			expect(loginChange?.diff).toContain("-old code");
			expect(loginChange?.diff).toContain("+new code");
			expect(loginChange?.diff).toContain("-bug");
			expect(loginChange?.diff).toContain("+fix");
		});

		test("preserves file status", () => {
			const report = createTestReport();
			const article = createTestArticle();

			const changes = extractRelevantChanges(report, article.matches);

			const loginChange = changes.find(c => c.path === "src/auth/login.ts");
			const oauthChange = changes.find(c => c.path === "src/auth/oauth.ts");

			expect(loginChange?.status).toBe("modified");
			expect(oauthChange?.status).toBe("added");
		});

		test("handles files with no hunks", () => {
			const report = createTestReport();
			const evidence = [
					{
						changedFile: "src/nonexistent.ts",
						pattern: "src/*.ts",
						matchType: "glob" as const,
						source: "<local>",
					},
				];

			const changes = extractRelevantChanges(report, evidence);

			expect(changes).toHaveLength(1);
			expect(changes[0]?.path).toBe("src/nonexistent.ts");
			expect(changes[0]?.diff).toBe("");
		});

		test("deduplicates files", () => {
			const report = createTestReport();
			const evidence = [
					{
						changedFile: "src/auth/login.ts",
						pattern: "src/auth/*.ts",
						matchType: "glob" as const,
						source: "<local>",
					},
					{
						changedFile: "src/auth/login.ts",
						pattern: "src/**/*.ts",
						matchType: "glob" as const,
						source: "<local>",
					},
				];

			const changes = extractRelevantChanges(report, evidence);

			expect(changes).toHaveLength(1);
		});

		test("sorts changes by path", () => {
			const report = createTestReport();
				const evidence = [
					{ changedFile: "src/z.ts", pattern: "src/*.ts", matchType: "glob" as const, source: "<local>" },
					{ changedFile: "src/a.ts", pattern: "src/*.ts", matchType: "glob" as const, source: "<local>" },
					{ changedFile: "src/m.ts", pattern: "src/*.ts", matchType: "glob" as const, source: "<local>" },
				];

			const changes = extractRelevantChanges(report, evidence);

			expect(changes.map(c => c.path)).toEqual(["src/a.ts", "src/m.ts", "src/z.ts"]);
		});
	});

	describe("extractCommits", () => {
		test("extracts commit info", () => {
			const report = createTestReport();

			const commits = extractCommits(report);

			expect(commits).toHaveLength(2);
			expect(commits[0]).toEqual({ sha: "abc1234", message: "Add new feature" });
			expect(commits[1]).toEqual({ sha: "def5678", message: "Fix bug" });
		});

		test("handles empty commits", () => {
			const report: ImpactReport = {
				branch: "test",
				base: "main",
				summary: "",
				queryText: "",
				commits: [],
			};

			const commits = extractCommits(report);

			expect(commits).toEqual([]);
		});
	});

	describe("convertEvidence", () => {
		test("converts evidence entries", () => {
				const evidence = [
					{ changedFile: "src/a.ts", pattern: "src/*.ts", matchType: "glob" as const, source: "<local>" },
					{ changedFile: "src/b.ts", pattern: "src/b.ts", matchType: "exact" as const, source: "<local>" },
				];

			const converted = convertEvidence(evidence);

			expect(converted).toHaveLength(2);
				expect(converted[0]).toEqual({
					changedFile: "src/a.ts",
					pattern: "src/*.ts",
					matchType: "glob",
					source: "<local>",
				});
			});
		});

	describe("buildImpactContext", () => {
		test("builds complete context", () => {
			const report = createTestReport();
			const article = createTestArticle();

			const context = buildImpactContext(article, report);

			expect(context.article).toEqual({
				path: "docs/auth/guide.md",
				jrn: "AUTH_DOC_001",
			});
			expect(context.changes).toHaveLength(2);
			expect(context.commits).toHaveLength(2);
			expect(context.evidence).toHaveLength(2);
		});
	});

	describe("isArticlePropagation", () => {
		test("returns true when no commits (Phase 2)", () => {
			const context = {
				article: { path: "docs/test.md", jrn: "TEST_001" },
				changes: [{ path: "docs/other.md", status: "modified" as const, diff: "-old\n+new" }],
				commits: [],
				evidence: [],
			};

			expect(isArticlePropagation(context)).toBe(true);
		});

		test("returns false when commits exist (Phase 1)", () => {
			const context = {
				article: { path: "docs/test.md", jrn: "TEST_001" },
				changes: [{ path: "src/test.ts", status: "modified" as const, diff: "-old\n+new" }],
				commits: [{ sha: "abc123", message: "Test commit" }],
				evidence: [],
			};

			expect(isArticlePropagation(context)).toBe(false);
		});
	});

	describe("formatDiffsForMessage", () => {
		test("formats changes as markdown", () => {
			const context = {
				article: { path: "docs/test.md", jrn: "TEST_001" },
				changes: [{ path: "src/test.ts", status: "modified" as const, diff: "-old\n+new" }],
				commits: [{ sha: "abc123", message: "Test" }],
				evidence: [],
			};

			const formatted = formatDiffsForMessage(context);

			expect(formatted).toContain("### src/test.ts (modified)");
			expect(formatted).toContain("```diff");
			expect(formatted).toContain("-old");
			expect(formatted).toContain("+new");
		});

		test("handles empty code changes (Phase 1)", () => {
			const context = {
				article: { path: "docs/test.md", jrn: "TEST_001" },
				changes: [],
				commits: [{ sha: "abc123", message: "Test" }],
				evidence: [],
			};

			const formatted = formatDiffsForMessage(context);

			expect(formatted).toBe("No code changes to display.");
		});

		test("handles empty article changes (Phase 2)", () => {
			const context = {
				article: { path: "docs/test.md", jrn: "TEST_001" },
				changes: [],
				commits: [],
				evidence: [],
			};

			const formatted = formatDiffsForMessage(context);

			expect(formatted).toBe("No article changes to display.");
		});

		test("handles changes with no diff", () => {
			const context = {
				article: { path: "docs/test.md", jrn: "TEST_001" },
				changes: [{ path: "src/test.ts", status: "added" as const, diff: "" }],
				commits: [{ sha: "abc123", message: "Test" }],
				evidence: [],
			};

			const formatted = formatDiffsForMessage(context);

			expect(formatted).toContain("(No diff available)");
		});
	});

	describe("buildInitialMessage", () => {
		test("builds message for code changes (Phase 1)", () => {
			const context = {
				article: { path: "docs/auth/guide.md", jrn: "AUTH_001" },
				changes: [{ path: "src/auth/login.ts", status: "modified" as const, diff: "-old\n+new" }],
				commits: [{ sha: "abc123", message: "Test commit" }],
				evidence: [],
			};

			const message = buildInitialMessage(context);

			expect(message).toContain("docs/auth/guide.md");
			expect(message).toContain("Code Changes");
			expect(message).toContain("code changes");
			expect(message).toContain("src/auth/login.ts");
			expect(message).toContain("Read the article");
			expect(message).toContain("write_file");
		});

		test("builds message for article changes (Phase 2)", () => {
			const context = {
				article: { path: "docs/guide/overview.md", jrn: "GUIDE_001" },
				changes: [{ path: "docs/api/auth.md", status: "modified" as const, diff: "-old\n+new" }],
				commits: [], // No commits = Phase 2
				evidence: [],
			};

			const message = buildInitialMessage(context);

			expect(message).toContain("docs/guide/overview.md");
			expect(message).toContain("Source Article Changes");
			expect(message).toContain("article changes");
			expect(message).toContain("docs/api/auth.md");
			expect(message).toContain("updated terminology");
		});
	});

	describe("buildPropagationContext", () => {
		test("builds context with no commits (Phase 2)", () => {
			const context = buildPropagationContext(
				"docs/guide/overview.md",
				"GUIDE_001",
				[
					{ path: "docs/api/auth.md", jrn: "AUTH_001", diff: "-old\n+new" },
					{ path: "docs/api/users.md", jrn: "USERS_001", diff: "-foo\n+bar" },
				],
					[
						{ changedFile: "docs/api/auth.md", pattern: "docs/api/*.md", matchType: "glob", source: "<local>" },
						{
							changedFile: "docs/api/users.md",
							pattern: "docs/api/*.md",
							matchType: "glob",
							source: "<local>",
						},
					],
				);

			expect(context.article.path).toBe("docs/guide/overview.md");
			expect(context.article.jrn).toBe("GUIDE_001");
			expect(context.commits).toEqual([]);
			expect(context.changes).toHaveLength(2);
			expect(context.changes[0]?.path).toBe("docs/api/auth.md");
			expect(context.changes[0]?.diff).toBe("-old\n+new");
			expect(context.evidence).toHaveLength(2);
		});

		test("handles undefined diff", () => {
			const context = buildPropagationContext(
				"docs/test.md",
				"TEST_001",
				[{ path: "docs/source.md", jrn: "SOURCE_001", diff: undefined }],
				[],
			);

			expect(context.changes[0]?.diff).toBe("");
		});

		test("isArticlePropagation returns true for propagation context", () => {
			const context = buildPropagationContext(
				"docs/test.md",
				"TEST_001",
				[{ path: "docs/source.md", jrn: "SOURCE_001", diff: "..." }],
				[],
			);

			expect(isArticlePropagation(context)).toBe(true);
		});
	});
});
