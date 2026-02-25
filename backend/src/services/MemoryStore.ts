import { getLog } from "../util/Logger.js";

const log = getLog(import.meta);

/**
 * Entry stored in memory with optional expiration
 */
interface MemoryEntry {
	value: string;
	expiresAt: number | null; // Unix timestamp in milliseconds, null = no expiration
}

/**
 * In-memory store that mimics Redis operations with TTL support.
 * This is a fallback for when Redis is not available.
 *
 * Note: This store is NOT suitable for production multi-instance deployments
 * as data is not shared between instances. Use Redis for production.
 */
export class MemoryStore {
	private store: Map<string, MemoryEntry> = new Map();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;
	private static instance: MemoryStore | null = null;

	constructor() {
		// Run cleanup every 60 seconds to remove expired entries
		this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
		// Don't block process exit
		if (this.cleanupInterval.unref) {
			this.cleanupInterval.unref();
		}
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): MemoryStore {
		if (!MemoryStore.instance) {
			MemoryStore.instance = new MemoryStore();
			log.info("MemoryStore initialized (in-memory fallback mode)");
		}
		return MemoryStore.instance;
	}

	/**
	 * Reset singleton (for testing)
	 */
	static resetInstance(): void {
		if (MemoryStore.instance) {
			MemoryStore.instance.close();
			MemoryStore.instance = null;
		}
	}

	/**
	 * Check if key exists and is not expired
	 */
	private isValid(entry: MemoryEntry | undefined): entry is MemoryEntry {
		if (!entry) {
			return false;
		}
		if (entry.expiresAt === null) {
			return true;
		}
		return Date.now() < entry.expiresAt;
	}

	/**
	 * Get a value by key
	 */
	get(key: string): Promise<string | null> {
		const entry = this.store.get(key);
		if (!this.isValid(entry)) {
			this.store.delete(key);
			return Promise.resolve(null);
		}
		return Promise.resolve(entry.value);
	}

	/**
	 * Set a value with optional expiration in seconds
	 */
	set(key: string, value: string, expirationSeconds?: number): Promise<"OK"> {
		const expiresAt = expirationSeconds ? Date.now() + expirationSeconds * 1000 : null;
		this.store.set(key, { value, expiresAt });
		return Promise.resolve("OK");
	}

	/**
	 * Set a value with expiration in seconds (Redis SETEX equivalent)
	 */
	setex(key: string, seconds: number, value: string): Promise<"OK"> {
		return this.set(key, value, seconds);
	}

	/**
	 * Delete one or more keys
	 */
	del(...keys: Array<string>): Promise<number> {
		let deleted = 0;
		for (const key of keys) {
			if (this.store.delete(key)) {
				deleted++;
			}
		}
		return Promise.resolve(deleted);
	}

	/**
	 * Increment a numeric value by 1
	 */
	incr(key: string): Promise<number> {
		const entry = this.store.get(key);
		let currentValue = 0;
		let expiresAt: number | null = null;

		if (this.isValid(entry)) {
			currentValue = Number.parseInt(entry.value, 10) || 0;
			expiresAt = entry.expiresAt;
		}

		const newValue = currentValue + 1;
		this.store.set(key, { value: String(newValue), expiresAt });
		return Promise.resolve(newValue);
	}

	/**
	 * Set expiration on a key (in seconds)
	 */
	expire(key: string, seconds: number): Promise<number> {
		const entry = this.store.get(key);
		if (!this.isValid(entry)) {
			return Promise.resolve(0);
		}
		entry.expiresAt = Date.now() + seconds * 1000;
		return Promise.resolve(1);
	}

	/**
	 * Get remaining TTL in seconds (-2 if key doesn't exist, -1 if no expiration)
	 */
	ttl(key: string): Promise<number> {
		const entry = this.store.get(key);
		if (!this.isValid(entry)) {
			return Promise.resolve(-2);
		}
		if (entry.expiresAt === null) {
			return Promise.resolve(-1);
		}
		const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
		return Promise.resolve(remaining > 0 ? remaining : -2);
	}

	/**
	 * Check if key exists
	 */
	exists(key: string): Promise<number> {
		const entry = this.store.get(key);
		return Promise.resolve(this.isValid(entry) ? 1 : 0);
	}

	/**
	 * Ping - always returns PONG
	 */
	ping(): Promise<string> {
		return Promise.resolve("PONG");
	}

	/**
	 * Get all keys matching pattern (simplified, only supports * wildcard at end)
	 */
	keys(pattern: string): Promise<Array<string>> {
		const results: Array<string> = [];
		const prefix = pattern.replace(/\*$/, "");

		for (const key of this.store.keys()) {
			const entry = this.store.get(key);
			if (this.isValid(entry) && key.startsWith(prefix)) {
				results.push(key);
			}
		}
		return Promise.resolve(results);
	}

	/**
	 * Clean up expired entries
	 */
	private cleanup(): void {
		const now = Date.now();
		let cleaned = 0;
		for (const [key, entry] of this.store.entries()) {
			if (entry.expiresAt !== null && entry.expiresAt <= now) {
				this.store.delete(key);
				cleaned++;
			}
		}
		if (cleaned > 0) {
			log.debug("MemoryStore cleanup: removed %d expired entries", cleaned);
		}
	}

	/**
	 * Close the store and cleanup resources
	 */
	close(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.store.clear();
	}

	/**
	 * Get store size (for debugging)
	 */
	size(): number {
		return this.store.size;
	}

	/**
	 * Clear all entries (for testing)
	 */
	clear(): void {
		this.store.clear();
	}
}
