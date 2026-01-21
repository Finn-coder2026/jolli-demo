/**
 * @vitest-environment jsdom
 */

import { mockClient } from "../../test-utils/Client.mock";
import { ChatProvider, useChatContext } from "./ChatContext";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ChatContext", () => {
	const client = mockClient();

	describe("useChatContext", () => {
		it("should throw error when used outside ChatProvider", () => {
			const TestComponent = () => {
				expect(() => useChatContext()).toThrow("useChatContext must be used within a ChatProvider");
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside ChatProvider", () => {
			const TestComponent = () => {
				const context = useChatContext();
				expect(context).toBeDefined();
				expect(context.messages).toEqual([]);
				expect(context.isLoading).toBe(false);
				expect(context.setMessages).toBeDefined();
				expect(context.setIsLoading).toBeDefined();
				expect(context.client).toBe(client);
				expect(context.sendMessage).toBeDefined();
				expect(typeof context.sendMessage).toBe("function");
				return <div>Test</div>;
			};

			render(
				<ChatProvider client={client}>
					<TestComponent />
				</ChatProvider>,
			);
		});

		it("should initialize with empty messages array", () => {
			const TestComponent = () => {
				const { messages } = useChatContext();
				expect(messages).toEqual([]);
				expect(Array.isArray(messages)).toBe(true);
				return <div>Test</div>;
			};

			render(
				<ChatProvider client={client}>
					<TestComponent />
				</ChatProvider>,
			);
		});

		it("should initialize with isLoading false", () => {
			const TestComponent = () => {
				const { isLoading } = useChatContext();
				expect(isLoading).toBe(false);
				return <div>Test</div>;
			};

			render(
				<ChatProvider client={client}>
					<TestComponent />
				</ChatProvider>,
			);
		});
	});
});
