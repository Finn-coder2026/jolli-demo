import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * User preferences for favorites.
 * Stores favorite spaces and sites per user, scoped to tenant-org.
 */
export interface UserPreference {
	readonly userId: number;
	readonly favoriteSpaces: Array<number>;
	readonly favoriteSites: Array<number>;
	readonly hash: string;
	readonly updatedAt: Date;
}

export type NewUserPreference = Omit<UserPreference, "updatedAt">;

/**
 * Update fields for user preferences.
 * All fields are optional to allow partial updates.
 */
export interface UserPreferenceUpdate {
	favoriteSpaces?: Array<number>;
	favoriteSites?: Array<number>;
}

/** Special hash value indicating user has no preferences record */
export const EMPTY_PREFERENCES_HASH = "EMPTY";

export function defineUserPreferences(sequelize: Sequelize): ModelDef<UserPreference> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.user_preference;
	if (existing) {
		return existing as ModelDef<UserPreference>;
	}
	return sequelize.define("user_preference", schema, {
		timestamps: true,
		createdAt: false, // Only updatedAt, no createdAt
	});
}

const schema = {
	userId: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		allowNull: false,
	},
	favoriteSpaces: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
	favoriteSites: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
	hash: {
		type: DataTypes.STRING(16),
		allowNull: false,
	},
};
