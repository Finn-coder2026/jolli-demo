import AnthropicLLMClient from "../providers/Anthropic";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";
import { type AgentProfile, profiles } from "./profiles";

// Re-export default token calculation to avoid circular imports
export { getDefaultMaxOutputTokens } from "./defaults";

/**
 * Create a configured Agent plus a small helper that merges default ChatOptions.
 */
export function createAgent(
	kind: keyof typeof profiles,
	overrides?: AgentOptions,
): { agent: Agent; withDefaults: (opts: ChatOptions) => ChatOptions } {
	const profile: AgentProfile = profiles[kind];
	const tools = overrides?.tools ?? profile.defaultAgentOpts?.tools;
	const agent = new Agent({
		...profile.defaultAgentOpts,
		...overrides,
		// ensure a concrete client is always provided (default: Anthropic)
		client: overrides?.client ?? new AnthropicLLMClient(),
		// ensure maxOutputTokens is always set
		maxOutputTokens:
			overrides?.maxOutputTokens ?? profile.defaultAgentOpts?.maxOutputTokens ?? getDefaultMaxOutputTokens(),
		// allow overrides.tools to extend/replace (only add if defined):
		...(tools !== undefined ? { tools } : {}),
	});

	const withDefaults = (opts: ChatOptions): ChatOptions => {
		const sys = opts.system ?? profile.defaultChatOpts?.system;
		const messages = opts.messages ?? profile.defaultChatOpts?.seedMessages;
		return {
			...opts,
			...(sys !== undefined ? { system: sys } : {}),
			...(messages !== undefined ? { messages } : {}),
		};
	};

	return { agent, withDefaults };
}

/**
 * Create an Architecture agent with embedded system + user prompts and proper tools.
 * - Uses Getting Started model defaults for temperature/model
 * - Increases max output tokens (unless overridden)
 * - Adds chunked write tool via architectureToolDefinitions
 */
export { createArchitectureAgent } from "./architectureAgent";
export { createArchitectureDocAgent } from "./architectureDocAgent";
/**
 * Create an Architecture Update agent that:
 * - Diffs the last commit (HEAD~1..HEAD) to gather changed files
 * - Reads architecture.md to collect referenced files (from meta citations and Source References)
 * - If any changed file intersects the referenced files, delegates to architecture sub-agent
 * - Otherwise, exits with a concise message indicating no update needed
 */
export { createArchitectureUpdateAgent } from "./architectureUpdateAgent";
/**
 * Create a Code Docs agent that checks out a GitHub URL and runs code2docusaurus then docusaurus2vercel.
 * Designed to run with E2B tools enabled.
 */
export { createCodeDocsAgent } from "./codeDocsAgent";
export { createCodeToApiDocsAgent } from "./codeToApiDocsAgent";
export { createCodeToDocsAgent } from "./codeToDocsAgent";
export { createDocsToSiteAgent } from "./docsToSiteAgent";
/**
 * Create a Getting Started Guide agent configured with all tools from Tools.ts.
 * Defaults to Anthropic via factory-provided client and profile model settings.
 */
export { createGettingStartedGuideAgent } from "./gettingStartedAgent";
/**
 * Create a Section Citations → Mermaid agent that:
 * - Accepts markdown text as input
 * - Extracts sections + citations using markdown_sections
 * - Emits a single Markdown document where each section has a Mermaid graph
 *   showing the section's dependency on its cited sources.
 */
export { createSectionCitationsMermaidAgent } from "./sectionCitationsMermaidAgent";
