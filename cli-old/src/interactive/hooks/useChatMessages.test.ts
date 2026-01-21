/**
 * @vitest-environment jsdom
 */
import { useChatMessages } from "./useChatMessages";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Client } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Config module
vi.mock("../../util/Config", () => ({
	saveActiveConvoId: vi.fn(),
}));

const Config = await import("../../util/Config");
const mockSaveActiveConvoId = vi.mocked(Config.saveActiveConvoId);

describe("useChatMessages", () => {
	beforeEach(() => {
		// Reset mocks before each test
		mockSaveActiveConvoId.mockResolvedValue(undefined);
	});
	const createMockClient = (
		streamFn: (params: {
			onContent: (content: string) => void;
			onConvoId: (id: number) => void;
		}) => Promise<void> = async () => {
			// Default no-op stream function
		},
	): Client => {
		return {
			chat: () => ({
				stream: streamFn,
			}),
		} as unknown as Client;
	};

	it("should initialize with empty messages and not loading", () => {
		const client = createMockClient();
		const { result } = renderHook(() => useChatMessages(client));

		expect(result.current.messages).toEqual([]);
		expect(result.current.isLoading).toBe(false);
	});

	it("should send message and add user message immediately", async () => {
		const client = createMockClient();
		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hello",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		await waitFor(() => {
			expect(result.current.messages).toContainEqual({
				role: "user",
				content: "Hello",
			});
		});
	});

	it("should set isLoading to true during message send", async () => {
		let resolveStream: (() => void) | undefined;
		const streamPromise = new Promise<void>(resolve => {
			resolveStream = resolve;
		});

		const client = createMockClient(async () => {
			await streamPromise;
		});

		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		const sendPromise = result.current.sendMessage({
			userMessage: "Hello",
			activeConvoId: undefined,
			setActiveConvoId,
			reloadConvos,
			abortControllerRef,
			isMountedRef,
		});

		// Should be loading
		await waitFor(() => {
			expect(result.current.isLoading).toBe(true);
		});

		// Resolve the stream
		resolveStream?.();
		await sendPromise;

		// Should not be loading anymore
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("should stream assistant response content", async () => {
		const client = createMockClient(({ onContent }) => {
			onContent("Hello");
			onContent(" there");
			onContent("!");
			return Promise.resolve();
		});

		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hi",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		// Should have user message and assistant response
		await waitFor(() => {
			expect(result.current.messages).toHaveLength(2);
		});
		expect(result.current.messages[0]).toEqual({
			role: "user",
			content: "Hi",
		});
		expect(result.current.messages[1]).toEqual({
			role: "assistant",
			content: "Hello there!",
		});
	});

	it("should handle new convo ID callback", async () => {
		const reloadConvos = vi.fn().mockResolvedValue(undefined);
		const client = createMockClient(({ onConvoId }) => {
			onConvoId(42);
			return Promise.resolve();
		});

		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hi",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(setActiveConvoId).toHaveBeenCalledWith(42);
		expect(mockSaveActiveConvoId).toHaveBeenCalledWith(42);
		expect(reloadConvos).toHaveBeenCalled();
	});

	it("should ignore errors when saving convo ID", async () => {
		mockSaveActiveConvoId.mockRejectedValueOnce(new Error("Save failed"));
		const client = createMockClient(({ onConvoId }) => {
			onConvoId(42);
			return Promise.resolve();
		});

		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn().mockResolvedValue(undefined);

		// Should not throw
		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hi",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(setActiveConvoId).toHaveBeenCalledWith(42);
	});

	it("should abort previous request when sending new message", async () => {
		const client = createMockClient();
		const { result } = renderHook(() => useChatMessages(client));

		const abortController1 = new AbortController();
		const abortSpy = vi.spyOn(abortController1, "abort");
		const abortControllerRef = { current: abortController1 };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "First message",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(abortSpy).toHaveBeenCalled();
	});

	it("should create new AbortController for each request", async () => {
		const client = createMockClient();
		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hello",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(abortControllerRef.current).toBeInstanceOf(AbortController);
	});

	it("should not set isLoading to false if component unmounted", async () => {
		let resolveStream: (() => void) | undefined;
		const streamPromise = new Promise<void>(resolve => {
			resolveStream = resolve;
		});

		const client = createMockClient(async () => {
			await streamPromise;
		});

		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		const sendPromise = result.current.sendMessage({
			userMessage: "Hello",
			activeConvoId: undefined,
			setActiveConvoId,
			reloadConvos,
			abortControllerRef,
			isMountedRef,
		});

		// Wait for loading to start
		await waitFor(() => {
			expect(result.current.isLoading).toBe(true);
		});

		// Unmount before completion
		isMountedRef.current = false;

		// Now complete the stream
		resolveStream?.();
		await sendPromise;

		// isLoading should still be true since we didn't update state after unmount
		expect(result.current.isLoading).toBe(true);
	});

	it("should include existing messages when sending", async () => {
		const streamFn = vi.fn().mockResolvedValue(undefined);
		const client = createMockClient(streamFn);
		const { result } = renderHook(() => useChatMessages(client));

		// Set initial messages
		act(() => {
			result.current.setMessages([{ role: "user", content: "Previous message" }]);
		});

		// Wait for messages state to update
		await waitFor(() => {
			expect(result.current.messages).toHaveLength(1);
		});

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "New message",
				activeConvoId: 1,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		// Check that stream was called with existing messages
		expect(streamFn).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [{ role: "user", content: "Previous message" }],
				userMessage: "New message",
				activeConvoId: 1,
			}),
		);
	});

	it("should pass activeConvoId to stream", async () => {
		const streamFn = vi.fn().mockResolvedValue(undefined);
		const client = createMockClient(streamFn);
		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hello",
				activeConvoId: 123,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(streamFn).toHaveBeenCalledWith(
			expect.objectContaining({
				activeConvoId: 123,
			}),
		);
	});

	it("should pass signal to stream for abort handling", async () => {
		const streamFn = vi.fn().mockResolvedValue(undefined);
		const client = createMockClient(streamFn);
		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hello",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(streamFn).toHaveBeenCalledWith(
			expect.objectContaining({
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("should pass readyRef to stream", async () => {
		const streamFn = vi.fn().mockResolvedValue(undefined);
		const client = createMockClient(streamFn);
		const { result } = renderHook(() => useChatMessages(client));

		const abortControllerRef = { current: null };
		const isMountedRef = { current: true };
		const setActiveConvoId = vi.fn();
		const reloadConvos = vi.fn();

		await act(async () => {
			await result.current.sendMessage({
				userMessage: "Hello",
				activeConvoId: undefined,
				setActiveConvoId,
				reloadConvos,
				abortControllerRef,
				isMountedRef,
			});
		});

		expect(streamFn).toHaveBeenCalledWith(
			expect.objectContaining({
				readyRef: isMountedRef,
			}),
		);
	});
});
