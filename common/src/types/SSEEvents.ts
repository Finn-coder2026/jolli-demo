import type { CollabMessage } from "./CollabConvo";
import type { ContentDiff } from "./Diff";

/**
 * SSE event types for draft updates
 */
export type DraftSSEEventType =
	| "connected"
	| "user_joined"
	| "user_left"
	| "content_update"
	| "draft_saved"
	| "draft_deleted";

/**
 * SSE event for draft streams
 */
export interface DraftSSEEvent {
	type: DraftSSEEventType;
	draftId?: number;
	userId?: number;
	clientMutationId?: string;
	diffs?: Array<ContentDiff>;
	timestamp: string;
}

/**
 * SSE event types for collaborative conversations
 */
export type ConvoSSEEventType = "connected" | "user_joined" | "user_left" | "typing" | "message";

/**
 * SSE event for conversation streams
 */
export interface ConvoSSEEvent {
	type: ConvoSSEEventType;
	convoId?: number;
	userId?: number;
	clientRequestId?: string;
	message?: CollabMessage;
	timestamp: string;
}

type ToolEventStatus = "start" | "end";

type ToolEventType = "tool_event";

/**
 * SSE event for a running jolli agent tool
 */
export interface ToolEvent {
	type: ToolEventType;
	tool: string;
	arguments: string;
	status?: ToolEventStatus;
	result?: string;
}
