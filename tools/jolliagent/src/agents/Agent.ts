import type { LLMClient, LLMStreamEvent, Message, RunState, ToolCall, ToolDef } from "../Types";

export type AgentOptions = {
	model?: string;
	temperature?: number;
	tools?: Array<ToolDef>;
	client?: LLMClient;
	runState?: RunState;
	maxOutputTokens?: number;
	systemPrompt?: string;
};

export type ChatOptions = {
	system?: string;
	messages?: Array<Message>;
	prompt?: string;
};

/**
 * Provider-agnostic Agent wrapper that streams LLM events.
 * A concrete `LLMClient` (e.g., Anthropic) must be supplied by the caller/factory.
 */
export class Agent {
	private client: LLMClient;
	private readonly model: string;
	private readonly temperature?: number;
	private readonly tools?: Array<ToolDef>;
	private runState?: RunState;
	private readonly maxOutputTokens?: number;
	private readonly systemPrompt?: string;
	private listeners: Set<(ev: LLMStreamEvent) => void> = new Set();
	// Optional finalizer hook for workflow runners; invoked externally at end of loop
	finalizer?: () => Promise<void> | void;

	constructor(opts?: AgentOptions) {
		if (!opts?.client) {
			throw new Error("Agent requires an LLM client; pass one via factory or AgentOptions.client");
		}
		if (!opts?.model) {
			throw new Error("Agent requires a model identifier; pass one via AgentOptions.model");
		}
		this.client = opts.client;
		this.model = opts.model;
		if (opts.temperature !== undefined) {
			this.temperature = opts.temperature;
		}
		if (opts.tools !== undefined) {
			this.tools = opts.tools;
		}
		if (opts.runState !== undefined) {
			this.runState = opts.runState;
		}
		if (opts.maxOutputTokens !== undefined) {
			this.maxOutputTokens = opts.maxOutputTokens;
		}
		if (opts.systemPrompt !== undefined) {
			this.systemPrompt = opts.systemPrompt;
		}
	}

	/**
	 * Get the tools configured for this agent
	 */
	getTools(): Array<ToolDef> | undefined {
		return this.tools;
	}

	/**
	 * Get the model configured for this agent
	 */
	getModel(): string {
		return this.model;
	}

	/**
	 * Get the temperature configured for this agent
	 */
	getTemperature(): number | undefined {
		return this.temperature;
	}

	/**
	 * Get the system prompt configured for this agent
	 */
	getSystemPrompt(): string | undefined {
		return this.systemPrompt;
	}

	/**
	 * Continue an assistant response by appending a tool result to the prior messages.
	 * Wraps the provider client's continueWithToolResult and emits stream events to listeners.
	 */
	async *continueWithToolResult(params: {
		priorMessages: Array<Message>;
		tool_call_id: string;
		tool_output: string;
		tool_name: string;
		temperature?: number;
	}): AsyncGenerator<LLMStreamEvent, void, unknown> {
		// Ensure prior tool messages are well-formed
		this.assertToolMessagesHaveNames(params.priorMessages);
		const prior = params.priorMessages;

		const temp = params.temperature ?? this.temperature;
		const stream = this.client.continueWithToolResult({
			model: this.model,
			priorMessages: prior,
			tool_call_id: params.tool_call_id,
			tool_output: params.tool_output,
			tool_name: params.tool_name,
			...(temp !== undefined ? { temperature: temp } : {}),
		});

		for await (const ev of stream) {
			this.emit(ev);
			yield ev;
		}
	}

	serializeArgs(args: unknown): string {
		return JSON.stringify(args).slice(0, 200);
	}

	/**
	 * Execute a full assistant turn with tool handling.
	 * - Streams text deltas via optional onTextDelta callback.
	 * - Streams tool events via optional onToolEvent callback.
	 * - Batches any tool calls from the assistant into a single assistant_tool_uses message,
	 *   appends corresponding tool results, and continues until no further tool calls are returned.
	 * - Returns the final assistant text (if any) and the updated message history.
	 */
	async chatTurn(params: {
		history: Array<Message>;
		runTool: (call: ToolCall) => Promise<string>;
		onTextDelta?: (delta: string, isFirst: boolean) => void;
		onToolEvent?: (event: {
			type: string;
			tool: string;
			arguments: string;
			status: "start" | "end";
			result?: string;
		}) => void;
	}): Promise<{ assistantText: string; history: Array<Message> }> {
		const history = params.history;
		let finalAssistantText = "";
		let retriesRemaining = 1; // retry once on transient provider errors

		let continueToolLoop = true;
		while (continueToolLoop) {
			continueToolLoop = false;
			let assistantText = "";
			const pendingToolCalls: Array<ToolCall> = [];
			const assistantToolUses: Array<{ tool_call_id: string; tool_name: string; tool_input: unknown }> = [];
			let encounteredProviderError = false;
			let lastProviderError = "";

			for await (const ev of this.stream({ messages: history })) {
				if (ev.type === "text_delta") {
					if (assistantText === "") {
						params.onTextDelta?.(ev.delta, true);
					} else {
						params.onTextDelta?.(ev.delta, false);
					}
					assistantText += ev.delta;
				} else if (ev.type === "tool_call") {
					pendingToolCalls.push(ev.call);
					assistantToolUses.push({
						tool_call_id: ev.call.id,
						tool_name: ev.call.name,
						tool_input: ev.call.arguments,
					});
				} else if (ev.type === "error") {
					lastProviderError = ev.error ?? "Unknown provider error";
					console.error("[Agent.chatTurn] LLM provider error: %s (code: %s)", lastProviderError, ev.code);
					encounteredProviderError = true;
					break;
				}
			}

			if (encounteredProviderError) {
				if (retriesRemaining > 0) {
					retriesRemaining -= 1;
					console.error("[Agent.chatTurn] Retrying after provider error: %s", lastProviderError);
					// Nudge the model to continue despite error
					history.push({
						role: "user",
						content:
							"A provider error occurred. Please continue your plan and retry any needed tool calls.",
					});
					continueToolLoop = true;
					continue; // retry the loop
				} else {
					console.error("[Agent.chatTurn] Provider error after all retries exhausted: %s", lastProviderError);
					// Stop retrying; persist any partial assistant text
					if (assistantText.trim().length > 0) {
						history.push({ role: "assistant", content: assistantText });
						finalAssistantText = assistantText;
					}
					break;
				}
			}

			if (pendingToolCalls.length > 0) {
				// Append one assistant message that contains all tool_use blocks from this turn
				history.push({ role: "assistant_tool_uses", calls: assistantToolUses } as Message);
				for (const call of pendingToolCalls) {
					// Notify UI that tool is starting
					params.onToolEvent?.({
						type: "tool_call",
						tool: call.name,
						arguments: this.serializeArgs(call.arguments),
						status: "start",
					});

					const toolOutput = await params.runTool(call);

					// Notify UI that tool finished
					params.onToolEvent?.({
						type: "tool_call",
						tool: call.name,
						arguments: this.serializeArgs(call.arguments),
						status: "end",
						result: toolOutput.slice(0, 200), // Send truncated result for preview
					});

					history.push({ role: "tool", tool_call_id: call.id, content: toolOutput, tool_name: call.name });
				}
				continueToolLoop = true; // continue the turn with the new tool results in history
			} else {
				// No tool calls this turn; finalize assistant text
				if (assistantText.trim().length > 0) {
					history.push({ role: "assistant", content: assistantText });
					finalAssistantText = assistantText;
				}
			}
		}

		return { assistantText: finalAssistantText, history };
	}

	/**
	 * Stream an assistant response. Provide either `messages` or a `prompt` (with optional `system`).
	 */
	async *stream(opts: ChatOptions): AsyncGenerator<LLMStreamEvent, void, unknown> {
		const messages = this.buildMessages(opts);
		const stream = this.client.stream({
			model: this.model,
			messages,
			...(this.tools !== undefined ? { tools: this.tools } : {}),
			...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
			...(this.maxOutputTokens !== undefined ? { maxOutputTokens: this.maxOutputTokens } : {}),
		});

		for await (const ev of stream) {
			this.emit(ev);
			yield ev;
		}
	}

	/**
	 * Convenience helper to get the full text (non-stream consumer).
	 */
	async complete(
		opts: ChatOptions,
	): Promise<{ text: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }> {
		let text = "";
		let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
		for await (const ev of this.stream(opts)) {
			if (ev.type === "text_delta") {
				text += ev.delta;
			} else if (ev.type === "response_completed") {
				usage = ev.usage;
			}
		}
		return usage !== undefined ? { text, usage } : { text };
	}

	private buildMessages(opts: ChatOptions): Array<Message> {
		if (opts.messages && opts.messages.length > 0) {
			// Optionally filter duplicate plan tool results when safe (no assistant tool-use adjacency present)
			const processed = this.filterPlanToolResultsIfSafe(opts.messages);
			// Enforce tool_name presence on tool messages
			this.assertToolMessagesHaveNames(processed);
			return processed;
		}
		// Use opts.system if provided, otherwise fall back to agent's systemPrompt
		const systemContent = opts.system || this.systemPrompt;
		const system = systemContent ? [{ role: "system", content: systemContent } as const] : [];
		const user = opts.prompt ? [{ role: "user", content: opts.prompt } as const] : [];
		return [...system, ...user];
	}

	private assertToolMessagesHaveNames(messages: Array<Message>) {
		for (const m of messages) {
			if (m.role === "tool" && (!("tool_name" in m) || !m.tool_name)) {
				throw new Error("Tool message missing required tool_name. Ensure tool results include tool_name.");
			}
		}
	}

	// Note: We intentionally do not filter older get_plan/set_plan tool results here, to avoid
	// breaking the provider requirement that each assistant tool_use must be followed immediately
	// by a single message containing the corresponding tool_result blocks.

	// However, for direct Agent.stream calls with a preconstructed message list (no assistant tool-use
	// adjacency), it's safe and desirable to drop older plan tool results so only the latest set_plan
	// and get_plan remain. This mirrors how the interactive loop batches tool results per turn.
	private filterPlanToolResultsIfSafe(messages: Array<Message>): Array<Message> {
		const hasAssistantToolUse = messages.some(
			m => m.role === "assistant_tool_use" || m.role === "assistant_tool_uses",
		);
		if (hasAssistantToolUse) {
			return messages; // preserve strict adjacency semantics
		}

		// Find last indices for plan-related tool results
		let lastSetPlan = -1;
		let lastGetPlan = -1;
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			if (m && m.role === "tool" && "tool_name" in m && typeof m.tool_name === "string") {
				if (m.tool_name === "set_plan") {
					lastSetPlan = i;
				}
				if (m.tool_name === "get_plan") {
					lastGetPlan = i;
				}
			}
		}

		if (lastSetPlan === -1 && lastGetPlan === -1) {
			return messages;
		}

		const out: Array<Message> = [];
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			if (m && m.role === "tool" && "tool_name" in m && typeof m.tool_name === "string") {
				if (m.tool_name === "set_plan" && i !== lastSetPlan) {
					continue;
				}
				if (m.tool_name === "get_plan" && i !== lastGetPlan) {
					continue;
				}
			}
			out.push(messages[i]);
		}
		return out;
	}

	/**
	 * Subscribe to low-level stream events (text deltas, tool calls, completion, errors).
	 * Returns an unsubscribe function.
	 */
	onEvent(cb: (ev: LLMStreamEvent) => void): () => void {
		this.listeners.add(cb);
		return () => {
			this.listeners.delete(cb);
		};
	}

	private emit(ev: LLMStreamEvent) {
		for (const cb of this.listeners) {
			try {
				cb(ev);
			} catch {
				// Listener errors are isolated from agent flow
			}
		}
	}
}

export default Agent;
