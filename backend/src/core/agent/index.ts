/**
 * Agent System - LangGraph-based AI Agent Framework
 *
 * This module provides an abstraction layer for building stateful AI agents
 * with support for multiple LLM providers, tools, memory, and advanced features
 * like human-in-the-loop, time-travel, and multi-agent orchestration.
 *
 * Key Features:
 * - Multiple LLM providers (OpenAI, Anthropic, Google, AWS, Azure)
 * - Streaming support for real-time responses
 * - Memory management and state persistence
 * - Tool integration (extensible)
 * - Time-travel debugging
 * - Built on LangGraph for advanced orchestration
 *
 * @example
 * ```typescript
 * import { createAgent, LLMProvider } from './core/agent';
 *
 * // Create an agent
 * const agent = createAgent({
 *   provider: LLMProvider.OPENAI,
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: "gpt-4o-mini",
 * });
 *
 * // Stream responses
 * for await (const chunk of agent.stream([
 *   { role: "user", content: "Hello!" }
 * ])) {
 *   console.log(chunk.content);
 * }
 * ```
 */

export * from "./Agent";
export { createAgent, createAgentFromEnv } from "./AgentFactory";
export * from "./AgentRouter";
export * from "./AnthropicAgent";
export * from "./BaseLangGraphAgent";
export * from "./MultiAgent";
export { createMultiAgent, createMultiAgentFromEnv } from "./MultiAgentFactory";
export * from "./OpenAIAgent";
