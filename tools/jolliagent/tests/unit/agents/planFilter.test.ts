import type { LLMClient, LLMStreamEvent, Message, StreamOptions } from "src";
import Agent from "src/agents/Agent";
import { describe, expect, test } from "vitest";

class MockClient implements LLMClient {
	lastStreamOpts: StreamOptions | undefined;

	async *stream(opts: StreamOptions): AsyncGenerator<LLMStreamEvent, void, unknown> {
		await Promise.resolve();
		this.lastStreamOpts = opts;
		yield { type: "response_completed", finish_reason: "stop" } as const;
	}

	async *continueWithToolResult(): AsyncGenerator<LLMStreamEvent, void, unknown> {
		await Promise.resolve();
		yield { type: "response_completed", finish_reason: "stop" } as const;
	}
}

describe("Agent message filtering for plan tools", () => {
	test("keeps only the latest get_plan and set_plan tool results", async () => {
		const mock = new MockClient();
		const agent = new Agent({ client: mock as LLMClient, model: "test-model" });

		const messages: Array<Message> = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{
				role: "tool",
				tool_call_id: "tc1",
				tool_name: "set_plan",
				content: "Plan has been set successfully. Current plan:\nfirst",
			},
			{ role: "tool", tool_call_id: "tc2", tool_name: "get_plan", content: "Current plan:\nfirst" },
			{ role: "assistant", content: "a1" },
			{
				role: "tool",
				tool_call_id: "tc3",
				tool_name: "set_plan",
				content: "Plan has been set successfully. Current plan:\nsecond",
			},
			{ role: "tool", tool_call_id: "tc4", tool_name: "get_plan", content: "Current plan:\nsecond" },
			{ role: "user", content: "u2" },
		];

		// Consume the stream to trigger buildMessages
		for await (const _ of agent.stream({ messages })) {
			// no-op
		}

		const used = mock.lastStreamOpts?.messages ?? [];

		// Expect earlier plan tool results removed (tc1, tc2)
		expect(used.find(m => m.role === "tool" && m.tool_call_id === "tc1")).toBeUndefined();
		expect(used.find(m => m.role === "tool" && m.tool_call_id === "tc2")).toBeUndefined();

		// Expect later plan tool results preserved (tc3, tc4)
		const tc3 = used.find(m => m.role === "tool" && m.tool_call_id === "tc3");
		const tc4 = used.find(m => m.role === "tool" && m.tool_call_id === "tc4");
		expect(tc3).toBeDefined();
		expect(tc4).toBeDefined();

		// Ensure only one get_plan and one set_plan remain
		const getPlans = used.filter(m => m.role === "tool" && m.tool_name === "get_plan");
		const setPlans = used.filter(m => m.role === "tool" && m.tool_name === "set_plan");
		expect(getPlans.length).toBe(1);
		expect(setPlans.length).toBe(1);

		// Order of non-removed messages should be preserved
		const expected: Array<Message> = [
			{ role: "system", content: "sys" },
			{ role: "user", content: "u1" },
			{ role: "assistant", content: "a1" },
			{
				role: "tool",
				tool_call_id: "tc3",
				tool_name: "set_plan",
				content: "Plan has been set successfully. Current plan:\nsecond",
			},
			{ role: "tool", tool_call_id: "tc4", tool_name: "get_plan", content: "Current plan:\nsecond" },
			{ role: "user", content: "u2" },
		];

		expect(used).toEqual(expected);
	});
});
