import type { DocDao } from "../../dao/DocDao";
import type { SourceDao } from "../../dao/SourceDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import {
	createListFolderContentsToolDefinition,
	executeListFolderContentsTool,
	listFolderContentsArgsSchema,
} from "./ListFolderContentsTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("ListFolderContentsTool", () => {
	const userId = 42;
	let deps: AgentHubToolDeps;
	let mockPermissionService: PermissionService;
	let mockDocDao: DocDao;
	let mockSourceDao: SourceDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
		mockDocDao = mocks.mockDocDao;
		mockSourceDao = mocks.mockSourceDao;
	});

	describe("listFolderContentsArgsSchema", () => {
		it("accepts valid args with required fields only", () => {
			const result = listFolderContentsArgsSchema.safeParse({ spaceId: 1 });
			expect(result.success).toBe(true);
		});

		it("accepts valid args with optional fields", () => {
			const result = listFolderContentsArgsSchema.safeParse({ spaceId: 1, parentId: 5 });
			expect(result.success).toBe(true);
		});

		it("rejects when spaceId is missing", () => {
			const result = listFolderContentsArgsSchema.safeParse({});
			expect(result.success).toBe(false);
		});

		it("rejects when spaceId is wrong type", () => {
			const result = listFolderContentsArgsSchema.safeParse({ spaceId: "abc" });
			expect(result.success).toBe(false);
		});
	});

	describe("createListFolderContentsToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createListFolderContentsToolDefinition();
			expect(def.name).toBe("list_folder_contents");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeListFolderContentsTool", () => {
		it("returns permission denied message when user lacks articles.view", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeListFolderContentsTool(deps, userId, { spaceId: 1 });

			expect(result).toBe("You do not have permission to view articles.");
			expect(mockPermissionService.hasPermission).toHaveBeenCalledWith(userId, "articles.view");
		});

		it("returns items and source summary on success", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.getTreeContent).mockResolvedValue([
				{
					id: 10,
					slug: "getting-started",
					docType: "document",
					contentMetadata: { title: "Getting Started" },
					jrn: "jrn:doc:10",
					path: "",
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "1",
					content: "",
					contentType: "text/markdown",
					version: 1,
					spaceId: 1,
					parentId: undefined,
					sortOrder: 0,
					source: undefined,
					sourceMetadata: undefined,
					createdBy: "1",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
				{
					id: 11,
					slug: "guides",
					docType: "folder",
					contentMetadata: undefined,
					jrn: "jrn:doc:11",
					path: "",
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "1",
					content: "",
					contentType: "application/folder",
					version: 1,
					spaceId: 1,
					parentId: undefined,
					sortOrder: 1,
					source: undefined,
					sourceMetadata: undefined,
					createdBy: "1",
					deletedAt: undefined,
					explicitlyDeleted: false,
				},
			]);
			vi.mocked(mockSourceDao.listSourcesForSpace).mockResolvedValue([
				{
					id: 1,
					name: "GitHub Repo",
					type: "github",
					enabled: true,
					createdAt: new Date(),
					updatedAt: new Date(),
					binding: { spaceId: 1, sourceId: 1, enabled: true },
				},
			] as never);

			const result = await executeListFolderContentsTool(deps, userId, { spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.items).toHaveLength(2);
			expect(parsed.items[0]).toEqual({
				id: 10,
				title: "Getting Started",
				type: "document",
				slug: "getting-started",
			});
			expect(parsed.items[1]).toEqual({
				id: 11,
				title: "guides",
				type: "folder",
				slug: "guides",
			});
			expect(parsed.sourceSummary).toContain("1 linked source(s)");
			expect(parsed.sourceSummary).toContain("GitHub Repo");
		});

		it("passes parentId to getTreeContent when provided", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.getTreeContent).mockResolvedValue([]);
			vi.mocked(mockSourceDao.listSourcesForSpace).mockResolvedValue([]);

			await executeListFolderContentsTool(deps, userId, { spaceId: 1, parentId: 5 });

			expect(mockDocDao.getTreeContent).toHaveBeenCalledWith(1, 5);
		});

		it("passes null parentId when not provided", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.getTreeContent).mockResolvedValue([]);
			vi.mocked(mockSourceDao.listSourcesForSpace).mockResolvedValue([]);

			await executeListFolderContentsTool(deps, userId, { spaceId: 1 });

			expect(mockDocDao.getTreeContent).toHaveBeenCalledWith(1, null);
		});

		it("reports no linked sources when list is empty", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.getTreeContent).mockResolvedValue([]);
			vi.mocked(mockSourceDao.listSourcesForSpace).mockResolvedValue([]);

			const result = await executeListFolderContentsTool(deps, userId, { spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed.sourceSummary).toBe("This space has no linked sources.");
		});
	});
});
