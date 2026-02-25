import { type AgentHubClient, createAgentHubClient } from "./AgentHubClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

global.fetch = vi.fn();
const mockFetch = vi.mocked(fetch);

interface MockAuth {
	createRequest: ReturnType<typeof vi.fn>;
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
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

/**
 * Helper to create a mock SSE Response with ReadableStream body
 */
function createMockSseResponse(events: Array<{ type?: string; data?: unknown }>): Response {
	const sseText = events
		.map(event => {
			const data = event.data ? JSON.stringify(event.data) : JSON.stringify({ type: event.type });
			return `data: ${data}\n\n`;
		})
		.join("");

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(sseText));
			controller.close();
		},
	});

	return {
		ok: true,
		body: stream,
		headers: new Headers({ "content-type": "text/event-stream" }),
	} as unknown as Response;
}

describe("AgentHubClient", () => {
	let client: AgentHubClient;
	let mockAuth: MockAuth;

	beforeEach(() => {
		vi.clearAllMocks();
		mockAuth = createMockAuth();
		client = createAgentHubClient("http://localhost:7034", mockAuth);
	});

	describe("createConvo", () => {
		it("creates a conversation without title", async () => {
			const mockConvo = {
				id: 1,
				title: undefined,
				messages: [{ role: "assistant", content: "Hello!", timestamp: "2025-01-01T00:00:00Z" }],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.createConvo();

			expect(result).toEqual(mockConvo);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos",
				expect.objectContaining({ method: "POST" }),
			);
			expect(mockAuth.createRequest).toHaveBeenCalledWith("POST", { artifactType: "agent_hub" });
		});

		it("creates a conversation with title", async () => {
			const mockConvo = {
				id: 1,
				title: "My Chat",
				messages: [],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.createConvo("My Chat");

			expect(result).toEqual(mockConvo);
			expect(mockAuth.createRequest).toHaveBeenCalledWith("POST", {
				artifactType: "agent_hub",
				title: "My Chat",
			});
		});

		it("throws error when creation fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.createConvo()).rejects.toThrow("Failed to create conversation");
		});

		it("checks for unauthorized response", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const authClient = createAgentHubClient("http://localhost:7034", createMockAuth(checkUnauthorized));

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: 1 }),
			} as Response);

			await authClient.createConvo();
			expect(checkUnauthorized).toHaveBeenCalled();
		});
	});

	describe("listConvos", () => {
		it("lists conversations with default params", async () => {
			const mockConvos = [
				{ id: 1, title: "Chat 1", updatedAt: "2025-01-01T00:00:00Z" },
				{ id: 2, title: "Chat 2", updatedAt: "2025-01-02T00:00:00Z" },
			];

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvos,
			} as Response);

			const result = await client.listConvos();

			expect(result).toEqual(mockConvos);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos?artifactType=agent_hub",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("lists conversations with pagination", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => [],
			} as Response);

			await client.listConvos(10, 5);

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos?artifactType=agent_hub&limit=10&offset=5",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when listing fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Internal Server Error",
			} as Response);

			await expect(client.listConvos()).rejects.toThrow("Failed to list conversations");
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));

			mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

			await clientWithAuth.listConvos();

			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("getConvo", () => {
		it("gets a conversation by ID", async () => {
			const mockConvo = {
				id: 1,
				title: "Test",
				messages: [],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.getConvo(1);

			expect(result).toEqual(mockConvo);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1",
				expect.objectContaining({ method: "GET" }),
			);
		});

		it("throws error when get fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.getConvo(999)).rejects.toThrow("Failed to get conversation");
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));

			mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) } as Response);

			await clientWithAuth.getConvo(1);

			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("deleteConvo", () => {
		it("deletes a conversation", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
			} as Response);

			await expect(client.deleteConvo(1)).resolves.not.toThrow();

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1",
				expect.objectContaining({ method: "DELETE" }),
			);
		});

		it("throws error when delete fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.deleteConvo(999)).rejects.toThrow("Failed to delete conversation");
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));

			mockFetch.mockResolvedValueOnce({ ok: true } as Response);

			await clientWithAuth.deleteConvo(1);

			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("updateTitle", () => {
		it("updates the conversation title", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
			} as Response);

			await expect(client.updateTitle(1, "New Title")).resolves.not.toThrow();

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1",
				expect.objectContaining({ method: "PATCH" }),
			);
			expect(mockAuth.createRequest).toHaveBeenCalledWith("PATCH", { title: "New Title" });
		});

		it("throws error when update fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.updateTitle(1, "")).rejects.toThrow("Failed to update conversation title");
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheckUnauthorized = vi.fn();
			const authWithCheck = createMockAuth(mockCheckUnauthorized);
			const clientWithAuth = createAgentHubClient("http://localhost:7034", authWithCheck);

			mockFetch.mockResolvedValueOnce({ ok: true } as Response);

			await clientWithAuth.updateTitle(1, "New Title");

			expect(mockCheckUnauthorized).toHaveBeenCalled();
		});
	});

	describe("seedConvo", () => {
		it("sends POST to /seed/:kind and returns the conversation", async () => {
			const mockConvo = {
				id: 1,
				title: "Getting Started with Jolli",
				messages: [{ role: "assistant", content: "Welcome!", timestamp: "2025-01-01T00:00:00Z" }],
				metadata: { convoKind: "getting_started", createdForUserId: 1 },
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.seedConvo("getting_started");

			expect(result).toEqual(mockConvo);
			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/seed/getting_started",
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("returns undefined when seeding fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			const result = await client.seedConvo("invalid_kind");

			expect(result).toBeUndefined();
		});

		it("returns undefined on network error", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			const result = await client.seedConvo("getting_started");

			expect(result).toBeUndefined();
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: 1 }),
			} as Response);

			await clientWithAuth.seedConvo("getting_started");

			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("advanceConvo", () => {
		it("sends POST to /:id/advance and processes SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{ type: "message_received" },
				{ data: { type: "content_chunk", content: "Checking GitHub...", seq: 0 } },
				{
					data: {
						type: "message_complete",
						message: {
							role: "assistant",
							content: "Checking GitHub...",
							timestamp: "2025-01-01T00:00:00Z",
						},
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const chunks: Array<{ content: string; seq: number }> = [];
			let completeMessage: { role: string; content: string } | undefined;

			await client.advanceConvo(1, {
				onChunk: (content, seq) => chunks.push({ content, seq }),
				onComplete: msg => {
					completeMessage = msg;
				},
			});

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1/advance",
				expect.objectContaining({ method: "POST" }),
			);
			expect(chunks).toEqual([{ content: "Checking GitHub...", seq: 0 }]);
			expect(completeMessage).toEqual({
				role: "assistant",
				content: "Checking GitHub...",
				timestamp: "2025-01-01T00:00:00Z",
			});
		});

		it("returns immediately for JSON already_advanced response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ "content-type": "application/json" }),
				json: async () => ({ status: "already_advanced" }),
			} as Response);

			const chunks: Array<string> = [];

			await client.advanceConvo(1, {
				onChunk: content => chunks.push(content),
			});

			// Should not have processed any SSE chunks
			expect(chunks).toEqual([]);
		});

		it("throws on non-ok response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.advanceConvo(1)).rejects.toThrow("Failed to advance conversation");
		});

		it("reads SSE stream when content-type header is absent", async () => {
			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "message_complete",
						message: {
							role: "assistant",
							content: "Done",
							timestamp: "2025-01-01T00:00:00Z",
						},
					},
				},
			]);
			// Override headers to have no content-type
			Object.defineProperty(sseResponse, "headers", {
				value: new Headers(),
			});

			mockFetch.mockResolvedValueOnce(sseResponse);

			let completeMsg: { content: string } | undefined;
			await client.advanceConvo(1, {
				onComplete: msg => {
					completeMsg = msg;
				},
			});

			expect(completeMsg?.content).toBe("Done");
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));

			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ "content-type": "application/json" }),
				json: async () => ({ status: "already_advanced" }),
			} as Response);

			await clientWithAuth.advanceConvo(1);

			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("retryMessage", () => {
		it("sends POST to /retry with messageIndex and processes SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{ type: "message_received" },
				{ data: { type: "content_chunk", content: "Retried", seq: 0 } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Retried", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const chunks: Array<{ content: string; seq: number }> = [];
			let completeMessage: { role: string; content: string } | undefined;

			await client.retryMessage(1, 2, {
				onChunk: (content, seq) => chunks.push({ content, seq }),
				onComplete: msg => {
					completeMessage = msg;
				},
			});

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1/retry",
				expect.objectContaining({ method: "POST" }),
			);
			expect(mockAuth.createRequest).toHaveBeenCalledWith("POST", { messageIndex: 2 });
			expect(chunks).toEqual([{ content: "Retried", seq: 0 }]);
			expect(completeMessage).toEqual({
				role: "assistant",
				content: "Retried",
				timestamp: "2025-01-01T00:00:00Z",
			});
		});

		it("throws error when retry fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.retryMessage(1, 2)).rejects.toThrow("Failed to retry message");
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));

			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			await clientWithAuth.retryMessage(1, 2);

			expect(mockCheck).toHaveBeenCalled();
		});

		it("throws error when response body is not readable", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: null,
			} as Response);

			await expect(client.retryMessage(1, 2)).rejects.toThrow("Response body is not readable");
		});
	});

	describe("sendMessage", () => {
		it("sends a message and processes SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{ type: "message_received" },
				{ data: { type: "content_chunk", content: "Hello", seq: 0 } },
				{ data: { type: "content_chunk", content: " world", seq: 1 } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Hello world", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const chunks: Array<{ content: string; seq: number }> = [];
			let completeMessage: { role: string; content: string } | undefined;

			await client.sendMessage(1, "Hi", {
				onChunk: (content, seq) => chunks.push({ content, seq }),
				onComplete: msg => {
					completeMessage = msg;
				},
			});

			expect(chunks).toEqual([
				{ content: "Hello", seq: 0 },
				{ content: " world", seq: 1 },
			]);
			expect(completeMessage).toEqual({
				role: "assistant",
				content: "Hello world",
				timestamp: "2025-01-01T00:00:00Z",
			});
		});

		it("handles tool events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{ type: "message_received" },
				{
					data: {
						type: "tool_event",
						event: { type: "tool_start", tool: "search", status: "running" },
					},
				},
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const toolEvents: Array<{ type: string; tool: string }> = [];

			await client.sendMessage(1, "Search something", {
				onToolEvent: event => toolEvents.push(event),
			});

			expect(toolEvents).toEqual([{ type: "tool_start", tool: "search", status: "running" }]);
		});

		it("handles error events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{ type: "message_received" },
				{ data: { type: "error", error: "Something went wrong" } },
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const errors: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onError: error => errors.push(error),
			});

			expect(errors).toEqual(["Something went wrong"]);
		});

		it("throws error when send fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.sendMessage(1, "")).rejects.toThrow("Failed to send message");
		});

		it("throws error when response body is not readable", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: null,
			} as Response);

			await expect(client.sendMessage(1, "Hi")).rejects.toThrow("Response body is not readable");
		});

		it("handles SSE keep-alive comments and special markers", async () => {
			// Create SSE with comments and special markers
			const sseText = ': keep-alive\n\ndata: [DONE]\n\ndata: {"type":"content_chunk","content":"Hi","seq":0}\n\n';

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(sseText));
					controller.close();
				},
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: stream,
			} as unknown as Response);

			const chunks: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onChunk: content => chunks.push(content),
			});

			// Only the actual content chunk should have been processed
			expect(chunks).toEqual(["Hi"]);
		});

		it("handles typing events without error", async () => {
			const sseResponse = createMockSseResponse([
				{ data: { type: "typing", userId: 1, timestamp: "2025-01-01T00:00:00Z" } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Hi", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			// Should not throw — typing events are silently ignored
			await expect(client.sendMessage(1, "Hi")).resolves.not.toThrow();
		});

		it("ignores malformed SSE data gracefully", async () => {
			const sseText = 'data: not-valid-json\n\ndata: {"type":"content_chunk","content":"OK","seq":0}\n\n';

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(sseText));
					controller.close();
				},
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: stream,
			} as unknown as Response);

			const chunks: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onChunk: content => chunks.push(content),
			});

			// Should only get the valid chunk
			expect(chunks).toEqual(["OK"]);
		});

		it("ignores non-data SSE lines like event types", async () => {
			const sseText =
				'event: message\nid: 1\nretry: 5000\ndata: {"type":"content_chunk","content":"Hi","seq":0}\n\n';

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(sseText));
					controller.close();
				},
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: stream,
			} as unknown as Response);

			const chunks: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onChunk: content => chunks.push(content),
			});

			// Only the data line should be processed, event/id/retry lines are ignored
			expect(chunks).toEqual(["Hi"]);
		});

		it("processes stream without callbacks", async () => {
			const sseResponse = createMockSseResponse([
				{ data: { type: "content_chunk", content: "Hi", seq: 0 } },
				{ data: { type: "error", error: "Oops" } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Hi", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			// Should not throw even without callbacks
			await expect(client.sendMessage(1, "Hi")).resolves.not.toThrow();
		});

		it("handles events with partial callbacks (no onChunk or onError)", async () => {
			const sseResponse = createMockSseResponse([
				{ data: { type: "content_chunk", content: "", seq: 0 } },
				{ data: { type: "error" } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Hi", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			let completeMsg: { content: string } | undefined;

			// Pass callbacks object with only onComplete — no onChunk or onError
			await client.sendMessage(1, "Hi", {
				onComplete: msg => {
					completeMsg = msg;
				},
			});

			// onComplete should still fire even though other handlers are absent
			expect(completeMsg?.content).toBe("Hi");
		});

		it("uses fallback values for missing content and error fields", async () => {
			const sseResponse = createMockSseResponse([
				{ data: { type: "content_chunk" } },
				{ data: { type: "error" } },
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const chunks: Array<{ content: string; seq: number }> = [];
			const errors: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onChunk: (content, seq) => chunks.push({ content, seq }),
				onError: error => errors.push(error),
			});

			// Should use fallback values when fields are undefined
			expect(chunks).toEqual([{ content: "", seq: 0 }]);
			expect(errors).toEqual(["Unknown error"]);
		});

		it("calls checkUnauthorized when defined", async () => {
			const mockCheckUnauthorized = vi.fn();
			const authWithCheck = createMockAuth(mockCheckUnauthorized);
			const clientWithAuth = createAgentHubClient("http://localhost:7034", authWithCheck);

			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			await clientWithAuth.sendMessage(1, "Hi");

			expect(mockCheckUnauthorized).toHaveBeenCalled();
		});

		it("handles navigation_action events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "navigation_action",
						action: { path: "/article-draft/42", label: "Edit: My Article" },
					},
				},
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Navigating...", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const navActions: Array<{ path: string; label: string }> = [];

			await client.sendMessage(1, "Navigate me", {
				onNavigationAction: action => navActions.push(action),
			});

			expect(navActions).toEqual([{ path: "/article-draft/42", label: "Edit: My Article" }]);
		});

		it("ignores navigation_action events without action data", async () => {
			const sseResponse = createMockSseResponse([
				{ data: { type: "navigation_action" } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const navActions: Array<{ path: string; label: string }> = [];

			await client.sendMessage(1, "Hi", {
				onNavigationAction: action => navActions.push(action),
			});

			expect(navActions).toEqual([]);
		});

		it("handles plan_update events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "plan_update",
						plan: "# My Plan\n- Step 1",
						phase: "planning",
					},
				},
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Here's the plan.", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const planUpdates: Array<{ plan: string | undefined; phase: string }> = [];

			await client.sendMessage(1, "Make a plan", {
				onPlanUpdate: (plan, phase) => planUpdates.push({ plan, phase }),
			});

			expect(planUpdates).toEqual([{ plan: "# My Plan\n- Step 1", phase: "planning" }]);
		});

		it("ignores plan_update events without phase, dispatches phase-only events", async () => {
			const sseResponse = createMockSseResponse([
				{ data: { type: "plan_update" } },
				{ data: { type: "plan_update", plan: "Plan only" } },
				{ data: { type: "plan_update", phase: "executing" } },
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const planUpdates: Array<{ plan: string | undefined; phase: string }> = [];

			await client.sendMessage(1, "Hi", {
				onPlanUpdate: (plan, phase) => planUpdates.push({ plan, phase }),
			});

			// Events without phase are ignored; phase-only events dispatch with plan=undefined
			expect(planUpdates).toEqual([{ plan: undefined, phase: "executing" }]);
		});

		it("flushes remaining buffer after stream closes", async () => {
			// Simulate the last event arriving without a trailing \n\n
			// (connection closes before the double newline is fully flushed)
			const sseText =
				'data: {"type":"content_chunk","content":"Hello","seq":0}\n\ndata: {"type":"navigation_action","action":{"path":"/article-draft/11","label":"Draft"}}';

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(sseText));
					controller.close();
				},
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: stream,
			} as unknown as Response);

			const chunks: Array<string> = [];
			const navActions: Array<{ path: string; label: string }> = [];

			await client.sendMessage(1, "Hi", {
				onChunk: content => chunks.push(content),
				onNavigationAction: action => navActions.push(action),
			});

			// Both events should be processed — the navigation_action from the buffer flush
			expect(chunks).toEqual(["Hello"]);
			expect(navActions).toEqual([{ path: "/article-draft/11", label: "Draft" }]);
		});

		it("ignores empty SSE event strings", async () => {
			// Double newlines with only whitespace between them
			const sseText = '\n\n   \n\ndata: {"type":"content_chunk","content":"Hello","seq":0}\n\n';

			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(sseText));
					controller.close();
				},
			});

			mockFetch.mockResolvedValueOnce({
				ok: true,
				body: stream,
			} as unknown as Response);

			const chunks: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onChunk: content => chunks.push(content),
			});

			// Empty events are skipped, only the real chunk is processed
			expect(chunks).toEqual(["Hello"]);
		});

		it("handles confirmation_required events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "confirmation_required",
						confirmation: {
							confirmationId: "conf_123",
							toolName: "create_folder",
							toolArgs: { name: "Docs" },
							description: "Create folder 'Docs'",
						},
					},
				},
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const confirmations: Array<{ confirmationId: string; toolName: string }> = [];

			await client.sendMessage(1, "Create a folder", {
				onConfirmationRequired: c => confirmations.push(c),
			});

			expect(confirmations).toEqual([
				{
					confirmationId: "conf_123",
					toolName: "create_folder",
					toolArgs: { name: "Docs" },
					description: "Create folder 'Docs'",
				},
			]);
		});

		it("handles confirmation_resolved events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "confirmation_resolved",
						confirmationId: "conf_123",
						approved: true,
					},
				},
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const resolved: Array<{ id: string; approved: boolean }> = [];

			await client.sendMessage(1, "Hi", {
				onConfirmationResolved: (id, approved) => resolved.push({ id, approved }),
			});

			expect(resolved).toEqual([{ id: "conf_123", approved: true }]);
		});

		it("handles mode_change events in SSE stream", async () => {
			const sseResponse = createMockSseResponse([
				{
					data: {
						type: "mode_change",
						mode: "plan",
					},
				},
				{
					data: {
						type: "message_complete",
						message: { role: "assistant", content: "Done", timestamp: "2025-01-01T00:00:00Z" },
					},
				},
			]);

			mockFetch.mockResolvedValueOnce(sseResponse);

			const modes: Array<string> = [];

			await client.sendMessage(1, "Hi", {
				onModeChange: m => modes.push(m),
			});

			expect(modes).toEqual(["plan"]);
		});
	});

	describe("respondToConfirmation", () => {
		it("sends POST to approve a confirmation", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			} as Response);

			await client.respondToConfirmation(1, "conf_123", true);

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1/confirmations/conf_123",
				expect.objectContaining({ method: "POST" }),
			);
			expect(mockAuth.createRequest).toHaveBeenCalledWith("POST", { approved: true });
		});

		it("sends POST to deny a confirmation", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			} as Response);

			await client.respondToConfirmation(1, "conf_456", false);

			expect(mockAuth.createRequest).toHaveBeenCalledWith("POST", { approved: false });
		});

		it("throws on non-ok response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Not Found",
			} as Response);

			await expect(client.respondToConfirmation(1, "conf_123", true)).rejects.toThrow(
				"Failed to respond to confirmation",
			);
		});

		it("calls checkUnauthorized when provided", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));
			mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

			await clientWithAuth.respondToConfirmation(1, "conf_123", true);

			expect(mockCheck).toHaveBeenCalled();
		});
	});

	describe("setMode", () => {
		it("sends POST to change mode and returns updated convo", async () => {
			const mockConvo = {
				id: 1,
				title: "Test",
				messages: [],
				metadata: { mode: "plan" },
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockConvo,
			} as Response);

			const result = await client.setMode(1, "plan");

			expect(mockFetch).toHaveBeenCalledWith(
				"http://localhost:7034/api/agent/convos/1/mode",
				expect.objectContaining({ method: "POST" }),
			);
			expect(mockAuth.createRequest).toHaveBeenCalledWith("POST", { mode: "plan" });
			expect(result).toEqual(mockConvo);
		});

		it("throws on non-ok response", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				statusText: "Bad Request",
			} as Response);

			await expect(client.setMode(1, "invalid" as "plan")).rejects.toThrow("Failed to set mode");
		});

		it("calls checkUnauthorized when provided", async () => {
			const mockCheck = vi.fn();
			const clientWithAuth = createAgentHubClient("http://localhost:7034", createMockAuth(mockCheck));
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: 1, title: "T", messages: [], metadata: { mode: "plan" } }),
			} as Response);

			await clientWithAuth.setMode(1, "plan");

			expect(mockCheck).toHaveBeenCalled();
		});
	});
});
