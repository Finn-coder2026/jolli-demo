import { useSpaceTree } from "./useSpaceTree";
import { act, cleanup, renderHook, waitFor } from "@testing-library/preact";
import type { Space } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the ClientContext
const mockSpacesClient = {
	getTreeContent: vi.fn(),
	getTrashContent: vi.fn(),
	hasTrash: vi.fn(),
	getPreferences: vi.fn(),
	updatePreferences: vi.fn(),
};

const mockDocsClient = {
	createDoc: vi.fn(),
	softDelete: vi.fn(),
	restore: vi.fn(),
	renameDoc: vi.fn(),
	moveDoc: vi.fn(),
	reorderAt: vi.fn(),
};

const mockClient = {
	spaces: () => mockSpacesClient,
	docs: () => mockDocsClient,
};

vi.mock("../contexts/ClientContext", () => ({
	useClient: () => mockClient,
}));

function createMockSpace(overrides: Partial<Space> = {}): Space {
	return {
		id: 1,
		name: "Test Space",
		slug: "test-space",
		jrn: "space:test",
		description: undefined,
		ownerId: 1,
		isPersonal: false,
		defaultSort: "default",
		defaultFilters: { updated: "any_time", creator: "" },
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

describe("useSpaceTree sort preference API", () => {
	const mockSpace = createMockSpace();

	beforeEach(() => {
		vi.clearAllMocks();
		mockSpacesClient.getTreeContent.mockResolvedValue([]);
		mockSpacesClient.getTrashContent.mockResolvedValue([]);
		mockSpacesClient.hasTrash.mockResolvedValue(false);
		mockSpacesClient.getPreferences.mockResolvedValue({ sort: null, filters: {}, expandedFolders: [] });
		mockSpacesClient.updatePreferences.mockResolvedValue({ sort: null, filters: {}, expandedFolders: [] });
		mockDocsClient.moveDoc.mockResolvedValue({});
		mockDocsClient.reorderAt.mockResolvedValue({});
	});

	afterEach(() => {
		// Clean up rendered hooks to prevent memory leaks
		cleanup();
		// Ensure fake timers are restored in case a test fails before calling vi.useRealTimers()
		vi.useRealTimers();
	});

	it("should load sort preference from API when space changes", async () => {
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: "alphabetical_asc",
			filters: {},
			expandedFolders: [],
		});

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("alphabetical_asc");
		});

		expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(mockSpace.id);
	});

	it("should use space defaultSort when API returns null sort", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: null,
			filters: {},
			expandedFolders: [],
		});

		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("updatedAt_desc");
		});
	});

	it("should use space defaultSort when getPreferences API fails", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "createdAt_asc" });
		mockSpacesClient.getPreferences.mockRejectedValue(new Error("API error"));

		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("createdAt_asc");
		});
	});

	it("should call updatePreferences API when setSortMode is called", async () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		mockSpacesClient.updatePreferences.mockClear();

		// Enable fake timers AFTER initial loading completes
		vi.useFakeTimers();

		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("alphabetical_asc");
		});

		// API should not be called immediately (debounced)
		expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

		// Fast-forward debounce timer
		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
			sort: "alphabetical_asc",
		});

		vi.useRealTimers();
	});

	it("should save null when sort matches space defaultSort", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "alphabetical_asc" });
		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		mockSpacesClient.updatePreferences.mockClear();

		// Enable fake timers AFTER initial loading completes
		vi.useFakeTimers();

		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("alphabetical_asc"); // Same as space defaultSort
		});

		act(() => {
			vi.advanceTimersByTime(500);
		});

		// Should clear preference to use space default
		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultSort.id, {
			sort: null,
		});

		vi.useRealTimers();
	});

	it("should debounce multiple setSortMode calls", async () => {
		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		mockSpacesClient.updatePreferences.mockClear();

		// Enable fake timers AFTER initial loading completes
		vi.useFakeTimers();

		// Call setSortMode multiple times quickly
		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("alphabetical_asc");
		});

		act(() => {
			vi.advanceTimersByTime(200);
		});

		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("updatedAt_desc");
		});

		act(() => {
			vi.advanceTimersByTime(200);
		});

		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("createdAt_asc");
		});

		// API should not be called yet
		expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

		// Fast-forward debounce timer
		act(() => {
			vi.advanceTimersByTime(500);
		});

		// Only the last value should be saved
		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledTimes(1);
		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(mockSpace.id, {
			sort: "createdAt_asc",
		});

		vi.useRealTimers();
	});

	it("should handle updatePreferences API error gracefully", async () => {
		mockSpacesClient.updatePreferences.mockRejectedValue(new Error("API error"));

		const { result } = renderHook(() => useSpaceTree(mockSpace));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Enable fake timers AFTER initial loading completes
		vi.useFakeTimers();

		// Should not throw
		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("alphabetical_asc");
		});

		act(() => {
			vi.advanceTimersByTime(500);
		});

		// State should still be updated locally
		const [state] = result.current;
		expect(state.sortMode).toBe("alphabetical_asc");

		vi.useRealTimers();
	});

	it("should call updatePreferences with null when resetToDefaultSort is called", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: "alphabetical_asc",
			filters: {},
			expandedFolders: [],
		});

		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("alphabetical_asc");
		});

		mockSpacesClient.updatePreferences.mockClear();

		await act(async () => {
			const [, actions] = result.current;
			await actions.resetToDefaultSort();
		});

		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultSort.id, {
			sort: null,
		});

		const [state] = result.current;
		expect(state.sortMode).toBe("updatedAt_desc");
	});

	it("should handle resetToDefaultSort API error gracefully", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: "alphabetical_asc",
			filters: {},
			expandedFolders: [],
		});
		mockSpacesClient.updatePreferences.mockRejectedValue(new Error("API error"));

		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Should not throw
		await act(async () => {
			const [, actions] = result.current;
			await actions.resetToDefaultSort();
		});

		// State should still be updated locally
		const [state] = result.current;
		expect(state.sortMode).toBe("updatedAt_desc");
	});

	it("should cancel pending debounced save when resetToDefaultSort is called", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		mockSpacesClient.updatePreferences.mockClear();

		// Enable fake timers AFTER initial loading completes
		vi.useFakeTimers();

		// Set a sort mode (starts debounce timer)
		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("alphabetical_asc");
		});

		// Before debounce timer fires, call resetToDefaultSort
		await act(async () => {
			const [, actions] = result.current;
			await actions.resetToDefaultSort();
		});

		// Fast-forward past debounce timer
		act(() => {
			vi.advanceTimersByTime(600);
		});

		// resetToDefaultSort should have been called immediately, debounced call should be cancelled
		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledTimes(1);
		expect(mockSpacesClient.updatePreferences).toHaveBeenCalledWith(spaceWithDefaultSort.id, { sort: null });

		vi.useRealTimers();
	});

	it("should not call API when space is undefined for setSortMode", () => {
		vi.useFakeTimers();

		const { result } = renderHook(() => useSpaceTree(undefined));

		act(() => {
			const [, actions] = result.current;
			actions.setSortMode("alphabetical_asc");
		});

		act(() => {
			vi.advanceTimersByTime(500);
		});

		expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("should not call API when space is undefined for resetToDefaultSort", async () => {
		const { result } = renderHook(() => useSpaceTree(undefined));

		await act(async () => {
			const [, actions] = result.current;
			await actions.resetToDefaultSort();
		});

		expect(mockSpacesClient.updatePreferences).not.toHaveBeenCalled();
	});

	it("should reload preferences when space changes", async () => {
		const space1 = createMockSpace({ id: 1, name: "Space 1", defaultSort: "default" });
		const space2 = createMockSpace({ id: 2, name: "Space 2", defaultSort: "updatedAt_desc" });

		mockSpacesClient.getPreferences
			.mockResolvedValueOnce({ sort: "alphabetical_asc", filters: {}, expandedFolders: [] })
			.mockResolvedValueOnce({ sort: "createdAt_desc", filters: {}, expandedFolders: [] });

		const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
			initialProps: { space: space1 },
		});

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("alphabetical_asc");
		});

		// Change to space 2
		rerender({ space: space2 });

		await waitFor(() => {
			const [state] = result.current;
			expect(state.sortMode).toBe("createdAt_desc");
		});

		expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(space1.id);
		expect(mockSpacesClient.getPreferences).toHaveBeenCalledWith(space2.id);
	});

	it("should indicate isMatchingSpaceDefault correctly", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: "updatedAt_desc",
			filters: {},
			expandedFolders: [],
		});

		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("updatedAt_desc");
			expect(state.isMatchingSpaceDefault).toBe(true);
		});
	});

	it("should indicate isMatchingSpaceDefault as false when sort differs", async () => {
		const spaceWithDefaultSort = createMockSpace({ id: 1, defaultSort: "updatedAt_desc" });
		mockSpacesClient.getPreferences.mockResolvedValue({
			sort: "alphabetical_asc",
			filters: {},
			expandedFolders: [],
		});

		const { result } = renderHook(() => useSpaceTree(spaceWithDefaultSort));

		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
			expect(state.sortMode).toBe("alphabetical_asc");
			expect(state.isMatchingSpaceDefault).toBe(false);
		});
	});

	it("should ignore stale getPreferences success response when space changes quickly", async () => {
		const space1 = createMockSpace({ id: 1, defaultSort: "default" });
		const space2 = createMockSpace({ id: 2, defaultSort: "alphabetical_asc" });

		// Create a deferred promise that we can resolve later
		let resolveSpace1Prefs: ((value: unknown) => void) | undefined;
		const space1PrefsPromise = new Promise(resolve => {
			resolveSpace1Prefs = resolve;
		});

		// Space 1 preferences will be delayed
		mockSpacesClient.getPreferences
			.mockImplementationOnce(() => space1PrefsPromise)
			.mockResolvedValueOnce({ sort: "createdAt_desc", filters: {}, expandedFolders: [] });

		const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
			initialProps: { space: space1 },
		});

		// Switch to space2 before space1 preferences resolve
		rerender({ space: space2 });

		// Wait for space2 to load
		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Now resolve space1 preferences (should be ignored due to race condition check)
		act(() => {
			resolveSpace1Prefs?.({ sort: "updatedAt_desc", filters: {}, expandedFolders: [] });
		});

		// Sort mode should be from space2, not the stale space1 response
		const [state] = result.current;
		expect(state.sortMode).toBe("createdAt_desc");
	});

	it("should ignore stale getPreferences error response when space changes quickly", async () => {
		const space1 = createMockSpace({ id: 1, defaultSort: "default" });
		const space2 = createMockSpace({ id: 2, defaultSort: "alphabetical_asc" });

		// Create a deferred promise that we can reject later
		let rejectSpace1Prefs: ((error: Error) => void) | undefined;
		const space1PrefsPromise = new Promise((_resolve, reject) => {
			rejectSpace1Prefs = reject;
		});

		// Space 1 preferences will fail after delay
		mockSpacesClient.getPreferences
			.mockImplementationOnce(() => space1PrefsPromise)
			.mockResolvedValueOnce({ sort: "createdAt_desc", filters: {}, expandedFolders: [] });

		const { result, rerender } = renderHook(({ space }) => useSpaceTree(space), {
			initialProps: { space: space1 },
		});

		// Switch to space2 before space1 preferences fail
		rerender({ space: space2 });

		// Wait for space2 to load
		await waitFor(() => {
			const [state] = result.current;
			expect(state.loading).toBe(false);
		});

		// Now reject space1 preferences (should be ignored due to race condition check)
		act(() => {
			rejectSpace1Prefs?.(new Error("API error"));
		});

		// Sort mode should be from space2, not affected by stale space1 error
		const [state] = result.current;
		expect(state.sortMode).toBe("createdAt_desc");
	});
});
