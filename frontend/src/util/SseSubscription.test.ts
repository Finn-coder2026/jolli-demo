import { ChunkReorderer, createSseSubscription } from "./SseSubscription";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// Mock Logger - use vi.hoisted to ensure mockLogWarn is available before the mock runs
const { mockLogWarn } = vi.hoisted(() => ({
	mockLogWarn: vi.fn(),
}));

vi.mock("./Logger", () => ({
	getLog: () => ({
		warn: mockLogWarn,
	}),
}));

// Mock jolli-common
vi.mock("jolli-common", () => {
	const mockEventSource = {
		addEventListener: vi.fn(),
		close: vi.fn(),
	};

	const mockMercureClient = {
		isEnabled: vi.fn(),
		subscribe: vi.fn(),
	};

	return {
		createMercureClient: vi.fn(() => mockMercureClient),
		createResilientEventSource: vi.fn(() => mockEventSource),
	};
});

// Get the mocks
import { createMercureClient, createResilientEventSource } from "jolli-common";

const mockMercureClient = (createMercureClient as Mock)() as {
	isEnabled: Mock;
	subscribe: Mock;
};
const mockEventSource = (createResilientEventSource as Mock)() as {
	addEventListener: Mock;
	close: Mock;
};

describe("SseSubscription", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock implementations
		(createMercureClient as Mock).mockReturnValue(mockMercureClient);
		(createResilientEventSource as Mock).mockReturnValue(mockEventSource);
		mockMercureClient.isEnabled.mockResolvedValue(false);
	});

	describe("createSseSubscription", () => {
		describe("Mercure enabled", () => {
			it("should use Mercure when enabled and available", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(true);
				const mockMercureSubscription = { close: vi.fn() };
				mockMercureClient.subscribe.mockResolvedValue(mockMercureSubscription);

				const onMessage = vi.fn();
				const onConnected = vi.fn();

				const subscription = await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage,
					onConnected,
				});

				expect(createMercureClient).toHaveBeenCalledWith(window.location.origin);
				expect(mockMercureClient.isEnabled).toHaveBeenCalled();
				expect(mockMercureClient.subscribe).toHaveBeenCalledWith({
					type: "draft",
					id: 123,
					onMessage: expect.any(Function),
					onReconnecting: expect.any(Function),
					onReconnected: expect.any(Function),
					onError: expect.any(Function),
				});
				expect(onConnected).toHaveBeenCalled();
				expect(createResilientEventSource).not.toHaveBeenCalled();

				// Verify close works
				subscription.close();
				expect(mockMercureSubscription.close).toHaveBeenCalled();
			});

			it("should forward messages from Mercure", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(true);
				mockMercureClient.subscribe.mockImplementation((options: { onMessage: (data: unknown) => void }) => {
					// Simulate receiving a message
					setTimeout(() => options.onMessage({ type: "test", data: "hello" }), 0);
					return Promise.resolve({ close: vi.fn() });
				});

				const onMessage = vi.fn();

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage,
				});

				// Wait for the message to be delivered
				await new Promise(resolve => setTimeout(resolve, 10));

				expect(onMessage).toHaveBeenCalledWith({ type: "test", data: "hello" });
			});

			it("should forward reconnecting events from Mercure", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(true);
				mockMercureClient.subscribe.mockImplementation(
					(options: { onReconnecting?: (attempt: number) => void }) => {
						// Simulate reconnecting event
						setTimeout(() => options.onReconnecting?.(2), 0);
						return Promise.resolve({ close: vi.fn() });
					},
				);

				const onReconnecting = vi.fn();

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onReconnecting,
				});

				await new Promise(resolve => setTimeout(resolve, 10));

				expect(onReconnecting).toHaveBeenCalledWith(2);
			});

			it("should forward reconnected events from Mercure", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(true);
				mockMercureClient.subscribe.mockImplementation(
					(options: { onReconnected?: (afterAttempts: number) => void }) => {
						// Simulate reconnected event
						setTimeout(() => options.onReconnected?.(3), 0);
						return Promise.resolve({ close: vi.fn() });
					},
				);

				const onReconnected = vi.fn();

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onReconnected,
				});

				await new Promise(resolve => setTimeout(resolve, 10));

				expect(onReconnected).toHaveBeenCalledWith(3);
			});

			it("should forward error events from Mercure and call onFailed", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(true);
				mockMercureClient.subscribe.mockImplementation((options: { onError?: () => void }) => {
					// Simulate error event
					setTimeout(() => options.onError?.(), 0);
					return Promise.resolve({ close: vi.fn() });
				});

				const onFailed = vi.fn();

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onFailed,
				});

				await new Promise(resolve => setTimeout(resolve, 10));

				expect(onFailed).toHaveBeenCalled();
			});

			it("should fall back to SSE when Mercure subscription fails", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(true);
				mockMercureClient.subscribe.mockRejectedValue(new Error("Mercure failed"));

				const onMessage = vi.fn();

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage,
				});

				expect(mockLogWarn).toHaveBeenCalledWith(
					expect.any(Error),
					"Mercure subscription failed, falling back to SSE",
				);
				expect(createResilientEventSource).toHaveBeenCalledWith(
					`${window.location.origin}/api/doc-drafts/123/stream`,
					{ withCredentials: true },
				);
			});
		});

		describe("SSE fallback", () => {
			it("should use SSE when Mercure is disabled", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
				});

				expect(createResilientEventSource).toHaveBeenCalledWith(
					`${window.location.origin}/api/doc-drafts/123/stream`,
					{ withCredentials: true },
				);
			});

			it("should handle message events from SSE", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const onMessage = vi.fn();
				let messageHandler: ((event: Event) => void) | undefined;

				mockEventSource.addEventListener.mockImplementation(
					(event: string, handler: (event: Event) => void) => {
						if (event === "message") {
							messageHandler = handler;
						}
					},
				);

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage,
				});

				// Simulate MessageEvent style
				messageHandler?.({ data: '{"type":"test"}' } as unknown as Event);
				expect(onMessage).toHaveBeenCalledWith({ type: "test" });

				// Simulate CustomEvent style
				onMessage.mockClear();
				messageHandler?.({ detail: { data: '{"type":"custom"}' } } as unknown as Event);
				expect(onMessage).toHaveBeenCalledWith({ type: "custom" });
			});

			it("should handle parse errors in SSE messages", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
					/* suppress console.error in test */
				});
				let messageHandler: ((event: Event) => void) | undefined;

				mockEventSource.addEventListener.mockImplementation(
					(event: string, handler: (event: Event) => void) => {
						if (event === "message") {
							messageHandler = handler;
						}
					},
				);

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
				});

				messageHandler?.({ data: "invalid json" } as unknown as Event);

				expect(consoleError).toHaveBeenCalledWith("Failed to parse SSE message:", expect.any(SyntaxError));

				consoleError.mockRestore();
			});

			it("should ignore empty SSE messages", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const onMessage = vi.fn();
				let messageHandler: ((event: Event) => void) | undefined;

				mockEventSource.addEventListener.mockImplementation(
					(event: string, handler: (event: Event) => void) => {
						if (event === "message") {
							messageHandler = handler;
						}
					},
				);

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage,
				});

				messageHandler?.({} as unknown as Event);
				expect(onMessage).not.toHaveBeenCalled();
			});

			it("should call onConnected when SSE open event fires", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const onConnected = vi.fn();
				let openHandler: (() => void) | undefined;

				mockEventSource.addEventListener.mockImplementation((event: string, handler: () => void) => {
					if (event === "open") {
						openHandler = handler;
					}
				});

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onConnected,
				});

				openHandler?.();
				expect(onConnected).toHaveBeenCalled();
			});

			it("should call onReconnecting when SSE reconnecting event fires", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const onReconnecting = vi.fn();
				let reconnectingHandler: ((event: Event) => void) | undefined;

				mockEventSource.addEventListener.mockImplementation(
					(event: string, handler: (event: Event) => void) => {
						if (event === "reconnecting") {
							reconnectingHandler = handler;
						}
					},
				);

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onReconnecting,
				});

				reconnectingHandler?.({ detail: { attempt: 5 } } as unknown as Event);
				expect(onReconnecting).toHaveBeenCalledWith(5);

				// Test without detail
				onReconnecting.mockClear();
				reconnectingHandler?.({} as unknown as Event);
				expect(onReconnecting).toHaveBeenCalledWith(0);
			});

			it("should call onReconnected when SSE reconnected event fires", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const onReconnected = vi.fn();
				let reconnectedHandler: ((event: Event) => void) | undefined;

				mockEventSource.addEventListener.mockImplementation(
					(event: string, handler: (event: Event) => void) => {
						if (event === "reconnected") {
							reconnectedHandler = handler;
						}
					},
				);

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onReconnected,
				});

				reconnectedHandler?.({ detail: { afterAttempts: 3 } } as unknown as Event);
				expect(onReconnected).toHaveBeenCalledWith(3);

				// Test without detail
				onReconnected.mockClear();
				reconnectedHandler?.({} as unknown as Event);
				expect(onReconnected).toHaveBeenCalledWith(0);
			});

			it("should call onFailed when SSE reconnection_failed event fires", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);
				const onFailed = vi.fn();
				let failedHandler: (() => void) | undefined;

				mockEventSource.addEventListener.mockImplementation((event: string, handler: () => void) => {
					if (event === "reconnection_failed") {
						failedHandler = handler;
					}
				});

				await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
					onFailed,
				});

				failedHandler?.();
				expect(onFailed).toHaveBeenCalled();
			});

			it("should close SSE connection when close is called", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);

				const subscription = await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
				});

				subscription.close();
				expect(mockEventSource.close).toHaveBeenCalled();
			});
		});

		describe("subscription types", () => {
			it("should work with jobs type", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);

				await createSseSubscription({
					type: "jobs",
					id: 1,
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
				});

				expect(createResilientEventSource).toHaveBeenCalledWith(`${window.location.origin}/api/jobs/events`, {
					withCredentials: true,
				});
			});

			it("should work with convo type", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);

				await createSseSubscription({
					type: "convo",
					id: 456,
					directSseUrl: "/api/collab-convos/456/stream",
					onMessage: vi.fn(),
				});

				expect(createResilientEventSource).toHaveBeenCalledWith(
					`${window.location.origin}/api/collab-convos/456/stream`,
					{ withCredentials: true },
				);
			});
		});

		describe("optional callbacks", () => {
			it("should work without optional callbacks", async () => {
				mockMercureClient.isEnabled.mockResolvedValue(false);

				// Should not throw
				const subscription = await createSseSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage: vi.fn(),
				});

				expect(subscription).toBeDefined();
				expect(subscription.close).toBeInstanceOf(Function);
			});
		});
	});
});

describe("ChunkReorderer", () => {
	it("should process chunks in order when received in sequence", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		reorderer.process("Hello ", 0, chunk => results.push(chunk));
		reorderer.process("world", 1, chunk => results.push(chunk));
		reorderer.process("!", 2, chunk => results.push(chunk));

		expect(results).toEqual(["Hello ", "world", "!"]);
	});

	it("should buffer and reorder out-of-sequence chunks", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		// Chunks arrive out of order: 2, 0, 1
		reorderer.process("!", 2, chunk => results.push(chunk));
		expect(results).toEqual([]); // Buffered, waiting for 0

		reorderer.process("Hello ", 0, chunk => results.push(chunk));
		expect(results).toEqual(["Hello "]); // Only 0 processed, still waiting for 1

		reorderer.process("world", 1, chunk => results.push(chunk));
		expect(results).toEqual(["Hello ", "world", "!"]); // 1 and buffered 2 processed
	});

	it("should process multiple buffered chunks in sequence", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		// Buffer chunks 3, 2, 1 (all waiting for 0)
		reorderer.process("d", 3, chunk => results.push(chunk));
		reorderer.process("c", 2, chunk => results.push(chunk));
		reorderer.process("b", 1, chunk => results.push(chunk));
		expect(results).toEqual([]);

		// Send chunk 0 - all should process in order
		reorderer.process("a", 0, chunk => results.push(chunk));
		expect(results).toEqual(["a", "b", "c", "d"]);
	});

	it("should ignore duplicate chunks", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		reorderer.process("Hello", 0, chunk => results.push(chunk));
		reorderer.process("Hello duplicate", 0, chunk => results.push(chunk)); // Duplicate

		expect(results).toEqual(["Hello"]);
	});

	it("should ignore late-arriving chunks (seq < expected)", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		reorderer.process("a", 0, chunk => results.push(chunk));
		reorderer.process("b", 1, chunk => results.push(chunk));
		reorderer.process("late", 0, chunk => results.push(chunk)); // Late arrival

		expect(results).toEqual(["a", "b"]);
	});

	it("should process immediately when seq is undefined (backwards compatibility)", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		reorderer.process("no seq 1", undefined, chunk => results.push(chunk));
		reorderer.process("no seq 2", undefined, chunk => results.push(chunk));

		expect(results).toEqual(["no seq 1", "no seq 2"]);
	});

	it("should reset state correctly", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		// First message stream
		reorderer.process("first", 0, chunk => results.push(chunk));
		reorderer.process("second", 1, chunk => results.push(chunk));
		expect(results).toEqual(["first", "second"]);

		// Reset for new stream
		reorderer.reset();

		// New message stream should start from seq 0
		reorderer.process("new first", 0, chunk => results.push(chunk));
		expect(results).toEqual(["first", "second", "new first"]);
	});

	it("should clear buffer on reset", () => {
		const reorderer = new ChunkReorderer<string>();
		const results: Array<string> = [];

		// Buffer a chunk
		reorderer.process("buffered", 1, chunk => results.push(chunk));
		expect(results).toEqual([]);

		// Reset clears the buffer
		reorderer.reset();

		// Now seq 0 is expected again, buffered chunk is gone
		reorderer.process("new", 0, chunk => results.push(chunk));
		expect(results).toEqual(["new"]);
	});

	it("should work with non-string types", () => {
		const reorderer = new ChunkReorderer<{ id: number; text: string }>();
		const results: Array<{ id: number; text: string }> = [];

		reorderer.process({ id: 2, text: "second" }, 1, chunk => results.push(chunk));
		reorderer.process({ id: 1, text: "first" }, 0, chunk => results.push(chunk));

		expect(results).toEqual([
			{ id: 1, text: "first" },
			{ id: 2, text: "second" },
		]);
	});
});
