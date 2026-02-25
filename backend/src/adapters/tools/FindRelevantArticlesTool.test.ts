import type { DocDao } from "../../dao/DocDao";
import type { SpaceDao } from "../../dao/SpaceDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import {
	createFindRelevantArticlesToolDefinition,
	executeFindRelevantArticlesTool,
	findRelevantArticlesArgsSchema,
} from "./FindRelevantArticlesTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("FindRelevantArticlesTool", () => {
	const userId = 42;
	let deps: AgentHubToolDeps;
	let mockPermissionService: PermissionService;
	let mockDocDao: DocDao;
	let mockSpaceDao: SpaceDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
		mockDocDao = mocks.mockDocDao;
		mockSpaceDao = mocks.mockSpaceDao;
	});

	// ─── Schema ────────────────────────────────────────────────────────

	describe("findRelevantArticlesArgsSchema", () => {
		it("accepts valid args with required fields only", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({ query: "test" }).success).toBe(true);
		});

		it("accepts valid args with optional spaceId", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({ query: "test", spaceId: 1 }).success).toBe(true);
		});

		it("accepts valid args with optional maxResults", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({ query: "test", maxResults: 5 }).success).toBe(true);
		});

		it("rejects maxResults below 1", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({ query: "test", maxResults: 0 }).success).toBe(false);
		});

		it("rejects maxResults above 50", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({ query: "test", maxResults: 51 }).success).toBe(false);
		});

		it("rejects when query is missing", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({}).success).toBe(false);
		});

		it("rejects when query is empty string", () => {
			expect(findRelevantArticlesArgsSchema.safeParse({ query: "" }).success).toBe(false);
		});
	});

	// ─── Definition ────────────────────────────────────────────────────

	describe("createFindRelevantArticlesToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createFindRelevantArticlesToolDefinition();
			expect(def.name).toBe("find_relevant_articles");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
			expect(def.parameters.required).toEqual(["query"]);
		});
	});

	// ─── Permissions ───────────────────────────────────────────────────

	describe("permissions", () => {
		it("returns permission denied when user lacks articles.view", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "test" });

			expect(result).toBe("You do not have permission to view articles.");
			expect(mockPermissionService.hasPermission).toHaveBeenCalledWith(userId, "articles.view");
		});
	});

	// ─── With spaceId ──────────────────────────────────────────────────

	describe("with spaceId", () => {
		beforeEach(() => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
		});

		it("returns rich results from a single space", async () => {
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "getting-started",
							contentMetadata: { title: "Getting Started" },
							spaceId: 1,
							jrn: "jrn:doc:10",
							path: "/getting-started",
						},
						contentSnippet: "Welcome to <b>Jolli</b>",
						matchType: "both",
						relevance: 0.95,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, {
				query: "getting started",
				spaceId: 1,
			});
			const parsed = JSON.parse(result);

			expect(mockDocDao.searchInSpace).toHaveBeenCalledWith(1, "getting started");
			expect(parsed.results).toHaveLength(1);
			expect(parsed.results[0]).toEqual({
				id: 10,
				title: "Getting Started",
				spaceId: 1,
				spaceName: "",
				jrn: "jrn:doc:10",
				path: "/getting-started",
				contentSnippet: "Welcome to <b>Jolli</b>",
				matchType: "both",
				relevance: 0.95,
			});
			expect(parsed.total).toBe(1);
		});

		it("handles no matches", async () => {
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [],
				total: 0,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "nonexistent", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(0);
			expect(parsed.total).toBe(0);
		});

		it("respects custom maxResults", async () => {
			const manyResults = Array.from({ length: 10 }, (_, i) => ({
				doc: {
					id: i,
					slug: `article-${i}`,
					contentMetadata: { title: `Article ${i}` },
					spaceId: 1,
					jrn: `jrn:doc:${i}`,
					path: `/article-${i}`,
				},
				contentSnippet: `Snippet ${i}`,
				matchType: "content" as const,
				relevance: 1 - i * 0.01,
			}));

			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: manyResults as never,
				total: 10,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, {
				query: "article",
				spaceId: 1,
				maxResults: 3,
			});
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(3);
			expect(parsed.total).toBe(10);
		});

		it("caps results at 20", async () => {
			const manyResults = Array.from({ length: 25 }, (_, i) => ({
				doc: {
					id: i,
					slug: `article-${i}`,
					contentMetadata: { title: `Article ${i}` },
					spaceId: 1,
					jrn: `jrn:doc:${i}`,
					path: `/article-${i}`,
				},
				contentSnippet: `Snippet ${i}`,
				matchType: "content" as const,
				relevance: 1 - i * 0.01,
			}));

			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: manyResults as never,
				total: 25,
				limited: true,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "article", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(20);
			expect(parsed.total).toBe(25);
		});
	});

	// ─── Without spaceId (cross-space) ─────────────────────────────────

	describe("without spaceId (cross-space)", () => {
		beforeEach(() => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
		});

		it("returns message when no spaces exist", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([]);

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "test" });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(0);
			expect(parsed.total).toBe(0);
			expect(parsed.message).toBe("No spaces found.");
		});

		it("searches across all spaces and merges results", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Engineering", slug: "engineering", description: null } as never,
				{ id: 2, name: "Marketing", slug: "marketing", description: null } as never,
			]);

			vi.mocked(mockDocDao.searchInSpace)
				.mockResolvedValueOnce({
					results: [
						{
							doc: {
								id: 10,
								slug: "api-guide",
								contentMetadata: { title: "API Guide" },
								spaceId: 1,
								jrn: "jrn:doc:10",
								path: "/api-guide",
							},
							contentSnippet: "REST API docs",
							matchType: "content" as const,
							relevance: 0.8,
						},
					] as never,
					total: 1,
					limited: false,
				})
				.mockResolvedValueOnce({
					results: [
						{
							doc: {
								id: 20,
								slug: "api-blog",
								contentMetadata: { title: "API Blog Post" },
								spaceId: 2,
								jrn: "jrn:doc:20",
								path: "/api-blog",
							},
							contentSnippet: "New API features",
							matchType: "title" as const,
							relevance: 0.9,
						},
					] as never,
					total: 1,
					limited: false,
				});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "API" });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(2);
			expect(parsed.total).toBe(2);
			// Sorted by relevance desc — Marketing result first (0.9 > 0.8)
			expect(parsed.results[0].title).toBe("API Blog Post");
			expect(parsed.results[0].spaceName).toBe("Marketing");
			expect(parsed.results[1].title).toBe("API Guide");
			expect(parsed.results[1].spaceName).toBe("Engineering");
		});

		it("handles no matches across all spaces", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Engineering", slug: "engineering", description: null } as never,
			]);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [],
				total: 0,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "nonexistent" });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(0);
			expect(parsed.total).toBe(0);
		});

		it("respects custom maxResults in cross-space mode", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Eng", slug: "eng", description: null } as never,
			]);
			const results = Array.from({ length: 10 }, (_, i) => ({
				doc: {
					id: i,
					slug: `a-${i}`,
					contentMetadata: { title: `A ${i}` },
					spaceId: 1,
					jrn: `jrn:doc:${i}`,
					path: `/a-${i}`,
				},
				contentSnippet: `S ${i}`,
				matchType: "content" as const,
				relevance: 1 - i * 0.01,
			}));
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: results as never,
				total: 10,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "a", maxResults: 2 });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(2);
			expect(parsed.total).toBe(10);
		});

		it("caps merged results at 20", async () => {
			const spaces = Array.from({ length: 3 }, (_, i) => ({
				id: i + 1,
				name: `Space ${i + 1}`,
				slug: `space-${i + 1}`,
				description: null,
			}));
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue(spaces as never);

			// Each space returns 10 results = 30 total, should be capped to 20
			for (let s = 0; s < 3; s++) {
				const results = Array.from({ length: 10 }, (_, i) => ({
					doc: {
						id: s * 100 + i,
						slug: `article-${s}-${i}`,
						contentMetadata: { title: `Article ${s}-${i}` },
						spaceId: s + 1,
						jrn: `jrn:doc:${s * 100 + i}`,
						path: `/article-${s}-${i}`,
					},
					contentSnippet: `Snippet ${s}-${i}`,
					matchType: "content" as const,
					relevance: 0.5 + Math.random() * 0.5,
				}));
				vi.mocked(mockDocDao.searchInSpace).mockResolvedValueOnce({
					results: results as never,
					total: 10,
					limited: false,
				});
			}

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "article" });
			const parsed = JSON.parse(result);

			expect(parsed.results).toHaveLength(20);
			expect(parsed.total).toBe(30);
		});
	});

	// ─── Edge cases ────────────────────────────────────────────────────

	describe("edge cases", () => {
		beforeEach(() => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
		});

		it("falls back to slug when contentMetadata title is missing", async () => {
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 30,
							slug: "fallback-slug",
							contentMetadata: undefined,
							spaceId: 1,
							jrn: "jrn:doc:30",
							path: "/fallback-slug",
						},
						contentSnippet: "",
						matchType: "content" as const,
						relevance: 0.5,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "fallback", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.results[0].title).toBe("fallback-slug");
		});

		it("handles empty content snippet", async () => {
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 40,
							slug: "no-snippet",
							contentMetadata: { title: "No Snippet" },
							spaceId: 1,
							jrn: "jrn:doc:40",
							path: "/no-snippet",
						},
						contentSnippet: "",
						matchType: "title" as const,
						relevance: 0.7,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeFindRelevantArticlesTool(deps, userId, { query: "no snippet", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.results[0].contentSnippet).toBe("");
		});
	});
});
