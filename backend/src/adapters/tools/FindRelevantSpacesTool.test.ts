import type { DocDao } from "../../dao/DocDao";
import type { SpaceDao } from "../../dao/SpaceDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import {
	createFindRelevantSpacesToolDefinition,
	executeFindRelevantSpacesTool,
	findRelevantSpacesArgsSchema,
} from "./FindRelevantSpacesTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("FindRelevantSpacesTool", () => {
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

	describe("findRelevantSpacesArgsSchema", () => {
		it("accepts valid args with required fields only", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test" }).success).toBe(true);
		});

		it("accepts valid args with optional spaceId", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", spaceId: 1 }).success).toBe(true);
		});

		it("accepts valid args with optional maxResults", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", maxResults: 5 }).success).toBe(true);
		});

		it("accepts valid args with optional maxSampleArticles", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", maxSampleArticles: 5 }).success).toBe(true);
		});

		it("rejects maxResults below 1", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", maxResults: 0 }).success).toBe(false);
		});

		it("rejects maxResults above 50", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", maxResults: 51 }).success).toBe(false);
		});

		it("rejects maxSampleArticles below 1", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", maxSampleArticles: 0 }).success).toBe(false);
		});

		it("rejects maxSampleArticles above 10", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "test", maxSampleArticles: 11 }).success).toBe(
				false,
			);
		});

		it("rejects when query is missing", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({}).success).toBe(false);
		});

		it("rejects when query is empty string", () => {
			expect(findRelevantSpacesArgsSchema.safeParse({ query: "" }).success).toBe(false);
		});
	});

	// ─── Definition ────────────────────────────────────────────────────

	describe("createFindRelevantSpacesToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createFindRelevantSpacesToolDefinition();
			expect(def.name).toBe("find_relevant_spaces");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
			expect(def.parameters.required).toEqual(["query"]);
		});
	});

	// ─── Permissions ───────────────────────────────────────────────────

	describe("permissions", () => {
		it("returns permission denied when user lacks spaces.view", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockImplementation((_uid, perm) => {
				return Promise.resolve(perm !== "spaces.view");
			});

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "test" });

			expect(result).toBe("You do not have permission to view spaces.");
		});

		it("returns permission denied when user lacks articles.view", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockImplementation((_uid, perm) => {
				return Promise.resolve(perm !== "articles.view");
			});

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "test" });

			expect(result).toBe("You do not have permission to view articles.");
		});
	});

	// ─── Cross-space mode (no spaceId) ─────────────────────────────────

	describe("cross-space mode", () => {
		beforeEach(() => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
		});

		it("returns message when no spaces exist", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([]);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "test" });
			const parsed = JSON.parse(result);

			expect(parsed.spaces).toHaveLength(0);
			expect(parsed.total).toBe(0);
			expect(parsed.message).toBe("No spaces found.");
		});

		it("filters out spaces with no relevance", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Engineering", slug: "engineering", description: "Tech docs" } as never,
				{ id: 2, name: "HR Policies", slug: "hr", description: "HR stuff" } as never,
			]);
			vi.mocked(mockDocDao.searchInSpace)
				.mockResolvedValueOnce({ results: [] as never, total: 0, limited: false }) // Engineering: no hits
				.mockResolvedValueOnce({ results: [] as never, total: 0, limited: false }); // HR: no hits
			vi.mocked(mockSpaceDao.getSpaceStats)
				.mockResolvedValueOnce({ docCount: 5, folderCount: 2 })
				.mockResolvedValueOnce({ docCount: 3, folderCount: 1 });

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "kubernetes" });
			const parsed = JSON.parse(result);

			expect(parsed.spaces).toHaveLength(0);
			expect(parsed.total).toBe(0);
		});

		it("ranks spaces with name match above content-only matches", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Engineering", slug: "engineering", description: null } as never,
				{ id: 2, name: "API Docs", slug: "api-docs", description: "API documentation" } as never,
				{ id: 3, name: "Backend API", slug: "backend-api", description: null } as never,
			]);
			// Engineering: 5 content hits, no name match
			// API Docs: 2 content hits, name+desc match
			// Backend API: 3 content hits, name match
			vi.mocked(mockDocDao.searchInSpace)
				.mockResolvedValueOnce({ results: new Array(5).fill({}) as never, total: 5, limited: false })
				.mockResolvedValueOnce({ results: new Array(2).fill({}) as never, total: 2, limited: false })
				.mockResolvedValueOnce({ results: new Array(3).fill({}) as never, total: 3, limited: false });
			vi.mocked(mockSpaceDao.getSpaceStats)
				.mockResolvedValueOnce({ docCount: 10, folderCount: 3 })
				.mockResolvedValueOnce({ docCount: 8, folderCount: 2 })
				.mockResolvedValueOnce({ docCount: 6, folderCount: 1 });

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "API" });
			const parsed = JSON.parse(result);

			// Name-match spaces first (Backend API and API Docs), sorted by content hits desc
			expect(parsed.spaces[0].name).toBe("Backend API");
			expect(parsed.spaces[0].relevance.nameMatch).toBe(true);
			expect(parsed.spaces[0].relevance.contentHits).toBe(3);
			expect(parsed.spaces[1].name).toBe("API Docs");
			expect(parsed.spaces[1].relevance.nameMatch).toBe(true);
			expect(parsed.spaces[1].relevance.contentHits).toBe(2);
			// Then content-only match
			expect(parsed.spaces[2].name).toBe("Engineering");
			expect(parsed.spaces[2].relevance.nameMatch).toBe(false);
		});

		it("sorts content-only matches after name matches regardless of input order", async () => {
			// Name-matched space listed BEFORE content-only space to exercise the
			// sort comparator branch where a.nameMatch=false and b.nameMatch=true.
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "API Docs", slug: "api-docs", description: null } as never,
				{ id: 2, name: "Engineering", slug: "engineering", description: null } as never,
			]);
			// API Docs: name match, 1 hit
			// Engineering: no name match, 3 hits
			vi.mocked(mockDocDao.searchInSpace)
				.mockResolvedValueOnce({ results: [{}] as never, total: 1, limited: false })
				.mockResolvedValueOnce({ results: new Array(3).fill({}) as never, total: 3, limited: false });
			vi.mocked(mockSpaceDao.getSpaceStats)
				.mockResolvedValueOnce({ docCount: 5, folderCount: 1 })
				.mockResolvedValueOnce({ docCount: 10, folderCount: 2 });

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "API" });
			const parsed = JSON.parse(result);

			expect(parsed.spaces[0].name).toBe("API Docs");
			expect(parsed.spaces[0].relevance.nameMatch).toBe(true);
			expect(parsed.spaces[1].name).toBe("Engineering");
			expect(parsed.spaces[1].relevance.nameMatch).toBe(false);
		});

		it("includes stats for each space", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Docs", slug: "docs", description: "All docs" } as never,
			]);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [{}] as never,
				total: 1,
				limited: false,
			});
			vi.mocked(mockSpaceDao.getSpaceStats).mockResolvedValue({ docCount: 15, folderCount: 4 });

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "docs" });
			const parsed = JSON.parse(result);

			expect(parsed.spaces[0].stats).toEqual({ docCount: 15, folderCount: 4 });
		});

		it("respects custom maxResults", async () => {
			const spaces = Array.from({ length: 5 }, (_, i) => ({
				id: i + 1,
				name: `Space ${i + 1}`,
				slug: `space-${i + 1}`,
				description: `Description for space ${i + 1}`,
			}));
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue(spaces as never);

			for (let i = 0; i < 5; i++) {
				vi.mocked(mockDocDao.searchInSpace).mockResolvedValueOnce({
					results: [{}] as never,
					total: 5 - i,
					limited: false,
				});
				vi.mocked(mockSpaceDao.getSpaceStats).mockResolvedValueOnce({ docCount: 5, folderCount: 1 });
			}

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "space", maxResults: 2 });
			const parsed = JSON.parse(result);

			expect(parsed.spaces).toHaveLength(2);
			expect(parsed.total).toBe(5);
		});

		it("caps results at 10", async () => {
			const spaces = Array.from({ length: 12 }, (_, i) => ({
				id: i + 1,
				name: `Space ${i + 1}`,
				slug: `space-${i + 1}`,
				description: `Description for space ${i + 1}`,
			}));
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue(spaces as never);

			// All spaces have content hits (so none get filtered)
			for (let i = 0; i < 12; i++) {
				vi.mocked(mockDocDao.searchInSpace).mockResolvedValueOnce({
					results: [{}] as never,
					total: 12 - i,
					limited: false,
				});
				vi.mocked(mockSpaceDao.getSpaceStats).mockResolvedValueOnce({ docCount: 5, folderCount: 1 });
			}

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "space" });
			const parsed = JSON.parse(result);

			expect(parsed.spaces).toHaveLength(10);
			expect(parsed.total).toBe(12);
		});

		it("handles null descriptions", async () => {
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{ id: 1, name: "Engineering", slug: "engineering", description: null } as never,
			]);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [{}] as never,
				total: 1,
				limited: false,
			});
			vi.mocked(mockSpaceDao.getSpaceStats).mockResolvedValue({ docCount: 5, folderCount: 2 });

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "engineering" });
			const parsed = JSON.parse(result);

			expect(parsed.spaces[0].description).toBeNull();
			expect(parsed.spaces[0].relevance.nameMatch).toBe(true);
		});
	});

	// ─── Intra-space mode (with spaceId) ───────────────────────────────

	describe("intra-space mode", () => {
		beforeEach(() => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
		});

		it("returns error when space not found", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue(undefined);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "test", spaceId: 999 });
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe("Space with id 999 not found.");
		});

		it("returns empty folders when no matches", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [],
				total: 0,
				limited: false,
			});

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "nonexistent", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders).toHaveLength(0);
			expect(parsed.totalArticleMatches).toBe(0);
		});

		it("groups results by folder", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "article-a",
							parentId: 100,
							contentMetadata: { title: "Article A" },
							path: "/guides/article-a",
						},
						contentSnippet: "Snippet A",
						matchType: "content",
						relevance: 0.8,
					},
					{
						doc: {
							id: 11,
							slug: "article-b",
							parentId: 100,
							contentMetadata: { title: "Article B" },
							path: "/guides/article-b",
						},
						contentSnippet: "Snippet B",
						matchType: "content",
						relevance: 0.7,
					},
					{
						doc: {
							id: 20,
							slug: "article-c",
							parentId: 200,
							contentMetadata: { title: "Article C" },
							path: "/tutorials/article-c",
						},
						contentSnippet: "Snippet C",
						matchType: "title",
						relevance: 0.6,
					},
				] as never,
				total: 3,
				limited: false,
			});

			vi.mocked(mockDocDao.readDocById)
				.mockResolvedValueOnce({
					slug: "guides",
					path: "/guides",
					contentMetadata: { title: "Guides" },
				} as never)
				.mockResolvedValueOnce({
					slug: "tutorials",
					path: "/tutorials",
					contentMetadata: { title: "Tutorials" },
				} as never);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "article", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders).toHaveLength(2);
			expect(parsed.totalArticleMatches).toBe(3);

			// Sorted by article hits desc — Guides has 2 hits, Tutorials has 1
			expect(parsed.folders[0].folderName).toBe("Guides");
			expect(parsed.folders[0].articleHits).toBe(2);
			expect(parsed.folders[0].sampleArticles).toEqual(["Article A", "Article B"]);

			expect(parsed.folders[1].folderName).toBe("Tutorials");
			expect(parsed.folders[1].articleHits).toBe(1);
			expect(parsed.folders[1].sampleArticles).toEqual(["Article C"]);
		});

		it("labels root-level articles as (root)", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "root-article",
							parentId: undefined,
							contentMetadata: { title: "Root Article" },
							path: "/root-article",
						},
						contentSnippet: "Root snippet",
						matchType: "content",
						relevance: 0.9,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "root", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders[0].folderId).toBeNull();
			expect(parsed.folders[0].folderName).toBe("(root)");
			expect(parsed.folders[0].folderPath).toBe("");
		});

		it("respects custom maxSampleArticles", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			const results = Array.from({ length: 8 }, (_, i) => ({
				doc: {
					id: i,
					slug: `article-${i}`,
					parentId: 100,
					contentMetadata: { title: `Article ${i}` },
					path: `/folder/article-${i}`,
				},
				contentSnippet: `Snippet ${i}`,
				matchType: "content" as const,
				relevance: 0.8,
			}));
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: results as never,
				total: 8,
				limited: false,
			});
			vi.mocked(mockDocDao.readDocById).mockResolvedValue({
				slug: "folder",
				path: "/folder",
				contentMetadata: { title: "Folder" },
			} as never);

			const result = await executeFindRelevantSpacesTool(deps, userId, {
				query: "article",
				spaceId: 1,
				maxSampleArticles: 5,
			});
			const parsed = JSON.parse(result);

			expect(parsed.folders[0].sampleArticles).toHaveLength(5);
		});

		it("respects custom maxResults in intra-space mode", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			// 5 articles across 5 different folders
			const results = Array.from({ length: 5 }, (_, i) => ({
				doc: {
					id: i,
					slug: `article-${i}`,
					parentId: 100 + i,
					contentMetadata: { title: `Article ${i}` },
					path: `/folder-${i}/article-${i}`,
				},
				contentSnippet: `Snippet ${i}`,
				matchType: "content" as const,
				relevance: 0.8,
			}));
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: results as never,
				total: 5,
				limited: false,
			});
			for (let i = 0; i < 5; i++) {
				vi.mocked(mockDocDao.readDocById).mockResolvedValueOnce({
					slug: `folder-${i}`,
					path: `/folder-${i}`,
					contentMetadata: { title: `Folder ${i}` },
				} as never);
			}

			const result = await executeFindRelevantSpacesTool(deps, userId, {
				query: "article",
				spaceId: 1,
				maxResults: 2,
			});
			const parsed = JSON.parse(result);

			expect(parsed.folders).toHaveLength(2);
			expect(parsed.totalArticleMatches).toBe(5);
		});

		it("caps sample articles at 3", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			const results = Array.from({ length: 5 }, (_, i) => ({
				doc: {
					id: i,
					slug: `article-${i}`,
					parentId: 100,
					contentMetadata: { title: `Article ${i}` },
					path: `/folder/article-${i}`,
				},
				contentSnippet: `Snippet ${i}`,
				matchType: "content" as const,
				relevance: 0.8,
			}));
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: results as never,
				total: 5,
				limited: false,
			});
			vi.mocked(mockDocDao.readDocById).mockResolvedValue({
				slug: "folder",
				path: "/folder",
				contentMetadata: { title: "Folder" },
			} as never);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "article", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders[0].sampleArticles).toHaveLength(3);
		});

		it("sorts folders by hits descending", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: { id: 1, slug: "a", parentId: 100, contentMetadata: { title: "A" }, path: "/x/a" },
						contentSnippet: "",
						matchType: "content",
						relevance: 0.5,
					},
					{
						doc: { id: 2, slug: "b", parentId: 200, contentMetadata: { title: "B" }, path: "/y/b" },
						contentSnippet: "",
						matchType: "content",
						relevance: 0.6,
					},
					{
						doc: { id: 3, slug: "c", parentId: 200, contentMetadata: { title: "C" }, path: "/y/c" },
						contentSnippet: "",
						matchType: "content",
						relevance: 0.7,
					},
					{
						doc: { id: 4, slug: "d", parentId: 200, contentMetadata: { title: "D" }, path: "/y/d" },
						contentSnippet: "",
						matchType: "content",
						relevance: 0.4,
					},
				] as never,
				total: 4,
				limited: false,
			});
			vi.mocked(mockDocDao.readDocById)
				.mockResolvedValueOnce({
					slug: "x-folder",
					path: "/x",
					contentMetadata: { title: "X Folder" },
				} as never)
				.mockResolvedValueOnce({
					slug: "y-folder",
					path: "/y",
					contentMetadata: { title: "Y Folder" },
				} as never);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "test", spaceId: 1 });
			const parsed = JSON.parse(result);

			// Y Folder has 3 hits, X Folder has 1
			expect(parsed.folders[0].folderName).toBe("Y Folder");
			expect(parsed.folders[0].articleHits).toBe(3);
			expect(parsed.folders[1].folderName).toBe("X Folder");
			expect(parsed.folders[1].articleHits).toBe(1);
		});

		it("falls back to slug when article contentMetadata title is missing", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "untitled-article",
							parentId: undefined,
							contentMetadata: undefined,
							path: "/untitled-article",
						},
						contentSnippet: "Snippet",
						matchType: "content",
						relevance: 0.5,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "untitled", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders[0].sampleArticles[0]).toBe("untitled-article");
		});

		it("falls back to slug when folder doc contentMetadata title is missing", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "article-in-folder",
							parentId: 100,
							contentMetadata: { title: "Article" },
							path: "/folder/article",
						},
						contentSnippet: "Snippet",
						matchType: "content",
						relevance: 0.5,
					},
				] as never,
				total: 1,
				limited: false,
			});
			vi.mocked(mockDocDao.readDocById).mockResolvedValue({
				slug: "untitled-folder",
				path: "/untitled-folder",
				contentMetadata: undefined,
			} as never);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "article", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders[0].folderName).toBe("untitled-folder");
		});

		it("falls back to folder name when readDocById returns undefined", async () => {
			vi.mocked(mockSpaceDao.getSpace).mockResolvedValue({ id: 1, name: "Eng" } as never);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "orphan",
							parentId: 999,
							contentMetadata: { title: "Orphan" },
							path: "/orphan",
						},
						contentSnippet: "Snippet",
						matchType: "content",
						relevance: 0.5,
					},
				] as never,
				total: 1,
				limited: false,
			});
			vi.mocked(mockDocDao.readDocById).mockResolvedValue(undefined);

			const result = await executeFindRelevantSpacesTool(deps, userId, { query: "orphan", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.folders[0].folderName).toBe("Folder 999");
		});
	});
});
