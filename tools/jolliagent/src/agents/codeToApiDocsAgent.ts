import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { e2bToolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";

/**
 * Code → API Docs agent (subset):
 * - Checks out GitHub repo and runs code2docusaurus to generate API docs into <OUTDIR>/docs
 * - Does NOT generate architecture.md and does NOT deploy/site
 */
export function createCodeToApiDocsAgent(params: {
	runState?: AgentOptions["runState"];
	githubUrl: string;
	outputDir?: string; // defaults to ./api-docs
}): { agent: Agent; withDefaults: (opts: ChatOptions) => ChatOptions } {
	const OUTDIR = params.outputDir || "./api-docs";

	const systemPrompt = [
		"You are a precise workflow agent that prepares API documentation in an E2B sandbox.",
		"Execute only checkout and code2docusaurus generation steps, then stop.",
		"Use only the tools you need: github_checkout, code2docusaurus_run.",
	].join(" ");

	const userInstruction = (url: string) => `
Task: Checkout the GitHub URL and generate API docs into OUTDIR using code2docusaurus, then stop.

Input URL:
- ${url}
OUTDIR:
- ${OUTDIR}

Steps:
1) Parse the URL into { owner/repo, ref/branch if present, optional subdirectory after /tree/<ref>/ }.
   - If URL contains '/tree/HEAD', treat it as default branch. Start with 'main'; if checkout fails, retry 'master'.
2) Call github_checkout with { repo: "owner/repo", branch?: "main|master|<ref>" }.
3) Determine working_dir = "$HOME/workspace/<repo>/<branch>" (the checkout target), and if a subdirectory is present in the URL, append it.
4) Call code2docusaurus_run with { repo_path: working_dir, subdir?: "(if any)", output_dir: "${OUTDIR}", format: "yaml", generate_docs: true }.

Critical:
- Do NOT create architecture.md and do NOT run docusaurus deployment. Stop after generating docs.
`;

	const agent = new Agent({
		model: "claude-sonnet-4-5-20250929",
		temperature: 0.1,
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
