/**
 * @vitest-environment jsdom
 */

import { mockClient } from "../../test-utils/Client.mock";
import { ConvoProvider, useConvoContext } from "./ConvoContext";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock ChatContext
vi.mock("./ChatContext", () => ({
	useChatContext: vi.fn(),
}));

// Mock SystemContext
vi.mock("./SystemContext", () => ({
	useSystemContext: vi.fn(),
}));

// Import mocked hooks
import { useChatContext } from "./ChatContext";
import { useSystemContext } from "./SystemContext";

describe("ConvoContext", () => {
	const client = mockClient();
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		// Suppress console.error during tests to avoid stderr in CI
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Intentionally empty to suppress error output
		});

		// Mock ChatContext
		vi.mocked(useChatContext).mockReturnValue({
			messages: [],
			setMessages: vi.fn(),
			isLoading: false,
			setIsLoading: vi.fn(),
			client,
			sendMessage: vi.fn(),
		});

		// Mock SystemContext
		vi.mocked(useSystemContext).mockReturnValue({
			systemMessage: null,
			setSystemMessage: vi.fn(),
			viewMode: "chat",
			setViewMode: vi.fn(),
		});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe("useConvoContext", () => {
		it("should throw error when used outside ConvoProvider", () => {
			const TestComponent = () => {
				expect(() => useConvoContext()).toThrow("useConvoContext must be used within a ConvoProvider");
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside ConvoProvider", () => {
			const TestComponent = () => {
				const context = useConvoContext();
				expect(context).toBeDefined();
				expect(context.convos).toEqual([]);
				expect(context.activeConvoId).toBeUndefined();
				expect(context.currentTitle).toBe("New Conversation");
				expect(context.setConvos).toBeDefined();
				expect(context.setActiveConvoId).toBeDefined();
				expect(context.handleNewConvo).toBeDefined();
				expect(context.handleSwitchConvo).toBeDefined();
				expect(context.reloadConvos).toBeDefined();
				expect(context.pendingResumeConvo).toBeNull();
				expect(context.setPendingResumeConvo).toBeDefined();
				expect(context.handleResumeResponse).toBeDefined();
				return <div>Test</div>;
			};

			render(
				<ConvoProvider client={client}>
					<TestComponent />
				</ConvoProvider>,
			);
		});

		it("should initialize with empty convos and undefined activeConvoId", () => {
			const TestComponent = () => {
				const { convos, activeConvoId, currentTitle } = useConvoContext();
				expect(convos).toEqual([]);
				expect(activeConvoId).toBeUndefined();
				expect(currentTitle).toBe("New Conversation");
				return <div>Test</div>;
			};

			render(
				<ConvoProvider client={client}>
					<TestComponent />
				</ConvoProvider>,
			);
		});

		it("should handle resume response", async () => {
			const mockSetMessages = vi.fn();
			const mockSetSystemMessage = vi.fn();

			vi.mocked(useChatContext).mockReturnValue({
				messages: [],
				setMessages: mockSetMessages,
				isLoading: false,
				setIsLoading: vi.fn(),
				client,
				sendMessage: vi.fn(),
			});

			vi.mocked(useSystemContext).mockReturnValue({
				systemMessage: null,
				setSystemMessage: mockSetSystemMessage,
				viewMode: "chat",
				setViewMode: vi.fn(),
			});

			const TestComponent = () => {
				const { handleResumeResponse } = useConvoContext();
				return (
					<button type="button" onClick={() => handleResumeResponse("test")}>
						Resume
					</button>
				);
			};

			const { getByText } = render(
				<ConvoProvider client={client}>
					<TestComponent />
				</ConvoProvider>,
			);

			getByText("Resume").click();

			// The function should be called and return false (since pendingResumeConvo is null)
			await vi.waitFor(() => {
				expect(mockSetMessages).not.toHaveBeenCalled();
			});
		});
	});
});
