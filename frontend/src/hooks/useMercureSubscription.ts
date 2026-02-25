import { getLog } from "../util/Logger";
import { createMercureClient, createResilientEventSource } from "jolli-common";
import { useCallback, useEffect, useRef, useState } from "react";

const log = getLog(import.meta);

/**
 * Options for the useMercureSubscription hook.
 */
export interface UseMercureSubscriptionOptions<T> {
	/** Type of subscription: jobs, draft, convo, or onboarding */
	type: "jobs" | "draft" | "convo" | "onboarding";
	/** Resource ID (required for draft, convo, and onboarding types) */
	id?: number;
	/** Direct SSE URL to use as fallback when Mercure is unavailable */
	directSseUrl: string;
	/** Callback when a message is received */
	onMessage: (data: T) => void;
	/** Callback when an error occurs */
	onError?: (error: Error) => void;
	/** Callback when reconnection is in progress */
	onReconnecting?: (attempt: number) => void;
	/** Callback when reconnection succeeds */
	onReconnected?: (afterAttempts: number) => void;
	/** Whether the subscription is enabled (default: true) */
	enabled?: boolean;
}

/**
 * Return type for the useMercureSubscription hook.
 */
export interface UseMercureSubscriptionResult {
	/** Whether the connection is established */
	connected: boolean;
	/** Whether a reconnection attempt is in progress */
	reconnecting: boolean;
	/** Whether the subscription is using Mercure (vs direct SSE) */
	usingMercure: boolean;
}

/**
 * React hook for subscribing to real-time events via Mercure Hub with SSE fallback.
 *
 * Attempts to subscribe via Mercure first. If Mercure is unavailable or subscription fails,
 * falls back to direct SSE endpoint.
 *
 * @example
 * ```tsx
 * const { connected, reconnecting, usingMercure } = useMercureSubscription({
 *   type: "draft",
 *   id: draftId,
 *   directSseUrl: `/api/doc-drafts/${draftId}/stream`,
 *   onMessage: handleDraftEvent,
 *   enabled: !!draftId,
 * });
 * ```
 */
export function useMercureSubscription<T>(options: UseMercureSubscriptionOptions<T>): UseMercureSubscriptionResult {
	const { type, id, directSseUrl, onMessage, onError, onReconnecting, onReconnected, enabled = true } = options;

	const [connected, setConnected] = useState(false);
	const [reconnecting, setReconnecting] = useState(false);
	const [usingMercure, setUsingMercure] = useState(false);
	const subscriptionRef = useRef<{ close: () => void } | null>(null);

	// Memoize callbacks to avoid unnecessary re-subscriptions
	const onMessageRef = useRef(onMessage);
	const onErrorRef = useRef(onError);
	const onReconnectingRef = useRef(onReconnecting);
	const onReconnectedRef = useRef(onReconnected);

	// Update refs when callbacks change
	useEffect(() => {
		onMessageRef.current = onMessage;
	}, [onMessage]);

	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	useEffect(() => {
		onReconnectingRef.current = onReconnecting;
	}, [onReconnecting]);

	useEffect(() => {
		onReconnectedRef.current = onReconnected;
	}, [onReconnected]);

	const setupDirectSse = useCallback(
		(cancelled: { value: boolean }) => {
			const baseUrl = window.location.origin;
			const eventSource = createResilientEventSource(`${baseUrl}${directSseUrl}`, { withCredentials: true });

			eventSource.addEventListener("message", (event: Event) => {
				const customEvent = event as CustomEvent<{ data?: string }>;
				const rawData = customEvent.detail?.data || (event as MessageEvent).data;
				if (rawData) {
					try {
						onMessageRef.current(JSON.parse(rawData) as T);
					} catch (err) {
						/* v8 ignore next - error handler requires malformed JSON to test */
						onErrorRef.current?.(err instanceof Error ? err : new Error("Failed to parse message"));
					}
				}
			});

			eventSource.addEventListener("open", () => {
				if (!cancelled.value) {
					setConnected(true);
					setReconnecting(false);
				}
			});

			eventSource.addEventListener("reconnecting", (event: Event) => {
				if (!cancelled.value) {
					setReconnecting(true);
					const detail = (event as CustomEvent<{ attempt: number }>).detail;
					onReconnectingRef.current?.(detail?.attempt ?? 0);
				}
			});

			eventSource.addEventListener("reconnected", (event: Event) => {
				if (!cancelled.value) {
					setReconnecting(false);
					setConnected(true);
					const detail = (event as CustomEvent<{ afterAttempts: number }>).detail;
					/* v8 ignore next - detail fallback is defensive */
					onReconnectedRef.current?.(detail?.afterAttempts ?? 0);
				}
			});

			eventSource.addEventListener("reconnection_failed", () => {
				if (!cancelled.value) {
					onErrorRef.current?.(new Error("Connection failed after max retries"));
				}
			});

			subscriptionRef.current = { close: () => eventSource.close() };
		},
		[directSseUrl],
	);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const cancelled = { value: false };

		async function setup() {
			const mercureClient = createMercureClient(window.location.origin);

			// Try Mercure first
			if (await mercureClient.isEnabled()) {
				try {
					const subscription = await mercureClient.subscribe({
						type,
						...(id !== undefined && { id }),
						onMessage: data => {
							onMessageRef.current(data as T);
						},
						onError: err => {
							onErrorRef.current?.(err);
						},
						onReconnecting: attempt => {
							if (!cancelled.value) {
								setReconnecting(true);
								onReconnectingRef.current?.(attempt);
							}
						},
						onReconnected: attempts => {
							if (!cancelled.value) {
								setReconnecting(false);
								setConnected(true);
								onReconnectedRef.current?.(attempts);
							}
						},
					});

					if (!cancelled.value) {
						setUsingMercure(true);
						setConnected(true);
						subscriptionRef.current = subscription;
					} else {
						/* v8 ignore next 2 -- race condition guard: cleanup if unmounted during async setup */
						subscription.close();
					}
					return;
				} catch (err) {
					// Fall through to direct SSE
					log.warn(err, "Mercure subscription failed, falling back to SSE");
				}
			}

			// Fall back to direct SSE
			if (!cancelled.value) {
				setupDirectSse(cancelled);
			}
		}

		setup().then();

		return () => {
			cancelled.value = true;
			subscriptionRef.current?.close();
			subscriptionRef.current = null;
			setConnected(false);
			setReconnecting(false);
			setUsingMercure(false);
		};
	}, [type, id, directSseUrl, enabled, setupDirectSse]);

	return { connected, reconnecting, usingMercure };
}
