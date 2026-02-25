import { getLog } from "../util/Logger.js";
import { type CacheClient, closeCache, getCache, getCacheType, initCache, isRedisEnabled } from "./CacheService.js";

const log = getLog(import.meta);

/**
 * Get the cache client instance (singleton)
 * This function maintains backward compatibility with existing code that uses getRedis()
 *
 * @deprecated Use getCache() from CacheService instead for new code
 */
export function getRedis(): CacheClient {
	return getCache();
}

/**
 * Close the cache connection
 *
 * @deprecated Use closeCache() from CacheService instead for new code
 */
export async function closeRedis(): Promise<void> {
	await closeCache();
	log.info("Cache connection closed");
}

/**
 * Check if Redis is being used (vs memory fallback)
 */
export { isRedisEnabled, getCacheType, initCache };
