/**
 * Mock UserOnboardingDao for testing.
 */

import type { UserOnboarding } from "../model/UserOnboarding";
import type { UserOnboardingDao } from "./UserOnboardingDao";
import { vi } from "vitest";

/**
 * Creates a mock UserOnboardingDao.
 */
export function mockUserOnboardingDao(): UserOnboardingDao {
	const mockRecord: UserOnboarding = {
		id: 1,
		userId: 1,
		currentStep: "welcome",
		status: "not_started",
		goals: {},
		stepData: {},
		completedSteps: [],
		skippedAt: null,
		completedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	return {
		getByUserId: vi.fn().mockResolvedValue(mockRecord),
		create: vi.fn().mockResolvedValue(mockRecord),
		getOrCreate: vi.fn().mockResolvedValue(mockRecord),
		update: vi.fn().mockResolvedValue(mockRecord),
		skip: vi.fn().mockResolvedValue({ ...mockRecord, status: "skipped", skippedAt: new Date() }),
		complete: vi.fn().mockResolvedValue({ ...mockRecord, status: "completed", completedAt: new Date() }),
		restart: vi.fn().mockResolvedValue({ ...mockRecord, status: "in_progress" }),
		advanceStep: vi.fn().mockResolvedValue(mockRecord),
		updateStepData: vi.fn().mockResolvedValue(mockRecord),
		findByFsmStateAndRepo: vi.fn().mockResolvedValue([]),
	};
}
