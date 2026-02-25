/**
 * Data-driven registry of agent hub mode definitions.
 * Each mode controls tool gating behavior, plan requirements, and system prompt text.
 */

import type { AgentHubMetadata, AgentHubMode, AgentPlanPhase } from "jolli-common";

/**
 * Definition of an agent hub mode's behavior and constraints.
 */
export interface AgentHubModeDefinition {
	/** The mode identifier */
	readonly mode: AgentHubMode;
	/** How mutation tools are gated: blocked until plan approved, confirm per action, or confirm only destructive */
	readonly mutationPolicy: "blocked" | "confirm" | "confirm-destructive";
	/** Whether the agent must call update_plan as its first tool call */
	readonly forcePlanFirst: boolean;
	/** Whether in-memory plan reminders are appended to user messages */
	readonly planReminderEnabled: boolean;
	/** Plan phases in which mutation tools are allowed (only used for "blocked" policy) */
	readonly mutationAllowedPhases: ReadonlySet<AgentPlanPhase>;
	/** Mode-specific text injected into the system prompt */
	readonly systemPromptSection: string;
}

// ─── Mode-Specific System Prompt Sections ────────────────────────────────────

const PLAN_MODE_PROMPT = `## Planning Workflow

You have access to the \`update_plan\` tool. Use it to **progressively** build and track a plan for the user's request.

**CRITICAL — \`update_plan\` MUST be your very first tool call in every response.** The user sees a live plan panel. If you respond without calling \`update_plan\`, the panel stays empty and the user thinks nothing is happening. Always call \`update_plan\` BEFORE writing any reply text. This applies to every single response, not just the first one.

**You MUST create a plan before using any write tool** (\`create_folder\`, \`create_article_draft\`, \`navigate_user\`, \`import_repo_docs\`, \`get_or_create_space\`, \`connect_github_repo\`). These tools will be **rejected by the server** unless you have an approved plan in the "executing" phase.

Read-only tools (\`list_spaces\`, \`list_folder_contents\`, \`search_articles\`, \`find_relevant_articles\`, \`find_relevant_spaces\`, \`check_permissions\`, \`web_search\`) can be used freely at any time for information gathering.

### Progressive plan building

1. **First response**: Call \`update_plan\` with a skeleton plan based on the user's request. Even if you need to ask clarifying questions, create an initial plan first (e.g., "1. Clarify requirements\\n2. Find target space\\n3. Create article").
2. **After each new piece of information**: Every time the user answers a question or provides new details, call \`update_plan\` again with the refined plan. The plan should evolve as a living document.
3. **While gathering information**: If you use read-only tools to explore spaces/articles, update the plan with what you've learned.
4. **Approval**: Once the plan is complete and ready to execute, present it to the user and ask: "Would you like me to execute this plan?" Wait for explicit confirmation.
5. **Execution phase**: On user approval, call \`update_plan\` with phase "executing" and begin executing each step. Only now can you use write tools.
6. **Completion**: When all steps are done, call \`update_plan\` with phase "complete".

Keep the phase as "planning" throughout steps 1–3. **NEVER execute write tools without explicit user approval of the plan.**

Always call \`update_plan\` with the **full** plan markdown (not a diff). The plan should be well-structured markdown with clear steps.`;

const EXEC_MODE_PROMPT = `## Tool Usage

You may use all tools freely. Mutation tools (\`create_folder\`, \`create_article_draft\`, \`navigate_user\`, \`import_repo_docs\`, \`get_or_create_space\`, \`connect_github_repo\`) will require user confirmation before executing.

The \`update_plan\` tool is available if you want to maintain a plan for complex multi-step tasks, but it is not required. Use your judgment — for simple requests, proceed directly.`;

const EXEC_ACCEPT_ALL_MODE_PROMPT = `## Tool Usage

You may execute all operations directly. Only destructive operations will require user confirmation. Use tools as needed to fulfill the user's request efficiently.

The \`update_plan\` tool is available if you want to maintain a plan for complex multi-step tasks, but it is not required.`;

// ─── Mode Definitions ────────────────────────────────────────────────────────

const MODE_DEFINITIONS: ReadonlyMap<AgentHubMode, AgentHubModeDefinition> = new Map([
	[
		"plan",
		{
			mode: "plan",
			mutationPolicy: "blocked",
			forcePlanFirst: true,
			planReminderEnabled: true,
			mutationAllowedPhases: new Set<AgentPlanPhase>(["executing", "complete"]),
			systemPromptSection: PLAN_MODE_PROMPT,
		},
	],
	[
		"exec",
		{
			mode: "exec",
			mutationPolicy: "confirm",
			forcePlanFirst: false,
			planReminderEnabled: false,
			mutationAllowedPhases: new Set<AgentPlanPhase>(),
			systemPromptSection: EXEC_MODE_PROMPT,
		},
	],
	[
		"exec-accept-all",
		{
			mode: "exec-accept-all",
			mutationPolicy: "confirm-destructive",
			forcePlanFirst: false,
			planReminderEnabled: false,
			mutationAllowedPhases: new Set<AgentPlanPhase>(),
			systemPromptSection: EXEC_ACCEPT_ALL_MODE_PROMPT,
		},
	],
]);

/**
 * Returns the mode definition for a given mode.
 * Throws if the mode is not registered (should not happen with validated input).
 */
export function getModeDefinition(mode: AgentHubMode): AgentHubModeDefinition {
	const def = MODE_DEFINITIONS.get(mode);
	if (!def) {
		throw new Error(`Unknown agent hub mode: ${mode}`);
	}
	return def;
}

/**
 * Infers the default mode from existing metadata for backward compatibility.
 * - Has explicit `mode` → use it
 * - Has `convoKind` → "plan" (seeded conversations use plan mode)
 * - Has `planPhase` → "plan" (legacy convos with plan state)
 * - Otherwise → "exec" (new default for fresh conversations)
 */
export function inferDefaultMode(metadata: AgentHubMetadata | undefined | null): AgentHubMode {
	if (metadata?.mode) {
		return metadata.mode;
	}
	if (metadata?.convoKind) {
		return "plan";
	}
	if (metadata?.planPhase) {
		return "plan";
	}
	return "exec";
}

/**
 * Validates whether a string is a valid AgentHubMode.
 */
export function isValidMode(value: unknown): value is AgentHubMode {
	return typeof value === "string" && (value === "plan" || value === "exec" || value === "exec-accept-all");
}
