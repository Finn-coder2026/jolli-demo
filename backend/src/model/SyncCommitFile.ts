import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export type SyncCommitFileOpType = "upsert" | "delete";

export interface SyncCommitFile {
	readonly id: number;
	readonly commitId: number;
	readonly fileId: string;
	readonly docJrn: string;
	readonly serverPath: string;
	readonly baseContent: string;
	readonly baseVersion: number;
	readonly incomingContent: string | undefined;
	readonly incomingContentHash: string | undefined;
	readonly lineAdditions: number;
	readonly lineDeletions: number;
	readonly opType: SyncCommitFileOpType;
	readonly createdAt: Date;
}

export type NewSyncCommitFile = Omit<SyncCommitFile, "id" | "createdAt">;

export function defineSyncCommitFiles(sequelize: Sequelize): ModelDef<SyncCommitFile> {
	const existing = sequelize.models?.sync_commit_file;
	if (existing) {
		return existing as ModelDef<SyncCommitFile>;
	}
	return sequelize.define("sync_commit_file", schema, {
		timestamps: false,
		tableName: "sync_commit_files",
		indexes: [
			{
				name: "sync_commit_files_commit_idx",
				fields: ["commit_id"],
			},
			{
				name: "sync_commit_files_doc_jrn_idx",
				fields: ["doc_jrn"],
			},
			{
				name: "sync_commit_files_commit_file_key",
				unique: true,
				fields: ["commit_id", "file_id"],
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
	commitId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "commit_id",
		references: {
			model: "sync_commits",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	fileId: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "file_id",
	},
	docJrn: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "doc_jrn",
	},
	serverPath: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "server_path",
	},
	baseContent: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "base_content",
	},
	baseVersion: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "base_version",
	},
	incomingContent: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "incoming_content",
	},
	incomingContentHash: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "incoming_content_hash",
	},
	lineAdditions: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0,
		field: "line_additions",
	},
	lineDeletions: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0,
		field: "line_deletions",
	},
	opType: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "op_type",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
		field: "created_at",
	},
};
