import { Agent } from "../agents/Agent";
import { getDefaultMaxOutputTokens } from "../agents/defaults";
import AnthropicLLMClient from "../providers/Anthropic";
import type { RunState, ToolDef } from "../Types";
import { e2bToolDefinitions, toolDefinitions } from "../tools/tools/index";
import { Sandbox } from "e2b";

/**
 * Named tool presets for different use cases
 */
export type ToolPreset =
	| "general" // Basic tools (ls, cat, write_file, etc.) for local execution
	| "e2b-general" // E2B sandbox tools (ls, cat, write_file, github_checkout, etc.)
	| "e2b-code" // E2B read-only code tools (ls, cat, git_diff, git_history, github_checkout)
	| "e2b-docs" // E2B with documentation generation tools
	| "custom"; // Custom tool set provided by caller

/**
 * Configuration for creating an agent environment
 */
export interface AgentEnvConfig {
	/**
	 * Tool preset to use
	 */
	toolPreset: ToolPreset;

	/**
	 * Custom tools (required if toolPreset is "custom")
	 */
	customTools?: Array<ToolDef>;

	/**
	 * Additional tools to add to preset tools
	 * These are merged with the preset tools
	 */
	additionalTools?: Array<ToolDef>;

	/**
	 * Whether to create an E2B sandbox
	 * Required for e2b-* presets, optional for general/custom
	 */
	useE2B?: boolean;

	/**
	 * E2B API key (required if useE2B is true)
	 */
	e2bApiKey?: string;

	/**
	 * E2B template ID (required if useE2B is true)
	 */
	e2bTemplateId?: string;

	/**
	 * E2B sandbox connection timeout in milliseconds
	 * @default 20000
	 */
	e2bTimeoutMs?: number;

	/**
	 * LLM model to use
	 * @default "claude-sonnet-4-5-20250929"
	 */
	model?: string;

	/**
	 * Temperature for LLM
	 * @default 0.7
	 */
	temperature?: number;

	/**
	 * System prompt for the agent
	 */
	systemPrompt?: string;

	/**
	 * Maximum output tokens
	 */
	maxOutputTokens?: number;

	/**
	 * Additional environment variables to pass to tools
	 */
	envVars?: Record<string, string>;
}

/**
 * Agent environment with sandbox and cleanup
 */
export interface AgentEnvironment {
	/**
	 * The configured agent
	 */
	agent: Agent;

	/**
	 * Run state containing sandbox and executor namespace
	 */
	runState: RunState;

	/**
	 * E2B sandbox instance (if useE2B was true)
	 */
	sandbox?: Sandbox | undefined;

	/**
	 * Sandbox ID for reference
	 */
	sandboxId?: string;

	/**
	 * Cleanup function to dispose of resources
	 */
	dispose: () => Promise<void>;
}

/**
 * Get tools for a given preset
 */
function getToolsForPreset(
	preset: ToolPreset,
	customTools?: Array<ToolDef>,
	additionalTools?: Array<ToolDef>,
): Array<ToolDef> {
	let baseTools: Array<ToolDef>;

	switch (preset) {
		case "general":
			baseTools = toolDefinitions;
			break;

		case "e2b-general":
			baseTools = e2bToolDefinitions;
			break;

		case "e2b-code":
			// E2B read-only code browsing tools (no write operations)
			baseTools = e2bToolDefinitions.filter(tool =>
				["ls", "cat", "git_diff", "git_history", "github_checkout", "web_search", "web_extract"].includes(
					tool.name,
				),
			);
			break;

		case "e2b-docs":
			// E2B tools with focus on documentation
			baseTools = e2bToolDefinitions.filter(tool =>
				[
					"ls",
					"cat",
					"write_file",
					"write_file_stream",
					"github_checkout",
					"docs2docusaurus_run",
					"docusaurus2vercel_run",
				].includes(tool.name),
			);
			break;

		case "custom":
			if (!customTools || customTools.length === 0) {
				throw new Error("Custom tool preset requires customTools to be provided");
			}
			baseTools = customTools;
			break;

		default:
			throw new Error(`Unknown tool preset: ${preset}`);
	}

	// Merge additional tools if provided
	return additionalTools && additionalTools.length > 0 ? [...baseTools, ...additionalTools] : baseTools;
}

/**
 * Create E2B sandbox with timeout protection
 */
async function createE2BSandbox(
	templateId: string,
	apiKey: string,
	timeoutMs = 20000,
): Promise<{ sandbox: Sandbox; sandboxId: string }> {
	const connect = Sandbox.create(templateId, { apiKey });
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(
			() => reject(new Error(`E2B connection timed out after ${Math.round(timeoutMs / 1000)}s`)),
			timeoutMs,
		),
	);

	const sandbox = await Promise.race([connect, timeout]);
	const sandboxId = (sandbox as { id?: string }).id || "unknown";

	return { sandbox, sandboxId };
}

/**
 * Create an agent environment with optional E2B sandbox
 *
 * This function creates an agent with tools and optionally an E2B sandbox.
 * It returns an environment object that can be used with chatTurn and includes
 * a cleanup function to dispose of resources.
 *
 * @example
 * // Create agent with E2B sandbox for general use
 * const env = await createAgentEnvironment({
 *   toolPreset: 'e2b-general',
 *   useE2B: true,
 *   e2bApiKey: process.env.E2B_API_KEY,
 *   e2bTemplateId: process.env.E2B_TEMPLATE_ID,
 *   systemPrompt: 'You are a helpful assistant with file system access.',
 * });
 *
 * // Use the agent
 * const result = await env.agent.chatTurn({
 *   history: [{ role: 'user', content: 'List files in /home' }],
 *   runTool: (call) => runToolCall(env.runState, call),
 *   onTextDelta: (delta) => console.log(delta),
 * });
 *
 * // Clean up
 * await env.dispose();
 *
 * @example
 * // Create agent without E2B for local tools
 * const env = await createAgentEnvironment({
 *   toolPreset: 'general',
 *   systemPrompt: 'You are a helpful assistant.',
 * });
 */
export async function createAgentEnvironment(config: AgentEnvConfig): Promise<AgentEnvironment> {
	const {
		toolPreset,
		customTools,
		additionalTools,
		useE2B = toolPreset.startsWith("e2b-"),
		e2bApiKey,
		e2bTemplateId,
		e2bTimeoutMs = 20000,
		model = "claude-sonnet-4-5-20250929",
		temperature = 0.7,
		systemPrompt,
		maxOutputTokens,
		envVars = {},
	} = config;

	// Validate E2B requirements
	if (useE2B && (!e2bApiKey || !e2bTemplateId)) {
		throw new Error("E2B usage requires e2bApiKey and e2bTemplateId");
	}

	// Get tools for the preset
	const tools = getToolsForPreset(toolPreset, customTools, additionalTools);

	// Create E2B sandbox if requested
	let sandbox: Sandbox | undefined;
	let sandboxId: string | undefined;
	if (useE2B && e2bApiKey && e2bTemplateId) {
		const result = await createE2BSandbox(e2bTemplateId, e2bApiKey, e2bTimeoutMs);
		sandbox = result.sandbox;
		sandboxId = result.sandboxId;
	}

	// Create run state
	const runState: RunState = {
		...(sandbox ? { e2bsandbox: sandbox } : {}),
		executorNamespace: useE2B ? "e2b" : "local",
		env_vars: envVars,
	};

	// Create agent
	const agent = new Agent({
		model,
		temperature,
		tools,
		client: new AnthropicLLMClient(),
		runState,
		...(systemPrompt ? { systemPrompt } : {}),
		...(maxOutputTokens ? { maxOutputTokens } : { maxOutputTokens: getDefaultMaxOutputTokens() }),
	});

	// Create cleanup function
	const dispose = async () => {
		if (sandbox) {
			try {
				await (sandbox as { close?: () => Promise<void> }).close?.();
			} catch (_error) {
				// Intentionally ignore cleanup errors
			}
		}
	};

	return {
		agent,
		runState,
		...(sandbox ? { sandbox } : {}),
		...(sandboxId ? { sandboxId } : {}),
		dispose,
	};
}

/**
 * Helper to create a quick E2B general agent
 */
export function createE2BGeneralAgent(
	apiKey: string,
	templateId: string,
	options?: {
		systemPrompt?: string;
		temperature?: number;
		timeoutMs?: number;
	},
): Promise<AgentEnvironment> {
	return createAgentEnvironment({
		toolPreset: "e2b-general",
		useE2B: true,
		e2bApiKey: apiKey,
		e2bTemplateId: templateId,
		...(options?.timeoutMs ? { e2bTimeoutMs: options.timeoutMs } : {}),
		...(options?.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
		...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
	});
}

/**
 * Helper to create a local general agent (no E2B)
 */
export function createLocalGeneralAgent(options?: {
	systemPrompt?: string;
	temperature?: number;
}): Promise<AgentEnvironment> {
	return createAgentEnvironment({
		toolPreset: "general",
		useE2B: false,
		...(options?.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
		...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
	});
}
