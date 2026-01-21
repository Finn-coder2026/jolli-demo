import { getConfig } from "../../config/Config";
import type { Agent, AgentCreationConfig } from "./Agent";
import { LLMProvider } from "./Agent";
import { AnthropicAgent } from "./AnthropicAgent";
import { AWSBedrockAgent } from "./AWSBedrockAgent";
import { GoogleAgent } from "./GoogleAgent";
import { OpenAIAgent } from "./OpenAIAgent";

/**
 * Create an agent based on the provider configuration
 *
 * Example:
 * ```typescript
 * const agent = createAgent({
 *   provider: LLMProvider.OPENAI,
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: "gpt-4o-mini",
 * });
 * ```
 */
export function createAgent(config: AgentCreationConfig): Agent {
	const { provider, apiKey, model, defaultConfig } = config;

	if (!apiKey) {
		throw new Error(`API key is required for ${provider} provider`);
	}

	switch (provider) {
		case LLMProvider.OPENAI:
			return new OpenAIAgent(apiKey, model || "gpt-4o-mini", defaultConfig?.systemPrompt);

		case LLMProvider.ANTHROPIC:
			return new AnthropicAgent(apiKey, model || "claude-3-5-sonnet-20241022", defaultConfig?.systemPrompt);

		case LLMProvider.GOOGLE:
			return new GoogleAgent(apiKey, model || "gemini-pro", defaultConfig?.systemPrompt);

		case LLMProvider.AWS_BEDROCK:
			return new AWSBedrockAgent(
				apiKey,
				model || "anthropic.claude-3-5-sonnet-20240620-v1:0",
				defaultConfig?.systemPrompt,
			);

		default:
			throw new Error(`Unsupported provider: ${provider}`);
	}
}

/**
 * Create an agent from environment variables
 *
 * This function looks for standard environment variables:
 * - OPENAI_API_KEY for OpenAI
 * - ANTHROPIC_API_KEY for Anthropic
 * - LLM_PROVIDER to select the provider (defaults to "openai")
 * - LLM_MODEL to select the model
 */
export function createAgentFromEnv(): Agent {
	const config = getConfig();
	const provider = config.LLM_PROVIDER;
	const model = config.LLM_MODEL;

	let apiKey: string | undefined;

	switch (provider) {
		case LLMProvider.OPENAI:
			apiKey = config.OPENAI_API_KEY;
			break;
		case LLMProvider.ANTHROPIC:
			apiKey = config.ANTHROPIC_API_KEY;
			break;
		default:
			throw new Error(`Unsupported provider from env: ${provider}`);
	}

	if (!apiKey) {
		throw new Error(`API key not found in environment for provider: ${provider}`);
	}

	return createAgent({
		provider,
		apiKey,
		model,
	});
}
