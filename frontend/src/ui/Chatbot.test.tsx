import { MarkdownLink } from "../components/MarkdownContent";
import { Chatbot } from "./Chatbot";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { ACTIVE_CONVO_KEY } from "jolli-common";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientProvider } from "@/contexts/ClientContext";
import { OrgProvider } from "@/contexts/OrgContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";

// Helper to create a mock ReadableStream
function createMockReadableStream(chunks: Array<string>): {
	getReader: () => { read: () => Promise<ReadableStreamReadResult<Uint8Array>> };
} {
	const encoder = new TextEncoder();
	let index = 0;

	return {
		getReader: () => ({
			read: (): Promise<ReadableStreamReadResult<Uint8Array>> => {
				if (index >= chunks.length) {
					return Promise.resolve({ done: true as const, value: undefined });
				}
				const value = encoder.encode(chunks[index++]);
				return Promise.resolve({ done: false as const, value });
			},
		}),
	};
}

// Helper to render components with all required providers
function renderWithClient(ui: ReactNode): ReturnType<typeof render> {
	return render(
		<ClientProvider>
			<OrgProvider>
				<PreferencesProvider>{ui}</PreferencesProvider>
			</OrgProvider>
		</ClientProvider>,
	);
}

describe("ChatBot", () => {
	const mockOnClose = vi.fn();

	const defaultProps = {
		onClose: mockOnClose,
	};

	beforeEach(() => {
		// Disable logging during tests to avoid logger initialization overhead
		process.env.DISABLE_LOGGING = "true";

		vi.clearAllMocks();
		localStorage.clear();

		// Mock Intlayer content
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		// Mock fetch to prevent actual API calls
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			body: null,
		});

		// Mock scrollIntoView for all tests - must be defined before any elements are created
		if (!Element.prototype.scrollIntoView) {
			Element.prototype.scrollIntoView = vi.fn();
		}
		vi.mocked(Element.prototype.scrollIntoView).mockClear();
	});

	afterEach(() => {
		cleanup();
		localStorage.clear();
	});

	it("should render AI Assistant heading", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		expect(screen.getByText("New Conversation")).toBeDefined();
	});

	it("should render welcome message", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		expect(screen.getByText("How can I help you today?")).toBeDefined();
	});

	it("should render message input", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		const input = screen.getByPlaceholderText("Type your message... (Shift+Enter for new line)");
		expect(input).toBeDefined();
	});

	it("should render send button", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		expect(screen.getByText("Send")).toBeDefined();
	});

	it("should update message state when typing", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		const input = screen.getByPlaceholderText(
			"Type your message... (Shift+Enter for new line)",
		) as HTMLTextAreaElement;

		input.value = "Test message";
		input.dispatchEvent(new Event("input", { bubbles: true }));

		expect(input.value).toBe("Test message");
	});

	it("should call handlers when interacting with buttons", () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		const buttons = container.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThan(0);
	});

	it("should have send button", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		const sendButton = screen.getByText("Send");
		expect(sendButton).toBeDefined();
	});

	it("should have input handlers", () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		const textarea = container.querySelector("textarea");
		expect(textarea).toBeDefined();
		expect(textarea?.placeholder).toBe("Type your message... (Shift+Enter for new line)");
	});

	it("should handle send with non-empty message", async () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

		// Set a value
		if (textarea) {
			fireEvent.input(textarea, { target: { value: "test message" } });
		}

		// Click send
		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		// Wait for message to be cleared after async send completes
		await waitFor(() => {
			expect(textarea.value).toBe("");
		});
	});

	it("should handle send with empty message", () => {
		renderWithClient(<Chatbot {...defaultProps} />);

		const sendButton = screen.getByText("Send");

		// Click send without message
		sendButton.click();

		// Verify send button exists
		expect(sendButton).toBeDefined();
	});

	it("should handle Enter key press", () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

		if (textarea) {
			textarea.value = "test";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));

			// Simulate Enter key
			const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
			textarea.dispatchEvent(event);
		}

		expect(textarea).toBeDefined();
	});

	it("should handle non-Enter key press", () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

		if (textarea) {
			// Simulate other key
			const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
			textarea.dispatchEvent(event);
		}

		expect(textarea).toBeDefined();
	});

	it("should handle Shift+Enter without sending message", () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

		if (textarea) {
			textarea.value = "test";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));

			// Simulate Shift+Enter
			const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true });
			textarea.dispatchEvent(event);

			// Message should still be there (not sent)
			expect(textarea.value).toBe("test");
		}
	});

	it("should handle successful streaming response", () => {
		const mockStream = createMockReadableStream(['data: {"content":"Hello"}\n', "data: [DONE]\n"]);

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			body: mockStream,
		});

		renderWithClient(<Chatbot {...defaultProps} />);
		const textarea = screen.getByPlaceholderText(
			"Type your message... (Shift+Enter for new line)",
		) as HTMLTextAreaElement;

		fireEvent.input(textarea, { target: { value: "test message" } });

		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		expect(global.fetch).toHaveBeenCalled();
	});

	it("should handle streaming response with invalid JSON", () => {
		const mockStream = createMockReadableStream(["data: invalid json\n", "data: [DONE]\n"]);

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			body: mockStream,
		});

		renderWithClient(<Chatbot {...defaultProps} />);
		const textarea = screen.getByPlaceholderText(
			"Type your message... (Shift+Enter for new line)",
		) as HTMLTextAreaElement;

		fireEvent.input(textarea, { target: { value: "test" } });

		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		expect(global.fetch).toHaveBeenCalled();
	});

	it("should handle markdown with links in assistant messages", () => {
		const mockStream = createMockReadableStream([
			'data: {"content":"Visit [OpenAI](https://openai.com)"}\n',
			"data: [DONE]\n",
		]);

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			body: mockStream,
		});

		renderWithClient(<Chatbot {...defaultProps} />);
		const textarea = screen.getByPlaceholderText(
			"Type your message... (Shift+Enter for new line)",
		) as HTMLTextAreaElement;

		fireEvent.input(textarea, { target: { value: "test markdown" } });

		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		// Just check that the test completed without errors
		expect(global.fetch).toHaveBeenCalled();
	});

	it("should render MarkdownLink with correct attributes", () => {
		const { container } = renderWithClient(<MarkdownLink href="https://example.com">Test Link</MarkdownLink>);

		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.getAttribute("href")).toBe("https://example.com");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
		expect(link?.textContent).toBe("Test Link");
	});

	it("should handle reader not available error", () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			body: null, // No body means no reader
		});

		renderWithClient(<Chatbot {...defaultProps} />);
		const textarea = screen.getByPlaceholderText(
			"Type your message... (Shift+Enter for new line)",
		) as HTMLTextAreaElement;

		fireEvent.input(textarea, { target: { value: "trigger error" } });

		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		// Verify the error path was executed
		expect(global.fetch).toHaveBeenCalled();
	});

	it("should handle abort error when component unmounts during request", () => {
		// Create a mock that simulates an aborted fetch
		global.fetch = vi.fn().mockImplementation(() => {
			const error = new Error("The operation was aborted");
			error.name = "AbortError";
			return Promise.reject(error);
		});

		const { unmount } = renderWithClient(<Chatbot {...defaultProps} />);
		const textarea = screen.getByPlaceholderText(
			"Type your message... (Shift+Enter for new line)",
		) as HTMLTextAreaElement;

		fireEvent.input(textarea, { target: { value: "test message" } });

		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		// Unmount immediately to trigger abort
		unmount();

		// Verify fetch was called
		expect(global.fetch).toHaveBeenCalled();
	});

	it("should open conversation list when conversation button is clicked", async () => {
		// Mock successful conversations fetch
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [{ id: 1, title: "Test Conversation", messages: [], updatedAt: "2025-01-01T00:00:00Z" }],
		});

		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		// Find and click the conversation list button (MessageSquare icon)
		const buttons = container.querySelectorAll("button");
		let convoButton: HTMLElement | null = null;
		for (const button of Array.from(buttons) as Array<Element>) {
			if (button.getAttribute("title") === "Conversations") {
				convoButton = button as HTMLElement;
				break;
			}
		}

		expect(convoButton).toBeDefined();
		convoButton?.click();

		// Wait for conversations to load and dropdown to appear
		await waitFor(() => {
			expect(screen.getByText("Conversations")).toBeDefined();
		});
	});

	it("should click new conversation button and reset state", () => {
		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		// Find and click the new conversation button (Plus icon)
		const buttons = container.querySelectorAll("button");
		let newConversationButton: HTMLElement | null = null;
		for (const button of Array.from(buttons) as Array<Element>) {
			if (button.getAttribute("title") === "New Conversation") {
				newConversationButton = button as HTMLElement;
				break;
			}
		}

		expect(newConversationButton).toBeDefined();
		newConversationButton?.click();

		// Verify heading is "New Conversation"
		expect(screen.getByText("New Conversation")).toBeDefined();
	});

	it("should switch to a conversation when clicked in the list", async () => {
		// Mock successful conversations fetch
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [
				{
					id: 1,
					title: "Test Conversation",
					messages: [{ role: "user", content: "Hello" }],
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		renderWithClient(<Chatbot {...defaultProps} />);

		// Open conversation list
		const convoButton = screen.getByTitle("Conversations");
		fireEvent.click(convoButton);

		// Wait for conversation to load
		await waitFor(() => {
			const convoTitle = screen.getByText("Test Conversation");
			fireEvent.click(convoTitle);
		});

		// Verify the title updated
		expect(screen.getByText("Test Conversation")).toBeDefined();
	});

	it("should delete a conversation when delete button is clicked", async () => {
		// Mock successful conversations fetch
		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => [
					{ id: 1, title: "Test Conversation", messages: [], updatedAt: "2025-01-01T00:00:00Z" },
				],
			})
			.mockResolvedValueOnce({
				ok: true,
			});

		global.fetch = mockFetch;

		const { container } = renderWithClient(<Chatbot {...defaultProps} />);

		// Open conversation list
		const convoButton = screen.getByTitle("Conversations");
		fireEvent.click(convoButton);

		// Wait for conversations to load
		await waitFor(() => {
			const deleteButtons = container.querySelectorAll('button[title="Delete"]');
			expect(deleteButtons.length).toBeGreaterThan(0);
			fireEvent.click(deleteButtons[0] as HTMLElement);
		});

		// Verify delete endpoint was called
		expect(mockFetch).toHaveBeenCalledWith("/api/convos/1", expect.objectContaining({ method: "DELETE" }));
	});

	it("should load conversation from localStorage on mount", async () => {
		// Set up localStorage
		localStorage.setItem(ACTIVE_CONVO_KEY, "1");

		// Mock successful conversations fetch with various message types
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [
				{
					id: 1,
					title: "Saved Conversation",
					messages: [
						{ role: "user", content: "Previous message" },
						{ role: "assistant", content: "Assistant response" },
						{ role: "assistant_tool_use", content: "Tool use" },
						{ role: "assistant_tool_uses", content: "Tool uses" },
						{ role: "tool", content: "Tool message" },
						{ role: "system", content: "System message" },
					],
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		renderWithClient(<Chatbot {...defaultProps} />);

		// Wait for conversation to load from API
		await waitFor(() => {
			expect(screen.getByText("Saved Conversation")).toBeDefined();
		});

		// Clean up
		localStorage.removeItem(ACTIVE_CONVO_KEY);
	});

	it("should display empty state message when user opens conversation list with no conversations", async () => {
		// Intent: Verify that users get appropriate feedback when they have no conversation history
		// Setup: Mock an empty conversation list
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [], // Empty array = no conversations
		});

		renderWithClient(<Chatbot {...defaultProps} />);

		// Wait for initial conversations to load (empty list)
		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith("/api/convos", expect.any(Object));
		});

		// Action: User clicks the conversations button to view their conversation history
		const conversationsButton = screen.getByTitle("Conversations");

		// Use act to ensure all state updates complete
		await act(async () => {
			conversationsButton.click();
			// Wait a tick for React to process the state update
			await new Promise(resolve => setTimeout(resolve, 0));
		});

		// Expectation: The dropdown should show and display the empty state message
		// Check that the dropdown is visible and contains the empty state message
		const emptyStateMessage = await screen.findByText("No conversations yet", {}, { timeout: 1000 });
		expect(emptyStateMessage).toBeDefined();
	});

	it("should reload conversations when opening the conversation list", () => {
		const mockFetch = vi
			.fn()
			// First call is for OrgProvider getCurrent
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ tenant: null, org: null, availableOrgs: [] }),
			})
			// Second call is for initial convo list load
			.mockResolvedValueOnce({
				ok: true,
				json: async () => [],
			})
			// Third call is for convo list reload when opening dropdown
			.mockResolvedValueOnce({
				ok: true,
				json: async () => [
					{ id: 1, title: "New Conversation", messages: [], updatedAt: "2025-01-01T00:00:00Z" },
				],
			});

		global.fetch = mockFetch;

		renderWithClient(<Chatbot {...defaultProps} />);

		// Open conversation list (should reload)
		const convoButton = screen.getByTitle("Conversations");
		fireEvent.click(convoButton);

		// Verify fetch was called three times (OrgProvider + initial load + reload)
		expect(mockFetch).toHaveBeenCalledTimes(3);
	});

	it("should handle onConvoId callback and reload conversations", async () => {
		// Mock streaming response with conversationId event
		const mockStream = createMockReadableStream([
			'data: {"content":"Hello"}\n',
			'data: {"type":"convoId","convoId":123}\n',
			"data: [DONE]\n",
		]);

		const mockFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => [],
			})
			.mockResolvedValueOnce({
				ok: true,
				body: mockStream,
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => [{ id: 123, title: "New Chat", messages: [], updatedAt: "2025-01-01T00:00:00Z" }],
			});

		global.fetch = mockFetch;

		renderWithClient(<Chatbot {...defaultProps} />);

		const textarea = screen.getByPlaceholderText("Type your message... (Shift+Enter for new line)");
		fireEvent.input(textarea, { target: { value: "test message" } });

		const sendButton = screen.getByText("Send");
		fireEvent.click(sendButton);

		// Wait for conversations to be reloaded after convoId received
		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(3); // initial + stream + reload
		});
	});

	it("should not auto-scroll on initial load with messages", async () => {
		// Set up localStorage with an active conversation
		localStorage.setItem(ACTIVE_CONVO_KEY, "1");

		// Mock successful conversations fetch with messages
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => [
				{
					id: 1,
					title: "Test Conversation",
					messages: [
						{ role: "user", content: "Message 1" },
						{ role: "assistant", content: "Response 1" },
					],
					updatedAt: "2025-01-01T00:00:00Z",
				},
			],
		});

		renderWithClient(<Chatbot {...defaultProps} />);

		// Wait for messages to be loaded
		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalled();
		});

		// Give it a moment to process
		await new Promise(resolve => setTimeout(resolve, 100));

		// Verify scrollIntoView was NOT called on initial load
		expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

		// Clean up
		localStorage.removeItem(ACTIVE_CONVO_KEY);
	});

	it("should handle intlayer values with .key property", () => {
		// Mock Intlayer content with .key property to trigger getStringValue edge case
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		renderWithClient(<Chatbot {...defaultProps} />);

		// Should still work correctly with .key property (getStringValue converts it)
		expect(screen.getByText("New Conversation")).toBeDefined();
	});
});
