import type { ModelDef } from "../util/ModelDef";
import type { DocDraftSectionChange, DocDraftSectionChangeType, DocDraftSectionComment } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Represents 1 or more proposed changes to a section of a Doc Draft.
 */
export interface DocDraftSectionChanges {
	/**
	 * auto-generated daft changes id.
	 */
	readonly id: number;
	/**
	 * ID of the draft the section changes are for
	 */
	readonly draftId: number;
	/**
	 * ID of the article being edited (from the parent draft's docId).
	 * This field is denormalized from doc_drafts.docId for referential integrity.
	 * Section changes can ONLY exist for drafts that edit existing articles.
	 */
	readonly docId: number;
	/**
	 * The type of section change being made (insert-before, insert-after, update, or delete).
	 */
	readonly changeType: DocDraftSectionChangeType;
	/**
	 * Path to locate the relative section within the draft doc to make the change to/before/after.
	 * @deprecated Use sectionId instead. This field is kept for backward compatibility.
	 */
	readonly path: string;
	/**
	 * Stable UUID identifier for the section.
	 * This ID persists even when sections are reordered or deleted.
	 */
	readonly sectionId?: string;
	/**
	 * The base content of the section when this change was created.
	 * Used for three-way merge conflict resolution.
	 */
	readonly baseContent?: string;
	/**
	 * The original content of the section. This is only set if this is a section update.
	 */
	readonly content?: string;
	/**
	 * The proposed change or changes suggested by the agent for this section.
	 * Will be empty if this is for a section delete.
	 */
	readonly proposed: Array<DocDraftSectionChange>;
	/**
	 * Comments made to the section change.
	 */
	readonly comments: Array<DocDraftSectionComment>;
	/**
	 * Whether this change has been applied to the draft.
	 */
	readonly applied: boolean;
	/**
	 * Whether this change has been dismissed by the user.
	 */
	readonly dismissed: boolean;
	/**
	 * When the change was dismissed (if dismissed).
	 */
	readonly dismissedAt?: Date | null;
	/**
	 * ID of the user who dismissed the change (if dismissed).
	 */
	readonly dismissedBy?: number | null;
	/**
	 * When changes were first added.
	 */
	readonly createdAt: Date;
	/**
	 * When changes were last updated.
	 */
	readonly updatedAt: Date;
}

export type NewDocDraftSectionChanges = Omit<DocDraftSectionChanges, "id" | "createdAt" | "updatedAt"> & {
	contentLastEditedAt?: Date | null;
	contentLastEditedBy?: number | null;
	contentMetadata?: unknown;
};

export function defineDocDraftChanges(sequelize: Sequelize): ModelDef<DocDraftSectionChanges> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.doc_draft_section_changes;
	if (existing) {
		return existing as ModelDef<DocDraftSectionChanges>;
	}
	return sequelize.define("doc_draft_section_changes", schema, { timestamps: true });
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
	docId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		references: {
			model: "docs",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	changeType: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "pending",
		validate: {
			isIn: [["insert-before", "insert-after", "update", "delete"]],
		},
	},
	path: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	sectionId: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	baseContent: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	content: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	proposed: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
	comments: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
	applied: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	dismissed: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	dismissedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	dismissedBy: {
		type: DataTypes.INTEGER,
		allowNull: true,
	},
};
