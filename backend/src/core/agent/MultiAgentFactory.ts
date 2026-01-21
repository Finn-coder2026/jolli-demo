import { LLMProvider } from "./Agent";
import { createAgent } from "./AgentFactory";
import type { AgentMetadata, AgentRouter } from "./AgentRouter";
import { CapabilityRouter, PrimaryFallbackRouter, RoundRobinRouter, UserSpecifiedRouter } from "./AgentRouter";
import { MultiAgent } from "./MultiAgent";

/**
 * Multi-agent configuration
 */
export interface MultiAgentConfig {
	agents: Array<{
		id: string;
		provider: LLMProvider;
		apiKey: string;
		model?: string;
		metadata: Omit<AgentMetadata, "provider" | "model">;
	}>;
	routingStrategy?: "round-robin" | "capability" | "user-specified" | "primary-fallback";
	primaryAgentId?: string;
	fallbackAgentId?: string;
}

/**
 * Create a multi-agent system from configuration
 *
 * @example
 * ```typescript
 * const multiAgent = createMultiAgent({
 *   agents: [
 *     {
 *       id: "gpt4",
 *       provider: LLMProvider.OPENAI,
 *       apiKey: process.env.OPENAI_API_KEY,
 *       model: "gpt-4o-mini",
 *       metadata: {
 *         id: "gpt4",
 *         name: "GPT-4",
 *         description: "Fast general purpose AI",
 *         capabilities: ["general", "code", "documentation"]
 *       }
 *     },
 *     {
 *       id: "claude",
 *       provider: LLMProvider.ANTHROPIC,
 *       apiKey: process.env.ANTHROPIC_API_KEY,
 *       model: "claude-3-5-sonnet-20241022",
 *       metadata: {
 *         id: "claude",
 *         name: "Claude",
 *         description: "Advanced reasoning AI",
 *         capabilities: ["analysis", "reasoning", "code"]
 *       }
 *     }
 *   ],
 *   routingStrategy: "capability"
 * });
 * ```
 */
export function createMultiAgent(config: MultiAgentConfig): MultiAgent {
	// Create router based on strategy
	let router: AgentRouter;
	switch (config.routingStrategy) {
		case "capability":
			router = new CapabilityRouter();
			break;
		case "user-specified":
			router = new UserSpecifiedRouter();
			break;
		case "primary-fallback":
			if (!config.primaryAgentId || !config.fallbackAgentId) {
				throw new Error("primary-fallback routing requires primaryAgentId and fallbackAgentId");
			}
			router = new PrimaryFallbackRouter(config.primaryAgentId, config.fallbackAgentId);
			break;
		default:
			router = new RoundRobinRouter();
	}

	const multiAgent = new MultiAgent(router);

	// Register all agents
	for (const agentConfig of config.agents) {
		const agent = createAgent({
			provider: agentConfig.provider,
			apiKey: agentConfig.apiKey,
			model: agentConfig.model,
		});

		// Get provider and model info
		let provider = "unknown";
		let model = "unknown";

		switch (agentConfig.provider) {
			case LLMProvider.OPENAI:
				provider = "openai";
				model = agentConfig.model || "gpt-4o-mini";
				break;
			case LLMProvider.ANTHROPIC:
				provider = "anthropic";
				model = agentConfig.model || "claude-3-5-sonnet-20241022";
				break;
		}

		multiAgent.registerAgent(agentConfig.id, agent, {
			...agentConfig.metadata,
			provider,
			model,
		});
	}

	return multiAgent;
}

/**
 * Create a multi-agent system from environment variables
 *
 * Environment variables:
 * - MULTI_AGENT_ENABLED=true
 * - AGENT_IDS=gpt4,claude (comma-separated)
 * - AGENT_<ID>_PROVIDER=openai|anthropic
 * - AGENT_<ID>_API_KEY=...
 * - AGENT_<ID>_MODEL=...
 * - AGENT_<ID>_NAME=...
 * - AGENT_<ID>_DESCRIPTION=...
 * - AGENT_<ID>_CAPABILITIES=code,documentation (comma-separated)
 * - ROUTING_STRATEGY=round-robin|capability|user-specified|primary-fallback
 * - PRIMARY_AGENT_ID=... (for primary-fallback strategy)
 * - FALLBACK_AGENT_ID=... (for primary-fallback strategy)
 */
export function createMultiAgentFromEnv(): MultiAgent | undefined {
	const enabled = process.env.MULTI_AGENT_ENABLED === "true";
	if (!enabled) {
		return;
	}

	const agentIds = process.env.AGENT_IDS?.split(",").map(id => id.trim()) || [];
	if (agentIds.length === 0) {
		throw new Error("MULTI_AGENT_ENABLED is true but AGENT_IDS is not set");
	}

	const agents: MultiAgentConfig["agents"] = [];

	for (const id of agentIds) {
		const providerStr = process.env[`AGENT_${id.toUpperCase()}_PROVIDER`];
		const apiKey = process.env[`AGENT_${id.toUpperCase()}_API_KEY`];
		const model = process.env[`AGENT_${id.toUpperCase()}_MODEL`];
		const name = process.env[`AGENT_${id.toUpperCase()}_NAME`] || id;
		const description = process.env[`AGENT_${id.toUpperCase()}_DESCRIPTION`] || `Agent ${id}`;
		const capabilitiesStr = process.env[`AGENT_${id.toUpperCase()}_CAPABILITIES`];

		if (!providerStr || !apiKey) {
			throw new Error(`Missing provider or API key for agent ${id}`);
		}

		const provider = providerStr as LLMProvider;
		const capabilities = capabilitiesStr?.split(",").map(c => c.trim());

		agents.push({
			id,
			provider,
			apiKey,
			...(model ? { model } : {}),
			metadata: {
				id,
				name,
				description,
				...(capabilities ? { capabilities } : {}),
			},
		});
	}

	const routingStrategy = (process.env.ROUTING_STRATEGY || "round-robin") as
		| "round-robin"
		| "capability"
		| "user-specified"
		| "primary-fallback";
	const primaryAgentId = process.env.PRIMARY_AGENT_ID;
	const fallbackAgentId = process.env.FALLBACK_AGENT_ID;

	const config: MultiAgentConfig = {
		agents,
		routingStrategy,
		...(primaryAgentId ? { primaryAgentId } : {}),
		...(fallbackAgentId ? { fallbackAgentId } : {}),
	};

	return createMultiAgent(config);
}
