import type { RememberMeToken } from "../model/RememberMeToken";
import { defineRememberMeTokens } from "../model/RememberMeToken";
import type { ModelDef } from "../util/ModelDef";
import { createRememberMeTokenDao, type RememberMeTokenDao } from "./RememberMeTokenDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../model/RememberMeToken", () => ({
	defineRememberMeTokens: vi.fn(() => ({})),
}));

describe("RememberMeTokenDao", () => {
	let mockModel: ModelDef<RememberMeToken>;
	let dao: RememberMeTokenDao;

	beforeEach(() => {
		vi.clearAllMocks();

		mockModel = {
			create: vi.fn(),
			findByPk: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
		} as unknown as ModelDef<RememberMeToken>;

		// Mock defineRememberMeTokens to return our mock model
		vi.mocked(defineRememberMeTokens).mockReturnValue(mockModel as never);

		const mockSequelize = {} as unknown as Sequelize;
		dao = createRememberMeTokenDao(mockSequelize);
	});

	describe("createToken", () => {
		it("should create a new token with series as primary key", async () => {
			const token: RememberMeToken = {
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: "Mozilla/5.0",
				ipAddress: "192.168.1.1",
				expiresAt: new Date("2025-02-01"),
				lastUsed: new Date(),
				createdAt: new Date(),
			};

			const mockTokenInstance = {
				get: vi.fn().mockReturnValue(token),
			};

			vi.mocked(mockModel.create).mockResolvedValue(mockTokenInstance as never);

			const result = await dao.createToken({
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				userAgent: "Mozilla/5.0",
				ipAddress: "192.168.1.1",
				expiresAt: new Date("2025-02-01"),
			});

			expect(mockModel.create).toHaveBeenCalledWith({
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: "Mozilla/5.0",
				ipAddress: "192.168.1.1",
				expiresAt: new Date("2025-02-01"),
			});
			expect(result).toEqual(token);
		});

		it("should create token with null user agent and IP when not provided", async () => {
			const token: RememberMeToken = {
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date("2025-02-01"),
				lastUsed: new Date(),
				createdAt: new Date(),
			};

			const mockTokenInstance = {
				get: vi.fn().mockReturnValue(token),
			};

			vi.mocked(mockModel.create).mockResolvedValue(mockTokenInstance as never);

			await dao.createToken({
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date("2025-02-01"),
			});

			expect(mockModel.create).toHaveBeenCalledWith({
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date("2025-02-01"),
			});
		});
	});

	describe("findBySeries", () => {
		it("should return token when found", async () => {
			const token: RememberMeToken = {
				series: "test-series-123",
				userId: 123,
				tokenHash: "hashed_token",
				previousTokenHash: null,
				rotatedAt: null,
				userAgent: null,
				ipAddress: null,
				expiresAt: new Date(),
				lastUsed: new Date(),
				createdAt: new Date(),
			};

			const mockTokenInstance = {
				get: vi.fn().mockReturnValue(token),
			};

			vi.mocked(mockModel.findByPk).mockResolvedValue(mockTokenInstance as never);

			const result = await dao.findBySeries("test-series-123");

			expect(mockModel.findByPk).toHaveBeenCalledWith("test-series-123");
			expect(result).toEqual(token);
		});

		it("should return undefined when token not found", async () => {
			vi.mocked(mockModel.findByPk).mockResolvedValue(null);

			const result = await dao.findBySeries("nonexistent-series");

			expect(result).toBeUndefined();
		});
	});

	describe("findByUserId", () => {
		it("should return all tokens for a user", async () => {
			const tokens: Array<RememberMeToken> = [
				{
					series: "series-1",
					userId: 123,
					tokenHash: "hash1",
					previousTokenHash: null,
					rotatedAt: null,
					userAgent: null,
					ipAddress: null,
					expiresAt: new Date(),
					lastUsed: new Date(),
					createdAt: new Date(),
				},
				{
					series: "series-2",
					userId: 123,
					tokenHash: "hash2",
					previousTokenHash: null,
					rotatedAt: null,
					userAgent: null,
					ipAddress: null,
					expiresAt: new Date(),
					lastUsed: new Date(),
					createdAt: new Date(),
				},
			];

			const mockTokenInstances = tokens.map(t => ({
				get: vi.fn().mockReturnValue(t),
			}));

			vi.mocked(mockModel.findAll).mockResolvedValue(mockTokenInstances as never);

			const result = await dao.findByUserId(123);

			expect(mockModel.findAll).toHaveBeenCalledWith({
				where: { userId: 123 },
				order: [["created_at", "DESC"]],
			});
			expect(result).toEqual(tokens);
		});

		it("should return empty array when no tokens found", async () => {
			vi.mocked(mockModel.findAll).mockResolvedValue([]);

			const result = await dao.findByUserId(999);

			expect(result).toEqual([]);
		});
	});

	describe("rotateToken", () => {
		it("should atomically rotate token hash with previous hash and update timestamps", async () => {
			const newExpiry = new Date("2025-03-01");

			await dao.rotateToken("test-series-123", "new_token_hash", "old_token_hash", newExpiry);

			expect(mockModel.update).toHaveBeenCalledWith(
				{
					tokenHash: "new_token_hash",
					previousTokenHash: "old_token_hash",
					rotatedAt: expect.any(Date),
					expiresAt: newExpiry,
					lastUsed: expect.any(Date),
				},
				{ where: { series: "test-series-123" } },
			);
		});
	});

	describe("updateToken", () => {
		it("should update token hash and lastUsed by series", async () => {
			const newLastUsed = new Date();

			await dao.updateToken("test-series-123", "new_token_hash", newLastUsed);

			expect(mockModel.update).toHaveBeenCalledWith(
				{ tokenHash: "new_token_hash", lastUsed: newLastUsed },
				{ where: { series: "test-series-123" } },
			);
		});
	});

	describe("updateExpiry", () => {
		it("should update token expiry by series", async () => {
			const newExpiry = new Date("2025-03-01");

			await dao.updateExpiry("test-series-123", newExpiry);

			expect(mockModel.update).toHaveBeenCalledWith(
				{ expiresAt: newExpiry },
				{ where: { series: "test-series-123" } },
			);
		});
	});

	describe("deleteBySeries", () => {
		it("should delete token by series", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(1 as never);

			await dao.deleteBySeries("test-series-123");

			expect(mockModel.destroy).toHaveBeenCalledWith({
				where: { series: "test-series-123" },
			});
		});
	});

	describe("deleteAllForUser", () => {
		it("should delete all tokens for a user", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(3 as never);

			await dao.deleteAllForUser(123);

			expect(mockModel.destroy).toHaveBeenCalledWith({
				where: { userId: 123 },
			});
		});
	});

	describe("deleteExpired", () => {
		it("should delete expired tokens and return count", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(5 as never);

			const count = await dao.deleteExpired();

			expect(mockModel.destroy).toHaveBeenCalledWith({
				where: {
					expiresAt: expect.any(Object),
				},
			});
			expect(count).toBe(5);
		});

		it("should return 0 when no tokens to delete", async () => {
			vi.mocked(mockModel.destroy).mockResolvedValue(0 as never);

			const count = await dao.deleteExpired();

			expect(count).toBe(0);
		});
	});
});
