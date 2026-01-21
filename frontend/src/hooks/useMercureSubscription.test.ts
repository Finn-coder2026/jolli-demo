import { useMercureSubscription } from "./useMercureSubscription";
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

// Mock jolli-common
vi.mock("jolli-common", () => ({
	createMercureClient: vi.fn(),
	createResilientEventSource: vi.fn(),
}));

import { createMercureClient, createResilientEventSource } from "jolli-common";

describe("useMercureSubscription", () => {
	let mockMercureClient: {
		isEnabled: Mock;
		subscribe: Mock;
	};

	let mockEventSource: {
		addEventListener: Mock;
		removeEventListener: Mock;
		close: Mock;
		listeners: Map<string, Array<EventListenerOrEventListenerObject>>;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockMercureClient = {
			isEnabled: vi.fn(),
			subscribe: vi.fn(),
		};
		(createMercureClient as Mock).mockReturnValue(mockMercureClient);

		mockEventSource = {
			addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
				if (!mockEventSource.listeners.has(type)) {
					mockEventSource.listeners.set(type, []);
				}
				mockEventSource.listeners.get(type)?.push(listener);
			}),
			removeEventListener: vi.fn(),
			close: vi.fn(),
			listeners: new Map(),
		};
		(createResilientEventSource as Mock).mockReturnValue(mockEventSource);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function triggerEvent(type: string, data?: unknown) {
		const listeners = mockEventSource.listeners.get(type) || [];
		const event = data ? new CustomEvent(type, { detail: data }) : new Event(type);
		for (const listener of listeners) {
			if (typeof listener === "function") {
				listener(event);
			}
		}
	}

	describe("when Mercure is enabled", () => {
		beforeEach(() => {
			mockMercureClient.isEnabled.mockResolvedValue(true);
		});

		it("should subscribe via Mercure when enabled", async () => {
			const mockSubscription = { close: vi.fn() };
			mockMercureClient.subscribe.mockResolvedValue(mockSubscription);

			const onMessage = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(result.current.usingMercure).toBe(true);
			});

			expect(result.current.connected).toBe(true);
			expect(mockMercureClient.subscribe).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "jobs",
					onMessage: expect.any(Function),
				}),
			);
		});

		it("should pass id for draft and convo types", async () => {
			const mockSubscription = { close: vi.fn() };
			mockMercureClient.subscribe.mockResolvedValue(mockSubscription);

			const onMessage = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "draft",
					id: 123,
					directSseUrl: "/api/doc-drafts/123/stream",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(mockMercureClient.subscribe).toHaveBeenCalled();
			});

			expect(mockMercureClient.subscribe).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "draft",
					id: 123,
				}),
			);
		});

		it("should call onMessage when Mercure delivers a message", async () => {
			let capturedOnMessage: ((data: unknown) => void) | undefined;
			mockMercureClient.subscribe.mockImplementation(opts => {
				capturedOnMessage = opts.onMessage;
				return Promise.resolve({ close: vi.fn() });
			});

			const onMessage = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(capturedOnMessage).toBeDefined();
			});

			act(() => {
				capturedOnMessage?.({ type: "job:started", jobId: 1 });
			});

			expect(onMessage).toHaveBeenCalledWith({ type: "job:started", jobId: 1 });
		});

		it("should call onError when Mercure reports an error", async () => {
			let capturedOnError: ((err: Error) => void) | undefined;
			mockMercureClient.subscribe.mockImplementation(opts => {
				capturedOnError = opts.onError;
				return Promise.resolve({ close: vi.fn() });
			});

			const onError = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onError,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(capturedOnError).toBeDefined();
			});

			act(() => {
				capturedOnError?.(new Error("Mercure error"));
			});

			expect(onError).toHaveBeenCalledWith(expect.any(Error));
		});

		it("should handle reconnecting events from Mercure", async () => {
			let capturedOnReconnecting: ((attempt: number) => void) | undefined;
			mockMercureClient.subscribe.mockImplementation(opts => {
				capturedOnReconnecting = opts.onReconnecting;
				return Promise.resolve({ close: vi.fn() });
			});

			const onReconnecting = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onReconnecting,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(capturedOnReconnecting).toBeDefined();
			});

			act(() => {
				capturedOnReconnecting?.(3);
			});

			expect(result.current.reconnecting).toBe(true);
			expect(onReconnecting).toHaveBeenCalledWith(3);
		});

		it("should handle reconnected events from Mercure", async () => {
			let capturedOnReconnected: ((attempts: number) => void) | undefined;
			mockMercureClient.subscribe.mockImplementation(opts => {
				capturedOnReconnected = opts.onReconnected;
				return Promise.resolve({ close: vi.fn() });
			});

			const onReconnected = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onReconnected,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(capturedOnReconnected).toBeDefined();
			});

			act(() => {
				capturedOnReconnected?.(5);
			});

			expect(result.current.reconnecting).toBe(false);
			expect(result.current.connected).toBe(true);
			expect(onReconnected).toHaveBeenCalledWith(5);
		});

		it("should close Mercure subscription on unmount", async () => {
			const mockClose = vi.fn();
			mockMercureClient.subscribe.mockResolvedValue({ close: mockClose });

			const { unmount } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(mockMercureClient.subscribe).toHaveBeenCalled();
			});

			unmount();

			expect(mockClose).toHaveBeenCalled();
		});

		it("should fall back to SSE when Mercure subscription fails", async () => {
			mockMercureClient.subscribe.mockRejectedValue(new Error("Subscription failed"));

			const onMessage = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			expect(result.current.usingMercure).toBe(false);
			expect(createResilientEventSource).toHaveBeenCalledWith(expect.stringContaining("/api/jobs/events"), {
				withCredentials: true,
			});
		});
	});

	describe("when Mercure is disabled", () => {
		beforeEach(() => {
			mockMercureClient.isEnabled.mockResolvedValue(false);
		});

		it("should fall back to direct SSE", async () => {
			const onMessage = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			expect(result.current.usingMercure).toBe(false);
			expect(mockMercureClient.subscribe).not.toHaveBeenCalled();
		});

		it("should set connected on open event", async () => {
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("open");
			});

			expect(result.current.connected).toBe(true);
		});

		it("should call onMessage when SSE delivers a message", async () => {
			const onMessage = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("message", { data: '{"type":"job:started"}' });
			});

			expect(onMessage).toHaveBeenCalledWith({ type: "job:started" });
		});

		it("should handle MessageEvent data format", async () => {
			const onMessage = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			// Simulate MessageEvent with data property directly on event
			const listeners = mockEventSource.listeners.get("message") || [];
			const event = { data: '{"type":"job:completed"}' } as MessageEvent;
			for (const listener of listeners) {
				if (typeof listener === "function") {
					act(() => {
						listener(event);
					});
				}
			}

			expect(onMessage).toHaveBeenCalledWith({ type: "job:completed" });
		});

		it("should call onError when message parsing fails", async () => {
			const onError = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onError,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("message", { data: "invalid-json" });
			});

			expect(onError).toHaveBeenCalledWith(expect.any(Error));
		});

		it("should handle reconnecting events from SSE", async () => {
			const onReconnecting = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onReconnecting,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("reconnecting", { attempt: 2 });
			});

			expect(result.current.reconnecting).toBe(true);
			expect(onReconnecting).toHaveBeenCalledWith(2);
		});

		it("should handle reconnected events from SSE", async () => {
			const onReconnected = vi.fn();
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onReconnected,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("reconnected", { afterAttempts: 3 });
			});

			expect(result.current.reconnecting).toBe(false);
			expect(result.current.connected).toBe(true);
			expect(onReconnected).toHaveBeenCalledWith(3);
		});

		it("should handle reconnection_failed event", async () => {
			const onError = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onError,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("reconnection_failed");
			});

			expect(onError).toHaveBeenCalledWith(expect.any(Error));
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Connection failed after max retries" }),
			);
		});

		it("should close SSE on unmount", async () => {
			const { unmount } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			unmount();

			expect(mockEventSource.close).toHaveBeenCalled();
		});
	});

	describe("when disabled", () => {
		it("should not subscribe when enabled is false", () => {
			const { result } = renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					enabled: false,
				}),
			);

			expect(result.current.connected).toBe(false);
			expect(result.current.usingMercure).toBe(false);
			expect(createMercureClient).not.toHaveBeenCalled();
			expect(createResilientEventSource).not.toHaveBeenCalled();
		});

		it("should clean up when enabled changes to false", async () => {
			mockMercureClient.isEnabled.mockResolvedValue(false);

			const { result, rerender } = renderHook(
				({ enabled }: { enabled: boolean }) =>
					useMercureSubscription({
						type: "jobs",
						directSseUrl: "/api/jobs/events",
						onMessage: vi.fn(),
						enabled,
					}),
				{ initialProps: { enabled: true } },
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			rerender({ enabled: false });

			expect(result.current.connected).toBe(false);
			expect(mockEventSource.close).toHaveBeenCalled();
		});
	});

	describe("edge cases", () => {
		it("should handle missing event detail gracefully", async () => {
			mockMercureClient.isEnabled.mockResolvedValue(false);

			const onReconnecting = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage: vi.fn(),
					onReconnecting,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			// Trigger event without detail
			const listeners = mockEventSource.listeners.get("reconnecting") || [];
			const event = new Event("reconnecting");
			for (const listener of listeners) {
				if (typeof listener === "function") {
					act(() => {
						listener(event);
					});
				}
			}

			expect(onReconnecting).toHaveBeenCalledWith(0);
		});

		it("should not call callbacks when empty message data", async () => {
			mockMercureClient.isEnabled.mockResolvedValue(false);

			const onMessage = vi.fn();
			renderHook(() =>
				useMercureSubscription({
					type: "jobs",
					directSseUrl: "/api/jobs/events",
					onMessage,
					enabled: true,
				}),
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalled();
			});

			act(() => {
				triggerEvent("message", { data: "" });
			});

			expect(onMessage).not.toHaveBeenCalled();
		});

		it("should re-subscribe when type changes", async () => {
			mockMercureClient.isEnabled.mockResolvedValue(false);

			const { rerender } = renderHook(
				({ type }: { type: "jobs" | "draft" | "convo" }) =>
					useMercureSubscription({
						type,
						directSseUrl: `/api/${type}/events`,
						onMessage: vi.fn(),
						enabled: true,
					}),
				{ initialProps: { type: "jobs" as "jobs" | "draft" | "convo" } },
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalledTimes(1);
			});

			rerender({ type: "draft" });

			await waitFor(() => {
				expect(mockEventSource.close).toHaveBeenCalled();
				expect(createResilientEventSource).toHaveBeenCalledTimes(2);
			});
		});

		it("should re-subscribe when id changes", async () => {
			mockMercureClient.isEnabled.mockResolvedValue(false);

			const { rerender } = renderHook(
				({ id }: { id: number }) =>
					useMercureSubscription({
						type: "draft",
						id,
						directSseUrl: `/api/doc-drafts/${id}/stream`,
						onMessage: vi.fn(),
						enabled: true,
					}),
				{ initialProps: { id: 1 } },
			);

			await waitFor(() => {
				expect(createResilientEventSource).toHaveBeenCalledTimes(1);
			});

			rerender({ id: 2 });

			await waitFor(() => {
				expect(mockEventSource.close).toHaveBeenCalled();
				expect(createResilientEventSource).toHaveBeenCalledTimes(2);
			});
		});
	});
});
