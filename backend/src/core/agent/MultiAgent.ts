import type { TenantOrgContext } from "../../tenant/TenantContext";
import type { Agent, AgentConfig, AgentResponse, AgentState, AgentStreamChunk, ChatMessage } from "./Agent";
import type { AgentMetadata, AgentRouter, RoutingDecision } from "./AgentRouter";
import { RoundRobinRouter } from "./AgentRouter";

/**
 * Registered agent with metadata
 */
interface RegisteredAgent {
	agent: Agent;
	metadata: AgentMetadata;
}

/**
 * Multi-agent orchestrator that coordinates multiple agents
 *
 * This class implements the Agent interface but internally manages multiple agents,
 * routing requests to appropriate agents based on the configured routing strategy.
 *
 * Features:
 * - Register multiple agents with different capabilities
 * - Route messages to appropriate agents using various strategies
 * - Maintain convo state across agent switches
 * - Support streaming from any agent
 * - Track which agent handled each message
 *
 * @example
 * ```typescript
 * const multiAgent = new MultiAgent();
 *
 * // Register agents
 * multiAgent.registerAgent("openai", openaiAgent, {
 *   id: "openai",
 *   name: "GPT-4",
 *   description: "General purpose AI",
 *   capabilities: ["general", "code", "documentation"],
 *   provider: "openai",
 *   model: "gpt-4o-mini"
 * });
 *
 * multiAgent.registerAgent("anthropic", anthropicAgent, {
 *   id: "anthropic",
 *   name: "Claude",
 *   description: "Advanced reasoning AI",
 *   capabilities: ["analysis", "reasoning"],
 *   provider: "anthropic",
 *   model: "claude-3-5-sonnet-20241022"
 * });
 *
 * // Use capability-based routing
 * multiAgent.setRouter(new CapabilityRouter());
 *
 * // Messages will be routed to appropriate agents
 * const response = await multiAgent.invoke([
 *   { role: "user", content: "Explain this code: function foo() {...}" }
 * ]);
 * ```
 */
export class MultiAgent implements Agent {
	private agents = new Map<string, RegisteredAgent>();
	private router: AgentRouter;
	private convoHistory: Array<ChatMessage & { agentId?: string }> = [];
	private lastUsedAgentId?: string;

	constructor(router?: AgentRouter) {
		this.router = router || new RoundRobinRouter();
	}

	/**
	 * Register an agent with metadata
	 */
	registerAgent(id: string, agent: Agent, metadata: AgentMetadata): void {
		this.agents.set(id, { agent, metadata });
	}

	/**
	 * Unregister an agent
	 */
	unregisterAgent(id: string): boolean {
		return this.agents.delete(id);
	}

	/**
	 * Get all registered agents
	 */
	getAgents(): Map<string, AgentMetadata> {
		const agentMetadata = new Map<string, AgentMetadata>();
		for (const [id, registered] of this.agents) {
			agentMetadata.set(id, registered.metadata);
		}
		return agentMetadata;
	}

	/**
	 * Set the routing strategy
	 */
	setRouter(router: AgentRouter): void {
		this.router = router;
	}

	/**
	 * Get the current router
	 */
	getRouter(): AgentRouter {
		return this.router;
	}

	/**
	 * Get convo history with agent tracking
	 */
	getConvoHistory(): Array<ChatMessage & { agentId?: string }> {
		return [...this.convoHistory];
	}

	/**
	 * Clear convo history
	 */
	clearConvoHistory(): void {
		this.convoHistory = [];
		delete this.lastUsedAgentId;
	}

	async invoke(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		tenantContext?: TenantOrgContext,
	): Promise<AgentResponse> {
		if (this.agents.size === 0) {
			throw new Error("No agents registered in MultiAgent");
		}

		// Route to appropriate agent
		const decision = await this.routeToAgent(messages);
		const registered = this.agents.get(decision.agentId);

		if (!registered) {
			throw new Error(`Agent ${decision.agentId} not found`);
		}

		// Invoke the selected agent
		const response = await registered.agent.invoke(messages, config, tenantContext);

		// Track convo history
		this.convoHistory.push(...messages);
		this.convoHistory.push({
			role: "assistant",
			content: response.content,
			agentId: decision.agentId,
		});
		this.lastUsedAgentId = decision.agentId;

		// Add routing metadata to response
		return {
			...response,
			metadata: {
				...response.metadata,
				multiAgent: {
					selectedAgent: decision.agentId,
					agentName: registered.metadata.name,
					routingReason: decision.reason,
					confidence: decision.confidence,
				},
			},
		};
	}

	async *stream(
		messages: Array<ChatMessage>,
		config?: AgentConfig,
		tenantContext?: TenantOrgContext,
	): AsyncGenerator<AgentStreamChunk> {
		if (this.agents.size === 0) {
			throw new Error("No agents registered in MultiAgent");
		}

		// Route to appropriate agent
		const decision = await this.routeToAgent(messages);
		const registered = this.agents.get(decision.agentId);

		if (!registered) {
			throw new Error(`Agent ${decision.agentId} not found`);
		}

		// Send routing metadata first
		yield {
			type: "metadata",
			metadata: {
				multiAgent: {
					selectedAgent: decision.agentId,
					agentName: registered.metadata.name,
					routingReason: decision.reason,
					confidence: decision.confidence,
				},
			},
		};

		// Track content for convo history
		let assistantContent = "";

		// Stream from the selected agent
		for await (const chunk of registered.agent.stream(messages, config, tenantContext)) {
			if (chunk.type === "content" && chunk.content) {
				assistantContent += chunk.content;
			}
			yield chunk;
		}

		// Track convo history
		this.convoHistory.push(...messages);
		this.convoHistory.push({
			role: "assistant",
			content: assistantContent,
			agentId: decision.agentId,
		});
		this.lastUsedAgentId = decision.agentId;
	}

	getState(): Promise<AgentState> {
		// Get state from the last used agent, or first agent if none used yet
		const agentId = this.lastUsedAgentId || this.agents.keys().next().value;
		if (!agentId) {
			return Promise.resolve({ messages: [] });
		}

		const registered = this.agents.get(agentId);
		if (!registered) {
			return Promise.resolve({ messages: [] });
		}

		return registered.agent.getState();
	}

	async setState(state: AgentState): Promise<void> {
		// Set state on all agents
		const promises = Array.from(this.agents.values()).map(registered => registered.agent.setState(state));
		await Promise.all(promises);
	}

	async clearMemory(): Promise<void> {
		// Clear memory on all agents
		const promises = Array.from(this.agents.values()).map(registered => registered.agent.clearMemory());
		await Promise.all(promises);
		this.clearConvoHistory();
	}

	/**
	 * Route messages to appropriate agent
	 */
	private routeToAgent(messages: Array<ChatMessage>): Promise<RoutingDecision> {
		const agentMetadata = this.getAgents();
		return this.router.route(messages, agentMetadata);
	}
}
