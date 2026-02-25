import type { SpaceDao } from "../../dao/SpaceDao";
import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createListSpacesToolDefinition, executeListSpacesTool } from "./ListSpacesTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../tenant/TenantContext", () => ({
	getTenantContext: vi.fn().mockReturnValue(undefined),
}));

describe("ListSpacesTool", () => {
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

	describe("createListSpacesToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createListSpacesToolDefinition();
			expect(def.name).toBe("list_spaces");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeListSpacesTool", () => {
		it("returns permission denied message when user lacks spaces.view", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(false);

			const result = await executeListSpacesTool(deps, userId);

			expect(result).toBe("You do not have permission to view spaces.");
			expect(mockPermissionService.hasPermission).toHaveBeenCalledWith(userId, "spaces.view");
		});

		it("returns no-spaces message when list is empty", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([]);

			const result = await executeListSpacesTool(deps, userId);

			expect(result).toBe("No spaces found. You may need to create a space first.");
		});

		it("returns JSON array of spaces on success", async () => {
			vi.mocked(mockPermissionService.hasPermission).mockResolvedValue(true);
			vi.mocked(mockSpaceDao.listSpaces).mockResolvedValue([
				{
					id: 1,
					name: "Engineering",
					slug: "engineering",
					description: "Engineering docs",
					jrn: "jrn:/global:spaces:space/engineering",
					ownerId: 1,
					isPersonal: false,
					defaultSort: "default",
					defaultFilters: {},
					deletedAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					name: "Marketing",
					slug: "marketing",
					description: null,
					jrn: "jrn:/global:spaces:space/marketing",
					ownerId: 1,
					isPersonal: false,
					defaultSort: "default",
					defaultFilters: {},
					deletedAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const result = await executeListSpacesTool(deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed).toHaveLength(2);
			expect(parsed[0]).toEqual({
				id: 1,
				name: "Engineering",
				slug: "engineering",
				description: "Engineering docs",
			});
			expect(parsed[1]).toEqual({
				id: 2,
				name: "Marketing",
				slug: "marketing",
				description: null,
			});
		});
	});
});
