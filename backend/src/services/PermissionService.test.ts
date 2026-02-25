import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { RoleDao, RoleWithPermissions } from "../dao/RoleDao";
import type { ActiveUser, OrgUserRole } from "../model/ActiveUser";
import type { Permission } from "../model/Permission";
import { createPermissionService, PermissionService } from "./PermissionService";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock tenant context
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

describe("PermissionService", () => {
	let roleDao: RoleDao;
	let roleDaoProvider: DaoProvider<RoleDao>;
	let activeUserDao: ActiveUserDao;
	let activeUserDaoProvider: DaoProvider<ActiveUserDao>;
	let permissionService: PermissionService;

	const mockUser: ActiveUser = {
		id: 1,
		email: "test@example.com",
		role: "member",
		roleId: 1,
		isAgent: false,
		isActive: true,
		name: "Test User",
		image: null,
		jobTitle: null,
		phone: null,
		language: "en",
		timezone: "UTC",
		location: null,
		createdAt: new Date("2025-01-01"),
		updatedAt: new Date("2025-01-01"),
	};

	const mockPermission: Permission = {
		id: 1,
		name: "View Users",
		slug: "users.view",
		description: "View user list and profiles",
		category: "users",
		createdAt: new Date("2025-01-01"),
	};

	const mockRole: RoleWithPermissions = {
		id: 1,
		name: "Member",
		slug: "member",
		description: "Standard user access",
		isBuiltIn: true,
		isDefault: true,
		priority: 50,
		clonedFrom: null,
		createdAt: new Date("2025-01-01"),
		updatedAt: new Date("2025-01-01"),
		permissions: [mockPermission],
	};

	beforeEach(() => {
		roleDao = {
			listAll: vi.fn(),
			findById: vi.fn(),
			findBySlug: vi.fn(),
			getRoleWithPermissions: vi.fn(),
			getRoleWithPermissionsBySlug: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			getPermissions: vi.fn(),
			setPermissions: vi.fn(),
			cloneRole: vi.fn(),
			getDefaultRole: vi.fn(),
		};

		roleDaoProvider = {
			getDao: vi.fn(() => roleDao),
		};

		activeUserDao = {
			findById: vi.fn(),
			findByEmail: vi.fn(),
			listActive: vi.fn(),
			listAll: vi.fn(),
			listByRole: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			deactivate: vi.fn(),
			reactivate: vi.fn(),
			delete: vi.fn(),
			countActive: vi.fn(),
			countAll: vi.fn(),
			countByRole: vi.fn(),
		};

		activeUserDaoProvider = {
			getDao: vi.fn(() => activeUserDao),
		};

		permissionService = new PermissionService(roleDaoProvider, activeUserDaoProvider);
	});

	describe("hasPermission", () => {
		it("should return true when user has the permission", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasPermission(1, "users.view");

			expect(result).toBe(true);
		});

		it("should return false when user does not have the permission", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasPermission(1, "roles.edit");

			expect(result).toBe(false);
		});

		it("should return false when user is not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const result = await permissionService.hasPermission(999, "users.view");

			expect(result).toBe(false);
		});
	});

	describe("hasAnyPermission", () => {
		it("should return true when user has at least one permission", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasAnyPermission(1, ["users.view", "roles.edit"]);

			expect(result).toBe(true);
		});

		it("should return false when user has none of the permissions", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasAnyPermission(1, ["roles.edit", "sites.edit"]);

			expect(result).toBe(false);
		});

		it("should return false when permissions array is empty", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasAnyPermission(1, []);

			expect(result).toBe(false);
		});
	});

	describe("hasAllPermissions", () => {
		it("should return true when user has all permissions", async () => {
			const roleWithMultiplePerms: RoleWithPermissions = {
				...mockRole,
				permissions: [mockPermission, { ...mockPermission, id: 2, slug: "users.edit", name: "Edit Users" }],
			};
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(roleWithMultiplePerms);

			const result = await permissionService.hasAllPermissions(1, ["users.view", "users.edit"]);

			expect(result).toBe(true);
		});

		it("should return false when user lacks any required permission", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasAllPermissions(1, ["users.view", "roles.edit"]);

			expect(result).toBe(false);
		});

		it("should return true when permissions array is empty", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.hasAllPermissions(1, []);

			expect(result).toBe(true);
		});
	});

	describe("getUserPermissions", () => {
		it("should return permissions from role slug", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.getUserPermissions(1);

			expect(result).toEqual(["users.view"]);
			expect(activeUserDao.findById).toHaveBeenCalledWith(1);
			expect(roleDao.getRoleWithPermissionsBySlug).toHaveBeenCalledWith("member");
		});

		it("should load permissions fresh on each call", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result1 = await permissionService.getUserPermissions(1);
			const result2 = await permissionService.getUserPermissions(1);

			expect(result1).toEqual(["users.view"]);
			expect(result2).toEqual(["users.view"]);
			expect(activeUserDao.findById).toHaveBeenCalledTimes(2);
			expect(roleDao.getRoleWithPermissionsBySlug).toHaveBeenCalledTimes(2);
		});

		it("should fallback to default permissions when slug lookup returns nothing", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(undefined);

			const result = await permissionService.getUserPermissions(1);

			expect(result.length).toBeGreaterThan(0);
		});

		it("should return empty array when user is not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const result = await permissionService.getUserPermissions(999);

			expect(result).toEqual([]);
		});

		it("should return fallback permissions for owner role when slug not in DB", async () => {
			const ownerUser = { ...mockUser, role: "owner" as const, roleId: null };
			vi.mocked(activeUserDao.findById).mockResolvedValue(ownerUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(undefined);

			const result = await permissionService.getUserPermissions(1);

			expect(result).toContain("users.view");
			expect(result).toContain("users.edit");
			expect(result).toContain("roles.edit");
		});

		it("should return fallback permissions for admin role when slug not in DB", async () => {
			const adminUser = { ...mockUser, role: "admin" as const, roleId: null };
			vi.mocked(activeUserDao.findById).mockResolvedValue(adminUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(undefined);

			const result = await permissionService.getUserPermissions(1);

			expect(result).toContain("users.view");
			expect(result).toContain("users.edit");
			expect(result).not.toContain("roles.edit");
		});

		it("should return fallback permissions for member role when slug not in DB", async () => {
			const memberUser = { ...mockUser, role: "member" as const, roleId: null };
			vi.mocked(activeUserDao.findById).mockResolvedValue(memberUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(undefined);

			const result = await permissionService.getUserPermissions(1);

			expect(result).toContain("dashboard.view");
			expect(result).toContain("spaces.view");
			expect(result).not.toContain("users.view");
		});

		it("should return empty array for unknown role slug not in DB", async () => {
			const customRoleUser = { ...mockUser, role: "custom-role" as unknown as OrgUserRole, roleId: null };
			vi.mocked(activeUserDao.findById).mockResolvedValue(customRoleUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(undefined);

			const result = await permissionService.getUserPermissions(1);

			expect(result).toEqual([]);
		});
	});

	describe("getUserRole", () => {
		it("should return role with permissions", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result = await permissionService.getUserRole(1);

			expect(result).toEqual(mockRole);
		});

		it("should load role fresh on each call", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(mockRole);

			const result1 = await permissionService.getUserRole(1);
			const result2 = await permissionService.getUserRole(1);

			expect(result1).toEqual(mockRole);
			expect(result2).toEqual(mockRole);
			expect(activeUserDao.findById).toHaveBeenCalledTimes(2);
		});

		it("should return undefined when role slug not found in DB", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(mockUser);
			vi.mocked(roleDao.getRoleWithPermissionsBySlug).mockResolvedValue(undefined);

			const result = await permissionService.getUserRole(1);

			expect(result).toBeUndefined();
		});

		it("should return undefined when user is not found", async () => {
			vi.mocked(activeUserDao.findById).mockResolvedValue(undefined);

			const result = await permissionService.getUserRole(999);

			expect(result).toBeUndefined();
		});
	});

	describe("createPermissionService", () => {
		it("should create a PermissionService instance", () => {
			const service = createPermissionService(roleDaoProvider, activeUserDaoProvider);

			expect(service).toBeInstanceOf(PermissionService);
		});
	});
});
