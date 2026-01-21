import type { NewUser, User } from "../model/User";
import { mockUser } from "../model/User.mock";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { createUserDao, createUserDaoProvider, type UserDao } from "./UserDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("UserDao", () => {
	let mockUsers: ModelDef<User>;
	let userDao: UserDao;

	beforeEach(() => {
		mockUsers = {
			count: vi.fn(),
			create: vi.fn(),
			findOne: vi.fn(),
			update: vi.fn(),
		} as unknown as ModelDef<User>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockUsers),
		} as unknown as Sequelize;

		userDao = createUserDao(mockSequelize);
	});

	describe("findUser", () => {
		it("should return user when found", async () => {
			const user = mockUser({
				id: 1,
				email: "test@example.com",
				name: "Test User",
			});

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(user),
			};

			vi.mocked(mockUsers.findOne).mockResolvedValue(mockUserInstance as never);

			const result = await userDao.findUser("test@example.com");

			expect(mockUsers.findOne).toHaveBeenCalledWith({
				where: { email: "test@example.com" },
			});
			expect(mockUserInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(user);
		});

		it("should return undefined when user not found", async () => {
			vi.mocked(mockUsers.findOne).mockResolvedValue(null);

			const result = await userDao.findUser("nonexistent@example.com");

			expect(mockUsers.findOne).toHaveBeenCalledWith({
				where: { email: "nonexistent@example.com" },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("findUserById", () => {
		it("should return user when found", async () => {
			const user = mockUser({
				id: 42,
				email: "test@example.com",
				name: "Test User",
			});

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(user),
			};

			vi.mocked(mockUsers.findOne).mockResolvedValue(mockUserInstance as never);

			const result = await userDao.findUserById(42);

			expect(mockUsers.findOne).toHaveBeenCalledWith({
				where: { id: 42 },
			});
			expect(mockUserInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(user);
		});

		it("should return undefined when user not found", async () => {
			vi.mocked(mockUsers.findOne).mockResolvedValue(null);

			const result = await userDao.findUserById(999);

			expect(mockUsers.findOne).toHaveBeenCalledWith({
				where: { id: 999 },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("createUser", () => {
		it("should create a user", async () => {
			const newUser: NewUser = {
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.jpg",
			};

			const createdUser = mockUser({
				...newUser,
				id: 1,
			});

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(createdUser),
			};

			vi.mocked(mockUsers.create).mockResolvedValue(mockUserInstance as never);

			const result = await userDao.createUser(newUser);

			expect(mockUsers.create).toHaveBeenCalledWith(newUser);
			expect(mockUserInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(createdUser);
		});
	});

	describe("updateUser", () => {
		it("should update a user", async () => {
			const user = mockUser({
				id: 1,
				email: "test@example.com",
				name: "Updated Name",
			});

			vi.mocked(mockUsers.update).mockResolvedValue([1] as never);

			const result = await userDao.updateUser(user);

			expect(mockUsers.update).toHaveBeenCalledWith(user, {
				where: { id: 1 },
			});
			expect(result).toEqual(user);
		});
	});

	describe("countUsers", () => {
		it("should return the user count", async () => {
			vi.mocked(mockUsers.count).mockResolvedValue(42);

			const result = await userDao.countUsers();

			expect(mockUsers.count).toHaveBeenCalled();
			expect(result).toBe(42);
		});
	});
});

describe("createUserDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as UserDao;
		const provider = createUserDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context userDao when context has database", () => {
		const defaultDao = {} as UserDao;
		const contextUserDao = {} as UserDao;
		const context = {
			database: {
				userDao: contextUserDao,
			},
		} as TenantOrgContext;

		const provider = createUserDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextUserDao);
	});
});
