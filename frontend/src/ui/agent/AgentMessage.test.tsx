import { AgentMessage } from "./AgentMessage";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock MarkdownContent to avoid markdown-to-jsx / Preact VNode conflicts in tests
vi.mock("../../components/MarkdownContent", () => ({
	MarkdownContent: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));

// Mock useNavigation
const mockNavigate = vi.fn();
vi.mock("../../contexts/NavigationContext", () => ({
	useNavigation: () => ({ navigate: mockNavigate }),
}));

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
	clipboard: { writeText: mockWriteText },
});

describe("AgentMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render user message", () => {
		render(<AgentMessage role="user" content="Hello there" />);

		const message = screen.getByTestId("agent-message");
		expect(message.getAttribute("data-role")).toBe("user");
		expect(message.textContent).toContain("Hello there");
	});

	it("should render assistant message with markdown content", () => {
		render(<AgentMessage role="assistant" content="**Bold text**" />);

		const message = screen.getByTestId("agent-message");
		expect(message.getAttribute("data-role")).toBe("assistant");
		// MarkdownContent is mocked — just verify it renders the content
		expect(screen.getByTestId("markdown-content")).toBeDefined();
		expect(screen.getByTestId("markdown-content").textContent).toBe("**Bold text**");
	});

	it("should show typing indicator when streaming", () => {
		render(<AgentMessage role="assistant" content="" isStreaming={true} />);

		expect(screen.getByTestId("typing-indicator")).toBeDefined();
	});

	it("should not show typing indicator when not streaming", () => {
		render(<AgentMessage role="assistant" content="Done" />);

		expect(screen.queryByTestId("typing-indicator")).toBeNull();
	});

	it("should show copy button on hover for assistant messages", () => {
		render(<AgentMessage role="assistant" content="Some response" />);

		expect(screen.getByTestId("copy-message-button")).toBeDefined();
	});

	it("should not show copy button for user messages", () => {
		render(<AgentMessage role="user" content="Hello" />);

		expect(screen.queryByTestId("copy-message-button")).toBeNull();
	});

	it("should not show copy button for streaming messages", () => {
		render(<AgentMessage role="assistant" content="Streaming..." isStreaming={true} />);

		expect(screen.queryByTestId("copy-message-button")).toBeNull();
	});

	it("should copy message content when copy button is clicked", async () => {
		render(<AgentMessage role="assistant" content="Copy me" />);

		const copyButton = screen.getByTestId("copy-message-button");
		fireEvent.click(copyButton);

		expect(mockWriteText).toHaveBeenCalledWith("Copy me");

		// After clicking, the aria-label should change to "Copied!"
		await waitFor(() => {
			expect(copyButton.getAttribute("aria-label")).toBe("Copied!");
		});
	});

	it("should right-align user messages", () => {
		render(<AgentMessage role="user" content="Hello" />);

		const message = screen.getByTestId("agent-message");
		expect(message.className).toContain("justify-end");
	});

	it("should left-align assistant messages", () => {
		render(<AgentMessage role="assistant" content="Hi" />);

		const message = screen.getByTestId("agent-message");
		expect(message.className).toContain("justify-start");
	});

	it("should not show copy button for empty assistant messages", () => {
		render(<AgentMessage role="assistant" content="" />);

		expect(screen.queryByTestId("copy-message-button")).toBeNull();
	});

	it("should show create article button when onCreateArticle is provided", () => {
		const onCreateArticle = vi.fn();
		render(<AgentMessage role="assistant" content="Some response" onCreateArticle={onCreateArticle} />);

		expect(screen.getByTestId("create-article-button")).toBeDefined();
	});

	it("should not show create article button when onCreateArticle is not provided", () => {
		render(<AgentMessage role="assistant" content="Some response" />);

		expect(screen.queryByTestId("create-article-button")).toBeNull();
	});

	it("should call onCreateArticle with message content when clicked", () => {
		const onCreateArticle = vi.fn();
		render(<AgentMessage role="assistant" content="Draft this" onCreateArticle={onCreateArticle} />);

		fireEvent.click(screen.getByTestId("create-article-button"));

		expect(onCreateArticle).toHaveBeenCalledWith("Draft this");
	});

	it("should show retry button when onRetry is provided for assistant messages", () => {
		const onRetry = vi.fn();
		render(<AgentMessage role="assistant" content="Response" onRetry={onRetry} />);

		expect(screen.getByTestId("retry-message-button")).toBeDefined();
	});

	it("should not show retry button when onRetry is not provided", () => {
		render(<AgentMessage role="assistant" content="Response" />);

		expect(screen.queryByTestId("retry-message-button")).toBeNull();
	});

	it("should call onRetry when retry button is clicked", () => {
		const onRetry = vi.fn();
		render(<AgentMessage role="assistant" content="Response" onRetry={onRetry} />);

		fireEvent.click(screen.getByTestId("retry-message-button"));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("should render inline tooltip text on action buttons", () => {
		const onRetry = vi.fn();
		render(<AgentMessage role="assistant" content="Response" onRetry={onRetry} />);

		const copyButton = screen.getByTestId("copy-message-button");
		const retryButton = screen.getByTestId("retry-message-button");

		// Each button should contain a tooltip span with the label text
		const copyTooltip = copyButton.querySelector("[role='tooltip']");
		expect(copyTooltip).not.toBeNull();
		expect(copyTooltip?.textContent).toBe("Copy");

		const retryTooltip = retryButton.querySelector("[role='tooltip']");
		expect(retryTooltip).not.toBeNull();
		expect(retryTooltip?.textContent).toBe("Try again");
	});

	it("should not show action buttons for user messages even with callbacks", () => {
		const onCreateArticle = vi.fn();
		const onRetry = vi.fn();
		render(<AgentMessage role="user" content="Hello" onCreateArticle={onCreateArticle} onRetry={onRetry} />);

		expect(screen.queryByTestId("copy-message-button")).toBeNull();
		expect(screen.queryByTestId("create-article-button")).toBeNull();
		expect(screen.queryByTestId("retry-message-button")).toBeNull();
	});
});
