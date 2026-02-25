/**
 * Onboarding Module - Types and client for first-login onboarding.
 */

export { createOnboardingClient, type OnboardingClient } from "./OnboardingClient";
export { mockOnboardingClient } from "./OnboardingClient.mock";
export type {
	GetOnboardingResponse,
	NewOnboardingState,
	OnboardingActionResponse,
	OnboardingChatAction,
	OnboardingChatMessage,
	OnboardingChatRequest,
	OnboardingDocAction,
	OnboardingFsmState,
	OnboardingFsmTransition,
	OnboardingGapAnalysisResult,
	OnboardingGoals,
	OnboardingJob,
	OnboardingJobIcon,
	OnboardingJobStatus,
	OnboardingJobsStatus,
	OnboardingSSEEvent,
	OnboardingSSEEventType,
	OnboardingState,
	OnboardingStatus,
	OnboardingStep,
	OnboardingStepData,
	OnboardingToolCall,
	OnboardingToolResult,
	OnboardingUIAction,
	OnboardingUIActionType,
} from "./types";
