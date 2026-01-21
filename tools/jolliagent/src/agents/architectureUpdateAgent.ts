import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { toolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";

/**
 * Create an Architecture Update agent that:
 * - Diffs the last commit (HEAD~1..HEAD) to gather changed files
 * - Reads architecture.md to collect referenced files (from meta citations and Source References)
 * - If any changed file intersects the referenced files, delegates to architecture sub-agent
 * - Otherwise, exits with a concise message indicating no update needed
 */
export function createArchitectureUpdateAgent(overrides?: AgentOptions): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const systemPrompt = [
		"You are a vigilant architecture update sentinel.",
		"Your job is to detect whether the latest commit requires updating architecture.md,",
		"and if so, delegate the update to the specialized architecture sub-agent.",
	].join(" ");

	const userInstruction = [
		"Perform an architecture update check and delegate only when necessary.",
		"",
		"Steps:",
		"1) Call set_plan to outline: diff -> parse references -> compare -> delegate-or-exit.",
		"2) Get the last commit diff using git_diff with { from_ref: 'HEAD~1', to_ref: 'HEAD' }.",
		"   - If HEAD~1 is invalid (first commit), fallback: call git_history with { limit: 2 } to get two most recent SHAs, then git_diff { from_ref: '<older>', to_ref: '<newer>' }.",
		"   - If not in a git repo, stop and reply: 'No architecture updates needed (no git repository)'.",
		"3) Extract changed file paths from the diff. Prefer lines like 'diff --git a/<path> b/<path>' to robustly capture renames and exact paths.",
		"4) Read architecture.md using cat. If it does not exist, stop and reply: 'No architecture.md found; skipping architecture update.'.",
		"5) From architecture.md, collect referenced file paths from BOTH:",
		'   - Meta citation blocks: JSON entries like "file": "path"',
		"   - 'Source References' link bullets: patterns like (./path) or [code:line-range] links to files.",
		"6) Compute the intersection of changed files and referenced files (normalize with ./ removal and consistent separators).",
		"7) If the intersection is empty, stop and reply: 'No architecture updates needed' and include a brief list of changed files.",
		"8) If there is any overlap, call run_architecture_sub_agent with a concise prompt that:",
		"   - Summarizes the changed files that intersect references",
		"   - Asks to update architecture.md accordingly (refresh diagrams and citations where relevant)",
		"   - Instructs to overwrite the existing architecture.md using write_file or write_file_chunk.",
		"9) After the sub-agent completes, finish the turn. Do not re-print the full architecture.md.",
		"",
		"Notes:",
		"- Keep output minimal and actionable; do not echo long diffs or files.",
		"- Use strict, deterministic parsing to avoid false positives (e.g., ignore code fences when extracting paths).",
	].join("\n");

	const agent = new Agent({
		model: overrides?.model ?? "claude-sonnet-4-5-20250929",
		temperature: overrides?.temperature ?? 0.2,
		tools: overrides?.tools ?? toolDefinitions, // includes git_* tools and run_architecture_sub_agent
		client: overrides?.client ?? new AnthropicLLMClient(),
		maxOutputTokens: overrides?.maxOutputTokens ?? 12000,
		...(overrides?.runState !== undefined ? { runState: overrides.runState } : {}),
	});

	const withDefaults = (opts: ChatOptions): ChatOptions => {
		const system = opts.system ?? systemPrompt;
		let messages = opts.messages;
		if ((!messages || messages.length === 0) && !opts.prompt) {
			messages = [{ role: "user", content: userInstruction }] as Array<Message>;
		}
		return {
			...opts,
			...(system !== undefined ? { system } : {}),
			...(messages !== undefined ? { messages } : {}),
		};
	};

	return { agent, withDefaults };
}
