import "dotenv/config";
import type { LLMStreamEvent, Message } from "llm";
import AnthropicLLMClient from "providers/Anthropic";
import { describe, expect, test } from "vitest";

describe("AnthropicLLMClient (integration)", () => {
	test("real text streaming", async () => {
		if (!process.env.ANTHROPIC_API_KEY) {
			return;
		}

		const client = new AnthropicLLMClient();
		const messages: Array<Message> = [
			{ role: "system", content: "You are a concise assistant." },
			{ role: "user", content: "Reply with exactly: OK" },
		];

		const events: Array<LLMStreamEvent> = [];
		for await (const ev of client.stream({
			model: "claude-sonnet-4-5-20250929",
			messages,
			temperature: 0,
		})) {
			events.push(ev);
		}

		const errorEvent = events.find(
			(e): e is { type: "error"; error: string } =>
				e.type === "error" && typeof (e as { error?: unknown }).error === "string",
		);
		if (errorEvent) {
			// Live provider failures (auth/rate-limit/transient) should not fail CI correctness checks.
			return;
		}

		const textDeltas = events.filter((e): e is { type: "text_delta"; delta: string } => e.type === "text_delta");
		const text = textDeltas.map(e => e.delta).join("");
		expect(text.length).toBeGreaterThan(0);
		// Be tolerant in case of punctuation/whitespace
		expect(text.toUpperCase()).toContain("OK");
		expect(events.at(-1)?.type).toBe("response_completed");
	}, 30000);
});
