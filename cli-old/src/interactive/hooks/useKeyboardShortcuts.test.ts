/**
 * @vitest-environment jsdom
 */
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock ink's useInput
let inputHandler: ((input: string, key: { ctrl?: boolean }) => void) | null = null;

vi.mock("ink", () => ({
	useInput: (handler: (input: string, key: { ctrl?: boolean }) => void) => {
		inputHandler = handler;
	},
}));

describe("useKeyboardShortcuts", () => {
	it("should register input handler", () => {
		const setViewMode = vi.fn();
		renderHook(() => useKeyboardShortcuts("chat", setViewMode, false));

		expect(inputHandler).not.toBeNull();
	});

	it("should toggle from chat to convos on Ctrl+L", () => {
		const setViewMode = vi.fn();
		const clearLastChar = vi.fn();
		renderHook(() => useKeyboardShortcuts("chat", setViewMode, false, clearLastChar));

		// Simulate Ctrl+L
		inputHandler?.("l", { ctrl: true });

		expect(setViewMode).toHaveBeenCalledWith(expect.any(Function));
		expect(clearLastChar).toHaveBeenCalledWith("l");

		// Test the updater function
		const updater = setViewMode.mock.calls[0][0] as (prev: string) => string;
		expect(updater("chat")).toBe("conversations");
	});

	it("should toggle from convos to chat on Ctrl+L", () => {
		const setViewMode = vi.fn();
		const clearLastChar = vi.fn();
		renderHook(() => useKeyboardShortcuts("conversations", setViewMode, false, clearLastChar));

		// Simulate Ctrl+L
		inputHandler?.("l", { ctrl: true });

		expect(setViewMode).toHaveBeenCalledWith(expect.any(Function));
		expect(clearLastChar).toHaveBeenCalledWith("l");

		// Test the updater function
		const updater = setViewMode.mock.calls[0][0] as (prev: string) => string;
		expect(updater("conversations")).toBe("chat");
	});

	it("should not toggle when isLoading is true", () => {
		const setViewMode = vi.fn();
		renderHook(() => useKeyboardShortcuts("chat", setViewMode, true));

		// Simulate Ctrl+L
		inputHandler?.("l", { ctrl: true });

		expect(setViewMode).not.toHaveBeenCalled();
	});

	it("should not toggle when ctrl is not pressed", () => {
		const setViewMode = vi.fn();
		renderHook(() => useKeyboardShortcuts("chat", setViewMode, false));

		// Simulate L without Ctrl
		inputHandler?.("l", { ctrl: false });

		expect(setViewMode).not.toHaveBeenCalled();
	});

	it("should not toggle when different key is pressed with ctrl", () => {
		const setViewMode = vi.fn();
		renderHook(() => useKeyboardShortcuts("chat", setViewMode, false));

		// Simulate Ctrl+K
		inputHandler?.("k", { ctrl: true });

		expect(setViewMode).not.toHaveBeenCalled();
	});

	it("should work without clearLastChar callback", () => {
		const setViewMode = vi.fn();
		renderHook(() => useKeyboardShortcuts("chat", setViewMode, false));

		// Simulate Ctrl+L without clearLastChar callback
		expect(() => inputHandler?.("l", { ctrl: true })).not.toThrow();

		expect(setViewMode).toHaveBeenCalledWith(expect.any(Function));
	});
});
