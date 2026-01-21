import { resetConfig } from "../../config/Config";
import { LLMProvider } from "./Agent";
import { createAgent, createAgentFromEnv } from "./AgentFactory";
import { AnthropicAgent } from "./AnthropicAgent";
import { AWSBedrockAgent } from "./AWSBedrockAgent";
import { GoogleAgent } from "./GoogleAgent";
import { OpenAIAgent } from "./OpenAIAgent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Agent Factory", () => {
	let originalLlmProvider: string | undefined;
	let originalOpenAiKey: string | undefined;
	let originalAnthropicKey: string | undefined;
	let originalGoogleKey: string | undefined;
	let originalAwsSecretKey: string | undefined;

	beforeEach(() => {
		// Save original environment
		originalLlmProvider = process.env.LLM_PROVIDER;
		originalOpenAiKey = process.env.OPENAI_API_KEY;
		originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
		originalGoogleKey = process.env.GOOGLE_API_KEY;
		originalAwsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
		// Set AWS_SECRET_ACCESS_KEY for AWS Bedrock tests
		process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
	});

	afterEach(() => {
		// Restore original environment
		if (originalLlmProvider !== undefined) {
			process.env.LLM_PROVIDER = originalLlmProvider;
		} else {
			delete process.env.LLM_PROVIDER;
		}
		if (originalOpenAiKey !== undefined) {
			process.env.OPENAI_API_KEY = originalOpenAiKey;
		} else {
			delete process.env.OPENAI_API_KEY;
		}
		if (originalAnthropicKey !== undefined) {
			process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
		} else {
			delete process.env.ANTHROPIC_API_KEY;
		}
		if (originalGoogleKey !== undefined) {
			process.env.GOOGLE_API_KEY = originalGoogleKey;
		} else {
			delete process.env.GOOGLE_API_KEY;
		}
		if (originalAwsSecretKey !== undefined) {
			process.env.AWS_SECRET_ACCESS_KEY = originalAwsSecretKey;
		} else {
			delete process.env.AWS_SECRET_ACCESS_KEY;
		}
		resetConfig();
	});

	describe("createAgent", () => {
		it("should create an OpenAI agent with specified model", () => {
			const agent = createAgent({
				provider: LLMProvider.OPENAI,
				apiKey: "test-key",
				model: "gpt-4o",
			});

			expect(agent).toBeInstanceOf(OpenAIAgent);
		});

		it("should create an OpenAI agent with default model", () => {
			const agent = createAgent({
				provider: LLMProvider.OPENAI,
				apiKey: "test-key",
			});

			expect(agent).toBeInstanceOf(OpenAIAgent);
		});

		it("should create an Anthropic agent with specified model", () => {
			const agent = createAgent({
				provider: LLMProvider.ANTHROPIC,
				apiKey: "test-key",
				model: "claude-3-opus-20240229",
			});

			expect(agent).toBeInstanceOf(AnthropicAgent);
		});

		it("should create an Anthropic agent with default model", () => {
			const agent = createAgent({
				provider: LLMProvider.ANTHROPIC,
				apiKey: "test-key",
			});

			expect(agent).toBeInstanceOf(AnthropicAgent);
		});

		it("should throw error if API key is missing", () => {
			expect(() => {
				createAgent({
					provider: LLMProvider.OPENAI,
					apiKey: "",
				});
			}).toThrow("API key is required");
		});

		it("should create a Google agent with specified model", () => {
			const agent = createAgent({
				provider: LLMProvider.GOOGLE,
				apiKey: "test-key",
				model: "gemini-pro",
			});

			expect(agent).toBeInstanceOf(GoogleAgent);
		});

		it("should create a Google agent with default model", () => {
			const agent = createAgent({
				provider: LLMProvider.GOOGLE,
				apiKey: "test-key",
			});

			expect(agent).toBeInstanceOf(GoogleAgent);
		});

		it("should create an AWS Bedrock agent with specified model", () => {
			const agent = createAgent({
				provider: LLMProvider.AWS_BEDROCK,
				apiKey: "test-key",
				model: "anthropic.claude-3-haiku-20240307-v1:0",
			});

			expect(agent).toBeInstanceOf(AWSBedrockAgent);
		});

		it("should create an AWS Bedrock agent with default model", () => {
			const agent = createAgent({
				provider: LLMProvider.AWS_BEDROCK,
				apiKey: "test-key",
			});

			expect(agent).toBeInstanceOf(AWSBedrockAgent);
		});

		it("should throw error for unknown provider", () => {
			expect(() => {
				createAgent({
					provider: "unknown" as LLMProvider,
					apiKey: "test-key",
				});
			}).toThrow("Unsupported provider");
		});

		it("should create an OpenAI agent with custom system prompt", () => {
			const agent = createAgent({
				provider: LLMProvider.OPENAI,
				apiKey: "test-key",
				model: "gpt-4o",
				defaultConfig: {
					systemPrompt: "You are a helpful assistant",
				},
			});

			expect(agent).toBeInstanceOf(OpenAIAgent);
		});

		it("should create an Anthropic agent with custom system prompt", () => {
			const agent = createAgent({
				provider: LLMProvider.ANTHROPIC,
				apiKey: "test-key",
				model: "claude-3-opus-20240229",
				defaultConfig: {
					systemPrompt: "You are a helpful assistant",
				},
			});

			expect(agent).toBeInstanceOf(AnthropicAgent);
		});

		it("should create a Google agent with custom system prompt", () => {
			const agent = createAgent({
				provider: LLMProvider.GOOGLE,
				apiKey: "test-key",
				model: "gemini-pro",
				defaultConfig: {
					systemPrompt: "You are a helpful assistant",
				},
			});

			expect(agent).toBeInstanceOf(GoogleAgent);
		});

		it("should create an AWS Bedrock agent with custom system prompt", () => {
			const agent = createAgent({
				provider: LLMProvider.AWS_BEDROCK,
				apiKey: "test-key",
				model: "anthropic.claude-3-haiku-20240307-v1:0",
				defaultConfig: {
					systemPrompt: "You are a helpful assistant",
				},
			});

			expect(agent).toBeInstanceOf(AWSBedrockAgent);
		});
	});

	describe("createAgentFromEnv", () => {
		it("should create OpenAI agent from environment variables", () => {
			process.env.OPENAI_API_KEY = "test-openai-key";
			process.env.LLM_PROVIDER = "openai";
			resetConfig();

			const agent = createAgentFromEnv();

			expect(agent).toBeInstanceOf(OpenAIAgent);
		});

		it("should create Anthropic agent from environment variables", () => {
			process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
			process.env.LLM_PROVIDER = "anthropic";
			resetConfig();

			const agent = createAgentFromEnv();

			expect(agent).toBeInstanceOf(AnthropicAgent);
		});

		it("should default to OpenAI if no provider specified", () => {
			delete process.env.LLM_PROVIDER;
			process.env.OPENAI_API_KEY = "test-key";
			resetConfig();

			const agent = createAgentFromEnv();

			expect(agent).toBeInstanceOf(OpenAIAgent);
		});

		it("should throw error if API key not found in environment", () => {
			process.env.LLM_PROVIDER = "openai";
			delete process.env.OPENAI_API_KEY;
			resetConfig();

			expect(() => {
				createAgentFromEnv();
			}).toThrow("API key not found in environment");
		});

		it("should throw error for unsupported provider in environment", () => {
			process.env.LLM_PROVIDER = "google";
			process.env.GOOGLE_API_KEY = "test-key";
			resetConfig();

			expect(() => {
				createAgentFromEnv();
			}).toThrow("Unsupported provider from env");
		});
	});
});
