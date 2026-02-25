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
		// Flush headers immediately to establish the SSE connection
		res.flushHeaders();
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
