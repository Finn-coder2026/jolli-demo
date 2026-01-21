import { type CollabConvoClient, createCollabConvoClient, createResilientEventSource } from "./CollabConvoClient";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();
global.EventSource = vi.fn() as unknown as {
	new (url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
	readonly CONNECTING: 0;
	readonly OPEN: 1;
	readonly CLOSED: 2;
};

const mockFetch = vi.mocked(fetch);

interface MockAuth {
	createRequest: ReturnType<typeof vi.fn>;
	getAuthToken: ReturnType<typeof vi.fn>;
	checkUnauthorized?: (response: Response) => boolean;
}

function createMockAuth(checkUnauthorized?: (response: Response) => boolean): MockAuth {
	const auth: MockAuth = {
		createRequest: vi.fn((method: string, body?: unknown) => {
			const req: RequestInit = { method };
			if (body) {
				req.body = JSON.stringify(body);
				req.headers = { "Content-Type": "application/json" };
			}
			return req;
		}),
		getAuthToken: vi.fn().mockReturnValue("mock-token"),
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("CollabConvoClient", () => {
	let client: CollabConvoClient;
	let mockAuth: ReturnType<typeof createMockAuth>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockAuth = createMockAuth();
		client = createCollabConvoClient("http://localhost:3000", mockAuth);
	});

	describe("createCollabConvo", () => {
		it("creates a conversation successfully", async () => {
			const mockConvo = {
				id: 1,
				artifactType: "doc_draft" as const,
				artifactId: 1,
				messages: [],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.createCollabConvo("doc_draft", 1);

			expect(result).toEqual(mockConvo);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/collab-convos",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when creation fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.createCollabConvo("doc_draft", 1)).rejects.toThrow(
				"Failed to create conversation: Bad Request",
			);
		});
	});

	describe("getCollabConvo", () => {
		it("gets a conversation successfully", async () => {
			const mockConvo = {
				id: 1,
				artifactType: "doc_draft" as const,
				artifactId: 1,
				messages: [
					{
						role: "user" as const,
						content: "Hello",
						userId: 100,
						timestamp: "2025-01-01T00:00:00Z",
					},
				],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.getCollabConvo(1);

			expect(result).toEqual(mockConvo);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/collab-convos/1",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when get fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getCollabConvo(1)).rejects.toThrow("Failed to get conversation: Not Found");
		});
	});

	describe("getCollabConvoByArtifact", () => {
		it("gets a conversation by artifact successfully", async () => {
			const mockConvo = {
				id: 1,
				artifactType: "doc_draft" as const,
				artifactId: 123,
				messages: [],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.getCollabConvoByArtifact("doc_draft", 123);

			expect(result).toEqual(mockConvo);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/collab-convos/artifact/doc_draft/123",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when get by artifact fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getCollabConvoByArtifact("doc_draft", 123)).rejects.toThrow(
				"Failed to get conversation by artifact: Not Found",
			);
		});
	});

	describe("sendMessage", () => {
		it("sends a message successfully", async () => {
			const mockResponse = {
				success: true,
				message: {
					role: "user" as const,
					content: "Hello AI",
					userId: 100,
					timestamp: "2025-01-01T00:00:00Z",
				},
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response);

			const result = await client.sendMessage(1, "Hello AI");

			expect(result).toEqual(mockResponse);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:3000/api/collab-convos/1/messages",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("throws error when send fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.sendMessage(1, "Hello")).rejects.toThrow("Failed to send message: Bad Request");
		});
	});

	describe("streamConvo", () => {
		it("creates EventSource with correct URL and credentials", () => {
			const mockEventSource = {} as EventSource;
			global.EventSource = vi.fn().mockReturnValue(mockEventSource) as unknown as {
				new (url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
				readonly CONNECTING: 0;
				readonly OPEN: 1;
				readonly CLOSED: 2;
			};

			const result = client.streamConvo(1);

			expect(result).toBe(mockEventSource);
			expect(global.EventSource).toHaveBeenCalledWith("http://localhost:3000/api/collab-convos/1/stream", {
				withCredentials: true,
			});
		});
	});

	describe("createResilientEventSource", () => {
		let mockEventSource: EventSource;

		beforeEach(() => {
			vi.useFakeTimers();
			mockEventSource = {
				onmessage: null,
				onerror: null,
				onopen: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				close: vi.fn(),
				readyState: 0,
				url: "",
				withCredentials: false,
				dispatchEvent: vi.fn(),
				CONNECTING: 0,
				OPEN: 1,
				CLOSED: 2,
			} as unknown as EventSource;

			global.EventSource = vi.fn().mockReturnValue(mockEventSource) as unknown as {
				new (url: string | URL, eventSourceInitDict?: EventSourceInit): EventSource;
				readonly CONNECTING: 0;
				readonly OPEN: 1;
				readonly CLOSED: 2;
			};
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("creates an EventSource and connects", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream", { withCredentials: true });

			expect(global.EventSource).toHaveBeenCalledWith("http://localhost:3000/stream", { withCredentials: true });
			resilient.close();
		});

		it("forwards message events to listeners", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream");
			const messageListener = vi.fn();

			resilient.addEventListener("message", messageListener);

			// Simulate message from EventSource
			if (mockEventSource.onmessage) {
				const messageEvent = new MessageEvent("message", { data: '{"test":"data"}' });
				mockEventSource.onmessage(messageEvent);
			}

			expect(messageListener).toHaveBeenCalled();
			// Verify the event detail contains the data property
			const callArg = (messageListener.mock.calls[0][0] as CustomEvent).detail;
			expect(callArg).toHaveProperty("data", '{"test":"data"}');
			resilient.close();
		});

		it("dispatches open event when connection opens", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream");
			const openListener = vi.fn();

			resilient.addEventListener("open", openListener);

			// Simulate connection opening
			if (mockEventSource.onopen) {
				mockEventSource.onopen(new Event("open"));
			}

			expect(openListener).toHaveBeenCalled();
			resilient.close();
		});

		it("attempts reconnection with exponential backoff on error", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream", undefined, {
				initialDelay: 1000,
				maxDelay: 30000,
				maxAttempts: 3,
			});
			const reconnectingListener = vi.fn();

			resilient.addEventListener("reconnecting", reconnectingListener);

			// Simulate error
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}

			// Should schedule reconnection
			vi.advanceTimersByTime(1000);

			expect(reconnectingListener).toHaveBeenCalled();
			resilient.close();
		});

		it("dispatches reconnected event after successful reconnection", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream", undefined, {
				initialDelay: 1000,
			});
			const reconnectedListener = vi.fn();

			resilient.addEventListener("reconnected", reconnectedListener);

			// Simulate error
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}

			// Advance timer to trigger reconnection
			vi.advanceTimersByTime(1000);

			// Simulate successful reconnection
			if (mockEventSource.onopen) {
				mockEventSource.onopen(new Event("open"));
			}

			expect(reconnectedListener).toHaveBeenCalled();
			resilient.close();
		});

		it("stops reconnection after max attempts", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream", undefined, {
				initialDelay: 1000,
				maxAttempts: 2,
			});
			const reconnectionFailedListener = vi.fn();

			resilient.addEventListener("reconnection_failed", reconnectionFailedListener);

			// Simulate first error
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}
			vi.advanceTimersByTime(1000);

			// Simulate second error
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}
			vi.advanceTimersByTime(2000);

			// Simulate third error - should trigger failure
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}

			expect(reconnectionFailedListener).toHaveBeenCalled();
			resilient.close();
		});

		it("cleans up on close", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream");

			resilient.close();

			expect(mockEventSource.close).toHaveBeenCalled();
		});

		it("removes event listeners", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream");
			const messageListener = vi.fn();

			resilient.addEventListener("message", messageListener);
			resilient.removeEventListener("message", messageListener);

			// Simulate message - should not call listener
			if (mockEventSource.onmessage) {
				mockEventSource.onmessage(new MessageEvent("message", { data: "test" }));
			}

			expect(messageListener).not.toHaveBeenCalled();
			resilient.close();
		});

		it("returns reconnection state", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream", undefined, {
				initialDelay: 1000,
			});

			// Initially no reconnection state
			expect(resilient.getReconnectionState()).toBeNull();

			// Simulate error to trigger reconnection
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}

			const state = resilient.getReconnectionState();
			expect(state).not.toBeNull();
			expect(state?.attempt).toBe(1);

			resilient.close();
		});

		it("supports EventListenerObject with handleEvent method", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream");
			const listenerObject: EventListenerObject = {
				handleEvent: vi.fn(),
			};

			resilient.addEventListener("message", listenerObject);

			// Simulate message
			if (mockEventSource.onmessage) {
				mockEventSource.onmessage(new MessageEvent("message", { data: "test" }));
			}

			expect(listenerObject.handleEvent).toHaveBeenCalled();
			resilient.close();
		});

		it("does not attempt to reconnect after close", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream", undefined, {
				initialDelay: 1000,
			});

			// Trigger an error to schedule reconnection
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}

			// Close the connection before reconnection timer fires
			resilient.close();

			// Clear EventSource mock calls
			vi.clearAllMocks();

			// Advance timer - should not create new EventSource because it was closed
			vi.advanceTimersByTime(5000);

			expect(global.EventSource).not.toHaveBeenCalled();
		});

		it("ignores errors after connection is closed", () => {
			const resilient = createResilientEventSource("http://localhost:3000/stream");
			const reconnectingListener = vi.fn();

			resilient.addEventListener("reconnecting", reconnectingListener);

			// Close the connection
			resilient.close();

			// Simulate error after close - should not trigger reconnection
			if (mockEventSource.onerror) {
				mockEventSource.onerror(new Event("error"));
			}

			expect(reconnectingListener).not.toHaveBeenCalled();
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for createCollabConvo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({
					id: 1,
					artifactType: "doc_draft",
					artifactId: 1,
					messages: [],
					createdAt: "",
					updatedAt: "",
				}),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createCollabConvoClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.createCollabConvo("doc_draft", 1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getCollabConvo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({
					id: 1,
					artifactType: "doc_draft",
					artifactId: 1,
					messages: [],
					createdAt: "",
					updatedAt: "",
				}),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createCollabConvoClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.getCollabConvo(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for getCollabConvoByArtifact", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({
					id: 1,
					artifactType: "doc_draft",
					artifactId: 123,
					messages: [],
					createdAt: "",
					updatedAt: "",
				}),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createCollabConvoClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.getCollabConvoByArtifact("doc_draft", 123);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for sendMessage", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				json: async () => ({
					success: true,
					message: { role: "user", content: "Test", userId: 1, timestamp: "" },
				}),
			};
			mockFetch.mockResolvedValueOnce(mockResponse as Response);

			const clientWithCheck = createCollabConvoClient("http://localhost:3000", createMockAuth(checkUnauthorized));
			await clientWithCheck.sendMessage(1, "Test");

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
