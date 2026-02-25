import type { PermissionService } from "../../services/PermissionService";
import type { AgentHubToolDeps } from "./AgentHubTools";
import { createMockDeps } from "./AgentHubToolTestUtils";
import { createCheckPermissionsToolDefinition, executeCheckPermissionsTool } from "./CheckPermissionsTool";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CheckPermissionsTool", () => {
	const userId = 42;
	let deps: AgentHubToolDeps;
	let mockPermissionService: PermissionService;

	beforeEach(() => {
		vi.clearAllMocks();
		const mocks = createMockDeps();
		deps = mocks.deps;
		mockPermissionService = mocks.mockPermissionService;
	});

	describe("createCheckPermissionsToolDefinition", () => {
		it("returns a valid tool definition", () => {
			const def = createCheckPermissionsToolDefinition();
			expect(def.name).toBe("check_permissions");
			expect(def.description).toBeTruthy();
			expect(def.parameters.type).toBe("object");
		});
	});

	describe("executeCheckPermissionsTool", () => {
		it("returns the user permissions as JSON", async () => {
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue([
				"spaces.view",
				"articles.view",
				"articles.edit",
			]);

			const result = await executeCheckPermissionsTool(deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed.permissions).toEqual(["spaces.view", "articles.view", "articles.edit"]);
			expect(mockPermissionService.getUserPermissions).toHaveBeenCalledWith(userId);
		});

		it("returns empty permissions list when user has none", async () => {
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue([]);

			const result = await executeCheckPermissionsTool(deps, userId);
			const parsed = JSON.parse(result);

			expect(parsed.permissions).toEqual([]);
		});
	});
});
