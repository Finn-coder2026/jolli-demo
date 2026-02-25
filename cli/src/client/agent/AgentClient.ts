/**
 * Agent Conversation Client
 *
 * HTTP client for interacting with the agent conversation API.
 * Provides methods to create, list, and interact with CLI workspace conversations.
 */

import { getConfig } from "../../shared/config";
import { getLog } from "../../shared/logger";
import type { ToolManifest } from "../commands/agent";

const logger = getLog(import.meta);
const config = getConfig();

/**
 * Agent mode for CLI workspace conversations.
 */
export type AgentMode = "general" | "impact";

/**
 * Context for impact agent mode.
 */
export interface ImpactContext {
	readonly article: {
		readonly path: string;
		readonly jrn: string;
	};
	readonly changes: ReadonlyArray<{
		readonly path: string;
		readonly status: "added" | "modified" | "deleted" | "renamed";
		readonly diff: string;
	}>;
	readonly commits: ReadonlyArray<{
		readonly sha: string;
		readonly message: string;
	}>;
	readonly evidence: ReadonlyArray<{
		readonly changedFile: string;
		readonly pattern: string;
		readonly matchType: "exact" | "glob";
		readonly source: string;
	}>;
}

export interface WorkspaceSourceMapping {
	readonly name: string;
	readonly path: string;
	readonly sourceId?: number;
}

/**
 * CLI workspace metadata stored with the conversation
 */
export interface CliWorkspaceMetadata {
	readonly workspaceRoot?: string;
	readonly toolManifest?: ToolManifest;
	readonly clientVersion?: string;
	readonly sources?: ReadonlyArray<WorkspaceSourceMapping>;
	readonly agentMode?: AgentMode;
	readonly impactContext?: ImpactContext;
}

/**
 * Message structure in a conversation
 */
export interface CollabMessage {
	readonly role: "user" | "assistant" | "system" | "assistant_tool_use" | "assistant_tool_uses" | "tool";
	readonly content?: string;
	readonly userId?: number;
	readonly timestamp: string;
	readonly tool_call_id?: string;
	readonly tool_name?: string;
	readonly tool_input?: unknown;
	readonly calls?: Array<{
		readonly tool_call_id: string;
		readonly tool_name: string;
		readonly tool_input: unknown;
	}>;
}

/**
 * Conversation structure returned from the API
 */
export interface AgentConvo {
	readonly id: number;
	readonly artifactType: string;
	readonly artifactId: number | null;
	readonly messages: Array<CollabMessage>;
	readonly metadata: CliWorkspaceMetadata | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/**
 * Mercure configuration from the server
 */
export interface MercureConfig {
	readonly enabled: boolean;
	readonly hubUrl: string | null;
}

/**
 * Mercure token response
 */
export interface MercureTokenResponse {
	readonly token: string;
	readonly topics: Array<string>;
}

/**
 * Request to create a new conversation
 */
export interface CreateConvoRequest {
	readonly workspaceRoot?: string;
	readonly toolManifest?: ToolManifest;
	readonly clientVersion?: string;
	readonly sources?: ReadonlyArray<WorkspaceSourceMapping>;
	readonly agentMode?: AgentMode;
	readonly impactContext?: ImpactContext;
}

/**
 * Request to send a message
 */
export interface SendMessageRequest {
	readonly message: string;
}

/**
 * Request to submit a tool result
 */
export interface ToolResultRequest {
	readonly toolCallId: string;
	readonly output: string;
	readonly error?: string;
}

/**
 * Agent conversation client interface
 */
export interface AgentConvoClient {
	/**
	 * Creates a new CLI workspace conversation.
	 */
	createConvo(request: CreateConvoRequest): Promise<AgentConvo>;

	/**
	 * Lists CLI workspace conversations.
	 */
	listConvos(limit?: number, offset?: number): Promise<Array<AgentConvo>>;

	/**
	 * Gets a conversation by ID.
	 */
	getConvo(convoId: number): Promise<AgentConvo>;

	/**
	 * Deletes a conversation.
	 */
	deleteConvo(convoId: number): Promise<void>;

	/**
	 * Sends a user message to a conversation.
	 * Returns 202 Accepted immediately; response streams via Mercure.
	 */
	sendMessage(convoId: number, message: string): Promise<void>;

	/**
	 * Submits a tool execution result.
	 */
	sendToolResult(convoId: number, toolCallId: string, output: string, error?: string): Promise<void>;

	/**
	 * Gets Mercure configuration from the server.
	 */
	getMercureConfig(): Promise<MercureConfig>;

	/**
	 * Gets a Mercure subscriber token for a conversation.
	 */
	getMercureToken(convoId: number): Promise<MercureTokenResponse>;
}

/**
 * Creates an agent conversation client.
 *
 * @param authToken - The authentication token
 * @param baseUrl - Optional base URL override
 * @returns The agent client
 */
export function createAgentConvoClient(authToken: string, baseUrl?: string): AgentConvoClient {
	const serverUrl = baseUrl || config.JOLLI_URL;

	async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
		const url = `${serverUrl}${path}`;
		const headers = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${authToken}`,
			...options.headers,
		};

		logger.debug("Fetching %s %s", options.method || "GET", url);

		const response = await fetch(url, {
			...options,
			headers,
		});

		return response;
	}

	async function createConvo(request: CreateConvoRequest): Promise<AgentConvo> {
		const response = await fetchWithAuth("/api/agent/convos", {
			method: "POST",
			body: JSON.stringify(request),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || `Failed to create conversation: ${response.status}`);
		}

		return (await response.json()) as AgentConvo;
	}

	async function listConvos(limit = 50, offset = 0): Promise<Array<AgentConvo>> {
		const response = await fetchWithAuth(`/api/agent/convos?limit=${limit}&offset=${offset}`);

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || `Failed to list conversations: ${response.status}`);
		}

		return (await response.json()) as Array<AgentConvo>;
	}

	async function getConvo(convoId: number): Promise<AgentConvo> {
		const response = await fetchWithAuth(`/api/agent/convos/${convoId}`);

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || `Failed to get conversation: ${response.status}`);
		}

		return (await response.json()) as AgentConvo;
	}

	async function deleteConvo(convoId: number): Promise<void> {
		const response = await fetchWithAuth(`/api/agent/convos/${convoId}`, {
			method: "DELETE",
		});

		if (!response.ok && response.status !== 204) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || `Failed to delete conversation: ${response.status}`);
		}
	}

	async function sendMessage(convoId: number, message: string): Promise<void> {
		const response = await fetchWithAuth(`/api/agent/convos/${convoId}/messages`, {
			method: "POST",
			body: JSON.stringify({ message }),
		});

		if (!response.ok && response.status !== 202) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || `Failed to send message: ${response.status}`);
		}
	}

	async function sendToolResult(convoId: number, toolCallId: string, output: string, error?: string): Promise<void> {
		const body: ToolResultRequest = { toolCallId, output };
		if (error) {
			(body as { error?: string }).error = error;
		}

		const response = await fetchWithAuth(`/api/agent/convos/${convoId}/tool-results`, {
			method: "POST",
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorResponse = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error(
				(errorResponse as { error?: string }).error || `Failed to send tool result: ${response.status}`,
			);
		}
	}

	async function getMercureConfig(): Promise<MercureConfig> {
		const response = await fetchWithAuth("/api/mercure/config");

		if (!response.ok) {
			logger.warn("Failed to get Mercure config: %d", response.status);
			return { enabled: false, hubUrl: null };
		}

		return (await response.json()) as MercureConfig;
	}

	async function getMercureToken(convoId: number): Promise<MercureTokenResponse> {
		const response = await fetchWithAuth("/api/mercure/token", {
			method: "POST",
			body: JSON.stringify({ type: "convo", id: convoId }),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || `Failed to get Mercure token: ${response.status}`);
		}

		return (await response.json()) as MercureTokenResponse;
	}

	return {
		createConvo,
		listConvos,
		getConvo,
		deleteConvo,
		sendMessage,
		sendToolResult,
		getMercureConfig,
		getMercureToken,
	};
}
