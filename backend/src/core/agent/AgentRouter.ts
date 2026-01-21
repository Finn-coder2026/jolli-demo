import type { ChatMessage } from "./Agent";

/**
 * Agent routing decision result
 */
export interface RoutingDecision {
	/** Selected agent ID */
	agentId: string;
	/** Reason for selection (for debugging/logging) */
	reason?: string;
	/** Confidence score (0-1) */
	confidence?: number;
}

/**
 * Agent metadata for routing decisions
 */
export interface AgentMetadata {
	id: string;
	name: string;
	description: string;
	capabilities?: Array<string>;
	provider: string;
	model: string;
}

/**
 * Router interface for selecting which agent to use
 */
export interface AgentRouter {
	/**
	 * Select an agent based on the convo context
	 */
	route(messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>): Promise<RoutingDecision>;
}

/**
 * Round-robin router - cycles through agents
 */
export class RoundRobinRouter implements AgentRouter {
	private currentIndex = 0;

	route(_messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>): Promise<RoutingDecision> {
		const agentIds = Array.from(agents.keys());
		if (agentIds.length === 0) {
			throw new Error("No agents available for routing");
		}

		const selectedId = agentIds[this.currentIndex % agentIds.length];
		this.currentIndex++;

		return Promise.resolve({
			agentId: selectedId,
			reason: "Round-robin selection",
			confidence: 1.0,
		});
	}
}

/**
 * Primary-fallback router - uses primary agent unless it fails
 */
export class PrimaryFallbackRouter implements AgentRouter {
	constructor(
		private primaryAgentId: string,
		private fallbackAgentId: string,
	) {}

	route(_messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>): Promise<RoutingDecision> {
		if (agents.has(this.primaryAgentId)) {
			return Promise.resolve({
				agentId: this.primaryAgentId,
				reason: "Using primary agent",
				confidence: 1.0,
			});
		}

		if (agents.has(this.fallbackAgentId)) {
			return Promise.resolve({
				agentId: this.fallbackAgentId,
				reason: "Primary agent unavailable, using fallback",
				confidence: 0.8,
			});
		}

		throw new Error("Neither primary nor fallback agent available");
	}
}

/**
 * Capability-based router - selects agent based on message content
 */
export class CapabilityRouter implements AgentRouter {
	private capabilityPatterns = new Map<string, RegExp>([
		["code", /\b(code|function|class|variable|debug|error|bug|implement)\b/i],
		["documentation", /\b(document|explain|describe|what is|how to|guide|tutorial)\b/i],
		["data", /\b(data|analysis|chart|graph|statistics|calculate)\b/i],
		["general", /.*/],
	]);

	route(messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>): Promise<RoutingDecision> {
		if (agents.size === 0) {
			throw new Error("No agents available for routing");
		}

		// Get the last user message
		const lastUserMessage = [...messages].reverse().find((msg: ChatMessage) => msg.role === "user");
		if (!lastUserMessage) {
			// Default to first agent if no user message
			const firstAgentId = agents.keys().next().value as string;
			return Promise.resolve({
				agentId: firstAgentId,
				reason: "No user message found, using default agent",
				confidence: 0.5,
			});
		}

		// Try to match capabilities
		for (const [capability, pattern] of this.capabilityPatterns) {
			if (pattern.test(lastUserMessage.content)) {
				// Find agent with this capability
				for (const [agentId, metadata] of agents) {
					if (metadata.capabilities?.includes(capability)) {
						return Promise.resolve({
							agentId,
							reason: `Matched capability: ${capability}`,
							confidence: 0.9,
						});
					}
				}
			}
		}

		// Fallback to first agent
		const firstAgentId = agents.keys().next().value as string;
		return Promise.resolve({
			agentId: firstAgentId,
			reason: "No capability match, using default agent",
			confidence: 0.5,
		});
	}
}

/**
 * Custom function-based router
 */
export class FunctionRouter implements AgentRouter {
	constructor(
		private routeFn: (messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>) => Promise<RoutingDecision>,
	) {}

	route(messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>): Promise<RoutingDecision> {
		return this.routeFn(messages, agents);
	}
}

/**
 * User-specified router - allows user to specify which agent to use
 */
export class UserSpecifiedRouter implements AgentRouter {
	route(messages: Array<ChatMessage>, agents: Map<string, AgentMetadata>): Promise<RoutingDecision> {
		// Look for agent specification in the last user message
		const lastUserMessage = [...messages].reverse().find((msg: ChatMessage) => msg.role === "user");
		if (!lastUserMessage) {
			const firstAgentId = agents.keys().next().value;
			if (!firstAgentId) {
				throw new Error("No agents available");
			}
			return Promise.resolve({
				agentId: firstAgentId,
				reason: "No user message, using default agent",
				confidence: 0.5,
			});
		}

		// Check for @agent_name pattern
		const agentMatch = lastUserMessage.content.match(/@(\w+)/);
		if (agentMatch) {
			const requestedAgent = agentMatch[1];
			// Try to find agent by name or ID
			for (const [agentId, metadata] of agents) {
				if (metadata.name.toLowerCase() === requestedAgent.toLowerCase() || agentId === requestedAgent) {
					return Promise.resolve({
						agentId,
						reason: `User requested agent: ${metadata.name}`,
						confidence: 1.0,
					});
				}
			}
		}

		// No specification found, use first agent
		const firstAgentId = agents.keys().next().value;
		if (!firstAgentId) {
			throw new Error("No agents available");
		}
		return Promise.resolve({
			agentId: firstAgentId,
			reason: "No agent specified, using default",
			confidence: 0.5,
		});
	}
}
