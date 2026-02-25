import type { GlobalAuth } from "../model/GlobalAuth";
import type { ModelDef } from "../util/ModelDef";
import { createGlobalAuthDao, type GlobalAuthDao } from "./GlobalAuthDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GlobalAuthDao", () => {
	let mockGlobalAuths: ModelDef<GlobalAuth>;
	let mockSequelize: Sequelize;
	let globalAuthDao: GlobalAuthDao;

	beforeEach(() => {
		mockGlobalAuths = {
			create: vi.fn(),
			findOne: vi.fn(),
			findAll: vi.fn(),
			update: vi.fn(),
			destroy: vi.fn(),
			count: vi.fn(),
		} as unknown as ModelDef<GlobalAuth>;

		mockSequelize = {
			models: {
				GlobalAuth: mockGlobalAuths,
			},
			query: vi.fn(),
		} as unknown as Sequelize;

		globalAuthDao = createGlobalAuthDao(mockSequelize);
	});

	describe("findAuthByUserIdAndProvider", () => {
		it("should return auth when found", async () => {
			const auth: GlobalAuth = {
				id: 1,
				userId: 1,
				provider: "password",
				providerId: undefined,
				providerEmail: undefined,
				passwordHash: "hash123",
				passwordSalt: "salt123",
				passwordAlgo: "argon2id",
				passwordIterations: 3,
				accessToken: undefined,
				refreshToken: undefined,
				tokenExpiresAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuthInstance = {
				get: vi.fn().mockReturnValue(auth),
			};

			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(mockAuthInstance as never);

			const result = await globalAuthDao.findAuthByUserIdAndProvider(1, "password");

			expect(mockGlobalAuths.findOne).toHaveBeenCalledWith({
				where: { userId: 1, provider: "password" },
			});
			expect(result).toEqual(auth);
		});

		it("should return undefined when auth not found", async () => {
			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(null);

			const result = await globalAuthDao.findAuthByUserIdAndProvider(1, "password");

			expect(result).toBeUndefined();
		});
	});

	describe("findAuthByProviderAndProviderId", () => {
		it("should return auth when found", async () => {
			const auth: GlobalAuth = {
				id: 1,
				userId: 1,
				provider: "google",
				providerId: "google-123",
				providerEmail: "test@example.com",
				passwordHash: undefined,
				passwordSalt: undefined,
				passwordAlgo: undefined,
				passwordIterations: undefined,
				accessToken: "token",
				refreshToken: "refresh",
				tokenExpiresAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuthInstance = {
				get: vi.fn().mockReturnValue(auth),
			};

			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(mockAuthInstance as never);

			const result = await globalAuthDao.findAuthByProviderAndProviderId("google", "google-123");

			expect(mockGlobalAuths.findOne).toHaveBeenCalledWith({
				where: { provider: "google", providerId: "google-123" },
			});
			expect(result).toEqual(auth);
		});

		it("should return undefined when auth not found", async () => {
			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(null);

			const result = await globalAuthDao.findAuthByProviderAndProviderId("google", "google-123");

			expect(result).toBeUndefined();
		});
	});

	describe("createAuth", () => {
		it("should create password auth", async () => {
			const newAuth: GlobalAuth = {
				id: 1,
				userId: 1,
				provider: "password",
				providerId: undefined,
				providerEmail: undefined,
				passwordHash: "hash123",
				passwordSalt: "salt123",
				passwordAlgo: "argon2id",
				passwordIterations: 3,
				accessToken: undefined,
				refreshToken: undefined,
				tokenExpiresAt: undefined,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuthInstance = {
				get: vi.fn().mockReturnValue(newAuth),
			};

			vi.mocked(mockGlobalAuths.create).mockResolvedValue(mockAuthInstance as never);

			const result = await globalAuthDao.createAuth({
				userId: 1,
				provider: "password",
				passwordHash: "hash123",
				passwordSalt: "salt123",
				passwordAlgo: "argon2id",
				passwordIterations: 3,
			});

			expect(mockGlobalAuths.create).toHaveBeenCalled();
			expect(result).toEqual(newAuth);
		});

		it("should create OAuth auth", async () => {
			const newAuth: GlobalAuth = {
				id: 1,
				userId: 1,
				provider: "google",
				providerId: "google-123",
				providerEmail: "test@example.com",
				passwordHash: undefined,
				passwordSalt: undefined,
				passwordAlgo: undefined,
				passwordIterations: undefined,
				accessToken: "token",
				refreshToken: "refresh",
				tokenExpiresAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockAuthInstance = {
				get: vi.fn().mockReturnValue(newAuth),
			};

			vi.mocked(mockGlobalAuths.create).mockResolvedValue(mockAuthInstance as never);

			const result = await globalAuthDao.createAuth({
				userId: 1,
				provider: "google",
				providerId: "google-123",
				providerEmail: "test@example.com",
				accessToken: "token",
				refreshToken: "refresh",
				tokenExpiresAt: new Date(),
			});

			expect(result).toEqual(newAuth);
		});
	});

	describe("updateAuth", () => {
		it("should update auth fields", async () => {
			vi.mocked(mockGlobalAuths.update).mockResolvedValue([1] as never);

			await globalAuthDao.updateAuth(1, {
				accessToken: "new-token",
				refreshToken: "new-refresh",
			});

			expect(mockGlobalAuths.update).toHaveBeenCalledWith(
				{
					accessToken: "new-token",
					refreshToken: "new-refresh",
				},
				{
					where: { id: 1 },
					transaction: null,
				},
			);
		});
	});

	describe("deleteAuth", () => {
		it("should delete auth record", async () => {
			vi.mocked(mockGlobalAuths.destroy).mockResolvedValue(1 as never);

			await globalAuthDao.deleteAuth(1);

			expect(mockGlobalAuths.destroy).toHaveBeenCalledWith({
				where: { id: 1 },
			});
		});
	});

	describe("findAuthsByUserId", () => {
		it("should return all auth records for a user", async () => {
			const auths: Array<GlobalAuth> = [
				{
					id: 1,
					userId: 1,
					provider: "password",
					providerId: undefined,
					providerEmail: undefined,
					passwordHash: "hash",
					passwordSalt: "salt",
					passwordAlgo: "argon2id",
					passwordIterations: 3,
					accessToken: undefined,
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					userId: 1,
					provider: "google",
					providerId: "google-123",
					providerEmail: "test@example.com",
					passwordHash: undefined,
					passwordSalt: undefined,
					passwordAlgo: undefined,
					passwordIterations: undefined,
					accessToken: "token",
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockAuthInstances = auths.map(auth => ({
				get: vi.fn().mockReturnValue(auth),
			}));

			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue(mockAuthInstances as never);

			const result = await globalAuthDao.findAuthsByUserId(1);

			expect(mockGlobalAuths.findAll).toHaveBeenCalledWith({
				where: { userId: 1 },
			});
			expect(result).toHaveLength(2);
		});
	});

	describe("getUserAuthProviders", () => {
		it("should return list of provider names for a user", async () => {
			const auths: Array<GlobalAuth> = [
				{
					id: 1,
					userId: 1,
					provider: "password",
					providerId: undefined,
					providerEmail: undefined,
					passwordHash: "hash",
					passwordSalt: "salt",
					passwordAlgo: "argon2id",
					passwordIterations: 3,
					accessToken: undefined,
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					userId: 1,
					provider: "google",
					providerId: "google-123",
					providerEmail: "test@example.com",
					passwordHash: undefined,
					passwordSalt: undefined,
					passwordAlgo: undefined,
					passwordIterations: undefined,
					accessToken: "token",
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockAuthInstances = auths.map(auth => ({
				get: vi.fn().mockReturnValue(auth),
			}));

			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue(mockAuthInstances as never);

			const result = await globalAuthDao.getUserAuthProviders(1);

			expect(result).toEqual(["password", "google"]);
		});

		it("should return empty array when user has no auth records", async () => {
			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue([]);

			const result = await globalAuthDao.getUserAuthProviders(999);

			expect(result).toEqual([]);
		});
	});

	describe("hasPasswordAuth", () => {
		it("should return true when user has credential provider", async () => {
			const auths: Array<GlobalAuth> = [
				{
					id: 1,
					userId: 1,
					provider: "credential",
					providerId: undefined,
					providerEmail: undefined,
					passwordHash: "hash",
					passwordSalt: "salt",
					passwordAlgo: "argon2id",
					passwordIterations: 3,
					accessToken: undefined,
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockAuthInstances = auths.map(auth => ({
				get: vi.fn().mockReturnValue(auth),
			}));

			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue(mockAuthInstances as never);

			const result = await globalAuthDao.hasPasswordAuth(1);

			expect(result).toBe(true);
		});

		it("should return true when user has password provider", async () => {
			const auths: Array<GlobalAuth> = [
				{
					id: 1,
					userId: 1,
					provider: "password",
					providerId: undefined,
					providerEmail: undefined,
					passwordHash: "hash",
					passwordSalt: "salt",
					passwordAlgo: "argon2id",
					passwordIterations: 3,
					accessToken: undefined,
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockAuthInstances = auths.map(auth => ({
				get: vi.fn().mockReturnValue(auth),
			}));

			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue(mockAuthInstances as never);

			const result = await globalAuthDao.hasPasswordAuth(1);

			expect(result).toBe(true);
		});

		it("should return false when user only has OAuth providers", async () => {
			const auths: Array<GlobalAuth> = [
				{
					id: 1,
					userId: 1,
					provider: "google",
					providerId: "google-123",
					providerEmail: "test@example.com",
					passwordHash: undefined,
					passwordSalt: undefined,
					passwordAlgo: undefined,
					passwordIterations: undefined,
					accessToken: "token",
					refreshToken: undefined,
					tokenExpiresAt: undefined,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const mockAuthInstances = auths.map(auth => ({
				get: vi.fn().mockReturnValue(auth),
			}));

			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue(mockAuthInstances as never);

			const result = await globalAuthDao.hasPasswordAuth(1);

			expect(result).toBe(false);
		});

		it("should return false when user has no auth records", async () => {
			vi.mocked(mockGlobalAuths.findAll).mockResolvedValue([]);

			const result = await globalAuthDao.hasPasswordAuth(999);

			expect(result).toBe(false);
		});
	});

	describe("findGitHubAuthByUserId", () => {
		it("should return GitHub auth info with creation time", async () => {
			const createdAt = new Date("2025-01-15T10:00:00Z");
			const mockAuthInstance = {
				get: vi.fn((field: string) => {
					if (field === "providerId") {
						return "github-123";
					}
					if (field === "accessToken") {
						return "gho_token123";
					}
					if (field === "refreshToken") {
						return "ghr_refresh123";
					}
					if (field === "createdAt") {
						return createdAt;
					}
					return;
				}),
			};

			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(mockAuthInstance as never);

			const result = await globalAuthDao.findGitHubAuthByUserId(1);

			expect(mockGlobalAuths.findOne).toHaveBeenCalledWith({
				where: { userId: 1, provider: "github" },
				attributes: ["providerId", "accessToken", "refreshToken", "createdAt"],
			});
			expect(result).toEqual({
				accountId: "github-123",
				accessToken: "gho_token123",
				refreshToken: "ghr_refresh123",
				createdAt,
			});
		});

		it("should return null refreshToken when not present", async () => {
			const createdAt = new Date("2025-01-15T10:00:00Z");
			const mockAuthInstance = {
				get: vi.fn((field: string) => {
					if (field === "providerId") {
						return "github-123";
					}
					if (field === "accessToken") {
						return "gho_token123";
					}
					if (field === "refreshToken") {
						return "";
					}
					if (field === "createdAt") {
						return createdAt;
					}
					return;
				}),
			};

			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(mockAuthInstance as never);

			const result = await globalAuthDao.findGitHubAuthByUserId(1);

			expect(result).toEqual({
				accountId: "github-123",
				accessToken: "gho_token123",
				refreshToken: null,
				createdAt,
			});
		});

		it("should return undefined when GitHub auth not found", async () => {
			vi.mocked(mockGlobalAuths.findOne).mockResolvedValue(null);

			const result = await globalAuthDao.findGitHubAuthByUserId(999);

			expect(result).toBeUndefined();
		});
	});

	describe("findAuthWithUserByProviderId", () => {
		it("should return auth with user info and auth count", async () => {
			const mockQueryResult = [
				{
					userId: 1,
					userEmail: "test@example.com",
					userName: "Test User",
					isActive: true,
					authCount: 2,
				},
			];

			vi.mocked(mockSequelize.query).mockResolvedValue(mockQueryResult as never);

			const result = await globalAuthDao.findAuthWithUserByProviderId("github", "github-123");

			expect(mockSequelize.query).toHaveBeenCalledWith(
				expect.stringContaining("SELECT a.user_id"),
				expect.objectContaining({
					bind: ["github", "github-123"],
				}),
			);
			expect(result).toEqual({
				userId: 1,
				userEmail: "test@example.com",
				userName: "Test User",
				isActive: true,
				authCount: 2,
			});
		});

		it("should return undefined when auth not found", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue([] as never);

			const result = await globalAuthDao.findAuthWithUserByProviderId("github", "github-999");

			expect(result).toBeUndefined();
		});

		it("should return undefined when query returns null", async () => {
			vi.mocked(mockSequelize.query).mockResolvedValue(null as never);

			const result = await globalAuthDao.findAuthWithUserByProviderId("github", "github-999");

			expect(result).toBeUndefined();
		});
	});

	describe("countAuthsByUserId", () => {
		it("should return count of auth methods for a user", async () => {
			vi.mocked(mockGlobalAuths.count).mockResolvedValue(3);

			const result = await globalAuthDao.countAuthsByUserId(1);

			expect(mockGlobalAuths.count).toHaveBeenCalledWith({ where: { userId: 1 } });
			expect(result).toBe(3);
		});

		it("should return zero when user has no auth methods", async () => {
			vi.mocked(mockGlobalAuths.count).mockResolvedValue(0);

			const result = await globalAuthDao.countAuthsByUserId(999);

			expect(result).toBe(0);
		});
	});

	describe("updateTokens", () => {
		it("should update access token and refresh token", async () => {
			vi.mocked(mockGlobalAuths.update).mockResolvedValue([1] as never);

			await globalAuthDao.updateTokens(1, "github", "new-access-token", "new-refresh-token");

			expect(mockGlobalAuths.update).toHaveBeenCalledWith(
				{
					accessToken: "new-access-token",
					refreshToken: "new-refresh-token",
				},
				{ where: { userId: 1, provider: "github" } },
			);
		});

		it("should update only access token when refresh token is null", async () => {
			vi.mocked(mockGlobalAuths.update).mockResolvedValue([1] as never);

			await globalAuthDao.updateTokens(1, "github", "new-access-token", null);

			expect(mockGlobalAuths.update).toHaveBeenCalledWith(
				{
					accessToken: "new-access-token",
				},
				{ where: { userId: 1, provider: "github" } },
			);
		});
	});

	describe("updateTokensByProviderId", () => {
		it("should update access token and refresh token by provider identity", async () => {
			vi.mocked(mockGlobalAuths.update).mockResolvedValue([1] as never);

			await globalAuthDao.updateTokensByProviderId(
				"github",
				"github-123",
				"new-access-token",
				"new-refresh-token",
			);

			expect(mockGlobalAuths.update).toHaveBeenCalledWith(
				{
					accessToken: "new-access-token",
					refreshToken: "new-refresh-token",
				},
				{ where: { provider: "github", providerId: "github-123" } },
			);
		});

		it("should update only access token when refresh token is null", async () => {
			vi.mocked(mockGlobalAuths.update).mockResolvedValue([1] as never);

			await globalAuthDao.updateTokensByProviderId("github", "github-123", "new-access-token", null);

			expect(mockGlobalAuths.update).toHaveBeenCalledWith(
				{
					accessToken: "new-access-token",
				},
				{ where: { provider: "github", providerId: "github-123" } },
			);
		});
	});

	describe("reassignAuthByProviderId", () => {
		it("should reassign provider auth to target user", async () => {
			vi.mocked(mockGlobalAuths.update).mockResolvedValue([1] as never);

			await globalAuthDao.reassignAuthByProviderId("github", "github-123", 77);

			expect(mockGlobalAuths.update).toHaveBeenCalledWith(
				{
					userId: 77,
					updatedAt: expect.any(Date),
				},
				{
					where: { provider: "github", providerId: "github-123" },
				},
			);
		});
	});

	describe("deleteAuthByUserIdAndProvider", () => {
		it("should delete auth by user ID and provider", async () => {
			vi.mocked(mockGlobalAuths.destroy).mockResolvedValue(1 as never);

			await globalAuthDao.deleteAuthByUserIdAndProvider(1, "github");

			expect(mockGlobalAuths.destroy).toHaveBeenCalledWith({
				where: { userId: 1, provider: "github" },
			});
		});

		it("should handle deleting non-existent auth", async () => {
			vi.mocked(mockGlobalAuths.destroy).mockResolvedValue(0 as never);

			await globalAuthDao.deleteAuthByUserIdAndProvider(999, "github");

			expect(mockGlobalAuths.destroy).toHaveBeenCalledWith({
				where: { userId: 999, provider: "github" },
			});
		});
	});
});
