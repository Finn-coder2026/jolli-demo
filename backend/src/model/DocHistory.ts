import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * DocHistory stores versioned snapshots of documents.
 * Each snapshot contains a gzip-compressed JSON representation of the document state.
 */
export interface DocHistory {
	/** Auto-incrementing primary key */
	readonly id: number;
	/** Foreign key referencing the docs table */
	readonly docId: number;
	/** Foreign key referencing the users table - the user who committed this version */
	readonly userId: number;
	/** Gzip-compressed JSON snapshot of the document */
	readonly docSnapshot: Buffer;
	/** Version number of this snapshot */
	readonly version: number;
	/** Timestamp when this snapshot was created */
	readonly createdAt: Date;
}

/**
 * Fields required to create a new DocHistory record.
 */
export type NewDocHistory = Omit<DocHistory, "id" | "createdAt">;

/**
 * DocHistory without the docSnapshot field, used for listing/pagination.
 */
export type DocHistorySummary = Omit<DocHistory, "docSnapshot">;

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	docId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "docs",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "users",
			key: "id",
		},
	},
	docSnapshot: {
		type: DataTypes.BLOB,
		allowNull: false,
	},
	version: {
		type: DataTypes.INTEGER,
		allowNull: false,
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
	},
};

const indexes = [
	{
		fields: ["doc_id"],
	},
	{
		fields: ["doc_id", "version"],
		unique: true,
	},
];

/**
 * Define the DocHistory model for storing document version snapshots.
 */
export function defineDocHistories(sequelize: Sequelize): ModelDef<DocHistory> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.doc_history;
	if (existing) {
		return existing as ModelDef<DocHistory>;
	}
	return sequelize.define("doc_history", schema, {
		timestamps: false,
		indexes,
	});
}
