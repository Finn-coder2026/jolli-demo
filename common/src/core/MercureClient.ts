/// <reference path="../types/dom.d.ts" />

import { createResilientEventSource, type ResilientEventSourceConfig } from "./CollabConvoClient";

/**
 * Mercure configuration returned from the backend
 */
export interface MercureConfig {
	enabled: boolean;
	hubUrl: string | null;
}

/**
 * Token response from the backend
 */
export interface MercureTokenResponse {
	token: string;
	topics: Array<string>;
}

/**
 * Options for subscribing to Mercure events
 */
export interface MercureSubscribeOptions {
	/** Type of subscription: jobs, draft, convo, or onboarding */
	type: "jobs" | "draft" | "convo" | "onboarding";
	/** Resource ID (required for draft, convo, and onboarding types) */
	id?: number;
	/** Callback for incoming messages */
	onMessage: (data: unknown) => void;
	/** Callback for errors */
	onError?: (error: Error) => void;
	/** Callback when reconnecting */
	onReconnecting?: (attempt: number) => void;
	/** Callback when reconnected */
	onReconnected?: (afterAttempts: number) => void;
	/** Configuration for resilient EventSource */
	resilientConfig?: ResilientEventSourceConfig;
}

/**
 * Subscription handle returned from subscribe()
 */
export interface MercureSubscription {
	/** Close the subscription */
	close: () => void;
}

/**
 * Frontend client for Mercure Hub subscriptions.
 *
 * Provides methods to:
 * - Check if Mercure is enabled
 * - Subscribe to Mercure topics with automatic reconnection
 * - Get Mercure configuration from the backend
 */
export interface MercureClient {
	/** Get Mercure configuration from the backend */
	getConfig(): Promise<MercureConfig>;
	/** Check if Mercure is enabled */
	isEnabled(): Promise<boolean>;
	/** Subscribe to Mercure events */
	subscribe(options: MercureSubscribeOptions): Promise<MercureSubscription>;
}

/**
 * Creates a Mercure client for frontend subscriptions.
 *
 * @param baseUrl Base URL of the backend API (e.g., window.location.origin)
 */
export function createMercureClient(baseUrl: string): MercureClient {
	let configCache: MercureConfig | null = null;

	return {
		getConfig,
		isEnabled,
		subscribe,
	};

	/**
	 * Fetches Mercure configuration from the backend.
	 * Results are cached for the lifetime of the client.
	 */
	async function getConfig(): Promise<MercureConfig> {
		if (configCache) {
			return configCache;
		}

		try {
			const response = await fetch(`${baseUrl}/api/mercure/config`, {
				method: "GET",
				credentials: "include",
			});

			if (!response.ok) {
				return { enabled: false, hubUrl: null };
			}

			configCache = (await response.json()) as MercureConfig;
			return configCache;
		} catch {
			return { enabled: false, hubUrl: null };
		}
	}

	/**
	 * Checks if Mercure is enabled and properly configured.
	 */
	async function isEnabled(): Promise<boolean> {
		const config = await getConfig();
		return config.enabled && !!config.hubUrl;
	}

	/**
	 * Requests a subscriber token from the backend.
	 */
	async function getSubscriberToken(
		type: "jobs" | "draft" | "convo" | "onboarding",
		id?: number,
	): Promise<MercureTokenResponse> {
		const response = await fetch(`${baseUrl}/api/mercure/token`, {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ type, id }),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: "Unknown error" }));
			throw new Error((error as { error?: string }).error || "Failed to get Mercure subscriber token");
		}

		return (await response.json()) as MercureTokenResponse;
	}

	/**
	 * Subscribes to Mercure events for the specified resource.
	 *
	 * Uses the createResilientEventSource wrapper for automatic reconnection
	 * with exponential backoff.
	 */
	async function subscribe(options: MercureSubscribeOptions): Promise<MercureSubscription> {
		const config = await getConfig();

		if (!config.enabled || !config.hubUrl) {
			throw new Error("Mercure is not enabled");
		}

		// Get subscriber token from backend
		const { token, topics } = await getSubscriberToken(options.type, options.id);

		// Build Mercure subscription URL
		const url = new URL(config.hubUrl);
		for (const topic of topics) {
			url.searchParams.append("topic", topic);
		}
		// Add authorization via URL parameter (Mercure supports this)
		url.searchParams.set("authorization", token);

		// Create resilient EventSource connection
		const eventSource = createResilientEventSource(url.toString(), {}, options.resilientConfig);

		// Handle incoming messages
		eventSource.addEventListener("message", (event: Event) => {
			try {
				const customEvent = event as CustomEvent<{ data?: string }>;
				// createResilientEventSource wraps in { detail: { data } }, but fall back to MessageEvent.data
				const rawData = customEvent.detail?.data ?? (event as MessageEvent).data;
				if (rawData) {
					const data = JSON.parse(rawData);
					options.onMessage(data);
				}
			} catch (error) {
				options.onError?.(error instanceof Error ? error : new Error("Failed to parse message"));
			}
		});

		// Handle reconnection events
		if (options.onReconnecting) {
			eventSource.addEventListener("reconnecting", (event: Event) => {
				const customEvent = event as CustomEvent<{ attempt: number }>;
				options.onReconnecting?.(customEvent.detail?.attempt ?? 0);
			});
		}

		if (options.onReconnected) {
			eventSource.addEventListener("reconnected", (event: Event) => {
				const customEvent = event as CustomEvent<{ afterAttempts: number }>;
				options.onReconnected?.(customEvent.detail?.afterAttempts ?? 0);
			});
		}

		// Handle connection failures
		eventSource.addEventListener("reconnection_failed", () => {
			options.onError?.(new Error("Mercure connection failed after max retries"));
		});

		return {
			close: () => eventSource.close(),
		};
	}
}
