/**
 * @vitest-environment jsdom
 */

import { AppProvider } from "./AppContext";
import { renderHook } from "@testing-library/react";
import type { Client } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Create mock functions at module level
const mockSetMessage = vi.fn();
const mockSetViewMode = vi.fn();

// Mock all context providers and hooks
vi.mock("./SystemContext", () => ({
	useSystemContext: vi.fn(),
	SystemProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./ChatContext", () => ({
	useChatContext: vi.fn(),
	ChatProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./MessageInputContext", () => ({
	useMessageInputContext: vi.fn(),
	MessageInputProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./ConvoContext", () => ({
	useConvoContext: vi.fn(),
	ConvoProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./ClientContext", () => ({
	useClientContext: vi.fn(),
	ClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./AdminContext", () => ({
	useAdminContext: vi.fn(),
	AdminProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./CommandContext", () => ({
	CommandProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./ExitContext", () => ({
	ExitProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../hooks", () => ({
	useKeyboardShortcuts: vi.fn(),
}));

import { useKeyboardShortcuts } from "../hooks";
// Import the mocked hooks
import { useChatContext } from "./ChatContext";
import { useConvoContext } from "./ConvoContext";
import { useMessageInputContext } from "./MessageInputContext";
import { useSystemContext } from "./SystemContext";

describe("AppProvider", () => {
	const mockClient = {} as Client;
	const mockOnExit = vi.fn();
	const mockOnLogin = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup default mock return values
		vi.mocked(useSystemContext).mockReturnValue({
			viewMode: "chat",
			setViewMode: mockSetViewMode,
			systemMessage: null,
			setSystemMessage: vi.fn(),
		});

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
			setMessage: mockSetMessage,
			handleSend: vi.fn(),
			handleCommand: vi.fn(),
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
			setPendingResumeConvo: vi.fn(),
			pendingResumeConvo: null,
			handleResumeResponse: vi.fn(),
		});
	});

	it("should call useKeyboardShortcuts with clearLastChar callback", () => {
		renderHook(() => <div>Test</div>, {
			wrapper: ({ children }) => (
				<AppProvider client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin}>
					{children}
				</AppProvider>
			),
		});

		// Verify useKeyboardShortcuts was called
		expect(useKeyboardShortcuts).toHaveBeenCalled();

		// Get the clearLastChar callback passed to useKeyboardShortcuts
		const clearLastChar = vi.mocked(useKeyboardShortcuts).mock.calls[0][3];
		expect(clearLastChar).toBeDefined();

		// Test clearLastChar with a matching character
		clearLastChar?.("l");
		expect(mockSetMessage).toHaveBeenCalledWith(expect.any(Function));

		// Test the updater function when input ends with "l"
		const updater = mockSetMessage.mock.calls[0][0] as (prev: string) => string;
		expect(updater("hello world l")).toBe("hello world ");

		// Test the updater function when input doesn't end with the char
		expect(updater("hello world")).toBe("hello world");
	});

	it("should pass correct parameters to useKeyboardShortcuts", () => {
		renderHook(() => <div>Test</div>, {
			wrapper: ({ children }) => (
				<AppProvider client={mockClient} onExit={mockOnExit} onLogin={mockOnLogin}>
					{children}
				</AppProvider>
			),
		});

		// Verify useKeyboardShortcuts was called with correct params
		expect(useKeyboardShortcuts).toHaveBeenCalledWith("chat", mockSetViewMode, false, expect.any(Function));
	});
});
