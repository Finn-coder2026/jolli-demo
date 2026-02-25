/**
 * Tests for FavoritesHashStore.
 */

import {
	getServerFavoritesHash,
	isServerFavoritesHashLoaded,
	resetFavoritesHashStore,
	setServerFavoritesHash,
} from "./FavoritesHashStore";
import { beforeEach, describe, expect, it } from "vitest";

describe("FavoritesHashStore", () => {
	beforeEach(() => {
		// Reset the module state between tests
		resetFavoritesHashStore();
	});

	it("should return EMPTY as the default value", () => {
		expect(getServerFavoritesHash()).toBe("EMPTY");
	});

	it("should not be loaded initially", () => {
		expect(isServerFavoritesHashLoaded()).toBe(false);
	});

	it("should store and retrieve a hash value", () => {
		setServerFavoritesHash("abc123hash");
		expect(getServerFavoritesHash()).toBe("abc123hash");
	});

	it("should mark as loaded after setting hash", () => {
		expect(isServerFavoritesHashLoaded()).toBe(false);
		setServerFavoritesHash("abc123hash");
		expect(isServerFavoritesHashLoaded()).toBe(true);
	});

	it("should mark as loaded even when setting EMPTY hash", () => {
		expect(isServerFavoritesHashLoaded()).toBe(false);
		setServerFavoritesHash("EMPTY");
		expect(isServerFavoritesHashLoaded()).toBe(true);
	});

	it("should update the hash when set multiple times", () => {
		setServerFavoritesHash("first-hash");
		expect(getServerFavoritesHash()).toBe("first-hash");

		setServerFavoritesHash("second-hash");
		expect(getServerFavoritesHash()).toBe("second-hash");
	});

	it("should handle empty string hash", () => {
		setServerFavoritesHash("");
		expect(getServerFavoritesHash()).toBe("");
	});

	it("should reset both hash and loaded state", () => {
		setServerFavoritesHash("some-hash");
		expect(getServerFavoritesHash()).toBe("some-hash");
		expect(isServerFavoritesHashLoaded()).toBe(true);

		resetFavoritesHashStore();

		expect(getServerFavoritesHash()).toBe("EMPTY");
		expect(isServerFavoritesHashLoaded()).toBe(false);
	});
});
