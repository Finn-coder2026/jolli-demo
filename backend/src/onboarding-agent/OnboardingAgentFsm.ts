/**
 * OnboardingAgentFsm - FSM-based onboarding agent.
 *
 * Uses a deterministic finite state machine for onboarding flow control.
 * The LLM is only used for intent classification of ambiguous messages
 * (via IntentClassifier.ts).
 *
 * The agent:
 * 1. Reads fsmState from stepData (or derives it for backward compat)
 * 2. Classifies the user's intent via pattern matching + LLM fallback
 * 3. Calls OnboardingFsm.transition() to get the next state + events
 * 4. Persists the new fsmState to stepData
 * 5. Yields SSE events
 */

import type { DocDao } from "../dao/DocDao";
import type { DocDraftDao } from "../dao/DocDraftDao";
import type { DocDraftSectionChangesDao } from "../dao/DocDraftSectionChangesDao";
import type { GitHubInstallationDao } from "../dao/GitHubInstallationDao";
import type { IntegrationDao } from "../dao/IntegrationDao";
import type { SpaceDao } from "../dao/SpaceDao";
import type { UserOnboardingDao } from "../dao/UserOnboardingDao";
import type { UserPreferenceDao } from "../dao/UserPreferenceDao";
import { getLog } from "../util/Logger";
import { classifyIntent, type IntentClassifierConfig } from "./IntentClassifier";
import { deriveFsmStateFromStepData, transition } from "./OnboardingFsm";
import type { OnboardingToolContext } from "./types";
import type {
	OnboardingChatMessage,
	OnboardingFsmState,
	OnboardingSSEEvent,
	OnboardingState,
	OnboardingStep,
	OnboardingStepData,
} from "jolli-common";

const log = getLog(import.meta);

/**
 * Auto-states are states that don't wait for user input and should be
 * processed immediately. When a transition returns an auto-state, the
 * agent loops and processes it, yielding events in between so the SSE
 * stream delivers intermediate progress to the client.
 */
const AUTO_STATES: ReadonlySet<OnboardingFsmState> = new Set([
	"GITHUB_CHECK",
	"REPO_SCANNING",
	"SPACE_CREATING",
	"IMPORTING",
	"GAP_ANALYZING",
	"GENERATING",
	"SYNC_CHECKING",
	"COMPLETING",
]);

/**
 * Configuration for the FSM-based onboarding agent.
 */
export interface OnboardingAgentFsmConfig {
	/** Anthropic API key for intent classification LLM fallback (optional — pattern matching works without it) */
	apiKey?: string;
	/** Model to use for intent classification (default: claude-haiku-4-5-20251001) */
	model?: string;
}

/**
 * Dependencies for the FSM-based onboarding agent.
 */
export interface OnboardingAgentFsmDeps {
	/** User onboarding DAO for state persistence */
	userOnboardingDao: UserOnboardingDao;
	/** Current user ID */
	userId: number;
	/** Integration DAO for accessing integrations */
	integrationDao?: IntegrationDao;
	/** Doc DAO for creating articles */
	docDao?: DocDao;
	/** GitHub Installation DAO for accessing installation info */
	githubInstallationDao?: GitHubInstallationDao;
	/** Space DAO for accessing spaces */
	spaceDao?: SpaceDao;
	/** Doc Draft DAO for creating/managing drafts */
	docDraftDao?: DocDraftDao;
	/** Section Changes DAO for creating section-by-section changes */
	docDraftSectionChangesDao?: DocDraftSectionChangesDao;
	/** User Preference DAO for managing favorites */
	userPreferenceDao?: UserPreferenceDao;
	/** E2B API key (optional) */
	e2bApiKey?: string;
	/** E2B template ID (optional) */
	e2bTemplateId?: string;
}

/**
 * Creates an FSM-based onboarding agent instance.
 */
export function createOnboardingAgentFsm(config: OnboardingAgentFsmConfig, deps: OnboardingAgentFsmDeps) {
	const {
		userOnboardingDao,
		userId,
		integrationDao,
		docDao,
		githubInstallationDao,
		spaceDao,
		docDraftDao,
		docDraftSectionChangesDao,
		userPreferenceDao,
		e2bApiKey,
		e2bTemplateId,
	} = deps;

	const classifierConfig: IntentClassifierConfig = {
		...(config.apiKey && { apiKey: config.apiKey }),
		...(config.model && { model: config.model }),
	};

	return {
		/**
		 * Process a chat message and stream the response.
		 * Yields SSE events as the FSM processes the message.
		 */
		async *chat(
			message: string,
			_history: Array<OnboardingChatMessage> = [],
		): AsyncGenerator<OnboardingSSEEvent, void, unknown> {
			try {
				// Get current state
				const currentRecord = await userOnboardingDao.getByUserId(userId);
				const currentStepData: OnboardingStepData = currentRecord?.stepData ?? {};

				// Derive FSM state
				let fsmState = deriveFsmStateFromStepData(currentStepData);

				// Create tool context with the user's message for chat-based matching
				const toolContext = createToolContext(currentStepData, message);

				// Classify user intent
				const intent = await classifyIntent(message, classifierConfig);
				log.info(
					"Onboarding FSM: userId=%d, state=%s, intent=%s, message=%s",
					userId,
					fsmState,
					intent,
					message.substring(0, 50),
				);

				// Run FSM transition
				let result = await transition(fsmState, intent, toolContext);

				// Persist new FSM state
				await userOnboardingDao.updateStepData(userId, { fsmState: result.newState });

				// Emit FSM transition event for dev-mode logging
				yield {
					type: "fsm_transition",
					fsmTransition: {
						from: fsmState,
						to: result.newState,
						intent,
						timestamp: new Date().toISOString(),
					},
				};

				// Yield all events
				for (const event of result.events) {
					yield event;
				}

				// Auto-state loop: if the FSM returned an auto-state, process it
				// immediately so the client sees intermediate progress via SSE.
				while (AUTO_STATES.has(result.newState)) {
					fsmState = result.newState;
					result = await transition(fsmState, "confirm", toolContext);
					await userOnboardingDao.updateStepData(userId, { fsmState: result.newState });

					yield {
						type: "fsm_transition",
						fsmTransition: {
							from: fsmState,
							to: result.newState,
							intent: "confirm",
							timestamp: new Date().toISOString(),
						},
					};

					for (const event of result.events) {
						yield event;
					}
				}

				// Get final state and yield done event
				const record = await userOnboardingDao.getByUserId(userId);
				const finalState = record ? mapToOnboardingState(record) : undefined;
				if (finalState) {
					yield { type: "done", state: finalState };
				}
			} catch (error) {
				log.error(error, "Onboarding FSM agent error");
				yield {
					type: "error",
					error: error instanceof Error ? error.message : "Unknown error",
				};
			}
		},
	};

	/**
	 * Create tool context for executing tool handlers.
	 */
	function createToolContext(currentStepData: OnboardingStepData, userMessage?: string): OnboardingToolContext {
		// Create stub DAOs for when real DAOs are not provided
		const stubIntegrationDao = {
			listIntegrations: () => Promise.resolve([]),
			getIntegration: () => Promise.resolve(null),
		} as unknown as IntegrationDao;

		const stubDocDao = {
			createDoc: () => Promise.resolve({ id: 0 } as never),
			findDocBySourcePathAnySpace: (_sourcePath?: string, _integrationId?: number) => Promise.resolve(undefined),
		} as unknown as DocDao;

		const stubGithubInstallationDao = {
			listInstallations: () => Promise.resolve([]),
			lookupByInstallationId: () => Promise.resolve(null),
		} as unknown as GitHubInstallationDao;

		const stubSpaceDao = {
			getDefaultSpace: () => Promise.resolve(null),
			createDefaultSpaceIfNeeded: () => Promise.resolve({ id: 1 } as never),
			getSpaceBySlug: () => Promise.resolve(null),
			createSpace: () => Promise.resolve({ id: 1, name: "default" } as never),
		} as unknown as SpaceDao;

		const stubDocDraftDao = {
			createDocDraft: () => Promise.resolve({ id: 0 } as never),
			findDraftByDocId: () => Promise.resolve(undefined),
		} as unknown as DocDraftDao;

		const stubDocDraftSectionChangesDao = {
			createDocDraftSectionChanges: () => Promise.resolve({ id: 0 } as never),
			findByDraftId: () => Promise.resolve([]),
		} as unknown as DocDraftSectionChangesDao;

		const stubUserPreferenceDao = {
			getPreference: () => Promise.resolve(undefined),
			getHash: () => Promise.resolve("0000000000000000"),
			upsertPreference: (_userId: number, updates: Record<string, unknown>) =>
				Promise.resolve({ userId: _userId, ...updates, hash: "stub" } as never),
		} as unknown as UserPreferenceDao;

		return {
			userId,
			stepData: currentStepData,
			...(userMessage && { userMessage }),
			updateStepData: async (data: Partial<OnboardingStepData>) => {
				await userOnboardingDao.updateStepData(userId, data);
				// Also update local stepData so the FSM sees changes within the same transition
				Object.assign(currentStepData, data);
			},
			advanceStep: async (nextStep: OnboardingStep) => {
				await userOnboardingDao.advanceStep(userId, nextStep);
			},
			completeOnboarding: async () => {
				await userOnboardingDao.complete(userId);
			},
			skipOnboarding: async () => {
				await userOnboardingDao.skip(userId);
			},
			integrationDao: integrationDao ?? stubIntegrationDao,
			docDao: docDao ?? stubDocDao,
			githubInstallationDao: githubInstallationDao ?? stubGithubInstallationDao,
			spaceDao: spaceDao ?? stubSpaceDao,
			docDraftDao: docDraftDao ?? stubDocDraftDao,
			docDraftSectionChangesDao: docDraftSectionChangesDao ?? stubDocDraftSectionChangesDao,
			userPreferenceDao: userPreferenceDao ?? stubUserPreferenceDao,
			e2bApiKey,
			e2bTemplateId,
		};
	}

	/**
	 * Map database record to OnboardingState.
	 */
	function mapToOnboardingState(
		record: Awaited<ReturnType<typeof userOnboardingDao.getByUserId>>,
	): OnboardingState | undefined {
		if (!record) {
			return;
		}
		return {
			id: record.id,
			userId: record.userId,
			currentStep: record.currentStep,
			status: record.status,
			goals: record.goals,
			stepData: record.stepData,
			completedSteps: record.completedSteps,
			skippedAt: record.skippedAt ?? undefined,
			completedAt: record.completedAt ?? undefined,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};
	}
}

/**
 * Type for the FSM-based onboarding agent.
 */
export type OnboardingAgentFsm = ReturnType<typeof createOnboardingAgentFsm>;
