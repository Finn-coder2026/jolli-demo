import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { e2bToolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { getDefaultMaxOutputTokens } from "./defaults";

/**
 * Create a Code Docs agent that checks out a GitHub URL and runs code2docusaurus then docusaurus2vercel.
 * Designed to run with E2B tools enabled.
 */
export function createCodeDocsAgent(params: { runState?: AgentOptions["runState"]; githubUrl: string }): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const systemPrompt = [
		"You are a precise workflow agent that executes a docs pipeline in an E2B sandbox.",
		"Maintain and update a clear plan using set_plan and get_plan. Work autonomously.",
		"Use only the available tools: github_checkout, code2docusaurus_run, write_file_chunk, docusaurus2vercel_run.",
		"If cloning with branch 'main' fails, retry with 'master'.",
	].join(" ");

	const userInstruction = (url: string) =>
		`
Task: Checkout the GitHub URL and generate + deploy API docs.

Input URL:
- ${url}

Steps:
1) Parse the URL into { owner/repo, ref/branch if present, optional subdirectory after /tree/<ref>/ }.
   - If URL contains '/tree/HEAD', treat it as default branch. Start with 'main'; if checkout fails, retry 'master'.
2) Call github_checkout with { repo: "owner/repo", branch?: "main|master|<ref>" }.
3) Determine working_dir = 
   - "$HOME/workspace/<repo>/<branch>" (the github_checkout target), and if a subdirectory is present in the URL, append it.
4) Call code2docusaurus_run with { repo_path: working_dir, subdir?: "(if any)", output_dir: "./api-docs", format: "yaml", generate_docs: true }.
5) Create an architecture.md page under the Docusaurus docs folder using the Architecture Agent prompt (adapted for this workflow):
   - Let OUTDIR = the same output_dir used above (./api-docs 

   - Add a new page at "<OUTDIR>/docs/architecture.md" implementing the following prompt instructions:
     ---
     id: architecture
     title: 'Architecture Overview'
     sidebar_label: 'Architecture'
     ---
   - Content requirements (use the same methodology as the Architecture agent):
     • Provide a comprehensive, source-backed architecture overview of the project.
     • Immediately after each heading, add an HTML meta comment with citations of the form:
       <!-- meta: {"citations": [ { "file": "path/to/file", "lines": "start-end", "description": "why relevant" } ] } -->
     • Include sections: Overview, Technology Stack, System Architecture (with a high-level Mermaid diagram), Component Architecture (per key subsystem, each with its own Mermaid diagram), Data Flow (Mermaid sequence/flow as appropriate), Directory Structure, Key Design Patterns, API/Interface Documentation.
     • For each section, include a "Source References" list with clickable paths and line ranges (use GitHub-style anchors #Lstart-Lend where applicable).
     • Prefer concrete statements backed by actual files in the repository you cloned (working_dir [+ subdir]).
     • Keep the document clear and useful; it can be longer than 600 words if necessary, but avoid excessive verbosity.
   - Write the file using write_file_chunk in chunks:
     • First call with { filename: ARCH_PATH, content: <first_chunk>, truncate: true, ensure_newline: true }.
     • Append subsequent chunks with { filename: ARCH_PATH, content: <next_chunk>, ensure_newline: true }.
     • Prefer paragraph-sized chunks; mkdirs=true when needed to create parent dirs.
   - Optional: If safe to edit, add 'architecture' just after 'intro' in "<OUTDIR>/sidebars.js" so it appears in the sidebar.
6) Call docusaurus2vercel_run with { docs_path: "<OUTDIR>", project_name: "<repo>-docs" }.
7) Return a concise final summary including SPEC_PATH, DOCS_DIR, ARCH_PATH, and deployment URL.

Constraints:
- Keep the plan updated at each phase.
- Do not print large logs; summarize and provide key paths and URLs.
- If a step fails, adjust and retry once (e.g., switch branch to master).
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
		return {
			...opts,
			system,
			messages,
		};
	};

	return { agent, withDefaults };
}
