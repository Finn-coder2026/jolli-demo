import type { LLMClient, LLMStreamEvent, Message, MessageStream, StreamOptions, ToolCall, ToolDef } from "../Types";
import Anthropic from "@anthropic-ai/sdk";
import type { Tool as AnthropicTool, MessageParam } from "@anthropic-ai/sdk/resources/messages";

// Default max output tokens if not specified - should be set by factory
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

function toAnthropicMessages(messages: Array<Message>) {
	// Anthropic has no "system" role in the array (uses separate `system`).
	// Strategy: lift first system message (if any) to `system`, remove from list.
	let system: string | undefined;
	const rest: Array<{ role: "user" | "assistant"; content: Array<object> }> = [];

	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.role === "system" && system === undefined) {
			system = m.content;
			continue;
		}
		if (m.role === "assistant_tool_use") {
			// Represent single assistant tool use
			const block = {
				type: "tool_use",
				id: m.tool_call_id,
				name: m.tool_name,
				input: m.tool_input,
			} as const;
			rest.push({ role: "assistant", content: [block] as Array<object> });
			continue;
		}
		if (m.role === "assistant_tool_uses") {
			// Represent batched assistant tool uses in one assistant turn
			const blocks = m.calls.map(c => ({
				type: "tool_use",
				id: c.tool_call_id,
				name: c.tool_name,
				input: c.tool_input,
			}));
			rest.push({ role: "assistant", content: blocks as Array<object> });
			continue;
		}
		if (m.role === "tool") {
			// Anthropic requires all tool_result blocks for a prior assistant turn's tool_use(s)
			// to appear in the single next message. Coalesce consecutive tool messages accordingly.
			const blocks: Array<object> = [];
			// Collect this and any subsequent consecutive tool messages
			let j = i;
			for (; j < messages.length; j++) {
				const t = messages[j];
				if (t.role !== "tool") {
					break;
				}
				blocks.push({
					type: "tool_result",
					tool_use_id: t.tool_call_id,
					content: t.content,
				} as const);
			}
			rest.push({ role: "user", content: blocks });
			i = j - 1; // advance outer loop to last consumed index
			continue;
		}
		// regular user/assistant
		if (m.role === "user" || m.role === "assistant") {
			rest.push({ role: m.role, content: [{ type: "text", text: m.content }] as Array<object> });
		}
	}

	return { system, messages: rest };
}

function toAnthropicTools(tools?: Array<ToolDef>) {
	if (!tools?.length) {
		return;
	}
	return tools.map(t => ({
		name: t.name,
		description: t.description ?? "",
		input_schema: t.parameters,
	}));
}

export class AnthropicLLMClient implements LLMClient {
	private client: Anthropic;

	constructor(opts?: { apiKey?: string; client?: Anthropic }) {
		this.client = opts?.client ?? new Anthropic({ apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY });
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Stream handling requires complex state management and error handling
	async *stream(opts: StreamOptions): AsyncGenerator<LLMStreamEvent, void, unknown> {
		let stream: MessageStream | undefined;
		try {
			const { system, messages } = toAnthropicMessages(opts.messages);
			const tools = toAnthropicTools(opts.tools);

			const DEBUG = !!process.env.JOLLI_DEBUG && process.env.JOLLI_DEBUG.length > 0;
			if (DEBUG) {
				try {
					const _reqDebug = {
						model: opts.model,
						system,
						messages,
						tools,
						temperature: opts.temperature,
						max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
					};
				} catch {
					// Ignore debug logging errors
				}
			}

			stream = (await this.client.messages.stream({
				model: opts.model,
				...(system !== undefined ? { system } : {}),
				messages: messages as unknown as Array<MessageParam>,
				...(tools !== undefined ? { tools: tools as unknown as Array<AnthropicTool> } : {}),
				...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
				max_tokens: opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
			})) as unknown as MessageStream;

			// Track tool_use input deltas per content block index so we emit after completion
			const toolUseState = new Map<
				number,
				{
					index: number;
					id?: string;
					name?: string;
					inputFromStart?: unknown;
					jsonBuf?: string;
					textBuf?: string;
				}
			>();

			for await (const event of stream) {
				// Text deltas
				if (
					event.type === "content_block_delta" &&
					typeof event.delta === "object" &&
					event.delta &&
					"type" in event.delta &&
					event.delta.type === "text_delta"
				) {
					const text = "text" in event.delta && typeof event.delta.text === "string" ? event.delta.text : "";
					if (text) {
						yield { type: "text_delta", delta: text };
					}
					continue;
				}

				// Tool use start: initialize buffer for input deltas
				if (
					event.type === "content_block_start" &&
					typeof event.content_block === "object" &&
					event.content_block &&
					"type" in event.content_block &&
					event.content_block.type === "tool_use"
				) {
					const block = event.content_block as unknown as { id: string; name: string; input?: unknown };
					const idx = "index" in event && typeof event.index === "number" ? event.index : 0;
					toolUseState.set(idx, { index: idx, id: block.id, name: block.name, inputFromStart: block.input });
					if (DEBUG) {
						try {
							process.stdout.write(
								`🪵 debug anthropic.tool_use.start: index=${idx} ${JSON.stringify(block)}\n`,
							);
						} catch {
							// Ignore debug logging errors
						}
					}
					continue;
				}

				// Tool use input deltas: accumulate JSON or text
				if (
					event.type === "content_block_delta" &&
					typeof event.delta === "object" &&
					event.delta &&
					"type" in event.delta &&
					(event.delta.type === "input_json_delta" || event.delta.type === "input_text_delta")
				) {
					const idx = "index" in event && typeof event.index === "number" ? event.index : 0;
					const state = toolUseState.get(idx);
					if (state) {
						if (event.delta.type === "input_json_delta" && "partial_json" in event.delta) {
							state.jsonBuf =
								(state.jsonBuf ?? "") +
								String(("partial_json" in event.delta ? event.delta.partial_json : "") ?? "");
						}
						if (event.delta.type === "input_text_delta" && "partial_text" in event.delta) {
							state.textBuf =
								(state.textBuf ?? "") +
								String(("partial_text" in event.delta ? event.delta.partial_text : "") ?? "");
						}
						toolUseState.set(idx, state);
						if (DEBUG) {
							try {
								process.stdout.write(
									`debug anthropic.tool_use.delta: index=${idx} type=${event.delta.type} jsonLen=${(state.jsonBuf ?? "").length} textLen=${(state.textBuf ?? "").length}\n`,
								);
							} catch {
								// Ignore debug logging errors
							}
						}
					}
					continue;
				}

				// Tool use end: emit tool_call with assembled input
				if (event.type === "content_block_stop") {
					const idx = "index" in event && typeof event.index === "number" ? event.index : 0;
					const state = toolUseState.get(idx);
					if (!state) {
						continue;
					}
					let assembled: unknown = state.inputFromStart;
					if (state?.jsonBuf && state.jsonBuf.trim().length > 0) {
						try {
							assembled = JSON.parse(state.jsonBuf);
						} catch {
							// leave as string if not valid JSON
							assembled = state.jsonBuf;
						}
					} else if (state?.textBuf && state.textBuf.length > 0) {
						assembled = state.textBuf;
					}
					const call: ToolCall = {
						id: state.id ?? `tool_use_${idx}`,
						name: state.name ?? "",
						arguments: assembled,
						providerMeta: {
							index: state.index,
							id: state.id,
							name: state.name,
							jsonBuf: state.jsonBuf,
							textBuf: state.textBuf,
						},
					};
					if (DEBUG) {
						try {
							process.stdout.write(
								`🪵 debug anthropic.tool_use.stop: index=$
							idx;
							$;
							JSON.stringify(call).slice(0, 2000);
							\n`,
							);
						} catch {
							// Ignore debug logging errors
						}
					}
					yield { type: "tool_call", call };
					toolUseState.delete(idx);
				}

				// End of message; we'll emit a response_completed after the stream ends
			}

			const finalMsg = await stream.finalMessage();
			const finish_reason_raw = finalMsg.stop_reason;
			const finish_reason =
				finish_reason_raw === "end_turn"
					? "stop"
					: finish_reason_raw === "max_tokens"
						? "length"
						: finish_reason_raw === "tool_use"
							? "tool_calls"
							: "other";

			const usage = finalMsg.usage;

			const responseEvent: LLMStreamEvent = {
				type: "response_completed",
				finish_reason,
			};
			if (usage) {
				const usageObj: { input_tokens?: number; output_tokens?: number; total_tokens?: number } = {};
				if (usage.input_tokens !== undefined) {
					usageObj.input_tokens = usage.input_tokens;
				}
				if (usage.output_tokens !== undefined) {
					usageObj.output_tokens = usage.output_tokens;
				}
				usageObj.total_tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
				responseEvent.usage = usageObj;
			}
			yield responseEvent;
		} catch (err) {
			const error = err as { message?: string; code?: string; name?: string };
			const errorEvent: LLMStreamEvent = {
				type: "error",
				error: error?.message ?? String(err),
				providerMeta: err,
			};
			const code = error?.code ?? error?.name;
			if (code !== undefined) {
				errorEvent.code = code;
			}
			yield errorEvent;
		} finally {
			// Ensure stream resources are released
			try {
				await stream?.close?.();
			} catch {
				// Ignore errors during cleanup
			}
		}
	}

	async *continueWithToolResult(params: {
		model: string;
		priorMessages: Array<Message>;
		tool_call_id: string;
		tool_output: string;
		tool_name: string;
		temperature?: number;
	}): AsyncGenerator<LLMStreamEvent, void, unknown> {
		// Append the tool result as a tool message; translator will convert for Anthropic
		const messages: Array<Message> = [
			...params.priorMessages,
			{
				role: "tool",
				tool_call_id: params.tool_call_id,
				content: params.tool_output,
				tool_name: params.tool_name,
			},
		];

		const streamOpts: StreamOptions = {
			model: params.model,
			messages,
		};
		if (params.temperature !== undefined) {
			streamOpts.temperature = params.temperature;
		}
		// Ensure at least one await expression to satisfy lint/suspicious/useAwait
		await Promise.resolve();
		yield* this.stream(streamOpts);
	}
}

export default AnthropicLLMClient;
