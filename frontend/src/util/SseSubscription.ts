import { getLog } from "./Logger";
import { createMercureClient, createResilientEventSource } from "jolli-common";

const log = getLog(import.meta);

/**
 * Reorders chunks that may arrive out of sequence from Mercure.
 *
 * Mercure doesn't guarantee message ordering when messages are published
 * rapidly. This class buffers out-of-order chunks and processes them
 * in sequence order when the expected chunk arrives.
 *
 * @example
 * ```ts
 * const reorderer = new ChunkReorderer<string>();
 *
 * // Chunks arrive out of order
 * reorderer.process("world", 1, chunk => console.log(chunk)); // Buffered
 * reorderer.process("Hello ", 0, chunk => console.log(chunk)); // Outputs: "Hello ", "world"
 *
 * // Reset when starting a new message stream
 * reorderer.reset();
 * ```
 */
export class ChunkReorderer<T> {
	private nextExpectedSeq = 0;
	private buffer = new Map<number, T>();

	/**
	 * Process a chunk, handling reordering if chunks arrive out of sequence.
	 *
	 * @param chunk The chunk data to process
	 * @param seq Sequence number (undefined for backwards compatibility - processes immediately)
	 * @param callback Called for each chunk in order
	 */
	process(chunk: T, seq: number | undefined, callback: (chunk: T) => void): void {
		// If no sequence number, process immediately (backwards compatibility)
		if (seq === undefined) {
			callback(chunk);
			return;
		}

		// If this is the expected next chunk, process it and any buffered subsequent chunks
		if (seq === this.nextExpectedSeq) {
			callback(chunk);
			this.nextExpectedSeq++;

			// Process any buffered chunks that are now in sequence
			while (this.buffer.has(this.nextExpectedSeq)) {
				const bufferedChunk = this.buffer.get(this.nextExpectedSeq);
				if (bufferedChunk !== undefined) {
					callback(bufferedChunk);
					this.buffer.delete(this.nextExpectedSeq);
				}
				this.nextExpectedSeq++;
			}
			return;
		}

		// If this chunk is out of order, buffer it for later
		if (seq > this.nextExpectedSeq) {
			this.buffer.set(seq, chunk);
			return;
		}

		// If seq < nextExpectedSeq, it's a duplicate or late arrival - ignore
	}

	/**
	 * Reset the reorderer state. Call this when starting a new message stream.
	 */
	reset(): void {
		this.nextExpectedSeq = 0;
		this.buffer.clear();
	}
}

/**
 * Subscription handle returned by createSseSubscription.
 */
export interface SseSubscription {
	close: () => void;
}

/**
 * Options for creating an SSE subscription.
 */
export interface SseSubscriptionOptions<T> {
	/** Type of subscription for Mercure: jobs, draft, or convo */
	type: "jobs" | "draft" | "convo";
	/** Resource ID (required for draft and convo types) */
	id: number;
	/** Direct SSE URL to use as fallback when Mercure is unavailable */
	directSseUrl: string;
	/** Callback when a message is received */
	onMessage: (data: T) => void;
	/** Callback when connection is established */
	onConnected?: () => void;
	/** Callback when reconnection is in progress */
	onReconnecting?: (attempt: number) => void;
	/** Callback when reconnection succeeds */
	onReconnected?: (afterAttempts: number) => void;
	/** Callback when connection fails permanently */
	onFailed?: () => void;
}

/**
 * Creates an SSE subscription, preferring Mercure when available with SSE fallback.
 *
 * This is an imperative API for use cases where the subscription needs to be
 * created after data is loaded (e.g., after fetching a draft to get its ID).
 *
 * @example
 * ```ts
 * const subscription = await createSseSubscription({
 *   type: "draft",
 *   id: draftId,
 *   directSseUrl: `/api/doc-drafts/${draftId}/stream`,
 *   onMessage: handleDraftEvent,
 *   onConnected: () => setConnected(true),
 * });
 *
 * // Later, to clean up:
 * subscription.close();
 * ```
 */
export async function createSseSubscription<T>(options: SseSubscriptionOptions<T>): Promise<SseSubscription> {
	const { type, id, directSseUrl, onMessage, onConnected, onReconnecting, onReconnected, onFailed } = options;

	const mercureClient = createMercureClient(window.location.origin);

	// Try Mercure first
	if (await mercureClient.isEnabled()) {
		try {
			const subscription = await mercureClient.subscribe({
				type,
				id,
				onMessage: data => onMessage(data as T),
				onReconnecting: attempt => onReconnecting?.(attempt),
				onReconnected: attempts => onReconnected?.(attempts),
				onError: () => onFailed?.(),
			});

			onConnected?.();
			return subscription;
		} catch (err) {
			// Fall through to direct SSE
			log.warn(err, "Mercure subscription failed, falling back to SSE");
		}
	}

	// Fall back to direct SSE
	const baseUrl = window.location.origin;
	const eventSource = createResilientEventSource(`${baseUrl}${directSseUrl}`, { withCredentials: true });

	eventSource.addEventListener("message", (event: Event) => {
		const customEvent = event as CustomEvent<{ data?: string }>;
		const rawData = customEvent.detail?.data || (event as MessageEvent).data;
		if (rawData) {
			try {
				onMessage(JSON.parse(rawData) as T);
			} catch (err) {
				console.error("Failed to parse SSE message:", err);
			}
		}
	});

	eventSource.addEventListener("open", () => {
		onConnected?.();
	});

	eventSource.addEventListener("reconnecting", (event: Event) => {
		const detail = (event as CustomEvent<{ attempt: number }>).detail;
		onReconnecting?.(detail?.attempt ?? 0);
	});

	eventSource.addEventListener("reconnected", (event: Event) => {
		const detail = (event as CustomEvent<{ afterAttempts: number }>).detail;
		onReconnected?.(detail?.afterAttempts ?? 0);
	});

	eventSource.addEventListener("reconnection_failed", () => {
		onFailed?.();
	});

	return { close: () => eventSource.close() };
}
