import type { ToolDef } from "../Types";
import { toolDefinitions } from "../tools/Tools";
import type { AgentOptions, ChatOptions } from "./Agent";

/**
 * Minimal profile interface that decorates Agent construction + call options.
 */
export type AgentProfile = {
	kind: "general" | "getting-started";
	defaultAgentOpts?: AgentOptions;
	defaultChatOpts?: Pick<ChatOptions, "system"> & { seedMessages?: ChatOptions["messages"] };
};

export const GeneralProfile: AgentProfile = {
	kind: "general",
	defaultAgentOpts: {
		model: "claude-sonnet-4-5-20250929",
		temperature: 0.4,
		tools: toolDefinitions as Array<ToolDef>,
	},
	defaultChatOpts: {
		system: "You are a precise, helpful, minimal assistant.",
	},
};

export const GettingStartedProfile: AgentProfile = {
	kind: "getting-started",
	defaultAgentOpts: {
		model: "claude-sonnet-4-5-20250929",
		temperature: 0.2,
		tools: toolDefinitions as Array<ToolDef>,
	},
	defaultChatOpts: {
		system: [
			"You are a Getting Started guide generator.",
			"Ask 2-3 clarifying questions if needed, then produce a step-by-step plan.",
		].join(" "),
	},
};

export const profiles = {
	general: GeneralProfile,
	"getting-started": GettingStartedProfile,
};
