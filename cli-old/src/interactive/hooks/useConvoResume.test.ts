/**
 * @vitest-environment jsdom
 */
import { useConvoResume } from "./useConvoResume";
import { renderHook, waitFor } from "@testing-library/react";
import type { Convo } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Config module
vi.mock("../../util/Config", () => ({
	saveActiveConvoId: vi.fn(),
}));

const Config = await import("../../util/Config");
const mockSaveActiveConvoId = vi.mocked(Config.saveActiveConvoId);

describe("useConvoResume", () => {
	beforeEach(() => {
		// Reset mocks before each test
		mockSaveActiveConvoId.mockResolvedValue(undefined);
	});
	const mockConversation: Convo = {
		id: 1,
		userId: 1,
		visitorId: undefined,
		title: "Test Conversation",
		messages: [
			{
				role: "user",
				content:
					"This is a long message that will be truncated for preview purposes because it exceeds the character limit that we set for preview display",
			},
		],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	it("should initialize with null pendingResumeConvo", () => {
		const { result } = renderHook(() => useConvoResume());

		expect(result.current.pendingResumeConvo).toBeNull();
	});

	it("should return false when no pending conversation", async () => {
		const { result } = renderHook(() => useConvoResume());

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse(
			"yes",
			setMessages,
			setActiveConvoId,
			setSystemMessage,
		);

		expect(handled).toBe(false);
		expect(setMessages).not.toHaveBeenCalled();
		expect(setActiveConvoId).not.toHaveBeenCalled();
		expect(setSystemMessage).not.toHaveBeenCalled();
	});

	it("should handle 'yes' response and resume conversation", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse(
			"yes",
			setMessages,
			setActiveConvoId,
			setSystemMessage,
		);

		expect(handled).toBe(true);
		expect(setActiveConvoId).toHaveBeenCalledWith(mockConversation.id);
		expect(setMessages).toHaveBeenCalledWith(mockConversation.messages);
		expect(setSystemMessage).toHaveBeenCalledWith(null);
		await waitFor(() => {
			expect(result.current.pendingResumeConvo).toBeNull();
		});
	});

	it("should handle 'y' response (short form) and resume conversation", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse("y", setMessages, setActiveConvoId, setSystemMessage);

		expect(handled).toBe(true);
		expect(setActiveConvoId).toHaveBeenCalledWith(mockConversation.id);
	});

	it("should handle 'YES' response (uppercase)", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse(
			"YES",
			setMessages,
			setActiveConvoId,
			setSystemMessage,
		);

		expect(handled).toBe(true);
		expect(setActiveConvoId).toHaveBeenCalledWith(mockConversation.id);
	});

	it("should handle 'no' response and start fresh", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse(
			"no",
			setMessages,
			setActiveConvoId,
			setSystemMessage,
		);

		expect(handled).toBe(true);
		expect(setSystemMessage).toHaveBeenCalledWith(null);
		await waitFor(() => {
			expect(result.current.pendingResumeConvo).toBeNull();
		});
		expect(setMessages).not.toHaveBeenCalled();
		expect(setActiveConvoId).not.toHaveBeenCalled();
	});

	it("should handle 'n' response (short form)", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse("n", setMessages, setActiveConvoId, setSystemMessage);

		expect(handled).toBe(true);
		expect(setSystemMessage).toHaveBeenCalledWith(null);
		expect(mockSaveActiveConvoId).toHaveBeenCalledWith(undefined);
	});

	it("should handle 'NO' response (uppercase)", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse(
			"NO",
			setMessages,
			setActiveConvoId,
			setSystemMessage,
		);

		expect(handled).toBe(true);
		expect(setSystemMessage).toHaveBeenCalledWith(null);
	});

	it("should handle invalid response and ask again", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		const handled = await result.current.handleResumeResponse(
			"maybe",
			setMessages,
			setActiveConvoId,
			setSystemMessage,
		);

		expect(handled).toBe(true);
		expect(setSystemMessage).toHaveBeenCalledWith(expect.stringContaining("Please type 'yes' or 'no'"));
		expect(result.current.pendingResumeConvo).not.toBeNull();
		expect(setMessages).not.toHaveBeenCalled();
		expect(setActiveConvoId).not.toHaveBeenCalled();
	});

	it("should truncate long messages in invalid response prompt", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		await result.current.handleResumeResponse("invalid", setMessages, setActiveConvoId, setSystemMessage);

		const systemMessageCall = setSystemMessage.mock.calls[0][0] as string;
		expect(systemMessageCall).toContain("...");
		const firstMsg = mockConversation.messages[0];
		if (firstMsg && (firstMsg.role === "user" || firstMsg.role === "assistant" || firstMsg.role === "system")) {
			expect(systemMessageCall.length).toBeLessThan(firstMsg.content.length + 100);
		}
	});

	it("should truncate long messages in resume prompt", async () => {
		const { result } = renderHook(() => useConvoResume());

		result.current.setPendingResumeConvo(mockConversation);
		await waitFor(() => expect(result.current.pendingResumeConvo).toBe(mockConversation));

		const setMessages = vi.fn();
		const setActiveConvoId = vi.fn();
		const setSystemMessage = vi.fn();

		await result.current.handleResumeResponse("invalid", setMessages, setActiveConvoId, setSystemMessage);

		const systemMessageCall = setSystemMessage.mock.calls[0][0] as string;
		expect(systemMessageCall).toContain("...");
		expect(systemMessageCall).toContain("Please type 'yes' or 'no'");
	});
});
