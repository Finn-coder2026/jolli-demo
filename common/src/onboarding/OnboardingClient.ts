/**
 * OnboardingClient - API client for onboarding endpoints.
 *
 * Provides methods for interacting with the onboarding API,
 * including chat with SSE streaming support.
 */

import type { ClientAuth } from "../core/Client";
import type {
	GetOnboardingResponse,
	OnboardingActionResponse,
	OnboardingChatMessage,
	OnboardingChatRequest,
	OnboardingSSEEvent,
} from "./types";

/**
 * Onboarding API client interface.
 */
export interface OnboardingClient {
	/**
	 * Get the current onboarding state for the user.
	 */
	getState(): Promise<GetOnboardingResponse>;

	/**
	 * Chat with the onboarding agent.
	 * Returns an async generator that yields SSE events.
	 */
	chat(message: string, history?: Array<OnboardingChatMessage>): AsyncGenerator<OnboardingSSEEvent, void, unknown>;

	/**
	 * Skip the onboarding process.
	 */
	skip(): Promise<OnboardingActionResponse>;

	/**
	 * Complete the onboarding process.
	 */
	complete(): Promise<OnboardingActionResponse>;

	/**
	 * Restart the onboarding process (soft reset).
	 * Resets FSM state while preserving existing progress data.
	 */
	restart(): Promise<OnboardingActionResponse>;
}

/**
 * Creates an OnboardingClient instance.
 */
export function createOnboardingClient(baseUrl: string, auth: ClientAuth): OnboardingClient {
	return {
		getState,
		chat,
		skip,
		complete,
		restart,
	};

	async function getState(): Promise<GetOnboardingResponse> {
		const response = await fetch(`${baseUrl}/api/onboarding`, auth.createRequest("GET"));

		if (auth.checkUnauthorized?.(response)) {
			throw new Error("Unauthorized");
		}

		if (!response.ok) {
			throw new Error("Failed to get onboarding state");
		}

		return response.json() as Promise<GetOnboardingResponse>;
	}

	async function* chat(
		message: string,
		history: Array<OnboardingChatMessage> = [],
	): AsyncGenerator<OnboardingSSEEvent, void, unknown> {
		const body: OnboardingChatRequest = { message, history };

		const response = await fetch(`${baseUrl}/api/onboarding/chat`, auth.createRequest("POST", body));

		if (auth.checkUnauthorized?.(response)) {
			throw new Error("Unauthorized");
		}

		if (!response.ok) {
			throw new Error("Failed to start chat");
		}

		if (!response.body) {
			throw new Error("No response body");
		}

		// Read SSE stream
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				// Process complete lines
				const lines = buffer.split("\n");
				// lines.pop() is safe here - split always returns at least one element
				buffer = lines.pop() as string;

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).trim();

						// Check for end of stream
						if (data === "[DONE]") {
							return;
						}

						// Parse and yield event
						try {
							const event = JSON.parse(data) as OnboardingSSEEvent;
							yield event;
						} catch {
							// Skip invalid JSON
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	/**
	 * Shared helper for POST action endpoints (skip, complete, restart).
	 */
	async function postAction(action: string): Promise<OnboardingActionResponse> {
		const response = await fetch(`${baseUrl}/api/onboarding/${action}`, auth.createRequest("POST"));

		if (auth.checkUnauthorized?.(response)) {
			throw new Error("Unauthorized");
		}

		if (!response.ok) {
			throw new Error(`Failed to ${action} onboarding`);
		}

		return response.json() as Promise<OnboardingActionResponse>;
	}

	function skip(): Promise<OnboardingActionResponse> {
		return postAction("skip");
	}

	function complete(): Promise<OnboardingActionResponse> {
		return postAction("complete");
	}

	function restart(): Promise<OnboardingActionResponse> {
		return postAction("restart");
	}
}
