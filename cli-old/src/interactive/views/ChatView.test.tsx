/**
 * @vitest-environment jsdom
 */

import type { CommandDefinition } from "../commands/types";
import { chatView } from "./ChatView";
import { render } from "@testing-library/react";
import type { ChatMessage } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all context hooks
vi.mock("../contexts/ChatContext", () => ({
	useChatContext: vi.fn(),
	ChatProvider: ({ children }: { children: React.ReactNode }) => children,
	ChatContext: {},
}));

vi.mock("../contexts/MessageInputContext", () => ({
	useMessageInputContext: vi.fn(),
	MessageInputProvider: ({ children }: { children: React.ReactNode }) => children,
	MessageInputContext: {},
}));

vi.mock("../contexts/CommandContext", () => ({
	useCommandContext: vi.fn(),
	CommandProvider: ({ children }: { children: React.ReactNode }) => children,
	CommandContext: {},
}));

// Import the mocked context hooks
import { useChatContext } from "../contexts/ChatContext";
import { useCommandContext } from "../contexts/CommandContext";
import { useMessageInputContext } from "../contexts/MessageInputContext";

// Mock the MessageList component
vi.mock("../components/MessageList", () => ({
	MessageList: ({ messages, isLoading }: { messages: Array<ChatMessage>; isLoading: boolean }) => {
		return (
			<div data-testid="message-list">
				<div data-testid="messages-count">{messages.length}</div>
				<div data-testid="is-loading">{isLoading ? "true" : "false"}</div>
			</div>
		);
	},
}));

// Mock the InputBox component
vi.mock("../components/InputBox", () => ({
	InputBox: ({
		value,
		onChange,
		onSubmit,
		isLoading,
		hasCommandSuggestions,
	}: {
		value: string;
		onChange: (value: string) => void;
		onSubmit: () => void;
		isLoading: boolean;
		hasCommandSuggestions?: boolean;
	}) => {
		return (
			<div data-testid="input-box">
				<div data-testid="input-value">{value}</div>
				<div data-testid="input-loading">{isLoading ? "true" : "false"}</div>
				<div data-testid="has-suggestions">{hasCommandSuggestions ? "true" : "false"}</div>
				<button data-testid="change-btn" onClick={() => onChange("new value")} type="button">
					Change
				</button>
				<button data-testid="submit-btn" onClick={onSubmit} type="button">
					Submit
				</button>
			</div>
		);
	},
}));

// Mock the CommandSuggestions component
vi.mock("../components/CommandSuggestions", () => ({
	CommandSuggestions: ({
		commands,
		onSelect,
		onDismiss,
	}: {
		commands: Array<{ name: string; description: string }>;
		onSelect: (command: string) => void;
		onDismiss: () => void;
	}) => {
		if (commands.length === 0) {
			return null;
		}
		return (
			<div data-testid="command-suggestions">
				<div data-testid="commands-count">{commands.length}</div>
				{commands.map(cmd => (
					<div key={cmd.name} data-testid={`command-${cmd.name}`}>
						{cmd.name}
					</div>
				))}
				<button data-testid="select-btn" onClick={() => onSelect(commands[0].name)} type="button">
					Select
				</button>
				<button data-testid="dismiss-btn" onClick={onDismiss} type="button">
					Dismiss
				</button>
			</div>
		);
	},
}));

describe("ChatView", () => {
	const mockMessages: Array<ChatMessage> = [
		{ role: "user", content: "Hello" },
		{ role: "assistant", content: "Hi there" },
	];

	const mockCommandSuggestions: Array<CommandDefinition> = [
		{ name: "/help", description: "Show help information", handler: vi.fn() },
		{ name: "/exit", description: "Exit the application", handler: vi.fn() },
	];

	const ChatViewComponent = chatView.component;

	beforeEach(() => {
		// Setup default context mock implementations
		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "",
			setMessage: vi.fn(),
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: [],
			handleCommandSelect: vi.fn(),
		});
	});

	const renderChatView = () => {
		return render(<ChatViewComponent />);
	};

	it("should have correct name", () => {
		expect(chatView.name).toBe("chat");
	});

	it("should have a component function", () => {
		expect(chatView.component).toBeDefined();
		expect(typeof chatView.component).toBe("function");
	});

	it("should render MessageList with correct props", () => {
		vi.mocked(useChatContext).mockReturnValue({
			messages: mockMessages,
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("message-list")).toBeDefined();
		expect(getByTestId("messages-count").textContent).toBe("2");
		expect(getByTestId("is-loading").textContent).toBe("false");
	});

	it("should render MessageList with isLoading true", () => {
		vi.mocked(useChatContext).mockReturnValue({
			messages: mockMessages,
			setMessages: vi.fn(),
			isLoading: true,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("is-loading").textContent).toBe("true");
	});

	it("should render MessageList with empty messages array", () => {
		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("messages-count").textContent).toBe("0");
	});

	it("should render InputBox with correct props", () => {
		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "test message",
			setMessage: vi.fn(),
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("input-box")).toBeDefined();
		expect(getByTestId("input-value").textContent).toBe("test message");
		expect(getByTestId("input-loading").textContent).toBe("false");
	});

	it("should render InputBox with isLoading true", () => {
		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "test",
			setMessage: vi.fn(),
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: true,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("input-loading").textContent).toBe("true");
	});

	it("should call setMessage when InputBox onChange is invoked", () => {
		const mockSetMessage = vi.fn();

		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "",
			setMessage: mockSetMessage,
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		getByTestId("change-btn").click();

		expect(mockSetMessage).toHaveBeenCalledWith("new value");
		expect(mockSetMessage).toHaveBeenCalledTimes(1);
	});

	it("should call handleSend when InputBox onSubmit is invoked", () => {
		const mockHandleSend = vi.fn();

		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "",
			setMessage: vi.fn(),
			handleSend: mockHandleSend,
			handleCommand: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		getByTestId("submit-btn").click();

		expect(mockHandleSend).toHaveBeenCalled();
		expect(mockHandleSend).toHaveBeenCalledTimes(1);
	});

	it("should not render command suggestions when array is empty", () => {
		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: [],
			handleCommandSelect: vi.fn(),
		});

		const { queryByTestId } = renderChatView();

		expect(queryByTestId("command-suggestions")).toBeNull();
	});

	it("should render command suggestions when array has items", () => {
		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: mockCommandSuggestions,
			handleCommandSelect: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("command-suggestions")).toBeDefined();
		expect(getByTestId("commands-count").textContent).toBe("2");
		expect(getByTestId("command-/help")).toBeDefined();
		expect(getByTestId("command-/exit")).toBeDefined();
	});

	it("should render multiple command suggestions", () => {
		const commands: Array<CommandDefinition> = [
			...mockCommandSuggestions,
			{ name: "/clear", description: "Clear the screen", handler: vi.fn() },
		];

		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: commands,
			handleCommandSelect: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("commands-count").textContent).toBe("3");
		expect(getByTestId("command-/help")).toBeDefined();
		expect(getByTestId("command-/exit")).toBeDefined();
		expect(getByTestId("command-/clear")).toBeDefined();
	});

	it("should render with all props set", () => {
		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "current message",
			setMessage: vi.fn(),
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		vi.mocked(useChatContext).mockReturnValue({
			messages: mockMessages,
			setMessages: vi.fn(),
			isLoading: true,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: mockCommandSuggestions,
			handleCommandSelect: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("message-list")).toBeDefined();
		expect(getByTestId("input-box")).toBeDefined();
		expect(getByTestId("command-suggestions")).toBeDefined();
	});

	it("should call setMessage('') when onDismiss is invoked", () => {
		const mockSetMessage = vi.fn();

		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "",
			setMessage: mockSetMessage,
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: mockCommandSuggestions,
			handleCommandSelect: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		getByTestId("dismiss-btn").click();

		expect(mockSetMessage).toHaveBeenCalledWith("");
		expect(mockSetMessage).toHaveBeenCalledTimes(1);
	});

	it("should call handleCommandSelect when command is selected", () => {
		const mockHandleCommandSelect = vi.fn();

		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: mockCommandSuggestions,
			handleCommandSelect: mockHandleCommandSelect,
		});

		const { getByTestId } = renderChatView();

		getByTestId("select-btn").click();

		expect(mockHandleCommandSelect).toHaveBeenCalledWith("/help");
		expect(mockHandleCommandSelect).toHaveBeenCalledTimes(1);
	});

	it("should pass hasCommandSuggestions=true to InputBox when there are suggestions", () => {
		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: mockCommandSuggestions,
			handleCommandSelect: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("has-suggestions").textContent).toBe("true");
	});

	it("should pass hasCommandSuggestions=false to InputBox when there are no suggestions", () => {
		vi.mocked(useCommandContext).mockReturnValue({
			commandSuggestions: [],
			handleCommandSelect: vi.fn(),
		});

		const { getByTestId } = renderChatView();

		expect(getByTestId("has-suggestions").textContent).toBe("false");
	});
});
