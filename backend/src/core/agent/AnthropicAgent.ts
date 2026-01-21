import { BaseLangGraphAgent } from "./BaseLangGraphAgent";
import { ChatAnthropic } from "@langchain/anthropic";

/**
 * Anthropic-specific agent implementation
 *
 * Supports Claude models including:
 * - Claude 3.5 Sonnet
 * - Claude 3 Opus
 * - Claude 3 Sonnet
 * - Claude 3 Haiku
 */
export class AnthropicAgent extends BaseLangGraphAgent {
	private readonly modelName: string;

	constructor(apiKey: string, model = "claude-3-5-sonnet-20241022", systemPrompt?: string) {
		const llm = new ChatAnthropic({
			apiKey,
			model,
			streaming: true,
		});

		super(llm, systemPrompt);
		this.modelName = model;
	}

	protected getProviderName(): string {
		return "anthropic";
	}

	protected getModelName(): string {
		return this.modelName;
	}
}
