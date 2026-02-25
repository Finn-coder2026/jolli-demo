import { useAgentHub } from "./UseAgentHub";
import { act, renderHook, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useCurrentUser
const mockSetAgentHubConversation = vi.fn();

vi.mock("../contexts/CurrentUserContext", () => ({
	useCurrentUser: () => ({
		setAgentHubConversation: mockSetAgentHubConversation,
	}),
}));

// Mock client
const mockListConvos = vi.fn().mockResolvedValue([]);
const mockCreateConvo = vi
	.fn()
	.mockResolvedValue({ id: 1, title: undefined, messages: [], createdAt: "", updatedAt: "" });
const mockGetConvo = vi.fn().mockResolvedValue({ id: 1, title: "Test", messages: [], createdAt: "", updatedAt: "" });
const mockDeleteConvo = vi.fn().mockResolvedValue(undefined);
const mockUpdateTitle = vi.fn().mockResolvedValue(undefined);
const mockSendMessage = vi.fn().mockResolvedValue(undefined);
const mockRetryMessage = vi.fn().mockResolvedValue(undefined);
const mockSeedConvo = vi.fn().mockResolvedValue(undefined);
const mockAdvanceConvo = vi.fn().mockResolvedValue(undefined);
const mockRespondToConfirmation = vi.fn().mockResolvedValue(undefined);
const mockSetMode = vi.fn().mockResolvedValue({ id: 1, metadata: { mode: "plan" } });

const mockAgentHub = {
	listConvos: mockListConvos,
	createConvo: mockCreateConvo,
	getConvo: mockGetConvo,
	deleteConvo: mockDeleteConvo,
	updateTitle: mockUpdateTitle,
	sendMessage: mockSendMessage,
	retryMessage: mockRetryMessage,
	seedConvo: mockSeedConvo,
	advanceConvo: mockAdvanceConvo,
	respondToConfirmation: mockRespondToConfirmation,
	setMode: mockSetMode,
};

vi.mock("../contexts/ClientContext", () => ({
	useClient: () => ({
		agentHub: () => mockAgentHub,
	}),
}));

describe("useAgentHub", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockListConvos.mockResolvedValue([]);
		mockCreateConvo.mockResolvedValue({ id: 1, title: undefined, messages: [], createdAt: "", updatedAt: "" });
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			createdAt: "",
			updatedAt: "",
		});
		mockSendMessage.mockResolvedValue(undefined);
		mockRetryMessage.mockResolvedValue(undefined);
		mockSeedConvo.mockResolvedValue(undefined);
		mockAdvanceConvo.mockResolvedValue(undefined);
		mockRespondToConfirmation.mockResolvedValue(undefined);
		mockSetMode.mockResolvedValue({ id: 1, metadata: { mode: "plan" } });
	});

	it("should initialize with empty state", async () => {
		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.convos).toEqual([]);
			expect(result.current.activeConvoId).toBeUndefined();
			expect(result.current.messages).toEqual([]);
			expect(result.current.message).toBe("");
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBeUndefined();
		});
	});

	it("should load conversations on mount", async () => {
		const mockConvos = [{ id: 1, title: "Test", updatedAt: "2026-02-11T10:00:00Z" }];
		mockListConvos.mockResolvedValue(mockConvos);

		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.convos).toEqual(mockConvos);
		});
	});

	it("should update message via setMessage", () => {
		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Hello");
		});

		expect(result.current.message).toBe("Hello");
	});

	it("should switch to a conversation", async () => {
		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(1);
		});

		expect(mockGetConvo).toHaveBeenCalledWith(1);
		expect(result.current.activeConvoId).toBe(1);
		expect(result.current.messages).toHaveLength(1);
		expect(mockSetAgentHubConversation).toHaveBeenCalledWith(1);
	});

	it("should reset state on newChat", async () => {
		const { result } = renderHook(() => useAgentHub());

		// First switch to a convo
		await act(async () => {
			await result.current.switchConvo(1);
		});

		// Then create new chat
		act(() => {
			result.current.newChat();
		});

		expect(result.current.activeConvoId).toBeUndefined();
		expect(result.current.messages).toEqual([]);
		expect(result.current.message).toBe("");
	});

	it("should delete a conversation", async () => {
		mockListConvos.mockResolvedValue([
			{ id: 1, title: "Chat 1", updatedAt: "2026-02-11T10:00:00Z" },
			{ id: 2, title: "Chat 2", updatedAt: "2026-02-11T09:00:00Z" },
		]);

		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.convos).toHaveLength(2);
		});

		await act(async () => {
			await result.current.deleteConvo(1);
		});

		expect(mockDeleteConvo).toHaveBeenCalledWith(1);
		expect(result.current.convos).toHaveLength(1);
		expect(result.current.convos[0].id).toBe(2);
	});

	it("should reset to new chat when active conversation is deleted", async () => {
		const { result } = renderHook(() => useAgentHub());

		// Switch to convo 1
		await act(async () => {
			await result.current.switchConvo(1);
		});

		expect(result.current.activeConvoId).toBe(1);

		// Delete the active convo
		await act(async () => {
			await result.current.deleteConvo(1);
		});

		expect(result.current.activeConvoId).toBeUndefined();
		expect(result.current.messages).toEqual([]);
	});

	it("should not send empty messages", async () => {
		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("   ");
		});

		await act(async () => {
			await result.current.send();
		});

		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it("should create a new convo and send message when no active convo", async () => {
		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Hello");
		});

		await act(async () => {
			await result.current.send();
		});

		expect(mockCreateConvo).toHaveBeenCalledWith("Hello");
		expect(mockSendMessage).toHaveBeenCalledWith(1, "Hello", expect.any(Object));
		expect(mockSetAgentHubConversation).toHaveBeenCalledWith(1);
	});

	it("should not set planPhase when creating a new exec mode convo", async () => {
		const { result } = renderHook(() => useAgentHub());

		expect(result.current.planPhase).toBeUndefined();

		act(() => {
			result.current.setMessage("Hello");
		});

		await act(async () => {
			await result.current.send();
		});

		await waitFor(() => {
			expect(result.current.planPhase).toBeUndefined();
			expect(result.current.mode).toBe("exec");
		});
	});

	it("should truncate long messages to 50 chars for the convo title", async () => {
		const { result } = renderHook(() => useAgentHub());
		const longMessage = "This is a very long message that exceeds fifty characters easily";

		act(() => {
			result.current.setMessage(longMessage);
		});

		await act(async () => {
			await result.current.send();
		});

		expect(mockCreateConvo).toHaveBeenCalledWith(`${longMessage.slice(0, 47)}...`);
	});

	it("should refresh conversation list even when send fails", async () => {
		mockSendMessage.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useAgentHub());

		// Clear the initial mount call to listConvos
		await waitFor(() => {
			expect(mockListConvos).toHaveBeenCalledTimes(1);
		});
		mockListConvos.mockClear();

		act(() => {
			result.current.setMessage("Hello");
		});

		await act(async () => {
			await result.current.send();
		});

		// loadConvos should be called in the finally block even after error
		expect(mockListConvos).toHaveBeenCalled();
	});

	it("should send message to existing convo", async () => {
		const { result } = renderHook(() => useAgentHub());

		// Switch to existing convo
		await act(async () => {
			await result.current.switchConvo(5);
		});

		mockSetAgentHubConversation.mockClear();

		act(() => {
			result.current.setMessage("Hello");
		});

		await act(async () => {
			await result.current.send();
		});

		expect(mockCreateConvo).not.toHaveBeenCalled();
		expect(mockSendMessage).toHaveBeenCalledWith(5, "Hello", expect.any(Object));
		// setAgentHubConversation is called again during send to reconfirm the active conversation
		expect(mockSetAgentHubConversation).toHaveBeenCalledWith(5);
	});

	it("should add user message optimistically when sending", async () => {
		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Hello");
		});

		// Start the send but don't await
		const sendPromise = act(() => {
			result.current.send();
		});

		// After send starts, message should be cleared and user message added
		await waitFor(() => {
			expect(result.current.message).toBe("");
		});

		await sendPromise;
	});

	it("should handle send error gracefully", async () => {
		mockSendMessage.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Hello");
		});

		await act(async () => {
			await result.current.send();
		});

		await waitFor(() => {
			expect(result.current.error).toBe("Failed to send message. Please try again.");
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("should handle listConvos error silently", async () => {
		mockListConvos.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.convos).toEqual([]);
		});
	});

	it("should handle switchConvo error by setting empty messages", async () => {
		mockGetConvo.mockRejectedValue(new Error("Not found"));

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(999);
		});

		expect(result.current.activeConvoId).toBe(999);
		expect(result.current.messages).toEqual([]);
	});

	it("should not send when already loading", async () => {
		// Make sendMessage hang forever (never resolves)
		mockSendMessage.mockImplementation(
			() =>
				new Promise(() => {
					/* intentionally never resolves */
				}),
		);

		const { result } = renderHook(() => useAgentHub());

		// Switch to existing convo so send() goes directly to sendMessage (no createConvo await)
		await act(async () => {
			await result.current.switchConvo(1);
		});

		act(() => {
			result.current.setMessage("Hello");
		});

		// Start first send — runs synchronously until await sendMessage (which never resolves)
		act(() => {
			result.current.send();
		});

		// sendMessage should have been called once
		expect(mockSendMessage).toHaveBeenCalledTimes(1);
		expect(result.current.isLoading).toBe(true);

		// Try to send again while loading
		act(() => {
			result.current.setMessage("World");
		});
		act(() => {
			result.current.send();
		});

		// sendMessage should still only have been called once
		expect(mockSendMessage).toHaveBeenCalledTimes(1);
	});

	it("should initialize pendingNavigation as undefined", async () => {
		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.pendingNavigation).toBeUndefined();
		});
	});

	it("should set pendingNavigation when onNavigationAction fires", async () => {
		mockSendMessage.mockImplementation(
			(_id: number, _message: string, callbacks: { onNavigationAction?: (action: unknown) => void }) => {
				callbacks?.onNavigationAction?.({ path: "/article-draft/42", label: "My Draft" });
			},
		);

		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Draft an article");
		});

		await act(async () => {
			await result.current.send();
		});

		await waitFor(() => {
			expect(result.current.pendingNavigation).toEqual({
				path: "/article-draft/42",
				label: "My Draft",
			});
		});
	});

	it("should not retry when no active convo", async () => {
		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.retry(2);
		});

		expect(mockRetryMessage).not.toHaveBeenCalled();
	});

	it("should not retry when already loading", async () => {
		// Make sendMessage hang forever
		mockSendMessage.mockImplementation(
			() =>
				new Promise(() => {
					/* intentionally never resolves */
				}),
		);

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(1);
		});

		act(() => {
			result.current.setMessage("Hello");
		});

		act(() => {
			result.current.send();
		});

		expect(result.current.isLoading).toBe(true);

		await act(async () => {
			await result.current.retry(2);
		});

		expect(mockRetryMessage).not.toHaveBeenCalled();
	});

	it("should retry and stream a new response", async () => {
		mockGetConvo.mockResolvedValue({
			id: 5,
			title: "Test",
			messages: [
				{ role: "assistant", content: "Intro", timestamp: "2026-02-11T10:00:00Z" },
				{ role: "user", content: "Help me", timestamp: "2026-02-11T10:00:01Z" },
				{ role: "assistant", content: "Old response", timestamp: "2026-02-11T10:00:02Z" },
			],
			createdAt: "",
			updatedAt: "",
		});

		mockRetryMessage.mockImplementation(
			(
				_id: number,
				_messageIndex: number,
				callbacks: { onComplete?: (msg: { content: string; timestamp: string }) => void },
			) => {
				callbacks?.onComplete?.({ content: "New response", timestamp: "2026-02-11T10:00:03Z" });
			},
		);

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(5);
		});

		expect(result.current.messages).toHaveLength(3);

		await act(async () => {
			// Retry from the last assistant message (index 2)
			await result.current.retry(2);
		});

		expect(mockRetryMessage).toHaveBeenCalledWith(5, 2, expect.any(Object));
		// After retry: messages should be intro + user + new assistant
		await waitFor(() => {
			expect(result.current.messages).toHaveLength(3);
			const lastMsg = result.current.messages[result.current.messages.length - 1];
			expect(lastMsg.role).toBe("assistant");
			if (lastMsg.role === "assistant") {
				expect(lastMsg.content).toBe("New response");
			}
		});
	});

	it("should retry from an earlier assistant message and truncate correctly", async () => {
		mockGetConvo.mockResolvedValue({
			id: 5,
			title: "Test",
			messages: [
				{ role: "assistant", content: "Intro", timestamp: "2026-02-11T10:00:00Z" },
				{ role: "user", content: "First question", timestamp: "2026-02-11T10:00:01Z" },
				{ role: "assistant", content: "First answer", timestamp: "2026-02-11T10:00:02Z" },
				{ role: "user", content: "Second question", timestamp: "2026-02-11T10:00:03Z" },
				{ role: "assistant", content: "Second answer", timestamp: "2026-02-11T10:00:04Z" },
			],
			createdAt: "",
			updatedAt: "",
		});

		mockRetryMessage.mockImplementation(
			(
				_id: number,
				_messageIndex: number,
				callbacks: { onComplete?: (msg: { content: string; timestamp: string }) => void },
			) => {
				callbacks?.onComplete?.({ content: "New first answer", timestamp: "2026-02-11T10:00:05Z" });
			},
		);

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(5);
		});

		expect(result.current.messages).toHaveLength(5);

		await act(async () => {
			// Retry from the first assistant answer (index 2)
			await result.current.retry(2);
		});

		expect(mockRetryMessage).toHaveBeenCalledWith(5, 2, expect.any(Object));
		// After retry: intro + first user + new assistant = 3 messages
		await waitFor(() => {
			expect(result.current.messages).toHaveLength(3);
			const lastMsg = result.current.messages[result.current.messages.length - 1];
			expect(lastMsg.role).toBe("assistant");
			if (lastMsg.role === "assistant") {
				expect(lastMsg.content).toBe("New first answer");
			}
		});
	});

	it("should handle retry error gracefully", async () => {
		mockGetConvo.mockResolvedValue({
			id: 5,
			title: "Test",
			messages: [
				{ role: "user", content: "Help me", timestamp: "2026-02-11T10:00:01Z" },
				{ role: "assistant", content: "Old response", timestamp: "2026-02-11T10:00:02Z" },
			],
			createdAt: "",
			updatedAt: "",
		});

		mockRetryMessage.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(5);
		});

		await act(async () => {
			await result.current.retry(1);
		});

		await waitFor(() => {
			expect(result.current.error).toBe("Failed to retry message. Please try again.");
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("should initialize plan state as undefined", async () => {
		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.plan).toBeUndefined();
			expect(result.current.planPhase).toBeUndefined();
		});
	});

	it("should load plan from convo metadata on switchConvo", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { plan: "# My Plan", planPhase: "executing" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(1);
		});

		expect(result.current.plan).toBe("# My Plan");
		expect(result.current.planPhase).toBe("executing");
	});

	it("should clear plan on switchConvo error", async () => {
		mockGetConvo.mockRejectedValue(new Error("Not found"));

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(999);
		});

		expect(result.current.plan).toBeUndefined();
		expect(result.current.planPhase).toBeUndefined();
	});

	it("should clear plan state on newChat", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [],
			metadata: { plan: "# Plan", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(1);
		});

		expect(result.current.plan).toBe("# Plan");

		act(() => {
			result.current.newChat();
		});

		expect(result.current.plan).toBeUndefined();
		expect(result.current.planPhase).toBeUndefined();
	});

	it("should set plan state when onPlanUpdate fires during send", async () => {
		mockSendMessage.mockImplementation(
			(_id: number, _message: string, callbacks: { onPlanUpdate?: (plan: string, phase: string) => void }) => {
				callbacks?.onPlanUpdate?.("# New Plan", "planning");
			},
		);

		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Create a plan");
		});

		await act(async () => {
			await result.current.send();
		});

		await waitFor(() => {
			expect(result.current.plan).toBe("# New Plan");
			expect(result.current.planPhase).toBe("planning");
		});
	});

	it("should set plan state when onPlanUpdate fires during retry", async () => {
		mockGetConvo.mockResolvedValue({
			id: 5,
			title: "Test",
			messages: [
				{ role: "user", content: "Help me", timestamp: "2026-02-11T10:00:01Z" },
				{ role: "assistant", content: "Old response", timestamp: "2026-02-11T10:00:02Z" },
			],
			metadata: null,
			createdAt: "",
			updatedAt: "",
		});

		mockRetryMessage.mockImplementation(
			(
				_id: number,
				_messageIndex: number,
				callbacks: {
					onPlanUpdate?: (plan: string, phase: string) => void;
					onComplete?: (msg: { content: string; timestamp: string }) => void;
				},
			) => {
				callbacks?.onPlanUpdate?.("# Retry Plan", "executing");
				callbacks?.onComplete?.({ content: "New response", timestamp: "2026-02-11T10:00:03Z" });
			},
		);

		const { result } = renderHook(() => useAgentHub());

		await act(async () => {
			await result.current.switchConvo(5);
		});

		await act(async () => {
			await result.current.retry(1);
		});

		await waitFor(() => {
			expect(result.current.plan).toBe("# Retry Plan");
			expect(result.current.planPhase).toBe("executing");
		});
	});

	it("should not update UI when streaming callbacks fire for a stale conversation", async () => {
		// Simulate: send on convo 1, then switch to convo 2 mid-stream.
		// The onChunk/onComplete/onPlanUpdate from convo 1 should be silently ignored.
		let capturedCallbacks: Record<string, (...args: Array<never>) => void> = {};

		mockSendMessage.mockImplementation(
			(_id: number, _message: string, callbacks: Record<string, (...args: Array<never>) => void>) => {
				// Capture callbacks but don't invoke them yet — we'll fire them after switching convos
				capturedCallbacks = callbacks;
			},
		);

		const { result } = renderHook(() => useAgentHub());

		// Switch to convo 1 first
		await act(async () => {
			await result.current.switchConvo(1);
		});

		act(() => {
			result.current.setMessage("Hello Chat A");
		});

		// Start sending — this captures the callbacks but doesn't resolve
		await act(async () => {
			await result.current.send();
		});

		// Now switch to convo 2 mid-stream
		mockGetConvo.mockResolvedValue({
			id: 2,
			title: "Chat B",
			messages: [{ role: "assistant", content: "Hi from B!", timestamp: "2026-02-11T10:00:00Z" }],
			createdAt: "",
			updatedAt: "",
		});
		await act(async () => {
			await result.current.switchConvo(2);
		});

		expect(result.current.activeConvoId).toBe(2);
		expect(result.current.messages).toHaveLength(1);
		expect(result.current.streamingContent).toBe("");

		// Now fire the stale callbacks from convo 1 — they should be ignored
		act(() => {
			capturedCallbacks.onChunk?.("stale chunk" as never);
			capturedCallbacks.onComplete?.({ content: "stale response", timestamp: "2026-02-11T10:01:00Z" } as never);
			capturedCallbacks.onPlanUpdate?.("# Stale Plan" as never, "executing" as never);
			capturedCallbacks.onNavigationAction?.({ path: "/stale", label: "Stale" } as never);
			capturedCallbacks.onError?.("stale error" as never);
		});

		// UI should still show convo 2's state, not convo 1's stale data
		expect(result.current.streamingContent).toBe("");
		expect(result.current.messages).toHaveLength(1);
		expect(result.current.messages[0].content).toBe("Hi from B!");
		expect(result.current.plan).toBeUndefined();
		expect(result.current.planPhase).toBeUndefined();
		expect(result.current.pendingNavigation).toBeUndefined();
		expect(result.current.error).toBeUndefined();
	});

	it("should clear pendingNavigation via clearPendingNavigation", async () => {
		mockSendMessage.mockImplementation(
			(_id: number, _message: string, callbacks: { onNavigationAction?: (action: unknown) => void }) => {
				callbacks?.onNavigationAction?.({ path: "/article-draft/1", label: "Test" });
			},
		);

		const { result } = renderHook(() => useAgentHub());

		act(() => {
			result.current.setMessage("Go");
		});

		await act(async () => {
			await result.current.send();
		});

		await waitFor(() => {
			expect(result.current.pendingNavigation).toBeDefined();
		});

		act(() => {
			result.current.clearPendingNavigation();
		});

		expect(result.current.pendingNavigation).toBeUndefined();
	});

	it("should auto-advance a freshly seeded convo", async () => {
		const seededConvo = {
			id: 10,
			title: "Getting Started with Jolli",
			messages: [{ role: "assistant", content: "Welcome!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { convoKind: "getting_started", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		};

		mockSeedConvo.mockResolvedValue(seededConvo);
		mockGetConvo.mockResolvedValue(seededConvo);

		renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(mockAdvanceConvo).toHaveBeenCalledWith(10, expect.any(Object));
		});
	});

	it("should not auto-advance when seeded convo already has multiple messages", async () => {
		const seededConvo = {
			id: 10,
			title: "Getting Started with Jolli",
			messages: [
				{ role: "assistant", content: "Welcome!", timestamp: "2026-02-11T10:00:00Z" },
				{ role: "assistant", content: "Already advanced.", timestamp: "2026-02-11T10:00:01Z" },
			],
			metadata: { convoKind: "getting_started", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		};

		mockSeedConvo.mockResolvedValue(seededConvo);
		mockGetConvo.mockResolvedValue(seededConvo);

		renderHook(() => useAgentHub());

		// Wait for seeding to complete
		await waitFor(() => {
			expect(mockSeedConvo).toHaveBeenCalled();
		});

		// advanceConvo should NOT have been called
		expect(mockAdvanceConvo).not.toHaveBeenCalled();
	});

	it("should handle auto-advance streaming callbacks", async () => {
		const seededConvo = {
			id: 10,
			title: "Getting Started with Jolli",
			messages: [{ role: "assistant", content: "Welcome!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { convoKind: "getting_started", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		};

		mockSeedConvo.mockResolvedValue(seededConvo);
		mockGetConvo.mockResolvedValue(seededConvo);

		// Mock advanceConvo to invoke streaming callbacks and return a promise
		mockAdvanceConvo.mockImplementation(
			(
				_id: number,
				callbacks: {
					onComplete?: (msg: { content: string; timestamp: string }) => void;
					onPlanUpdate?: (plan: string, phase: string) => void;
				},
			) => {
				callbacks?.onPlanUpdate?.("# Updated Plan", "planning");
				callbacks?.onComplete?.({ content: "GitHub is connected!", timestamp: "2026-02-11T10:00:01Z" });
				return Promise.resolve();
			},
		);

		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(mockAdvanceConvo).toHaveBeenCalled();
		});

		await waitFor(() => {
			expect(result.current.plan).toBe("# Updated Plan");
		});
	});

	it("should handle auto-advance error silently", async () => {
		const seededConvo = {
			id: 10,
			title: "Getting Started with Jolli",
			messages: [{ role: "assistant", content: "Welcome!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { convoKind: "getting_started", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		};

		mockSeedConvo.mockResolvedValue(seededConvo);
		mockGetConvo.mockResolvedValue(seededConvo);
		mockAdvanceConvo.mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(mockAdvanceConvo).toHaveBeenCalled();
		});

		// Should not have set an error — auto-advance errors are silent
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
	});

	// ─── Mode state ──────────────────────────────────────────────────────

	it("should initialize mode as undefined", async () => {
		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.mode).toBeUndefined();
		});
	});

	it("should initialize pendingConfirmations as empty", async () => {
		const { result } = renderHook(() => useAgentHub());

		await waitFor(() => {
			expect(result.current.pendingConfirmations).toEqual([]);
		});
	});

	it("should load mode from metadata on switchConvo", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { mode: "plan", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.switchConvo(1);
		});

		await waitFor(() => {
			expect(result.current.mode).toBe("plan");
		});
	});

	it("should set mode to exec when creating new convo via send", async () => {
		mockCreateConvo.mockResolvedValue({
			id: 5,
			title: "New convo",
			messages: [],
			createdAt: "",
			updatedAt: "",
		});
		mockSendMessage.mockResolvedValue(undefined);

		const { result } = renderHook(() => useAgentHub());

		// Set message first, then send
		act(() => {
			result.current.setMessage("Hello world");
		});

		await act(() => {
			result.current.send();
		});

		await waitFor(() => {
			expect(result.current.mode).toBe("exec");
		});
	});

	it("should reset mode and pendingConfirmations on newChat", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { mode: "plan", planPhase: "planning" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		// Switch to a convo to set mode
		await act(() => {
			result.current.switchConvo(1);
		});

		await waitFor(() => {
			expect(result.current.mode).toBe("plan");
		});

		// Now reset with newChat
		act(() => {
			result.current.newChat();
		});

		await waitFor(() => {
			expect(result.current.mode).toBeUndefined();
			expect(result.current.pendingConfirmations).toEqual([]);
		});
	});

	it("should clear pendingConfirmations on switchConvo", async () => {
		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.switchConvo(1);
		});

		await waitFor(() => {
			expect(result.current.pendingConfirmations).toEqual([]);
		});
	});

	// ─── Confirmation actions ────────────────────────────────────────────

	it("should call respondToConfirmation(true) on approveConfirmation", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { mode: "exec" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.switchConvo(1);
		});

		await act(() => {
			result.current.approveConfirmation("conf_123");
		});

		expect(mockRespondToConfirmation).toHaveBeenCalledWith(1, "conf_123", true);
	});

	it("should call respondToConfirmation(false) on denyConfirmation", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { mode: "exec" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.switchConvo(1);
		});

		await act(() => {
			result.current.denyConfirmation("conf_456");
		});

		expect(mockRespondToConfirmation).toHaveBeenCalledWith(1, "conf_456", false);
	});

	it("should not call respondToConfirmation when no active convo", async () => {
		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.approveConfirmation("conf_123");
		});

		expect(mockRespondToConfirmation).not.toHaveBeenCalled();
	});

	// ─── setMode ─────────────────────────────────────────────────────────

	it("should optimistically update mode and call agentHub.setMode", async () => {
		mockGetConvo.mockResolvedValue({
			id: 1,
			title: "Test",
			messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
			metadata: { mode: "exec" },
			createdAt: "",
			updatedAt: "",
		});

		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.switchConvo(1);
		});

		await act(() => {
			result.current.setMode("plan");
		});

		expect(mockSetMode).toHaveBeenCalledWith(1, "plan");
		await waitFor(() => {
			expect(result.current.mode).toBe("plan");
		});
	});

	it("should not call setMode when no active convo", async () => {
		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.setMode("plan");
		});

		expect(mockSetMode).not.toHaveBeenCalled();
	});

	it("should revert mode on setMode failure", async () => {
		mockSetMode.mockRejectedValueOnce(new Error("Network error"));
		mockGetConvo
			.mockResolvedValueOnce({
				id: 1,
				title: "Test",
				messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
				metadata: { mode: "exec" },
				createdAt: "",
				updatedAt: "",
			})
			.mockResolvedValueOnce({
				id: 1,
				title: "Test",
				messages: [{ role: "assistant", content: "Hello!", timestamp: "2026-02-11T10:00:00Z" }],
				metadata: { mode: "exec" },
				createdAt: "",
				updatedAt: "",
			});

		const { result } = renderHook(() => useAgentHub());

		await act(() => {
			result.current.switchConvo(1);
		});

		await act(() => {
			result.current.setMode("plan");
		});

		// After failure, should revert to the mode from re-fetched convo
		await waitFor(() => {
			expect(result.current.mode).toBe("exec");
		});
	});
});
