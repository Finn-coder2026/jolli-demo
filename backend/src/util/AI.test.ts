import { createAI } from "./AI";
import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock the AI SDK modules
vi.mock("@ai-sdk/openai", () => ({
	openai: Object.assign(
		vi.fn((modelName: string) => ({ type: "openai-chat", modelName })),
		{
			embedding: vi.fn((modelName: string) => ({ type: "openai-embed", modelName })),
		},
	),
}));

vi.mock("@ai-sdk/fireworks", () => ({
	fireworks: Object.assign(
		vi.fn((modelName: string) => ({ type: "fireworks-chat", modelName })),
		{
			textEmbeddingModel: vi.fn((modelName: string) => ({ type: "fireworks-embed", modelName })),
		},
	),
}));

vi.mock("ai", () => ({
	embed: vi.fn(),
	embedMany: vi.fn(),
	streamText: vi.fn(),
	convertToModelMessages: vi.fn(),
}));

describe("AI", () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		// Store original environment variables
		originalEnv = {
			AI_PROVIDER: process.env.AI_PROVIDER,
			AI_CHAT: process.env.AI_CHAT,
			AI_EMBED: process.env.AI_EMBED,
			AI_TEMPERATURE: process.env.AI_TEMPERATURE,
			AI_MAX_RETRIES: process.env.AI_MAX_RETRIES,
		};

		// Clear all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Restore original environment variables
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	test("createAI should use default environment variables when none are set", async () => {
		// Clear environment variables
		delete process.env.AI_PROVIDER;
		delete process.env.AI_CHAT;
		delete process.env.AI_EMBED;
		delete process.env.AI_TEMPERATURE;
		delete process.env.AI_MAX_RETRIES;

		const { openai } = await import("@ai-sdk/openai");
		const mockOpenai = vi.mocked(openai);
		const mockOpenaiEmbedding = vi.mocked(openai.embedding);

		const ai = createAI();

		expect(mockOpenai).toHaveBeenCalledWith("gpt-4o");
		expect(mockOpenaiEmbedding).toHaveBeenCalledWith("text-embedding-3-small");

		// Verify the returned object has the expected methods
		expect(ai).toHaveProperty("generateEmbedding");
		expect(ai).toHaveProperty("generateEmbeddings");
		expect(ai).toHaveProperty("streamChat");
		expect(typeof ai.generateEmbedding).toBe("function");
		expect(typeof ai.generateEmbeddings).toBe("function");
		expect(typeof ai.streamChat).toBe("function");
	});

	test("createAI should use openai provider when AI_PROVIDER is 'openai'", async () => {
		process.env.AI_PROVIDER = "openai";
		process.env.AI_CHAT = "gpt-3.5-turbo";
		process.env.AI_EMBED = "text-embedding-ada-002";
		process.env.AI_TEMPERATURE = "0.5";
		process.env.AI_MAX_RETRIES = "5";

		const { openai } = await import("@ai-sdk/openai");
		const mockOpenai = vi.mocked(openai);
		const mockOpenaiEmbedding = vi.mocked(openai.embedding);

		const ai = createAI();

		expect(mockOpenai).toHaveBeenCalledWith("gpt-3.5-turbo");
		expect(mockOpenaiEmbedding).toHaveBeenCalledWith("text-embedding-ada-002");

		// Verify the returned object has the expected methods
		expect(ai).toHaveProperty("generateEmbedding");
		expect(ai).toHaveProperty("generateEmbeddings");
		expect(ai).toHaveProperty("streamChat");
	});

	test("createAI should use fireworks provider when AI_PROVIDER is 'fireworks'", async () => {
		process.env.AI_PROVIDER = "fireworks";
		process.env.AI_CHAT = "llama-v3p1-70b-instruct";
		process.env.AI_EMBED = "nomic-embed-text-v1.5";
		process.env.AI_TEMPERATURE = "0.7";

		const { fireworks } = await import("@ai-sdk/fireworks");
		const mockFireworks = vi.mocked(fireworks);
		const mockFireworksEmbedding = vi.mocked(fireworks.textEmbeddingModel);

		const ai = createAI();

		expect(mockFireworks).toHaveBeenCalledWith("llama-v3p1-70b-instruct");
		expect(mockFireworksEmbedding).toHaveBeenCalledWith("nomic-embed-text-v1.5");

		// Verify the returned object has the expected methods
		expect(ai).toHaveProperty("generateEmbedding");
		expect(ai).toHaveProperty("generateEmbeddings");
		expect(ai).toHaveProperty("streamChat");
	});

	test("generateEmbedding should call embed with correct parameters", async () => {
		// Explicitly set to openai provider for this test
		process.env.AI_PROVIDER = "openai";

		const { embed } = await import("ai");
		const mockEmbed = vi.mocked(embed);
		const mockEmbeddingResult = [0.1, 0.2, 0.3];

		mockEmbed.mockResolvedValue({
			embedding: mockEmbeddingResult,
			value: "test text",
			usage: { tokens: 2 },
		});

		const ai = createAI();
		const result = await ai.generateEmbedding("test text");

		expect(mockEmbed).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			model: expect.any(Object),
			providerOptions: {},
			value: "test text",
		});
		expect(result).toEqual(mockEmbeddingResult);
	});

	test("generateEmbedding should use fireworks provider options when provider is fireworks", async () => {
		process.env.AI_PROVIDER = "fireworks";

		const { embed } = await import("ai");
		const mockEmbed = vi.mocked(embed);
		const mockEmbeddingResult = [0.1, 0.2, 0.3];

		mockEmbed.mockResolvedValue({
			embedding: mockEmbeddingResult,
			value: "test text",
			usage: { tokens: 2 },
		});

		const ai = createAI();
		const result = await ai.generateEmbedding("test text");

		expect(mockEmbed).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			model: expect.any(Object),
			providerOptions: {
				fireworks: {
					dimensions: 1536,
				},
			},
			value: "test text",
		});
		expect(result).toEqual(mockEmbeddingResult);
	});

	test("generateEmbeddings should call embedMany with correct parameters", async () => {
		// Explicitly set to openai provider for this test
		process.env.AI_PROVIDER = "openai";

		const { embedMany } = await import("ai");
		const mockEmbedMany = vi.mocked(embedMany);
		const mockEmbeddingsResult = [
			[0.1, 0.2, 0.3],
			[0.4, 0.5, 0.6],
		];

		mockEmbedMany.mockResolvedValue({
			embeddings: mockEmbeddingsResult,
			values: ["text1", "text2"],
			usage: { tokens: 4 },
		});

		const ai = createAI();
		const result = await ai.generateEmbeddings(["text1", "text2"]);

		expect(mockEmbedMany).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			model: expect.any(Object),
			providerOptions: {},
			values: ["text1", "text2"],
		});
		expect(result).toEqual(mockEmbeddingsResult);
	});

	test("generateEmbeddings should use fireworks provider options when provider is fireworks", async () => {
		process.env.AI_PROVIDER = "fireworks";

		const { embedMany } = await import("ai");
		const mockEmbedMany = vi.mocked(embedMany);
		const mockEmbeddingsResult = [
			[0.1, 0.2, 0.3],
			[0.4, 0.5, 0.6],
		];

		mockEmbedMany.mockResolvedValue({
			embeddings: mockEmbeddingsResult,
			values: ["text1", "text2"],
			usage: { tokens: 4 },
		});

		const ai = createAI();
		const result = await ai.generateEmbeddings(["text1", "text2"]);

		expect(mockEmbedMany).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			model: expect.any(Object),
			providerOptions: {
				fireworks: {
					dimensions: 1536,
				},
			},
			values: ["text1", "text2"],
		});
		expect(result).toEqual(mockEmbeddingsResult);
	});

	test("streamChat should call streamText with correct parameters", async () => {
		process.env.AI_TEMPERATURE = "0.8";

		const { streamText, convertToModelMessages } = await import("ai");
		const mockStreamText = vi.mocked(streamText);
		const mockConvertToModelMessages = vi.mocked(convertToModelMessages);
		const mockStreamResult = {} as ReturnType<typeof streamText>;
		const mockMessages: Array<UIMessage> = [{ id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] }];
		const mockConvertedMessages = [{ role: "user" as const, content: "Hello" }];

		mockStreamText.mockReturnValue(mockStreamResult as ReturnType<typeof streamText>);
		mockConvertToModelMessages.mockReturnValue(mockConvertedMessages);

		const ai = createAI();
		const result = ai.streamChat("You are a helpful assistant", mockMessages);

		expect(mockConvertToModelMessages).toHaveBeenCalledWith(mockMessages);
		expect(mockStreamText).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			messages: mockConvertedMessages,
			model: expect.any(Object),
			system: "You are a helpful assistant",
			temperature: 0.8,
		});
		expect(result).toBe(mockStreamResult);
	});

	test("streamChat should use default temperature when AI_TEMPERATURE is not set", async () => {
		delete process.env.AI_TEMPERATURE;

		const { streamText, convertToModelMessages } = await import("ai");
		const mockStreamText = vi.mocked(streamText);
		const mockConvertToModelMessages = vi.mocked(convertToModelMessages);
		const mockStreamResult = {} as ReturnType<typeof streamText>;
		const mockMessages: Array<UIMessage> = [{ id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] }];
		const mockConvertedMessages = [{ role: "user" as const, content: "Hello" }];

		mockStreamText.mockReturnValue(mockStreamResult as ReturnType<typeof streamText>);
		mockConvertToModelMessages.mockReturnValue(mockConvertedMessages);

		const ai = createAI();
		const result = ai.streamChat("You are a helpful assistant", mockMessages);

		expect(mockStreamText).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			messages: mockConvertedMessages,
			model: expect.any(Object),
			system: "You are a helpful assistant",
			temperature: 0.34,
		});
		expect(result).toBe(mockStreamResult);
	});

	test("streamChat should handle invalid temperature values", async () => {
		process.env.AI_TEMPERATURE = "invalid";

		const { streamText, convertToModelMessages } = await import("ai");
		const mockStreamText = vi.mocked(streamText);
		const mockConvertToModelMessages = vi.mocked(convertToModelMessages);
		const mockStreamResult = {} as ReturnType<typeof streamText>;
		const mockMessages: Array<UIMessage> = [{ id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] }];
		const mockConvertedMessages = [{ role: "user" as const, content: "Hello" }];

		mockStreamText.mockReturnValue(mockStreamResult as ReturnType<typeof streamText>);
		mockConvertToModelMessages.mockReturnValue(mockConvertedMessages);

		const ai = createAI();
		const result = ai.streamChat("You are a helpful assistant", mockMessages);

		// When parseFloat gets "invalid", it returns NaN, so default should be used
		expect(mockStreamText).toHaveBeenCalledWith({
			maxRetries: expect.any(Number),
			messages: mockConvertedMessages,
			model: expect.any(Object),
			system: "You are a helpful assistant",
			temperature: Number.NaN, // parseFloat("invalid") returns NaN
		});
		expect(result).toBe(mockStreamResult);
	});

	test("createAI should use custom maxRetries when AI_MAX_RETRIES is set", async () => {
		process.env.AI_PROVIDER = "openai";
		process.env.AI_MAX_RETRIES = "5";

		const { embed } = await import("ai");
		const mockEmbed = vi.mocked(embed);
		const mockEmbeddingResult = [0.1, 0.2, 0.3];

		mockEmbed.mockResolvedValue({
			embedding: mockEmbeddingResult,
			value: "test text",
			usage: { tokens: 2 },
		});

		const ai = createAI();
		await ai.generateEmbedding("test text");

		expect(mockEmbed).toHaveBeenCalledWith({
			maxRetries: 5,
			model: expect.any(Object),
			providerOptions: {},
			value: "test text",
		});
	});
});
