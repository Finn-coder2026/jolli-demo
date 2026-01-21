import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { e2bToolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";

/**
 * Code → Docs agent (steps 1–5):
 * - Checks out GitHub repo, runs code2docusaurus, and writes architecture page into <OUTDIR>.
 * - Stops after step 5 (does NOT deploy).
 */
export function createCodeToDocsAgent(params: {
	runState?: AgentOptions["runState"];
	githubUrl: string;
	outputDir?: string; // defaults to ./api-docs
}): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const OUTDIR = params.outputDir || "./api-docs";

	const systemPrompt = [
		"You are a precise workflow agent that prepares documentation in an E2B sandbox.",
		"Execute only steps 1–5 of the pipeline, then stop (no deployment).",
		"Use only the available tools: github_checkout, code2docusaurus_run, write_file_chunk.",
	].join(" ");

	const userInstruction = (url: string) =>
		`
Task: Checkout the GitHub URL and generate API docs into OUTDIR, then stop.

Input URL:
- ${url}
OUTDIR:
- ${OUTDIR}

Steps (perform 1–5 only):
1) Parse the URL into { owner/repo, ref/branch if present, optional subdirectory after /tree/<ref>/ }.
   - If URL contains '/tree/HEAD', treat it as default branch. Start with 'main'; if checkout fails, retry 'master'.
2) Call github_checkout with { repo: "owner/repo", branch?: "main|master|<ref>" }.
3) Determine working_dir = "$HOME/workspace/<repo>/<branch>" (the checkout target), and if a subdirectory is present in the URL, append it.
4) Call code2docusaurus_run with { repo_path: working_dir, subdir?: "(if any)", output_dir: "${OUTDIR}", format: "yaml", generate_docs: true }.
5) Create an architecture.md page under the Docusaurus docs folder using the Architecture Agent methodology:
   - ARCH_PATH = "${OUTDIR}/docs/architecture.md".
   - Use YAML frontmatter:
     ---\n     id: architecture\n     title: 'Architecture Overview'\n     sidebar_label: 'Architecture'\n     ---
   - Content requirements: provide a comprehensive, source-backed architecture overview; add inline HTML meta citation comments after each heading; include Mermaid diagrams where appropriate; add per-section "Source References" links.
   - Write the file using write_file_chunk in chunks: first with truncate=true, then appends.

Critical:
- Stop after step 5. Do NOT run docusaurus2vercel_run. Summarize artifacts and OUTDIR.
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
