import { AnthropicAgent } from "./AnthropicAgent";
import { describe, expect, it } from "vitest";

// Test helper class to access protected methods
class TestableAnthropicAgent extends AnthropicAgent {
	testGetProviderName(): string {
		return this.getProviderName();
	}

	testGetModelName(): string {
		return this.getModelName();
	}
}

describe("AnthropicAgent", () => {
	it("should create an Anthropic agent with default model", () => {
		const agent = new AnthropicAgent("test-api-key");
		expect(agent).toBeDefined();
		expect(agent.invoke).toBeDefined();
		expect(agent.stream).toBeDefined();
		expect(agent.getState).toBeDefined();
		expect(agent.setState).toBeDefined();
		expect(agent.clearMemory).toBeDefined();
	});

	it("should support custom model", () => {
		const agent = new AnthropicAgent("test-api-key", "claude-3-opus-20240229");
		expect(agent).toBeDefined();
	});

	it("should support custom system prompt", () => {
		const agent = new AnthropicAgent("test-api-key", "claude-3-5-sonnet-20241022", "Custom system prompt");
		expect(agent).toBeDefined();
	});

	it("should have state management methods", async () => {
		const agent = new AnthropicAgent("test-api-key");

		// Test state management
		const initialState = await agent.getState();
		expect(initialState).toBeDefined();
		expect(initialState.messages).toBeDefined();

		await agent.clearMemory();
		const clearedState = await agent.getState();
		expect(clearedState.messages).toEqual([]);
	});

	it("should return correct provider name", () => {
		const agent = new TestableAnthropicAgent("test-api-key");
		expect(agent.testGetProviderName()).toBe("anthropic");
	});

	it("should return correct model name", () => {
		const agent = new TestableAnthropicAgent("test-api-key", "claude-3-opus-20240229");
		expect(agent.testGetModelName()).toBe("claude-3-opus-20240229");
	});
});
