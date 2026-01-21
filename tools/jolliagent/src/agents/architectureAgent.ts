import AnthropicLLMClient from "../providers/Anthropic";
import type { Message } from "../Types";
import { architectureToolDefinitions } from "../tools/Tools";
import Agent, { type AgentOptions, type ChatOptions } from "./Agent";

/**
 * Create an Architecture agent with embedded system + user prompts and proper tools.
 * - Uses Getting Started model defaults for temperature/model
 * - Increases max output tokens (unless overridden)
 * - Adds chunked write tool via architectureToolDefinitions
 */
export function createArchitectureAgent(overrides?: AgentOptions): {
	agent: Agent;
	withDefaults: (opts: ChatOptions) => ChatOptions;
} {
	const systemPrompt = [
		"You are an expert software architect and documentation specialist.",
		"Work autonomously and produce thorough, accurate, fully cited architecture documentation.",
		"Prefer concrete source-backed statements and multiple Mermaid diagrams.",
	].join(" ");

	const userInstruction = [
		"You are an expert software architect and documentation specialist. Your task is to analyze the codebase and create a comprehensive architecture.md file with detailed Mermaid diagrams and source code citations.",
		"",
		"Follow these steps EXACTLY:",
		"",
		"1. First, use the ls tool to explore the project structure",
		"2. Read key files like package.json, README.md (if exists), and main entry points",
		"3. Analyze the codebase structure by reading through important source files",
		"4. Create an architecture.md file using the write_file tool. IMPORTANT: The write_file tool requires TWO parameters:",
		'   - filename: "architecture.md"',
		"   - content: The complete markdown content as a single string",
		"",
		"5. The architecture.md content should include per-section metadata comments for citations instead of YAML front-matter.",
		"   Immediately after each heading, add an HTML comment of the form:",
		'   <!-- meta: {"citations": [ { "file": "path", "lines": "start-end", "description": "why relevant" } ] } -->',
		"   The comment must be placed right after the heading line for that section.",
		"   Use this overall document structure with inline meta blocks:",
		"",
		"   # Project Architecture",
		"",
		"   ## Overview",
		'   <!-- meta: {"citations": [\n      { "file": "package.json", "lines": "1-50", "description": "Project configuration and dependencies" },\n      { "file": "src/index.ts", "lines": "1-100", "description": "Main entry point" }\n   ] } -->',
		"   [Brief description of the project]",
		"",
		"   **Source References:**",
		"   - [`package.json:1-50`](./package.json#L1-L50) - Project configuration",
		"   - [`src/index.ts:1-100`](./src/index.ts#L1-L100) - Main entry point",
		"",
		"   ## Technology Stack",
		'   <!-- meta: {"citations": [\n      { "file": "package.json", "lines": "10-30", "description": "Dependencies list" }\n   ] } -->',
		"   [List technologies, frameworks, and key dependencies]",
		"",
		"   **Source References:**",
		"   - [`package.json:10-30`](./package.json#L10-L30) - Dependencies",
		"",
		"   ## System Architecture",
		'   <!-- meta: {"citations": [] } -->',
		"   [Overall system description]",
		"",
		"   ### High-Level Architecture Diagram",
		"   ```mermaid",
		"   [Create a comprehensive system architecture diagram showing all major components and their relationships]",
		"   ```",
		"",
		"   ## Component Architecture",
		"",
		"   ### [Component/Subsystem Name 1]",
		'   <!-- meta: {"citations": [\n      { "file": "src/path/to/file.ts", "lines": "25-150", "description": "Implementation details" },\n      { "file": "src/path/to/interface.ts", "lines": "1-50", "description": "Interface definitions" }\n   ] } -->',
		"   [Description]",
		"",
		"   **Source References:**",
		"   - [`src/path/to/file.ts:25-150`](./src/path/to/file.ts#L25-L150) - Implementation details",
		"   - [`src/path/to/interface.ts:1-50`](./src/path/to/interface.ts#L1-L50) - Interface definitions",
		"",
		"   ```mermaid",
		"   [Detailed diagram for this subsystem]",
		"   ```",
		"",
		"   ### [Component/Subsystem Name 2]",
		'   <!-- meta: {"citations": [\n      { "file": "src/path/to/module.ts", "lines": "1-200", "description": "Module implementation" }\n   ] } -->',
		"   [Description]",
		"",
		"   **Source References:**",
		"   - [`src/path/to/module.ts:1-200`](./src/path/to/module.ts#L1-L200) - Module implementation",
		"",
		"   ```mermaid",
		"   [Detailed diagram for this subsystem]",
		"   ```",
		"",
		"   [Continue for each major subsystem...]",
		"",
		"   ## Data Flow",
		"",
		"   **Source References:**",
		"   - [List relevant files and line numbers that show data flow]",
		"",
		"",
		"   ```mermaid",
		"   [Create a sequence or flow diagram showing how data moves through the system]",
		"   ```",
		"",
		"   ## Directory Structure",
		"   [Document the key directories and their purposes]",
		"",
		"   ## Key Design Patterns",
		"   [Identify and document design patterns used]",
		"",
		"   **Source References:**",
		"   - [List files demonstrating each pattern with line numbers]",
		"",
		"   ## API/Interface Documentation",
		"   [Document key interfaces and APIs]",
		"",
		"   **Source References:**",
		"   - [List interface and API files with line numbers]",
		"",
		"IMPORTANT CITATION REQUIREMENTS:",
		"- For EVERY section and subsection, provide source code citations",
		"- Citations should include the actual file path and line numbers where the relevant code exists",
		"- For EACH section and subsection, add a meta comment right after the heading in the form:",
		'  <!-- meta: {"citations": [ { "file": "path", "lines": "start-end", "description": "why relevant" } ] } -->',
		'- In the document body, also add a "Source References" list with clickable links to the code',
		"- Use GitHub-style line number anchors (#L25-L150) for precise code references",
		"- Ensure every architectural claim is backed by actual code citations",
		"",
		"Use Mermaid diagrams extensively:",
		"- Use graph/flowchart for architecture diagrams",
		"- Use classDiagram for showing class relationships",
		"- Use sequenceDiagram for showing interactions",
		"- Use stateDiagram for state management",
		"- Choose the most appropriate diagram type for each subsystem",
		"",
		"Be thorough and create multiple detailed diagrams. Each subsystem should have its own diagram.",
		"Make sure the architecture.md file is comprehensive, professional, and fully cited with source code references.",
		"",
		"CRITICAL: When using the write_file tool, you MUST provide both parameters:",
		'1. filename: Set this to "architecture.md"',
		"2. content: Build the ENTIRE markdown document as a single string variable first, then pass it",
		"",
		"Example of correct usage:",
		"First, construct your complete document content, then call:",
		'write_file with filename="architecture.md" and content="[your complete markdown document here]"',
		"",
		"DO NOT call write_file without the content parameter. Build the entire document first, then write it in one operation.",
		"",
		"After writing the file, verify success by calling ls to confirm architecture.md exists. Do not print the full file contents.",
		"If the document is very large, use write_file_chunk: first call with truncate=true, then append additional chunks in order.",
	].join("\n");

	const agent = new Agent({
		model: "claude-sonnet-4-5-20250929",
		temperature: 0.2,
		tools: overrides?.tools ?? architectureToolDefinitions,
		client: overrides?.client ?? new AnthropicLLMClient(),
		maxOutputTokens: overrides?.maxOutputTokens ?? 24000,
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
