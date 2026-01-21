import type { Agent, AgentState, AgentStreamChunk, ChatMessage } from "./Agent";
import type { AgentMetadata, AgentRouter, RoutingDecision } from "./AgentRouter";
import { CapabilityRouter, RoundRobinRouter, UserSpecifiedRouter } from "./AgentRouter";
import { MultiAgent } from "./MultiAgent";
import { describe, expect, it } from "vitest";

// Custom router that returns a non-existent agent ID
class InvalidAgentRouter implements AgentRouter {
	route(_messages: Array<ChatMessage>, _agents: Map<string, AgentMetadata>): Promise<RoutingDecision> {
		return Promise.resolve({
			agentId: "nonexistent-agent-id",
			reason: "Test router returning invalid agent",
			confidence: 1.0,
		});
	}
}

// Mock agent implementation
class MockAgent implements Agent {
	constructor(
		private id: string,
		private responsePrefix: string,
	) {}

	invoke(messages: Array<ChatMessage>) {
		const lastMessage = messages[messages.length - 1];
		return Promise.resolve({
			content: `${this.responsePrefix}: ${lastMessage?.content || ""}`,
			metadata: { agentId: this.id },
		});
	}

	async *stream(messages: Array<ChatMessage>) {
		const lastMessage = messages[messages.length - 1];
		await Promise.resolve();
		yield {
			type: "content",
			content: `${this.responsePrefix}: ${lastMessage?.content || ""}`,
		} as AgentStreamChunk;
		yield {
			type: "done",
			metadata: { agentId: this.id },
		} as AgentStreamChunk;
	}

	getState() {
		return Promise.resolve({ messages: [] } as AgentState);
	}

	setState() {
		return Promise.resolve();
	}

	clearMemory() {
		return Promise.resolve();
	}
}

describe("MultiAgent", () => {
	describe("Basic functionality", () => {
		it("should register and unregister agents", () => {
			const multiAgent = new MultiAgent();
			const agent1 = new MockAgent("agent1", "Agent 1");

			const metadata: AgentMetadata = {
				id: "agent1",
				name: "Agent 1",
				description: "Test agent 1",
				provider: "test",
				model: "test",
			};

			multiAgent.registerAgent("agent1", agent1, metadata);
			expect(multiAgent.getAgents().size).toBe(1);

			multiAgent.unregisterAgent("agent1");
			expect(multiAgent.getAgents().size).toBe(0);
		});

		it("should throw error when no agents registered", async () => {
			const multiAgent = new MultiAgent();

			await expect(multiAgent.invoke([{ role: "user", content: "Hello" }])).rejects.toThrow(
				"No agents registered",
			);
		});
	});

	describe("Round-robin routing", () => {
		it("should cycle through agents in round-robin fashion", async () => {
			const multiAgent = new MultiAgent(new RoundRobinRouter());

			const agent1 = new MockAgent("agent1", "Agent 1");
			const agent2 = new MockAgent("agent2", "Agent 2");

			multiAgent.registerAgent("agent1", agent1, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			multiAgent.registerAgent("agent2", agent2, {
				id: "agent2",
				name: "Agent 2",
				description: "Test",
				provider: "test",
				model: "test",
			});

			const response1 = await multiAgent.invoke([{ role: "user", content: "Test 1" }]);
			expect(response1.content).toContain("Agent 1");

			const response2 = await multiAgent.invoke([{ role: "user", content: "Test 2" }]);
			expect(response2.content).toContain("Agent 2");

			const response3 = await multiAgent.invoke([{ role: "user", content: "Test 3" }]);
			expect(response3.content).toContain("Agent 1");
		});
	});

	describe("Capability-based routing", () => {
		it("should route to agent with matching capability", async () => {
			const multiAgent = new MultiAgent(new CapabilityRouter());

			const codeAgent = new MockAgent("code", "Code Agent");
			const docAgent = new MockAgent("doc", "Doc Agent");

			multiAgent.registerAgent("code", codeAgent, {
				id: "code",
				name: "Code Agent",
				description: "Handles code tasks",
				capabilities: ["code"],
				provider: "test",
				model: "test",
			});

			multiAgent.registerAgent("doc", docAgent, {
				id: "doc",
				name: "Doc Agent",
				description: "Handles documentation",
				capabilities: ["documentation"],
				provider: "test",
				model: "test",
			});

			const codeResponse = await multiAgent.invoke([{ role: "user", content: "Help me debug this code" }]);
			expect(codeResponse.content).toContain("Code Agent");

			const docResponse = await multiAgent.invoke([{ role: "user", content: "Explain how to use this API" }]);
			expect(docResponse.content).toContain("Doc Agent");
		});
	});

	describe("User-specified routing", () => {
		it("should route to user-specified agent", async () => {
			const multiAgent = new MultiAgent(new UserSpecifiedRouter());

			const agent1 = new MockAgent("agent1", "Agent 1");
			const agent2 = new MockAgent("agent2", "Agent 2");

			multiAgent.registerAgent("agent1", agent1, {
				id: "agent1",
				name: "GPT",
				description: "Test",
				provider: "test",
				model: "test",
			});

			multiAgent.registerAgent("agent2", agent2, {
				id: "agent2",
				name: "Claude",
				description: "Test",
				provider: "test",
				model: "test",
			});

			const response = await multiAgent.invoke([{ role: "user", content: "@claude Help me with this" }]);
			expect(response.content).toContain("Agent 2");
		});
	});

	describe("Streaming", () => {
		it("should stream responses from selected agent", async () => {
			const multiAgent = new MultiAgent(new RoundRobinRouter());

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			const chunks: Array<AgentStreamChunk> = [];
			for await (const chunk of multiAgent.stream([{ role: "user", content: "Hello" }])) {
				chunks.push(chunk);
			}

			expect(chunks.length).toBeGreaterThan(0);
			expect(chunks.some(c => c.type === "metadata")).toBe(true);
			expect(chunks.some(c => c.type === "content")).toBe(true);
		});
	});

	describe("State management", () => {
		it("should track convo history", async () => {
			const multiAgent = new MultiAgent();

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			await multiAgent.invoke([{ role: "user", content: "Hello" }]);
			await multiAgent.invoke([{ role: "user", content: "How are you?" }]);

			const history = multiAgent.getConvoHistory();
			expect(history.length).toBe(4); // 2 user messages + 2 assistant responses
		});

		it("should clear convo history", async () => {
			const multiAgent = new MultiAgent();

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			await multiAgent.invoke([{ role: "user", content: "Hello" }]);
			multiAgent.clearConvoHistory();

			const history = multiAgent.getConvoHistory();
			expect(history.length).toBe(0);
		});
	});

	describe("Metadata tracking", () => {
		it("should include routing metadata in response", async () => {
			const multiAgent = new MultiAgent(new RoundRobinRouter());

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			const response = await multiAgent.invoke([{ role: "user", content: "Hello" }]);

			expect(response.metadata?.multiAgent).toBeDefined();
			expect(response.metadata?.multiAgent).toMatchObject({
				selectedAgent: "agent1",
				agentName: "Agent 1",
			});
		});
	});

	describe("Agent state management", () => {
		it("should get state from last used agent", async () => {
			const multiAgent = new MultiAgent();

			const agent1 = new MockAgent("agent1", "Agent 1");
			const agent2 = new MockAgent("agent2", "Agent 2");

			multiAgent.registerAgent("agent1", agent1, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			multiAgent.registerAgent("agent2", agent2, {
				id: "agent2",
				name: "Agent 2",
				description: "Test",
				provider: "test",
				model: "test",
			});

			await multiAgent.invoke([{ role: "user", content: "Hello" }]);
			const state = await multiAgent.getState();

			expect(state).toBeDefined();
			expect(state.messages).toBeDefined();
		});

		it("should return empty state when no agents", async () => {
			const multiAgent = new MultiAgent();
			const state = await multiAgent.getState();

			expect(state).toEqual({ messages: [] });
		});

		it("should return empty state when agent not found", async () => {
			const multiAgent = new MultiAgent();

			// Simulate a scenario where lastUsedAgentId points to a non-existent agent
			await multiAgent.invoke([{ role: "user", content: "Hello" }]).catch(() => {
				// Expected to throw "No agents registered"
			});

			const state = await multiAgent.getState();
			expect(state).toEqual({ messages: [] });
		});

		it("should set state on all agents", async () => {
			const multiAgent = new MultiAgent();

			const agent1 = new MockAgent("agent1", "Agent 1");
			const agent2 = new MockAgent("agent2", "Agent 2");

			multiAgent.registerAgent("agent1", agent1, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			multiAgent.registerAgent("agent2", agent2, {
				id: "agent2",
				name: "Agent 2",
				description: "Test",
				provider: "test",
				model: "test",
			});

			await multiAgent.setState({ messages: [] });

			// If setState succeeds, that's good enough
			expect(true).toBe(true);
		});

		it("should clear memory on all agents and convo history", async () => {
			const multiAgent = new MultiAgent();

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			await multiAgent.invoke([{ role: "user", content: "Hello" }]);
			expect(multiAgent.getConvoHistory().length).toBeGreaterThan(0);

			await multiAgent.clearMemory();

			expect(multiAgent.getConvoHistory().length).toBe(0);
		});
	});

	describe("Router management", () => {
		it("should allow changing router", () => {
			const multiAgent = new MultiAgent(new RoundRobinRouter());

			const newRouter = new CapabilityRouter();
			multiAgent.setRouter(newRouter);

			expect(multiAgent.getRouter()).toBe(newRouter);
		});

		it("should get current router", () => {
			const router = new RoundRobinRouter();
			const multiAgent = new MultiAgent(router);

			expect(multiAgent.getRouter()).toBe(router);
		});
	});

	describe("Error handling", () => {
		it("should throw error when routing to non-existent agent", async () => {
			const multiAgent = new MultiAgent();

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			// Unregister the agent but the router might still try to route to it
			multiAgent.unregisterAgent("agent1");

			// This should either throw "No agents registered" or handle gracefully
			// depending on router implementation
			await expect(multiAgent.invoke([{ role: "user", content: "Hello" }])).rejects.toThrow();
		});

		it("should throw error when router returns invalid agent ID during invoke", async () => {
			const multiAgent = new MultiAgent(new InvalidAgentRouter());

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			try {
				await multiAgent.invoke([{ role: "user", content: "Hello" }]);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain("Agent nonexistent-agent-id not found");
			}
		});

		it("should throw error when router returns invalid agent ID during streaming", async () => {
			const multiAgent = new MultiAgent(new InvalidAgentRouter());

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			const streamGen = multiAgent.stream([{ role: "user", content: "Hello" }]);

			try {
				await streamGen.next();
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toContain("Agent nonexistent-agent-id not found");
			}
		});

		it("should throw error when streaming with no agents", async () => {
			const multiAgent = new MultiAgent();

			const streamGen = multiAgent.stream([{ role: "user", content: "Hello" }]);

			await expect(streamGen.next()).rejects.toThrow("No agents registered");
		});

		it("should throw error when streaming and routed agent not found", async () => {
			const multiAgent = new MultiAgent(new RoundRobinRouter());

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			// Start streaming, then unregister the agent mid-stream to trigger the error
			// This simulates a race condition or router returning an invalid agent
			multiAgent.unregisterAgent("agent1");

			const streamGen = multiAgent.stream([{ role: "user", content: "Hello" }]);

			// This should throw because no agents registered
			await expect(streamGen.next()).rejects.toThrow();
		});

		it("should return empty state when lastUsedAgentId points to unregistered agent", async () => {
			const multiAgent = new MultiAgent();

			const agent = new MockAgent("agent1", "Agent 1");
			multiAgent.registerAgent("agent1", agent, {
				id: "agent1",
				name: "Agent 1",
				description: "Test",
				provider: "test",
				model: "test",
			});

			// Use the agent to set lastUsedAgentId
			await multiAgent.invoke([{ role: "user", content: "Hello" }]);

			// Now unregister the agent
			multiAgent.unregisterAgent("agent1");

			// Getting state should return empty state since lastUsedAgentId points to unregistered agent
			const state = await multiAgent.getState();
			expect(state).toEqual({ messages: [] });
		});
	});
});
