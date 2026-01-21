import { createMercureClient, type MercureClient } from "./MercureClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch
global.fetch = vi.fn();

// Mock createResilientEventSource
vi.mock("./CollabConvoClient", () => ({
	createResilientEventSource: vi.fn(),
}));

import { createResilientEventSource } from "./CollabConvoClient";

describe("MercureClient", () => {
	let client: MercureClient;
	const baseUrl = "http://localhost:3000";

	beforeEach(() => {
		vi.clearAllMocks();
		client = createMercureClient(baseUrl);
	});

	describe("getConfig", () => {
		it("should fetch and return Mercure config", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});

			const config = await client.getConfig();

			expect(config).toEqual({
				enabled: true,
				hubUrl: "http://localhost:3001/.well-known/mercure",
			});
			expect(global.fetch).toHaveBeenCalledWith(`${baseUrl}/api/mercure/config`, {
				method: "GET",
				credentials: "include",
			});
		});

		it("should cache config after first fetch", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});

			await client.getConfig();
			await client.getConfig();

			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it("should return disabled config when fetch fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
			});

			const config = await client.getConfig();

			expect(config).toEqual({ enabled: false, hubUrl: null });
		});

		it("should return disabled config when fetch throws", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));

			const config = await client.getConfig();

			expect(config).toEqual({ enabled: false, hubUrl: null });
		});
	});

	describe("isEnabled", () => {
		it("should return true when Mercure is enabled", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});

			const enabled = await client.isEnabled();

			expect(enabled).toBe(true);
		});

		it("should return false when Mercure is disabled", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: false, hubUrl: null }),
			});

			const enabled = await client.isEnabled();

			expect(enabled).toBe(false);
		});

		it("should return false when hubUrl is null", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: null }),
			});

			const enabled = await client.isEnabled();

			expect(enabled).toBe(false);
		});
	});

	describe("subscribe", () => {
		const mockEventSource = {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			close: vi.fn(),
			getReconnectionState: vi.fn(),
		};

		beforeEach(() => {
			(createResilientEventSource as ReturnType<typeof vi.fn>).mockReturnValue(mockEventSource);
		});

		it("should throw when Mercure is not enabled", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: false, hubUrl: null }),
			});

			await expect(
				client.subscribe({
					type: "jobs",
					onMessage: vi.fn(),
				}),
			).rejects.toThrow("Mercure is not enabled");
		});

		it("should subscribe to jobs topic", async () => {
			// Config fetch
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			// Token fetch
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					token: "test-token",
					topics: ["/tenants/default/jobs/events"],
				}),
			});

			const onMessage = vi.fn();
			const subscription = await client.subscribe({
				type: "jobs",
				onMessage,
			});

			expect(subscription.close).toBeDefined();
			expect(createResilientEventSource).toHaveBeenCalledWith(
				expect.stringContaining("http://localhost:3001/.well-known/mercure"),
				{},
				undefined,
			);

			// Verify the URL contains topic and authorization
			const urlArg = (createResilientEventSource as ReturnType<typeof vi.fn>).mock.calls[0][0];
			expect(urlArg).toContain("topic=%2Ftenants%2Fdefault%2Fjobs%2Fevents");
			expect(urlArg).toContain("authorization=test-token");
		});

		it("should subscribe to draft topic with id", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					token: "draft-token",
					topics: ["/tenants/default/drafts/123"],
				}),
			});

			await client.subscribe({
				type: "draft",
				id: 123,
				onMessage: vi.fn(),
			});

			expect(global.fetch).toHaveBeenNthCalledWith(
				2,
				`${baseUrl}/api/mercure/token`,
				expect.objectContaining({
					body: JSON.stringify({ type: "draft", id: 123 }),
				}),
			);
		});

		it("should register message event listener", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onMessage = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage,
			});

			expect(mockEventSource.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
		});

		it("should call onMessage with parsed data", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onMessage = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage,
			});

			// Get the message handler
			const messageHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "message",
			)?.[1] as (event: Event) => void;

			// Simulate a message event
			const mockEvent = { detail: { data: '{"type":"job:started"}' } };
			messageHandler(mockEvent as unknown as Event);

			expect(onMessage).toHaveBeenCalledWith({ type: "job:started" });
		});

		it("should call onError when message parsing fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onMessage = vi.fn();
			const onError = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage,
				onError,
			});

			const messageHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "message",
			)?.[1] as (event: Event) => void;

			// Simulate invalid JSON
			const mockEvent = { detail: { data: "invalid-json" } };
			messageHandler(mockEvent as unknown as Event);

			expect(onError).toHaveBeenCalledWith(expect.any(Error));
		});

		it("should register reconnection event listeners when provided", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onReconnecting = vi.fn();
			const onReconnected = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
				onReconnecting,
				onReconnected,
			});

			expect(mockEventSource.addEventListener).toHaveBeenCalledWith("reconnecting", expect.any(Function));
			expect(mockEventSource.addEventListener).toHaveBeenCalledWith("reconnected", expect.any(Function));
		});

		it("should call onReconnecting when reconnecting event fires", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onReconnecting = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
				onReconnecting,
			});

			// Get and call the reconnecting handler
			const reconnectingHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "reconnecting",
			)?.[1] as (event: Event) => void;

			// Simulate a reconnecting event
			const mockEvent = { detail: { attempt: 3 } };
			reconnectingHandler(mockEvent as unknown as Event);

			expect(onReconnecting).toHaveBeenCalledWith(3);
		});

		it("should call onReconnected when reconnected event fires", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onReconnected = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
				onReconnected,
			});

			// Get and call the reconnected handler
			const reconnectedHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "reconnected",
			)?.[1] as (event: Event) => void;

			// Simulate a reconnected event
			const mockEvent = { detail: { afterAttempts: 5 } };
			reconnectedHandler(mockEvent as unknown as Event);

			expect(onReconnected).toHaveBeenCalledWith(5);
		});

		it("should register reconnection_failed listener and call onError", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onError = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
				onError,
			});

			expect(mockEventSource.addEventListener).toHaveBeenCalledWith("reconnection_failed", expect.any(Function));

			// Get and call the handler
			const failHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "reconnection_failed",
			)?.[1] as () => void;
			failHandler();

			expect(onError).toHaveBeenCalledWith(expect.any(Error));
		});

		it("should close EventSource when subscription.close() is called", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const subscription = await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
			});

			subscription.close();

			expect(mockEventSource.close).toHaveBeenCalled();
		});

		it("should throw when token fetch fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Draft ID required" }),
			});

			await expect(
				client.subscribe({
					type: "draft",
					onMessage: vi.fn(),
				}),
			).rejects.toThrow("Draft ID required");
		});

		it("should use default error message when error object has no error property", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: false,
				json: async () => ({}), // No error property
			});

			await expect(
				client.subscribe({
					type: "draft",
					onMessage: vi.fn(),
				}),
			).rejects.toThrow("Failed to get Mercure subscriber token");
		});

		it("should handle reconnecting event with undefined detail", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onReconnecting = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
				onReconnecting,
			});

			// Get and call the reconnecting handler with undefined detail
			const reconnectingHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "reconnecting",
			)?.[1] as (event: Event) => void;

			// Simulate an event with no detail
			const mockEvent = { detail: undefined };
			reconnectingHandler(mockEvent as unknown as Event);

			expect(onReconnecting).toHaveBeenCalledWith(0);
		});

		it("should handle reconnected event with undefined detail", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onReconnected = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage: vi.fn(),
				onReconnected,
			});

			// Get and call the reconnected handler with undefined detail
			const reconnectedHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "reconnected",
			)?.[1] as (event: Event) => void;

			// Simulate an event with no detail
			const mockEvent = { detail: undefined };
			reconnectedHandler(mockEvent as unknown as Event);

			expect(onReconnected).toHaveBeenCalledWith(0);
		});

		it("should not call onError when onError is not provided and message parsing fails", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onMessage = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage,
				// No onError provided
			});

			const messageHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "message",
			)?.[1] as (event: Event) => void;

			// Simulate invalid JSON - this should not throw
			const mockEvent = { detail: { data: "invalid-json" } };
			expect(() => messageHandler(mockEvent as unknown as Event)).not.toThrow();
		});

		it("should wrap non-Error objects in Error when onError is called", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onMessage = vi.fn().mockImplementation(() => {
				// Throw a non-Error object
				throw "string error";
			});
			const onError = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage,
				onError,
			});

			const messageHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "message",
			)?.[1] as (event: Event) => void;

			// Simulate a valid JSON message that will cause onMessage to throw a non-Error
			const mockEvent = { detail: { data: '{"test": true}' } };
			messageHandler(mockEvent as unknown as Event);

			expect(onError).toHaveBeenCalledWith(expect.any(Error));
			expect(onError.mock.calls[0][0].message).toBe("Failed to parse message");
		});

		it("should fallback to MessageEvent.data when detail.data is not present", async () => {
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ enabled: true, hubUrl: "http://localhost:3001/.well-known/mercure" }),
			});
			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ token: "test", topics: ["/test"] }),
			});

			const onMessage = vi.fn();
			await client.subscribe({
				type: "jobs",
				onMessage,
			});

			const messageHandler = mockEventSource.addEventListener.mock.calls.find(
				(call: Array<unknown>) => call[0] === "message",
			)?.[1] as (event: Event) => void;

			// Simulate a MessageEvent without CustomEvent detail structure
			const mockEvent = { data: '{"type":"job:completed"}' };
			messageHandler(mockEvent as unknown as Event);

			expect(onMessage).toHaveBeenCalledWith({ type: "job:completed" });
		});
	});
});
