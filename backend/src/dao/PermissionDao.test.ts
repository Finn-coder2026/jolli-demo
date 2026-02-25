import { BUILT_IN_PERMISSIONS, PERMISSION_CATEGORIES } from "../model/Permission";
import { createPermissionDao, createPermissionDaoProvider } from "./PermissionDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("PermissionDao", () => {
	let mockSequelize: Sequelize;
	let mockModel: {
		findAll: ReturnType<typeof vi.fn>;
		findOne: ReturnType<typeof vi.fn>;
		findByPk: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		mockModel = {
			findAll: vi.fn(),
			findOne: vi.fn(),
			findByPk: vi.fn(),
			create: vi.fn(),
		};

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockModel),
			models: {},
		} as unknown as Sequelize;
	});

	describe("listAll", () => {
		it("should list all permissions ordered by category and name", async () => {
			const mockPermissions = [
				{ get: vi.fn().mockReturnValue({ id: 1, slug: "users.view", name: "View Users", category: "users" }) },
				{
					get: vi.fn().mockReturnValue({ id: 2, slug: "users.edit", name: "Edit Users", category: "users" }),
				},
			];
			mockModel.findAll.mockResolvedValue(mockPermissions);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.listAll();

			expect(mockModel.findAll).toHaveBeenCalledWith({
				order: [
					["category", "ASC"],
					["name", "ASC"],
				],
			});
			expect(result).toEqual([
				{ id: 1, slug: "users.view", name: "View Users", category: "users" },
				{ id: 2, slug: "users.edit", name: "Edit Users", category: "users" },
			]);
		});
	});

	describe("findById", () => {
		it("should return permission when found", async () => {
			const mockPermission = {
				get: vi.fn().mockReturnValue({ id: 1, slug: "users.view", name: "View Users", category: "users" }),
			};
			mockModel.findByPk.mockResolvedValue(mockPermission);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.findById(1);

			expect(mockModel.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual({ id: 1, slug: "users.view", name: "View Users", category: "users" });
		});

		it("should return undefined when not found", async () => {
			mockModel.findByPk.mockResolvedValue(null);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.findById(999);

			expect(mockModel.findByPk).toHaveBeenCalledWith(999);
			expect(result).toBeUndefined();
		});
	});

	describe("findBySlug", () => {
		it("should return permission when found", async () => {
			const mockPermission = {
				get: vi.fn().mockReturnValue({ id: 1, slug: "users.view", name: "View Users", category: "users" }),
			};
			mockModel.findOne.mockResolvedValue(mockPermission);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.findBySlug("users.view");

			expect(mockModel.findOne).toHaveBeenCalledWith({ where: { slug: "users.view" } });
			expect(result).toEqual({ id: 1, slug: "users.view", name: "View Users", category: "users" });
		});

		it("should return undefined when not found", async () => {
			mockModel.findOne.mockResolvedValue(null);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.findBySlug("nonexistent.permission");

			expect(mockModel.findOne).toHaveBeenCalledWith({ where: { slug: "nonexistent.permission" } });
			expect(result).toBeUndefined();
		});
	});

	describe("listByCategory", () => {
		it("should list permissions by category ordered by name", async () => {
			const mockPermissions = [
				{
					get: vi.fn().mockReturnValue({ id: 2, slug: "users.edit", name: "Edit Users", category: "users" }),
				},
				{ get: vi.fn().mockReturnValue({ id: 1, slug: "users.view", name: "View Users", category: "users" }) },
			];
			mockModel.findAll.mockResolvedValue(mockPermissions);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.listByCategory("users");

			expect(mockModel.findAll).toHaveBeenCalledWith({
				where: { category: "users" },
				order: [["name", "ASC"]],
			});
			expect(result).toEqual([
				{ id: 2, slug: "users.edit", name: "Edit Users", category: "users" },
				{ id: 1, slug: "users.view", name: "View Users", category: "users" },
			]);
		});
	});

	describe("getCategories", () => {
		it("should return all permission categories", () => {
			const dao = createPermissionDao(mockSequelize);
			const result = dao.getCategories();

			expect(result).toEqual(PERMISSION_CATEGORIES);
		});
	});

	describe("listGroupedByCategory", () => {
		it("should group permissions by category", async () => {
			const mockPermissions = [
				{ get: vi.fn().mockReturnValue({ id: 1, slug: "users.view", name: "View Users", category: "users" }) },
				{
					get: vi
						.fn()
						.mockReturnValue({ id: 2, slug: "spaces.view", name: "View Spaces", category: "spaces" }),
				},
				{
					get: vi.fn().mockReturnValue({ id: 3, slug: "users.edit", name: "Edit Users", category: "users" }),
				},
			];
			mockModel.findAll.mockResolvedValue(mockPermissions);

			const dao = createPermissionDao(mockSequelize);
			const result = await dao.listGroupedByCategory();

			expect(result.users).toEqual([
				{ id: 1, slug: "users.view", name: "View Users", category: "users" },
				{ id: 3, slug: "users.edit", name: "Edit Users", category: "users" },
			]);
			expect(result.spaces).toEqual([{ id: 2, slug: "spaces.view", name: "View Spaces", category: "spaces" }]);
			expect(result.integrations).toEqual([]);
			expect(result.sites).toEqual([]);
			expect(result.roles).toEqual([]);
			expect(result.dashboard).toEqual([]);
			expect(result.articles).toEqual([]);
		});
	});

	describe("postSync", () => {
		it("should seed built-in permissions that do not exist", async () => {
			mockModel.findOne.mockResolvedValue(null);
			mockModel.create.mockResolvedValue({});

			const dao = createPermissionDao(mockSequelize);
			await dao.postSync(mockSequelize, {} as never);

			expect(mockModel.findOne).toHaveBeenCalledTimes(BUILT_IN_PERMISSIONS.length);
			expect(mockModel.create).toHaveBeenCalledTimes(BUILT_IN_PERMISSIONS.length);
		});

		it("should not seed permissions that already exist", async () => {
			mockModel.findOne.mockResolvedValue({ id: 1 });

			const dao = createPermissionDao(mockSequelize);
			await dao.postSync(mockSequelize, {} as never);

			expect(mockModel.findOne).toHaveBeenCalledTimes(BUILT_IN_PERMISSIONS.length);
			expect(mockModel.create).not.toHaveBeenCalled();
		});

		it("should seed some permissions if only some exist", async () => {
			let callCount = 0;
			mockModel.findOne.mockImplementation(() => {
				callCount++;
				return callCount % 2 === 0 ? { id: 1 } : null;
			});
			mockModel.create.mockResolvedValue({});

			const dao = createPermissionDao(mockSequelize);
			await dao.postSync(mockSequelize, {} as never);

			expect(mockModel.findOne).toHaveBeenCalledTimes(BUILT_IN_PERMISSIONS.length);
			expect(mockModel.create).toHaveBeenCalled();
		});
	});

	describe("createPermissionDaoProvider", () => {
		it("should return context dao when context is provided", () => {
			const defaultDao = createPermissionDao(mockSequelize);
			const contextDao = createPermissionDao(mockSequelize);

			const provider = createPermissionDaoProvider(defaultDao);
			const result = provider.getDao({ database: { permissionDao: contextDao } } as never);

			expect(result).toBe(contextDao);
		});

		it("should return default dao when context is undefined", () => {
			const defaultDao = createPermissionDao(mockSequelize);

			const provider = createPermissionDaoProvider(defaultDao);
			const result = provider.getDao(undefined);

			expect(result).toBe(defaultDao);
		});

		it("should return default dao when context database does not have permissionDao", () => {
			const defaultDao = createPermissionDao(mockSequelize);

			const provider = createPermissionDaoProvider(defaultDao);
			const result = provider.getDao({ database: {} } as never);

			expect(result).toBe(defaultDao);
		});
	});
});
