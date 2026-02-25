import type { PasswordHistory } from "../model/PasswordHistory";
import type { ModelDef } from "../util/ModelDef";
import { createPasswordHistoryDao, type PasswordHistoryDao } from "./PasswordHistoryDao";
import * as argon2 from "@node-rs/argon2";
import type { Sequelize } from "sequelize";
import { Op } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@node-rs/argon2", () => ({
	verify: vi.fn(),
}));

describe("PasswordHistoryDao", () => {
	let mockPasswordHistories: ModelDef<PasswordHistory>;
	let passwordHistoryDao: PasswordHistoryDao;

	beforeEach(() => {
		vi.clearAllMocks();

		mockPasswordHistories = {
			create: vi.fn(),
			findAll: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<PasswordHistory>;

		const mockSequelize = {
			models: {
				PasswordHistory: mockPasswordHistories,
			},
		} as unknown as Sequelize;

		passwordHistoryDao = createPasswordHistoryDao(mockSequelize);
	});

	describe("addPasswordHistory", () => {
		it("should add a new password to history", async () => {
			const passwordHistory: PasswordHistory = {
				id: 1,
				userId: 123,
				passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$hash",
				createdAt: new Date(),
			};

			const mockInstance = {
				get: vi.fn().mockReturnValue(passwordHistory),
			};

			vi.mocked(mockPasswordHistories.create).mockResolvedValue(mockInstance as never);

			const result = await passwordHistoryDao.addPasswordHistory(123, "$argon2id$v=19$m=65536,t=3,p=4$hash");

			expect(mockPasswordHistories.create).toHaveBeenCalledWith({
				userId: 123,
				passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$hash",
			});
			expect(result).toEqual(passwordHistory);
		});
	});

	describe("getRecentPasswords", () => {
		it("should return recent passwords for a user", async () => {
			const passwords: Array<PasswordHistory> = [
				{
					id: 3,
					userId: 123,
					passwordHash: "hash3",
					createdAt: new Date("2025-01-03"),
				},
				{
					id: 2,
					userId: 123,
					passwordHash: "hash2",
					createdAt: new Date("2025-01-02"),
				},
				{
					id: 1,
					userId: 123,
					passwordHash: "hash1",
					createdAt: new Date("2025-01-01"),
				},
			];

			const mockInstances = passwords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);

			const result = await passwordHistoryDao.getRecentPasswords(123, 5);

			expect(mockPasswordHistories.findAll).toHaveBeenCalledWith({
				where: { userId: 123 },
				order: [["created_at", "DESC"]],
				limit: 5,
			});
			expect(result).toEqual(passwords);
		});

		it("should return empty array when user has no password history", async () => {
			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue([]);

			const result = await passwordHistoryDao.getRecentPasswords(999, 5);

			expect(result).toEqual([]);
		});
	});

	describe("isPasswordReused", () => {
		it("should return false when user has no password history", async () => {
			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue([]);

			const result = await passwordHistoryDao.isPasswordReused(123, "newPassword123", 5);

			expect(result).toBe(false);
			expect(argon2.verify).not.toHaveBeenCalled();
		});

		it("should return true when password matches a historical password", async () => {
			const passwords: Array<PasswordHistory> = [
				{
					id: 1,
					userId: 123,
					passwordHash: "hash1",
					createdAt: new Date(),
				},
			];

			const mockInstances = passwords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(argon2.verify).mockResolvedValue(true);

			const result = await passwordHistoryDao.isPasswordReused(123, "oldPassword", 5);

			expect(argon2.verify).toHaveBeenCalledWith("hash1", "oldPassword");
			expect(result).toBe(true);
		});

		it("should return false when password does not match any historical passwords", async () => {
			const passwords: Array<PasswordHistory> = [
				{
					id: 1,
					userId: 123,
					passwordHash: "hash1",
					createdAt: new Date(),
				},
				{
					id: 2,
					userId: 123,
					passwordHash: "hash2",
					createdAt: new Date(),
				},
			];

			const mockInstances = passwords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(argon2.verify).mockResolvedValue(false);

			const result = await passwordHistoryDao.isPasswordReused(123, "newPassword", 5);

			expect(argon2.verify).toHaveBeenCalledTimes(2);
			expect(result).toBe(false);
		});

		it("should continue checking when argon2.verify throws an error", async () => {
			const passwords: Array<PasswordHistory> = [
				{
					id: 1,
					userId: 123,
					passwordHash: "invalidHash",
					createdAt: new Date(),
				},
				{
					id: 2,
					userId: 123,
					passwordHash: "validHash",
					createdAt: new Date(),
				},
			];

			const mockInstances = passwords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(argon2.verify).mockRejectedValueOnce(new Error("Invalid hash")).mockResolvedValueOnce(true);

			const result = await passwordHistoryDao.isPasswordReused(123, "password", 5);

			expect(argon2.verify).toHaveBeenCalledTimes(2);
			expect(result).toBe(true);
		});

		it("should return false when all verifications throw errors", async () => {
			const passwords: Array<PasswordHistory> = [
				{
					id: 1,
					userId: 123,
					passwordHash: "invalidHash1",
					createdAt: new Date(),
				},
				{
					id: 2,
					userId: 123,
					passwordHash: "invalidHash2",
					createdAt: new Date(),
				},
			];

			const mockInstances = passwords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(argon2.verify).mockRejectedValue(new Error("Invalid hash"));

			const result = await passwordHistoryDao.isPasswordReused(123, "password", 5);

			expect(result).toBe(false);
		});
	});

	describe("cleanupOldPasswords", () => {
		it("should delete old passwords keeping only the specified count", async () => {
			const recentPasswords: Array<PasswordHistory> = [
				{ id: 5, userId: 123, passwordHash: "hash5", createdAt: new Date() },
				{ id: 4, userId: 123, passwordHash: "hash4", createdAt: new Date() },
				{ id: 3, userId: 123, passwordHash: "hash3", createdAt: new Date() },
			];

			const mockInstances = recentPasswords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(mockPasswordHistories.destroy).mockResolvedValue(2 as never);

			const result = await passwordHistoryDao.cleanupOldPasswords(123, 3);

			expect(mockPasswordHistories.findAll).toHaveBeenCalledWith({
				where: { userId: 123 },
				order: [["created_at", "DESC"]],
				limit: 3,
			});
			expect(mockPasswordHistories.destroy).toHaveBeenCalledWith({
				where: {
					userId: 123,
					id: {
						[Op.notIn]: [5, 4, 3],
					},
				},
			});
			expect(result).toBe(2);
		});

		it("should use [-1] for notIn when no passwords to keep", async () => {
			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue([]);
			vi.mocked(mockPasswordHistories.destroy).mockResolvedValue(5 as never);

			const result = await passwordHistoryDao.cleanupOldPasswords(123, 3);

			expect(mockPasswordHistories.destroy).toHaveBeenCalledWith({
				where: {
					userId: 123,
					id: {
						[Op.notIn]: [-1],
					},
				},
			});
			expect(result).toBe(5);
		});

		it("should return 0 when no old passwords to delete", async () => {
			const recentPasswords: Array<PasswordHistory> = [
				{ id: 1, userId: 123, passwordHash: "hash1", createdAt: new Date() },
			];

			const mockInstances = recentPasswords.map(p => ({
				get: vi.fn().mockReturnValue(p),
			}));

			vi.mocked(mockPasswordHistories.findAll).mockResolvedValue(mockInstances as never);
			vi.mocked(mockPasswordHistories.destroy).mockResolvedValue(0 as never);

			const result = await passwordHistoryDao.cleanupOldPasswords(123, 5);

			expect(result).toBe(0);
		});
	});
});
