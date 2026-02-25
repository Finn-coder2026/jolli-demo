import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export interface DocDraft {
	readonly id: number;
	readonly docId: number | undefined;
	readonly title: string;
	readonly content: string;
	readonly contentType: string;
	readonly createdBy: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly contentLastEditedAt: Date | null;
	readonly contentLastEditedBy: number | null;
	readonly contentMetadata: unknown | undefined;
	/** Whether this draft is shared with other users */
	readonly isShared: boolean;
	/** When the draft was shared (null if not shared) */
	readonly sharedAt: Date | null;
	/** User ID who shared the draft (null if not shared) */
	readonly sharedBy: number | null;
	/** Whether this draft was created by a Jolli Agent */
	readonly createdByAgent: boolean;
}

export type NewDocDraft = Omit<
	DocDraft,
	| "id"
	| "createdAt"
	| "updatedAt"
	| "contentLastEditedAt"
	| "contentLastEditedBy"
	| "contentMetadata"
	| "contentType"
	| "isShared"
	| "sharedAt"
	| "sharedBy"
	| "createdByAgent"
> & {
	contentType?: string;
	contentLastEditedAt?: Date | null;
	contentLastEditedBy?: number | null;
	contentMetadata?: unknown;
	isShared?: boolean;
	sharedAt?: Date | null;
	sharedBy?: number | null;
	createdByAgent?: boolean;
};

export function defineDocDrafts(sequelize: Sequelize): ModelDef<DocDraft> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.doc_draft;
	if (existing) {
		return existing as ModelDef<DocDraft>;
	}
	return sequelize.define("doc_draft", schema, { timestamps: true });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	docId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "docs",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	title: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	content: {
		type: DataTypes.TEXT,
		allowNull: false,
	},
	contentType: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "text/markdown",
	},
	createdBy: {
		type: DataTypes.INTEGER,
		allowNull: false,
	},
	contentLastEditedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	contentLastEditedBy: {
		type: DataTypes.INTEGER,
		allowNull: true,
	},
	contentMetadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	isShared: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	sharedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	sharedBy: {
		type: DataTypes.INTEGER,
		allowNull: true,
	},
	createdByAgent: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
};
