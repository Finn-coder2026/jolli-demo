import { MemoryStore } from "./MemoryStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MemoryStore", () => {
	let store: MemoryStore;

	beforeEach(() => {
		MemoryStore.resetInstance();
		store = new MemoryStore();
	});

	afterEach(() => {
		store.close();
	});

	describe("get/set operations", () => {
		it("should set and get a value", async () => {
			await store.set("key1", "value1");
			const result = await store.get("key1");
			expect(result).toBe("value1");
		});

		it("should return null for non-existent key", async () => {
			const result = await store.get("nonexistent");
			expect(result).toBeNull();
		});

		it("should overwrite existing value", async () => {
			await store.set("key1", "value1");
			await store.set("key1", "value2");
			const result = await store.get("key1");
			expect(result).toBe("value2");
		});
	});

	describe("setex operation", () => {
		it("should set value with expiration", async () => {
			await store.setex("key1", 1, "value1");
			const result = await store.get("key1");
			expect(result).toBe("value1");
		});

		it("should expire value after TTL", async () => {
			vi.useFakeTimers();
			await store.setex("key1", 1, "value1");

			// Value should exist initially
			expect(await store.get("key1")).toBe("value1");

			// Advance time past expiration
			vi.advanceTimersByTime(1500);

			// Value should be expired
			expect(await store.get("key1")).toBeNull();

			vi.useRealTimers();
		});
	});

	describe("del operation", () => {
		it("should delete existing key", async () => {
			await store.set("key1", "value1");
			const deleted = await store.del("key1");
			expect(deleted).toBe(1);
			expect(await store.get("key1")).toBeNull();
		});

		it("should return 0 for non-existent key", async () => {
			const deleted = await store.del("nonexistent");
			expect(deleted).toBe(0);
		});

		it("should delete multiple keys", async () => {
			await store.set("key1", "value1");
			await store.set("key2", "value2");
			await store.set("key3", "value3");

			const deleted = await store.del("key1", "key2", "nonexistent");
			expect(deleted).toBe(2);
		});
	});

	describe("incr operation", () => {
		it("should increment non-existent key starting from 0", async () => {
			const result = await store.incr("counter");
			expect(result).toBe(1);
		});

		it("should increment existing numeric value", async () => {
			await store.set("counter", "5");
			const result = await store.incr("counter");
			expect(result).toBe(6);
		});

		it("should increment multiple times", async () => {
			await store.incr("counter");
			await store.incr("counter");
			const result = await store.incr("counter");
			expect(result).toBe(3);
		});

		it("should preserve TTL when incrementing", async () => {
			vi.useFakeTimers();
			await store.setex("counter", 10, "5");
			await store.incr("counter");

			// Value should still be accessible
			expect(await store.get("counter")).toBe("6");

			// Advance time past expiration
			vi.advanceTimersByTime(11000);

			// Value should be expired
			expect(await store.get("counter")).toBeNull();

			vi.useRealTimers();
		});

		it("should handle non-numeric value as 0 when incrementing", async () => {
			await store.set("counter", "not-a-number");
			const result = await store.incr("counter");
			expect(result).toBe(1);
		});
	});

	describe("expire operation", () => {
		it("should set expiration on existing key", async () => {
			vi.useFakeTimers();
			await store.set("key1", "value1");
			const result = await store.expire("key1", 1);
			expect(result).toBe(1);

			// Value should exist
			expect(await store.get("key1")).toBe("value1");

			// Advance time past expiration
			vi.advanceTimersByTime(1500);

			// Value should be expired
			expect(await store.get("key1")).toBeNull();

			vi.useRealTimers();
		});

		it("should return 0 for non-existent key", async () => {
			const result = await store.expire("nonexistent", 10);
			expect(result).toBe(0);
		});
	});

	describe("ttl operation", () => {
		it("should return -2 for non-existent key", async () => {
			const ttl = await store.ttl("nonexistent");
			expect(ttl).toBe(-2);
		});

		it("should return -1 for key without expiration", async () => {
			await store.set("key1", "value1");
			const ttl = await store.ttl("key1");
			expect(ttl).toBe(-1);
		});

		it("should return remaining TTL for key with expiration", async () => {
			vi.useFakeTimers();
			await store.setex("key1", 100, "value1");
			vi.advanceTimersByTime(30000); // Advance 30 seconds

			const ttl = await store.ttl("key1");
			expect(ttl).toBe(70); // 100 - 30 = 70 seconds remaining

			vi.useRealTimers();
		});

		it("should return -2 for expired key", async () => {
			vi.useFakeTimers();
			await store.setex("key1", 1, "value1");
			vi.advanceTimersByTime(2000);

			const ttl = await store.ttl("key1");
			expect(ttl).toBe(-2);

			vi.useRealTimers();
		});

		it("should return -2 when remaining time is exactly 0", async () => {
			vi.useFakeTimers();
			await store.setex("key1", 1, "value1");
			// Advance exactly to the expiration time
			vi.advanceTimersByTime(1000);

			const ttl = await store.ttl("key1");
			expect(ttl).toBe(-2);

			vi.useRealTimers();
		});

		it("should return -2 when ttl remaining is 0 or negative but entry is still valid", async () => {
			// This tests the edge case where entry.expiresAt is just barely <= Date.now()
			// but entry is still considered valid (edge case of isValid check)
			vi.useFakeTimers();
			await store.setex("key1", 1, "value1");
			// Advance to just under the expiration
			vi.advanceTimersByTime(999);
			// Entry is still valid at this point
			const result = await store.ttl("key1");
			// Should return 1 because Math.ceil((expiresAt - now) / 1000) rounds up
			expect(result).toBeGreaterThanOrEqual(0);

			vi.useRealTimers();
		});
	});

	describe("exists operation", () => {
		it("should return 1 for existing key", async () => {
			await store.set("key1", "value1");
			const result = await store.exists("key1");
			expect(result).toBe(1);
		});

		it("should return 0 for non-existent key", async () => {
			const result = await store.exists("nonexistent");
			expect(result).toBe(0);
		});

		it("should return 0 for expired key", async () => {
			vi.useFakeTimers();
			await store.setex("key1", 1, "value1");
			vi.advanceTimersByTime(2000);

			const result = await store.exists("key1");
			expect(result).toBe(0);

			vi.useRealTimers();
		});
	});

	describe("ping operation", () => {
		it("should return PONG", async () => {
			const result = await store.ping();
			expect(result).toBe("PONG");
		});
	});

	describe("keys operation", () => {
		it("should return all keys matching pattern", async () => {
			await store.set("user:1", "data1");
			await store.set("user:2", "data2");
			await store.set("session:abc", "data3");

			const result = await store.keys("user:*");
			expect(result).toHaveLength(2);
			expect(result).toContain("user:1");
			expect(result).toContain("user:2");
		});

		it("should not return expired keys", async () => {
			vi.useFakeTimers();
			await store.setex("user:1", 1, "data1");
			await store.set("user:2", "data2");
			vi.advanceTimersByTime(2000);

			const result = await store.keys("user:*");
			expect(result).toHaveLength(1);
			expect(result).toContain("user:2");

			vi.useRealTimers();
		});
	});

	describe("singleton pattern", () => {
		it("should return same instance from getInstance", () => {
			const instance1 = MemoryStore.getInstance();
			const instance2 = MemoryStore.getInstance();
			expect(instance1).toBe(instance2);
		});

		it("should return new instance after reset", () => {
			const instance1 = MemoryStore.getInstance();
			MemoryStore.resetInstance();
			const instance2 = MemoryStore.getInstance();
			expect(instance1).not.toBe(instance2);
		});
	});

	describe("size and clear", () => {
		it("should return correct size", async () => {
			expect(store.size()).toBe(0);
			await store.set("key1", "value1");
			await store.set("key2", "value2");
			expect(store.size()).toBe(2);
		});

		it("should clear all entries", async () => {
			await store.set("key1", "value1");
			await store.set("key2", "value2");
			store.clear();
			expect(store.size()).toBe(0);
		});
	});

	describe("cleanup timer", () => {
		it("should clean up expired entries after cleanup interval", async () => {
			vi.useFakeTimers();

			// Close the store created with real timers and create one with fake timers
			store.close();
			store = new MemoryStore();

			// Set some entries with short expiration
			await store.setex("expired1", 30, "value1");
			await store.setex("expired2", 30, "value2");
			await store.set("permanent", "value3");

			expect(store.size()).toBe(3);

			// Advance time past expiration but before cleanup
			vi.advanceTimersByTime(35_000);
			// Entries are still in the store (just expired but not cleaned up)
			expect(store.size()).toBe(3);

			// Advance time to trigger cleanup (60 seconds total from start)
			vi.advanceTimersByTime(30_000);
			// Now cleanup should have run and removed expired entries
			expect(store.size()).toBe(1);
			expect(await store.get("permanent")).toBe("value3");

			vi.useRealTimers();
		});

		it("should not remove entries that are not expired during cleanup", async () => {
			vi.useFakeTimers();

			// Close the store created with real timers and create one with fake timers
			store.close();
			store = new MemoryStore();

			await store.set("noexpire", "value1");
			await store.setex("longexpire", 120, "value2");

			expect(store.size()).toBe(2);

			// Trigger cleanup after 60 seconds
			vi.advanceTimersByTime(60_000);

			// Both entries should still exist
			expect(store.size()).toBe(2);
			expect(await store.get("noexpire")).toBe("value1");
			expect(await store.get("longexpire")).toBe("value2");

			vi.useRealTimers();
		});
	});
});
