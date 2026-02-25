/**
 * UserOnboardingDao - Data Access Object for user onboarding state.
 *
 * Provides methods for creating, reading, and updating user onboarding records.
 * Each user has at most one onboarding record.
 */

import { defineUserOnboarding, type NewUserOnboarding, type UserOnboarding } from "../model/UserOnboarding";
import type { TenantOrgContext } from "../tenant/TenantContext";
import type { DaoProvider } from "./DaoProvider";
import type { OnboardingGoals, OnboardingStatus, OnboardingStep, OnboardingStepData } from "jolli-common";
import type { Sequelize } from "sequelize";

/**
 * Update input for modifying onboarding state.
 */
export interface UserOnboardingUpdate {
	currentStep?: OnboardingStep;
	status?: OnboardingStatus;
	goals?: OnboardingGoals;
	stepData?: OnboardingStepData;
	completedSteps?: Array<OnboardingStep>;
	skippedAt?: Date | null;
	completedAt?: Date | null;
}

/**
 * UserOnboardingDao interface.
 */
export interface UserOnboardingDao {
	/**
	 * Gets the onboarding state for a user.
	 * Returns undefined if user has no onboarding record.
	 */
	getByUserId(userId: number): Promise<UserOnboarding | undefined>;

	/**
	 * Creates a new onboarding record for a user.
	 * Will fail if user already has an onboarding record.
	 */
	create(data: NewUserOnboarding): Promise<UserOnboarding>;

	/**
	 * Creates or gets existing onboarding record for a user.
	 * Returns existing record if one exists, otherwise creates a new one.
	 */
	getOrCreate(userId: number): Promise<UserOnboarding>;

	/**
	 * Updates an onboarding record.
	 * Returns the updated record or undefined if not found.
	 */
	update(userId: number, data: UserOnboardingUpdate): Promise<UserOnboarding | undefined>;

	/**
	 * Marks onboarding as skipped for a user.
	 */
	skip(userId: number): Promise<UserOnboarding | undefined>;

	/**
	 * Marks onboarding as completed for a user.
	 */
	complete(userId: number): Promise<UserOnboarding | undefined>;

	/**
	 * Advances to the next onboarding step.
	 * Adds the current step to completedSteps and updates currentStep.
	 */
	advanceStep(userId: number, nextStep: OnboardingStep): Promise<UserOnboarding | undefined>;

	/**
	 * Updates step-specific data.
	 * Merges the provided data with existing stepData.
	 */
	updateStepData(userId: number, stepData: Partial<OnboardingStepData>): Promise<UserOnboarding | undefined>;

	/**
	 * Restarts the onboarding process for a user.
	 * Performs a soft reset: resets FSM state to WELCOME and status to in_progress
	 * while preserving existing progress data (connected repo, imported articles, etc.).
	 */
	restart(userId: number): Promise<UserOnboarding | undefined>;

	/**
	 * Finds onboarding records by FSM state(s) and connected repo.
	 * Used by the webhook listener to find users awaiting sync detection.
	 * Accepts a single state or an array of states to match.
	 */
	findByFsmStateAndRepo(fsmState: string | Array<string>, connectedRepo: string): Promise<Array<UserOnboarding>>;
}

/**
 * Creates a UserOnboardingDao instance.
 */
export function createUserOnboardingDao(sequelize: Sequelize): UserOnboardingDao {
	const UserOnboardings = defineUserOnboarding(sequelize);

	return {
		getByUserId,
		create,
		getOrCreate,
		update,
		skip,
		complete,
		restart,
		advanceStep,
		updateStepData,
		findByFsmStateAndRepo,
	};

	async function getByUserId(userId: number): Promise<UserOnboarding | undefined> {
		const record = await UserOnboardings.findOne({ where: { userId } });
		return record ? record.get({ plain: true }) : undefined;
	}

	async function create(data: NewUserOnboarding): Promise<UserOnboarding> {
		// biome-ignore lint/suspicious/noExplicitAny: Sequelize auto-generates id, createdAt, updatedAt
		return (await UserOnboardings.create(data as any)).get({ plain: true });
	}

	async function getOrCreate(userId: number): Promise<UserOnboarding> {
		const existing = await getByUserId(userId);
		if (existing) {
			return existing;
		}

		// Create new record with default values
		return create({
			userId,
			currentStep: "welcome",
			status: "not_started",
			goals: {},
			stepData: {},
			completedSteps: [],
			skippedAt: null,
			completedAt: null,
		});
	}

	async function update(userId: number, data: UserOnboardingUpdate): Promise<UserOnboarding | undefined> {
		await UserOnboardings.update(data, { where: { userId } });
		return getByUserId(userId);
	}

	function skip(userId: number): Promise<UserOnboarding | undefined> {
		return update(userId, {
			status: "skipped",
			skippedAt: new Date(),
		});
	}

	function complete(userId: number): Promise<UserOnboarding | undefined> {
		return update(userId, {
			status: "completed",
			currentStep: "complete",
			completedAt: new Date(),
		});
	}

	async function restart(userId: number): Promise<UserOnboarding | undefined> {
		const current = await getByUserId(userId);
		if (!current) {
			return;
		}

		// Soft reset: keep existing progress data but reset FSM state
		const stepData: OnboardingStepData = {
			...current.stepData,
			fsmState: "WELCOME",
		};

		return update(userId, {
			currentStep: "welcome",
			status: "in_progress",
			stepData,
			completedSteps: [],
			skippedAt: null,
			completedAt: null,
		});
	}

	async function advanceStep(userId: number, nextStep: OnboardingStep): Promise<UserOnboarding | undefined> {
		const current = await getByUserId(userId);
		if (!current) {
			return;
		}

		// Add current step to completed steps if not already there
		const completedSteps = [...current.completedSteps];
		if (!completedSteps.includes(current.currentStep)) {
			completedSteps.push(current.currentStep);
		}

		return update(userId, {
			currentStep: nextStep,
			status: "in_progress",
			completedSteps,
		});
	}

	async function updateStepData(
		userId: number,
		stepData: Partial<OnboardingStepData>,
	): Promise<UserOnboarding | undefined> {
		const current = await getByUserId(userId);
		if (!current) {
			return;
		}

		// Merge new data with existing stepData
		const mergedStepData = {
			...current.stepData,
			...stepData,
		};

		return update(userId, { stepData: mergedStepData });
	}

	async function findByFsmStateAndRepo(
		fsmState: string | Array<string>,
		connectedRepo: string,
	): Promise<Array<UserOnboarding>> {
		// Query all in_progress records and filter by stepData fields in code.
		// There are typically very few concurrent onboarding sessions, so this is efficient.
		const records = await UserOnboardings.findAll({
			where: { status: "in_progress" },
		});
		const states = Array.isArray(fsmState) ? fsmState : [fsmState];
		return records
			.map(r => r.get({ plain: true }))
			.filter(r => states.includes(r.stepData?.fsmState ?? "") && r.stepData?.connectedRepo === connectedRepo);
	}
}

/**
 * Creates a DaoProvider for multi-tenant support.
 */
export function createUserOnboardingDaoProvider(defaultDao: UserOnboardingDao): DaoProvider<UserOnboardingDao> {
	return {
		getDao(context: TenantOrgContext | undefined): UserOnboardingDao {
			return context?.database.userOnboardingDao ?? defaultDao;
		},
	};
}
