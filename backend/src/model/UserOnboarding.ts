/**
 * UserOnboarding Model - Stores onboarding state for each user.
 *
 * This model tracks a user's progress through the first-login onboarding flow,
 * including their selected goals, current step, and step-specific data.
 */

import type { ModelDef } from "../util/ModelDef";
import type { OnboardingGoals, OnboardingStatus, OnboardingStep, OnboardingStepData } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * UserOnboarding record as stored in the database.
 */
export interface UserOnboarding {
	readonly id: number;
	/** User ID from active_users table (unique per user) */
	readonly userId: number;
	/** Current onboarding step */
	readonly currentStep: OnboardingStep;
	/** Overall onboarding status */
	readonly status: OnboardingStatus;
	/** User's selected goals (JSONB) */
	readonly goals: OnboardingGoals;
	/** Step-specific data (JSONB) */
	readonly stepData: OnboardingStepData;
	/** Array of completed step names (JSONB) */
	readonly completedSteps: Array<OnboardingStep>;
	/** When onboarding was skipped */
	readonly skippedAt: Date | null;
	/** When onboarding was completed */
	readonly completedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Input for creating a new UserOnboarding record.
 */
export type NewUserOnboarding = Omit<UserOnboarding, "id" | "createdAt" | "updatedAt">;

/**
 * Defines the UserOnboarding model for Sequelize.
 *
 * Uses JSONB columns for flexible storage of goals, step data, and completed steps.
 * The userId column has a unique constraint to ensure one record per user.
 */
export function defineUserOnboarding(sequelize: Sequelize): ModelDef<UserOnboarding> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.userOnboarding;
	if (existing) {
		return existing as ModelDef<UserOnboarding>;
	}

	return sequelize.define("userOnboarding", schema, {
		timestamps: true,
		tableName: "user_onboarding",
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		unique: "user_onboarding_user_id_key",
		field: "user_id",
	},
	currentStep: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "welcome",
		field: "current_step",
	},
	status: {
		type: DataTypes.STRING(20),
		allowNull: false,
		defaultValue: "not_started",
	},
	goals: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: {},
	},
	stepData: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: {},
		field: "step_data",
	},
	completedSteps: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
		field: "completed_steps",
	},
	skippedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "skipped_at",
	},
	completedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "completed_at",
	},
};
