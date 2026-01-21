import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * SyncArticle tracks cursor position for synced articles.
 * Content is stored in the docs table; this table only tracks the sync cursor.
 */
export interface SyncArticle {
	readonly docJrn: string;
	readonly lastSeq: number;
}

export function defineSyncArticles(sequelize: Sequelize): ModelDef<SyncArticle> {
	const existing = sequelize.models?.sync_article;
	if (existing) {
		return existing as ModelDef<SyncArticle>;
	}
	return sequelize.define("sync_article", schema, {
		timestamps: false,
		tableName: "sync_articles",
	});
}

const schema = {
	docJrn: {
		type: DataTypes.TEXT,
		primaryKey: true,
		field: "doc_jrn",
	},
	lastSeq: {
		type: DataTypes.BIGINT,
		allowNull: false,
		defaultValue: 0,
		field: "last_seq",
	},
};
