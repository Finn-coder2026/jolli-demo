/**
 * Onboarding Agent Module
 *
 * Provides FSM-powered onboarding for new users.
 */

export {
	createOnboardingAgentFsm,
	type OnboardingAgentFsm,
	type OnboardingAgentFsmConfig,
	type OnboardingAgentFsmDeps,
} from "./OnboardingAgentFsm";
export { createOnboardingRouter, type OnboardingRouterDeps } from "./OnboardingRouter";
export type {
	OnboardingTool,
	OnboardingToolContext,
	OnboardingToolDefinition,
	OnboardingToolExecutionResult,
	OnboardingToolHandler,
} from "./types";
