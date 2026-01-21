import { clearCache, getCachedAvailability, invalidateCachedSubdomain, setCachedAvailability } from "./SubdomainCache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("SubdomainCache", () => {
	beforeEach(() => {
		clearCache();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getCachedAvailability", () => {
		it("should return undefined for uncached subdomain", () => {
			expect(getCachedAvailability("docs")).toBeUndefined();
		});

		it("should return cached value", () => {
			setCachedAvailability("docs", true);
			expect(getCachedAvailability("docs")).toBe(true);

			setCachedAvailability("taken", false);
			expect(getCachedAvailability("taken")).toBe(false);
		});

		it("should be case-insensitive", () => {
			setCachedAvailability("DOCS", true);
			expect(getCachedAvailability("docs")).toBe(true);
			expect(getCachedAvailability("Docs")).toBe(true);
		});

		it("should expire after TTL", () => {
			setCachedAvailability("docs", true);
			expect(getCachedAvailability("docs")).toBe(true);

			// Advance time past TTL (10 seconds)
			vi.advanceTimersByTime(11_000);

			expect(getCachedAvailability("docs")).toBeUndefined();
		});

		it("should not expire before TTL", () => {
			setCachedAvailability("docs", true);

			// Advance time but stay within TTL
			vi.advanceTimersByTime(9_000);

			expect(getCachedAvailability("docs")).toBe(true);
		});

		it("should expire exactly at TTL boundary", () => {
			setCachedAvailability("docs", true);

			// Advance time to exactly TTL
			vi.advanceTimersByTime(10_000);

			// At exactly TTL, should still be valid (> not >=)
			expect(getCachedAvailability("docs")).toBe(true);

			// One more ms should expire it
			vi.advanceTimersByTime(1);
			expect(getCachedAvailability("docs")).toBeUndefined();
		});
	});

	describe("setCachedAvailability", () => {
		it("should overwrite existing cached value", () => {
			setCachedAvailability("docs", true);
			expect(getCachedAvailability("docs")).toBe(true);

			setCachedAvailability("docs", false);
			expect(getCachedAvailability("docs")).toBe(false);
		});

		it("should reset TTL when overwriting", () => {
			setCachedAvailability("docs", true);

			// Advance time close to TTL
			vi.advanceTimersByTime(9_000);

			// Overwrite - should reset TTL
			setCachedAvailability("docs", true);

			// Advance another 9 seconds (total 18 from start, but only 9 from reset)
			vi.advanceTimersByTime(9_000);

			// Should still be valid
			expect(getCachedAvailability("docs")).toBe(true);
		});
	});

	describe("invalidateCachedSubdomain", () => {
		it("should remove cached subdomain", () => {
			setCachedAvailability("docs", true);
			expect(getCachedAvailability("docs")).toBe(true);

			invalidateCachedSubdomain("docs");

			expect(getCachedAvailability("docs")).toBeUndefined();
		});

		it("should be case-insensitive", () => {
			setCachedAvailability("docs", true);
			invalidateCachedSubdomain("DOCS");
			expect(getCachedAvailability("docs")).toBeUndefined();
		});

		it("should handle non-existent subdomain gracefully", () => {
			// Should not throw
			expect(() => invalidateCachedSubdomain("nonexistent")).not.toThrow();
		});
	});

	describe("clearCache", () => {
		it("should remove all cached entries", () => {
			setCachedAvailability("docs", true);
			setCachedAvailability("api", false);

			clearCache();

			expect(getCachedAvailability("docs")).toBeUndefined();
			expect(getCachedAvailability("api")).toBeUndefined();
		});

		it("should handle empty cache gracefully", () => {
			// Should not throw
			expect(() => clearCache()).not.toThrow();
		});
	});

	describe("cache size limiting", () => {
		it("should evict expired entries when cache is full", () => {
			// Fill cache with entries
			for (let i = 0; i < 1000; i++) {
				setCachedAvailability(`subdomain${i}`, true);
			}

			// Expire all entries
			vi.advanceTimersByTime(11_000);

			// Add a new entry - should trigger eviction of expired entries
			setCachedAvailability("newsubdomain", true);

			// New entry should be accessible
			expect(getCachedAvailability("newsubdomain")).toBe(true);
		});

		it("should evict oldest entries when cache is full and no expired entries", () => {
			// Fill cache with entries
			for (let i = 0; i < 1000; i++) {
				setCachedAvailability(`subdomain${i}`, true);
			}

			// Add a new entry without expiring old ones
			setCachedAvailability("newsubdomain", true);

			// New entry should be accessible
			expect(getCachedAvailability("newsubdomain")).toBe(true);

			// Some old entries should have been evicted (10%)
			let evictedCount = 0;
			for (let i = 0; i < 100; i++) {
				if (getCachedAvailability(`subdomain${i}`) === undefined) {
					evictedCount++;
				}
			}
			expect(evictedCount).toBeGreaterThan(0);
		});

		it("should not evict when updating existing key", () => {
			// Fill cache with entries
			for (let i = 0; i < 1000; i++) {
				setCachedAvailability(`subdomain${i}`, true);
			}

			// Update an existing entry - should not trigger eviction
			setCachedAvailability("subdomain500", false);

			// Updated entry should be accessible with new value
			expect(getCachedAvailability("subdomain500")).toBe(false);

			// First entry should still be accessible
			expect(getCachedAvailability("subdomain0")).toBe(true);
		});
	});
});
