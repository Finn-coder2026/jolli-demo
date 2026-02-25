import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export type SyncCommitStatus =
	| "proposed"
	| "reviewing"
	| "ready"
	| "publishing"
	| "published"
	| "rejected"
	| "superseded";

export interface SyncCommit {
	readonly id: number;
	readonly seq: number;
	readonly message: string | undefined;
	readonly mergePrompt: string | undefined;
	readonly pushedBy: string | undefined;
	readonly clientChangesetId: string;
	readonly status: SyncCommitStatus;
	readonly commitScopeKey: string;
	readonly targetBranch: string;
	readonly payloadHash: string;
	readonly publishedAt: Date | undefined;
	readonly publishedBy: string | undefined;
	readonly createdAt: Date;
}

export type NewSyncCommit = Omit<SyncCommit, "id" | "createdAt" | "publishedAt" | "publishedBy"> & {
	publishedAt?: Date;
	publishedBy?: string;
};

export function defineSyncCommits(sequelize: Sequelize): ModelDef<SyncCommit> {
	const existing = sequelize.models?.sync_commit;
	if (existing) {
		return existing as ModelDef<SyncCommit>;
	}
	return sequelize.define("sync_commit", schema, {
		timestamps: false,
		tableName: "sync_commits",
		indexes: [
			{
				name: "sync_commits_seq_idx",
				fields: ["seq"],
			},
			{
				name: "sync_commits_scope_client_changeset_key",
				unique: true,
				fields: ["commit_scope_key", "client_changeset_id"],
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
	seq: {
		type: DataTypes.BIGINT,
		allowNull: false,
	},
	message: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	mergePrompt: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "merge_prompt",
	},
	pushedBy: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "pushed_by",
	},
	clientChangesetId: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "client_changeset_id",
	},
	status: {
		type: DataTypes.TEXT,
		allowNull: false,
		defaultValue: "proposed",
	},
	commitScopeKey: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "commit_scope_key",
	},
	targetBranch: {
		type: DataTypes.TEXT,
		allowNull: false,
		defaultValue: "main",
		field: "target_branch",
	},
	payloadHash: {
		type: DataTypes.TEXT,
		allowNull: false,
		field: "payload_hash",
	},
	publishedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "published_at",
	},
	publishedBy: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "published_by",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
		field: "created_at",
	},
};
