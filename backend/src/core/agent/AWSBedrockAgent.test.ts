import { resetConfig } from "../../config/Config";
import { AWSBedrockAgent } from "./AWSBedrockAgent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Test helper class to access protected methods
class TestableAWSBedrockAgent extends AWSBedrockAgent {
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

describe("AWSBedrockAgent", () => {
	let originalAwsRegion: string | undefined;
	let originalAwsSecretAccessKey: string | undefined;

	beforeEach(() => {
		// Store original AWS environment values
		originalAwsRegion = process.env.AWS_REGION;
		originalAwsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
		// Set AWS_SECRET_ACCESS_KEY for tests since it's required
		process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
	});

	afterEach(() => {
		// Restore original AWS_REGION value
		if (originalAwsRegion !== undefined) {
			process.env.AWS_REGION = originalAwsRegion;
		} else {
			delete process.env.AWS_REGION;
		}
		// Restore original AWS_SECRET_ACCESS_KEY value
		if (originalAwsSecretAccessKey !== undefined) {
			process.env.AWS_SECRET_ACCESS_KEY = originalAwsSecretAccessKey;
		} else {
			delete process.env.AWS_SECRET_ACCESS_KEY;
		}
		resetConfig();
	});

	it("should create an AWS Bedrock agent with default model", () => {
		const agent = new AWSBedrockAgent("test-api-key");
		expect(agent).toBeDefined();
		expect(agent.invoke).toBeDefined();
		expect(agent.stream).toBeDefined();
		expect(agent.getState).toBeDefined();
		expect(agent.setState).toBeDefined();
		expect(agent.clearMemory).toBeDefined();
	});

	it("should support custom model", () => {
		const agent = new AWSBedrockAgent("test-api-key", "anthropic.claude-3-haiku-20240307-v1:0");
		expect(agent).toBeDefined();
	});

	it("should support custom system prompt", () => {
		const agent = new AWSBedrockAgent(
			"test-api-key",
			"anthropic.claude-3-5-sonnet-20240620-v1:0",
			"Custom system prompt",
		);
		expect(agent).toBeDefined();
	});

	it("should support empty API key for environment-based credentials", () => {
		const agent = new AWSBedrockAgent("");
		expect(agent).toBeDefined();
	});

	it("should have state management methods", async () => {
		const agent = new AWSBedrockAgent("test-api-key");

		// Test state management
		const initialState = await agent.getState();
		expect(initialState).toBeDefined();
		expect(initialState.messages).toBeDefined();

		await agent.clearMemory();
		const clearedState = await agent.getState();
		expect(clearedState.messages).toEqual([]);
	});

	it("should return correct provider name", () => {
		const agent = new TestableAWSBedrockAgent("test-api-key");
		expect(agent.testGetProviderName()).toBe("aws_bedrock");
	});

	it("should return correct model name", () => {
		const agent = new TestableAWSBedrockAgent("test-api-key", "anthropic.claude-3-haiku-20240307-v1:0");
		expect(agent.testGetModelName()).toBe("anthropic.claude-3-haiku-20240307-v1:0");
	});

	it("should use AWS_REGION environment variable when set", () => {
		process.env.AWS_REGION = "eu-west-1";
		resetConfig();
		const agent = new AWSBedrockAgent("test-api-key");
		expect(agent).toBeDefined();
	});

	it("should use default region when AWS_REGION is not set", () => {
		delete process.env.AWS_REGION;
		resetConfig();
		const agent = new AWSBedrockAgent("test-api-key");
		expect(agent).toBeDefined();
	});
});
