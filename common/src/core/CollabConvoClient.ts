/// <reference path="../types/dom.d.ts" />

import type { ArtifactType, CollabConvo } from "../types/CollabConvo";
import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/collab-convos";

/**
 * Reconnection state for resilient EventSource
 */
export interface ReconnectionState {
	attempt: number;
	nextDelay: number;
}

/**
 * Configuration for resilient EventSource
 */
export interface ResilientEventSourceConfig {
	/** Initial delay before first reconnection attempt (ms) */
	initialDelay?: number;
	/** Maximum delay between reconnection attempts (ms) */
	maxDelay?: number;
	/** Maximum number of reconnection attempts (0 = infinite) */
	maxAttempts?: number;
}

/**
 * Creates a resilient EventSource that automatically reconnects with exponential backoff.
 * Returns a wrapper object that mimics EventSource interface and dispatches reconnection events.
 *
 * @param url The EventSource URL
 * @param eventSourceInit EventSource configuration
 * @param config Reconnection configuration
 * @returns Object with EventSource-like interface and close() method
 */
export function createResilientEventSource(
	url: string,
	eventSourceInit?: EventSourceInit,
	config?: ResilientEventSourceConfig,
): {
	addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
	removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
	close: () => void;
	getReconnectionState: () => ReconnectionState | null;
} {
	const initialDelay = config?.initialDelay ?? 1000;
	const maxDelay = config?.maxDelay ?? 30000;
	const maxAttempts = config?.maxAttempts ?? 0; // 0 = infinite

	let eventSource: EventSource | null = null;
	let reconnectionTimeout: ReturnType<typeof setTimeout> | null = null;
	let reconnectionState: ReconnectionState | null = null;
	let isClosed = false;
	const eventListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

	function dispatchEvent(eventType: string, data?: unknown): void {
		const listeners = eventListeners.get(eventType);
		if (!listeners) {
			return;
		}

		const event = new CustomEvent(eventType, { detail: data });
		for (const listener of listeners) {
			if (typeof listener === "function") {
				listener(event);
			} else {
				listener.handleEvent(event);
			}
		}
	}

	function connect(): void {
		/* v8 ignore next 3 - defensive check tested implicitly via close + reconnection tests */
		if (isClosed) {
			return;
		}

		eventSource = new EventSource(url, eventSourceInit);

		// Forward all message events to listeners
		eventSource.onmessage = (event: MessageEvent) => {
			// Dispatch with the full MessageEvent data property for compatibility
			dispatchEvent("message", { data: event.data });
		};

		eventSource.onerror = () => {
			if (isClosed) {
				return;
			}

			// Connection failed or closed
			eventSource?.close();
			eventSource = null;

			// Check if we should attempt reconnection
			if (maxAttempts > 0 && reconnectionState && reconnectionState.attempt >= maxAttempts) {
				dispatchEvent("reconnection_failed", {
					attempts: reconnectionState.attempt,
				});
				return;
			}

			// Schedule reconnection with exponential backoff
			const attempt = reconnectionState ? reconnectionState.attempt + 1 : 1;
			const delay = reconnectionState ? Math.min(reconnectionState.nextDelay * 2, maxDelay) : initialDelay;

			reconnectionState = { attempt, nextDelay: delay };

			dispatchEvent("reconnecting", {
				attempt,
				delay,
			});

			reconnectionTimeout = setTimeout(() => {
				connect();
			}, delay);
		};

		eventSource.onopen = () => {
			// Successfully connected/reconnected
			if (reconnectionState && reconnectionState.attempt > 0) {
				dispatchEvent("reconnected", {
					afterAttempts: reconnectionState.attempt,
				});
			}
			// Reset reconnection state on successful connection
			reconnectionState = null;
			dispatchEvent("open", undefined);
		};
	}

	function addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
		if (!eventListeners.has(type)) {
			eventListeners.set(type, new Set());
		}
		eventListeners.get(type)?.add(listener);

		// Note: We don't add "message" listeners to the underlying EventSource
		// because we already forward all messages via onmessage handler (line 80-83).
		// Adding them would cause duplicate events.
	}

	function removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
		eventListeners.get(type)?.delete(listener);
	}

	function close(): void {
		isClosed = true;

		if (reconnectionTimeout) {
			clearTimeout(reconnectionTimeout);
			reconnectionTimeout = null;
		}

		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		reconnectionState = null;
		eventListeners.clear();
	}

	function getReconnectionState(): ReconnectionState | null {
		return reconnectionState;
	}

	// Start initial connection
	connect();

	return {
		addEventListener,
		removeEventListener,
		close,
		getReconnectionState,
	};
}

/**
 * SSE event handler callbacks for streaming message responses
 */
export interface SendMessageStreamCallbacks {
	/** Called when a content chunk is received */
	onChunk?: (content: string, seq: number) => void;
	/** Called when a tool event occurs */
	onToolEvent?: (event: { type: string; tool: string; status?: string; result?: string; arguments?: string }) => void;
	/** Called when the message is complete */
	onComplete?: (message: { role: string; content: string; timestamp: string }) => void;
	/** Called when an error occurs */
	onError?: (error: string) => void;
	/** Called when an article is updated */
	onArticleUpdated?: (data: {
		diffs: Array<unknown> | undefined;
		contentLastEditedAt: string | undefined;
		contentLastEditedBy: number | undefined;
		clientRequestId?: string;
		userId?: number;
	}) => void;
}

export interface SendMessageOptions {
	clientRequestId?: string;
}

export interface CollabConvoClient {
	/**
	 * Creates a new collaborative conversation
	 */
	createCollabConvo(artifactType: ArtifactType, artifactId: number): Promise<CollabConvo>;
	/**
	 * Gets a specific conversation by ID
	 */
	getCollabConvo(id: number): Promise<CollabConvo>;
	/**
	 * Gets a conversation by artifact type and ID
	 */
	getCollabConvoByArtifact(artifactType: ArtifactType, artifactId: number): Promise<CollabConvo>;
	/**
	 * Sends a message in the conversation.
	 * The response is an SSE stream - use callbacks to handle events.
	 * Returns a promise that resolves when the stream ends.
	 */
	sendMessage(
		id: number,
		message: string,
		callbacks?: SendMessageStreamCallbacks,
		options?: SendMessageOptions,
	): Promise<void>;
	/**
	 * Create an SSE connection to stream conversation updates
	 */
	streamConvo(id: number): EventSource;
}

export function createCollabConvoClient(baseUrl: string, auth: ClientAuth): CollabConvoClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;
	return {
		createCollabConvo,
		getCollabConvo,
		getCollabConvoByArtifact,
		sendMessage,
		streamConvo,
	};

	async function createCollabConvo(artifactType: ArtifactType, artifactId: number): Promise<CollabConvo> {
		const response = await fetch(basePath, createRequest("POST", { artifactType, artifactId }));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to create conversation: ${response.statusText}`);
		}

		return (await response.json()) as CollabConvo;
	}

	async function getCollabConvo(id: number): Promise<CollabConvo> {
		const response = await fetch(`${basePath}/${id}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get conversation: ${response.statusText}`);
		}

		return (await response.json()) as CollabConvo;
	}

	async function getCollabConvoByArtifact(artifactType: ArtifactType, artifactId: number): Promise<CollabConvo> {
		const response = await fetch(`${basePath}/artifact/${artifactType}/${artifactId}`, createRequest("GET"));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to get conversation by artifact: ${response.statusText}`);
		}

		return (await response.json()) as CollabConvo;
	}

	/**
	 * Dispatches a parsed SSE event to the appropriate callback
	 */
	function dispatchSseEvent(
		data: {
			type: string;
			userId?: number;
			clientRequestId?: string;
			content?: string;
			seq?: number;
			event?: { type: string; tool: string; status?: string; result?: string; arguments?: string };
			message?: { role: string; content: string; timestamp: string };
			error?: string;
			diffs?: Array<unknown>;
			contentLastEditedAt?: string;
			contentLastEditedBy?: number;
		},
		callbacks?: SendMessageStreamCallbacks,
	): void {
		switch (data.type) {
			case "message_received":
				// Acknowledgment that message was received - no callback needed
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
			case "article_updated":
				callbacks?.onArticleUpdated?.({
					diffs: data.diffs,
					contentLastEditedAt: data.contentLastEditedAt,
					contentLastEditedBy: data.contentLastEditedBy,
					...(data.clientRequestId !== undefined && { clientRequestId: data.clientRequestId }),
					...(data.userId !== undefined && { userId: data.userId }),
				});
				break;
			case "error":
				callbacks?.onError?.(data.error || "Unknown error");
				break;
		}
	}

	/**
	 * Parses and processes a single SSE data line
	 */
	function processSseDataLine(line: string, callbacks?: SendMessageStreamCallbacks): void {
		if (!line.startsWith("data: ")) {
			return;
		}

		const dataStr = line.slice(6);

		// Handle special markers
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
	function processSseEvent(eventStr: string, callbacks?: SendMessageStreamCallbacks): void {
		if (!eventStr.trim()) {
			return;
		}

		const lines = eventStr.split("\n");
		for (const line of lines) {
			// Skip comment lines (keep-alive pings)
			if (line.startsWith(":")) {
				continue;
			}
			processSseDataLine(line, callbacks);
		}
	}

	async function sendMessage(
		id: number,
		message: string,
		callbacks?: SendMessageStreamCallbacks,
		options?: SendMessageOptions,
	): Promise<void> {
		const body: { message: string; clientRequestId?: string } = { message };
		if (options?.clientRequestId) {
			body.clientRequestId = options.clientRequestId;
		}
		const response = await fetch(`${basePath}/${id}/messages`, createRequest("POST", body));
		auth.checkUnauthorized?.(response);

		if (!response.ok) {
			throw new Error(`Failed to send message: ${response.statusText}`);
		}

		// Handle SSE stream response
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
				// Keep the last incomplete chunk in buffer
				buffer = events.pop() || "";

				for (const eventStr of events) {
					processSseEvent(eventStr, callbacks);
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	function streamConvo(id: number): EventSource {
		return new EventSource(`${basePath}/${id}/stream`, { withCredentials: true });
	}
}
