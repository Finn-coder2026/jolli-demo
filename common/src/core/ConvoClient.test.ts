import type { ClientAuth } from "./Client";
import { createConvoClient } from "./ConvoClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("ConvoClient", () => {
	beforeEach(() => {
		global.fetch = vi.fn();
		vi.clearAllMocks();
	});

	it("should create a client with all convo methods", () => {
		const client = createConvoClient("", createMockAuth());
		expect(client).toBeDefined();
		expect(client.createConvo).toBeDefined();
		expect(client.listConvos).toBeDefined();
		expect(client.findConvo).toBeDefined();
		expect(client.updateConvo).toBeDefined();
		expect(client.deleteConvo).toBeDefined();
		expect(client.addMessage).toBeDefined();
	});

	describe("createConvo", () => {
		it("should create a new convo", async () => {
			const mockConvo = {
				id: 1,
				userId: 123,
				visitorId: undefined,
				title: "Test Conversation",
				messages: [],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockConvo,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			const result = await client.createConvo({
				title: "Test Conversation",
				messages: [],
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/convos", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					title: "Test Conversation",
					messages: [],
				}),
			});
			expect(result).toEqual(mockConvo);
		});

		it("should throw error when creation fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Internal Server Error",
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());

			await expect(
				client.createConvo({
					title: "Test",
					messages: [],
				}),
			).rejects.toThrow("Failed to create convo: Internal Server Error");
		});

		it("should use custom baseUrl when provided", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ id: 1 }),
			});
			global.fetch = mockFetch;

			const client = createConvoClient("https://example.com", createMockAuth());
			await client.createConvo({ title: "Test", messages: [] });

			expect(mockFetch).toHaveBeenCalledWith("https://example.com/api/convos", expect.any(Object));
		});
	});

	describe("listConvos", () => {
		it("should list all convos", async () => {
			const mockConvos = [
				{
					id: 1,
					userId: 123,
					visitorId: undefined,
					title: "Conversation 1",
					messages: [],
					createdAt: "2025-01-01T00:00:00Z",
					updatedAt: "2025-01-01T00:00:00Z",
				},
				{
					id: 2,
					userId: 123,
					visitorId: undefined,
					title: "Conversation 2",
					messages: [],
					createdAt: "2025-01-02T00:00:00Z",
					updatedAt: "2025-01-02T00:00:00Z",
				},
			];

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockConvos,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			const result = await client.listConvos();

			expect(mockFetch).toHaveBeenCalledWith("/api/convos", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockConvos);
			expect(result.length).toBe(2);
		});

		it("should throw error when listing fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Unauthorized",
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());

			await expect(client.listConvos()).rejects.toThrow("Failed to list convos: Unauthorized");
		});
	});

	describe("findConvo", () => {
		it("should find a specific convo by ID", async () => {
			const mockConvo = {
				id: 1,
				userId: 123,
				visitorId: undefined,
				title: "Test Conversation",
				messages: [{ role: "user" as const, content: "Hello" }],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-01T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockConvo,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			const result = await client.findConvo(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/convos/1", {
				method: "GET",
				headers: {},
				body: null,
				credentials: "include",
			});
			expect(result).toEqual(mockConvo);
		});

		it("should throw error when convo not found", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());

			await expect(client.findConvo(999)).rejects.toThrow("Failed to get convo: Not Found");
		});
	});

	describe("updateConvo", () => {
		it("should update convo title", async () => {
			const mockUpdated = {
				id: 1,
				userId: 123,
				visitorId: undefined,
				title: "Updated Title",
				messages: [],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-02T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUpdated,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			const result = await client.updateConvo(1, { title: "Updated Title" });

			expect(mockFetch).toHaveBeenCalledWith("/api/convos/1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ title: "Updated Title" }),
			});
			expect(result).toEqual(mockUpdated);
		});

		it("should update convo messages", async () => {
			const mockUpdated = {
				id: 1,
				userId: 123,
				visitorId: undefined,
				title: "Test",
				messages: [
					{ role: "user" as const, content: "Hello" },
					{ role: "assistant" as const, content: "Hi!" },
				],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-02T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUpdated,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			const result = await client.updateConvo(1, {
				messages: [
					{ role: "user", content: "Hello" },
					{ role: "assistant", content: "Hi!" },
				],
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/convos/1", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					messages: [
						{ role: "user", content: "Hello" },
						{ role: "assistant", content: "Hi!" },
					],
				}),
			});
			expect(result.messages.length).toBe(2);
		});

		it("should throw error when update fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Forbidden",
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());

			await expect(client.updateConvo(1, { title: "Test" })).rejects.toThrow("Failed to update convo: Forbidden");
		});
	});

	describe("deleteConvo", () => {
		it("should delete a convo", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			await client.deleteConvo(1);

			expect(mockFetch).toHaveBeenCalledWith("/api/convos/1", {
				method: "DELETE",
				headers: {},
				body: null,
				credentials: "include",
			});
		});

		it("should throw error when deletion fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Not Found",
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());

			await expect(client.deleteConvo(999)).rejects.toThrow("Failed to delete convo: Not Found");
		});
	});

	describe("addMessage", () => {
		it("should add a message to a convo", async () => {
			const mockUpdated = {
				id: 1,
				userId: 123,
				visitorId: undefined,
				title: "Test",
				messages: [
					{ role: "user" as const, content: "Hello" },
					{ role: "assistant" as const, content: "Hi!" },
				],
				createdAt: "2025-01-01T00:00:00Z",
				updatedAt: "2025-01-02T00:00:00Z",
			};

			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mockUpdated,
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());
			const result = await client.addMessage(1, {
				role: "assistant",
				content: "Hi!",
			});

			expect(mockFetch).toHaveBeenCalledWith("/api/convos/1/messages", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					role: "assistant",
					content: "Hi!",
				}),
			});
			expect(result).toEqual(mockUpdated);
			expect(result.messages.length).toBe(2);
		});

		it("should throw error when adding message fails", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				statusText: "Bad Request",
			});
			global.fetch = mockFetch;

			const client = createConvoClient("", createMockAuth());

			await expect(
				client.addMessage(1, {
					role: "user",
					content: "Test",
				}),
			).rejects.toThrow("Failed to add message: Bad Request");
		});
	});

	describe("checkUnauthorized callback", () => {
		it("should call checkUnauthorized for createConvo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createConvoClient("", createMockAuth(checkUnauthorized));
			await client.createConvo({ title: "Test", messages: [] });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for listConvos", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => [] };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createConvoClient("", createMockAuth(checkUnauthorized));
			await client.listConvos();

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for findConvo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createConvoClient("", createMockAuth(checkUnauthorized));
			await client.findConvo(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for updateConvo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1 }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createConvoClient("", createMockAuth(checkUnauthorized));
			await client.updateConvo(1, { title: "Updated" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for deleteConvo", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createConvoClient("", createMockAuth(checkUnauthorized));
			await client.deleteConvo(1);

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});

		it("should call checkUnauthorized for addMessage", async () => {
			const checkUnauthorized = vi.fn().mockReturnValue(false);
			const mockResponse = { ok: true, json: async () => ({ id: 1, messages: [] }) };
			global.fetch = vi.fn().mockResolvedValue(mockResponse);

			const client = createConvoClient("", createMockAuth(checkUnauthorized));
			await client.addMessage(1, { role: "user", content: "Test" });

			expect(checkUnauthorized).toHaveBeenCalledWith(mockResponse);
		});
	});
});
