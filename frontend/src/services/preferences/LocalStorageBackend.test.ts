import { LocalStorageBackend, localStorageBackend } from "./LocalStorageBackend";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("LocalStorageBackend", () => {
	let backend: LocalStorageBackend;

	beforeEach(() => {
		backend = new LocalStorageBackend();
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	describe("getItem", () => {
		it("should return stored value", () => {
			localStorage.setItem("test-key", "test-value");
			expect(backend.getItem("test-key")).toBe("test-value");
		});

		it("should return null for non-existent key", () => {
			expect(backend.getItem("non-existent")).toBeNull();
		});

		it("should return null when localStorage throws", () => {
			vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
				throw new Error("Storage unavailable");
			});

			expect(backend.getItem("test-key")).toBeNull();
		});
	});

	describe("setItem", () => {
		it("should store value", () => {
			backend.setItem("test-key", "test-value");
			expect(localStorage.getItem("test-key")).toBe("test-value");
		});

		it("should silently fail when localStorage throws", () => {
			vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
				throw new Error("Storage quota exceeded");
			});

			// Should not throw
			expect(() => backend.setItem("test-key", "test-value")).not.toThrow();
		});
	});

	describe("removeItem", () => {
		it("should remove value", () => {
			localStorage.setItem("test-key", "test-value");
			backend.removeItem("test-key");
			expect(localStorage.getItem("test-key")).toBeNull();
		});

		it("should silently fail when localStorage throws", () => {
			vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
				throw new Error("Storage unavailable");
			});

			// Should not throw
			expect(() => backend.removeItem("test-key")).not.toThrow();
		});
	});

	describe("singleton instance", () => {
		it("should export a singleton instance", () => {
			expect(localStorageBackend).toBeInstanceOf(LocalStorageBackend);
		});
	});
});
