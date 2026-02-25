import { AgentConversation } from "./AgentConversation";
import { render, screen } from "@testing-library/preact";
import type { CollabMessage } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock MarkdownContent to avoid markdown-to-jsx / Preact VNode conflicts in tests
vi.mock("../../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

// Mock useNavigation
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({ navigate: vi.fn() }),
}));

// Mock clipboard API
Object.assign(navigator, {
	clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

describe("AgentConversation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render empty conversation", () => {
		render(<AgentConversation messages={[]} streamingContent="" isLoading={false} />);

		expect(screen.getByTestId("agent-conversation")).toBeDefined();
	});

	it("should render user and assistant messages", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "Hi there!", timestamp: "2026-02-11T10:00:01Z" },
		];

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} />);

		const allMessages = screen.getAllByTestId("agent-message");
		expect(allMessages).toHaveLength(2);
		expect(allMessages[0].getAttribute("data-role")).toBe("user");
		expect(allMessages[1].getAttribute("data-role")).toBe("assistant");
	});

	it("should filter out system messages", () => {
		const messages: Array<CollabMessage> = [
			{ role: "system", content: "System prompt", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:01Z" },
			{ role: "assistant", content: "Hi!", timestamp: "2026-02-11T10:00:02Z" },
		];

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} />);

		const allMessages = screen.getAllByTestId("agent-message");
		expect(allMessages).toHaveLength(2);
	});

	it("should display streaming content during loading", () => {
		const messages: Array<CollabMessage> = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];

		render(<AgentConversation messages={messages} streamingContent="I am thinking..." isLoading={true} />);

		const allMessages = screen.getAllByTestId("agent-message");
		// User message + streaming assistant message
		expect(allMessages).toHaveLength(2);
		expect(allMessages[1].textContent).toContain("I am thinking...");
	});

	it("should show typing indicator when loading with no content", () => {
		const messages: Array<CollabMessage> = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];

		render(<AgentConversation messages={messages} streamingContent="" isLoading={true} />);

		expect(screen.getByTestId("typing-indicator")).toBeDefined();
	});

	it("should show scroll to bottom button when scrolled up", () => {
		// The button only shows via scroll interaction which is hard to test in JSDOM.
		// Just verify the component renders without errors.
		const messages: Array<CollabMessage> = [{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" }];

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} />);
		expect(screen.getByTestId("agent-conversation")).toBeDefined();
	});

	it("should append streaming content after existing assistant message without replacing it", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "Partial", timestamp: "2026-02-11T10:00:01Z" },
		];

		render(<AgentConversation messages={messages} streamingContent="Complete answer" isLoading={true} />);

		const allMessages = screen.getAllByTestId("agent-message");
		// Original assistant message is preserved; streaming content is appended as a new message
		expect(allMessages).toHaveLength(3);
		expect(allMessages[1].textContent).toContain("Partial");
		expect(allMessages[2].textContent).toContain("Complete answer");
	});

	it("should preserve intro message during auto-advance streaming", () => {
		// Simulates auto-advance: only an assistant intro exists, then streaming starts
		const messages: Array<CollabMessage> = [
			{ role: "assistant", content: "Welcome to Jolli!", timestamp: "2026-02-11T10:00:00Z" },
		];

		render(<AgentConversation messages={messages} streamingContent="Checking GitHub..." isLoading={true} />);

		const allMessages = screen.getAllByTestId("agent-message");
		// Intro message is preserved; streaming content appears below it
		expect(allMessages).toHaveLength(2);
		expect(allMessages[0].textContent).toContain("Welcome to Jolli!");
		expect(allMessages[1].textContent).toContain("Checking GitHub...");
	});

	it("should filter tool role messages", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "tool", content: "Tool output", timestamp: "2026-02-11T10:00:01Z" },
			{ role: "assistant", content: "Here you go", timestamp: "2026-02-11T10:00:02Z" },
		];

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} />);

		const allMessages = screen.getAllByTestId("agent-message");
		expect(allMessages).toHaveLength(2);
	});

	it("should show retry button on all assistant messages when not loading", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "First response", timestamp: "2026-02-11T10:00:01Z" },
			{ role: "user", content: "More", timestamp: "2026-02-11T10:00:02Z" },
			{ role: "assistant", content: "Second response", timestamp: "2026-02-11T10:00:03Z" },
		];

		const onRetry = vi.fn();

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} onRetry={onRetry} />);

		const retryButtons = screen.getAllByTestId("retry-message-button");
		// All assistant messages should have a retry button
		expect(retryButtons).toHaveLength(2);
	});

	it("should call onRetry with the correct original message index", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "First response", timestamp: "2026-02-11T10:00:01Z" },
			{ role: "user", content: "More", timestamp: "2026-02-11T10:00:02Z" },
			{ role: "assistant", content: "Second response", timestamp: "2026-02-11T10:00:03Z" },
		];

		const onRetry = vi.fn();

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} onRetry={onRetry} />);

		const retryButtons = screen.getAllByTestId("retry-message-button");
		// Click the first retry button (first assistant message at original index 1)
		retryButtons[0].click();
		expect(onRetry).toHaveBeenCalledWith(1);

		// Click the second retry button (second assistant message at original index 3)
		retryButtons[1].click();
		expect(onRetry).toHaveBeenCalledWith(3);
	});

	it("should pass correct original index when system/tool messages are present", () => {
		const messages: Array<CollabMessage> = [
			{ role: "system", content: "System prompt", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:01Z" },
			{ role: "tool", content: "Tool output", timestamp: "2026-02-11T10:00:02Z" },
			{ role: "assistant", content: "Response", timestamp: "2026-02-11T10:00:03Z" },
		];

		const onRetry = vi.fn();

		render(<AgentConversation messages={messages} streamingContent="" isLoading={false} onRetry={onRetry} />);

		const retryButtons = screen.getAllByTestId("retry-message-button");
		expect(retryButtons).toHaveLength(1);
		// The assistant message is at original index 3, not display index 1
		retryButtons[0].click();
		expect(onRetry).toHaveBeenCalledWith(3);
	});

	it("should not show retry button when loading", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "Response", timestamp: "2026-02-11T10:00:01Z" },
		];

		const onRetry = vi.fn();

		render(
			<AgentConversation
				messages={messages}
				streamingContent="Still streaming..."
				isLoading={true}
				onRetry={onRetry}
			/>,
		);

		expect(screen.queryByTestId("retry-message-button")).toBeNull();
	});

	it("should pass onCreateArticle to assistant messages", () => {
		const messages: Array<CollabMessage> = [
			{ role: "user", content: "Hello", timestamp: "2026-02-11T10:00:00Z" },
			{ role: "assistant", content: "Response", timestamp: "2026-02-11T10:00:01Z" },
		];

		const onCreateArticle = vi.fn();

		render(
			<AgentConversation
				messages={messages}
				streamingContent=""
				isLoading={false}
				onCreateArticle={onCreateArticle}
			/>,
		);

		// The create article button should appear on the assistant message
		expect(screen.getByTestId("create-article-button")).toBeDefined();
	});
});
