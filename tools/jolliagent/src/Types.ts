// ---- The LLM ----
// Provider-agnostic stream-based interfaces used by our Agent and clients.

export type MessageStreamEvent = {
	type: string;
	[key: string]: unknown;
};

export type FinalMessage = {
	stop_reason?: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
	};
	[key: string]: unknown;
};

export type MessageStream = AsyncIterable<MessageStreamEvent> & {
	finalMessage(): Promise<FinalMessage>;
	close?(): Promise<void>;
};

export type LLMStreamEvent = TextDeltaEvent | ToolCallEvent | ResponseCompletedEvent | ErrorEvent;

export type StreamOptions = {
	model: string;
	messages: Array<Message>;
	tools?: Array<ToolDef>;
	temperature?: number;
	// Provider-agnostic maximum output tokens for a single response
	maxOutputTokens?: number;
};

export interface LLMClient {
	stream(opts: StreamOptions): AsyncGenerator<LLMStreamEvent, void, unknown>;
	continueWithToolResult(params: {
		model: string;
		priorMessages: Array<Message>;
		tool_call_id: string;
		tool_output: string;
		tool_name: string;
		temperature?: number;
	}): AsyncGenerator<LLMStreamEvent, void, unknown>;
}

// -- Event Definitions --

export type TextDeltaEvent = {
	type: "text_delta";
	delta: string;
};

export type ResponseCompletedEvent = {
	type: "response_completed";
	finish_reason: "stop" | "length" | "tool_calls" | "other";
	usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

export type ErrorEvent = {
	type: "error";
	error: string;
	code?: string;
	providerMeta?: unknown;
};

export type ToolCallEvent = {
	type: "tool_call";
	call: ToolCall;
};

// -- Message Definitions

export type Message =
	| { role: "system"; content: string }
	| { role: "user"; content: string }
	| { role: "assistant"; content: string }
	// Provider-agnostic representation of an assistant initiating a tool use
	| { role: "assistant_tool_use"; tool_call_id: string; tool_name: string; tool_input: unknown }
	// Batched assistant tool uses in a single assistant turn
	| { role: "assistant_tool_uses"; calls: Array<{ tool_call_id: string; tool_name: string; tool_input: unknown }> }
	| { role: "tool"; tool_call_id: string; content: string; tool_name: string };

// -- Tool Definitions --

export type JSONSchema = Record<string, unknown>;

export type ToolDef = {
	name: string;
	description?: string;
	parameters: JSONSchema;
};

export type ToolCall = {
	id: string;
	name: string;
	arguments: unknown;
	providerMeta?: unknown;
};

// Minimal type for E2B Sandbox functionality we use
export interface E2BSandbox {
	commands: {
		run(
			cmd: string,
			options?: { envs?: Record<string, string>; timeoutMs?: number },
		): Promise<{ stdout?: string; stderr?: string; exitCode: number; error?: string }>;
	};
	kill?(): Promise<void>;
	id?: string;
	sandboxId?: string;
}

// Public run state shared by tools
export interface RunState {
	currentPlan?: string;
	// Optional E2B sandbox/session handle for external tool executors
	// We keep this as unknown to maintain flexibility with different sandbox implementations
	e2bsandbox?: unknown;
	// Tool executor namespace ("local" or "e2b")
	executorNamespace?: "local" | "e2b";
	// Environment variables to pass to tools
	env_vars?: Record<string, string>;
}

// ---- Workflow Types ----
// Types for workflow execution in E2B sandboxes

/** Workflow configuration for E2B execution */
export interface WorkflowConfig {
	/** E2B API key */
	e2bApiKey: string;
	/** E2B template ID */
	e2bTemplateId: string;
	/** Anthropic API key */
	anthropicApiKey: string;
	/** GitHub access token from the job/integration */
	githubToken?: string;
	/** Sync server URL for CLI sync commands running inside sandbox (e.g., JOLLI_PUBLIC_URL + "/api") */
	syncServerUrl?: string;
	/** Short-lived sandbox auth token for CLI commands */
	jolliAuthToken?: string;
	/** Target space slug/identifier for CLI sync operations */
	jolliSpace?: string;
	/** Optional Vercel token for deployments */
	vercelToken?: string;
	/** Optional Tavily API key for web search */
	tavilyApiKey?: string;
	/** E2B connection timeout in milliseconds */
	connectTimeoutMs?: number;
	/** Enable debug logging */
	debug?: boolean;
}

/** Result returned from workflow execution */
export interface WorkflowResult {
	/** Success status */
	success: boolean;
	/** Assistant's final text output */
	assistantText?: string;
	/** Error message if workflow failed */
	error?: string;
	/** Additional output data (workflow-specific) */
	outputData?: Record<string, unknown>;
	/** Output files generated (path -> content) */
	outputFiles?: Record<string, string>;
}

/** Available workflow types */
export type WorkflowType =
	| "getting-started-guide"
	| "code-docs"
	| "code-to-docs"
	| "code-to-api-docs"
	| "docs-to-site"
	| "architecture"
	| "architecture-doc"
	| "architecture-update"
	| "citations-graph"
	| "run-jolliscript"
	| "cli-impact";

/**
 * Type for additional tool executor function
 * Used to execute tools like sync_up_article that require backend access
 */
export type ToolExecutor = (call: ToolCall, runState: RunState) => Promise<string>;

/**
 * Result of a single job step execution, used for tracking and summary generation
 */
export interface StepResult {
	/** Step name */
	name: string;
	/** Type of step executed */
	type: "run" | "run_tool" | "run_prompt";
	/** Whether the step succeeded */
	success: boolean;
	/** Output from the step (stdout for run, tool result for run_tool, assistant text for run_prompt) */
	output?: string;
}
