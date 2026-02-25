import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Types of edits that can be recorded in draft history
 */
export type DocDraftEditType = "content" | "title" | "section_apply" | "section_dismiss";

/**
 * Represents an edit history entry for a document draft
 */
export interface DocDraftEditHistory {
	readonly id: number;
	/** The draft this history entry belongs to */
	readonly draftId: number;
	/** The user who made the edit */
	readonly userId: number;
	/** The type of edit that was made */
	readonly editType: DocDraftEditType;
	/** A brief description of the edit */
	readonly description: string;
	/** When the edit was made */
	readonly editedAt: Date;
	/** When the history entry was created */
	readonly createdAt: Date;
}

/**
 * Type for creating a new edit history entry
 */
export type NewDocDraftEditHistory = Omit<DocDraftEditHistory, "id" | "createdAt">;

export function defineDocDraftEditHistory(sequelize: Sequelize): ModelDef<DocDraftEditHistory> {
	const existing = sequelize.models?.doc_draft_edit_history;
	if (existing) {
		return existing as ModelDef<DocDraftEditHistory>;
	}
	return sequelize.define("doc_draft_edit_history", schema, { timestamps: true, updatedAt: false });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	draftId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "doc_drafts",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
	},
	editType: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	description: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	editedAt: {
		type: DataTypes.DATE,
		allowNull: false,
	},
};
