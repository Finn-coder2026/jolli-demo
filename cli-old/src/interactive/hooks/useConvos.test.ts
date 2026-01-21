/**
 * @vitest-environment jsdom
 */
import { useConvos } from "./useConvos";
import { renderHook, waitFor } from "@testing-library/react";
import type { Client, Convo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Config module
vi.mock("../../util/Config", () => ({
	saveActiveConvoId: vi.fn(),
	loadActiveConvoId: vi.fn(),
}));

const Config = await import("../../util/Config");
const mockSaveActiveConvoId = vi.mocked(Config.saveActiveConvoId);
const mockLoadActiveConvoId = vi.mocked(Config.loadActiveConvoId);

describe("useConvos", () => {
	beforeEach(() => {
		// Reset mocks before each test
		mockSaveActiveConvoId.mockResolvedValue(undefined);
		mockLoadActiveConvoId.mockResolvedValue(undefined);
	});
	const mockConvos: Array<Convo> = [
		{
			id: 1,
			userId: 1,
			visitorId: undefined,
			title: "First Conversation",
			messages: [{ role: "user", content: "Hello" }],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
		{
			id: 2,
			userId: 1,
			visitorId: undefined,
			title: "Second Conversation",
			messages: [{ role: "user", content: "Hi there" }],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	];

	const createMockClient = (conversationList: Array<Convo> = mockConvos): Client => {
		return {
			convos: () => ({
				listConvos: vi.fn().mockResolvedValue(conversationList),
			}),
		} as unknown as Client;
	};

	it("should initialize with empty convos and undefined activeConvoId", () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		expect(result.current.convos).toEqual([]);
		expect(result.current.activeConvoId).toBeUndefined();
		expect(result.current.currentTitle).toBe("New Conversation");
	});

	it("should load initial convos successfully", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();
		mockLoadActiveConvoId.mockResolvedValue(undefined);

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		await waitFor(() => {
			expect(result.current.convos).toEqual(mockConvos);
		});

		expect(setSystemMessage).toHaveBeenCalledWith(null);
	});

	it("should prompt to resume convo if saved ID exists with messages", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();
		mockLoadActiveConvoId.mockResolvedValue(1);

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		await waitFor(() => {
			expect(setPendingResumeConvo).toHaveBeenCalledWith(mockConvos[0]);
		});

		expect(setSystemMessage).toHaveBeenCalledWith(
			expect.stringContaining("Would you like to resume your last conversation?"),
		);
	});

	it("should not prompt to resume if saved convo has no messages", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const emptyConvo: Convo = {
			id: 1,
			userId: 1,
			visitorId: undefined,
			title: "Empty",
			messages: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const client = createMockClient([emptyConvo]);
		mockLoadActiveConvoId.mockResolvedValue(1);

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		await waitFor(() => {
			expect(result.current.convos).toEqual([emptyConvo]);
		});

		expect(setPendingResumeConvo).not.toHaveBeenCalled();
	});

	it("should truncate long messages in resume prompt", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const longMessageConvo: Convo = {
			id: 1,
			userId: 1,
			visitorId: undefined,
			title: "Long Message",
			messages: [
				{
					role: "user",
					content:
						"This is a very long message that exceeds 100 characters and should be truncated when displayed in the resume prompt to the user for better readability",
				},
			],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const client = createMockClient([longMessageConvo]);
		mockLoadActiveConvoId.mockResolvedValue(1);

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		await waitFor(() => {
			const systemMessageCall = setSystemMessage.mock.calls.find(call =>
				call[0]?.includes("Would you like to resume"),
			);
			expect(systemMessageCall).toBeDefined();
			expect(systemMessageCall?.[0]).toContain("...");
		});
	});

	it("should handle authentication errors (401)", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = {
			convos: () => ({
				listConvos: vi.fn().mockRejectedValue(new Error("401 Unauthorized")),
			}),
		} as unknown as Client;

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		expect(setSystemMessage).toHaveBeenCalledWith("You need to log in. Type /login to authenticate.");
	});

	it("should handle authentication errors (403)", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = {
			convos: () => ({
				listConvos: vi.fn().mockRejectedValue(new Error("403 Forbidden")),
			}),
		} as unknown as Client;

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		expect(setSystemMessage).toHaveBeenCalledWith("You need to log in. Type /login to authenticate.");
	});

	it("should handle generic errors during load", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress console.error during test
		});
		const client = {
			convos: () => ({
				listConvos: vi.fn().mockRejectedValue(new Error("Network error")),
			}),
		} as unknown as Client;

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const setSystemMessage = vi.fn();
		const setPendingResumeConvo = vi.fn();

		await result.current.loadInitialConvos(setSystemMessage, setPendingResumeConvo);

		expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to load convos:", expect.any(Error));

		consoleErrorSpy.mockRestore();
	});

	it("should reload convos", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		await result.current.reloadConvos();

		await waitFor(() => {
			expect(result.current.convos).toEqual(mockConvos);
		});
	});

	it("should handle errors during reload", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress console.error during test
		});
		const client = {
			convos: () => ({
				listConvos: vi.fn().mockRejectedValue(new Error("Reload failed")),
			}),
		} as unknown as Client;

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		await result.current.reloadConvos();

		expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to reload convos:", expect.any(Error));

		consoleErrorSpy.mockRestore();
	});

	it("should handle new conversation", () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		result.current.handleNewConvo();

		expect(result.current.activeConvoId).toBeUndefined();
		expect(setMessages).toHaveBeenCalledWith([]);
		expect(setViewMode).toHaveBeenCalledWith("chat");
		expect(mockSaveActiveConvoId).toHaveBeenCalledWith(undefined);
	});

	it("should handle switch conversation", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const convo = mockConvos[0];
		result.current.handleSwitchConvo(convo);

		await waitFor(() => {
			expect(result.current.activeConvoId).toBe(convo.id);
		});

		expect(setMessages).toHaveBeenCalledWith(convo.messages);
		expect(setViewMode).toHaveBeenCalledWith("chat");
		expect(mockSaveActiveConvoId).toHaveBeenCalledWith(convo.id);
	});

	it("should update currentTitle when active convo changes", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		// Load convos first
		await result.current.reloadConvos();

		await waitFor(() => {
			expect(result.current.convos).toEqual(mockConvos);
		});

		// Switch to a conversation
		result.current.setActiveConvoId(1);

		await waitFor(() => {
			expect(result.current.currentTitle).toBe("First Conversation");
		});
	});

	it("should show 'Conversation' as title for unknown convo ID", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		// Load convos first
		await result.current.reloadConvos();

		await waitFor(() => {
			expect(result.current.convos).toEqual(mockConvos);
		});

		// Set an ID that doesn't exist
		result.current.setActiveConvoId(999);

		await waitFor(() => {
			expect(result.current.currentTitle).toBe("Conversation");
		});
	});

	it("should save active convo ID when it changes", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();
		mockSaveActiveConvoId.mockClear();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		result.current.setActiveConvoId(1);

		await waitFor(() => {
			expect(mockSaveActiveConvoId).toHaveBeenCalledWith(1);
		});
	});

	it("should ignore errors when saving active convo ID", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();
		mockSaveActiveConvoId.mockRejectedValueOnce(new Error("Save failed"));

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		// Should not throw
		result.current.setActiveConvoId(1);

		// Wait a bit to ensure the promise is handled
		await new Promise(resolve => setTimeout(resolve, 10));
	});

	it("should allow directly setting convos", async () => {
		const setMessages = vi.fn();
		const setViewMode = vi.fn();
		const client = createMockClient();

		const { result } = renderHook(() => useConvos({ client, setMessages, setViewMode }));

		const newConvos: Array<Convo> = [
			{
				id: 3,
				userId: 1,
				visitorId: undefined,
				title: "New Conversation",
				messages: [{ role: "user", content: "Test" }],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		result.current.setConvos(newConvos);

		await waitFor(() => {
			expect(result.current.convos).toEqual(newConvos);
		});
	});
});
