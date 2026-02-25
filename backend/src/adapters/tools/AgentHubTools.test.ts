import type { IntegrationDao } from "../../dao/IntegrationDao";
import type { SpaceDao } from "../../dao/SpaceDao";
import type { PermissionService } from "../../services/PermissionService";
import {
	AGENT_HUB_TOOL_NAMES,
	type AgentHubToolDeps,
	DESTRUCTIVE_TOOL_NAMES,
	executeAgentHubTool,
	getAgentHubToolDefinitions,
	isNavigationAction,
	MUTATION_TOOL_NAMES,
	validateToolArgs,
} from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock TenantContext so getTenantContext() returns undefined (DaoProvider will use default DAO)
vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

// Mock Config so web_search dispatch can read the API key
vi.mock("../../config/Config", () => ({
	getConfig: () => ({ TAVILY_API_KEY: undefined }),
}));

// Mock GitHubApp so connect_github_repo dispatch can check app config
vi.mock("../../model/GitHubApp", () => ({
	getCoreJolliGithubApp: () => ({ appId: -1 }),
}));

// Mock Logger to avoid noisy output during tests
vi.mock("../../util/Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

describe("AgentHubTools", () => {
	const userId = 42;

	let mockPermissionService: PermissionService;
	let mockSpaceDao: SpaceDao;
	let mockIntegrationDao: IntegrationDao;
	let deps: AgentHubToolDeps;

	beforeEach(() => {
		vi.clearAllMocks();

		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
		mockSpaceDao = mocks.mockSpaceDao;
		mockIntegrationDao = mocks.mockIntegrationDao;
	});

	// ─── getAgentHubToolDefinitions ───────────────────────────────────────────

	describe("getAgentHubToolDefinitions", () => {
		it("returns the correct number of tool definitions", () => {
			const tools = getAgentHubToolDefinitions();
			expect(tools).toHaveLength(AGENT_HUB_TOOL_NAMES.length);
		});

		it("returns definitions with names matching AGENT_HUB_TOOL_NAMES", () => {
			const tools = getAgentHubToolDefinitions();
			const names = tools.map(t => t.name);
			expect(names).toEqual([...AGENT_HUB_TOOL_NAMES]);
		});

		it("each definition has a name, description, and parameters", () => {
			const tools = getAgentHubToolDefinitions();
			for (const tool of tools) {
				expect(tool.name).toBeTruthy();
				expect(tool.description).toBeTruthy();
				expect(tool.parameters).toBeDefined();
				expect(tool.parameters.type).toBe("object");
			}
		});
	});

	// ─── MUTATION_TOOL_NAMES ─────────────────────────────────────────────────

	describe("MUTATION_TOOL_NAMES", () => {
		it("contains exactly the mutation tools", () => {
			expect(MUTATION_TOOL_NAMES).toEqual(
				new Set([
					"connect_github_repo",
					"create_folder",
					"create_article_draft",
					"navigate_user",
					"import_repo_docs",
					"get_or_create_space",
				]),
			);
		});

		it("is a subset of AGENT_HUB_TOOL_NAMES", () => {
			for (const name of MUTATION_TOOL_NAMES) {
				expect((AGENT_HUB_TOOL_NAMES as ReadonlyArray<string>).includes(name)).toBe(true);
			}
		});
	});

	// ─── DESTRUCTIVE_TOOL_NAMES ─────────────────────────────────────────────

	describe("DESTRUCTIVE_TOOL_NAMES", () => {
		it("is initially empty (all current mutations are create-only)", () => {
			expect(DESTRUCTIVE_TOOL_NAMES.size).toBe(0);
		});

		it("is a subset of MUTATION_TOOL_NAMES", () => {
			for (const name of DESTRUCTIVE_TOOL_NAMES) {
				expect(MUTATION_TOOL_NAMES.has(name)).toBe(true);
			}
		});
	});

	// ─── isNavigationAction ──────────────────────────────────────────────────

	describe("isNavigationAction", () => {
		it("returns true for a valid NavigationActionResult", () => {
			const value = { __navigationAction: true, path: "/articles", label: "Go" };
			expect(isNavigationAction(value)).toBe(true);
		});

		it("returns false when __navigationAction is false", () => {
			const value = { __navigationAction: false, path: "/articles", label: "Go" };
			expect(isNavigationAction(value)).toBe(false);
		});

		it("returns false when __navigationAction is missing", () => {
			expect(isNavigationAction({ path: "/articles", label: "Go" })).toBe(false);
		});

		it("returns false for null", () => {
			expect(isNavigationAction(null)).toBe(false);
		});

		it("returns false for a string", () => {
			expect(isNavigationAction("not an object")).toBe(false);
		});

		it("returns false for undefined", () => {
			expect(isNavigationAction(undefined)).toBe(false);
		});

		it("returns false for a number", () => {
			expect(isNavigationAction(123)).toBe(false);
		});
	});

	// ─── executeAgentHubTool ─────────────────────────────────────────────────

	describe("executeAgentHubTool", () => {
		it("dispatches list_spaces to executeListSpacesTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([]);

			const result = await executeAgentHubTool("list_spaces", {}, deps, userId);

			expect(result).toBe("No spaces found. You may need to create a space first.");
		});

		it("dispatches list_folder_contents to executeListFolderContentsTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeAgentHubTool("list_folder_contents", { spaceId: 1 }, deps, userId);

			expect(result).toBe("You do not have permission to view articles.");
		});

		it("dispatches search_articles to executeSearchArticlesTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeAgentHubTool("search_articles", { query: "test" }, deps, userId);

			expect(result).toBe("You do not have permission to view articles.");
		});

		it("dispatches find_relevant_articles to executeFindRelevantArticlesTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeAgentHubTool("find_relevant_articles", { query: "test" }, deps, userId);

			expect(result).toBe("You do not have permission to view articles.");
		});

		it("dispatches find_relevant_spaces to executeFindRelevantSpacesTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeAgentHubTool("find_relevant_spaces", { query: "test" }, deps, userId);

			expect(result).toBe("You do not have permission to view spaces.");
		});

		it("returns validation error when find_relevant_articles query is empty", async () => {
			const result = await executeAgentHubTool("find_relevant_articles", { query: "" }, deps, userId);

			expect(result).toContain("Invalid arguments for find_relevant_articles");
			expect(result).toContain("query");
		});

		it("returns validation error when find_relevant_spaces query is empty", async () => {
			const result = await executeAgentHubTool("find_relevant_spaces", { query: "" }, deps, userId);

			expect(result).toContain("Invalid arguments for find_relevant_spaces");
			expect(result).toContain("query");
		});

		it("dispatches check_permissions to executeCheckPermissionsTool", async () => {
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["spaces.view"]);

			const result = await executeAgentHubTool("check_permissions", {}, deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed.permissions).toEqual(["spaces.view"]);
		});

		it("dispatches check_github_status to executeCheckGitHubStatusTool", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeAgentHubTool("check_github_status", {}, deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed.connected).toBe(false);
		});

		it("dispatches connect_github_repo (GitHub App not configured path)", async () => {
			const result = await executeAgentHubTool(
				"connect_github_repo",
				{ repoUrl: "https://github.com/acme/docs" },
				deps,
				userId,
			);
			const parsed = JSON.parse(result);

			expect(parsed.error).toBe(true);
			expect(parsed.message).toContain("not configured");
		});

		it("returns validation error when connect_github_repo repoUrl is empty", async () => {
			const result = await executeAgentHubTool("connect_github_repo", { repoUrl: "" }, deps, userId);

			expect(result).toContain("Invalid arguments for connect_github_repo");
			expect(result).toContain("repoUrl");
		});

		it("dispatches list_github_repos to executeListGitHubReposTool", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeAgentHubTool("list_github_repos", {}, deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed.repos).toEqual([]);
		});

		it("dispatches scan_repo_docs to executeScanRepoDocsTool", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeAgentHubTool("scan_repo_docs", { repository: "acme/docs" }, deps, userId);

			expect(result).toContain("Cannot access repository");
		});

		it("dispatches import_repo_docs to executeImportRepoDocsTool", async () => {
			vi.mocked(mockIntegrationDao.listIntegrations).mockResolvedValue([]);

			const result = await executeAgentHubTool(
				"import_repo_docs",
				{ repository: "acme/docs", filePaths: ["readme.md"], spaceId: 1 },
				deps,
				userId,
			);

			expect(result).toContain("Cannot access repository");
		});

		it("dispatches get_or_create_space to executeGetOrCreateSpaceTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(undefined);
			vi.mocked(mockSpaceDao.createSpace).mockResolvedValue({ id: 5, name: "Docs", slug: "docs" } as never);

			const result = await executeAgentHubTool("get_or_create_space", { name: "Docs" }, deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed.id).toBe(5);
			expect(parsed.created).toBe(true);
		});

		it("dispatches create_folder to executeCreateFolderTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeAgentHubTool("create_folder", { name: "Folder", spaceId: 1 }, deps, userId);

			expect(result).toBe("You do not have permission to create folders.");
		});

		it("dispatches create_article_draft to executeCreateArticleDraftTool", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeAgentHubTool(
				"create_article_draft",
				{ title: "Article", spaceId: 1 },
				deps,
				userId,
			);

			expect(result).toBe("You do not have permission to create articles.");
		});

		it("dispatches navigate_user to executeNavigateUserTool", async () => {
			const result = await executeAgentHubTool(
				"navigate_user",
				{ target: "articles", targetId: 10, label: "Go" },
				deps,
				userId,
			);
			const parsed = JSON.parse(result);

			expect(parsed.__navigationAction).toBe(true);
			expect(parsed.path).toBe("/articles?doc=10");
		});

		it("dispatches web_search and returns not-available when API key missing", async () => {
			const result = await executeAgentHubTool("web_search", { query: "test query" }, deps, userId);

			expect(result).toBe("Web search is not available — the TAVILY_API_KEY is not configured.");
		});

		it("returns unknown tool message for unrecognized tool name", async () => {
			const result = await executeAgentHubTool("nonexistent_tool", {}, deps, userId);

			expect(result).toBe("Unknown tool: nonexistent_tool");
		});

		it("returns validation error when list_folder_contents is missing spaceId", async () => {
			const result = await executeAgentHubTool("list_folder_contents", {}, deps, userId);

			expect(result).toContain("Invalid arguments for list_folder_contents");
			expect(result).toContain("spaceId");
		});

		it("returns validation error when create_folder name is wrong type", async () => {
			const result = await executeAgentHubTool("create_folder", { name: 123, spaceId: 1 }, deps, userId);

			expect(result).toContain("Invalid arguments for create_folder");
			expect(result).toContain("name");
		});

		it("returns validation error when search_articles query is empty", async () => {
			const result = await executeAgentHubTool("search_articles", { query: "" }, deps, userId);

			expect(result).toContain("Invalid arguments for search_articles");
			expect(result).toContain("query");
		});

		it("returns validation error when web_search query is empty", async () => {
			const result = await executeAgentHubTool("web_search", { query: "" }, deps, userId);

			expect(result).toContain("Invalid arguments for web_search");
			expect(result).toContain("query");
		});

		it("returns unknown tool for update_plan (intercepted at router level)", async () => {
			const result = await executeAgentHubTool("update_plan", { plan: "# Plan" }, deps, userId);

			expect(result).toBe("Unknown tool: update_plan");
		});

		it("returns validation error when navigate_user target is invalid enum", async () => {
			const result = await executeAgentHubTool(
				"navigate_user",
				{ target: "settings", targetId: 1, label: "Go" },
				deps,
				userId,
			);

			expect(result).toContain("Invalid arguments for navigate_user");
			expect(result).toContain("target");
		});

		it("dispatches list_spaces with empty args (no schema validation needed)", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([]);

			const result = await executeAgentHubTool("list_spaces", {}, deps, userId);

			expect(result).toBe("No spaces found. You may need to create a space first.");
		});
	});

	// ─── validateToolArgs ───────────────────────────────────────────────────

	describe("validateToolArgs", () => {
		it("returns success for a tool with no registered schema", () => {
			const result = validateToolArgs("list_spaces", {});

			expect(result.success).toBe(true);
		});

		it("returns success with valid args", () => {
			const result = validateToolArgs("list_folder_contents", { spaceId: 1 });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({ spaceId: 1 });
			}
		});

		it("returns error for missing required field", () => {
			const result = validateToolArgs("create_article_draft", { spaceId: 1 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("title");
			}
		});

		it("returns error for wrong type", () => {
			const result = validateToolArgs("search_articles", { query: 42 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toContain("query");
			}
		});

		it("returns success for unknown tool names (no schema to validate against)", () => {
			const result = validateToolArgs("unknown_tool", { anything: true });

			expect(result.success).toBe(true);
		});
	});
});
