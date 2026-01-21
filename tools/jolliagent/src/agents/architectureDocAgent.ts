import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { e2bToolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";

/**
 * Architecture Doc Only agent:
 * - Checks out a GitHub repo into the E2B sandbox
 * - Generates only architecture.md into <OUTDIR>/docs
 * - Does NOT run code2docusaurus or any deployment step
 */
export function createArchitectureDocAgent(params: {
	runState?: AgentOptions["runState"];
	githubUrl: string;
	outputDir?: string; // defaults to ./api-docs
}): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const OUTDIR = params.outputDir || "./api-docs";

	const systemPrompt = [
		"You are a precise workflow agent that prepares an architecture document in an E2B sandbox.",
		"Execute only the minimal steps required: checkout repository, analyze source, write architecture.md.",
		"Use only the available tools you need (e.g., github_checkout, ls, cat, write_file_chunk).",
	].join(" ");

	const userInstruction = (url: string) => `
Task: Checkout the GitHub URL, analyze the codebase, and generate only architecture.md into OUTDIR/docs.

Input URL:
- ${url}
OUTDIR:
- ${OUTDIR}

Steps:
1) Parse the URL into { owner/repo, ref/branch if present, optional subdirectory after /tree/<ref>/ }.
   - If URL contains '/tree/HEAD', treat it as default branch. Start with 'main'; if checkout fails, retry 'master'.
2) Call github_checkout with { repo: "owner/repo", branch?: "main|master|<ref>" }.
3) Determine working_dir = "$HOME/workspace/<repo>/<branch>" (the checkout target), and if a subdirectory is present in the URL, append it.
4) Explore and read key files using ls and cat as needed to understand the architecture.
5) Create an architecture.md page under the docs folder:
   - ARCH_PATH = "${OUTDIR}/docs/architecture.md".
   - Use YAML frontmatter:
     ---\n     id: architecture\n     title: 'Architecture Overview'\n     sidebar_label: 'Architecture'\n     ---
   - Content requirements: provide a comprehensive, source-backed architecture overview; add inline HTML meta citation comments after each heading; include Mermaid diagrams where appropriate; add per-section "Source References" links.
   - Write the file using write_file_chunk in chunks: first with truncate=true, then appends.

Critical:
- Do NOT run code2docusaurus or any deployment step. Only generate architecture.md.
`;

	const agent = new Agent({
		model: "claude-sonnet-4-5-20250929",
		temperature: 0.15,
		tools: e2bToolDefinitions,
		client: new AnthropicLLMClient(),
		maxOutputTokens: getDefaultMaxOutputTokens(),
		...(params.runState !== undefined ? { runState: params.runState } : {}),
	});

	const withDefaults = (opts: ChatOptions): ChatOptions => {
		const system = opts.system ?? systemPrompt;
		const messages: Array<Message> = opts.messages ?? [
			{ role: "user", content: userInstruction(params.githubUrl) },
		];
		return { ...opts, system, messages };
	};

	return { agent, withDefaults };
}
