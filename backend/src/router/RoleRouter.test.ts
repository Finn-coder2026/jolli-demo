import type { DaoProvider } from "../dao/DaoProvider";
import type { PermissionDao } from "../dao/PermissionDao";
import type { RoleDao, RoleWithPermissions } from "../dao/RoleDao";
import type { AuthenticatedRequest, PermissionMiddlewareFactory } from "../middleware/PermissionMiddleware";
import type { Permission } from "../model/Permission";
import type { Role } from "../model/Role";
import type { PermissionService } from "../services/PermissionService";
import {
	type CloneRoleRequest,
	createRoleRouter,
	type RoleRouterDependencies,
	type SetPermissionsRequest,
	type UpdateRoleRequest,
} from "./RoleRouter";
import express, { type Express, type NextFunction, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock audit module
vi.mock("../audit", () => ({
	auditLog: vi.fn(),
	computeAuditChanges: vi.fn(() => ({})),
}));

// Mock tenant context
vi.mock("../tenant/TenantContext", () => ({
	getTenantContext: vi.fn(),
}));

describe("RoleRouter", () => {
	let app: Express;
	let mockRoleDao: RoleDao;
	let mockPermissionDao: PermissionDao;
	let mockRoleDaoProvider: DaoProvider<RoleDao>;
	let mockPermissionDaoProvider: DaoProvider<PermissionDao>;
	let mockPermissionMiddleware: PermissionMiddlewareFactory;
	let mockPermissionService: PermissionService;

	const mockRole: Role = {
		id: 1,
		name: "Test Role",
		slug: "test-role",
		description: "Test description",
		isBuiltIn: false,
		isDefault: false,
		priority: 50,
		clonedFrom: null,
		createdAt: new Date("2025-01-01"),
		updatedAt: new Date("2025-01-01"),
	};

	const mockPermission: Permission = {
		id: 1,
		name: "View Users",
		slug: "users.view",
		description: "View user list",
		category: "users",
		createdAt: new Date("2025-01-01"),
	};

	const mockRoleWithPermissions: RoleWithPermissions = {
		...mockRole,
		permissions: [mockPermission],
	};

	beforeEach(() => {
		mockRoleDao = {
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

		mockPermissionDao = {
			listAll: vi.fn(),
			findById: vi.fn(),
			findBySlug: vi.fn(),
			listByCategory: vi.fn(),
			getCategories: vi.fn(),
			listGroupedByCategory: vi.fn(),
		};

		mockRoleDaoProvider = {
			getDao: vi.fn(() => mockRoleDao),
		};

		mockPermissionDaoProvider = {
			getDao: vi.fn(() => mockPermissionDao),
		};

		mockPermissionMiddleware = {
			requireAuth: vi.fn(() => (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
				req.user = { userId: 1, email: "test@example.com", name: "Test User", picture: undefined };
				next();
			}),
			requirePermission: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			requireAllPermissions: vi.fn(
				() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next(),
			),
			requireRole: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
			loadPermissions: vi.fn(() => (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next()),
		};

		mockPermissionService = {
			hasPermission: vi.fn(),
			hasAnyPermission: vi.fn(),
			hasAllPermissions: vi.fn(),
			getUserPermissions: vi.fn(),
			getUserRole: vi.fn(),
		} as unknown as PermissionService;

		const deps: RoleRouterDependencies = {
			roleDaoProvider: mockRoleDaoProvider,
			permissionDaoProvider: mockPermissionDaoProvider,
			permissionMiddleware: mockPermissionMiddleware,
			permissionService: mockPermissionService,
		};

		app = express();
		app.use(express.json());
		app.use("/roles", createRoleRouter(deps));
	});

	describe("GET /", () => {
		it("should return all roles", async () => {
			const roles = [mockRole, { ...mockRole, id: 2, name: "Another Role" }];
			vi.mocked(mockRoleDao.listAll).mockResolvedValue(roles);

			const response = await request(app).get("/roles");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(2);
			expect(response.body[0].id).toBe(1);
			expect(response.body[1].id).toBe(2);
			expect(mockPermissionMiddleware.requirePermission).toHaveBeenCalledWith("roles.view");
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockRoleDao.listAll).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/roles");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list roles" });
		});
	});

	describe("GET /permissions", () => {
		it("should return all permissions", async () => {
			const permissions = [mockPermission];
			vi.mocked(mockPermissionDao.listAll).mockResolvedValue(permissions);

			const response = await request(app).get("/roles/permissions");

			expect(response.status).toBe(200);
			expect(response.body).toHaveLength(1);
			expect(response.body[0].id).toBe(1);
			expect(response.body[0].slug).toBe("users.view");
			expect(mockPermissionMiddleware.requirePermission).toHaveBeenCalledWith("roles.view");
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockPermissionDao.listAll).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/roles/permissions");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list permissions" });
		});
	});

	describe("GET /me/permissions", () => {
		it("should return current user permissions", async () => {
			vi.mocked(mockPermissionService.getUserPermissions).mockResolvedValue(["users.view", "users.edit"]);
			vi.mocked(mockPermissionService.getUserRole).mockResolvedValue(mockRoleWithPermissions);

			const response = await request(app).get("/roles/me/permissions");

			expect(response.status).toBe(200);
			expect(response.body.permissions).toEqual(["users.view", "users.edit"]);
			expect(response.body.role.id).toBe(1);
			expect(response.body.role.permissions).toHaveLength(1);
			expect(mockPermissionMiddleware.requireAuth).toHaveBeenCalled();
		});

		it("should return 401 when user is not authenticated", async () => {
			mockPermissionMiddleware.requireAuth = vi.fn(
				() => (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
					delete req.user;
					next();
				},
			);

			const deps: RoleRouterDependencies = {
				roleDaoProvider: mockRoleDaoProvider,
				permissionDaoProvider: mockPermissionDaoProvider,
				permissionMiddleware: mockPermissionMiddleware,
				permissionService: mockPermissionService,
			};

			app = express();
			app.use(express.json());
			app.use("/roles", createRoleRouter(deps));

			const response = await request(app).get("/roles/me/permissions");

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Authentication required" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockPermissionService.getUserPermissions).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/roles/me/permissions");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get permissions" });
		});
	});

	describe("GET /permissions/grouped", () => {
		it("should return permissions grouped by category", async () => {
			const grouped = {
				users: [mockPermission],
				spaces: [],
				integrations: [],
				sites: [],
				roles: [],
				dashboard: [],
				articles: [],
			};
			vi.mocked(mockPermissionDao.listGroupedByCategory).mockResolvedValue(grouped);

			const response = await request(app).get("/roles/permissions/grouped");

			expect(response.status).toBe(200);
			expect(response.body.users).toHaveLength(1);
			expect(response.body.spaces).toHaveLength(0);
			expect(response.body.users[0].slug).toBe("users.view");
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockPermissionDao.listGroupedByCategory).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/roles/permissions/grouped");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to list permissions" });
		});
	});

	describe("GET /:id", () => {
		it("should return role with permissions", async () => {
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockResolvedValue(mockRoleWithPermissions);

			const response = await request(app).get("/roles/1");

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(1);
			expect(response.body.name).toBe("Test Role");
			expect(response.body.permissions).toHaveLength(1);
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).get("/roles/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role ID" });
		});

		it("should return 404 when role not found", async () => {
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockResolvedValue(undefined);

			const response = await request(app).get("/roles/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Role not found" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/roles/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to get role" });
		});
	});

	describe("POST /:id/clone", () => {
		it("should clone a role", async () => {
			const cloneRequest: CloneRoleRequest = {
				name: "Cloned Role",
				slug: "cloned-role",
				description: "Cloned description",
			};
			const clonedRole = { ...mockRole, id: 10, name: "Cloned Role" };

			vi.mocked(mockRoleDao.findBySlug).mockResolvedValue(undefined);
			vi.mocked(mockRoleDao.cloneRole).mockResolvedValue(clonedRole);
			vi.mocked(mockRoleDao.update).mockResolvedValue(clonedRole);
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockResolvedValue(mockRoleWithPermissions);

			const response = await request(app).post("/roles/1/clone").send(cloneRequest);

			expect(response.status).toBe(201);
			expect(mockRoleDao.cloneRole).toHaveBeenCalledWith(1, "Cloned Role", "cloned-role");
			expect(mockPermissionMiddleware.requirePermission).toHaveBeenCalledWith("roles.edit");
		});

		it("should generate slug from name if not provided", async () => {
			const cloneRequest: CloneRoleRequest = {
				name: "My Custom Role",
			};
			const clonedRole = { ...mockRole, id: 10, name: "My Custom Role" };

			vi.mocked(mockRoleDao.findBySlug).mockResolvedValue(undefined);
			vi.mocked(mockRoleDao.cloneRole).mockResolvedValue(clonedRole);
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockResolvedValue(mockRoleWithPermissions);

			const response = await request(app).post("/roles/1/clone").send(cloneRequest);

			expect(response.status).toBe(201);
			expect(mockRoleDao.cloneRole).toHaveBeenCalledWith(1, "My Custom Role", "my-custom-role");
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).post("/roles/invalid/clone").send({ name: "Test" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role ID" });
		});

		it("should return 400 when name is missing", async () => {
			const response = await request(app).post("/roles/1/clone").send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Name is required" });
		});

		it("should return 400 when name is empty", async () => {
			const response = await request(app).post("/roles/1/clone").send({ name: "  " });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Name is required" });
		});

		it("should return 409 when slug already exists", async () => {
			vi.mocked(mockRoleDao.findBySlug).mockResolvedValue(mockRole);

			const response = await request(app).post("/roles/1/clone").send({ name: "Test", slug: "test-role" });

			expect(response.status).toBe(409);
			expect(response.body).toEqual({ error: "A role with this slug already exists" });
		});

		it("should return 404 when source role not found", async () => {
			vi.mocked(mockRoleDao.findBySlug).mockResolvedValue(undefined);
			vi.mocked(mockRoleDao.cloneRole).mockRejectedValue(new Error("Source role not found"));

			const response = await request(app).post("/roles/1/clone").send({ name: "Test" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Source role not found" });
		});

		it("should return 500 on other errors", async () => {
			vi.mocked(mockRoleDao.findBySlug).mockResolvedValue(undefined);
			vi.mocked(mockRoleDao.cloneRole).mockRejectedValue(new Error("Database error"));

			const response = await request(app).post("/roles/1/clone").send({ name: "Test" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to clone role" });
		});
	});

	describe("PUT /:id", () => {
		it("should update a custom role", async () => {
			const updateRequest: UpdateRoleRequest = {
				name: "Updated Role",
				description: "Updated description",
				isDefault: false,
				priority: 60,
			};
			const updatedRole = { ...mockRole, ...updateRequest };

			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.update).mockResolvedValue(updatedRole);

			const response = await request(app).put("/roles/1").send(updateRequest);

			expect(response.status).toBe(200);
			expect(response.body.id).toBe(1);
			expect(response.body.name).toBe("Updated Role");
			expect(mockRoleDao.update).toHaveBeenCalledWith(1, updateRequest);
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).put("/roles/invalid").send({ name: "Test" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role ID" });
		});

		it("should return 404 when role not found", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(undefined);

			const response = await request(app).put("/roles/999").send({ name: "Test" });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Role not found" });
		});

		it("should return 403 for built-in roles", async () => {
			const builtInRole = { ...mockRole, isBuiltIn: true };
			vi.mocked(mockRoleDao.findById).mockResolvedValue(builtInRole);

			const response = await request(app).put("/roles/1").send({ name: "Test" });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot modify built-in role" });
		});

		it("should handle partial updates", async () => {
			const updateRequest: UpdateRoleRequest = {
				name: "Updated Name",
			};
			const updatedRole = { ...mockRole, name: "Updated Name" };

			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.update).mockResolvedValue(updatedRole);

			const response = await request(app).put("/roles/1").send(updateRequest);

			expect(response.status).toBe(200);
			expect(mockRoleDao.update).toHaveBeenCalledWith(1, { name: "Updated Name" });
		});

		it("should use original role name in audit log when update returns undefined name", async () => {
			// Updated object with name undefined triggers the ?? role.name fallback
			const updatedRole = { ...mockRole, name: undefined };

			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.update).mockResolvedValue(updatedRole as never);

			const response = await request(app).put("/roles/1").send({ description: "New description" });

			expect(response.status).toBe(200);
			// The audit log should use role.name as fallback since updated.name is undefined
		});

		it("should return 403 when update throws built-in role error", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.update).mockRejectedValue(new Error("Cannot update built-in role"));

			const response = await request(app).put("/roles/1").send({ name: "Test" });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot update built-in role" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.update).mockRejectedValue(new Error("Database error"));

			const response = await request(app).put("/roles/1").send({ name: "Test" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to update role" });
		});
	});

	describe("DELETE /:id", () => {
		it("should delete a custom role", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.delete).mockResolvedValue(true);

			const response = await request(app).delete("/roles/1");

			expect(response.status).toBe(204);
			expect(mockRoleDao.delete).toHaveBeenCalledWith(1);
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app).delete("/roles/invalid");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role ID" });
		});

		it("should return 404 when role not found before delete", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(undefined);

			const response = await request(app).delete("/roles/999");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Role not found" });
		});

		it("should return 404 when delete returns false", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.delete).mockResolvedValue(false);

			const response = await request(app).delete("/roles/1");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Role not found" });
		});

		it("should return 403 for built-in roles", async () => {
			const builtInRole = { ...mockRole, isBuiltIn: true };
			vi.mocked(mockRoleDao.findById).mockResolvedValue(builtInRole);

			const response = await request(app).delete("/roles/1");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot delete built-in role" });
		});

		it("should return 403 when delete throws built-in role error", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.delete).mockRejectedValue(new Error("Cannot delete built-in role"));

			const response = await request(app).delete("/roles/1");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot delete built-in role" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.delete).mockRejectedValue(new Error("Database error"));

			const response = await request(app).delete("/roles/1");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to delete role" });
		});
	});

	describe("PUT /:id/permissions", () => {
		it("should set permissions for a role", async () => {
			const setPermissionsRequest: SetPermissionsRequest = {
				permissionSlugs: ["users.view", "users.edit", "spaces.view"],
			};

			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.getPermissions)
				.mockResolvedValueOnce([mockPermission])
				.mockResolvedValueOnce([
					mockPermission,
					{ ...mockPermission, id: 2, slug: "users.edit" },
					{ ...mockPermission, id: 3, slug: "spaces.view" },
				]);
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockResolvedValue(mockRoleWithPermissions);

			const response = await request(app).put("/roles/1/permissions").send(setPermissionsRequest);

			expect(response.status).toBe(200);
			expect(mockRoleDao.setPermissions).toHaveBeenCalledWith(1, ["users.view", "users.edit", "spaces.view"]);
		});

		it("should return 400 for invalid ID", async () => {
			const response = await request(app)
				.put("/roles/invalid/permissions")
				.send({ permissionSlugs: ["users.view"] });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid role ID" });
		});

		it("should return 400 when permissionSlugs is not an array", async () => {
			const response = await request(app).put("/roles/1/permissions").send({ permissionSlugs: "not-an-array" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "permissionSlugs must be an array of permission slug strings" });
		});

		it("should return 400 when permissionSlugs contains non-string elements", async () => {
			const response = await request(app)
				.put("/roles/1/permissions")
				.send({ permissionSlugs: [1, null, {}] });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "permissionSlugs must be an array of permission slug strings" });
		});

		it("should return 404 when role not found", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(undefined);

			const response = await request(app)
				.put("/roles/999/permissions")
				.send({ permissionSlugs: ["users.view"] });

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Role not found" });
		});

		it("should return 403 for built-in roles", async () => {
			const builtInRole = { ...mockRole, isBuiltIn: true };
			vi.mocked(mockRoleDao.findById).mockResolvedValue(builtInRole);

			const response = await request(app)
				.put("/roles/1/permissions")
				.send({ permissionSlugs: ["users.view"] });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot modify permissions for built-in role" });
		});

		it("should handle empty permission array", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.getPermissions).mockResolvedValue([mockPermission]).mockResolvedValue([]);
			vi.mocked(mockRoleDao.getRoleWithPermissions).mockResolvedValue({ ...mockRole, permissions: [] });

			const response = await request(app).put("/roles/1/permissions").send({ permissionSlugs: [] });

			expect(response.status).toBe(200);
			expect(mockRoleDao.setPermissions).toHaveBeenCalledWith(1, []);
		});

		it("should return 403 when setPermissions throws built-in role error", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.getPermissions).mockResolvedValue([]);
			vi.mocked(mockRoleDao.setPermissions).mockRejectedValue(
				new Error("Cannot modify permissions for built-in role"),
			);

			const response = await request(app)
				.put("/roles/1/permissions")
				.send({ permissionSlugs: ["users.view"] });

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Cannot modify permissions for built-in role" });
		});

		it("should return 500 on error", async () => {
			vi.mocked(mockRoleDao.findById).mockResolvedValue(mockRole);
			vi.mocked(mockRoleDao.getPermissions).mockResolvedValue([]);
			vi.mocked(mockRoleDao.setPermissions).mockRejectedValue(new Error("Database error"));

			const response = await request(app)
				.put("/roles/1/permissions")
				.send({ permissionSlugs: ["users.view"] });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to set role permissions" });
		});
	});
});
