import { toAnthropicMessages } from "../../../src/providers/Anthropic";
import type { Message } from "../../../src/Types";
import { describe, expect, it } from "vitest";

describe("toAnthropicMessages", () => {
	it("converts basic user/assistant messages", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi there" },
		];

		const result = toAnthropicMessages(messages);

		expect(result.system).toBeUndefined();
		expect(result.messages).toEqual([
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "assistant", content: [{ type: "text", text: "hi there" }] },
		]);
	});

	it("extracts first system message", () => {
		const messages: Array<Message> = [
			{ role: "system", content: "You are helpful" },
			{ role: "user", content: "hello" },
		];

		const result = toAnthropicMessages(messages);

		expect(result.system).toBe("You are helpful");
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0].role).toBe("user");
	});

	it("skips user messages with empty content", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
			{ role: "user", content: "" },
			{ role: "user", content: "world" },
		];

		const result = toAnthropicMessages(messages);

		expect(result.messages).toHaveLength(3);
		expect(result.messages).toEqual([
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "assistant", content: [{ type: "text", text: "hi" }] },
			{ role: "user", content: [{ type: "text", text: "world" }] },
		]);
	});

	it("skips assistant messages with empty content", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "" },
			{ role: "user", content: "still here?" },
		];

		const result = toAnthropicMessages(messages);

		expect(result.messages).toHaveLength(2);
		expect(result.messages).toEqual([
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "user", content: [{ type: "text", text: "still here?" }] },
		]);
	});

	it("skips messages with whitespace-only content", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "   " },
			{ role: "user", content: "\n\t" },
			{ role: "user", content: "world" },
		];

		const result = toAnthropicMessages(messages);

		expect(result.messages).toHaveLength(2);
		expect(result.messages).toEqual([
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "user", content: [{ type: "text", text: "world" }] },
		]);
	});

	it("preserves tool messages with empty content", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{
				role: "assistant_tool_use",
				tool_call_id: "call_1",
				tool_name: "test",
				tool_input: {},
			},
			{ role: "tool", tool_call_id: "call_1", content: "", tool_name: "test" },
		];

		const result = toAnthropicMessages(messages);

		// Tool results should be preserved even with empty content
		expect(result.messages).toHaveLength(3);
		expect(result.messages[2].role).toBe("user");
		expect(result.messages[2].content).toEqual([{ type: "tool_result", tool_use_id: "call_1", content: "" }]);
	});

	it("handles assistant_tool_uses messages", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{
				role: "assistant_tool_uses",
				calls: [
					{ tool_call_id: "call_1", tool_name: "tool1", tool_input: { arg: "val" } },
					{ tool_call_id: "call_2", tool_name: "tool2", tool_input: {} },
				],
			},
		];

		const result = toAnthropicMessages(messages);

		expect(result.messages).toHaveLength(2);
		expect(result.messages[1].role).toBe("assistant");
		expect(result.messages[1].content).toHaveLength(2);
	});

	it("coalesces consecutive tool messages into one user message", () => {
		const messages: Array<Message> = [
			{ role: "user", content: "hello" },
			{
				role: "assistant_tool_uses",
				calls: [
					{ tool_call_id: "call_1", tool_name: "tool1", tool_input: {} },
					{ tool_call_id: "call_2", tool_name: "tool2", tool_input: {} },
				],
			},
			{ role: "tool", tool_call_id: "call_1", content: "result1", tool_name: "tool1" },
			{ role: "tool", tool_call_id: "call_2", content: "result2", tool_name: "tool2" },
		];

		const result = toAnthropicMessages(messages);

		// Consecutive tool messages should be coalesced into one user message
		expect(result.messages).toHaveLength(3);
		expect(result.messages[2].role).toBe("user");
		expect(result.messages[2].content).toHaveLength(2);
	});
});
