/**
 * Mock OnboardingClient for testing.
 */

import type { OnboardingClient } from "./OnboardingClient";
import type { GetOnboardingResponse, OnboardingActionResponse, OnboardingState } from "./types";

const mockState: OnboardingState = {
	id: 1,
	userId: 1,
	currentStep: "welcome",
	status: "not_started",
	goals: {},
	stepData: {},
	completedSteps: [],
	createdAt: new Date(),
	updatedAt: new Date(),
};

/**
 * Creates a mock OnboardingClient.
 */
export function mockOnboardingClient(): OnboardingClient {
	return {
		getState: async (): Promise<GetOnboardingResponse> => ({
			state: mockState,
			needsOnboarding: true,
		}),

		// biome-ignore lint/suspicious/useAwait: Mock generator doesn't need real async operations
		async *chat() {
			yield { type: "content", content: "Hello! Welcome to Jolli." };
			yield { type: "done", state: mockState };
		},

		skip: async (): Promise<OnboardingActionResponse> => ({
			success: true,
			state: { ...mockState, status: "skipped", skippedAt: new Date() },
		}),

		complete: async (): Promise<OnboardingActionResponse> => ({
			success: true,
			state: { ...mockState, status: "completed", completedAt: new Date() },
		}),

		restart: async (): Promise<OnboardingActionResponse> => ({
			success: true,
			state: { ...mockState, status: "in_progress" },
		}),
	};
}
