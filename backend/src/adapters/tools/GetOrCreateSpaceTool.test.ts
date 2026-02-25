import type { SpaceDao } from "../../dao/SpaceDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createGetOrCreateSpaceToolDefinition, executeGetOrCreateSpaceTool } from "./GetOrCreateSpaceTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("GetOrCreateSpaceTool", () => {
	const userId = 42;
	let deps: AgentHubToolDeps;
	let mockPermissionService: PermissionService;
	let mockSpaceDao: SpaceDao;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
		mockSpaceDao = mocks.mockSpaceDao;
	});

	describe("createGetOrCreateSpaceToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createGetOrCreateSpaceToolDefinition();
			expect(def.name).toBe("get_or_create_space");
			expect(def.description).toBeTruthy();
			expect(def.parameters.required).toContain("name");
		});
	});

	describe("executeGetOrCreateSpaceTool", () => {
		it("returns permission denied when user lacks spaces.edit", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeGetOrCreateSpaceTool(deps, userId, { name: "My Space" });

			expect(result).toContain("permission");
			expect(mockPermissionService.hasPermission).toHaveBeenCalledWith(userId, "spaces.edit");
		});

		it("returns existing space when found by slug", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue({
				id: 5,
				name: "My Space",
				slug: "my-space",
				description: "Existing space",
				jrn: "jrn:test",
				ownerId: 1,
				isPersonal: false,
				defaultSort: "default",
				defaultFilters: {},
				deletedAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await executeGetOrCreateSpaceTool(deps, userId, { name: "My Space" });
			const parsed = JSON.parse(result);

			expect(parsed.id).toBe(5);
			expect(parsed.name).toBe("My Space");
			expect(parsed.created).toBe(false);
			expect(mockSpaceDao.createSpace).not.toHaveBeenCalled();
		});

		it("creates new space when not found", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(undefined);
			vi.mocked(mockSpaceDao.createSpace).mockResolvedValue({
				id: 10,
				name: "New Docs",
				slug: "new-docs",
				description: "Documentation space for New Docs",
				jrn: "jrn:test",
				ownerId: userId,
				isPersonal: false,
				defaultSort: "default",
				defaultFilters: {},
				deletedAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await executeGetOrCreateSpaceTool(deps, userId, { name: "New Docs" });
			const parsed = JSON.parse(result);

			expect(parsed.id).toBe(10);
			expect(parsed.name).toBe("New Docs");
			expect(parsed.created).toBe(true);
			// Slug should start with base slug and have a timestamp suffix for uniqueness
			expect(mockSpaceDao.createSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "New Docs",
					slug: expect.stringMatching(/^new-docs-\d+$/),
					ownerId: userId,
					isPersonal: false,
				}),
			);
		});

		it("uses provided description when creating", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.getSpaceBySlug).mockResolvedValue(undefined);
			vi.mocked(mockSpaceDao.createSpace).mockResolvedValue({
				id: 11,
				name: "API Docs",
				slug: "api-docs",
				description: "Custom description",
				jrn: "jrn:test",
				ownerId: userId,
				isPersonal: false,
				defaultSort: "default",
				defaultFilters: {},
				deletedAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await executeGetOrCreateSpaceTool(deps, userId, {
				name: "API Docs",
				description: "Custom description",
			});

			expect(mockSpaceDao.createSpace).toHaveBeenCalledWith(
				expect.objectContaining({
					description: "Custom description",
				}),
			);
		});
	});
});
