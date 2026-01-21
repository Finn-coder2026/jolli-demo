import type { ModelDef } from "../util/ModelDef";
import type { SpaceSortOption } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

export interface UserSpacePreference {
	readonly id: number;
	readonly userId: number;
	readonly spaceId: number;
	readonly sort: SpaceSortOption | undefined;
	readonly filters: Record<string, unknown> | undefined;
	readonly expandedFolders: Array<number>;
	readonly updatedAt: Date;
}

export type NewUserSpacePreference = Omit<UserSpacePreference, "id" | "updatedAt">;

export function defineUserSpacePreferences(sequelize: Sequelize): ModelDef<UserSpacePreference> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.user_space_preference;
	if (existing) {
		return existing as ModelDef<UserSpacePreference>;
	}
	return sequelize.define("user_space_preference", schema, {
		timestamps: true,
		createdAt: false, // Only updatedAt, no createdAt
		indexes: [
			{
				unique: true,
				fields: ["user_id", "space_id"],
				name: "idx_user_space_prefs",
			},
		],
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
		references: {
			model: "users",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	spaceId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "spaces",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	sort: {
		type: DataTypes.STRING(50),
		allowNull: true,
	},
	filters: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	expandedFolders: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
};
