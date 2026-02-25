import type { ModelDef } from "../util/ModelDef";
import { DEFAULT_SPACE_FILTERS, type SpaceSortOption } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

export interface Space {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
	readonly jrn: string;
	/** Space description. null/undefined means no description. */
	readonly description: string | null | undefined;
	readonly ownerId: number;
	/** Whether this is a personal space (private to the owner). */
	readonly isPersonal: boolean;
	readonly defaultSort: SpaceSortOption;
	readonly defaultFilters: Record<string, unknown>;
	readonly deletedAt: Date | undefined;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewSpace = Omit<Space, "id" | "createdAt" | "updatedAt" | "jrn" | "deletedAt">;

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
		// Migration complete: all spaces have slugs, all creation paths generate slugs
		type: DataTypes.STRING(100),
		allowNull: false,
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
	},
	isPersonal: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	defaultSort: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "default",
	},
	defaultFilters: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: { ...DEFAULT_SPACE_FILTERS },
	},
	deletedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
};
