/**
 * Shared test utilities for onboarding tool tests.
 *
 * Provides a factory that creates a fully mocked OnboardingToolContext,
 * avoiding ~40 lines of duplicated mock setup in every tool test file.
 */

import type { OnboardingToolContext } from "../types";
import type { OnboardingStepData } from "jolli-common";
import { vi } from "vitest";

/**
 * Create a mock OnboardingToolContext for tool tests.
 *
 * All DAOs are pre-configured with reasonable defaults. Callers can
 * override individual DAO methods after creation.
 */
export function createMockToolContext(stepData: Partial<OnboardingStepData> = {}): OnboardingToolContext {
	return {
		userId: 1,
		stepData: stepData as OnboardingStepData,
		updateStepData: vi.fn().mockResolvedValue(undefined),
		advanceStep: vi.fn().mockResolvedValue(undefined),
		completeOnboarding: vi.fn().mockResolvedValue(undefined),
		skipOnboarding: vi.fn().mockResolvedValue(undefined),
		integrationDao: {
			listIntegrations: vi.fn().mockResolvedValue([]),
			getIntegration: vi.fn().mockResolvedValue(null),
			createIntegration: vi.fn().mockResolvedValue({ id: 1 }),
		} as unknown as OnboardingToolContext["integrationDao"],
		docDao: {
			createDoc: vi.fn().mockResolvedValue({ id: 1, jrn: "jrn:test:doc/test" }),
			findDocBySourcePathAnySpace: vi.fn().mockResolvedValue(undefined),
		} as unknown as OnboardingToolContext["docDao"],
		githubInstallationDao: {
			listInstallations: vi.fn().mockResolvedValue([]),
			lookupByInstallationId: vi.fn().mockResolvedValue(null),
		} as unknown as OnboardingToolContext["githubInstallationDao"],
		spaceDao: {
			getDefaultSpace: vi.fn().mockResolvedValue({ id: 1, name: "Default Space" }),
			createDefaultSpaceIfNeeded: vi.fn().mockResolvedValue({ id: 1, name: "Default Space" }),
			getSpaceBySlug: vi.fn().mockResolvedValue(null),
			createSpace: vi.fn().mockResolvedValue({ id: 2, name: "new-space", slug: "new-space" }),
		} as unknown as OnboardingToolContext["spaceDao"],
		docDraftDao: {
			createDocDraft: vi.fn().mockResolvedValue({ id: 1 }),
			findDraftByDocId: vi.fn().mockResolvedValue(undefined),
		} as unknown as OnboardingToolContext["docDraftDao"],
		docDraftSectionChangesDao: {
			createDocDraftSectionChanges: vi.fn().mockResolvedValue({ id: 1 }),
			findByDraftId: vi.fn().mockResolvedValue([]),
		} as unknown as OnboardingToolContext["docDraftSectionChangesDao"],
		userPreferenceDao: {
			getPreference: vi.fn().mockResolvedValue(undefined),
			getHash: vi.fn().mockResolvedValue("0000000000000000"),
			upsertPreference: vi.fn().mockResolvedValue({}),
		} as unknown as OnboardingToolContext["userPreferenceDao"],
	};
}
