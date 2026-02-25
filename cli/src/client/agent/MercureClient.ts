/**
 * Mercure Client for CLI
 *
 * Subscribes to conversation events via EventSource.
 * Handles reconnection with exponential backoff.
 */

import type { AgentConvoClient } from "./AgentClient";
import { EventSource } from "eventsource";
import { getLog, logError } from "../../shared/logger";

const logger = getLog(import.meta);

/**
 * Configuration for the Mercure client
 */
export interface MercureClientConfig {
	readonly hubUrl: string;
	readonly subscriberToken: string;
	readonly topic: string;
}

/**
 * Resilient EventSource configuration
 */
export interface ResilientConfig {
	readonly initialDelayMs: number;
	readonly maxDelayMs: number;
	readonly maxRetries: number;
}

const DEFAULT_RESILIENT_CONFIG: ResilientConfig = {
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	maxRetries: 10,
};

/**
 * Event types received from the server
 */
export type MercureEventType =
	| "connected"
	| "typing"
	| "content_chunk"
	| "tool_call_request"
	| "tool_event"
	| "message_complete"
	| "error"
	| "user_joined"
	| "user_left";

/**
 * Base event structure
 */
export interface MercureEvent {
	readonly type: MercureEventType;
	readonly timestamp: string;
	readonly convoId?: number;
}

/**
 * Content chunk event (streaming text)
 */
export interface ContentChunkEvent extends MercureEvent {
	readonly type: "content_chunk";
	readonly content: string;
	readonly seq: number;
}

/**
 * Tool call request event (dispatch to CLI)
 */
export interface ToolCallRequestEvent extends MercureEvent {
	readonly type: "tool_call_request";
	readonly toolCallId: string;
	readonly name: string;
	readonly arguments: Record<string, unknown>;
}

/**
 * Tool event (status updates)
 */
export interface ToolEventData extends MercureEvent {
	readonly type: "tool_event";
	readonly event: {
		readonly type: string;
		readonly tool: string;
		readonly status?: string;
		readonly result?: string;
	};
}

/**
 * Message complete event
 */
export interface MessageCompleteEvent extends MercureEvent {
	readonly type: "message_complete";
	readonly message: {
		readonly role: string;
		readonly content: string;
		readonly timestamp: string;
	};
}

/**
 * Error event
 */
export interface ErrorEvent extends MercureEvent {
	readonly type: "error";
	readonly error: string;
}

/**
 * Union of all event types
 */
export type AgentEvent =
	| MercureEvent
	| ContentChunkEvent
	| ToolCallRequestEvent
	| ToolEventData
	| MessageCompleteEvent
	| ErrorEvent;

/**
 * Mercure subscription callbacks
 */
export interface MercureCallbacks {
	readonly onEvent: (event: AgentEvent) => void;
	readonly onError?: (error: Error) => void;
	readonly onReconnecting?: (attempt: number) => void;
	readonly onReconnected?: (afterAttempts: number) => void;
	readonly onDisconnected?: () => void;
}

/**
 * Mercure subscription handle
 */
export interface MercureSubscription {
	readonly close: () => void;
	readonly isConnected: () => boolean;
}

/**
 * Creates a Mercure subscription for a conversation.
 *
 * @param config - Mercure client configuration
 * @param callbacks - Event callbacks
 * @param resilientConfig - Reconnection configuration
 * @returns Subscription handle
 */
export function createMercureSubscription(
	config: MercureClientConfig,
	callbacks: MercureCallbacks,
	resilientConfig: ResilientConfig = DEFAULT_RESILIENT_CONFIG,
): MercureSubscription {
	let eventSource: EventSource | null = null;
	let isConnected = false;
	let reconnectAttempts = 0;
	let reconnectTimeout: NodeJS.Timeout | null = null;
	let shouldReconnect = true;

	function connect(): void {
		if (!shouldReconnect) return;

		// Build URL with topic and authorization
		const url = new URL(config.hubUrl);
		url.searchParams.set("topic", config.topic);
		url.searchParams.set("authorization", config.subscriberToken);

		logger.info("Connecting to Mercure hub: %s", config.hubUrl);

		eventSource = new EventSource(url.toString());

		eventSource.onopen = () => {
			isConnected = true;
			if (reconnectAttempts > 0) {
				callbacks.onReconnected?.(reconnectAttempts);
			}
			reconnectAttempts = 0;
			logger.info("Connected to Mercure hub");
		};

		eventSource.onmessage = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as AgentEvent;
				callbacks.onEvent(data);
			} catch (error) {
				logError(logger, error, "Failed to parse Mercure event");
				callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
			}
		};

		eventSource.onerror = () => {
			isConnected = false;
			eventSource?.close();
			eventSource = null;

			if (!shouldReconnect) {
				callbacks.onDisconnected?.();
				return;
			}

			reconnectAttempts++;
			if (reconnectAttempts > resilientConfig.maxRetries) {
				logger.error("Mercure reconnection failed after %d attempts", reconnectAttempts);
				callbacks.onError?.(new Error(`Connection failed after ${resilientConfig.maxRetries} retries`));
				callbacks.onDisconnected?.();
				return;
			}

			// Calculate exponential backoff delay
			const delay = Math.min(
				resilientConfig.initialDelayMs * 2 ** (reconnectAttempts - 1),
				resilientConfig.maxDelayMs,
			);

			logger.info("Reconnecting to Mercure hub in %dms (attempt %d)", delay, reconnectAttempts);
			callbacks.onReconnecting?.(reconnectAttempts);

			reconnectTimeout = setTimeout(connect, delay);
		};
	}

	function close(): void {
		shouldReconnect = false;
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		isConnected = false;
		logger.info("Mercure subscription closed");
	}

	// Start initial connection
	connect();

	return {
		close,
		isConnected: () => isConnected,
	};
}

/**
 * Gets Mercure configuration from the server.
 */
export async function getMercureConfig(client: AgentConvoClient): Promise<{
	enabled: boolean;
	hubUrl: string | null;
}> {
	return client.getMercureConfig();
}

/**
 * Gets a subscriber token for a conversation.
 */
export async function getMercureToken(
	client: AgentConvoClient,
	convoId: number,
): Promise<{
	token: string;
	topics: Array<string>;
}> {
	return client.getMercureToken(convoId);
}

/**
 * Configuration for the direct SSE client (fallback when Mercure unavailable)
 */
export interface SSEClientConfig {
	readonly serverUrl: string;
	readonly convoId: number;
	readonly authToken: string;
}

/**
 * Creates a direct SSE subscription for a conversation (fallback when Mercure unavailable).
 *
 * @param config - SSE client configuration
 * @param callbacks - Event callbacks
 * @param resilientConfig - Reconnection configuration
 * @returns Subscription handle
 */
export function createSSESubscription(
	config: SSEClientConfig,
	callbacks: MercureCallbacks,
	resilientConfig: ResilientConfig = DEFAULT_RESILIENT_CONFIG,
): MercureSubscription {
	let eventSource: EventSource | null = null;
	let isConnected = false;
	let reconnectAttempts = 0;
	let reconnectTimeout: NodeJS.Timeout | null = null;
	let shouldReconnect = true;

	function connect(): void {
		if (!shouldReconnect) {
			return;
		}

		// Build URL for direct SSE endpoint
		const url = new URL(`${config.serverUrl}/api/agent/convos/${config.convoId}/stream`);
		// Note: EventSource doesn't support custom headers, so we pass token via query param
		url.searchParams.set("token", config.authToken);

		logger.info("Connecting to SSE stream: %s", url.origin + url.pathname);

		eventSource = new EventSource(url.toString());

		eventSource.onopen = () => {
			isConnected = true;
			if (reconnectAttempts > 0) {
				callbacks.onReconnected?.(reconnectAttempts);
			}
			reconnectAttempts = 0;
			logger.info("Connected to SSE stream");
		};

		eventSource.onmessage = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as AgentEvent;
				callbacks.onEvent(data);
			} catch (error) {
				logError(logger, error, "Failed to parse SSE event");
				callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
			}
		};

		eventSource.onerror = () => {
			isConnected = false;
			eventSource?.close();
			eventSource = null;

			if (!shouldReconnect) {
				callbacks.onDisconnected?.();
				return;
			}

			reconnectAttempts++;
			if (reconnectAttempts > resilientConfig.maxRetries) {
				logger.error("SSE reconnection failed after %d attempts", reconnectAttempts);
				callbacks.onError?.(new Error(`Connection failed after ${resilientConfig.maxRetries} retries`));
				callbacks.onDisconnected?.();
				return;
			}

			// Calculate exponential backoff delay
			const delay = Math.min(
				resilientConfig.initialDelayMs * 2 ** (reconnectAttempts - 1),
				resilientConfig.maxDelayMs,
			);

			logger.info("Reconnecting to SSE stream in %dms (attempt %d)", delay, reconnectAttempts);
			callbacks.onReconnecting?.(reconnectAttempts);

			reconnectTimeout = setTimeout(connect, delay);
		};
	}

	function close(): void {
		shouldReconnect = false;
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		isConnected = false;
		logger.info("SSE subscription closed");
	}

	// Start initial connection
	connect();

	return {
		close,
		isConnected: () => isConnected,
	};
}
