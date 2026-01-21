/**
 * @vitest-environment jsdom
 */
import { useExitHandler } from "./useExitHandler";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock ink
vi.mock("ink", () => ({
	useApp: () => ({
		exit: vi.fn(),
	}),
}));

describe("useExitHandler", () => {
	it("should initialize with shouldExit as false", () => {
		const onExit = vi.fn();
		const { result } = renderHook(() => useExitHandler(onExit));

		expect(result.current.shouldExit).toBe(false);
		expect(result.current.isMountedRef.current).toBe(true);
		expect(result.current.abortControllerRef.current).toBeNull();
	});

	it("should provide setShouldExit function", () => {
		const onExit = vi.fn();
		const { result } = renderHook(() => useExitHandler(onExit));

		expect(typeof result.current.setShouldExit).toBe("function");
	});

	it("should set isMountedRef.current to false on unmount", () => {
		const onExit = vi.fn();
		const { result, unmount } = renderHook(() => useExitHandler(onExit));

		expect(result.current.isMountedRef.current).toBe(true);

		unmount();

		expect(result.current.isMountedRef.current).toBe(false);
	});

	it("should abort pending requests on unmount", () => {
		const onExit = vi.fn();
		const { result, unmount } = renderHook(() => useExitHandler(onExit));

		// Create an abort controller
		const abortController = new AbortController();
		const abortSpy = vi.spyOn(abortController, "abort");
		result.current.abortControllerRef.current = abortController;

		unmount();

		expect(abortSpy).toHaveBeenCalled();
	});

	it("should not abort if no pending request on unmount", () => {
		const onExit = vi.fn();
		const { result, unmount } = renderHook(() => useExitHandler(onExit));

		expect(result.current.abortControllerRef.current).toBeNull();

		// Should not throw
		expect(() => unmount()).not.toThrow();
	});

	it("should call onExit and exit when shouldExit is set to true", () => {
		vi.useFakeTimers();

		const onExit = vi.fn();
		const { result } = renderHook(() => useExitHandler(onExit));

		// Set shouldExit to true
		act(() => {
			result.current.setShouldExit(true);
		});

		// Run all timers
		vi.runAllTimers();

		expect(onExit).toHaveBeenCalled();

		vi.useRealTimers();
	});

	it("should clear timeout if unmounted before exit completes", () => {
		vi.useFakeTimers();

		const onExit = vi.fn();
		const { result, unmount } = renderHook(() => useExitHandler(onExit));

		// Set shouldExit to true
		result.current.setShouldExit(true);

		// Unmount before timeout completes
		unmount();

		// Fast-forward timers
		vi.advanceTimersByTime(800);

		// onExit should not be called because component was unmounted
		expect(onExit).not.toHaveBeenCalled();

		vi.useRealTimers();
	});
});
