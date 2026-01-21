import { BaseLangGraphAgent } from "./BaseLangGraphAgent";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

/**
 * Google Gemini-specific agent implementation
 *
 * Supports Google Gemini models including:
 * - Gemini Pro
 * - Gemini Pro Vision
 * - Gemini Ultra (when available)
 */
export class GoogleAgent extends BaseLangGraphAgent {
	private readonly modelName: string;

	constructor(apiKey: string, model = "gemini-pro", systemPrompt?: string) {
		const llm = new ChatGoogleGenerativeAI({
			apiKey,
			model,
			streaming: true,
		});

		super(llm, systemPrompt);
		this.modelName = model;
	}

	protected getProviderName(): string {
		return "google";
	}

	protected getModelName(): string {
		return this.modelName;
	}
}
