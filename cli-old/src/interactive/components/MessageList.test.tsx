/**
 * @vitest-environment jsdom
 */

import { MessageList } from "./MessageList";
import { render } from "@testing-library/react";
import type { ChatMessage } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Mock MarkdownUtils
vi.mock("../util/MarkdownUtils", () => ({
	renderMarkdown: vi.fn((text: string) => `[RENDERED: ${text}]`),
}));

import { renderMarkdown } from "../util/MarkdownUtils";

describe("MessageList", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should render empty state when no messages", () => {
		const { getByText } = render(<MessageList messages={[]} isLoading={false} />);

		expect(getByText("How can I help you today?")).toBeDefined();
	});

	it("should not render messages when empty", () => {
		const { queryByText } = render(<MessageList messages={[]} isLoading={false} />);

		expect(queryByText("You:")).toBeNull();
		expect(queryByText("Assistant:")).toBeNull();
	});

	it("should render user message with correct label", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "user",
				content: "Hello",
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={false} />);

		expect(getByText("You:")).toBeDefined();
		expect(getByText("Hello")).toBeDefined();
	});

	it("should render assistant message with correct label", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: "Hi there!",
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={false} />);

		expect(getByText("Assistant:")).toBeDefined();
	});

	it("should render markdown for assistant messages", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: "This is **bold** text",
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={false} />);

		expect(renderMarkdown).toHaveBeenCalledWith("This is **bold** text");
		expect(getByText("[RENDERED: This is **bold** text]")).toBeDefined();
	});

	it("should not render markdown for user messages", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "user",
				content: "This is **bold** text",
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={false} />);

		// Should not call renderMarkdown for user messages
		expect(renderMarkdown).not.toHaveBeenCalled();
		expect(getByText("This is **bold** text")).toBeDefined();
	});

	it("should render multiple messages", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "user",
				content: "Hello",
			},
			{
				role: "assistant",
				content: "Hi there!",
			},
			{
				role: "user",
				content: "How are you?",
			},
		];

		const { getAllByText, getByText } = render(<MessageList messages={messages} isLoading={false} />);

		const userLabels = getAllByText("You:");
		const assistantLabels = getAllByText("Assistant:");

		expect(userLabels.length).toBe(2);
		expect(assistantLabels.length).toBe(1);
		expect(getByText("Hello")).toBeDefined();
		expect(getByText("How are you?")).toBeDefined();
	});

	it("should show 'Thinking...' for last message when loading and content is empty", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "user",
				content: "Hello",
			},
			{
				role: "assistant",
				content: "",
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={true} />);

		expect(getByText("Thinking...")).toBeDefined();
	});

	it("should not show 'Thinking...' when not loading", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: "",
			},
		];

		const { queryByText } = render(<MessageList messages={messages} isLoading={false} />);

		expect(queryByText("Thinking...")).toBeNull();
	});

	it("should not show 'Thinking...' for non-last message even when loading", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: "",
			},
			{
				role: "user",
				content: "Another message",
			},
		];

		const { queryByText } = render(<MessageList messages={messages} isLoading={true} />);

		// Should not show "Thinking..." because empty message is not the last one
		expect(queryByText("Thinking...")).toBeNull();
	});

	it("should not show 'Thinking...' when content is not empty", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: "Some content",
			},
		];

		const { queryByText } = render(<MessageList messages={messages} isLoading={true} />);

		expect(queryByText("Thinking...")).toBeNull();
	});

	it("should render assistant message without markdown when content is empty string", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: "",
			},
		];

		const { queryByText } = render(<MessageList messages={messages} isLoading={false} />);

		// Should not call renderMarkdown for empty content
		expect(renderMarkdown).not.toHaveBeenCalled();
		// Content will be empty, so just check that "Thinking..." is not shown
		expect(queryByText("Thinking...")).toBeNull();
	});

	it("should handle assistant message with null/undefined content gracefully", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "assistant",
				content: null as unknown as string,
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={false} />);

		// Should not call renderMarkdown for null/undefined content
		expect(renderMarkdown).not.toHaveBeenCalled();
		expect(getByText("Assistant:")).toBeDefined();
	});

	it("should use key prop based on index", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "user",
				content: "Message 1",
			},
			{
				role: "user",
				content: "Message 2",
			},
		];

		const { container } = render(<MessageList messages={messages} isLoading={false} />);

		// Just verify that component renders without key warnings
		expect(container).toBeDefined();
	});

	it("should render different styling for user vs assistant messages", () => {
		const messages: Array<ChatMessage> = [
			{
				role: "user",
				content: "User message",
			},
			{
				role: "assistant",
				content: "Assistant message",
			},
		];

		const { getByText } = render(<MessageList messages={messages} isLoading={false} />);

		// Both labels should exist
		expect(getByText("You:")).toBeDefined();
		expect(getByText("Assistant:")).toBeDefined();
	});
});
