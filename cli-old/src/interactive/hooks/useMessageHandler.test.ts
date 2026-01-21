/**
 * @vitest-environment jsdom
 */
import { useMessageHandler } from "./useMessageHandler";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the commands module
vi.mock("../commands", () => ({
	executeCommand: vi.fn(),
}));

const commands = await import("../commands");
const mockExecuteCommand = vi.mocked(commands.executeCommand);

describe("useMessageHandler", () => {
	const createMockParams = () => {
		return {
			message: "",
			setMessage: vi.fn(),
			chatMessages: {
				messages: [],
				setMessages: vi.fn(),
				isLoading: false,
				setIsLoading: vi.fn(),
				sendMessage: vi.fn().mockResolvedValue(undefined),
			},
			convos: {
				convos: [],
				setConvos: vi.fn(),
				activeConvoId: undefined,
				setActiveConvoId: vi.fn(),
				currentTitle: "New Conversation",
				handleNewConvo: vi.fn(),
				handleSwitchConvo: vi.fn(),
				reloadConvos: vi.fn(),
				loadInitialConvos: vi.fn(),
			},
			resume: {
				pendingResumeConvo: null,
				setPendingResumeConvo: vi.fn(),
				handleResumeResponse: vi.fn().mockResolvedValue(false),
			},
			exitHandler: {
				shouldExit: false,
				setShouldExit: vi.fn(),
				isMountedRef: { current: true },
				abortControllerRef: { current: null },
			},
			setSystemMessage: vi.fn(),
			setViewMode: vi.fn(),
			onLogin: vi.fn().mockResolvedValue(undefined),
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should not send empty messages", async () => {
		const params = createMockParams();
		params.message = "   "; // Whitespace only
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
		expect(params.setMessage).not.toHaveBeenCalled();
	});

	it("should not send when isLoading is true", async () => {
		const params = createMockParams();
		params.message = "Hello";
		params.chatMessages.isLoading = true;
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
		expect(params.setMessage).not.toHaveBeenCalled();
	});

	it("should handle 'exit' command (without slash)", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "exit";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.setMessage).toHaveBeenCalledWith("");
		expect(mockExecuteCommand).toHaveBeenCalledWith("/exit", expect.any(Object));
		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
	});

	it("should handle 'EXIT' command (case insensitive)", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "EXIT";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(mockExecuteCommand).toHaveBeenCalledWith("/exit", expect.any(Object));
	});

	it("should handle 'clear' command (without slash)", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "clear";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.setMessage).toHaveBeenCalledWith("");
		expect(mockExecuteCommand).toHaveBeenCalledWith("/clear", expect.any(Object));
		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
	});

	it("should handle 'CLEAR' command (case insensitive)", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "CLEAR";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(mockExecuteCommand).toHaveBeenCalledWith("/clear", expect.any(Object));
	});

	it("should handle slash commands", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "/help";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.setMessage).toHaveBeenCalledWith("");
		expect(mockExecuteCommand).toHaveBeenCalledWith("/help", expect.any(Object));
		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
	});

	it("should show error for unknown commands", async () => {
		mockExecuteCommand.mockResolvedValue(false);
		const params = createMockParams();
		params.message = "/unknown";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.setSystemMessage).toHaveBeenCalledWith(
			"Unknown command: /unknown. Type /help to see available commands.",
		);
	});

	it("should create proper CommandContext for commands", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "/help";
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(mockExecuteCommand).toHaveBeenCalledWith("/help", {
			setMessages: params.chatMessages.setMessages,
			setSystemMessage: params.setSystemMessage,
			setShouldExit: params.exitHandler.setShouldExit,
			setViewMode: params.setViewMode,
			onLogin: params.onLogin,
			reloadConvos: params.convos.reloadConvos,
			isMountedRef: params.exitHandler.isMountedRef,
		});
	});

	it("should handle resume convo response", async () => {
		const params = createMockParams();
		params.message = "yes";
		params.resume.handleResumeResponse = vi.fn().mockResolvedValue(true); // Resume handled
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.setMessage).toHaveBeenCalledWith("");
		expect(params.resume.handleResumeResponse).toHaveBeenCalledWith(
			"yes",
			params.chatMessages.setMessages,
			params.convos.setActiveConvoId,
			params.setSystemMessage,
		);
		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
	});

	it("should send chat message when not a command or resume response", async () => {
		const params = createMockParams();
		params.message = "Hello world";
		params.resume.handleResumeResponse = vi.fn().mockResolvedValue(false); // Not resume
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.setMessage).toHaveBeenCalledWith("");
		expect(params.chatMessages.sendMessage).toHaveBeenCalledWith({
			userMessage: "Hello world",
			activeConvoId: params.convos.activeConvoId,
			setActiveConvoId: params.convos.setActiveConvoId,
			reloadConvos: params.convos.reloadConvos,
			abortControllerRef: params.exitHandler.abortControllerRef,
			isMountedRef: params.exitHandler.isMountedRef,
		});
	});

	it("should trim message before processing", async () => {
		const params = createMockParams();
		params.message = "  Hello world  ";
		params.resume.handleResumeResponse = vi.fn().mockResolvedValue(false);
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		expect(params.chatMessages.sendMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				userMessage: "Hello world",
			}),
		);
	});

	it("should clear message input before processing", async () => {
		const params = createMockParams();
		params.message = "Hello";
		params.resume.handleResumeResponse = vi.fn().mockResolvedValue(false);
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		// setMessage should be called with empty string immediately
		expect(params.setMessage).toHaveBeenCalledWith("");
		expect(params.setMessage.mock.invocationCallOrder[0]).toBeLessThan(
			params.chatMessages.sendMessage.mock.invocationCallOrder[0],
		);
	});

	it("should prioritize exit/clear over other processing", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "exit";
		params.resume.handleResumeResponse = vi.fn().mockResolvedValue(true);
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		// Should execute exit command, not call resume handler
		expect(mockExecuteCommand).toHaveBeenCalledWith("/exit", expect.any(Object));
		expect(params.resume.handleResumeResponse).not.toHaveBeenCalled();
		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
	});

	it("should prioritize slash commands over resume response", async () => {
		mockExecuteCommand.mockResolvedValue(true);
		const params = createMockParams();
		params.message = "/help";
		params.resume.handleResumeResponse = vi.fn().mockResolvedValue(true);
		const { result } = renderHook(() => useMessageHandler(params));

		await result.current.handleSend();

		// Should execute command, not call resume handler
		expect(mockExecuteCommand).toHaveBeenCalledWith("/help", expect.any(Object));
		expect(params.resume.handleResumeResponse).not.toHaveBeenCalled();
		expect(params.chatMessages.sendMessage).not.toHaveBeenCalled();
	});
});
