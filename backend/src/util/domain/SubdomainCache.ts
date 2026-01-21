/**
 * Simple in-memory cache for subdomain availability checks.
 * Reduces database queries when users rapidly type in the subdomain field.
 *
 * TTL: 10 seconds (matches frontend debounce pattern)
 * Max size: 1000 entries (prevents unbounded memory growth)
 */

interface CacheEntry {
	available: boolean;
	timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 10_000; // 10 seconds
const MAX_CACHE_SIZE = 1000;

/**
 * Get cached availability result for a subdomain.
 * @returns cached value or undefined if not cached/expired
 */
export function getCachedAvailability(subdomain: string): boolean | undefined {
	const key = subdomain.toLowerCase();
	const entry = cache.get(key);

	if (!entry) {
		return;
	}

	if (Date.now() - entry.timestamp > TTL_MS) {
		cache.delete(key);
		return;
	}

	return entry.available;
}

/**
 * Cache an availability result for a subdomain.
 * Evicts expired entries and oldest entries when cache is full.
 */
export function setCachedAvailability(subdomain: string, available: boolean): void {
	const key = subdomain.toLowerCase();

	// If we're at max size and this is a new key, evict old entries
	if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
		evictExpiredEntries();

		// If still at max, remove oldest entries until we have room
		if (cache.size >= MAX_CACHE_SIZE) {
			const entriesToRemove = Math.max(1, Math.floor(MAX_CACHE_SIZE * 0.1)); // Remove 10%
			const keys = Array.from(cache.keys());
			for (let i = 0; i < entriesToRemove && i < keys.length; i++) {
				cache.delete(keys[i]);
			}
		}
	}

	cache.set(key, {
		available,
		timestamp: Date.now(),
	});
}

/**
 * Remove all expired entries from the cache.
 */
function evictExpiredEntries(): void {
	const now = Date.now();
	for (const [key, entry] of cache.entries()) {
		if (now - entry.timestamp > TTL_MS) {
			cache.delete(key);
		}
	}
}

/**
 * Clear the cache (useful for testing).
 */
export function clearCache(): void {
	cache.clear();
}

/**
 * Invalidate a specific subdomain from cache.
 * Call this when a site is created with that subdomain.
 */
export function invalidateCachedSubdomain(subdomain: string): void {
	cache.delete(subdomain.toLowerCase());
}
