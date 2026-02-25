import {
	advanceToNextDepth,
	buildInitialPropagationState,
	createEmptyResult,
	createSkippedAuditEntry,
	filterProcessableArticles,
	findDependentArticles,
	getPhase1Updates,
	getUpdatesFromRecord,
	mergeResults,
	type DependentArticleMatch,
	type Phase1Update,
	type PropagationResult,
} from "./Propagation";
import type { DocAttention } from "./AttentionParser";
import type { ImpactAuditLog, ImpactAuditRecord } from "./AuditTrail";
import { createPropagationState, type PropagationState } from "./CycleDetector";
import { describe, expect, test } from "vitest";

describe("Propagation", () => {
	describe("createEmptyResult", () => {
		test("creates result with empty arrays and given depth", () => {
			const result = createEmptyResult(3);
			expect(result.articlesUpdated).toEqual([]);
			expect(result.articlesUnchanged).toEqual([]);
			expect(result.articlesSkipped).toEqual([]);
			expect(result.articlesError).toEqual([]);
			expect(result.cyclesDetected).toEqual([]);
			expect(result.maxDepthReached).toBe(false);
			expect(result.depth).toBe(3);
		});
	});

	describe("mergeResults", () => {
		test("merges two results", () => {
			const a: PropagationResult = {
				articlesUpdated: ["a.md"],
				articlesUnchanged: ["b.md"],
				articlesSkipped: ["c.md"],
				articlesError: ["d.md"],
				cyclesDetected: ["DOC_001"],
				maxDepthReached: false,
				depth: 1,
			};
			const b: PropagationResult = {
				articlesUpdated: ["e.md"],
				articlesUnchanged: ["f.md"],
				articlesSkipped: [],
				articlesError: [],
				cyclesDetected: ["DOC_002"],
				maxDepthReached: true,
				depth: 2,
			};

			const merged = mergeResults(a, b);
			expect(merged.articlesUpdated).toEqual(["a.md", "e.md"]);
			expect(merged.articlesUnchanged).toEqual(["b.md", "f.md"]);
			expect(merged.articlesSkipped).toEqual(["c.md"]);
			expect(merged.articlesError).toEqual(["d.md"]);
			expect(merged.cyclesDetected).toEqual(["DOC_001", "DOC_002"]);
			expect(merged.maxDepthReached).toBe(true);
			expect(merged.depth).toBe(2);
		});

		test("keeps false for maxDepthReached when neither is true", () => {
			const a = createEmptyResult(1);
			const b = createEmptyResult(1);
			const merged = mergeResults(a, b);
			expect(merged.maxDepthReached).toBe(false);
		});
	});

	describe("getPhase1Updates", () => {
		test("returns empty array for empty audit log", () => {
			const log: ImpactAuditLog = { version: 1, records: [] };
			const updates = getPhase1Updates(log);
			expect(updates).toEqual([]);
		});

		test("returns empty array when no git records exist", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "sync-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: [] },
						articles: [{ jrn: "DOC_001", path: "docs/a.md", status: "updated", evidence: [] }],
					},
				],
			};
			const updates = getPhase1Updates(log);
			expect(updates).toEqual([]);
		});

		test("returns updated articles from latest git record", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "git-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [
							{
								jrn: "DOC_001",
								path: "docs/a.md",
								status: "updated",
								evidence: [],
								patch: "@@ -1 +1 @@\n-old\n+new",
							},
							{ jrn: "DOC_002", path: "docs/b.md", status: "skipped", evidence: [] },
							{
								jrn: "DOC_003",
								path: "docs/c.md",
								status: "updated",
								evidence: [],
								patch: "@@ -5 +5 @@\n-foo\n+bar",
							},
						],
					},
				],
			};

			const updates = getPhase1Updates(log);
			expect(updates).toHaveLength(2);
			expect(updates[0]).toEqual({
				path: "docs/a.md",
				jrn: "DOC_001",
				diff: "@@ -1 +1 @@\n-old\n+new",
			});
			expect(updates[1]).toEqual({
				path: "docs/c.md",
				jrn: "DOC_003",
				diff: "@@ -5 +5 @@\n-foo\n+bar",
			});
		});

		test("ignores sync records and uses latest git record", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "git-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [{ jrn: "DOC_001", path: "docs/a.md", status: "updated", evidence: [] }],
					},
					{
						id: "sync-1",
						timestamp: "2024-01-15T11:00:00Z",
						source: "sync",
						trigger: { commits: [], changedFiles: [] },
						articles: [{ jrn: "DOC_002", path: "docs/b.md", status: "updated", evidence: [] }],
					},
				],
			};

			const updates = getPhase1Updates(log);
			expect(updates).toHaveLength(1);
			expect(updates[0]?.jrn).toBe("DOC_001");
		});

		test("handles articles without patches", () => {
			const log: ImpactAuditLog = {
				version: 1,
				records: [
					{
						id: "git-1",
						timestamp: "2024-01-15T10:00:00Z",
						source: "git",
						trigger: { commits: [], changedFiles: [] },
						articles: [{ jrn: "DOC_001", path: "docs/a.md", status: "updated", evidence: [] }],
					},
				],
			};

			const updates = getPhase1Updates(log);
			expect(updates).toHaveLength(1);
			expect(updates[0]?.diff).toBeUndefined();
		});
	});

	describe("getUpdatesFromRecord", () => {
		test("returns updated articles from a record", () => {
			const record: ImpactAuditRecord = {
				id: "test",
				timestamp: "2024-01-15T10:00:00Z",
				source: "git",
				trigger: { commits: [], changedFiles: [] },
				articles: [
					{ jrn: "DOC_001", path: "docs/a.md", status: "updated", evidence: [], patch: "diff1" },
					{ jrn: "DOC_002", path: "docs/b.md", status: "skipped", evidence: [] },
					{ jrn: "DOC_003", path: "docs/c.md", status: "updated", evidence: [], patch: "diff2" },
				],
			};

			const updates = getUpdatesFromRecord(record);
			expect(updates).toHaveLength(2);
			expect(updates[0]?.jrn).toBe("DOC_001");
			expect(updates[1]?.jrn).toBe("DOC_003");
		});
	});

	describe("findDependentArticles", () => {
		const createMockDoc = (docId: string, docPath: string, attentionPaths: Array<string>): DocAttention => ({
			docId,
			docPath,
			rules: attentionPaths.map(p => ({ op: "file" as const, path: p })),
		});

		test("returns empty array when no updated articles", () => {
			const docs: Array<DocAttention> = [createMockDoc("DOC_001", "docs/a.md", ["docs/b.md"])];
			const state = createPropagationState();
			const dependents = findDependentArticles([], docs, state);
			expect(dependents).toEqual([]);
		});

		test("finds articles watching updated articles", () => {
			const docs: Array<DocAttention> = [
				createMockDoc("DOC_001", "docs/a.md", ["src/**/*.ts"]), // Watches code, not articles
				createMockDoc("DOC_002", "docs/b.md", ["docs/a.md"]), // Watches a.md
				createMockDoc("DOC_003", "docs/c.md", ["docs/a.md", "docs/b.md"]), // Watches a.md and b.md
			];

			const updatedArticles: Array<Phase1Update> = [{ path: "docs/a.md", jrn: "DOC_001", diff: "..." }];

			const state = createPropagationState();
			const dependents = findDependentArticles(updatedArticles, docs, state);

			expect(dependents).toHaveLength(2);
			expect(dependents.map(d => d.docId).sort()).toEqual(["DOC_002", "DOC_003"]);
		});

		test("filters out self-references", () => {
			const docs: Array<DocAttention> = [
				createMockDoc("DOC_001", "docs/a.md", ["docs/a.md", "docs/b.md"]), // Self-reference
				createMockDoc("DOC_002", "docs/b.md", ["docs/a.md"]),
			];

			const updatedArticles: Array<Phase1Update> = [{ path: "docs/a.md", jrn: "DOC_001", diff: "..." }];

			const state = createPropagationState();
			const dependents = findDependentArticles(updatedArticles, docs, state);

			expect(dependents).toHaveLength(1);
			expect(dependents[0]?.docId).toBe("DOC_002");
		});

		test("filters out already-visited articles", () => {
			const docs: Array<DocAttention> = [
				createMockDoc("DOC_002", "docs/b.md", ["docs/a.md"]),
				createMockDoc("DOC_003", "docs/c.md", ["docs/a.md"]),
			];

			const updatedArticles: Array<Phase1Update> = [{ path: "docs/a.md", jrn: "DOC_001", diff: "..." }];

			const state: PropagationState = {
				visited: new Set(["DOC_002"]), // Already visited
				depth: 0,
				maxDepth: 5,
				path: [],
			};

			const dependents = findDependentArticles(updatedArticles, docs, state);

			expect(dependents).toHaveLength(1);
			expect(dependents[0]?.docId).toBe("DOC_003");
		});

		test("includes triggering articles in match", () => {
			const docs: Array<DocAttention> = [
				createMockDoc("DOC_002", "docs/b.md", ["docs/a.md", "docs/c.md"]),
			];

			const updatedArticles: Array<Phase1Update> = [
				{ path: "docs/a.md", jrn: "DOC_001", diff: "diff1" },
				{ path: "docs/c.md", jrn: "DOC_003", diff: "diff2" },
			];

			const state = createPropagationState();
			const dependents = findDependentArticles(updatedArticles, docs, state);

			expect(dependents).toHaveLength(1);
			expect(dependents[0]?.triggeringArticles).toHaveLength(2);
		});

		test("handles glob patterns for article paths", () => {
			const docs: Array<DocAttention> = [
				createMockDoc("DOC_002", "docs/guide/overview.md", ["docs/api/*.md"]),
			];

			const updatedArticles: Array<Phase1Update> = [
				{ path: "docs/api/auth.md", jrn: "DOC_001", diff: "..." },
			];

			const state = createPropagationState();
			const dependents = findDependentArticles(updatedArticles, docs, state);

			expect(dependents).toHaveLength(1);
			expect(dependents[0]?.docId).toBe("DOC_002");
		});
	});

	describe("filterProcessableArticles", () => {
		const createMatch = (docId: string, docPath: string): DependentArticleMatch => ({
			docId,
			docPath,
			triggeringArticles: [],
			evidence: [],
		});

		test("allows unvisited articles", () => {
			const articles = [createMatch("DOC_001", "a.md"), createMatch("DOC_002", "b.md")];
			const state = createPropagationState();

			const { processable, cyclesDetected, maxDepthReached } = filterProcessableArticles(articles, state);

			expect(processable).toHaveLength(2);
			expect(cyclesDetected).toHaveLength(0);
			expect(maxDepthReached).toBe(false);
		});

		test("detects cycles for visited articles", () => {
			const articles = [createMatch("DOC_001", "a.md"), createMatch("DOC_002", "b.md")];
			const state: PropagationState = {
				visited: new Set(["DOC_001"]),
				depth: 0,
				maxDepth: 5,
				path: [],
			};

			const { processable, cyclesDetected, maxDepthReached } = filterProcessableArticles(articles, state);

			expect(processable).toHaveLength(1);
			expect(processable[0]?.docId).toBe("DOC_002");
			expect(cyclesDetected).toEqual(["DOC_001"]);
			expect(maxDepthReached).toBe(false);
		});

		test("detects max depth reached", () => {
			const articles = [createMatch("DOC_001", "a.md")];
			const state: PropagationState = {
				visited: new Set(),
				depth: 5,
				maxDepth: 5,
				path: [],
			};

			const { processable, cyclesDetected, maxDepthReached } = filterProcessableArticles(articles, state);

			expect(processable).toHaveLength(0);
			expect(cyclesDetected).toHaveLength(0);
			expect(maxDepthReached).toBe(true);
		});
	});

	describe("createSkippedAuditEntry", () => {
		test("creates audit entry with correct structure", () => {
			const match: DependentArticleMatch = {
				docId: "DOC_001",
				docPath: "docs/a.md",
				triggeringArticles: [{ path: "docs/b.md", jrn: "DOC_002", diff: "..." }],
				evidence: [{ changedFile: "docs/b.md", pattern: "docs/b.md", matchType: "exact", source: "<local>" }],
			};

			const entry = createSkippedAuditEntry(match, "Cycle detected");

			expect(entry.jrn).toBe("DOC_001");
			expect(entry.path).toBe("docs/a.md");
			expect(entry.status).toBe("skipped");
			expect(entry.reasoning).toBe("Cycle detected");
			expect(entry.evidence).toHaveLength(1);
		});
	});

	describe("buildInitialPropagationState", () => {
		test("creates state with Phase 1 articles marked as visited", () => {
			const phase1Updates: Array<Phase1Update> = [
				{ path: "docs/a.md", jrn: "DOC_001", diff: "..." },
				{ path: "docs/b.md", jrn: "DOC_002", diff: "..." },
			];

			const state = buildInitialPropagationState(phase1Updates, 5);

			expect(state.visited.has("DOC_001")).toBe(true);
			expect(state.visited.has("DOC_002")).toBe(true);
			expect(state.visited.size).toBe(2);
			expect(state.depth).toBe(0);
			expect(state.maxDepth).toBe(5);
		});

		test("uses custom maxDepth", () => {
			const state = buildInitialPropagationState([], 10);
			expect(state.maxDepth).toBe(10);
		});
	});

	describe("advanceToNextDepth", () => {
		test("increments depth and adds processed JRNs to visited", () => {
			const state = createPropagationState(5);
			const newState = advanceToNextDepth(state, ["DOC_001", "DOC_002"]);

			expect(newState.depth).toBe(1);
			expect(newState.visited.has("DOC_001")).toBe(true);
			expect(newState.visited.has("DOC_002")).toBe(true);
		});

		test("preserves maxDepth", () => {
			const state = createPropagationState(10);
			const newState = advanceToNextDepth(state, ["DOC_001"]);
			expect(newState.maxDepth).toBe(10);
		});

		test("does not mutate original state", () => {
			const state = createPropagationState(5);
			advanceToNextDepth(state, ["DOC_001"]);
			expect(state.visited.size).toBe(0);
			expect(state.depth).toBe(0);
		});
	});
});
