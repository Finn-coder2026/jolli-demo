import * as CacheService from "./CacheService";
import { closeRedis, getCacheType, getRedis, initCache, isRedisEnabled } from "./RedisService";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./CacheService");

describe("RedisService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await closeRedis();
	});

	describe("getRedis", () => {
		it("should return cache client from CacheService", () => {
			const mockCacheClient = {
				get: vi.fn(),
				set: vi.fn(),
			};
			vi.mocked(CacheService.getCache).mockReturnValue(mockCacheClient as never);

			const result = getRedis();

			expect(result).toBe(mockCacheClient);
			expect(CacheService.getCache).toHaveBeenCalled();
		});
	});

	describe("closeRedis", () => {
		it("should close cache connection", async () => {
			vi.mocked(CacheService.closeCache).mockResolvedValue(undefined);

			await closeRedis();

			expect(CacheService.closeCache).toHaveBeenCalled();
		});
	});

	describe("isRedisEnabled", () => {
		it("should return true when redis is enabled", () => {
			vi.mocked(CacheService.isRedisEnabled).mockReturnValue(true);

			expect(isRedisEnabled()).toBe(true);
		});

		it("should return false when redis is not enabled", () => {
			vi.mocked(CacheService.isRedisEnabled).mockReturnValue(false);

			expect(isRedisEnabled()).toBe(false);
		});
	});

	describe("getCacheType", () => {
		it("should return redis when using redis", () => {
			vi.mocked(CacheService.getCacheType).mockReturnValue("redis");

			expect(getCacheType()).toBe("redis");
		});

		it("should return memory when using memory store", () => {
			vi.mocked(CacheService.getCacheType).mockReturnValue("memory");

			expect(getCacheType()).toBe("memory");
		});
	});

	describe("initCache", () => {
		it("should initialize cache", async () => {
			const mockResult = { client: {} as never, type: "redis" as const };
			vi.mocked(CacheService.initCache).mockResolvedValue(mockResult);

			const result = await initCache();

			expect(result).toBe(mockResult);
			expect(CacheService.initCache).toHaveBeenCalled();
		});
	});
});
