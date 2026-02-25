import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock Logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}));

// Mock ClientContext - IMPORTANT: Return stable object references to avoid infinite useEffect loops
const mockGetPreferences = vi.fn();
const mockUpdatePreferences = vi.fn();
const mockProfileClient = {
	getPreferences: mockGetPreferences,
	updatePreferences: mockUpdatePreferences,
};
const mockClient = {
	profile: () => mockProfileClient,
};
vi.mock("../contexts/ClientContext", () => ({
	useClient: () => mockClient,
}));

// Mock OrgContext - track isLoading state for cross-device sync tests
let mockOrgIsLoading = false;
vi.mock("../contexts/OrgContext", () => ({
	useOrg: () => ({ isLoading: mockOrgIsLoading }),
}));

// Mock FavoritesHashStore
const mockGetServerFavoritesHash = vi.fn();
const mockIsServerFavoritesHashLoaded = vi.fn();
vi.mock("../services/FavoritesHashStore", () => ({
	getServerFavoritesHash: () => mockGetServerFavoritesHash(),
	isServerFavoritesHashLoaded: () => mockIsServerFavoritesHashLoaded(),
}));

import { useUserPreferences } from "./useUserPreferences";

describe("useUserPreferences", () => {
	let mockLocalStorage: { [key: string]: string };
	let mockBroadcastChannel: {
		postMessage: Mock;
		close: Mock;
		onmessage: ((event: MessageEvent) => void) | null;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock localStorage
		mockLocalStorage = {};
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(key => mockLocalStorage[key] ?? null);
		vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
			mockLocalStorage[key] = value;
		});

		// Mock BroadcastChannel
		mockBroadcastChannel = {
			postMessage: vi.fn(),
			close: vi.fn(),
			onmessage: null,
		};
		vi.stubGlobal(
			"BroadcastChannel",
			vi.fn().mockImplementation(() => mockBroadcastChannel),
		);

		// Default mock returns - org context is loaded by default
		mockOrgIsLoading = false;
		mockIsServerFavoritesHashLoaded.mockReturnValue(true);
		mockGetServerFavoritesHash.mockReturnValue("EMPTY");
		mockGetPreferences.mockResolvedValue({
			favoriteSpaces: [],
			favoriteSites: [],
			hash: "EMPTY",
		});
		mockUpdatePreferences.mockResolvedValue({
			favoriteSpaces: [],
			favoriteSites: [],
			hash: "newhash123",
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	describe("initialization", () => {
		it("should return empty arrays when no data exists", async () => {
			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.favoriteSpaces).toEqual([]);
			expect(result.current.favoriteSites).toEqual([]);
		});

		it("should load from localStorage immediately", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [4, 5],
				hash: "abc123",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc123"); // Same hash

			const { result } = renderHook(() => useUserPreferences());

			// Should show localStorage data immediately
			expect(result.current.favoriteSpaces).toEqual([1, 2, 3]);
			expect(result.current.favoriteSites).toEqual([4, 5]);

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});
		});

		it("should not fetch from server when hash matches", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1, 2],
				favoriteSites: [3],
				hash: "samehash",
			});
			mockGetServerFavoritesHash.mockReturnValue("samehash");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Should not call server API
			expect(mockGetPreferences).not.toHaveBeenCalled();
		});

		it("should fetch from server when hash differs", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1],
				favoriteSites: [],
				hash: "oldhash",
			});
			mockGetServerFavoritesHash.mockReturnValue("newhash");
			mockGetPreferences.mockResolvedValue({
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [4],
				hash: "newhash",
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Should have called server API
			expect(mockGetPreferences).toHaveBeenCalled();
			// Should have updated to server data
			expect(result.current.favoriteSpaces).toEqual([1, 2, 3]);
			expect(result.current.favoriteSites).toEqual([4]);
		});

		it("should handle EMPTY server hash (no preferences on server)", async () => {
			mockGetServerFavoritesHash.mockReturnValue("EMPTY");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Should not call server API for EMPTY hash
			expect(mockGetPreferences).not.toHaveBeenCalled();
		});

		it("should stay loading while org context is loading", () => {
			// Simulate org context still loading (hash not yet set)
			mockOrgIsLoading = true;
			mockIsServerFavoritesHashLoaded.mockReturnValue(false);

			const { result } = renderHook(() => useUserPreferences());

			// Should stay in loading state while org context loads
			expect(result.current.isLoading).toBe(true);

			// Should not have called server API yet
			expect(mockGetPreferences).not.toHaveBeenCalled();
		});

		it("should fetch from server on new device after org context loads", async () => {
			// Simulate new device: empty localStorage, org context still loading
			mockOrgIsLoading = true;
			mockIsServerFavoritesHashLoaded.mockReturnValue(false);
			mockGetServerFavoritesHash.mockReturnValue("EMPTY"); // Not yet set

			const { result, rerender } = renderHook(() => useUserPreferences());

			// Should stay in loading state
			expect(result.current.isLoading).toBe(true);
			expect(mockGetPreferences).not.toHaveBeenCalled();

			// Simulate org context finishing load with user's actual hash
			mockOrgIsLoading = false;
			mockIsServerFavoritesHashLoaded.mockReturnValue(true);
			mockGetServerFavoritesHash.mockReturnValue("usershash123");
			mockGetPreferences.mockResolvedValue({
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [10],
				hash: "usershash123",
			});

			// Re-render to trigger useEffect with new isOrgLoading value
			rerender();

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Should have fetched from server since localStorage was empty
			expect(mockGetPreferences).toHaveBeenCalled();
			expect(result.current.favoriteSpaces).toEqual([1, 2, 3]);
			expect(result.current.favoriteSites).toEqual([10]);
		});
	});

	describe("toggleSpaceFavorite", () => {
		it("should add space to favorites", async () => {
			mockUpdatePreferences.mockResolvedValue({
				favoriteSpaces: [5],
				favoriteSites: [],
				hash: "newhash",
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			act(() => {
				result.current.toggleSpaceFavorite(5);
			});

			expect(result.current.favoriteSpaces).toContain(5);
		});

		it("should remove space from favorites", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");
			mockUpdatePreferences.mockResolvedValue({
				favoriteSpaces: [1, 3],
				favoriteSites: [],
				hash: "newhash",
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			act(() => {
				result.current.toggleSpaceFavorite(2);
			});

			expect(result.current.favoriteSpaces).not.toContain(2);
		});

		it("should broadcast changes to other tabs", async () => {
			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			act(() => {
				result.current.toggleSpaceFavorite(1);
			});

			expect(mockBroadcastChannel.postMessage).toHaveBeenCalled();
		});
	});

	describe("toggleSiteFavorite", () => {
		it("should add site to favorites", async () => {
			mockUpdatePreferences.mockResolvedValue({
				favoriteSpaces: [],
				favoriteSites: [10],
				hash: "newhash",
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			act(() => {
				result.current.toggleSiteFavorite(10);
			});

			expect(result.current.favoriteSites).toContain(10);
		});

		it("should remove site from favorites", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [],
				favoriteSites: [1, 2],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			act(() => {
				result.current.toggleSiteFavorite(1);
			});

			expect(result.current.favoriteSites).not.toContain(1);
		});
	});

	describe("isSpaceFavorite", () => {
		it("should return true for favorited space", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.isSpaceFavorite(2)).toBe(true);
		});

		it("should return false for non-favorited space", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1, 2, 3],
				favoriteSites: [],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.isSpaceFavorite(99)).toBe(false);
		});
	});

	describe("isSiteFavorite", () => {
		it("should return true for favorited site", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [],
				favoriteSites: [10, 20],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.isSiteFavorite(10)).toBe(true);
		});

		it("should return false for non-favorited site", async () => {
			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.isSiteFavorite(99)).toBe(false);
		});
	});

	describe("cross-tab sync", () => {
		it("should update state when receiving broadcast message", async () => {
			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Simulate receiving broadcast message from another tab
			act(() => {
				mockBroadcastChannel.onmessage?.({
					data: {
						favoriteSpaces: [100, 200],
						favoriteSites: [300],
						hash: "fromothertab",
					},
				} as MessageEvent);
			});

			expect(result.current.favoriteSpaces).toEqual([100, 200]);
			expect(result.current.favoriteSites).toEqual([300]);
		});
	});

	describe("error handling", () => {
		it("should handle localStorage read error gracefully", async () => {
			vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
				throw new Error("localStorage disabled");
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Should return empty arrays on error
			expect(result.current.favoriteSpaces).toEqual([]);
			expect(result.current.favoriteSites).toEqual([]);
		});

		it("should handle server fetch error gracefully", async () => {
			mockGetServerFavoritesHash.mockReturnValue("newhash");
			mockGetPreferences.mockRejectedValue(new Error("Network error"));

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Should still work with empty arrays
			expect(result.current.favoriteSpaces).toEqual([]);
		});

		it("should rollback on server update error", async () => {
			// Start with initial data in localStorage
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1, 2],
				favoriteSites: [],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");
			mockUpdatePreferences.mockRejectedValue(new Error("Server error"));

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.favoriteSpaces).toEqual([1, 2]);

			act(() => {
				result.current.toggleSpaceFavorite(3);
			});

			// Optimistic update should show the change
			expect(result.current.favoriteSpaces).toContain(3);

			// Wait for server error and rollback
			await waitFor(
				() => {
					expect(result.current.favoriteSpaces).toEqual([1, 2]);
				},
				{ timeout: 500 },
			);
		});
	});

	describe("cleanup", () => {
		it("should close BroadcastChannel on unmount", async () => {
			const { unmount } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(BroadcastChannel).toHaveBeenCalled();
			});

			unmount();

			expect(mockBroadcastChannel.close).toHaveBeenCalled();
		});
	});

	describe("localStorage write errors", () => {
		it("should handle localStorage setItem error gracefully", async () => {
			// Make setItem throw after the first few calls (during initialization)
			let callCount = 0;
			vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
				callCount++;
				if (callCount > 2) {
					throw new Error("localStorage quota exceeded");
				}
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Toggle should still work (optimistic update) even if localStorage write fails
			act(() => {
				result.current.toggleSpaceFavorite(1);
			});

			// The toggle should still have updated the state optimistically
			expect(result.current.favoriteSpaces).toContain(1);
		});
	});

	describe("BroadcastChannel unavailability", () => {
		it("should work without BroadcastChannel", async () => {
			// Remove BroadcastChannel from global scope
			vi.unstubAllGlobals();
			vi.stubGlobal("BroadcastChannel", undefined);

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Hook should still function
			expect(result.current.favoriteSpaces).toEqual([]);
			expect(result.current.favoriteSites).toEqual([]);

			// Toggle should still work
			act(() => {
				result.current.toggleSpaceFavorite(1);
			});

			expect(result.current.favoriteSpaces).toContain(1);
		});
	});

	describe("debounce behavior", () => {
		it("should debounce rapid toggles", async () => {
			vi.useFakeTimers();

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Rapid toggles should be debounced
			act(() => {
				result.current.toggleSpaceFavorite(1);
				result.current.toggleSpaceFavorite(2);
				result.current.toggleSpaceFavorite(3);
			});

			// Should have called updatePreferences only after debounce delay
			expect(mockUpdatePreferences).not.toHaveBeenCalled();

			// Advance time past debounce delay (100ms)
			act(() => {
				vi.advanceTimersByTime(150);
			});

			// Now updatePreferences should have been called once with the final state
			expect(mockUpdatePreferences).toHaveBeenCalled();

			vi.useRealTimers();
		});

		it("should clear pending update when new toggle arrives", async () => {
			vi.useFakeTimers();

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// First toggle
			act(() => {
				result.current.toggleSpaceFavorite(1);
			});

			// Advance partway through debounce
			act(() => {
				vi.advanceTimersByTime(50);
			});

			// Second toggle should cancel first
			act(() => {
				result.current.toggleSpaceFavorite(2);
			});

			// Advance past debounce delay
			act(() => {
				vi.advanceTimersByTime(150);
			});

			// Should only have been called once (second toggle replaced first)
			expect(mockUpdatePreferences).toHaveBeenCalledTimes(1);
			// Should have the final state with both spaces
			expect(mockUpdatePreferences).toHaveBeenCalledWith(
				expect.objectContaining({
					favoriteSpaces: expect.arrayContaining([1, 2]),
				}),
			);

			vi.useRealTimers();
		});
	});

	describe("jolli:spaces-changed event", () => {
		it("should refresh preferences from server when spaces-changed event fires", async () => {
			mockGetPreferences.mockResolvedValue({
				favoriteSpaces: [10, 20],
				favoriteSites: [30],
				hash: "refreshed-hash",
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Reset mock call count from initialization
			mockGetPreferences.mockClear();
			mockGetPreferences.mockResolvedValue({
				favoriteSpaces: [10, 20, 99],
				favoriteSites: [30, 40],
				hash: "after-change-hash",
			});

			// Dispatch the custom event that signals external space changes
			act(() => {
				window.dispatchEvent(new Event("jolli:spaces-changed"));
			});

			// Wait for the async fetch + state update to complete
			await waitFor(() => {
				expect(result.current.favoriteSpaces).toEqual([10, 20, 99]);
			});

			expect(result.current.favoriteSites).toEqual([30, 40]);
			expect(mockGetPreferences).toHaveBeenCalledTimes(1);
		});

		it("should handle server error during spaces-changed refresh", async () => {
			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			mockGetPreferences.mockClear();
			mockGetPreferences.mockRejectedValue(new Error("Network error"));

			// Should not throw when server fetch fails
			act(() => {
				window.dispatchEvent(new Event("jolli:spaces-changed"));
			});

			// Wait a tick for the rejected promise to settle
			await waitFor(() => {
				expect(mockGetPreferences).toHaveBeenCalledTimes(1);
			});

			// State should remain unchanged
			expect(result.current.favoriteSpaces).toEqual([]);
		});
	});

	describe("writeToStorage error handling", () => {
		it("should handle localStorage setItem throwing in writeToStorage", async () => {
			// Make setItem always throw to ensure writeToStorage catch block is hit
			vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
				throw new Error("localStorage quota exceeded");
			});

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			// Toggle triggers writeToStorage which should catch the error gracefully
			act(() => {
				result.current.toggleSpaceFavorite(1);
			});

			// The toggle should still apply the optimistic update despite write failure
			expect(result.current.favoriteSpaces).toContain(1);
		});
	});

	describe("non-Error server rejection", () => {
		it("should wrap non-Error rejection in Error for saveError", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [1],
				favoriteSites: [],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");
			// Reject with a string instead of an Error object
			mockUpdatePreferences.mockRejectedValue("string error");

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			act(() => {
				result.current.toggleSpaceFavorite(2);
			});

			// Wait for rollback after server rejection
			await waitFor(
				() => {
					expect(result.current.favoriteSpaces).toEqual([1]);
				},
				{ timeout: 500 },
			);

			// saveError should be an Error wrapping the string
			expect(result.current.saveError).toBeInstanceOf(Error);
			expect(result.current.saveError?.message).toBe("string error");
		});
	});

	describe("site favorite rollback", () => {
		it("should rollback site favorites on server error", async () => {
			mockLocalStorage["jolli:userPreferences"] = JSON.stringify({
				favoriteSpaces: [],
				favoriteSites: [10, 20],
				hash: "abc",
			});
			mockGetServerFavoritesHash.mockReturnValue("abc");
			mockUpdatePreferences.mockRejectedValue(new Error("Server error"));

			const { result } = renderHook(() => useUserPreferences());

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false);
			});

			expect(result.current.favoriteSites).toEqual([10, 20]);

			act(() => {
				result.current.toggleSiteFavorite(30);
			});

			// Optimistic update should show the change
			expect(result.current.favoriteSites).toContain(30);

			// Wait for server error and rollback
			await waitFor(
				() => {
					expect(result.current.favoriteSites).toEqual([10, 20]);
				},
				{ timeout: 500 },
			);
		});
	});
});
