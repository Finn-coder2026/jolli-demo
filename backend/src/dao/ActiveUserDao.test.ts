import type { Database } from "../core/Database";
import type { ActiveUser, NewActiveUser } from "../model/ActiveUser";
import { mockActiveUser } from "../model/ActiveUser.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type ActiveUserDao, createActiveUserDao, createActiveUserDaoProvider } from "./ActiveUserDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ActiveUserDao", () => {
	let mockActiveUsers: ModelDef<ActiveUser>;
	let mockSequelize: Sequelize;
	let activeUserDao: ReturnType<typeof createActiveUserDao>;

	beforeEach(() => {
		mockActiveUsers = {
			count: vi.fn(),
			create: vi.fn(),
			destroy: vi.fn(),
			findByPk: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
		} as unknown as ModelDef<ActiveUser>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockActiveUsers),
			query: vi.fn().mockResolvedValue([[], undefined]),
		} as unknown as Sequelize;

		activeUserDao = createActiveUserDao(mockSequelize);
	});

	describe("postSync", () => {
		it("should call postSyncActiveUsers", async () => {
			const mockDb = {} as Database;
			await activeUserDao.postSync(mockSequelize, mockDb);

			expect(mockSequelize.query).toHaveBeenCalled();
		});
	});

	describe("findById", () => {
		it("should return user when found", async () => {
			const user = mockActiveUser({ id: 1 });
			const mockUserInstance = { get: vi.fn().mockReturnValue(user) };
			vi.mocked(mockActiveUsers.findByPk).mockResolvedValue(mockUserInstance as never);

			const result = await activeUserDao.findById(1);

			expect(mockActiveUsers.findByPk).toHaveBeenCalledWith(1);
			expect(result).toEqual(user);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockActiveUsers.findByPk).mockResolvedValue(null);

			const result = await activeUserDao.findById(999);

			expect(result).toBeUndefined();
		});
	});

	describe("findByEmail", () => {
		it("should return user when found", async () => {
			const user = mockActiveUser({ email: "test@example.com" });
			const mockUserInstance = { get: vi.fn().mockReturnValue(user) };
			vi.mocked(mockActiveUsers.findOne).mockResolvedValue(mockUserInstance as never);

			const result = await activeUserDao.findByEmail("test@example.com");

			expect(mockActiveUsers.findOne).toHaveBeenCalledWith({ where: { email: "test@example.com" } });
			expect(result).toEqual(user);
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockActiveUsers.findOne).mockResolvedValue(null);

			const result = await activeUserDao.findByEmail("nonexistent@example.com");

			expect(result).toBeUndefined();
		});

		it("should normalize email to lowercase for lookup", async () => {
			const user = mockActiveUser({ email: "test@example.com" });
			const mockUserInstance = { get: vi.fn().mockReturnValue(user) };
			vi.mocked(mockActiveUsers.findOne).mockResolvedValue(mockUserInstance as never);

			// Search with mixed-case email
			const result = await activeUserDao.findByEmail("Test@Example.COM");

			// Should search with lowercase email
			expect(mockActiveUsers.findOne).toHaveBeenCalledWith({ where: { email: "test@example.com" } });
			expect(result).toEqual(user);
		});
	});

	describe("listActive", () => {
		it("should return active users sorted by createdAt ascending", async () => {
			const users = [mockActiveUser({ id: 1 }), mockActiveUser({ id: 2 })];
			const mockInstances = users.map(u => ({ get: vi.fn().mockReturnValue(u) }));
			vi.mocked(mockActiveUsers.findAll).mockResolvedValue(mockInstances as never);

			const result = await activeUserDao.listActive();

			expect(mockActiveUsers.findAll).toHaveBeenCalledWith({
				where: { isActive: true },
				order: [["createdAt", "ASC"]],
			});
			expect(result).toEqual(users);
		});

		it("should support pagination with limit and offset", async () => {
			const users = [mockActiveUser({ id: 1 })];
			const mockInstances = users.map(u => ({ get: vi.fn().mockReturnValue(u) }));
			vi.mocked(mockActiveUsers.findAll).mockResolvedValue(mockInstances as never);

			const result = await activeUserDao.listActive({ limit: 10, offset: 20 });

			expect(mockActiveUsers.findAll).toHaveBeenCalledWith({
				where: { isActive: true },
				order: [["createdAt", "ASC"]],
				limit: 10,
				offset: 20,
			});
			expect(result).toEqual(users);
		});
	});

	describe("listAll", () => {
		it("should return all users sorted by role priority then name", async () => {
			const users = [mockActiveUser({ id: 1 }), mockActiveUser({ id: 2, isActive: false })];
			const mockInstances = users.map(u => ({ get: vi.fn().mockReturnValue(u) }));
			vi.mocked(mockActiveUsers.findAll).mockResolvedValue(mockInstances as never);

			const result = await activeUserDao.listAll();

			// Verify findAll was called with role ordering (CASE statement) and name
			const callArgs = vi.mocked(mockActiveUsers.findAll).mock.calls[0][0];
			expect(callArgs).toBeDefined();
			const order = callArgs?.order as Array<[unknown, string]>;
			expect(order).toHaveLength(2);
			// First order element is a literal for role priority
			expect(order[0][1]).toBe("ASC");
			// Second order element is name
			expect(order[1]).toEqual(["name", "ASC"]);
			expect(result).toEqual(users);
		});

		it("should return paginated results when options provided", async () => {
			const users = [mockActiveUser({ id: 1 })];
			const mockInstances = users.map(u => ({ get: vi.fn().mockReturnValue(u) }));
			vi.mocked(mockActiveUsers.findAll).mockResolvedValue(mockInstances as never);

			const result = await activeUserDao.listAll({ limit: 10, offset: 20 });

			// Verify findAll was called with pagination and role ordering
			const callArgs = vi.mocked(mockActiveUsers.findAll).mock.calls[0][0];
			expect(callArgs?.limit).toBe(10);
			expect(callArgs?.offset).toBe(20);
			const order = callArgs?.order as Array<unknown>;
			expect(order).toHaveLength(2);
			expect(result).toEqual(users);
		});
	});

	describe("listByRole", () => {
		it("should return active users by role", async () => {
			const users = [mockActiveUser({ id: 1, role: "admin" })];
			const mockInstances = users.map(u => ({ get: vi.fn().mockReturnValue(u) }));
			vi.mocked(mockActiveUsers.findAll).mockResolvedValue(mockInstances as never);

			const result = await activeUserDao.listByRole("admin");

			expect(mockActiveUsers.findAll).toHaveBeenCalledWith({
				where: { role: "admin", isActive: true },
				order: [
					["name", "ASC"],
					["email", "ASC"],
				],
			});
			expect(result).toEqual(users);
		});
	});

	describe("create", () => {
		it("should create a user", async () => {
			const newUser: NewActiveUser = {
				id: 100,
				email: "new@example.com",
				role: "member",
				roleId: null,
				isActive: true,
				name: "New User",
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
			};
			const createdUser = mockActiveUser(newUser);
			const mockUserInstance = { get: vi.fn().mockReturnValue(createdUser) };
			vi.mocked(mockActiveUsers.create).mockResolvedValue(mockUserInstance as never);

			const result = await activeUserDao.create(newUser);

			expect(mockActiveUsers.create).toHaveBeenCalledWith(newUser, { transaction: null });
			expect(result).toEqual(createdUser);
		});

		it("should normalize email to lowercase when creating user", async () => {
			const newUser: NewActiveUser = {
				id: 100,
				email: "New@Example.COM",
				role: "member",
				roleId: null,
				isActive: true,
				name: "New User",
				image: null,
				jobTitle: null,
				phone: null,
				language: "en",
				timezone: "UTC",
				location: null,
			};
			const createdUser = mockActiveUser({ ...newUser, email: "new@example.com" });
			const mockUserInstance = { get: vi.fn().mockReturnValue(createdUser) };
			vi.mocked(mockActiveUsers.create).mockResolvedValue(mockUserInstance as never);

			const result = await activeUserDao.create(newUser);

			// Should create with lowercase email
			expect(mockActiveUsers.create).toHaveBeenCalledWith(
				{ ...newUser, email: "new@example.com" },
				{ transaction: null },
			);
			expect(result).toEqual(createdUser);
		});
	});

	describe("update", () => {
		it("should update user and return updated user", async () => {
			const user = mockActiveUser({ id: 1, name: "Updated Name" });
			const mockUserInstance = { get: vi.fn().mockReturnValue(user) };
			vi.mocked(mockActiveUsers.update).mockResolvedValue([1] as never);
			vi.mocked(mockActiveUsers.findByPk).mockResolvedValue(mockUserInstance as never);

			const result = await activeUserDao.update(1, { name: "Updated Name" });

			expect(mockActiveUsers.update).toHaveBeenCalledWith({ name: "Updated Name" }, { where: { id: 1 } });
			expect(result).toEqual(user);
		});

		it("should return undefined when no rows updated", async () => {
			vi.mocked(mockActiveUsers.update).mockResolvedValue([0] as never);

			const result = await activeUserDao.update(999, { name: "Updated Name" });

			expect(result).toBeUndefined();
		});
	});

	describe("deactivate", () => {
		it("should deactivate user and return true", async () => {
			vi.mocked(mockActiveUsers.update).mockResolvedValue([1] as never);

			const result = await activeUserDao.deactivate(1);

			expect(mockActiveUsers.update).toHaveBeenCalledWith({ isActive: false }, { where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false when no rows updated", async () => {
			vi.mocked(mockActiveUsers.update).mockResolvedValue([0] as never);

			const result = await activeUserDao.deactivate(999);

			expect(result).toBe(false);
		});
	});

	describe("reactivate", () => {
		it("should reactivate user and return true", async () => {
			vi.mocked(mockActiveUsers.update).mockResolvedValue([1] as never);

			const result = await activeUserDao.reactivate(1);

			expect(mockActiveUsers.update).toHaveBeenCalledWith({ isActive: true }, { where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false when no rows updated", async () => {
			vi.mocked(mockActiveUsers.update).mockResolvedValue([0] as never);

			const result = await activeUserDao.reactivate(999);

			expect(result).toBe(false);
		});
	});

	describe("delete", () => {
		it("should delete user and return true", async () => {
			vi.mocked(mockActiveUsers.destroy).mockResolvedValue(1);

			const result = await activeUserDao.delete(1);

			expect(mockActiveUsers.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false when no rows deleted", async () => {
			vi.mocked(mockActiveUsers.destroy).mockResolvedValue(0);

			const result = await activeUserDao.delete(999);

			expect(result).toBe(false);
		});
	});

	describe("countActive", () => {
		it("should return count of active users", async () => {
			vi.mocked(mockActiveUsers.count).mockResolvedValue(42);

			const result = await activeUserDao.countActive();

			expect(mockActiveUsers.count).toHaveBeenCalledWith({ where: { isActive: true } });
			expect(result).toBe(42);
		});
	});

	describe("countAll", () => {
		it("should return count of all users", async () => {
			vi.mocked(mockActiveUsers.count).mockResolvedValue(100);

			const result = await activeUserDao.countAll();

			expect(mockActiveUsers.count).toHaveBeenCalledWith();
			expect(result).toBe(100);
		});
	});

	describe("countByRole", () => {
		it("should return count of active users by role", async () => {
			vi.mocked(mockActiveUsers.count).mockResolvedValue(10);

			const result = await activeUserDao.countByRole("admin");

			expect(mockActiveUsers.count).toHaveBeenCalledWith({ where: { role: "admin", isActive: true } });
			expect(result).toBe(10);
		});
	});
});

describe("createActiveUserDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as ActiveUserDao;
		const provider = createActiveUserDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context activeUserDao when context has database", () => {
		const defaultDao = {} as ActiveUserDao;
		const contextActiveUserDao = {} as ActiveUserDao;
		const context = {
			database: {
				activeUserDao: contextActiveUserDao,
			},
		} as TenantOrgContext;

		const provider = createActiveUserDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextActiveUserDao);
	});
});
