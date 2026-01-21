import type { Agent, AgentConfig, ChatMessage } from "../core/agent";
import { getLog } from "../util/Logger";
import type { Response } from "express";

const log = getLog(import.meta);

/**
 * Server-Sent Event data structure
 */
export interface SSEEvent {
	data: string;
}

/**
 * Chat streaming result containing the full response and metadata
 */
export interface ChatStreamResult {
	fullResponse: string;
	metadata?: Record<string, unknown>;
}

/**
 * Service for common chat-related functionality
 */
export class ChatService {
	/**
	 * Sets up Server-Sent Events headers on a response
	 */
	setupSSEHeaders(res: Response): void {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
	}

	/**
	 * Sends an SSE event to the client
	 */
	sendSSE(res: Response, data: unknown): void {
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	}

	/**
	 * Sends a done event to the client
	 */
	sendDone(res: Response): void {
		res.write("data: [DONE]\n\n");
	}

	/**
	 * Sends an error event to the client
	 */
	sendError(res: Response): void {
		res.write("data: [ERROR]\n\n");
	}

	/**
	 * Starts sending periodic keep-alive pings to maintain SSE connection.
	 * Sends comment-only SSE messages with timestamps to prevent proxy timeouts.
	 *
	 * @param res the Express response object
	 * @param intervalMs interval in milliseconds between pings (default 20000 = 20 seconds)
	 * @returns interval ID for cleanup via stopKeepAlive()
	 */
	startKeepAlive(res: Response, intervalMs = 20000): NodeJS.Timeout {
		log.debug("Starting SSE keep-alive with %dms interval", intervalMs);
		const intervalId = setInterval(() => {
			if (!res.writableEnded) {
				const timestamp = new Date().toISOString();
				res.write(`: ping ${timestamp}\n\n`);
				log.debug("Sent SSE keep-alive ping at %s", timestamp);
			}
		}, intervalMs);
		return intervalId;
	}

	/**
	 * Stops sending keep-alive pings.
	 *
	 * @param intervalId the interval ID returned by startKeepAlive()
	 */
	stopKeepAlive(intervalId: NodeJS.Timeout): void {
		clearInterval(intervalId);
		log.debug("Stopped SSE keep-alive");
	}

	/**
	 * Streams a chat response from an agent to the client via SSE.
	 * Note: This does NOT call res.end() to allow caller to send additional events.
	 *
	 * @param res the Express response object
	 * @param agent the AI agent to stream from
	 * @param chatMessages the conversation messages
	 * @param agentConfig the agent configuration
	 * @returns the full response text and metadata
	 */
	async streamChatResponse(
		res: Response,
		agent: Agent,
		chatMessages: Array<ChatMessage>,
		agentConfig: AgentConfig,
	): Promise<ChatStreamResult> {
		// Set up SSE headers
		this.setupSSEHeaders(res);

		// Stream the response using the agent
		/* v8 ignore next 2 - async generator initialization covered by for-await */
		const stream = agent.stream(chatMessages, agentConfig);
		let fullResponse = "";
		let metadata: Record<string, unknown> | undefined;

		for await (const chunk of stream) {
			if (chunk.type === "content" && chunk.content) {
				fullResponse += chunk.content;
				// Send as Server-Sent Event
				this.sendSSE(res, { content: chunk.content });
			} else if (chunk.type === "done") {
				metadata = chunk.metadata;
				// Send done signal with metadata
				this.sendSSE(res, { type: "done", metadata: chunk.metadata });
			}
		}

		return metadata !== undefined ? { fullResponse, metadata } : { fullResponse };
	}

	/**
	 * Handles errors during SSE streaming.
	 * If headers haven't been sent, responds with JSON error.
	 * If streaming has started, attempts to send error event and end gracefully.
	 *
	 * @param res the Express response object
	 * @param error the error that occurred
	 * @param errorMessage custom error message to send
	 */
	handleStreamError(res: Response, error: unknown, errorMessage?: string): void {
		log.error(error, errorMessage || "Streaming error");

		/* v8 ignore next 17 - complex error handling with multiple branches, hard to test all paths */
		if (!res.headersSent) {
			// If headers haven't been sent yet, send error response
			const message = errorMessage || (error instanceof Error ? error.message : "Internal server error");
			res.status(500).json({ error: message });
		} else {
			// For streaming errors after headers sent, try to end the response gracefully
			try {
				if (!res.writableEnded) {
					this.sendError(res);
					res.end();
				}
			} catch {
				// Response already ended or connection closed
			}
		}
	}

	/**
	 * Validates and sanitizes a chat message.
	 *
	 * @param message the message to validate
	 * @returns the sanitized message
	 * @throws Error if message is invalid
	 */
	validateMessage(message: string): string {
		// Trim whitespace
		const trimmed = message.trim();

		if (trimmed.length === 0) {
			throw new Error("Message cannot be empty");
		}

		return trimmed;
	}

	/**
	 * Generates a title from a message (truncated to specified length).
	 *
	 * @param message the message to generate title from
	 * @param maxLength maximum length of title (default 50)
	 * @returns the generated title
	 */
	generateTitle(message: string, maxLength = 50): string {
		const trimmed = message.trim().slice(0, maxLength);
		return trimmed.length < message.trim().length ? `${trimmed}...` : trimmed;
	}
}
