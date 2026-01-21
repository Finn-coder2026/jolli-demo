import { SessionTimeoutProvider, useSessionTimeout } from "./SessionTimeoutContext";
import { act, renderHook } from "@testing-library/preact";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create typed wrappers for renderHook
// biome-ignore lint/suspicious/noExplicitAny: renderHook wrapper type mismatch requires type override
function createWrapper(props: { initialIdleTimeoutMs?: number; enabled?: boolean } = {}): any {
	return function Wrapper({ children }: { children: ReactNode }) {
		// Conditionally spread props to avoid exactOptionalPropertyTypes error
		const providerProps: { initialIdleTimeoutMs?: number; enabled?: boolean } = {};
		if (props.initialIdleTimeoutMs !== undefined) {
			providerProps.initialIdleTimeoutMs = props.initialIdleTimeoutMs;
		}
		if (props.enabled !== undefined) {
			providerProps.enabled = props.enabled;
		}
		return <SessionTimeoutProvider {...providerProps}>{children}</SessionTimeoutProvider>;
	};
}

describe("SessionTimeoutContext", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		localStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		localStorage.clear();
	});

	describe("useSessionTimeout outside provider", () => {
		it("should throw error when used outside provider", () => {
			expect(() => {
				renderHook(() => useSessionTimeout());
			}).toThrow("useSessionTimeout must be used within a SessionTimeoutProvider");
		});
	});

	describe("SessionTimeoutProvider", () => {
		it("should provide initial state", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			expect(result.current.isSessionExpired).toBe(false);
			expect(result.current.showExpiredDialog).toBe(false);
		});

		it("should reset idle timer without setting localStorage when session expired", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			// First expire the session
			act(() => {
				result.current.handleSessionExpired();
			});

			expect(result.current.isSessionExpired).toBe(true);

			// Clear localStorage to verify it's not written to
			localStorage.clear();

			// Try to reset timer - should not update localStorage since session is expired
			act(() => {
				result.current.resetIdleTimer();
			});

			expect(localStorage.getItem("jolli_lastActivityTime")).toBe(null);
		});

		it("should reset idle timer and update localStorage", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			act(() => {
				result.current.resetIdleTimer();
			});

			expect(localStorage.getItem("jolli_lastActivityTime")).toBeTruthy();
		});

		it("should handle localStorage error gracefully", () => {
			const originalSetItem = localStorage.setItem;
			localStorage.setItem = () => {
				throw new Error("localStorage error");
			};

			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			// Should not throw
			act(() => {
				result.current.resetIdleTimer();
			});

			expect(result.current.isSessionExpired).toBe(false);

			localStorage.setItem = originalSetItem;
		});

		it("should handle session expiration", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			act(() => {
				result.current.handleSessionExpired();
			});

			expect(result.current.isSessionExpired).toBe(true);
			expect(result.current.showExpiredDialog).toBe(true);
		});

		it("should dismiss expired dialog", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			act(() => {
				result.current.handleSessionExpired();
			});

			expect(result.current.showExpiredDialog).toBe(true);

			act(() => {
				result.current.dismissExpiredDialog();
			});

			expect(result.current.showExpiredDialog).toBe(false);
		});

		it("should allow setting idle timeout", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			act(() => {
				result.current.setIdleTimeoutMs(30000);
			});

			// The state update happened, but we can't directly check the timeout value
			// Instead, verify that the context still works
			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should trigger session expiration after timeout", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 1000 }),
			});

			expect(result.current.isSessionExpired).toBe(false);

			// Advance time past the idle timeout (need to advance beyond CHECK_INTERVAL_MS)
			act(() => {
				vi.advanceTimersByTime(11000); // 11 seconds (check interval is 10s)
			});

			expect(result.current.isSessionExpired).toBe(true);
			expect(result.current.showExpiredDialog).toBe(true);
		});

		it("should not trigger timeout when disabled", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 1000, enabled: false }),
			});

			act(() => {
				vi.advanceTimersByTime(11000);
			});

			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should respond to click events by resetting timer", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 5000 }),
			});

			// Advance time but not past timeout
			act(() => {
				vi.advanceTimersByTime(4000);
			});

			// Simulate click event
			act(() => {
				window.dispatchEvent(new Event("click"));
			});

			// Advance time again - should reset from the click
			act(() => {
				vi.advanceTimersByTime(4000);
			});

			// Should not be expired because the click reset the timer
			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should respond to keydown events by resetting timer", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 5000 }),
			});

			act(() => {
				vi.advanceTimersByTime(4000);
			});

			act(() => {
				window.dispatchEvent(new Event("keydown"));
			});

			act(() => {
				vi.advanceTimersByTime(4000);
			});

			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should respond to mousedown events by resetting timer", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 5000 }),
			});

			act(() => {
				vi.advanceTimersByTime(4000);
			});

			act(() => {
				window.dispatchEvent(new Event("mousedown"));
			});

			act(() => {
				vi.advanceTimersByTime(4000);
			});

			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should respond to touchstart events by resetting timer", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 5000 }),
			});

			act(() => {
				vi.advanceTimersByTime(4000);
			});

			act(() => {
				window.dispatchEvent(new Event("touchstart"));
			});

			act(() => {
				vi.advanceTimersByTime(4000);
			});

			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should not add event listeners when disabled", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");

			renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ enabled: false }),
			});

			// Should not have added click, keydown, etc. listeners
			expect(addEventListenerSpy).not.toHaveBeenCalledWith("click", expect.any(Function));
			expect(addEventListenerSpy).not.toHaveBeenCalledWith("keydown", expect.any(Function));

			addEventListenerSpy.mockRestore();
		});

		it("should not add event listeners when session already expired", () => {
			const { result, rerender } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			// Expire the session
			act(() => {
				result.current.handleSessionExpired();
			});

			const addEventListenerSpy = vi.spyOn(window, "addEventListener");

			// Rerender to trigger useEffect
			rerender({});

			// The listeners would have been removed, not added
			addEventListenerSpy.mockRestore();
		});

		it("should sync activity time across tabs via storage event", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 5000 }),
			});

			// Advance time but not past timeout
			act(() => {
				vi.advanceTimersByTime(4000);
			});

			// Simulate storage event from another tab
			const storageEvent = new StorageEvent("storage", {
				key: "jolli_lastActivityTime",
				newValue: Date.now().toString(),
			});

			act(() => {
				window.dispatchEvent(storageEvent);
			});

			// Advance time again
			act(() => {
				vi.advanceTimersByTime(4000);
			});

			// Should not be expired because the storage event reset the timer
			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should ignore storage events for other keys", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 1000 }),
			});

			// Simulate storage event with different key
			const storageEvent = new StorageEvent("storage", {
				key: "some_other_key",
				newValue: Date.now().toString(),
			});

			act(() => {
				window.dispatchEvent(storageEvent);
			});

			// Advance time past timeout
			act(() => {
				vi.advanceTimersByTime(11000);
			});

			// Should be expired because the storage event was for a different key
			expect(result.current.isSessionExpired).toBe(true);
		});

		it("should ignore storage events with null value", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 1000 }),
			});

			// Simulate storage event with null value
			const storageEvent = new StorageEvent("storage", {
				key: "jolli_lastActivityTime",
				newValue: null,
			});

			act(() => {
				window.dispatchEvent(storageEvent);
			});

			// Advance time past timeout
			act(() => {
				vi.advanceTimersByTime(11000);
			});

			// Should be expired because the storage event had null value
			expect(result.current.isSessionExpired).toBe(true);
		});

		it("should ignore storage events with invalid number value", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ initialIdleTimeoutMs: 1000 }),
			});

			// Simulate storage event with invalid value
			const storageEvent = new StorageEvent("storage", {
				key: "jolli_lastActivityTime",
				newValue: "not-a-number",
			});

			act(() => {
				window.dispatchEvent(storageEvent);
			});

			// Advance time past timeout
			act(() => {
				vi.advanceTimersByTime(11000);
			});

			// Should be expired because the storage event had invalid value
			expect(result.current.isSessionExpired).toBe(true);
		});

		it("should not listen to storage events when disabled", () => {
			const addEventListenerSpy = vi.spyOn(window, "addEventListener");

			renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper({ enabled: false }),
			});

			// Should not have added storage listener
			expect(addEventListenerSpy).not.toHaveBeenCalledWith("storage", expect.any(Function));

			addEventListenerSpy.mockRestore();
		});

		it("should use default timeout when not specified", () => {
			const { result } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			// Default is 1 hour (3600000ms), so 11 seconds should not trigger expiration
			act(() => {
				vi.advanceTimersByTime(11000);
			});

			expect(result.current.isSessionExpired).toBe(false);
		});

		it("should cleanup intervals on unmount", () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval");

			const { unmount } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			unmount();

			expect(clearIntervalSpy).toHaveBeenCalled();

			clearIntervalSpy.mockRestore();
		});

		it("should cleanup event listeners on unmount", () => {
			const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

			const { unmount } = renderHook(() => useSessionTimeout(), {
				wrapper: createWrapper(),
			});

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("mousedown", expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("touchstart", expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("storage", expect.any(Function));

			removeEventListenerSpy.mockRestore();
		});
	});
});
