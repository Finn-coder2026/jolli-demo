import AnthropicLLMClient from "../providers/Anthropic";
import type { RunState } from "../Types";
import Agent, { type AgentOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";

/**
 * System prompt for general chat
 * Simple, helpful assistant for general conversation
 */
const GENERAL_CHAT_SYSTEM_PROMPT = `You are a helpful AI assistant. You provide clear, concise, and accurate responses to user questions and requests.

Be conversational and friendly while maintaining professionalism. If you're unsure about something, acknowledge it honestly.`;

/**
 * Create a general chat agent
 * - No tools by default
 * - Uses Claude Sonnet for conversation
 * - Configured for general purpose chat
 */
export function createGeneralChatAgent(opts?: { runState?: RunState; enableTools?: boolean; enableRAG?: boolean }): {
	agent: Agent;
	withDefaults: (chatOpts: { system?: string; messages?: Array<unknown> }) => {
		system?: string;
		messages?: Array<unknown>;
	};
} {
	const agentOpts: AgentOptions = {
		model: "claude-3-7-sonnet-20250219",
		temperature: 0.7,
		...(opts?.runState ? { runState: opts.runState } : {}),
		maxOutputTokens: getDefaultMaxOutputTokens(),
		client: new AnthropicLLMClient(),
		systemPrompt: GENERAL_CHAT_SYSTEM_PROMPT,
		// No tools for Phase 1
		...(opts?.enableTools ? { tools: [] } : {}),
	};

	const agent = new Agent(agentOpts);

	// Simple no-op withDefaults for backward compatibility
	const withDefaults = (chatOpts: { system?: string; messages?: Array<unknown> }) => chatOpts;

	return { agent, withDefaults };
}
