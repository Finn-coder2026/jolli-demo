/**
 * Backend-specific types for the onboarding agent.
 */

import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import type { OnboardingStep, OnboardingStepData, OnboardingUIAction } from "jolli-common";

/**
 * Tool definition for the onboarding agent.
 */
export interface OnboardingToolDefinition {
	/** Tool name used by the LLM */
	name: string;
	/** Description of what the tool does */
	description: string;
	/** JSON schema for tool parameters */
	parameters: {
		type: "object";
		properties: Record<string, { type: string; description: string; enum?: Array<string> }>;
		required?: Array<string>;
	};
}

/**
 * Context passed to tool handlers.
 */
export interface OnboardingToolContext {
	/** Current user ID */
	userId: number;
	/** Current step data for reading */
	stepData: OnboardingStepData;
	/** Function to update step data */
	updateStepData: (data: Partial<OnboardingStepData>) => Promise<void>;
	/** Function to advance to next step */
	advanceStep: (nextStep: OnboardingStep) => Promise<void>;
	/** Function to complete onboarding */
	completeOnboarding: () => Promise<void>;
	/** Function to skip onboarding */
	skipOnboarding: () => Promise<void>;
	// Phase 3: Real DAO access for GitHub integration
	/** Integration DAO for accessing integrations */
	integrationDao: IntegrationDao;
	/** Doc DAO for creating articles */
	docDao: DocDao;
	/** GitHub Installation DAO for accessing installation info */
	githubInstallationDao: GitHubInstallationDao;
	/** Space DAO for accessing spaces */
	spaceDao: SpaceDao;
	// Phase 4: DAOs for smart import with update detection
	/** Doc Draft DAO for creating/managing drafts */
	docDraftDao: DocDraftDao;
	/** Section Changes DAO for creating section-by-section changes */
	docDraftSectionChangesDao: DocDraftSectionChangesDao;
	/** User Preference DAO for managing favorites */
	userPreferenceDao: UserPreferenceDao;
	// Phase 5: E2B sandbox configuration (for gap analysis and code-to-doc generation)
	/** E2B API key (optional, falls back to heuristic when not provided) */
	e2bApiKey?: string | undefined;
	/** E2B template ID (optional) */
	e2bTemplateId?: string | undefined;
	/** The user's current message (for chat-based repo selection matching) */
	userMessage?: string | undefined;
}

/**
 * Result from a tool execution.
 */
export interface OnboardingToolExecutionResult {
	/** Whether the tool executed successfully */
	success: boolean;
	/** Result content to send back to the LLM */
	content: string;
	/** Optional updated step data */
	stepData?: Partial<OnboardingStepData> | undefined;
	/** Optional UI action to trigger in the frontend */
	uiAction?: OnboardingUIAction | undefined;
}

/**
 * Tool handler function type. Can return synchronously or asynchronously.
 */
export type OnboardingToolHandler = (
	args: Record<string, unknown>,
	context: OnboardingToolContext,
) => Promise<OnboardingToolExecutionResult> | OnboardingToolExecutionResult;

/**
 * Complete tool definition with handler.
 */
export interface OnboardingTool {
	definition: OnboardingToolDefinition;
	handler: OnboardingToolHandler;
}
