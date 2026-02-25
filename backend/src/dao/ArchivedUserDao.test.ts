import type { Database } from "../core/Database";
import type { ArchivedUser, NewArchivedUser } from "../model/ArchivedUser";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import { type ArchivedUserDao, createArchivedUserDao, createArchivedUserDaoProvider } from "./ArchivedUserDao";
import { Op, type Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ArchivedUserDao", () => {
	let mockArchivedUserModel: ModelDef<ArchivedUser>;
	let mockSequelize: Sequelize;
	let archivedUserDao: ReturnType<typeof createArchivedUserDao>;

	beforeEach(() => {
		mockArchivedUserModel = {
			count: vi.fn(),
			create: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<ArchivedUser>;

		mockSequelize = {
			define: vi.fn().mockReturnValue(mockArchivedUserModel),
			query: vi.fn(),
		} as unknown as Sequelize;

		archivedUserDao = createArchivedUserDao(mockSequelize);
	});

	describe("postSync", () => {
		it("should call postSyncArchivedUsers", async () => {
			const mockDb = {} as Database;
			await archivedUserDao.postSync(mockSequelize, mockDb);

			expect(mockSequelize.query).toHaveBeenCalled();
		});
	});

	describe("findById", () => {
		it("should return archived record when found", async () => {
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: null,
					removed_at: "2024-01-01T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.findById(1);

			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("WHERE au.id = ?"), {
				replacements: [1],
			});
			expect(result).toEqual({
				id: 1,
				userId: 100,
				email: "archived@example.com",
				name: "Archived User",
				role: "member",
				removedBy: 1,
				removedByName: "Admin User",
				reason: null,
				removedAt: expect.any(Date),
			});
		});

		it("should return undefined when not found", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([[], []]);

			const result = await archivedUserDao.findById(999);

			expect(result).toBeUndefined();
		});
	});

	describe("findByUserId", () => {
		it("should return archived records for user ID", async () => {
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: null,
					removed_at: "2024-01-01T00:00:00Z",
				},
				{
					id: 2,
					user_id: 100,
					email: "archived2@example.com",
					name: "Archived User 2",
					role: "admin",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: "Reason",
					removed_at: "2024-01-02T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.findByUserId(100);

			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("WHERE au.user_id = ?"), {
				replacements: [100],
			});
			expect(result).toHaveLength(2);
			expect(result[0].userId).toBe(100);
			expect(result[0].removedByName).toBe("Admin User");
		});
	});

	describe("listAll", () => {
		it("should return all archived records ordered by removedAt ASC", async () => {
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: null,
					removed_at: "2024-01-01T00:00:00Z",
				},
				{
					id: 2,
					user_id: 101,
					email: "archived2@example.com",
					name: "Archived User 2",
					role: "admin",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: "Reason",
					removed_at: "2024-01-02T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.listAll();

			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY au.removed_at ASC"), {
				replacements: [],
			});
			expect(result).toHaveLength(2);
			expect(result[0].removedByName).toBe("Admin User");
		});

		it("should support pagination options", async () => {
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: null,
					removed_at: "2024-01-01T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.listAll({ limit: 10, offset: 5 });

			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("LIMIT ?"), {
				replacements: [10, 5],
			});
			expect(result).toHaveLength(1);
		});
	});

	describe("listByRemover", () => {
		it("should return records removed by specific user", async () => {
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 5,
					removed_by_name: "Admin User",
					reason: null,
					removed_at: "2024-01-01T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.listByRemover(5);

			expect(mockSequelize.query).toHaveBeenCalledWith(expect.stringContaining("WHERE au.removed_by = ?"), {
				replacements: [5],
			});
			expect(result).toHaveLength(1);
			expect(result[0].removedBy).toBe(5);
			expect(result[0].removedByName).toBe("Admin User");
		});
	});

	describe("listByDateRange", () => {
		it("should return records within date range", async () => {
			const startDate = new Date("2024-01-01");
			const endDate = new Date("2024-12-31");
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: null,
					removed_at: "2024-06-01T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.listByDateRange(startDate, endDate);

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("WHERE au.removed_at >= ? AND au.removed_at <= ?"),
				{
					replacements: [startDate, endDate],
				},
			);
			expect(result).toHaveLength(1);
			expect(result[0].removedByName).toBe("Admin User");
		});
	});

	describe("create", () => {
		it("should create an archived record and return with removedByName", async () => {
			const newArchived: NewArchivedUser = {
				userId: 100,
				email: "archived@example.com",
				name: "Archived User",
				role: "member",
				removedBy: 1,
				reason: "Left the company",
				removedAt: new Date(),
			};
			const mockInstance = { get: vi.fn().mockReturnValue(1) };
			vi.mocked(mockArchivedUserModel.create).mockResolvedValue(mockInstance as never);

			// Mock the findById query that happens after create
			const queryResult = [
				{
					id: 1,
					user_id: 100,
					email: "archived@example.com",
					name: "Archived User",
					role: "member",
					removed_by: 1,
					removed_by_name: "Admin User",
					reason: "Left the company",
					removed_at: "2024-01-01T00:00:00Z",
				},
			];
			vi.mocked(mockSequelize.query).mockResolvedValue([queryResult, queryResult]);

			const result = await archivedUserDao.create(newArchived);

			expect(mockArchivedUserModel.create).toHaveBeenCalledWith(newArchived);
			expect(result.removedByName).toBe("Admin User");
		});

		it("should throw error if findById returns undefined after creation", async () => {
			const newArchived: NewArchivedUser = {
				userId: 100,
				email: "archived@example.com",
				name: "Archived User",
				role: "member",
				removedBy: 1,
				reason: "Left the company",
				removedAt: new Date(),
			};
			const mockInstance = { get: vi.fn().mockReturnValue(999) };
			vi.mocked(mockArchivedUserModel.create).mockResolvedValue(mockInstance as never);

			// Mock findById to return empty result (simulating fetch failure)
			vi.mocked(mockSequelize.query).mockResolvedValue([[], []]);

			await expect(archivedUserDao.create(newArchived)).rejects.toThrow(
				"Failed to fetch newly created archived user with id 999",
			);
		});
	});

	describe("delete", () => {
		it("should delete archived record and return true", async () => {
			vi.mocked(mockArchivedUserModel.destroy).mockResolvedValue(1);

			const result = await archivedUserDao.delete(1);

			expect(mockArchivedUserModel.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
			expect(result).toBe(true);
		});

		it("should return false when no rows deleted", async () => {
			vi.mocked(mockArchivedUserModel.destroy).mockResolvedValue(0);

			const result = await archivedUserDao.delete(999);

			expect(result).toBe(false);
		});
	});

	describe("deleteOlderThan", () => {
		it("should delete records older than specified days", async () => {
			vi.mocked(mockArchivedUserModel.destroy).mockResolvedValue(10);

			const result = await archivedUserDao.deleteOlderThan(30);

			expect(mockArchivedUserModel.destroy).toHaveBeenCalledWith({
				where: {
					removedAt: { [Op.lt]: expect.any(Date) },
				},
			});
			expect(result).toBe(10);
		});
	});

	describe("count", () => {
		it("should return total count of archived records", async () => {
			vi.mocked(mockArchivedUserModel.count).mockResolvedValue(25);

			const result = await archivedUserDao.count();

			expect(mockArchivedUserModel.count).toHaveBeenCalled();
			expect(result).toBe(25);
		});
	});
});

describe("createArchivedUserDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as ArchivedUserDao;
		const provider = createArchivedUserDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context archivedUserDao when context has database", () => {
		const defaultDao = {} as ArchivedUserDao;
		const contextArchivedUserDao = {} as ArchivedUserDao;
		const context = {
			database: {
				archivedUserDao: contextArchivedUserDao,
			},
		} as TenantOrgContext;

		const provider = createArchivedUserDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextArchivedUserDao);
	});
});
