import { fireworks } from "@ai-sdk/fireworks";
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, embed, embedMany, streamText, type UIMessage } from "ai";

export interface AI {
	generateEmbedding(text: string): Promise<Array<number>>;
	generateEmbeddings(texts: Array<string>): Promise<Array<Array<number>>>;
	streamChat(system: string, messages: Array<UIMessage>): ReturnType<typeof streamText>;
}

export function createAI(): AI {
	const provider = process.env.AI_PROVIDER || "openai";
	const chatModelName = process.env.AI_CHAT || "gpt-4o";
	const embedModelName = process.env.AI_EMBED || "text-embedding-3-small";
	const maxRetries = Number.parseInt(process.env.AI_MAX_RETRIES || "3");
	const temperature = Number.parseFloat(process.env.AI_TEMPERATURE || "0.34");

	let chatModel = openai(chatModelName);
	let embedModel = openai.embedding(embedModelName);
	let providerOptions = {};

	if (provider === "fireworks") {
		chatModel = fireworks(chatModelName);
		embedModel = fireworks.textEmbeddingModel(embedModelName);
		providerOptions = {
			fireworks: {
				dimensions: 1536,
			},
		};
	}

	return {
		generateEmbedding,
		generateEmbeddings,
		streamChat,
	};

	async function generateEmbedding(text: string): Promise<Array<number>> {
		const { embedding } = await embed({
			maxRetries,
			model: embedModel,
			providerOptions,
			value: text,
		});

		return embedding;
	}

	async function generateEmbeddings(texts: Array<string>): Promise<Array<Array<number>>> {
		const { embeddings } = await embedMany({
			maxRetries,
			model: embedModel,
			providerOptions,
			values: texts,
		});

		return embeddings;
	}

	function streamChat(system: string, messages: Array<UIMessage>): ReturnType<typeof streamText> {
		return streamText({
			maxRetries,
			messages: convertToModelMessages(messages),
			model: chatModel,
			system,
			temperature,
		});
	}
}
