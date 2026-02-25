import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export type SyncCommitFileDecision = "accept" | "reject" | "amend";

export interface SyncCommitFileReview {
	readonly id: number;
	readonly commitFileId: number;
	readonly decision: SyncCommitFileDecision;
	readonly amendedContent: string | undefined;
	readonly reviewedBy: string | undefined;
	readonly reviewedAt: Date;
	readonly comment: string | undefined;
}

export type NewSyncCommitFileReview = Omit<SyncCommitFileReview, "id" | "reviewedAt"> & { reviewedAt?: Date };

export function defineSyncCommitFileReviews(sequelize: Sequelize): ModelDef<SyncCommitFileReview> {
	const existing = sequelize.models?.sync_commit_file_review;
	if (existing) {
		return existing as ModelDef<SyncCommitFileReview>;
	}
	return sequelize.define("sync_commit_file_review", schema, {
		timestamps: false,
		tableName: "sync_commit_file_reviews",
		indexes: [
			{
				name: "sync_commit_file_reviews_commit_file_idx",
				fields: ["commit_file_id", "reviewed_at"],
			},
		],
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	commitFileId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "commit_file_id",
		references: {
			model: "sync_commit_files",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	decision: {
		type: DataTypes.TEXT,
		allowNull: false,
	},
	amendedContent: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "amended_content",
	},
	reviewedBy: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "reviewed_by",
	},
	reviewedAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
		field: "reviewed_at",
	},
	comment: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
};
