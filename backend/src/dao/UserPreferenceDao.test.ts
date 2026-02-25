import { EMPTY_PREFERENCES_HASH, type UserPreference } from "../model/UserPreference";
import type { CacheClient } from "../services/CacheService";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { ModelDef } from "../util/ModelDef";
import {
	calculateFavoritesHash,
	createUserPreferenceDao,
	createUserPreferenceDaoProvider,
	getUserPreferenceHashCacheKey,
	type UserPreferenceDao,
} from "./UserPreferenceDao";
import type { Sequelize } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("calculateFavoritesHash", () => {
	it("should return consistent hash for same data", () => {
		const hash1 = calculateFavoritesHash([1, 2, 3], [4, 5]);
		const hash2 = calculateFavoritesHash([1, 2, 3], [4, 5]);
		expect(hash1).toBe(hash2);
	});

	it("should return same hash regardless of array order", () => {
		const hash1 = calculateFavoritesHash([3, 1, 2], [5, 4]);
		const hash2 = calculateFavoritesHash([1, 2, 3], [4, 5]);
		expect(hash1).toBe(hash2);
	});

	it("should return different hash for different data", () => {
		const hash1 = calculateFavoritesHash([1, 2, 3], [4, 5]);
		const hash2 = calculateFavoritesHash([1, 2], [4, 5, 6]);
		expect(hash1).not.toBe(hash2);
	});

	it("should return 16-character hash", () => {
		const hash = calculateFavoritesHash([1, 2, 3], [4, 5]);
		expect(hash).toHaveLength(16);
	});

	it("should handle empty arrays", () => {
		const hash = calculateFavoritesHash([], []);
		expect(hash).toHaveLength(16);
	});
});

describe("getUserPreferenceHashCacheKey", () => {
	it("should generate correct cache key", () => {
		const key = getUserPreferenceHashCacheKey("tenant1", "org1", 123);
		expect(key).toBe("user_pref_hash:tenant1:org1:123");
	});
});

describe("UserPreferenceDao", () => {
	let mockUserPreferences: ModelDef<UserPreference>;
	let userPreferenceDao: UserPreferenceDao;

	beforeEach(() => {
		mockUserPreferences = {
			findOne: vi.fn(),
			create: vi.fn(),
		} as unknown as ModelDef<UserPreference>;

		const mockSequelize = {
			define: vi.fn().mockReturnValue(mockUserPreferences),
		} as unknown as Sequelize;

		userPreferenceDao = createUserPreferenceDao(mockSequelize);
	});

	describe("getPreference", () => {
		it("should return preference when found", async () => {
			const pref: UserPreference = {
				userId: 1,
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [4, 5],
				hash: "abc123",
				updatedAt: new Date(),
			};

			const mockPrefInstance = {
				get: vi.fn().mockReturnValue(pref),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockPrefInstance as never);

			const result = await userPreferenceDao.getPreference(1);

			expect(mockUserPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 1 },
			});
			expect(mockPrefInstance.get).toHaveBeenCalledWith({ plain: true });
			expect(result).toEqual(pref);
		});

		it("should return undefined when preference not found", async () => {
			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(null);

			const result = await userPreferenceDao.getPreference(999);

			expect(mockUserPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 999 },
			});
			expect(result).toBeUndefined();
		});
	});

	describe("getHash", () => {
		it("should return hash when preference exists", async () => {
			const mockPrefInstance = {
				get: vi.fn().mockReturnValue({ hash: "abc123" }),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockPrefInstance as never);

			const result = await userPreferenceDao.getHash(1);

			expect(mockUserPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 1 },
				attributes: ["hash"],
			});
			expect(result).toBe("abc123");
		});

		it("should return EMPTY_PREFERENCES_HASH when preference not found", async () => {
			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(null);

			const result = await userPreferenceDao.getHash(999);

			expect(mockUserPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 999 },
				attributes: ["hash"],
			});
			expect(result).toBe(EMPTY_PREFERENCES_HASH);
		});
	});

	describe("upsertPreference", () => {
		it("should create new preference when none exists", async () => {
			const newPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [1, 2],
				favoriteSites: [3],
				hash: calculateFavoritesHash([1, 2], [3]),
				updatedAt: new Date(),
			};

			const mockCreatedInstance = {
				get: vi.fn().mockReturnValue(newPref),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(null);
			vi.mocked(mockUserPreferences.create).mockResolvedValue(mockCreatedInstance as never);

			const result = await userPreferenceDao.upsertPreference(1, {
				favoriteSpaces: [1, 2],
				favoriteSites: [3],
			});

			expect(mockUserPreferences.findOne).toHaveBeenCalledWith({
				where: { userId: 1 },
			});
			expect(mockUserPreferences.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 1,
					favoriteSpaces: [1, 2],
					favoriteSites: [3],
				}),
			);
			expect(result).toEqual(newPref);
		});

		it("should update existing preference", async () => {
			const existingPref = {
				userId: 1,
				favoriteSpaces: [1],
				favoriteSites: [2],
				hash: "old-hash",
			};

			const updatedPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [1, 3],
				favoriteSites: [2],
				hash: calculateFavoritesHash([1, 3], [2]),
				updatedAt: new Date(),
			};

			const mockExistingInstance = {
				get: vi.fn((arg?: unknown) => {
					if (typeof arg === "string") {
						return existingPref[arg as keyof typeof existingPref];
					}
					return updatedPref;
				}),
				update: vi.fn(),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockExistingInstance as never);

			const result = await userPreferenceDao.upsertPreference(1, {
				favoriteSpaces: [1, 3],
			});

			expect(mockExistingInstance.update).toHaveBeenCalledWith(
				expect.objectContaining({
					favoriteSpaces: [1, 3],
					favoriteSites: [2],
				}),
			);
			expect(result).toEqual(updatedPref);
		});

		it("should invalidate cache on create when cacheKey and cacheClient provided", async () => {
			const mockCacheClient: CacheClient = {
				get: vi.fn(),
				set: vi.fn(),
				setex: vi.fn(),
				del: vi.fn(),
				incr: vi.fn(),
				expire: vi.fn(),
				ttl: vi.fn(),
				exists: vi.fn(),
				ping: vi.fn(),
				keys: vi.fn(),
			};

			const mockCreatedInstance = {
				get: vi.fn().mockReturnValue({
					userId: 1,
					favoriteSpaces: [1],
					favoriteSites: [],
					hash: "newhash",
					updatedAt: new Date(),
				}),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(null);
			vi.mocked(mockUserPreferences.create).mockResolvedValue(mockCreatedInstance as never);

			await userPreferenceDao.upsertPreference(
				1,
				{ favoriteSpaces: [1] },
				"user_pref_hash:tenant:org:1",
				mockCacheClient,
			);

			expect(mockCacheClient.del).toHaveBeenCalledWith("user_pref_hash:tenant:org:1");
		});

		it("should invalidate cache on update when cacheKey and cacheClient provided", async () => {
			const mockCacheClient: CacheClient = {
				get: vi.fn(),
				set: vi.fn(),
				setex: vi.fn(),
				del: vi.fn(),
				incr: vi.fn(),
				expire: vi.fn(),
				ttl: vi.fn(),
				exists: vi.fn(),
				ping: vi.fn(),
				keys: vi.fn(),
			};

			const existingPref = {
				favoriteSpaces: [1],
				favoriteSites: [2],
			};

			const updatedPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [1, 3],
				favoriteSites: [2],
				hash: calculateFavoritesHash([1, 3], [2]),
				updatedAt: new Date(),
			};

			const mockExistingInstance = {
				get: vi.fn((arg?: unknown) => {
					if (typeof arg === "string") {
						return existingPref[arg as keyof typeof existingPref];
					}
					return updatedPref;
				}),
				update: vi.fn(),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockExistingInstance as never);

			await userPreferenceDao.upsertPreference(
				1,
				{ favoriteSpaces: [1, 3] },
				"user_pref_hash:tenant:org:1",
				mockCacheClient,
			);

			expect(mockCacheClient.del).toHaveBeenCalledWith("user_pref_hash:tenant:org:1");
		});

		it("should not invalidate cache on update when cacheKey or cacheClient missing", async () => {
			const existingPref = {
				favoriteSpaces: [1],
				favoriteSites: [2],
			};

			const updatedPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [1, 3],
				favoriteSites: [2],
				hash: calculateFavoritesHash([1, 3], [2]),
				updatedAt: new Date(),
			};

			const mockExistingInstance = {
				get: vi.fn((arg?: unknown) => {
					if (typeof arg === "string") {
						return existingPref[arg as keyof typeof existingPref];
					}
					return updatedPref;
				}),
				update: vi.fn(),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockExistingInstance as never);

			const result = await userPreferenceDao.upsertPreference(1, { favoriteSpaces: [1, 3] });

			expect(result).toEqual(updatedPref);
		});

		it("should log warning and not throw when cache invalidation fails on update", async () => {
			const mockCacheClient: CacheClient = {
				get: vi.fn(),
				set: vi.fn(),
				setex: vi.fn(),
				del: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
				incr: vi.fn(),
				expire: vi.fn(),
				ttl: vi.fn(),
				exists: vi.fn(),
				ping: vi.fn(),
				keys: vi.fn(),
			};

			const existingPref = {
				favoriteSpaces: [1],
				favoriteSites: [2],
			};

			const updatedPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [5],
				favoriteSites: [2],
				hash: calculateFavoritesHash([5], [2]),
				updatedAt: new Date(),
			};

			const mockExistingInstance = {
				get: vi.fn((arg?: unknown) => {
					if (typeof arg === "string") {
						return existingPref[arg as keyof typeof existingPref];
					}
					return updatedPref;
				}),
				update: vi.fn(),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockExistingInstance as never);

			// Should not throw despite cache failure
			const result = await userPreferenceDao.upsertPreference(
				1,
				{ favoriteSpaces: [5] },
				"user_pref_hash:tenant:org:1",
				mockCacheClient,
			);

			expect(result).toEqual(updatedPref);
			expect(mockCacheClient.del).toHaveBeenCalledWith("user_pref_hash:tenant:org:1");
		});

		it("should log warning and not throw when cache invalidation fails on create", async () => {
			const mockCacheClient: CacheClient = {
				get: vi.fn(),
				set: vi.fn(),
				setex: vi.fn(),
				del: vi.fn().mockRejectedValue(new Error("Redis connection lost")),
				incr: vi.fn(),
				expire: vi.fn(),
				ttl: vi.fn(),
				exists: vi.fn(),
				ping: vi.fn(),
				keys: vi.fn(),
			};

			const newPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [1],
				favoriteSites: [],
				hash: calculateFavoritesHash([1], []),
				updatedAt: new Date(),
			};

			const mockCreatedInstance = {
				get: vi.fn().mockReturnValue(newPref),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(null);
			vi.mocked(mockUserPreferences.create).mockResolvedValue(mockCreatedInstance as never);

			// Should not throw despite cache failure
			const result = await userPreferenceDao.upsertPreference(
				1,
				{ favoriteSpaces: [1] },
				"user_pref_hash:tenant:org:1",
				mockCacheClient,
			);

			expect(result).toEqual(newPref);
			expect(mockCacheClient.del).toHaveBeenCalledWith("user_pref_hash:tenant:org:1");
		});

		it("should fall back to existing favoriteSpaces when not provided in updates", async () => {
			const existingPref = {
				favoriteSpaces: [10, 20],
				favoriteSites: [30],
			};

			const updatedPref: UserPreference = {
				userId: 1,
				favoriteSpaces: [10, 20],
				favoriteSites: [99],
				hash: calculateFavoritesHash([10, 20], [99]),
				updatedAt: new Date(),
			};

			const mockExistingInstance = {
				get: vi.fn((arg?: unknown) => {
					if (typeof arg === "string") {
						return existingPref[arg as keyof typeof existingPref];
					}
					return updatedPref;
				}),
				update: vi.fn(),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(mockExistingInstance as never);

			const result = await userPreferenceDao.upsertPreference(1, {
				favoriteSites: [99],
			});

			expect(mockExistingInstance.update).toHaveBeenCalledWith(
				expect.objectContaining({
					favoriteSpaces: [10, 20],
					favoriteSites: [99],
				}),
			);
			expect(result).toEqual(updatedPref);
		});

		it("should use empty arrays when updates and existing have no favorites", async () => {
			const mockCreatedInstance = {
				get: vi.fn().mockReturnValue({
					userId: 1,
					favoriteSpaces: [],
					favoriteSites: [],
					hash: calculateFavoritesHash([], []),
					updatedAt: new Date(),
				}),
			};

			vi.mocked(mockUserPreferences.findOne).mockResolvedValue(null);
			vi.mocked(mockUserPreferences.create).mockResolvedValue(mockCreatedInstance as never);

			const result = await userPreferenceDao.upsertPreference(1, {});

			expect(mockUserPreferences.create).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 1,
					favoriteSpaces: [],
					favoriteSites: [],
				}),
			);
			expect(result.favoriteSpaces).toEqual([]);
			expect(result.favoriteSites).toEqual([]);
		});
	});
});

describe("createUserPreferenceDaoProvider", () => {
	it("should return defaultDao when context is undefined", () => {
		const defaultDao = {} as UserPreferenceDao;
		const provider = createUserPreferenceDaoProvider(defaultDao);

		const result = provider.getDao(undefined);

		expect(result).toBe(defaultDao);
	});

	it("should return context userPreferenceDao when context has database", () => {
		const defaultDao = {} as UserPreferenceDao;
		const contextUserPreferenceDao = {} as UserPreferenceDao;
		const context = {
			database: {
				userPreferenceDao: contextUserPreferenceDao,
			},
		} as TenantOrgContext;

		const provider = createUserPreferenceDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(contextUserPreferenceDao);
	});

	it("should return defaultDao when context database has no userPreferenceDao", () => {
		const defaultDao = {} as UserPreferenceDao;
		const context = {
			database: {},
		} as TenantOrgContext;

		const provider = createUserPreferenceDaoProvider(defaultDao);

		const result = provider.getDao(context);

		expect(result).toBe(defaultDao);
	});
});
