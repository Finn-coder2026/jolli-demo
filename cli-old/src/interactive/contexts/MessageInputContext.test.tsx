/**
 * @vitest-environment jsdom
 */
import { MessageInputContext, MessageInputProvider, useMessageInputContext } from "./MessageInputContext";
import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependent contexts
vi.mock("./ChatContext", () => ({
	useChatContext: vi.fn(),
}));

vi.mock("./ConvoContext", () => ({
	useConvoContext: vi.fn(),
}));

vi.mock("./ExitContext", () => ({
	useExitContext: vi.fn(),
}));

vi.mock("./SystemContext", () => ({
	useSystemContext: vi.fn(),
}));

// Import mocked hooks
import { useChatContext } from "./ChatContext";
import { useConvoContext } from "./ConvoContext";
import { useExitContext } from "./ExitContext";
import { useSystemContext } from "./SystemContext";

describe("MessageInputContext", () => {
	beforeEach(() => {
		// Mock ChatContext
		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		// Mock ConvoContext
		vi.mocked(useConvoContext).mockReturnValue({
			convos: [],
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn(),
			pendingResumeConvo: null,
			setPendingResumeConvo: vi.fn(),
			handleResumeResponse: vi.fn(),
		});

		// Mock ExitContext
		vi.mocked(useExitContext).mockReturnValue({
			shouldExit: false,
			setShouldExit: vi.fn(),
			isMountedRef: { current: true },
			abortControllerRef: { current: null },
		});

		// Mock SystemContext
		vi.mocked(useSystemContext).mockReturnValue({
			viewMode: "chat",
			setViewMode: vi.fn(),
			systemMessage: null,
			setSystemMessage: vi.fn(),
		});
	});

	describe("useMessageInputContext", () => {
		it("should throw error when used outside MessageInputProvider", () => {
			const TestComponent = () => {
				expect(() => useMessageInputContext()).toThrow(
					"useMessageInputContext must be used within a MessageInputProvider",
				);
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside MessageInputProvider via Context.Provider", () => {
			const mockHandleSend = vi.fn();
			const mockHandleCommand = vi.fn();

			const TestComponent = () => {
				const context = useMessageInputContext();
				expect(context).toBeDefined();
				expect(context.message).toBe("test message");
				expect(context.setMessage).toBeDefined();
				expect(context.handleSend).toBe(mockHandleSend);
				expect(context.handleCommand).toBe(mockHandleCommand);
				return <div>Test</div>;
			};

			render(
				<MessageInputContext.Provider
					value={{
						message: "test message",
						setMessage: vi.fn(),
						handleSend: mockHandleSend,
						handleCommand: mockHandleCommand,
					}}
				>
					<TestComponent />
				</MessageInputContext.Provider>,
			);
		});

		it("should initialize with empty message when using MessageInputProvider", () => {
			const mockOnLogin = vi.fn();

			const TestComponent = () => {
				const { message } = useMessageInputContext();
				expect(message).toBe("");
				return <div>Test</div>;
			};

			render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);
		});

		it("should provide setMessage function", () => {
			const mockOnLogin = vi.fn();

			const TestComponent = () => {
				const { setMessage } = useMessageInputContext();
				expect(setMessage).toBeDefined();
				expect(typeof setMessage).toBe("function");
				return <div>Test</div>;
			};

			render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);
		});

		it("should provide handleSend function", () => {
			const mockOnLogin = vi.fn();

			const TestComponent = () => {
				const { handleSend } = useMessageInputContext();
				expect(handleSend).toBeDefined();
				expect(typeof handleSend).toBe("function");
				return <div>Test</div>;
			};

			render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);
		});

		it("should provide handleCommand function", () => {
			const mockOnLogin = vi.fn();

			const TestComponent = () => {
				const { handleCommand } = useMessageInputContext();
				expect(handleCommand).toBeDefined();
				expect(typeof handleCommand).toBe("function");
				return <div>Test</div>;
			};

			render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);
		});

		it("should handle sending a regular message", async () => {
			const mockSendMessage = vi.fn();
			const mockHandleResumeResponse = vi.fn().mockResolvedValue(false);
			const mockOnLogin = vi.fn();

			vi.mocked(useChatContext).mockReturnValue({
				messages: [],
				setMessages: vi.fn(),
				isLoading: false,
				setIsLoading: vi.fn(),
				client: {} as never,
				sendMessage: mockSendMessage,
			});

			vi.mocked(useConvoContext).mockReturnValue({
				convos: [],
				setConvos: vi.fn(),
				activeConvoId: undefined,
				setActiveConvoId: vi.fn(),
				currentTitle: "New Chat",
				handleNewConvo: vi.fn(),
				handleSwitchConvo: vi.fn(),
				reloadConvos: vi.fn(),
				pendingResumeConvo: null,
				setPendingResumeConvo: vi.fn(),
				handleResumeResponse: mockHandleResumeResponse,
			});

			const TestComponent = () => {
				const { message, setMessage, handleSend } = useMessageInputContext();
				// Use useEffect to wait for state update
				const [mounted, setMounted] = React.useState(false);

				React.useEffect(() => {
					if (mounted && message === "test message") {
						handleSend();
					}
				}, [message, mounted, handleSend]);

				return (
					<button
						type="button"
						onClick={() => {
							setMessage("test message");
							setMounted(true);
						}}
					>
						Send
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Send").click();

			// Wait for async operations
			await vi.waitFor(() => {
				expect(mockHandleResumeResponse).toHaveBeenCalledWith("test message");
			});
		});

		it("should handle exit command without slash", async () => {
			const mockSetShouldExit = vi.fn();
			const mockOnLogin = vi.fn();

			vi.mocked(useExitContext).mockReturnValue({
				shouldExit: false,
				setShouldExit: mockSetShouldExit,
				isMountedRef: { current: true },
				abortControllerRef: { current: null },
			});

			const TestComponent = () => {
				const { message, setMessage, handleSend } = useMessageInputContext();
				const [mounted, setMounted] = React.useState(false);

				React.useEffect(() => {
					if (mounted && message === "exit") {
						handleSend();
					}
				}, [message, mounted, handleSend]);

				return (
					<button
						type="button"
						onClick={() => {
							setMessage("exit");
							setMounted(true);
						}}
					>
						Exit
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Exit").click();

			await vi.waitFor(() => {
				expect(mockSetShouldExit).toHaveBeenCalledWith(true);
			});
		});

		it("should handle clear command without slash", async () => {
			const mockSetMessages = vi.fn();
			const mockOnLogin = vi.fn();

			vi.mocked(useChatContext).mockReturnValue({
				messages: [],
				setMessages: mockSetMessages,
				isLoading: false,
				setIsLoading: vi.fn(),
				client: {} as never,
				sendMessage: vi.fn(),
			});

			const TestComponent = () => {
				const { message, setMessage, handleSend } = useMessageInputContext();
				const [mounted, setMounted] = React.useState(false);

				React.useEffect(() => {
					if (mounted && message === "clear") {
						handleSend();
					}
				}, [message, mounted, handleSend]);

				return (
					<button
						type="button"
						onClick={() => {
							setMessage("clear");
							setMounted(true);
						}}
					>
						Clear
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Clear").click();

			await vi.waitFor(() => {
				expect(mockSetMessages).toHaveBeenCalledWith([]);
			});
		});

		it("should handle slash commands", async () => {
			const mockSetMessages = vi.fn();
			const mockOnLogin = vi.fn();

			vi.mocked(useChatContext).mockReturnValue({
				messages: [],
				setMessages: mockSetMessages,
				isLoading: false,
				setIsLoading: vi.fn(),
				client: {} as never,
				sendMessage: vi.fn(),
			});

			const TestComponent = () => {
				const { message, setMessage, handleSend } = useMessageInputContext();
				const [mounted, setMounted] = React.useState(false);

				React.useEffect(() => {
					if (mounted && message === "/clear") {
						handleSend();
					}
				}, [message, mounted, handleSend]);

				return (
					<button
						type="button"
						onClick={() => {
							setMessage("/clear");
							setMounted(true);
						}}
					>
						Command
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Command").click();

			await vi.waitFor(() => {
				expect(mockSetMessages).toHaveBeenCalledWith([]);
			});
		});

		it("should handle unknown commands by showing error message", async () => {
			const mockSetSystemMessage = vi.fn();
			const mockOnLogin = vi.fn();

			vi.mocked(useSystemContext).mockReturnValue({
				viewMode: "chat",
				setViewMode: vi.fn(),
				systemMessage: null,
				setSystemMessage: mockSetSystemMessage,
			});

			const TestComponent = () => {
				const { handleCommand } = useMessageInputContext();
				return (
					<button type="button" onClick={() => handleCommand("/unknown")}>
						Unknown
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Unknown").click();

			await vi.waitFor(() => {
				expect(mockSetSystemMessage).toHaveBeenCalledWith(
					"Unknown command: /unknown. Type /help to see available commands.",
				);
			});
		});

		it("should not send message when empty or loading", async () => {
			const mockSendMessage = vi.fn();
			const mockOnLogin = vi.fn();

			vi.mocked(useChatContext).mockReturnValue({
				messages: [],
				setMessages: vi.fn(),
				isLoading: false,
				setIsLoading: vi.fn(),
				client: {} as never,
				sendMessage: mockSendMessage,
			});

			const TestComponent = () => {
				const { handleSend } = useMessageInputContext();
				return (
					<button type="button" onClick={() => handleSend()}>
						Send Empty
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Send Empty").click();

			// Wait a bit to ensure no async operations happen
			await new Promise(resolve => setTimeout(resolve, 100));

			expect(mockSendMessage).not.toHaveBeenCalled();
		});

		it("should handle resume convo prompts", async () => {
			const mockSendMessage = vi.fn();
			const mockHandleResumeResponse = vi.fn().mockResolvedValue(true); // Returns true to indicate it was handled
			const mockOnLogin = vi.fn();

			vi.mocked(useChatContext).mockReturnValue({
				messages: [],
				setMessages: vi.fn(),
				isLoading: false,
				setIsLoading: vi.fn(),
				client: {} as never,
				sendMessage: mockSendMessage,
			});

			vi.mocked(useConvoContext).mockReturnValue({
				convos: [],
				setConvos: vi.fn(),
				activeConvoId: undefined,
				setActiveConvoId: vi.fn(),
				currentTitle: "New Chat",
				handleNewConvo: vi.fn(),
				handleSwitchConvo: vi.fn(),
				reloadConvos: vi.fn(),
				pendingResumeConvo: null,
				setPendingResumeConvo: vi.fn(),
				handleResumeResponse: mockHandleResumeResponse,
			});

			const TestComponent = () => {
				const { message, setMessage, handleSend } = useMessageInputContext();
				const [mounted, setMounted] = React.useState(false);

				React.useEffect(() => {
					if (mounted && message === "resume message") {
						handleSend();
					}
				}, [message, mounted, handleSend]);

				return (
					<button
						type="button"
						onClick={() => {
							setMessage("resume message");
							setMounted(true);
						}}
					>
						Resume
					</button>
				);
			};

			const { getByText } = render(
				<MessageInputProvider onLogin={mockOnLogin}>
					<TestComponent />
				</MessageInputProvider>,
			);

			getByText("Resume").click();

			// Wait for async operations
			await vi.waitFor(() => {
				expect(mockHandleResumeResponse).toHaveBeenCalledWith("resume message");
			});

			// sendMessage should NOT be called because handleResumeResponse handled it
			expect(mockSendMessage).not.toHaveBeenCalled();
		});
	});
});
