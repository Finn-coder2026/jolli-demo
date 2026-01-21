import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { markdown_sections_tool_def, toolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";
import { basename } from "node:path";

/**
 * Create a Section Citations → Mermaid agent that:
 * - Accepts markdown text as input
 * - Extracts sections + citations using markdown_sections
 * - Emits a single Markdown document where each section has a Mermaid graph
 *   showing the section's dependency on its cited sources.
 */
export function createSectionCitationsMermaidAgent(
	overrides?: AgentOptions & { filename?: string; currentDir?: string },
): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const targetFile = overrides?.filename ?? "<markdown_file>";
	const displayName = overrides?.filename ? basename(overrides.filename) : "<markdown_file>";
	const systemPrompt = [
		"You are a precise documentation visualization generator.",
		"Given markdown documentation that includes per-section inline citation metadata,",
		"produce a single Mermaid flowchart that shows: <filename> -> sections -> citations.",
		"Deduplicate citation nodes by file path so shared citations appear as overlaps.",
		`Label the document node with only the base filename: '${displayName}' (omit directory prefixes).`,
	].join(" ");

	const userInstruction = [
		"Instructions:",
		`1) Call markdown_sections with { filename: '${targetFile}' } (content is provided via env).`,
		"2) Build nodes:",
		`   - A single document node 'DOC' labeled '${displayName}' (base name only, no directories).`,
		"   - One section node per section, id 'S<n>' (1-based in document order), label=section title.",
		"   - One citation node per UNIQUE cited file across all sections, id 'CF_<sanitized_path>', label='<file>' (optionally append ':<lines>' where helpful).",
		"3) Build edges:",
		"   - DOC --> S<n> for every section.",
		"   - For each citation used by a section: S<n> --> CF_<sanitized_path>.",
		"4) Use 'flowchart LR' (left-to-right). Sanitize all IDs to [A-Za-z0-9_].",
		"5) Output EXACTLY ONE mermaid code block and nothing else.",
		"   The block should begin with ```mermaid and contain the full graph.",
		"6) If there are no citations anywhere, still render DOC and sections with DOC --> S<n> edges only.",
	].join("\n");

	const agent = new Agent({
		model: overrides?.model ?? "claude-sonnet-4-5-20250929",
		temperature: overrides?.temperature ?? 0.2,
		tools: overrides?.tools ?? [...toolDefinitions, markdown_sections_tool_def],
		client: overrides?.client ?? new AnthropicLLMClient(),
		maxOutputTokens: overrides?.maxOutputTokens ?? 12000,
		...(overrides?.runState !== undefined ? { runState: overrides.runState } : {}),
	});

	const withDefaults = (opts: ChatOptions): ChatOptions => {
		const system = opts.system ?? systemPrompt;
		let messages = opts.messages;
		if ((!messages || messages.length === 0) && opts.prompt) {
			messages = [
				{ role: "system", content: system },
				{ role: "user", content: `${userInstruction}\n\n[MARKDOWN INPUT]\n${opts.prompt}` },
			] as Array<Message>;
			const result: ChatOptions = { ...opts, messages };
			delete result.prompt;
			return result;
		}
		if (!messages || messages.length === 0) {
			messages = [
				{ role: "system", content: system },
				{ role: "user", content: userInstruction },
			] as Array<Message>;
		}
		return { ...opts, messages };
	};

	return { agent, withDefaults };
}
