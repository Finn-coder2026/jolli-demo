import type { DocDao } from "../../dao/DocDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import {
	createSearchArticlesToolDefinition,
	executeSearchArticlesTool,
	searchArticlesArgsSchema,
} from "./SearchArticlesTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("SearchArticlesTool", () => {
	const userId = 42;
	let deps: AgentHubToolDeps;
	let mockPermissionService: PermissionService;
	let mockDocDao: DocDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
		mockDocDao = mocks.mockDocDao;
	});

	describe("searchArticlesArgsSchema", () => {
		it("accepts valid args with required fields only", () => {
			const result = searchArticlesArgsSchema.safeParse({ query: "test" });
			expect(result.success).toBe(true);
		});

		it("accepts valid args with optional spaceId", () => {
			const result = searchArticlesArgsSchema.safeParse({ query: "test", spaceId: 1 });
			expect(result.success).toBe(true);
		});

		it("rejects when query is missing", () => {
			const result = searchArticlesArgsSchema.safeParse({});
			expect(result.success).toBe(false);
		});

		it("rejects when query is empty string", () => {
			const result = searchArticlesArgsSchema.safeParse({ query: "" });
			expect(result.success).toBe(false);
		});
	});

	describe("createSearchArticlesToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createSearchArticlesToolDefinition();
			expect(def.name).toBe("search_articles");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeSearchArticlesTool", () => {
		it("returns permission denied message when user lacks articles.view", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeSearchArticlesTool(deps, userId, { query: "test" });

			expect(result).toBe("You do not have permission to view articles.");
		});

		it("uses searchInSpace when spaceId is provided", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 10,
							slug: "test-article",
							contentMetadata: { title: "Test Article" },
							spaceId: 1,
							jrn: "jrn:doc:10",
						},
						contentSnippet: "snippet",
						matchType: "title",
						relevance: 0.9,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeSearchArticlesTool(deps, userId, { query: "test", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(mockDocDao.searchInSpace).toHaveBeenCalledWith(1, "test");
			expect(parsed.results).toHaveLength(1);
			expect(parsed.results[0]).toEqual({
				id: 10,
				title: "Test Article",
				spaceId: 1,
				jrn: "jrn:doc:10",
			});
			expect(parsed.total).toBe(1);
		});

		it("falls back to slug when contentMetadata is missing in searchInSpace results", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.searchInSpace).mockResolvedValue({
				results: [
					{
						doc: {
							id: 15,
							slug: "space-fallback-slug",
							contentMetadata: undefined,
							spaceId: 1,
							jrn: "jrn:doc:15",
						},
						contentSnippet: "snippet",
						matchType: "title",
						relevance: 0.8,
					},
				] as never,
				total: 1,
				limited: false,
			});

			const result = await executeSearchArticlesTool(deps, userId, { query: "fallback", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.results[0].title).toBe("space-fallback-slug");
		});

		it("uses searchDocsByTitle when spaceId is not provided", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.searchDocsByTitle).mockResolvedValue([
				{
					id: 20,
					slug: "my-article",
					spaceId: 2,
					jrn: "jrn:doc:20",
					contentMetadata: { title: "My Article" },
					docType: "document",
					path: "",
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "1",
					content: "",
					contentType: "text/markdown",
					version: 1,
					parentId: undefined,
					sortOrder: 0,
					source: undefined,
					sourceMetadata: undefined,
					createdBy: "1",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			]);

			const result = await executeSearchArticlesTool(deps, userId, { query: "my" });
			const parsed = JSON.parse(result);

			expect(mockDocDao.searchDocsByTitle).toHaveBeenCalledWith("my", 42);
			expect(parsed.results).toHaveLength(1);
			expect(parsed.results[0]).toEqual({
				id: 20,
				title: "My Article",
				spaceId: 2,
				jrn: "jrn:doc:20",
			});
		});

		it("falls back to slug when contentMetadata title is missing", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.searchDocsByTitle).mockResolvedValue([
				{
					id: 30,
					slug: "fallback-slug",
					spaceId: 3,
					jrn: "jrn:doc:30",
					contentMetadata: undefined,
					docType: "document",
					path: "",
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "1",
					content: "",
					contentType: "text/markdown",
					version: 1,
					parentId: undefined,
					sortOrder: 0,
					source: undefined,
					sourceMetadata: undefined,
					createdBy: "1",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			]);

			const result = await executeSearchArticlesTool(deps, userId, { query: "fallback" });
			const parsed = JSON.parse(result);

			expect(parsed.results[0].title).toBe("fallback-slug");
		});
	});
});
