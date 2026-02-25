import type { ModelDef } from "../util/ModelDef";
import type { SourceCursor, SourceKind } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * A first-class source entity with its own identity and lifecycle.
 */
export interface Source {
	readonly id: number;
	readonly name: string;
	readonly type: SourceKind;
	readonly repo?: string;
	readonly branch?: string;
	readonly integrationId?: number;
	readonly enabled: boolean;
	readonly cursor?: SourceCursor;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewSource = Omit<Source, "id" | "createdAt" | "updatedAt">;

/**
 * Junction table: binds a source to a space.
 */
export interface SpaceSourceBinding {
	readonly spaceId: number;
	readonly sourceId: number;
	readonly jrnPattern?: string;
	readonly enabled: boolean;
	readonly createdAt: Date;
}

export function defineSources(sequelize: Sequelize): ModelDef<Source> {
	const existing = sequelize.models?.source;
	if (existing) {
		return existing as ModelDef<Source>;
	}
	return sequelize.define("source", sourceSchema, { timestamps: true, indexes: sourceIndexes });
}

export function defineSpaceSources(sequelize: Sequelize): ModelDef<SpaceSourceBinding> {
	const existing = sequelize.models?.space_source;
	if (existing) {
		return existing as ModelDef<SpaceSourceBinding>;
	}
	return sequelize.define("space_source", spaceSourceSchema, {
		timestamps: true,
		updatedAt: false,
		indexes: spaceSourceIndexes,
	});
}

const sourceIndexes = [
	{
		name: "sources_name_key",
		unique: true,
		fields: ["name"],
	},
];

const sourceSchema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	name: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	type: {
		type: DataTypes.STRING(50),
		allowNull: false,
	},
	repo: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	branch: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	integrationId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "integrations",
			key: "id",
		},
		onDelete: "SET NULL",
	},
	enabled: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: true,
	},
	cursor: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
};

const spaceSourceIndexes = [
	{
		name: "space_sources_space_source_key",
		unique: true,
		fields: ["space_id", "source_id"],
	},
];

const spaceSourceSchema = {
	spaceId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		primaryKey: true,
		references: {
			model: "spaces",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	sourceId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		primaryKey: true,
		references: {
			model: "sources",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	jrnPattern: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	enabled: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: true,
	},
};
