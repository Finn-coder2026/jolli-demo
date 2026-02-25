import type { DocDao } from "../../dao/DocDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createCreateFolderToolDefinition, createFolderArgsSchema, executeCreateFolderTool } from "./CreateFolderTool";
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

describe("CreateFolderTool", () => {
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

	describe("createFolderArgsSchema", () => {
		it("accepts valid args with required fields only", () => {
			const result = createFolderArgsSchema.safeParse({ name: "Folder", spaceId: 1 });
			expect(result.success).toBe(true);
		});

		it("accepts valid args with optional parentId", () => {
			const result = createFolderArgsSchema.safeParse({ name: "Folder", spaceId: 1, parentId: 5 });
			expect(result.success).toBe(true);
		});

		it("rejects when name is missing", () => {
			const result = createFolderArgsSchema.safeParse({ spaceId: 1 });
			expect(result.success).toBe(false);
		});

		it("rejects when name is empty string", () => {
			const result = createFolderArgsSchema.safeParse({ name: "", spaceId: 1 });
			expect(result.success).toBe(false);
		});
	});

	describe("createCreateFolderToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createCreateFolderToolDefinition();
			expect(def.name).toBe("create_folder");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeCreateFolderTool", () => {
		it("returns permission denied message when user lacks articles.edit", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeCreateFolderTool(deps, userId, { name: "New Folder", spaceId: 1 });

			expect(result).toBe("You do not have permission to create folders.");
			expect(mockPermissionService.hasPermission).toHaveBeenCalledWith(userId, "articles.edit");
		});

		it("creates a folder and returns its id and name", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.createDoc).mockResolvedValue({
				id: 100,
				slug: "new-folder",
				docType: "folder",
				contentType: "application/folder",
				content: "",
				contentMetadata: { title: "New Folder" },
				spaceId: 1,
				parentId: undefined,
				jrn: "jrn:doc:100",
				path: "",
				createdAt: new Date(),
				updatedAt: new Date(),
				updatedBy: "42",
				version: 1,
				sortOrder: 0,
				source: undefined,
				sourceMetadata: undefined,
				createdBy: "42",
				deletedAt: undefined,
				explicitlyDeleted: false,
			});

			const result = await executeCreateFolderTool(deps, userId, { name: "New Folder", spaceId: 1 });
			const parsed = JSON.parse(result);

			expect(parsed).toEqual({ id: 100, name: "New Folder" });
			expect(mockDocDao.createDoc).toHaveBeenCalledWith({
				docType: "folder",
				contentType: "application/folder",
				content: "",
				contentMetadata: { title: "New Folder" },
				spaceId: 1,
				parentId: undefined,
				source: undefined,
				sourceMetadata: undefined,
				createdBy: "42",
				updatedBy: "42",
			});
		});

		it("passes parentId when provided", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockDocDao.createDoc).mockResolvedValue({
				id: 101,
				slug: "sub-folder",
				docType: "folder",
			} as never);

			await executeCreateFolderTool(deps, userId, { name: "Sub Folder", spaceId: 1, parentId: 5 });

			expect(mockDocDao.createDoc).toHaveBeenCalledWith(expect.objectContaining({ parentId: 5 }));
		});
	});
});
