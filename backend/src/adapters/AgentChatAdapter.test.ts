import type { Agent } from "../../../tools/jolliagent/src/agents/Agent";
import type { ToolCall } from "../../../tools/jolliagent/src/Types";
import type { CollabMessage } from "../model/CollabConvo";
import { AgentChatAdapter } from "./AgentChatAdapter";
import { describe, expect, it, vi } from "vitest";

describe("AgentChatAdapter", () => {
	it("converts messages correctly", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "response",
				history: [
					{ role: "user", content: "hello" },
					{ role: "assistant", content: "hi there" },
				],
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
			{ role: "assistant" as const, content: "hi there", timestamp: "2024-01-01T00:00:01Z" },
		];

		const onChunk = vi.fn();

		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				history: [
					{ role: "user", content: "hello" },
					{ role: "assistant", content: "hi there" },
				],
			}),
		);
	});

	it("includes system prompt when provided", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "response",
				history: [
					{ role: "system", content: "You are a helpful assistant" },
					{ role: "user", content: "hello" },
				],
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		await adapter.streamResponse({
			messages,
			systemPrompt: "You are a helpful assistant",
			onChunk,
		});

		expect(mockAgent.chatTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				history: [
					{ role: "system", content: "You are a helpful assistant" },
					{ role: "user", content: "hello" },
				],
			}),
		);
	});

	it("calls onChunk for each delta", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(({ onTextDelta, history }) => {
				onTextDelta("Hello ");
				onTextDelta("world");
				return Promise.resolve({
					assistantText: "Hello world",
					history: [...history, { role: "assistant", content: "Hello world" }],
				});
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		const result = await adapter.streamResponse({ messages, onChunk });

		expect(onChunk).toHaveBeenCalledWith("Hello ");
		expect(onChunk).toHaveBeenCalledWith("world");
		expect(result.assistantText).toBe("Hello world");
	});

	it("uses default runTool when not provided", async () => {
		const mockToolCall: ToolCall = { id: "call_1", name: "test_tool", arguments: {} };

		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(async ({ runTool, history }) => {
				// Call runTool to trigger the default implementation
				const toolResult = await runTool(mockToolCall);
				expect(toolResult).toBe("Tool execution not available");
				return {
					assistantText: "response",
					history: [...history, { role: "assistant", content: "response" }],
				};
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalled();
	});

	it("uses provided runTool when available", async () => {
		const mockToolCall: ToolCall = { id: "call_2", name: "test_tool", arguments: {} };
		const customRunTool = vi.fn().mockResolvedValue("custom result");

		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(async ({ runTool, history }) => {
				await runTool(mockToolCall);
				return {
					assistantText: "response",
					history: [...history, { role: "assistant", content: "response" }],
				};
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		await adapter.streamResponse({
			messages,
			onChunk,
			runTool: customRunTool,
		});

		expect(customRunTool).toHaveBeenCalledWith(mockToolCall);
	});

	it("handles tool events with logging", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(({ onToolEvent, history }) => {
				// Trigger tool event
				onToolEvent({
					type: "tool_start",
					tool: "test_tool",
					status: "running",
				});
				return Promise.resolve({
					assistantText: "response",
					history: [...history, { role: "assistant", content: "response" }],
				});
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalled();
	});

	it("handles tool_end events with result and onToolCall", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(({ onToolEvent, history }) => {
				// Trigger tool_end event with result
				onToolEvent({
					type: "tool_end",
					tool: "test_tool",
					status: "success",
					result: "tool result",
				});
				return Promise.resolve({
					assistantText: "response",
					history: [...history, { role: "assistant", content: "response" }],
				});
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();
		const onToolCall = vi.fn();

		await adapter.streamResponse({
			messages,
			onChunk,
			onToolCall,
		});

		expect(mockAgent.chatTurn).toHaveBeenCalled();
	});

	it("filters out non-user/assistant messages", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "response",
				history: [
					{ role: "user", content: "hello" },
					{ role: "assistant", content: "hi" },
				],
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
			{ role: "assistant" as const, content: "hi", timestamp: "2024-01-01T00:00:01Z" },
		];

		const onChunk = vi.fn();

		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				history: [
					{ role: "user", content: "hello" },
					{ role: "assistant", content: "hi" },
				],
			}),
		);
	});

	it("ignores withDefaults in constructor", () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn(),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({
			agent: mockAgent,
			withDefaults: { someConfig: "value" },
		});

		expect(adapter).toBeDefined();
	});

	it("converts assistant_tool_use messages correctly when paired with tool result", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "response",
				history: [
					{
						role: "assistant_tool_use",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						tool_input: { foo: "bar" },
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						content: "tool result",
					},
				],
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{
				role: "assistant_tool_use" as const,
				tool_call_id: "call_1",
				tool_name: "test_tool",
				tool_input: { foo: "bar" },
				timestamp: "2024-01-01T00:00:00Z",
			},
			{
				role: "tool" as const,
				tool_call_id: "call_1",
				tool_name: "test_tool",
				content: "tool result",
				timestamp: "2024-01-01T00:00:01Z",
			},
		];

		const onChunk = vi.fn();
		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				history: [
					{
						role: "assistant_tool_use",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						tool_input: { foo: "bar" },
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						content: "tool result",
					},
				],
			}),
		);
	});

	it("converts assistant_tool_uses messages correctly when paired with tool results", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "response",
				history: [
					{
						role: "assistant_tool_uses",
						calls: [
							{ tool_call_id: "call_1", tool_name: "tool1", tool_input: {} },
							{ tool_call_id: "call_2", tool_name: "tool2", tool_input: {} },
						],
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						tool_name: "tool1",
						content: "result1",
					},
					{
						role: "tool",
						tool_call_id: "call_2",
						tool_name: "tool2",
						content: "result2",
					},
				],
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{
				role: "assistant_tool_uses" as const,
				calls: [
					{ tool_call_id: "call_1", tool_name: "tool1", tool_input: {} },
					{ tool_call_id: "call_2", tool_name: "tool2", tool_input: {} },
				],
				timestamp: "2024-01-01T00:00:00Z",
			},
			{
				role: "tool" as const,
				tool_call_id: "call_1",
				tool_name: "tool1",
				content: "result1",
				timestamp: "2024-01-01T00:00:01Z",
			},
			{
				role: "tool" as const,
				tool_call_id: "call_2",
				tool_name: "tool2",
				content: "result2",
				timestamp: "2024-01-01T00:00:02Z",
			},
		];

		const onChunk = vi.fn();
		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				history: [
					{
						role: "assistant_tool_uses",
						calls: [
							{ tool_call_id: "call_1", tool_name: "tool1", tool_input: {} },
							{ tool_call_id: "call_2", tool_name: "tool2", tool_input: {} },
						],
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						tool_name: "tool1",
						content: "result1",
					},
					{
						role: "tool",
						tool_call_id: "call_2",
						tool_name: "tool2",
						content: "result2",
					},
				],
			}),
		);
	});

	it("converts tool messages correctly when paired with assistant tool_use", async () => {
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockResolvedValue({
				assistantText: "response",
				history: [
					{
						role: "assistant_tool_use",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						tool_input: {},
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						content: "tool result",
					},
				],
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{
				role: "assistant_tool_use" as const,
				tool_call_id: "call_1",
				tool_name: "test_tool",
				tool_input: {},
				timestamp: "2024-01-01T00:00:00Z",
			},
			{
				role: "tool" as const,
				tool_call_id: "call_1",
				tool_name: "test_tool",
				content: "tool result",
				timestamp: "2024-01-01T00:00:01Z",
			},
		];

		const onChunk = vi.fn();
		await adapter.streamResponse({ messages, onChunk });

		expect(mockAgent.chatTurn).toHaveBeenCalledWith(
			expect.objectContaining({
				history: [
					{
						role: "assistant_tool_use",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						tool_input: {},
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						tool_name: "test_tool",
						content: "tool result",
					},
				],
			}),
		);
	});

	it("calls onToolEvent callback when provided", async () => {
		const onToolEvent = vi.fn();
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(({ onToolEvent: callback, history }) => {
				// Trigger tool event
				callback({
					type: "tool_start",
					tool: "test_tool",
					status: "running",
				});
				return Promise.resolve({
					assistantText: "response",
					history: [...history, { role: "assistant", content: "response" }],
				});
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		await adapter.streamResponse({
			messages,
			onChunk,
			onToolEvent,
		});

		expect(onToolEvent).toHaveBeenCalledWith({
			type: "tool_start",
			tool: "test_tool",
			status: "running",
		});
	});

	it("returns new messages when chatTurn mutates history in-place", async () => {
		// Simulates real Agent.chatTurn behavior: it pushes new messages onto the
		// same history array that was passed in, rather than returning a new array.
		const mockAgent: Agent = {
			chatTurn: vi.fn().mockImplementation(({ history }) => {
				// Mutate the array in-place, just like the real Agent.chatTurn
				history.push({
					role: "assistant_tool_uses",
					calls: [{ tool_call_id: "call_1", tool_name: "navigate_user", tool_input: { path: "/drafts/42" } }],
				});
				history.push({
					role: "tool",
					tool_call_id: "call_1",
					tool_name: "navigate_user",
					content: JSON.stringify({ navigated: true }),
				});
				history.push({ role: "assistant", content: "Navigating you now." });
				return Promise.resolve({
					assistantText: "Navigating you now.",
					history,
				});
			}),
		} as unknown as Agent;

		const adapter = new AgentChatAdapter({ agent: mockAgent });

		const messages: Array<CollabMessage> = [
			{ role: "user" as const, content: "Create a draft", timestamp: "2024-01-01T00:00:00Z" },
		];
		const onChunk = vi.fn();

		const result = await adapter.streamResponse({ messages, onChunk });

		// The bug was: newMessages would be [] because history.length grew in-place.
		// After the fix, newMessages should contain all 3 messages added by chatTurn.
		expect(result.newMessages).toHaveLength(3);
		expect(result.newMessages[0].role).toBe("assistant_tool_uses");
		expect(result.newMessages[1].role).toBe("tool");
		expect(result.newMessages[2].role).toBe("assistant");
		expect(result.assistantText).toBe("Navigating you now.");
	});

	describe("empty content filtering", () => {
		it("skips messages with empty content", async () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn().mockResolvedValue({
					assistantText: "response",
					history: [
						{ role: "user", content: "hello" },
						{ role: "assistant", content: "response" },
					],
				}),
			} as unknown as Agent;

			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const messages: Array<CollabMessage> = [
				{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
				{ role: "assistant" as const, content: "", timestamp: "2024-01-01T00:00:01Z" },
				{ role: "user" as const, content: "world", timestamp: "2024-01-01T00:00:02Z" },
			];

			const onChunk = vi.fn();
			await adapter.streamResponse({ messages, onChunk });

			// The empty assistant message should be filtered out
			expect(mockAgent.chatTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						{ role: "user", content: "hello" },
						{ role: "user", content: "world" },
					],
				}),
			);
		});

		it("skips messages with whitespace-only content", async () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn().mockResolvedValue({
					assistantText: "response",
					history: [
						{ role: "user", content: "hello" },
						{ role: "assistant", content: "response" },
					],
				}),
			} as unknown as Agent;

			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const messages: Array<CollabMessage> = [
				{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
				{ role: "assistant" as const, content: "   ", timestamp: "2024-01-01T00:00:01Z" },
				{ role: "system" as const, content: "\n\t", timestamp: "2024-01-01T00:00:02Z" },
				{ role: "user" as const, content: "world", timestamp: "2024-01-01T00:00:03Z" },
			];

			const onChunk = vi.fn();
			await adapter.streamResponse({ messages, onChunk });

			// Both whitespace-only messages should be filtered out
			expect(mockAgent.chatTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						{ role: "user", content: "hello" },
						{ role: "user", content: "world" },
					],
				}),
			);
		});

		it("keeps tool messages with empty content when paired with assistant tool_use", async () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn().mockResolvedValue({
					assistantText: "response",
					history: [],
				}),
			} as unknown as Agent;

			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const messages: Array<CollabMessage> = [
				{
					role: "assistant_tool_use" as const,
					tool_call_id: "call_1",
					tool_name: "test_tool",
					tool_input: {},
					timestamp: "2024-01-01T00:00:00Z",
				},
				{
					role: "tool" as const,
					tool_call_id: "call_1",
					tool_name: "test_tool",
					content: "",
					timestamp: "2024-01-01T00:00:01Z",
				},
			];

			const onChunk = vi.fn();
			await adapter.streamResponse({ messages, onChunk });

			// Tool messages should be preserved even with empty content when well-formed.
			expect(mockAgent.chatTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						{
							role: "assistant_tool_use",
							tool_call_id: "call_1",
							tool_name: "test_tool",
							tool_input: {},
						},
						{
							role: "tool",
							tool_call_id: "call_1",
							tool_name: "test_tool",
							content: "",
						},
					],
				}),
			);
		});

		it("drops orphan tool messages that are not paired with assistant tool_use", async () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn().mockResolvedValue({
					assistantText: "response",
					history: [],
				}),
			} as unknown as Agent;

			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const messages: Array<CollabMessage> = [
				{ role: "user" as const, content: "hello", timestamp: "2024-01-01T00:00:00Z" },
				{
					role: "tool" as const,
					tool_call_id: "call_orphan",
					tool_name: "test_tool",
					content: "orphan result",
					timestamp: "2024-01-01T00:00:01Z",
				},
				{ role: "user" as const, content: "continue", timestamp: "2024-01-01T00:00:02Z" },
			];

			const onChunk = vi.fn();
			await adapter.streamResponse({ messages, onChunk });

			expect(mockAgent.chatTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						{ role: "user", content: "hello" },
						{ role: "user", content: "continue" },
					],
				}),
			);
		});

		it("drops mismatched tool results and keeps only matching assistant_tool_uses pairs", async () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn().mockResolvedValue({
					assistantText: "response",
					history: [],
				}),
			} as unknown as Agent;

			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const messages: Array<CollabMessage> = [
				{
					role: "assistant_tool_uses" as const,
					calls: [{ tool_call_id: "call_1", tool_name: "tool_a", tool_input: { a: 1 } }],
					timestamp: "2024-01-01T00:00:00Z",
				},
				{
					role: "tool" as const,
					tool_call_id: "call_2",
					tool_name: "tool_a",
					content: "mismatched result",
					timestamp: "2024-01-01T00:00:01Z",
				},
				{
					role: "tool" as const,
					tool_call_id: "call_1",
					tool_name: "tool_a",
					content: "matched result",
					timestamp: "2024-01-01T00:00:02Z",
				},
			];

			const onChunk = vi.fn();
			await adapter.streamResponse({ messages, onChunk });

			expect(mockAgent.chatTurn).toHaveBeenCalledWith(
				expect.objectContaining({
					history: [
						{
							role: "assistant_tool_uses",
							calls: [{ tool_call_id: "call_1", tool_name: "tool_a", tool_input: { a: 1 } }],
						},
						{
							role: "tool",
							tool_call_id: "call_1",
							tool_name: "tool_a",
							content: "matched result",
						},
					],
				}),
			);
		});
	});

	describe("fromMessage", () => {
		it("converts user message correctly", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const result = adapter.fromMessage({ role: "user", content: "test content" }, "2024-01-01T00:00:00Z");

			expect(result).toEqual({
				role: "user",
				content: "test content",
				timestamp: "2024-01-01T00:00:00Z",
			});
		});

		it("converts assistant message correctly", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const result = adapter.fromMessage({ role: "assistant", content: "response" }, "2024-01-01T00:00:01Z");

			expect(result).toEqual({
				role: "assistant",
				content: "response",
				timestamp: "2024-01-01T00:00:01Z",
			});
		});

		it("converts system message correctly", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const result = adapter.fromMessage({ role: "system", content: "System prompt" }, "2024-01-01T00:00:02Z");

			expect(result).toEqual({
				role: "system",
				content: "System prompt",
				timestamp: "2024-01-01T00:00:02Z",
			});
		});

		it("converts assistant_tool_use message correctly", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const result = adapter.fromMessage(
				{
					role: "assistant_tool_use",
					tool_call_id: "call_123",
					tool_name: "test_tool",
					tool_input: { arg: "value" },
				},
				"2024-01-01T00:00:03Z",
			);

			expect(result).toEqual({
				role: "assistant_tool_use",
				tool_call_id: "call_123",
				tool_name: "test_tool",
				tool_input: { arg: "value" },
				timestamp: "2024-01-01T00:00:03Z",
			});
		});

		it("converts assistant_tool_uses message correctly", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const calls = [
				{ tool_call_id: "call_1", tool_name: "tool1", tool_input: { arg1: "val1" } },
				{ tool_call_id: "call_2", tool_name: "tool2", tool_input: { arg2: "val2" } },
			];

			const result = adapter.fromMessage(
				{
					role: "assistant_tool_uses",
					calls,
				},
				"2024-01-01T00:00:04Z",
			);

			expect(result).toEqual({
				role: "assistant_tool_uses",
				calls,
				timestamp: "2024-01-01T00:00:04Z",
			});
		});

		it("converts tool message correctly", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const result = adapter.fromMessage(
				{
					role: "tool",
					tool_call_id: "call_123",
					tool_name: "test_tool",
					content: "tool result",
				},
				"2024-01-01T00:00:05Z",
			);

			expect(result).toEqual({
				role: "tool",
				tool_call_id: "call_123",
				tool_name: "test_tool",
				content: "tool result",
				timestamp: "2024-01-01T00:00:05Z",
			});
		});

		it("returns undefined for unknown message role", () => {
			const mockAgent: Agent = {
				chatTurn: vi.fn(),
			} as unknown as Agent;
			const adapter = new AgentChatAdapter({ agent: mockAgent });

			const result = adapter.fromMessage({ role: "unknown_role" } as never, "2024-01-01T00:00:06Z");

			expect(result).toBeUndefined();
		});
	});
});
