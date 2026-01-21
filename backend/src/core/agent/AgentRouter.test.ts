import type { ChatMessage } from "./Agent";
import {
	type AgentMetadata,
	CapabilityRouter,
	FunctionRouter,
	PrimaryFallbackRouter,
	RoundRobinRouter,
	UserSpecifiedRouter,
} from "./AgentRouter";
import { beforeEach, describe, expect, it } from "vitest";

describe("AgentRouter", () => {
	let mockAgents: Map<string, AgentMetadata>;
	let testMessages: Array<ChatMessage>;

	beforeEach(() => {
		mockAgents = new Map([
			[
				"agent1",
				{
					id: "agent1",
					name: "Agent 1",
					description: "General purpose agent",
					capabilities: ["general", "code"],
					provider: "openai",
					model: "gpt-4o-mini",
				},
			],
			[
				"agent2",
				{
					id: "agent2",
					name: "Agent 2",
					description: "Specialized agent",
					capabilities: ["analysis", "documentation"],
					provider: "anthropic",
					model: "claude-3-5-sonnet-20241022",
				},
			],
			[
				"agent3",
				{
					id: "agent3",
					name: "Agent 3",
					description: "Code specialist",
					capabilities: ["code", "testing"],
					provider: "openai",
					model: "gpt-4o",
				},
			],
		]);

		testMessages = [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there!" },
		];
	});

	describe("RoundRobinRouter", () => {
		it("should cycle through agents in order", async () => {
			const router = new RoundRobinRouter();

			const decision1 = await router.route(testMessages, mockAgents);
			expect(decision1.agentId).toBe("agent1");

			const decision2 = await router.route(testMessages, mockAgents);
			expect(decision2.agentId).toBe("agent2");

			const decision3 = await router.route(testMessages, mockAgents);
			expect(decision3.agentId).toBe("agent3");

			// Should cycle back to first agent
			const decision4 = await router.route(testMessages, mockAgents);
			expect(decision4.agentId).toBe("agent1");
		});

		it("should include reason in decision", async () => {
			const router = new RoundRobinRouter();
			const decision = await router.route(testMessages, mockAgents);

			expect(decision.reason).toContain("Round-robin");
		});

		it("should throw error when no agents available", async () => {
			const router = new RoundRobinRouter();
			const emptyAgents = new Map<string, AgentMetadata>();

			try {
				await router.route(testMessages, emptyAgents);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("No agents available for routing");
			}
		});
	});

	describe("FunctionRouter", () => {
		it("should route using custom function", async () => {
			const customRouteFn = async () => ({
				agentId: "agent2",
				reason: "Custom routing logic",
				confidence: 0.95,
			});

			const router = new FunctionRouter(customRouteFn);
			const decision = await router.route(testMessages, mockAgents);

			expect(decision.agentId).toBe("agent2");
			expect(decision.reason).toBe("Custom routing logic");
			expect(decision.confidence).toBe(0.95);
		});

		it("should pass messages and agents to custom function", async () => {
			let receivedMessages: Array<ChatMessage> | null = null;
			let receivedAgents: Map<string, AgentMetadata> | null = null;

			const customRouteFn = async (messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>) => {
				await Promise.resolve();
				receivedMessages = messages;
				receivedAgents = agents;
				return {
					agentId: "agent1",
					reason: "Test",
					confidence: 1.0,
				};
			};

			const router = new FunctionRouter(customRouteFn);
			await router.route(testMessages, mockAgents);

			expect(receivedMessages).toEqual(testMessages);
			expect(receivedAgents).toBe(mockAgents);
		});
	});

	describe("CapabilityRouter", () => {
		it("should route to agent with matching capabilities for code", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Help me write a function in JavaScript" }];

			const decision = await router.route(messages, mockAgents);

			// Should route to agent with code capability
			const agent = mockAgents.get(decision.agentId);
			expect(agent?.capabilities).toContain("code");
		});

		it("should route to agent with documentation capability", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Explain how to use this API" }];

			const decision = await router.route(messages, mockAgents);

			// Should match "explain" keyword and route to agent with documentation capability
			const agent = mockAgents.get(decision.agentId);
			expect(agent?.capabilities).toContain("documentation");
		});

		it("should route to code agent for code-related tasks", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Debug this function" }];

			const decision = await router.route(messages, mockAgents);

			// Should match "debug" keyword and route to agent with code capability
			const agent = mockAgents.get(decision.agentId);
			expect(agent?.capabilities).toContain("code");
		});

		it("should fall back to first agent if no capabilities match", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello, how are you?" }];

			const decision = await router.route(messages, mockAgents);

			// Should default to first agent
			expect(decision.agentId).toBe("agent1");
		});

		it("should include reason in decision", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Write some code" }];

			const decision = await router.route(messages, mockAgents);

			expect(decision.reason).toBeDefined();
		});

		it("should handle messages with no user messages", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "assistant", content: "Hello! How can I help?" }];

			const decision = await router.route(messages, mockAgents);

			// Should default to first agent
			expect(decision.agentId).toBe("agent1");
			expect(decision.reason).toContain("No user message");
		});

		it("should throw error when no agents available", async () => {
			const router = new CapabilityRouter();
			const emptyAgents = new Map<string, AgentMetadata>();

			try {
				await router.route(testMessages, emptyAgents);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("No agents available for routing");
			}
		});

		it("should fall back when capability matches but no agent has it", async () => {
			const router = new CapabilityRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Calculate statistics for this data set" }];

			// Create agents without the "data" capability
			const limitedAgents = new Map<string, AgentMetadata>([
				[
					"agent1",
					{
						id: "agent1",
						name: "Agent 1",
						description: "Code agent",
						capabilities: ["code"],
						provider: "openai",
						model: "gpt-4o",
					},
				],
			]);

			const decision = await router.route(messages, limitedAgents);

			// Should fall back to first agent since no agent has "data" capability
			expect(decision.agentId).toBe("agent1");
			expect(decision.reason).toContain("default");
		});
	});

	describe("UserSpecifiedRouter", () => {
		it("should route to specified agent using @ syntax", async () => {
			const router = new UserSpecifiedRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "@agent2 Help me with this" }];

			const decision = await router.route(messages, mockAgents);

			expect(decision.agentId).toBe("agent2");
			expect(decision.reason).toContain("User requested");
		});

		it("should route by agent name with @ syntax", async () => {
			const router = new UserSpecifiedRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "@Claude Help me with this" }];

			// Find which agent has name containing "Claude" - none in our test, so should fall back
			const decision = await router.route(messages, mockAgents);

			expect(decision.agentId).toBe("agent1"); // Falls back to first agent
		});

		it("should fall back to first agent if no preference specified", async () => {
			const router = new UserSpecifiedRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "Hello" }];

			const decision = await router.route(messages, mockAgents);

			expect(decision.agentId).toBe("agent1");
			expect(decision.reason).toContain("default");
		});

		it("should fall back to first agent if specified agent not found", async () => {
			const router = new UserSpecifiedRouter();
			const messages: Array<ChatMessage> = [{ role: "user", content: "@nonexistent Help me" }];

			const decision = await router.route(messages, mockAgents);

			expect(decision.agentId).toBe("agent1");
		});

		it("should handle messages with no user messages", async () => {
			const router = new UserSpecifiedRouter();
			const messages: Array<ChatMessage> = [{ role: "assistant", content: "Hello!" }];

			const decision = await router.route(messages, mockAgents);

			// Should default to first agent
			expect(decision.agentId).toBe("agent1");
			expect(decision.reason).toContain("No user message");
		});

		it("should throw error when no agents available and no user message", async () => {
			const router = new UserSpecifiedRouter();
			const emptyAgents = new Map<string, AgentMetadata>();
			const messages: Array<ChatMessage> = [{ role: "assistant", content: "Hello!" }];

			try {
				await router.route(messages, emptyAgents);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("No agents available");
			}
		});

		it("should throw error when no agents available and agent not specified", async () => {
			const router = new UserSpecifiedRouter();
			const emptyAgents = new Map<string, AgentMetadata>();

			try {
				await router.route(testMessages, emptyAgents);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("No agents available");
			}
		});
	});

	describe("PrimaryFallbackRouter", () => {
		it("should route to primary agent by default", async () => {
			const router = new PrimaryFallbackRouter("agent1", "agent2");

			const decision = await router.route(testMessages, mockAgents);

			expect(decision.agentId).toBe("agent1");
			expect(decision.reason).toContain("primary");
		});

		it("should route to fallback agent when primary unavailable", async () => {
			const router = new PrimaryFallbackRouter("nonexistent", "agent2");

			const decision = await router.route(testMessages, mockAgents);

			expect(decision.agentId).toBe("agent2");
			expect(decision.reason).toContain("fallback");
		});

		it("should throw error when neither primary nor fallback available", async () => {
			const router = new PrimaryFallbackRouter("nonexistent1", "nonexistent2");

			try {
				await router.route(testMessages, mockAgents);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Neither primary nor fallback agent available");
			}
		});
	});
});
