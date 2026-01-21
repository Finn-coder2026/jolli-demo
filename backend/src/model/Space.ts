import type { ModelDef } from "../util/ModelDef";
import type { SpaceSortOption } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

export interface Space {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly jrn: string;
	readonly description: string | undefined;
	readonly ownerId: number;
	readonly defaultSort: SpaceSortOption;
	readonly defaultFilters: Record<string, unknown>;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewSpace = Omit<Space, "id" | "createdAt" | "updatedAt" | "jrn">;

export function defineSpaces(sequelize: Sequelize): ModelDef<Space> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.space;
	if (existing) {
		return existing as ModelDef<Space>;
	}
	return sequelize.define("space", schema, { timestamps: true });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	slug: {
		// allowNull: true initially to allow migration of existing data
		// SpaceDao.postSync will populate NULL slugs and add NOT NULL constraint
		type: DataTypes.STRING(100),
		allowNull: true,
		unique: "spaces_slug_key",
	},
	jrn: {
		type: DataTypes.STRING,
		allowNull: false,
		unique: "spaces_jrn_key",
	},
	description: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	ownerId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "users",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	defaultSort: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "default",
	},
	defaultFilters: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: {},
	},
};
