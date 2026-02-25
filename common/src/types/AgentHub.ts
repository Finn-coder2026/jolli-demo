import type { CollabMessage } from "./CollabConvo";

/**
 * Phase of an agent plan lifecycle.
 * - "planning": Agent is building/refining the plan
 * - "executing": Agent is executing the approved plan
 * - "complete": Plan execution is finished
 */
export type AgentPlanPhase = "planning" | "executing" | "complete";

/**
 * Agent hub conversation mode controlling tool gating and agent behavior.
 * - "plan": Mutations blocked until plan approved (used by seeded convos)
 * - "exec": Mutations allowed but require per-action user confirmation
 * - "exec-accept-all": Mutations allowed, only destructive ops require confirmation
 */
export type AgentHubMode = "plan" | "exec" | "exec-accept-all";

/** Set of valid mode values for runtime validation */
export const VALID_MODES: ReadonlySet<string> = new Set<AgentHubMode>(["plan", "exec", "exec-accept-all"]);

/**
 * Kind of agent hub conversation.
 * - "getting_started": A seeded onboarding conversation created for new users
 */
export type AgentHubConvoKind = "getting_started";

/**
 * Metadata stored on agent hub conversations.
 * Holds plan text, lifecycle phase, mode, and optional seeded conversation info.
 */
export interface AgentHubMetadata {
	readonly plan?: string;
	readonly planPhase?: AgentPlanPhase;
	/** Conversation mode controlling tool gating behavior */
	readonly mode?: AgentHubMode;
	/** Kind of seeded conversation (e.g., "getting_started" for onboarding) */
	readonly convoKind?: AgentHubConvoKind;
	/** User ID this seeded conversation was created for */
	readonly createdForUserId?: number;
}

/**
 * A pending tool confirmation awaiting user approval or denial.
 */
export interface PendingConfirmation {
	readonly confirmationId: string;
	readonly toolName: string;
	readonly toolArgs: Record<string, unknown>;
	readonly description: string;
}

const VALID_PLAN_PHASES = new Set<string>(["planning", "executing", "complete"]);
const VALID_CONVO_KINDS = new Set<string>(["getting_started"]);

/**
 * Runtime type guard for AgentHubMetadata.
 * Requires at least one discriminator (`planPhase`, `convoKind`, or `mode`) to be present
 * with a valid value — this discriminates AgentHubMetadata from other metadata shapes
 * (e.g., CliWorkspaceMetadata).
 * The `plan` and `createdForUserId` fields are optional and validated only when present.
 */
export function isAgentHubMetadata(value: unknown): value is AgentHubMetadata {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	// At least one discriminator (planPhase, convoKind, or mode) must be present
	if (!("planPhase" in obj) && !("convoKind" in obj) && !("mode" in obj)) {
		return false;
	}
	if ("planPhase" in obj && (typeof obj.planPhase !== "string" || !VALID_PLAN_PHASES.has(obj.planPhase))) {
		return false;
	}
	if ("plan" in obj && typeof obj.plan !== "string") {
		return false;
	}
	if ("mode" in obj && (typeof obj.mode !== "string" || !VALID_MODES.has(obj.mode))) {
		return false;
	}
	if ("convoKind" in obj && (typeof obj.convoKind !== "string" || !VALID_CONVO_KINDS.has(obj.convoKind))) {
		return false;
	}
	if ("createdForUserId" in obj && typeof obj.createdForUserId !== "number") {
		return false;
	}
	return true;
}

/**
 * Summary of an agent hub conversation for sidebar listing
 */
export interface AgentHubConvoSummary {
	readonly id: number;
	readonly title: string | undefined;
	readonly convoKind: AgentHubConvoKind | undefined;
	readonly updatedAt: string;
}

/**
 * Full agent hub conversation with messages
 */
export interface AgentHubConvo {
	readonly id: number;
	readonly title: string | undefined;
	readonly messages: ReadonlyArray<CollabMessage>;
	readonly metadata: AgentHubMetadata | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Navigation action triggered by the agent (e.g., navigate to a draft)
 */
export interface NavigationAction {
	readonly path: string;
	readonly label: string;
}

/**
 * Callbacks for streaming SSE events from agent hub messages
 */
export interface AgentHubStreamCallbacks {
	/** Called when a content chunk is received */
	onChunk?: (content: string, seq: number) => void;
	/** Called when a tool event occurs */
	onToolEvent?: (event: { type: string; tool: string; status?: string; result?: string }) => void;
	/** Called when the message is complete */
	onComplete?: (message: { role: string; content: string; timestamp: string }) => void;
	/** Called when an error occurs */
	onError?: (error: string) => void;
	/** Called when the agent triggers a navigation action */
	onNavigationAction?: (action: NavigationAction) => void;
	/** Called when the agent updates the plan (plan may be undefined for phase-only updates) */
	onPlanUpdate?: (plan: string | undefined, phase: AgentPlanPhase) => void;
	/** Called when a mutation tool requires user confirmation (exec mode) */
	onConfirmationRequired?: (confirmation: PendingConfirmation) => void;
	/** Called when a confirmation is resolved (approved or denied) */
	onConfirmationResolved?: (confirmationId: string, approved: boolean) => void;
	/** Called when the conversation mode changes */
	onModeChange?: (mode: AgentHubMode) => void;
}
