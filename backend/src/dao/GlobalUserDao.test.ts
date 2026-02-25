import type { GlobalUser } from "../model/GlobalUser";
import type { ModelDef } from "../util/ModelDef";
import { createGlobalUserDao, type GlobalUserDao } from "./GlobalUserDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GlobalUserDao", () => {
	let mockGlobalUsers: ModelDef<GlobalUser>;
	let globalUserDao: GlobalUserDao;

	beforeEach(() => {
		mockGlobalUsers = {
			create: vi.fn(),
			findOne: vi.fn(),
			findByPk: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<GlobalUser>;

		const mockSequelize = {
			models: {
				GlobalUser: mockGlobalUsers,
			},
		} as unknown as Sequelize;

		globalUserDao = createGlobalUserDao(mockSequelize);
	});

	describe("findUserByEmail", () => {
		it("should return user when found", async () => {
			const user: GlobalUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(user),
			};

			vi.mocked(mockGlobalUsers.findOne).mockResolvedValue(mockUserInstance as never);

			const result = await globalUserDao.findUserByEmail("test@example.com");

			expect(mockGlobalUsers.findOne).toHaveBeenCalledWith({
				where: { email: "test@example.com" },
			});
			expect(mockUserInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(user);
		});

		it("should return undefined when user not found", async () => {
			vi.mocked(mockGlobalUsers.findOne).mockResolvedValue(null);

			const result = await globalUserDao.findUserByEmail("nonexistent@example.com");

			expect(result).toBeUndefined();
		});

		it("should normalize email to lowercase for lookup", async () => {
			const user: GlobalUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(user),
			};

			vi.mocked(mockGlobalUsers.findOne).mockResolvedValue(mockUserInstance as never);

			// Search with mixed-case email
			const result = await globalUserDao.findUserByEmail("Test@Example.COM");

			// Should search with lowercase email
			expect(mockGlobalUsers.findOne).toHaveBeenCalledWith({
				where: { email: "test@example.com" },
			});
			expect(result).toEqual(user);
		});
	});

	describe("findUserById", () => {
		it("should return user when found", async () => {
			const user: GlobalUser = {
				id: 1,
				email: "test@example.com",
				name: "Test User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(user),
			};

			vi.mocked(mockGlobalUsers.findByPk).mockResolvedValue(mockUserInstance as never);

			const result = await globalUserDao.findUserById(1);

			expect(mockGlobalUsers.findByPk).toHaveBeenCalledWith(1);
			expect(mockUserInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(user);
		});

		it("should return undefined when user not found", async () => {
			vi.mocked(mockGlobalUsers.findByPk).mockResolvedValue(null);

			const result = await globalUserDao.findUserById(999);

			expect(result).toBeUndefined();
		});
	});

	describe("createUser", () => {
		it("should create a new user", async () => {
			const newUser: GlobalUser = {
				id: 1,
				email: "new@example.com",
				name: "New User",
				isActive: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(newUser),
			};

			vi.mocked(mockGlobalUsers.create).mockResolvedValue(mockUserInstance as never);

			const result = await globalUserDao.createUser({
				email: "new@example.com",
				name: "New User",
				isActive: false,
			});

			expect(mockGlobalUsers.create).toHaveBeenCalledWith(
				{
					email: "new@example.com",
					name: "New User",
					isActive: false,
				},
				{ transaction: null },
			);
			expect(result).toEqual(newUser);
		});

		it("should default isActive to false when not provided", async () => {
			const newUser: GlobalUser = {
				id: 1,
				email: "new@example.com",
				name: "New User",
				isActive: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(newUser),
			};

			vi.mocked(mockGlobalUsers.create).mockResolvedValue(mockUserInstance as never);

			await globalUserDao.createUser({
				email: "new@example.com",
				name: "New User",
			});

			expect(mockGlobalUsers.create).toHaveBeenCalledWith(
				{
					email: "new@example.com",
					name: "New User",
					isActive: false,
				},
				{ transaction: null },
			);
		});

		it("should normalize email to lowercase when creating user", async () => {
			const newUser: GlobalUser = {
				id: 1,
				email: "new@example.com",
				name: "New User",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockUserInstance = {
				get: vi.fn().mockReturnValue(newUser),
			};

			vi.mocked(mockGlobalUsers.create).mockResolvedValue(mockUserInstance as never);

			// Create with mixed-case email
			await globalUserDao.createUser({
				email: "New@Example.COM",
				name: "New User",
				isActive: true,
			});

			// Should store with lowercase email
			expect(mockGlobalUsers.create).toHaveBeenCalledWith(
				{
					email: "new@example.com",
					name: "New User",
					isActive: true,
				},
				{ transaction: null },
			);
		});
	});

	describe("updateUser", () => {
		it("should update user fields", async () => {
			vi.mocked(mockGlobalUsers.update).mockResolvedValue([1] as never);

			await globalUserDao.updateUser(1, {
				name: "Updated Name",
				isActive: true,
			});

			expect(mockGlobalUsers.update).toHaveBeenCalledWith(
				{
					name: "Updated Name",
					isActive: true,
				},
				{
					where: { id: 1 },
				},
			);
		});
	});

	describe("deleteUser", () => {
		it("should delete user by id", async () => {
			vi.mocked(mockGlobalUsers.destroy).mockResolvedValue(1 as never);

			await globalUserDao.deleteUser(1);

			expect(mockGlobalUsers.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
			});
		});
	});
});
