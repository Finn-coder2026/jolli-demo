import type { DocDao } from "../../dao/DocDao";
import type { DocDraftDao } from "../../dao/DocDraftDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import {
	createArticleDraftArgsSchema,
	createCreateArticleDraftToolDefinition,
	executeCreateArticleDraftTool,
} from "./CreateArticleDraftTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../util/Logger", () => ({
	getLog: () => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	}),
}));

describe("CreateArticleDraftTool", () => {
	const userId = 42;
	let deps: AgentHubToolDeps;
	let mockPermissionService: PermissionService;
	let mockDocDao: DocDao;
	let mockDocDraftDao: DocDraftDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
		mockDocDao = mocks.mockDocDao;
		mockDocDraftDao = mocks.mockDocDraftDao;
	});

	describe("createArticleDraftArgsSchema", () => {
		it("accepts valid args with required fields only", () => {
			const result = createArticleDraftArgsSchema.safeParse({ title: "Article", spaceId: 1 });
			expect(result.success).toBe(true);
		});

		it("accepts valid args with all optional fields", () => {
			const result = createArticleDraftArgsSchema.safeParse({
				title: "Article",
				spaceId: 1,
				folderId: 5,
				content: "# Hello",
			});
			expect(result.success).toBe(true);
		});

		it("rejects when title is missing", () => {
			const result = createArticleDraftArgsSchema.safeParse({ spaceId: 1 });
			expect(result.success).toBe(false);
		});

		it("rejects when title is empty string", () => {
			const result = createArticleDraftArgsSchema.safeParse({ title: "", spaceId: 1 });
			expect(result.success).toBe(false);
		});
	});

	describe("createCreateArticleDraftToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createCreateArticleDraftToolDefinition();
			expect(def.name).toBe("create_article_draft");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeCreateArticleDraftTool", () => {
		it("returns permission denied message when user lacks articles.edit", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeCreateArticleDraftTool(deps, userId, { title: "New Article", spaceId: 1 });

			expect(result).toBe("You do not have permission to create articles.");
			expect(mockPermissionService.hasPermission).toHaveBeenCalledWith(userId, "articles.edit");
		});

		it("creates a doc and a draft, returning their IDs", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.createDoc).mockResolvedValue({
				id: 200,
				slug: "new-article",
				docType: "document",
			} as never);
			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValue({
				id: 300,
				docId: 200,
				title: "New Article",
				content: "# Hello",
				contentType: "text/markdown",
				createdBy: userId,
				createdAt: new Date(),
				updatedAt: new Date(),
				contentLastEditedAt: null,
				contentLastEditedBy: null,
				contentMetadata: undefined,
				isShared: true,
				sharedAt: null,
				sharedBy: null,
				createdByAgent: true,
			});

			const result = await executeCreateArticleDraftTool(deps, userId, {
				title: "New Article",
				spaceId: 1,
				folderId: 5,
				content: "# Hello",
			});
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({
				draftId: 300,
				docId: 200,
				title: "New Article",
				spaceId: 1,
			});

			expect(mockDocDao.createDoc).toHaveBeenCalledWith({
				docType: "document",
				contentType: "text/markdown",
				content: "# Hello",
				contentMetadata: { title: "New Article" },
				spaceId: 1,
				parentId: 5,
				source: undefined,
				sourceMetadata: undefined,
				createdBy: "42",
				updatedBy: "42",
			});

			expect(mockDocDraftDao.createDocDraft).toHaveBeenCalledWith({
				docId: 200,
				title: "New Article",
				content: "# Hello",
				createdBy: userId,
				createdByAgent: true,
				isShared: true,
			});
		});

		it("uses empty string for content when not provided", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.createDoc).mockResolvedValue({ id: 201 } as never);
			vi.mocked(mockDocDraftDao.createDocDraft).mockResolvedValue({ id: 301 } as never);

			await executeCreateArticleDraftTool(deps, userId, { title: "Empty Article", spaceId: 1 });

			expect(mockDocDao.createDoc).toHaveBeenCalledWith(
				expect.objectContaining({ content: "", parentId: undefined }),
			);
			expect(mockDocDraftDao.createDocDraft).toHaveBeenCalledWith(expect.objectContaining({ content: "" }));
		});
	});
});
