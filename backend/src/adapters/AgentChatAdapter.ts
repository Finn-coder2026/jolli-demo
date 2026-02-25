import type { Agent } from "../../../tools/jolliagent/src/agents/Agent";
import type { Message, ToolCall } from "../../../tools/jolliagent/src/Types";
import type {
	AssistantToolUseCollabMessage,
	AssistantToolUsesCollabMessage,
	CollabMessage,
	StandardCollabMessage,
	ToolCollabMessage,
} from "../model/CollabConvo";
import { getLog } from "../util/Logger";

const log = getLog(import.meta);

function isStandardCollabConvoMessage(message: CollabMessage | Message): message is StandardCollabMessage {
	const { role } = message;
	return role === "user" || role === "assistant" || role === "system";
}

function isAssistantToolUseCollabMessage(message: CollabMessage | Message): message is AssistantToolUseCollabMessage {
	const { role } = message;
	return role === "assistant_tool_use";
}

function isAssistantToolUsesCollabMessage(message: CollabMessage | Message): message is AssistantToolUsesCollabMessage {
	const { role } = message;
	return role === "assistant_tool_uses";
}

function isToolCollabMessage(message: CollabMessage | Message): message is ToolCollabMessage {
	const { role } = message;
	return role === "tool";
}

function isAssistantToolUseMessage(message: Message): message is Extract<Message, { role: "assistant_tool_use" }> {
	return message.role === "assistant_tool_use";
}

function isAssistantToolUsesMessage(message: Message): message is Extract<Message, { role: "assistant_tool_uses" }> {
	return message.role === "assistant_tool_uses";
}

function isToolMessage(message: Message): message is Extract<Message, { role: "tool" }> {
	return message.role === "tool";
}

/**
 * Anthropic requires tool_result blocks to immediately follow the assistant
 * tool_use turn they belong to. This sanitizer drops malformed/orphan tool
 * history so provider calls do not fail on strict adjacency validation.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Multi-role message adjacency validation requires nested branching.
function sanitizeToolMessageSequence(messages: Array<Message>): Array<Message> {
	const sanitized: Array<Message> = [];

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (!message) {
			continue;
		}

		if (isAssistantToolUseMessage(message) || isAssistantToolUsesMessage(message)) {
			const expectedToolIds = new Set<string>();
			if (isAssistantToolUseMessage(message) && message.tool_call_id) {
				expectedToolIds.add(message.tool_call_id);
			}
			if (isAssistantToolUsesMessage(message)) {
				for (const call of message.calls) {
					if (call?.tool_call_id) {
						expectedToolIds.add(call.tool_call_id);
					}
				}
			}

			let j = i + 1;
			const matchedTools: Array<Extract<Message, { role: "tool" }>> = [];
			for (; j < messages.length; j++) {
				const next = messages[j];
				if (!next || !isToolMessage(next)) {
					break;
				}
				if (expectedToolIds.has(next.tool_call_id)) {
					matchedTools.push(next);
				}
			}

			if (matchedTools.length === 0) {
				log.warn(
					"Dropping malformed assistant tool-use message at index %d (no matching immediate tool results)",
					i,
				);
				i = j - 1;
				continue;
			}

			if (isAssistantToolUseMessage(message)) {
				sanitized.push(message);
			} else {
				const matchedIdSet = new Set(matchedTools.map(t => t.tool_call_id));
				const filteredCalls = message.calls.filter(call => matchedIdSet.has(call.tool_call_id));
				if (filteredCalls.length === 0) {
					log.warn("Dropping malformed assistant_tool_uses at index %d (no matching tool IDs)", i);
					i = j - 1;
					continue;
				}
				sanitized.push({
					role: "assistant_tool_uses",
					calls: filteredCalls,
				});
			}

			for (const tool of matchedTools) {
				sanitized.push(tool);
			}
			i = j - 1;
			continue;
		}

		if (isToolMessage(message)) {
			// Orphan tool result without a preceding assistant tool_use turn.
			log.warn("Dropping orphan tool result at index %d (tool_call_id=%s)", i, message.tool_call_id);
			continue;
		}

		sanitized.push(message);
	}

	return sanitized;
}

/**
 * Adapter that bridges CollabConvoRouter's interface with JolliAgent
 * Converts message formats and provides streaming interface
 */
export class AgentChatAdapter {
	private agent: Agent;

	constructor(agentFactory: { agent: Agent; withDefaults?: unknown }) {
		this.agent = agentFactory.agent;
		// Note: withDefaults is ignored - agent has systemPrompt in constructor now
	}

	/**
	 * Convert CollabMessage[] to jolliagent Message[]
	 */
	private convertMessages(messages: Array<CollabMessage>, systemPrompt?: string): Array<Message> {
		const raw: Array<Message> = [];

		if (systemPrompt) {
			raw.push({ role: "system", content: systemPrompt });
		}

		for (const msg of messages) {
			const message = this.toMessage(msg);
			if (message) {
				raw.push(message);
			}
		}

		return sanitizeToolMessageSequence(raw);
	}

	private toMessage(message: CollabMessage): Message | undefined {
		if (isStandardCollabConvoMessage(message)) {
			// Skip messages with empty content to prevent Anthropic API
			// "text content blocks must be non-empty" validation errors
			if (!message.content || message.content.trim().length === 0) {
				return;
			}
			const { role, content } = message;
			return {
				role,
				content,
			};
		} else if (isAssistantToolUseCollabMessage(message)) {
			const { role, tool_call_id, tool_input, tool_name } = message;
			return {
				role,
				tool_call_id,
				tool_name,
				tool_input,
			};
		} else if (isAssistantToolUsesCollabMessage(message)) {
			const { calls, role } = message;
			return {
				role,
				calls,
			};
		} else if (isToolCollabMessage(message)) {
			const { content, role, tool_call_id, tool_name } = message;
			return {
				role,
				tool_call_id,
				content,
				tool_name,
			};
		}
	}

	fromMessage(message: Message, timestamp: string): CollabMessage | undefined {
		const { role } = message;
		if (role === "user" || role === "assistant" || role === "system") {
			const { content, role } = message;
			return {
				role,
				content,
				timestamp,
			};
		} else if (role === "assistant_tool_use") {
			const { role, tool_call_id, tool_input, tool_name } = message;
			return {
				role,
				tool_call_id,
				tool_name,
				tool_input,
				timestamp,
			};
		} else if (role === "assistant_tool_uses") {
			const { calls, role } = message;
			return {
				role,
				calls,
				timestamp,
			};
		} else if (role === "tool") {
			const { content, role, tool_call_id, tool_name } = message;
			return {
				role,
				tool_call_id,
				content,
				tool_name,
				timestamp,
			};
		}
	}

	/**
	 * Stream a chat response using jolliagent's chatTurn
	 * Returns full response text and calls onChunk for each delta
	 */
	async streamResponse(params: {
		messages: Array<CollabMessage>;
		systemPrompt?: string;
		onChunk: (content: string) => void;
		onToolEvent?: (event: {
			type: string;
			tool: string;
			arguments: string;
			status?: string;
			result?: string;
		}) => void;
		onToolCall?: (call: ToolCall, result: string) => void;
		runTool?: (call: ToolCall) => Promise<string>;
	}): Promise<{ assistantText: string; newMessages: Array<Message> }> {
		// Convert messages to jolliagent format
		// Note: systemPrompt is optional - agent has its own default in constructor
		const history = this.convertMessages(params.messages, params.systemPrompt);
		// Save length before chatTurn — chatTurn mutates the history array in-place,
		// so history.length will have grown by the time it returns.
		const initialLength = history.length;

		log.debug("AgentChatAdapter: Starting chatTurn with %d messages", initialLength);

		// Use chatTurn with streaming callback
		const result = await this.agent.chatTurn({
			history,
			runTool:
				params.runTool ||
				(call => {
					// Default: tools disabled, return placeholder
					log.debug("Tool call requested but tools disabled: %s", call.name);
					return Promise.resolve("Tool execution not available");
				}),
			onTextDelta: (delta: string) => {
				params.onChunk(delta);
			},
			onToolEvent: event => {
				// Broadcast tool events to frontend
				log.debug("Tool event: %s %s %s", event.type, event.tool, event.status);
				if (params.onToolEvent) {
					params.onToolEvent(event);
				}
				if (event.type === "tool_end" && event.result && params.onToolCall) {
					// Could reconstruct ToolCall from event data if needed
					// For now, just log it
				}
			},
		});

		log.debug("AgentChatAdapter: chatTurn completed, response length: %d", result.assistantText.length);

		// Extract only the new messages added during this turn (everything after the original history)
		const newMessages = result.history.slice(initialLength);

		return { assistantText: result.assistantText, newMessages };
	}
}
