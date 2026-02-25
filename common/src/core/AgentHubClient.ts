import type {
	AgentHubConvo,
	AgentHubConvoSummary,
	AgentHubMode,
	AgentHubStreamCallbacks,
	AgentPlanPhase,
	NavigationAction,
	PendingConfirmation,
} from "../types/AgentHub";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/agent/convos";

/**
 * Client for the Agent Hub API.
 * Manages agent hub conversations (create, list, get, delete, rename)
 * and handles SSE streaming for message responses.
 */
export interface AgentHubClient {
	/** Creates a new agent hub conversation */
	createConvo(title?: string): Promise<AgentHubConvo>;
	/** Lists agent hub conversations with pagination */
	listConvos(limit?: number, offset?: number): Promise<ReadonlyArray<AgentHubConvoSummary>>;
	/** Gets a specific conversation by ID */
	getConvo(id: number): Promise<AgentHubConvo>;
	/** Deletes a conversation */
	deleteConvo(id: number): Promise<void>;
	/** Updates the title of a conversation */
	updateTitle(id: number, title: string): Promise<void>;
	/** Sends a message and streams the SSE response via callbacks */
	sendMessage(id: number, message: string, callbacks?: AgentHubStreamCallbacks): Promise<void>;
	/** Retries an assistant response from a specific message index and streams the SSE response via callbacks */
	retryMessage(id: number, messageIndex: number, callbacks?: AgentHubStreamCallbacks): Promise<void>;
	/** Seeds a special conversation (get-or-create). Returns the conversation or undefined on error. */
	seedConvo(kind: string): Promise<AgentHubConvo | undefined>;
	/** Triggers auto-advance on a seeded conversation. Streams SSE or returns immediately if already advanced. */
	advanceConvo(id: number, callbacks?: AgentHubStreamCallbacks): Promise<void>;
	/** Responds to a pending tool confirmation (approve or deny) */
	respondToConfirmation(convoId: number, confirmationId: string, approved: boolean): Promise<void>;
	/** Changes the conversation mode */
	setMode(convoId: number, mode: AgentHubMode): Promise<AgentHubConvo>;
}

export function createAgentHubClient(baseUrl: string, auth: ClientAuth): AgentHubClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		createConvo,
		listConvos,
		getConvo,
		deleteConvo,
		updateTitle,
		sendMessage,
		retryMessage,
		seedConvo,
		advanceConvo,
		respondToConfirmation,
		setMode,
	};

	async function createConvo(title?: string): Promise<AgentHubConvo> {
		const body: { artifactType: string; title?: string } = { artifactType: "agent_hub" };
		if (title) {
			body.title = title;
		}
		const response = await fetch(basePath, createRequest("POST", body));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create conversation: ${response.statusText}`);
		}

		return (await response.json()) as AgentHubConvo;
	}

	async function listConvos(limit?: number, offset?: number): Promise<ReadonlyArray<AgentHubConvoSummary>> {
		const params = new URLSearchParams({ artifactType: "agent_hub" });
		if (limit !== undefined) {
			params.set("limit", String(limit));
		}
		if (offset !== undefined) {
			params.set("offset", String(offset));
		}

		const response = await fetch(`${basePath}?${params}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to list conversations: ${response.statusText}`);
		}

		return (await response.json()) as ReadonlyArray<AgentHubConvoSummary>;
	}

	async function getConvo(id: number): Promise<AgentHubConvo> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get conversation: ${response.statusText}`);
		}

		return (await response.json()) as AgentHubConvo;
	}

	async function deleteConvo(id: number): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("DELETE"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to delete conversation: ${response.statusText}`);
		}
	}

	async function updateTitle(id: number, title: string): Promise<void> {
		const response = await fetch(`${basePath}/${id}`, createRequest("PATCH", { title }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to update conversation title: ${response.statusText}`);
		}
	}

	/**
	 * Sends a message and processes the SSE response stream.
	 * Reuses the same SSE parsing pattern as CollabConvoClient.
	 */
	async function sendMessage(id: number, message: string, callbacks?: AgentHubStreamCallbacks): Promise<void> {
		const response = await fetch(`${basePath}/${id}/messages`, createRequest("POST", { message }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to send message: ${response.statusText}`);
		}

		await readSseStream(response, callbacks);
	}

	/** Seeds a special conversation (get-or-create). Returns the conversation or undefined on error. */
	async function seedConvo(kind: string): Promise<AgentHubConvo | undefined> {
		try {
			const response = await fetch(`${basePath}/seed/${kind}`, createRequest("POST"));
			auth.checkUnauthorized?.(response);

			if (!response.ok) {
				return;
			}

			return (await response.json()) as AgentHubConvo;
		} catch {
			return;
		}
	}

	/**
	 * Triggers auto-advance on a seeded conversation.
	 * Streams SSE if advancing, returns immediately if already advanced (JSON response).
	 */
	async function advanceConvo(id: number, callbacks?: AgentHubStreamCallbacks): Promise<void> {
		const response = await fetch(`${basePath}/${id}/advance`, createRequest("POST"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to advance conversation: ${response.statusText}`);
		}

		// Already-advanced returns JSON (content-type: application/json), not SSE
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			return;
		}

		await readSseStream(response, callbacks);
	}

	/**
	 * Retries an assistant response from a specific message index and processes the SSE response stream.
	 */
	async function retryMessage(id: number, messageIndex: number, callbacks?: AgentHubStreamCallbacks): Promise<void> {
		const response = await fetch(`${basePath}/${id}/retry`, createRequest("POST", { messageIndex }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to retry message: ${response.statusText}`);
		}

		await readSseStream(response, callbacks);
	}

	/** Responds to a pending tool confirmation (approve or deny). */
	async function respondToConfirmation(convoId: number, confirmationId: string, approved: boolean): Promise<void> {
		const response = await fetch(
			`${basePath}/${convoId}/confirmations/${confirmationId}`,
			createRequest("POST", { approved }),
		);
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to respond to confirmation: ${response.statusText}`);
		}
	}

	/** Changes the conversation mode. */
	async function setMode(convoId: number, mode: AgentHubMode): Promise<AgentHubConvo> {
		const response = await fetch(`${basePath}/${convoId}/mode`, createRequest("POST", { mode }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to set mode: ${response.statusText}`);
		}

		return (await response.json()) as AgentHubConvo;
	}
}

/**
 * Reads an SSE stream from a fetch response and dispatches events to callbacks.
 */
async function readSseStream(response: globalThis.Response, callbacks?: AgentHubStreamCallbacks): Promise<void> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("Response body is not readable");
	}

	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });

			// Process complete SSE events (separated by double newlines)
			const events = buffer.split("\n\n");
			buffer = events.pop() || "";

			for (const eventStr of events) {
				processSseEvent(eventStr, callbacks);
			}
		}

		// Flush any remaining data in the buffer after stream closes.
		// The last SSE event may not have a trailing \n\n if the connection
		// closed immediately after the server wrote it.
		if (buffer.trim()) {
			processSseEvent(buffer, callbacks);
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Dispatches a parsed SSE event to the appropriate callback
 */
function dispatchSseEvent(
	data: {
		type: string;
		content?: string;
		seq?: number;
		event?: { type: string; tool: string; status?: string; result?: string };
		message?: { role: string; content: string; timestamp: string };
		error?: string;
		action?: NavigationAction;
		plan?: string;
		phase?: AgentPlanPhase;
		confirmation?: PendingConfirmation;
		confirmationId?: string;
		approved?: boolean;
		mode?: AgentHubMode;
	},
	callbacks?: AgentHubStreamCallbacks,
): void {
	switch (data.type) {
		case "message_received":
		case "typing":
			// Acknowledgment events — no callback needed
			break;
		case "content_chunk":
			callbacks?.onChunk?.(data.content || "", data.seq || 0);
			break;
		case "tool_event":
			if (data.event) {
				callbacks?.onToolEvent?.(data.event);
			}
			break;
		case "message_complete":
			if (data.message) {
				callbacks?.onComplete?.(data.message);
			}
			break;
		case "navigation_action":
			if (data.action) {
				callbacks?.onNavigationAction?.(data.action);
			}
			break;
		case "plan_update":
			if (data.phase) {
				callbacks?.onPlanUpdate?.(data.plan, data.phase);
			}
			break;
		case "confirmation_required":
			if (data.confirmation) {
				callbacks?.onConfirmationRequired?.(data.confirmation);
			}
			break;
		case "confirmation_resolved":
			if (data.confirmationId !== undefined && data.approved !== undefined) {
				callbacks?.onConfirmationResolved?.(data.confirmationId, data.approved);
			}
			break;
		case "mode_change":
			if (data.mode) {
				callbacks?.onModeChange?.(data.mode);
			}
			break;
		case "error":
			callbacks?.onError?.(data.error || "Unknown error");
			break;
	}
}

/**
 * Parses and processes a single SSE data line
 */
function processSseDataLine(line: string, callbacks?: AgentHubStreamCallbacks): void {
	if (!line.startsWith("data: ")) {
		return;
	}

	const dataStr = line.slice(6);
	if (dataStr === "[DONE]" || dataStr === "[ERROR]") {
		return;
	}

	try {
		const data = JSON.parse(dataStr);
		dispatchSseEvent(data, callbacks);
	} catch {
		// Ignore parse errors for malformed data
	}
}

/**
 * Processes a complete SSE event string
 */
function processSseEvent(eventStr: string, callbacks?: AgentHubStreamCallbacks): void {
	if (!eventStr.trim()) {
		return;
	}

	const lines = eventStr.split("\n");
	for (const line of lines) {
		if (line.startsWith(":")) {
			continue;
		}
		processSseDataLine(line, callbacks);
	}
}
