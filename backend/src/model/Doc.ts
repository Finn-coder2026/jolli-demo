import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import type { DocContentMetadata, DocType } from "jolli-common";
import { DataTypes, literal, type Sequelize } from "sequelize";

export interface Doc {
	readonly id: number;
	readonly jrn: string;
	readonly slug: string;
	readonly path: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly updatedBy: string;
	readonly source: unknown | undefined;
	readonly sourceMetadata: unknown | undefined;
	readonly content: string;
	readonly contentType: string;
	readonly contentMetadata: DocContentMetadata | undefined;
	readonly version: number;
	// Space hierarchy fields
	readonly spaceId: number | undefined;
	readonly parentId: number | undefined;
	readonly docType: DocType;
	readonly sortOrder: number;
	readonly createdBy: string | undefined;
	readonly deletedAt: Date | undefined;
	readonly explicitlyDeleted: boolean;
}

/**
 * New document type for creation.
 * - slug: Auto-generated from title if not provided
 * - path: Auto-generated based on parent hierarchy if not provided
 * - jrn: Auto-generated if not provided
 * - sortOrder: Auto-calculated from max sibling sortOrder + 1 if not provided (requires spaceId)
 */
export type NewDoc = Omit<
	Doc,
	| "id"
	| "createdAt"
	| "updatedAt"
	| "version"
	| "deletedAt"
	| "explicitlyDeleted"
	| "slug"
	| "path"
	| "jrn"
	| "sortOrder"
> & {
	slug?: string;
	path?: string;
	jrn?: string;
	sortOrder?: number;
};

export function defineDocs(sequelize: Sequelize): ModelDef<Doc> {
	// Return existing model if already defined to preserve definition order during sync
	const existing = sequelize.models?.doc;
	if (existing) {
		return existing as ModelDef<Doc>;
	}
	return sequelize.define("doc", schema, {
		timestamps: true,
		indexes: [
			// Full-text search index for content (English)
			{
				name: "idx_docs_content_fts",
				using: "GIN",
				fields: [literal("to_tsvector('english', content)")],
			},
		],
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	jrn: {
		type: DataTypes.STRING,
		allowNull: false,
		unique: "docs_jrn_key",
	},
	slug: {
		// Migration complete: all docs have slugs, all creation paths generate slugs
		type: DataTypes.STRING(100),
		allowNull: false,
	},
	path: {
		type: DataTypes.TEXT,
		allowNull: false,
		defaultValue: "",
	},
	updatedBy: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	source: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	sourceMetadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	content: {
		type: DataTypes.TEXT,
		allowNull: false,
	},
	contentType: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	contentMetadata: {
		type: DataTypes.JSONB,
		allowNull: true,
	},
	version: {
		type: DataTypes.INTEGER,
	},
	// Space hierarchy fields
	spaceId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "spaces",
			key: "id",
		},
		onDelete: "SET NULL",
	},
	parentId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "docs",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	docType: {
		type: DataTypes.STRING(20),
		allowNull: false,
		defaultValue: "document",
	},
	sortOrder: {
		type: DataTypes.DOUBLE,
		allowNull: false,
		defaultValue: 0,
	},
	createdBy: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	deletedAt: {
		type: DataTypes.DATE,
		allowNull: true,
	},
	explicitlyDeleted: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
};

/**
 * PII schema for doc resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 */
/* v8 ignore next 8 */
@PIISchema("doc")
class DocPII {
	@PIIField({ description: "Document author email (from metadata)" })
	authorEmail!: string;

	@PIIField({ description: "Document author name (from metadata)" })
	authorName!: string;
}

// Reference the class to ensure decorators are executed
void DocPII;
