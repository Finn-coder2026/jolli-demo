import * as Config from "../config/Config";
import {
	closeCache,
	getCache,
	getCacheType,
	getRedisClientIfAvailable,
	initCache,
	isRedisEnabled,
	resetCache,
} from "./CacheService";
import { MemoryStore } from "./MemoryStore";
import Redis from "ioredis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ioredis");
vi.mock("../config/Config");

describe("CacheService", () => {
	beforeEach(() => {
		resetCache();
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await closeCache();
		resetCache();
	});

	describe("initCache with Redis", () => {
		it("should initialize Redis when REDIS_URL is configured", async () => {
			const mockRedisInstance = {
				ping: vi.fn().mockResolvedValue("PONG"),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			const result = await initCache();

			expect(result.type).toBe("redis");
			expect(isRedisEnabled()).toBe(true);
			expect(getCacheType()).toBe("redis");
		});

		it("should detect MemoryDB endpoint and set cache type to memorydb", async () => {
			// For MemoryDB URLs, connectRedis attempts IAM auth token generation
			// which fails in tests. We need to mock the RedisClient module to bypass this.
			vi.doMock("../util/RedisClient.js", () => {
				const mockRedisInstance = {
					ping: vi.fn().mockResolvedValue("PONG"),
					on: vi.fn(),
					quit: vi.fn().mockResolvedValue(undefined),
				};
				return {
					connectRedis: vi.fn().mockResolvedValue(mockRedisInstance),
				};
			});

			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "rediss://jolli-memorydb-dev.abc123.memorydb.us-west-2.amazonaws.com:6379",
			} as never);

			// Reset modules and re-import to pick up the mocked RedisClient
			vi.resetModules();
			const {
				initCache: initCacheFresh,
				isRedisEnabled: isRedisEnabledFresh,
				getCacheType: getCacheTypeFresh,
			} = await import("./CacheService");

			const result = await initCacheFresh();

			expect(result.type).toBe("memorydb");
			expect(isRedisEnabledFresh()).toBe(true); // memorydb is considered a Redis variant
			expect(getCacheTypeFresh()).toBe("memorydb");
		});

		it("should fall back to memory when Redis connection fails", async () => {
			const mockRedisInstance = {
				ping: vi.fn().mockRejectedValue(new Error("Connection refused")),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			const result = await initCache();

			expect(result.type).toBe("memory");
			expect(isRedisEnabled()).toBe(false);
		});

		it("should fall back to memory when Redis connection times out", async () => {
			const mockRedisInstance = {
				ping: vi.fn().mockImplementation(
					() =>
						new Promise(() => {
							/* Never resolves - simulates timeout */
						}),
				),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			// Use fake timers to speed up the timeout test
			vi.useFakeTimers();
			const initPromise = initCache();
			// Advance timers in a loop to handle async operations
			await vi.advanceTimersByTimeAsync(6000); // Advance past 5 second timeout

			const result = await initPromise;

			expect(result.type).toBe("memory");
			vi.useRealTimers();
		});
	});

	describe("initCache without Redis", () => {
		it("should use memory store when REDIS_URL is not configured", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			const result = await initCache();

			expect(result.type).toBe("memory");
			expect(isRedisEnabled()).toBe(false);
			expect(result.client).toBeInstanceOf(MemoryStore);
		});

		it("should use memory store when REDIS_URL is empty string", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "",
			} as never);

			const result = await initCache();

			expect(result.type).toBe("memory");
		});
	});

	describe("getCache", () => {
		it("should return MemoryStore when not initialized", () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			const cache = getCache();

			expect(cache).toBeInstanceOf(MemoryStore);
		});

		it("should return same instance on subsequent calls", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			await initCache();
			const cache1 = getCache();
			const cache2 = getCache();

			expect(cache1).toBe(cache2);
		});

		it("should return cached client on subsequent initCache calls", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			const result1 = await initCache();
			const result2 = await initCache();

			expect(result1.client).toBe(result2.client);
			expect(result1.type).toBe(result2.type);
		});
	});

	describe("CacheClient interface with MemoryStore", () => {
		beforeEach(async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);
			await initCache();
		});

		it("should support get/set operations", async () => {
			const cache = getCache();

			await cache.set("test-key", "test-value");
			const result = await cache.get("test-key");

			expect(result).toBe("test-value");
		});

		it("should support setex operation", async () => {
			const cache = getCache();

			await cache.setex("test-key", 100, "test-value");
			const result = await cache.get("test-key");

			expect(result).toBe("test-value");
		});

		it("should support incr operation", async () => {
			const cache = getCache();

			const result1 = await cache.incr("counter");
			const result2 = await cache.incr("counter");

			expect(result1).toBe(1);
			expect(result2).toBe(2);
		});

		it("should support del operation", async () => {
			const cache = getCache();

			await cache.set("test-key", "test-value");
			const deleted = await cache.del("test-key");
			const result = await cache.get("test-key");

			expect(deleted).toBe(1);
			expect(result).toBeNull();
		});

		it("should support expire operation", async () => {
			const cache = getCache();

			await cache.set("test-key", "test-value");
			const result = await cache.expire("test-key", 100);

			expect(result).toBe(1);
		});

		it("should support ttl operation", async () => {
			const cache = getCache();

			await cache.set("test-key", "test-value");
			const ttl = await cache.ttl("test-key");

			expect(ttl).toBe(-1); // No expiration
		});

		it("should support exists operation", async () => {
			const cache = getCache();

			await cache.set("test-key", "test-value");
			const exists1 = await cache.exists("test-key");
			const exists2 = await cache.exists("nonexistent");

			expect(exists1).toBe(1);
			expect(exists2).toBe(0);
		});

		it("should support ping operation", async () => {
			const cache = getCache();

			const result = await cache.ping();

			expect(result).toBe("PONG");
		});

		it("should support keys operation", async () => {
			const cache = getCache();

			await cache.set("prefix:key1", "value1");
			await cache.set("prefix:key2", "value2");
			await cache.set("other:key3", "value3");

			const result = await cache.keys("prefix:*");

			expect(result).toHaveLength(2);
			expect(result).toContain("prefix:key1");
			expect(result).toContain("prefix:key2");
		});
	});

	describe("closeCache", () => {
		it("should close memory store", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			await initCache();
			await closeCache();

			// After close, should be able to reinitialize
			const result = await initCache();
			expect(result.type).toBe("memory");
		});

		it("should close Redis connection when using Redis", async () => {
			const mockRedisInstance = {
				ping: vi.fn().mockResolvedValue("PONG"),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			await initCache();
			await closeCache();

			expect(mockRedisInstance.quit).toHaveBeenCalled();
		});
	});

	describe("resetCache", () => {
		it("should reset cache state", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			await initCache();
			const cache1 = getCache();

			resetCache();

			const cache2 = getCache();
			expect(cache1).not.toBe(cache2);
		});
	});

	describe("getRedisClientIfAvailable", () => {
		it("should return null when using memory store", async () => {
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: undefined,
			} as never);

			await initCache();

			expect(getRedisClientIfAvailable()).toBeNull();
		});

		it("should return Redis client when using Redis", async () => {
			const mockRedisInstance = {
				ping: vi.fn().mockResolvedValue("PONG"),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			await initCache();

			expect(getRedisClientIfAvailable()).toBe(mockRedisInstance);
		});
	});

	describe("RedisCacheClient methods", () => {
		let mockRedisInstance: {
			ping: ReturnType<typeof vi.fn>;
			on: ReturnType<typeof vi.fn>;
			quit: ReturnType<typeof vi.fn>;
			get: ReturnType<typeof vi.fn>;
			set: ReturnType<typeof vi.fn>;
			setex: ReturnType<typeof vi.fn>;
			del: ReturnType<typeof vi.fn>;
			incr: ReturnType<typeof vi.fn>;
			expire: ReturnType<typeof vi.fn>;
			ttl: ReturnType<typeof vi.fn>;
			exists: ReturnType<typeof vi.fn>;
			keys: ReturnType<typeof vi.fn>;
		};

		beforeEach(async () => {
			mockRedisInstance = {
				ping: vi.fn().mockResolvedValue("PONG"),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
				get: vi.fn().mockResolvedValue("test-value"),
				set: vi.fn().mockResolvedValue("OK"),
				setex: vi.fn().mockResolvedValue("OK"),
				del: vi.fn().mockResolvedValue(1),
				incr: vi.fn().mockResolvedValue(1),
				expire: vi.fn().mockResolvedValue(1),
				ttl: vi.fn().mockResolvedValue(100),
				exists: vi.fn().mockResolvedValue(1),
				keys: vi.fn().mockResolvedValue(["key1", "key2"]),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			await initCache();
		});

		it("should call Redis get method", async () => {
			const cache = getCache();
			const result = await cache.get("test-key");

			expect(mockRedisInstance.get).toHaveBeenCalledWith("test-key");
			expect(result).toBe("test-value");
		});

		it("should call Redis set method without expiration", async () => {
			const cache = getCache();
			const result = await cache.set("test-key", "test-value");

			expect(mockRedisInstance.set).toHaveBeenCalledWith("test-key", "test-value");
			expect(result).toBe("OK");
		});

		it("should call Redis setex method when expiration is provided", async () => {
			const cache = getCache();
			const result = await cache.set("test-key", "test-value", 60);

			expect(mockRedisInstance.setex).toHaveBeenCalledWith("test-key", 60, "test-value");
			expect(result).toBe("OK");
		});

		it("should call Redis setex method directly", async () => {
			const cache = getCache();
			const result = await cache.setex("test-key", 60, "test-value");

			expect(mockRedisInstance.setex).toHaveBeenCalledWith("test-key", 60, "test-value");
			expect(result).toBe("OK");
		});

		it("should call Redis del method", async () => {
			const cache = getCache();
			const result = await cache.del("key1", "key2");

			expect(mockRedisInstance.del).toHaveBeenCalledWith("key1", "key2");
			expect(result).toBe(1);
		});

		it("should return 0 when deleting with no keys", async () => {
			const cache = getCache();
			const result = await cache.del();

			expect(mockRedisInstance.del).not.toHaveBeenCalled();
			expect(result).toBe(0);
		});

		it("should call Redis incr method", async () => {
			const cache = getCache();
			const result = await cache.incr("counter");

			expect(mockRedisInstance.incr).toHaveBeenCalledWith("counter");
			expect(result).toBe(1);
		});

		it("should call Redis expire method", async () => {
			const cache = getCache();
			const result = await cache.expire("test-key", 100);

			expect(mockRedisInstance.expire).toHaveBeenCalledWith("test-key", 100);
			expect(result).toBe(1);
		});

		it("should call Redis ttl method", async () => {
			const cache = getCache();
			const result = await cache.ttl("test-key");

			expect(mockRedisInstance.ttl).toHaveBeenCalledWith("test-key");
			expect(result).toBe(100);
		});

		it("should call Redis exists method", async () => {
			const cache = getCache();
			const result = await cache.exists("test-key");

			expect(mockRedisInstance.exists).toHaveBeenCalledWith("test-key");
			expect(result).toBe(1);
		});

		it("should call Redis ping method", async () => {
			const cache = getCache();
			const result = await cache.ping();

			expect(mockRedisInstance.ping).toHaveBeenCalled();
			expect(result).toBe("PONG");
		});

		it("should call Redis keys method", async () => {
			const cache = getCache();
			const result = await cache.keys("prefix:*");

			expect(mockRedisInstance.keys).toHaveBeenCalledWith("prefix:*");
			expect(result).toEqual(["key1", "key2"]);
		});
	});

	describe("Redis error handling", () => {
		it("should disconnect client when Redis connection fails", async () => {
			const mockRedisInstance = {
				ping: vi.fn().mockRejectedValue(new Error("Connection refused")),
				on: vi.fn(),
				disconnect: vi.fn(),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			const result = await initCache();

			expect(result.type).toBe("memory");
			expect(mockRedisInstance.disconnect).toHaveBeenCalled();
		});

		it("should register error and connect event handlers", async () => {
			const eventHandlers: Record<string, (...args: Array<unknown>) => void> = {};
			const mockRedisInstance = {
				ping: vi.fn().mockResolvedValue("PONG"),
				on: vi.fn().mockImplementation((event: string, handler: (...args: Array<unknown>) => void) => {
					eventHandlers[event] = handler;
				}),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(() => mockRedisInstance as never);
			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			await initCache();

			// Verify handlers were registered
			expect(mockRedisInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
			expect(mockRedisInstance.on).toHaveBeenCalledWith("connect", expect.any(Function));

			// Trigger handlers to cover those lines
			expect(eventHandlers.error).toBeDefined();
			expect(eventHandlers.connect).toBeDefined();
			eventHandlers.error(new Error("Test error"));
			eventHandlers.connect();
		});

		it("should handle retryStrategy callback", async () => {
			let capturedRetryStrategy: ((times: number) => number | null) | undefined;
			const mockRedisInstance = {
				ping: vi.fn().mockResolvedValue("PONG"),
				on: vi.fn(),
				quit: vi.fn().mockResolvedValue(undefined),
			};

			vi.mocked(Redis).mockImplementation(((
				_url: string,
				options: { retryStrategy: (times: number) => number | null },
			) => {
				capturedRetryStrategy = options.retryStrategy;
				return mockRedisInstance;
			}) as never);

			vi.mocked(Config.getConfig).mockReturnValue({
				REDIS_URL: "redis://localhost:6379",
			} as never);

			await initCache();

			// Test retry strategy returns delay for times <= 3
			expect(capturedRetryStrategy).toBeDefined();
			expect(capturedRetryStrategy?.(1)).toBe(50); // Math.min(1 * 50, 2000) = 50
			expect(capturedRetryStrategy?.(2)).toBe(100); // Math.min(2 * 50, 2000) = 100
			expect(capturedRetryStrategy?.(3)).toBe(150); // Math.min(3 * 50, 2000) = 150

			// Test retry strategy returns null for times > 3
			expect(capturedRetryStrategy?.(4)).toBeNull();
		});
	});
});
