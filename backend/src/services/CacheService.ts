import { getConfig } from "../config/Config.js";
import { getLog } from "../util/Logger.js";
import { connectRedis, type RedisClientType } from "../util/RedisClient.js";
import { MemoryStore } from "./MemoryStore.js";

const log = getLog(import.meta);

/**
 * Cache client interface that both Redis and MemoryStore implement
 */
export interface CacheClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, expirationSeconds?: number): Promise<"OK">;
	setex(key: string, seconds: number, value: string): Promise<"OK">;
	del(...keys: Array<string>): Promise<number>;
	incr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<number>;
	ttl(key: string): Promise<number>;
	exists(key: string): Promise<number>;
	ping(): Promise<string>;
	keys(pattern: string): Promise<Array<string>>;
}

/**
 * Wrapper around ioredis Redis client to match our CacheClient interface.
 * Works with both standalone Redis and Redis.Cluster clients.
 */
class RedisCacheClient implements CacheClient {
	constructor(private redis: RedisClientType) {}

	get(key: string): Promise<string | null> {
		return this.redis.get(key);
	}

	async set(key: string, value: string, expirationSeconds?: number): Promise<"OK"> {
		if (expirationSeconds) {
			await this.redis.setex(key, expirationSeconds, value);
		} else {
			await this.redis.set(key, value);
		}
		return "OK";
	}

	async setex(key: string, seconds: number, value: string): Promise<"OK"> {
		await this.redis.setex(key, seconds, value);
		return "OK";
	}

	del(...keys: Array<string>): Promise<number> {
		if (keys.length === 0) {
			return Promise.resolve(0);
		}
		return this.redis.del(...keys);
	}

	incr(key: string): Promise<number> {
		return this.redis.incr(key);
	}

	expire(key: string, seconds: number): Promise<number> {
		return this.redis.expire(key, seconds);
	}

	ttl(key: string): Promise<number> {
		return this.redis.ttl(key);
	}

	exists(key: string): Promise<number> {
		return this.redis.exists(key);
	}

	ping(): Promise<string> {
		return this.redis.ping();
	}

	keys(pattern: string): Promise<Array<string>> {
		return this.redis.keys(pattern);
	}
}

/**
 * Cache service type - MemoryDB, Redis, or Memory backed
 * - memorydb: Amazon MemoryDB with IAM authentication
 * - redis: Standard Redis with password authentication (Stackhero, local, etc.)
 * - memory: In-memory fallback for local development or when Redis unavailable
 */
export type CacheType = "memorydb" | "redis" | "memory";

/**
 * Singleton cache client manager
 * Automatically falls back to MemoryStore if Redis/MemoryDB is not configured or unavailable
 */
let cacheClient: CacheClient | null = null;
let cacheType: CacheType = "memory";
let redisClient: RedisClientType | null = null;

/**
 * Determine cache type based on Redis URL.
 * MemoryDB endpoints contain ".memorydb." in the hostname.
 */
function determineCacheType(redisUrl: string): "memorydb" | "redis" {
	return redisUrl.includes(".memorydb.") ? "memorydb" : "redis";
}

/**
 * Initialize the cache client (MemoryDB, Redis, or Memory fallback)
 * @returns The cache client and the type of cache being used
 */
export async function initCache(): Promise<{ client: CacheClient; type: CacheType }> {
	if (cacheClient) {
		return { client: cacheClient, type: cacheType };
	}

	const config = getConfig();
	const redisUrl = config.REDIS_URL;

	if (redisUrl) {
		try {
			const detectedType = determineCacheType(redisUrl);
			log.info("Attempting to connect to %s...", detectedType === "memorydb" ? "MemoryDB" : "Redis");

			redisClient = await connectRedis(redisUrl, { name: "cache", maxRetries: 3 });

			cacheClient = new RedisCacheClient(redisClient);
			cacheType = detectedType;
			log.info("Using %s for caching", detectedType === "memorydb" ? "MemoryDB" : "Redis");
			return { client: cacheClient, type: cacheType };
		} catch (error) {
			log.warn(error, "Failed to connect to cache backend, falling back to in-memory storage");
			redisClient = null;
		}
	} else {
		log.info("REDIS_URL not configured, using in-memory storage");
	}

	// Fall back to memory store
	cacheClient = MemoryStore.getInstance();
	cacheType = "memory";
	log.info("Using in-memory caching (not recommended for production multi-instance deployments)");
	return { client: cacheClient, type: cacheType };
}

/**
 * Get the cache client (initializes if needed)
 * This is synchronous for backward compatibility - init should be called first
 */
export function getCache(): CacheClient {
	if (!cacheClient) {
		// Synchronous fallback - use memory store if not initialized
		cacheClient = MemoryStore.getInstance();
		cacheType = "memory";
		log.warn("Cache not initialized, using in-memory fallback. Call initCache() during app startup.");
	}
	return cacheClient;
}

/**
 * Get the cache type (memorydb, redis, or memory)
 */
export function getCacheType(): CacheType {
	return cacheType;
}

/**
 * Check if Redis or MemoryDB is being used (not memory fallback)
 */
export function isRedisEnabled(): boolean {
	return cacheType === "redis" || cacheType === "memorydb";
}

/**
 * Get the underlying Redis client if available (for session store compatibility)
 * Returns null if using memory store.
 * Note: For MemoryDB, this returns a Redis.Cluster client.
 */
export function getRedisClientIfAvailable(): RedisClientType | null {
	return redisClient;
}

/**
 * Close the cache connection
 */
export async function closeCache(): Promise<void> {
	if (redisClient) {
		await redisClient.quit();
		redisClient = null;
		log.info("Cache connection closed");
	}
	if (cacheType === "memory" && cacheClient) {
		(cacheClient as MemoryStore).close();
	}
	cacheClient = null;
	cacheType = "memory";
}

/**
 * Reset cache (for testing)
 */
export function resetCache(): void {
	cacheClient = null;
	cacheType = "memory";
	redisClient = null;
	MemoryStore.resetInstance();
}
