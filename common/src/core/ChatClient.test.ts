import { createChatClient } from "./ChatClient";
import type { ClientAuth } from "./Client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Helper to create a mock ReadableStream
function createMockReadableStream(chunks: Array<string>) {
	const encoder = new TextEncoder();
	let index = 0;

	return {
		getReader: () => ({
			read: () => {
				if (index >= chunks.length) {
					return Promise.resolve({ done: true, value: undefined });
				}
				const value = encoder.encode(chunks[index++]);
				return Promise.resolve({ done: false, value });
			},
			cancel: vi.fn().mockResolvedValue(undefined),
		}),
	};
}

// Helper to create a mock auth object
function createMockAuth(checkUnauthorized?: (response: Response) => boolean): ClientAuth {
	const auth: ClientAuth = {
		createRequest: (method, body, additional) => {
			const headers: Record<string, string> = {};
			if (body) {
				headers["Content-Type"] = "application/json";
			}

			return {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				credentials: "include" as RequestCredentials,
				...additional,
			};
		},
	};
	if (checkUnauthorized) {
		auth.checkUnauthorized = checkUnauthorized;
	}
	return auth;
}

describe("ChatClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with stream method", () => {
		const client = createChatClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.stream).toBeDefined();
		expect(typeof client.stream).toBe("function");
	});

	it("should call fetch with correct parameters for streaming", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream(['data: {"content":"test"}\n', "data: [DONE]\n"]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [{ role: "user", content: "Hello" }],
			userMessage: "World",
			onContent,
			onConvoId,
			activeConvoId: 123,
		});

		expect(mockFetch).toHaveBeenCalledWith("/api/chat/stream", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({
				message: "World",
				messages: [{ role: "user", content: "Hello" }],
				convoId: 123,
			}),
			signal: null,
		});
	});

	it("should handle content chunks via onContent callback", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream([
				'data: {"content":"Hello"}\n',
				'data: {"content":" World"}\n',
				"data: [DONE]\n",
			]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		expect(onContent).toHaveBeenCalledTimes(2);
		expect(onContent).toHaveBeenNthCalledWith(1, "Hello");
		expect(onContent).toHaveBeenNthCalledWith(2, " World");
	});

	it("should handle convoId event via onConvoId callback", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream([
				'data: {"content":"test"}\n',
				'data: {"type":"convoId","convoId":456}\n',
				"data: [DONE]\n",
			]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		expect(onConvoId).toHaveBeenCalledTimes(1);
		expect(onConvoId).toHaveBeenCalledWith(456);
	});

	it("should handle done event with metadata via onDone callback", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream([
				'data: {"content":"test"}\n',
				'data: {"type":"done","metadata":{"tokens":100}}\n',
				"data: [DONE]\n",
			]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();
		const onDone = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
			onDone,
		});

		expect(onDone).toHaveBeenCalledTimes(1);
		expect(onDone).toHaveBeenCalledWith({ tokens: 100 });
	});

	it("should skip invalid JSON in stream", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream(["data: invalid json\n", 'data: {"content":"valid"}\n', "data: [DONE]\n"]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		// Should only call onContent for valid JSON
		expect(onContent).toHaveBeenCalledTimes(1);
		expect(onContent).toHaveBeenCalledWith("valid");
	});

	it("should skip lines that don't start with 'data: '", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream(["not a data line\n", 'data: {"content":"valid"}\n', "data: [DONE]\n"]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		expect(onContent).toHaveBeenCalledTimes(1);
		expect(onContent).toHaveBeenCalledWith("valid");
	});

	it("should handle fetch errors and show error message", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		// Should show error message via onContent
		expect(onContent).toHaveBeenCalledWith("Sorry, I encountered an error. Please try again.");
	});

	it("should handle missing reader error", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: null,
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		expect(onContent).toHaveBeenCalledWith("Sorry, I encountered an error. Please try again.");
	});

	it("should handle AbortError gracefully", async () => {
		const mockFetch = vi.fn().mockRejectedValue(Object.assign(new Error("Aborted"), { name: "AbortError" }));
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		// Should not show error message for AbortError
		expect(onContent).not.toHaveBeenCalled();
	});

	it("should pass signal parameter to fetch", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream(["data: [DONE]\n"]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const controller = new AbortController();
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
			signal: controller.signal,
		});

		expect(mockFetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				signal: controller.signal,
			}),
		);
	});

	it("should use custom baseUrl when provided", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream(["data: [DONE]\n"]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("https://example.com", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/chat/stream", expect.any(Object));
	});

	it("should respect readyRef.current === false and not call callbacks", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream([
				'data: {"content":"test"}\n',
				'data: {"type":"convoId","convoId":123}\n',
				"data: [DONE]\n",
			]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();
		const readyRef = { current: false };

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
			readyRef,
		});

		// Should not call callbacks when readyRef.current is false
		expect(onContent).not.toHaveBeenCalled();
		expect(onConvoId).not.toHaveBeenCalled();
	});

	it("should not show error message when readyRef.current === false", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();
		const readyRef = { current: false };

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
			readyRef,
		});

		// Should not show error when readyRef.current is false
		expect(onContent).not.toHaveBeenCalled();
	});

	it("should handle [DONE] signal and stop processing", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			body: createMockReadableStream([
				'data: {"content":"before"}\n',
				"data: [DONE]\n",
				'data: {"content":"after"}\n',
			]),
		});
		global.fetch = mockFetch;

		const client = createChatClient("", createMockAuth());
		const onContent = vi.fn();
		const onConvoId = vi.fn();

		await client.stream({
			messages: [],
			userMessage: "Test",
			onContent,
			onConvoId,
		});

		// Should only process content before [DONE]
		expect(onContent).toHaveBeenCalledTimes(1);
		expect(onContent).toHaveBeenCalledWith("before");
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for stream", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = {
				ok: true,
				body: createMockReadableStream(["data: [DONE]\n"]),
			};
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createChatClient("", createMockAuth(checkUnauthorized));
			const onContent = vi.fn();
			const onConvoId = vi.fn();

			await client.stream({
				messages: [],
				userMessage: "Test",
				onContent,
				onConvoId,
			});

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
