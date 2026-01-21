/**
 * @vitest-environment jsdom
 */
import { useCommandSuggestions } from "./useCommandSuggestions";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("useCommandSuggestions", () => {
	it("should return empty array when message is empty", () => {
		const { result } = renderHook(() => useCommandSuggestions(""));
		expect(result.current).toEqual([]);
	});

	it("should return empty array when message does not start with /", () => {
		const { result } = renderHook(() => useCommandSuggestions("hello"));
		expect(result.current).toEqual([]);
	});

	it("should return all commands when only / is typed", () => {
		const { result } = renderHook(() => useCommandSuggestions("/"));
		expect(result.current.length).toBeGreaterThan(0);
		expect(result.current.every((cmd: { name: string }) => cmd.name.startsWith("/"))).toBe(true);
	});

	it("should filter commands by prefix", () => {
		const { result } = renderHook(() => useCommandSuggestions("/he"));
		expect(result.current.length).toBeGreaterThan(0);
		expect(result.current.every((cmd: { name: string }) => cmd.name.toLowerCase().startsWith("/he"))).toBe(true);
	});

	it("should return empty array when no commands match", () => {
		const { result } = renderHook(() => useCommandSuggestions("/nonexistent"));
		expect(result.current).toEqual([]);
	});

	it("should be case insensitive", () => {
		const { result: lowerResult } = renderHook(() => useCommandSuggestions("/help"));
		const { result: upperResult } = renderHook(() => useCommandSuggestions("/HELP"));
		const { result: mixedResult } = renderHook(() => useCommandSuggestions("/HeLp"));

		expect(lowerResult.current).toEqual(upperResult.current);
		expect(lowerResult.current).toEqual(mixedResult.current);
	});

	it("should update suggestions when message changes", () => {
		const { result, rerender } = renderHook(({ message }: { message: string }) => useCommandSuggestions(message), {
			initialProps: { message: "/" },
		});

		const allCommandsCount = result.current.length;
		expect(allCommandsCount).toBeGreaterThan(0);

		// Change to filter by /he
		rerender({ message: "/he" });
		const filteredCount = result.current.length;
		expect(filteredCount).toBeLessThan(allCommandsCount);
		expect(result.current.every((cmd: { name: string }) => cmd.name.toLowerCase().startsWith("/he"))).toBe(true);

		// Change to non-slash
		rerender({ message: "hello" });
		expect(result.current).toEqual([]);
	});
});
