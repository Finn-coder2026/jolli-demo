import { GoogleAgent } from "./GoogleAgent";
import { describe, expect, it } from "vitest";

// Test helper class to access protected methods
class TestableGoogleAgent extends GoogleAgent {
	testGetProviderName(): string {
		return this.getProviderName();
	}

	testGetModelName(): string {
		return this.getModelName();
	}
}

// Note: These tests verify the agent structure and interface.
// Full integration tests with actual API calls should be done in integration tests
// to avoid mocking complexity and test real behavior.

describe("GoogleAgent", () => {
	it("should create a Google agent with default model", () => {
		const agent = new GoogleAgent("test-api-key");
		expect(agent).toBeDefined();
		expect(agent.invoke).toBeDefined();
		expect(agent.stream).toBeDefined();
		expect(agent.getState).toBeDefined();
		expect(agent.setState).toBeDefined();
		expect(agent.clearMemory).toBeDefined();
	});

	it("should support custom model", () => {
		const agent = new GoogleAgent("test-api-key", "gemini-pro-vision");
		expect(agent).toBeDefined();
	});

	it("should support custom system prompt", () => {
		const agent = new GoogleAgent("test-api-key", "gemini-pro", "Custom system prompt");
		expect(agent).toBeDefined();
	});

	it("should have state management methods", async () => {
		const agent = new GoogleAgent("test-api-key");

		// Test state management
		const initialState = await agent.getState();
		expect(initialState).toBeDefined();
		expect(initialState.messages).toBeDefined();

		await agent.clearMemory();
		const clearedState = await agent.getState();
		expect(clearedState.messages).toEqual([]);
	});

	it("should return correct provider name", () => {
		const agent = new TestableGoogleAgent("test-api-key");
		expect(agent.testGetProviderName()).toBe("google");
	});

	it("should return correct model name", () => {
		const agent = new TestableGoogleAgent("test-api-key", "gemini-pro-vision");
		expect(agent.testGetModelName()).toBe("gemini-pro-vision");
	});
});
