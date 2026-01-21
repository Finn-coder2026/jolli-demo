import type { AgentStreamChunk, ChatMessage } from "./Agent";
import { BaseLangGraphAgent } from "./BaseLangGraphAgent";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Concrete test implementation of BaseLangGraphAgent
class TestLangGraphAgent extends BaseLangGraphAgent {
	// biome-ignore lint/complexity/noUselessConstructor: Need to call protected parent constructor
	constructor(llm: BaseChatModel, systemPrompt?: string) {
		super(llm, systemPrompt);
	}

	protected getProviderName(): string {
		return "test-provider";
	}

	protected getModelName(): string {
		return "test-model";
	}
}

describe("BaseLangGraphAgent", () => {
	let mockLLM: BaseChatModel;

	beforeEach(() => {
		// Mock LLM
		mockLLM = {
			invoke: vi.fn().mockResolvedValue(new AIMessage("Test response")),
			stream: vi.fn(async function* () {
				await Promise.resolve();
				yield { content: "Test " };
				yield { content: "response" };
			}),
			withConfig: vi.fn(function (this: BaseChatModel) {
				return this;
			}),
		} as unknown as BaseChatModel;
	});

	describe("Construction", () => {
		it("should create agent with default system prompt", () => {
			const agent = new TestLangGraphAgent(mockLLM);
			expect(agent).toBeDefined();
		});

		it("should create agent with custom system prompt", () => {
			const agent = new TestLangGraphAgent(mockLLM, "Custom prompt");
			expect(agent).toBeDefined();
		});
	});

	describe("invoke", () => {
		it("should invoke LLM and return response", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const response = await agent.invoke(messages);

			expect(response.content).toBe("Test response");
			expect(response.metadata?.provider).toBe("test-provider");
			expect(response.metadata?.model).toBe("test-model");
			expect(mockLLM.invoke).toHaveBeenCalled();
		});

		it("should convert chat messages to LangChain messages", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi!" },
				{ role: "user", content: "How are you?" },
			];

			await agent.invoke(messages);

			expect(mockLLM.invoke).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.any(SystemMessage),
					expect.any(HumanMessage),
					expect.any(AIMessage),
					expect.any(HumanMessage),
				]),
			);
		});

		it("should handle system messages in input", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "Hello" },
			];

			await agent.invoke(messages);

			expect(mockLLM.invoke).toHaveBeenCalled();
		});

		it("should apply temperature config", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			await agent.invoke(messages, { temperature: 0.5 });

			expect(mockLLM.withConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 0.5,
				}),
			);
		});

		it("should apply maxTokens config", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			await agent.invoke(messages, { maxTokens: 100 });

			expect(mockLLM.withConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					max_tokens: 100,
				}),
			);
		});

		it("should apply both temperature and maxTokens config", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			await agent.invoke(messages, { temperature: 0.7, maxTokens: 200 });

			expect(mockLLM.withConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 0.7,
					max_tokens: 200,
				}),
			);
		});

		it("should use custom system prompt from config", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			await agent.invoke(messages, { systemPrompt: "Custom config prompt" });

			expect(mockLLM.invoke).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ content: expect.stringContaining("Custom config prompt") }),
				]),
			);
		});

		it("should handle non-string content in LLM response", async () => {
			const mockLLMWithArrayContent = {
				invoke: vi.fn().mockResolvedValue({ content: 123 }),
				stream: vi.fn(),
				withConfig: vi.fn(function (this: BaseChatModel) {
					return this;
				}),
			} as unknown as BaseChatModel;

			const agent = new TestLangGraphAgent(mockLLMWithArrayContent);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const response = await agent.invoke(messages);

			expect(response.content).toBe("");
		});
	});

	describe("stream", () => {
		it("should stream LLM response", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const chunks: Array<AgentStreamChunk> = [];
			for await (const chunk of agent.stream(messages)) {
				chunks.push(chunk);
			}

			expect(chunks.length).toBeGreaterThan(0);
			expect(chunks.some(c => c.type === "content")).toBe(true);
			expect(chunks.some(c => c.type === "done")).toBe(true);
		});

		it("should include metadata in done chunk", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const chunks: Array<AgentStreamChunk> = [];
			for await (const chunk of agent.stream(messages)) {
				chunks.push(chunk);
			}

			const doneChunk = chunks.find(c => c.type === "done");
			expect(doneChunk?.metadata?.provider).toBe("test-provider");
			expect(doneChunk?.metadata?.model).toBe("test-model");
		});

		it("should apply config when streaming", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const chunks: Array<AgentStreamChunk> = [];
			for await (const chunk of agent.stream(messages, { temperature: 0.8 })) {
				chunks.push(chunk);
			}

			expect(mockLLM.withConfig).toHaveBeenCalled();
		});

		it("should handle non-string content in streaming chunks", async () => {
			const mockLLMWithArrayContent = {
				invoke: vi.fn(),
				stream: vi.fn(async function* () {
					await Promise.resolve();
					yield { content: 123 };
					yield { content: null };
					yield { content: "valid string" };
				}),
				withConfig: vi.fn(function (this: BaseChatModel) {
					return this;
				}),
			} as unknown as BaseChatModel;

			const agent = new TestLangGraphAgent(mockLLMWithArrayContent);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const chunks: Array<AgentStreamChunk> = [];
			for await (const chunk of agent.stream(messages)) {
				chunks.push(chunk);
			}

			// Should only include chunks with string content and done chunk
			const contentChunks = chunks.filter(c => c.type === "content");
			expect(contentChunks.length).toBe(1);
			expect(contentChunks[0].content).toBe("valid string");
		});
	});

	describe("State management", () => {
		it("should get current state", async () => {
			const agent = new TestLangGraphAgent(mockLLM);

			const state = await agent.getState();

			expect(state).toBeDefined();
			expect(state.messages).toBeDefined();
		});

		it("should set state", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const newState = { messages: [new HumanMessage("Test")] };

			await agent.setState(newState);
			const state = await agent.getState();

			expect(state).toEqual(newState);
		});

		it("should clear memory", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			await agent.invoke(messages);
			await agent.clearMemory();

			const state = await agent.getState();
			expect(state.messages).toEqual([]);
		});

		it("should update state after invoke", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			await agent.invoke(messages);
			const state = await agent.getState();

			expect(state.messages.length).toBeGreaterThan(0);
		});

		it("should update state during streaming", async () => {
			const agent = new TestLangGraphAgent(mockLLM);
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			for await (const _chunk of agent.stream(messages)) {
				// Just consume the stream
			}

			const state = await agent.getState();
			expect(state.messages.length).toBeGreaterThan(0);
		});
	});
});
