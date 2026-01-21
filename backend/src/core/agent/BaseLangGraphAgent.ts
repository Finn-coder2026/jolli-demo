import type { TenantOrgContext } from "../../tenant/TenantContext";
import type { Agent, AgentConfig, AgentResponse, AgentState, AgentStreamChunk, ChatMessage } from "./Agent";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { MemorySaver } from "@langchain/langgraph";

const defaultSystemPrompt: string = [
	"You are a helpful AI assistant for the Jolli documentation platform",
	"Help users with questions about their documentation, code, and general software development topics",
].join(". ");

/**
 * Base implementation of Agent using LangGraph
 *
 * This class provides the core functionality for building stateful agents
 * with LangGraph, including:
 * - Memory management
 * - State persistence
 * - Streaming support
 * - Tool integration (extensible by subclasses)
 *
 * Note: Advanced StateGraph features (multi-agent orchestration, tools, etc.)
 * can be implemented in subclasses by overriding the buildGraph method.
 */
export abstract class BaseLangGraphAgent implements Agent {
	protected llm: BaseChatModel;
	protected memory: MemorySaver;
	protected defaultSystemPrompt: string;
	protected currentState: AgentState;

	protected constructor(llm: BaseChatModel, systemPrompt = defaultSystemPrompt) {
		this.llm = llm;
		this.memory = new MemorySaver();
		this.defaultSystemPrompt = systemPrompt;
		this.currentState = { messages: [] };
	}

	/**
	 * Convert ChatMessage to LangChain BaseMessage
	 */
	protected convertToBaseMessages(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		_tenantContext?: TenantOrgContext,
	): Array<BaseMessage> {
		const baseMessages: Array<BaseMessage> = [];

		// Build system prompt
		const systemPrompt = config?.systemPrompt || this.defaultSystemPrompt;

		// Add system message if provided
		if (systemPrompt) {
			baseMessages.push(new SystemMessage(systemPrompt));
		}

		// Convert chat messages
		for (const msg of messages) {
			if (msg.role === "user") {
				baseMessages.push(new HumanMessage(msg.content));
			} else if (msg.role === "assistant") {
				baseMessages.push(new AIMessage(msg.content));
			} else if (msg.role === "system") {
				baseMessages.push(new SystemMessage(msg.content));
			}
		}

		return baseMessages;
	}

	/**
	 * Apply configuration to the LLM
	 */
	protected configureLLM(config?: AgentConfig): Runnable {
		let configuredLLM: Runnable = this.llm;

		if (config?.temperature !== undefined || config?.maxTokens !== undefined) {
			const bindConfig: Record<string, unknown> = {};
			if (config.temperature !== undefined) {
				bindConfig.temperature = config.temperature;
			}
			if (config.maxTokens !== undefined) {
				bindConfig.max_tokens = config.maxTokens;
			}
			configuredLLM = this.llm.withConfig(bindConfig);
		}

		return configuredLLM;
	}

	async invoke(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		tenantContext?: TenantOrgContext,
	): Promise<AgentResponse> {
		const baseMessages = this.convertToBaseMessages(messages, config, tenantContext);
		const configuredLLM = this.configureLLM(config);

		// Update state with new messages
		this.currentState = { messages: baseMessages };

		// Invoke the LLM directly for simpler, more reliable execution
		const response = await configuredLLM.invoke(baseMessages);
		const content = typeof response.content === "string" ? response.content : "";

		// Update state with response
		this.currentState = { messages: [...baseMessages, response] };

		return {
			content,
			metadata: {
				provider: this.getProviderName(),
				model: this.getModelName(),
			},
		};
	}

	async *stream(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		tenantContext?: TenantOrgContext,
	): AsyncGenerator<AgentStreamChunk> {
		const baseMessages = this.convertToBaseMessages(messages, config, tenantContext);
		const configuredLLM = this.configureLLM(config);

		// Update state
		this.currentState = { messages: baseMessages };

		// Stream using LLM directly for token-by-token streaming
		const stream = await configuredLLM.stream(baseMessages);

		for await (const chunk of stream) {
			const content = typeof chunk.content === "string" ? chunk.content : "";

			if (content) {
				yield {
					type: "content",
					content,
				};
			}
		}

		// Send done signal
		yield {
			type: "done",
			metadata: {
				provider: this.getProviderName(),
				model: this.getModelName(),
			},
		};
	}

	getState(): Promise<AgentState> {
		return Promise.resolve(this.currentState);
	}

	setState(state: AgentState): Promise<void> {
		this.currentState = state;
		return Promise.resolve();
	}

	clearMemory(): Promise<void> {
		this.currentState = { messages: [] };
		this.memory = new MemorySaver();
		return Promise.resolve();
	}

	/**
	 * Get the provider name (implemented by subclasses)
	 */
	protected abstract getProviderName(): string;

	/**
	 * Get the model name (implemented by subclasses)
	 */
	protected abstract getModelName(): string;
}
