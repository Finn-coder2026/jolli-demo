import type { TenantOrgContext } from "../../tenant/TenantContext";
import type { BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";

/**
 * Request Body Format for chat interactions
 */
export interface ChatRequest {
	chatMessages: Array<ChatMessage>;
	agentConfig: AgentConfig;
}

/**
 * Message format for chat interactions
 */
export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
}

/**
 * Configuration for agent behavior
 */
export interface AgentConfig {
	/**
	 * Temperature for response generation (0.0 - 1.0)
	 */
	temperature?: number;

	/**
	 * Maximum tokens in response
	 */
	maxTokens?: number;

	/**
	 * Model to use (e.g., "gpt-4o-mini", "claude-3-5-sonnet-20241022")
	 */
	model?: string;

	/**
	 * System prompt to set agent behavior
	 */
	systemPrompt?: string;

	/**
	 * Enable tools/function calling
	 */
	enableTools?: boolean;

	/**
	 * Custom configuration passed to LangGraph
	 */
	runnableConfig?: RunnableConfig;
}

/**
 * Agent state for maintaining convo context
 */
export interface AgentState {
	messages: Array<BaseMessage>;
	// Additional custom state can be added by implementations
	[key: string]: unknown;
}

/**
 * Result from agent execution
 */
export interface AgentResponse {
	content: string;
	toolCalls?: Array<ToolCall>;
	metadata?: Record<string, unknown>;
}

/**
 * Tool call information
 */
export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * Streaming chunk from agent
 */
export interface AgentStreamChunk {
	type: "content" | "tool_call" | "metadata" | "done";
	content?: string;
	toolCall?: ToolCall;
	metadata?: Record<string, unknown>;
}

/**
 * Core Agent interface for chat interactions
 *
 * This interface provides an abstraction layer over various LLM providers
 * and supports advanced features like streaming, tools, memory, and multi-agent orchestration.
 */
export interface Agent {
	/**
	 * Invoke the agent with a message and get a complete response
	 */
	invoke(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		tenantContext?: TenantOrgContext,
	): Promise<AgentResponse>;

	/**
	 * Stream responses from the agent in real-time
	 */
	stream(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		tenantContext?: TenantOrgContext,
	): AsyncGenerator<AgentStreamChunk>;

	/**
	 * Get the current agent state (for memory/time-travel)
	 */
	getState(): Promise<AgentState>;

	/**
	 * Set/restore agent state (for time-travel)
	 */
	setState(state: AgentState): Promise<void>;

	/**
	 * Clear agent memory
	 */
	clearMemory(): Promise<void>;
}

/**
 * LLM Provider types
 */
export enum LLMProvider {
	ANTHROPIC = "anthropic",
	AWS_BEDROCK = "aws_bedrock",
	GOOGLE = "google",
	OPENAI = "openai",
}

/**
 * Configuration for creating an agent
 */
export interface AgentCreationConfig {
	provider: LLMProvider;
	apiKey?: string | undefined;
	model?: string | undefined;
	defaultConfig?: AgentConfig;
}
