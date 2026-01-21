import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { toolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";
import { type AgentProfile, GettingStartedProfile } from "./profiles";

/**
 * Create a Getting Started Guide agent configured with all tools from Tools.ts.
 * Defaults to Anthropic via factory-provided client and profile model settings.
 */
export function createGettingStartedGuideAgent(overrides?: AgentOptions): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const profile: AgentProfile = GettingStartedProfile;
	const agent = new Agent({
		...profile.defaultAgentOpts,
		...overrides,
		tools: overrides?.tools ?? toolDefinitions,
		client: overrides?.client ?? new AnthropicLLMClient(),
		maxOutputTokens:
			overrides?.maxOutputTokens ?? profile.defaultAgentOpts?.maxOutputTokens ?? getDefaultMaxOutputTokens(),
	});

	const userInstruction = [
		"Generate a complete Getting Started guide for this repository.",
		"Inspect files as needed using the available tools (ls, cat, git_history, git_diff).",
		"Write the final guide to 'getting-started-guide.md' using write_file.",
		"Operate autonomously: do not ask for user confirmation; infer reasonable defaults.",
		"Use set_plan to outline steps, keep it updated, and finish when done.",
	].join(" ");

	const withDefaults = (opts: ChatOptions): ChatOptions => {
		const sys = opts.system ?? profile.defaultChatOpts?.system;
		// Only inject seed messages when neither messages nor prompt are provided
		let messages = opts.messages;
		if ((!messages || messages.length === 0) && !opts.prompt) {
			messages = [{ role: "user", content: userInstruction }] as Array<Message>;
		}
		return {
			...opts,
			...(sys !== undefined ? { system: sys } : {}),
			...(messages !== undefined ? { messages } : {}),
		};
	};

	return { agent, withDefaults };
}
