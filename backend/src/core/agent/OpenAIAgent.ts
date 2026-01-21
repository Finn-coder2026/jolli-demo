import { BaseLangGraphAgent } from "./BaseLangGraphAgent";
import { ChatOpenAI } from "@langchain/openai";

/**
 * OpenAI-specific agent implementation
 *
 * Supports all OpenAI models including:
 * - GPT-4o
 * - GPT-4o-mini
 * - GPT-4 Turbo
 * - GPT-3.5 Turbo
 */
export class OpenAIAgent extends BaseLangGraphAgent {
	private readonly modelName: string;

	constructor(apiKey: string, model = "gpt-4o-mini", systemPrompt?: string) {
		const llm = new ChatOpenAI({
			apiKey,
			model,
			streaming: true,
		});

		super(llm, systemPrompt);
		this.modelName = model;
	}

	protected getProviderName(): string {
		return "openai";
	}

	protected getModelName(): string {
		return this.modelName;
	}
}
