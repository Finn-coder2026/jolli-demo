import { LLMProvider } from "./Agent";
import { createMultiAgent, createMultiAgentFromEnv, type MultiAgentConfig } from "./MultiAgentFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("MultiAgentFactory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("createMultiAgent", () => {
		it("should create multi-agent with round-robin router", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "gpt4",
						provider: LLMProvider.OPENAI,
						apiKey: "test-key",
						model: "gpt-4o-mini",
						metadata: {
							id: "gpt4",
							name: "GPT-4",
							description: "Fast general purpose AI",
							capabilities: ["general", "code"],
						},
					},
				],
				routingStrategy: "round-robin",
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});

		it("should create multi-agent with capability router", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "claude",
						provider: LLMProvider.ANTHROPIC,
						apiKey: "test-key",
						model: "claude-3-5-sonnet-20241022",
						metadata: {
							id: "claude",
							name: "Claude",
							description: "Advanced reasoning AI",
							capabilities: ["analysis"],
						},
					},
				],
				routingStrategy: "capability",
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});

		it("should create multi-agent with user-specified router", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "agent1",
						provider: LLMProvider.OPENAI,
						apiKey: "test-key",
						metadata: {
							id: "agent1",
							name: "Agent 1",
							description: "Test agent",
						},
					},
				],
				routingStrategy: "user-specified",
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});

		it("should create multi-agent with primary-fallback router", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "primary",
						provider: LLMProvider.OPENAI,
						apiKey: "test-key",
						metadata: {
							id: "primary",
							name: "Primary",
							description: "Primary agent",
						},
					},
					{
						id: "fallback",
						provider: LLMProvider.ANTHROPIC,
						apiKey: "test-key",
						metadata: {
							id: "fallback",
							name: "Fallback",
							description: "Fallback agent",
						},
					},
				],
				routingStrategy: "primary-fallback",
				primaryAgentId: "primary",
				fallbackAgentId: "fallback",
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});

		it("should throw error for primary-fallback without primary agent ID", () => {
			const config: MultiAgentConfig = {
				agents: [],
				routingStrategy: "primary-fallback",
				fallbackAgentId: "fallback",
			};

			expect(() => createMultiAgent(config)).toThrow(
				"primary-fallback routing requires primaryAgentId and fallbackAgentId",
			);
		});

		it("should throw error for primary-fallback without fallback agent ID", () => {
			const config: MultiAgentConfig = {
				agents: [],
				routingStrategy: "primary-fallback",
				primaryAgentId: "primary",
			};

			expect(() => createMultiAgent(config)).toThrow(
				"primary-fallback routing requires primaryAgentId and fallbackAgentId",
			);
		});

		it("should default to round-robin router for unknown strategy", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "agent1",
						provider: LLMProvider.OPENAI,
						apiKey: "test-key",
						metadata: {
							id: "agent1",
							name: "Agent 1",
							description: "Test agent",
						},
					},
				],
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});

		it("should handle OpenAI agent with default model", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "gpt",
						provider: LLMProvider.OPENAI,
						apiKey: "test-key",
						metadata: {
							id: "gpt",
							name: "GPT",
							description: "OpenAI agent",
						},
					},
				],
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});

		it("should handle Anthropic agent with default model", () => {
			const config: MultiAgentConfig = {
				agents: [
					{
						id: "claude",
						provider: LLMProvider.ANTHROPIC,
						apiKey: "test-key",
						metadata: {
							id: "claude",
							name: "Claude",
							description: "Anthropic agent",
						},
					},
				],
			};

			const multiAgent = createMultiAgent(config);
			expect(multiAgent).toBeDefined();
		});
	});

	describe("createMultiAgentFromEnv", () => {
		beforeEach(() => {
			// Clear all environment variables
			delete process.env.MULTI_AGENT_ENABLED;
			delete process.env.AGENT_IDS;
			delete process.env.ROUTING_STRATEGY;
			delete process.env.PRIMARY_AGENT_ID;
			delete process.env.FALLBACK_AGENT_ID;
			// Clear agent-specific environment variables
			delete process.env.AGENT_AGENT1_PROVIDER;
			delete process.env.AGENT_AGENT1_API_KEY;
			delete process.env.AGENT_AGENT1_MODEL;
			delete process.env.AGENT_AGENT1_NAME;
			delete process.env.AGENT_AGENT1_DESCRIPTION;
			delete process.env.AGENT_AGENT1_CAPABILITIES;
			delete process.env.AGENT_GPT4_PROVIDER;
			delete process.env.AGENT_GPT4_API_KEY;
			delete process.env.AGENT_GPT4_MODEL;
			delete process.env.AGENT_GPT4_NAME;
			delete process.env.AGENT_GPT4_DESCRIPTION;
			delete process.env.AGENT_GPT4_CAPABILITIES;
			delete process.env.AGENT_CLAUDE_PROVIDER;
			delete process.env.AGENT_CLAUDE_API_KEY;
			delete process.env.AGENT_AGENT2_PROVIDER;
			delete process.env.AGENT_AGENT2_API_KEY;
			delete process.env.AGENT_PRIMARY_PROVIDER;
			delete process.env.AGENT_PRIMARY_API_KEY;
			delete process.env.AGENT_FALLBACK_PROVIDER;
			delete process.env.AGENT_FALLBACK_API_KEY;
		});

		it("should return undefined if MULTI_AGENT_ENABLED is not true", () => {
			const result = createMultiAgentFromEnv();
			expect(result).toBeUndefined();
		});

		it("should throw error if AGENT_IDS is not set", () => {
			process.env.MULTI_AGENT_ENABLED = "true";

			expect(() => createMultiAgentFromEnv()).toThrow("MULTI_AGENT_ENABLED is true but AGENT_IDS is not set");
		});

		it("should throw error if agent provider is missing", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "agent1";
			process.env.AGENT_AGENT1_API_KEY = "test-key";

			expect(() => createMultiAgentFromEnv()).toThrow("Missing provider or API key for agent agent1");
		});

		it("should throw error if agent API key is missing", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "agent1";
			process.env.AGENT_AGENT1_PROVIDER = "openai";
			// API key is intentionally not set

			expect(() => createMultiAgentFromEnv()).toThrow("Missing provider or API key for agent agent1");
		});

		it("should create multi-agent from environment with single agent", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "gpt4";
			process.env.AGENT_GPT4_PROVIDER = "openai";
			process.env.AGENT_GPT4_API_KEY = "test-key";
			process.env.AGENT_GPT4_MODEL = "gpt-4o-mini";
			process.env.AGENT_GPT4_NAME = "GPT-4";
			process.env.AGENT_GPT4_DESCRIPTION = "Fast AI";
			process.env.AGENT_GPT4_CAPABILITIES = "code,documentation";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should create multi-agent from environment with multiple agents", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "gpt4,claude";
			process.env.AGENT_GPT4_PROVIDER = "openai";
			process.env.AGENT_GPT4_API_KEY = "test-key-1";
			process.env.AGENT_CLAUDE_PROVIDER = "anthropic";
			process.env.AGENT_CLAUDE_API_KEY = "test-key-2";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should use default routing strategy if not specified", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "agent1";
			process.env.AGENT_AGENT1_PROVIDER = "openai";
			process.env.AGENT_AGENT1_API_KEY = "test-key";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should use capability routing strategy", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "agent1";
			process.env.AGENT_AGENT1_PROVIDER = "openai";
			process.env.AGENT_AGENT1_API_KEY = "test-key";
			process.env.ROUTING_STRATEGY = "capability";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should use primary-fallback routing strategy", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "primary,fallback";
			process.env.AGENT_PRIMARY_PROVIDER = "openai";
			process.env.AGENT_PRIMARY_API_KEY = "test-key-1";
			process.env.AGENT_FALLBACK_PROVIDER = "anthropic";
			process.env.AGENT_FALLBACK_API_KEY = "test-key-2";
			process.env.ROUTING_STRATEGY = "primary-fallback";
			process.env.PRIMARY_AGENT_ID = "primary";
			process.env.FALLBACK_AGENT_ID = "fallback";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should use default name and description if not provided", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "agent1";
			process.env.AGENT_AGENT1_PROVIDER = "openai";
			process.env.AGENT_AGENT1_API_KEY = "test-key";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should handle agent IDs with whitespace", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = " agent1 , agent2 ";
			process.env.AGENT_AGENT1_PROVIDER = "openai";
			process.env.AGENT_AGENT1_API_KEY = "test-key-1";
			process.env.AGENT_AGENT2_PROVIDER = "anthropic";
			process.env.AGENT_AGENT2_API_KEY = "test-key-2";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});

		it("should handle capabilities with whitespace", () => {
			process.env.MULTI_AGENT_ENABLED = "true";
			process.env.AGENT_IDS = "agent1";
			process.env.AGENT_AGENT1_PROVIDER = "openai";
			process.env.AGENT_AGENT1_API_KEY = "test-key";
			process.env.AGENT_AGENT1_CAPABILITIES = " code , documentation , analysis ";

			const multiAgent = createMultiAgentFromEnv();
			expect(multiAgent).toBeDefined();
		});
	});
});
