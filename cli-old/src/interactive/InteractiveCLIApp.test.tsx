/**
 * @vitest-environment jsdom
 */

import { InteractiveCLIApp } from "./InteractiveCLIApp";
import { render } from "@testing-library/react";
import type { Client } from "jolli-common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all context hooks
vi.mock("./contexts/SystemContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useSystemContext: vi.fn(),
		SystemProvider: MockProvider,
		SystemContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/ConvoContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useConvoContext: vi.fn(),
		ConvoProvider: MockProvider,
		ConvoContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/ChatContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useChatContext: vi.fn(),
		ChatProvider: MockProvider,
		ChatContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/ClientContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useClientContext: vi.fn(),
		ClientProvider: MockProvider,
		ClientContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/CommandContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useCommandContext: vi.fn(),
		CommandProvider: MockProvider,
		CommandContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/MessageInputContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useMessageInputContext: vi.fn(),
		MessageInputProvider: MockProvider,
		MessageInputContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/ExitContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useExitContext: vi.fn(),
		ExitProvider: MockProvider,
		ExitContext: {
			Provider: MockProvider,
		},
	};
});

vi.mock("./contexts/AdminContext", () => {
	const MockProvider = ({ children }: { children: React.ReactNode }) => children;
	return {
		useAdminContext: vi.fn(),
		AdminProvider: MockProvider,
		AdminContext: {
			Provider: MockProvider,
		},
	};
});

// Mock keyboard shortcuts hook (used by KeyboardShortcuts component in AppContext)
vi.mock("./hooks", () => ({
	useKeyboardShortcuts: vi.fn(),
}));

// Mock the getView function and views registry
vi.mock("./views", () => ({
	getView: vi.fn(),
	ViewContext: {},
}));

// Import the mocked context hooks
import { useChatContext } from "./contexts/ChatContext";
import { useConvoContext } from "./contexts/ConvoContext";
import { useMessageInputContext } from "./contexts/MessageInputContext";
import { useSystemContext } from "./contexts/SystemContext";
// Import the mocked keyboard shortcuts hook
import { useKeyboardShortcuts } from "./hooks";
import { getView } from "./views";

describe("InteractiveCLIApp", () => {
	const mockClient = {} as Client;
	const mockOnExit = vi.fn();
	const mockOnLogin = vi.fn();

	afterEach(() => {
		vi.clearAllMocks();
	});

	beforeEach(() => {
		// Mock keyboard shortcuts hook (used by KeyboardShortcuts component)
		vi.mocked(useKeyboardShortcuts).mockReturnValue(undefined);

		// Setup default context mock implementations (for InteractiveCLIApp component)
		vi.mocked(useSystemContext).mockReturnValue({
			systemMessage: null,
			setSystemMessage: vi.fn(),
			viewMode: "chat",
			setViewMode: vi.fn(),
		});

		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client: {} as never,
			sendMessage: vi.fn(),
		});

		vi.mocked(useConvoContext).mockReturnValue({
			convos: [],
			setConvos: vi.fn(),
			activeConvoId: undefined,
			setActiveConvoId: vi.fn(),
			currentTitle: "New Chat",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			setPendingResumeConvo: vi.fn(),
			pendingResumeConvo: null,
			handleResumeResponse: vi.fn(),
		});

		vi.mocked(useMessageInputContext).mockReturnValue({
			message: "",
			setMessage: vi.fn(),
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
		});

		// Mock getView to return a simple view
		vi.mocked(getView).mockReturnValue({
			name: "chat",
			component: () => <div data-testid="mock-view">Mock View</div>,
		});
	});

	it("should render without crashing", () => {
		const { container } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(container).toBeDefined();
	});

	it("should render the header with title", () => {
		const { getByText } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(getByText("Jolli Interactive")).toBeDefined();
	});

	it("should render the header with help text", () => {
		const { getByText } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(getByText("(Tab: Commands | Ctrl+L: Convos | Ctrl+C: Exit | /help)")).toBeDefined();
	});

	it("should render the current convo title", () => {
		vi.mocked(useConvoContext).mockReturnValue({
			convos: [],
			setConvos: vi.fn(),
			activeConvoId: 1,
			setActiveConvoId: vi.fn(),
			currentTitle: "My Conversation",
			handleNewConvo: vi.fn(),
			handleSwitchConvo: vi.fn(),
			reloadConvos: vi.fn().mockResolvedValue(undefined),
			setPendingResumeConvo: vi.fn(),
			pendingResumeConvo: null,
			handleResumeResponse: vi.fn(),
		});

		const { getByText } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(getByText("My Conversation")).toBeDefined();
	});

	it("should not render system message when null", () => {
		const { queryByText } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		// System message should not be in the output
		const text = queryByText(/^Test System Message$/);
		expect(text).toBeNull();
	});

	it("should render system message when set", () => {
		vi.mocked(useSystemContext).mockReturnValue({
			systemMessage: "Test System Message",
			setSystemMessage: vi.fn(),
			viewMode: "chat",
			setViewMode: vi.fn(),
		});

		const { getByText } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(getByText("Test System Message")).toBeDefined();
	});

	it("should render the current view when found", () => {
		vi.mocked(getView).mockReturnValue({
			name: "chat",
			component: () => <div data-testid="chat-view">Chat View</div>,
		});

		const { getByTestId } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(getByTestId("chat-view")).toBeDefined();
	});

	it("should render error message when view not found", () => {
		vi.mocked(getView).mockReturnValue(undefined);

		const { getByText } = render(
			<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />,
		);

		expect(getByText("Unknown view: chat")).toBeDefined();
	});

	it("should use viewMode from SystemContext to get the view", () => {
		vi.mocked(useSystemContext).mockReturnValue({
			systemMessage: null,
			setSystemMessage: vi.fn(),
			viewMode: "conversations",
			setViewMode: vi.fn(),
		});

		vi.mocked(getView).mockReturnValue({
			name: "conversations",
			component: () => <div data-testid="conversations-view">Conversations</div>,
		});

		render(<InteractiveCLIApp client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin} />);

		expect(getView).toHaveBeenCalledWith("conversations");
	});
});
