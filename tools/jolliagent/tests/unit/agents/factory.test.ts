import { type LLMClient, type LLMStreamEvent, type StreamOptions, toolDefinitions } from "src";
import { createGettingStartedGuideAgent } from "src/agents/factory";
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

describe("createGettingStartedGuideAgent", () => {
	test("configures anthropic defaults and Tools.ts tools", async () => {
		const mock = new MockClient();
		const { agent, withDefaults } = createGettingStartedGuideAgent({ client: mock });

		// Trigger a call so we can inspect what Agent passes to client
		for await (const _ of agent.stream(withDefaults({ prompt: "hello" }))) {
			// consume stream
		}

		if (!mock.lastStreamOpts) {
			throw new Error("No stream options captured");
		}
		const opts = mock.lastStreamOpts;
		expect(opts.model).toBe("claude-sonnet-4-5-20250929");
		expect(opts.tools).toEqual(toolDefinitions);
		// Getting Started profile sets temperature 0.2
		expect(opts.temperature).toBe(0.2);

		// withDefaults should inject a system message when prompt-only
		const sys = opts.messages.find(m => m.role === "system");
		if (!sys) {
			throw new Error("System message not found");
		}
		expect(sys.role).toBe("system");
		expect(sys.content).toContain("Getting Started");
	});
});
