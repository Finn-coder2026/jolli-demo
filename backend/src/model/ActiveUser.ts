import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Organization user role slug.
 * Built-in roles: "owner", "admin", "member".
 */
export type OrgUserRole = "owner" | "admin" | "member";

/**
 * Active user within an organization (per-tenant).
 * The id field matches Manager DB global_user.id (not auto-generated).
 */
export interface ActiveUser {
	readonly id: number;
	readonly email: string;
	readonly role: OrgUserRole;
	/** @deprecated Use `role` slug for permission lookups instead. Will be removed in a future release. */
	readonly roleId: number | null;
	readonly isActive: boolean;
	/** Whether this user is a Jolli Agent system account */
	readonly isAgent: boolean;
	readonly name: string | null;
	readonly image: string | null;
	readonly jobTitle: string | null;
	readonly phone: string | null;
	readonly language: string;
	readonly timezone: string;
	readonly location: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Type for creating a new active user.
 * Note: id must be explicitly provided (not auto-generated).
 */
export type NewActiveUser = Omit<ActiveUser, "createdAt" | "updatedAt" | "isAgent"> & {
	isAgent?: boolean;
};

/**
 * Define the ActiveUser model in Sequelize.
 */
export function defineActiveUsers(sequelize: Sequelize): ModelDef<ActiveUser> {
	const existing = sequelize.models?.active_user;
	if (existing) {
		return existing as ModelDef<ActiveUser>;
	}
	return sequelize.define("active_user", schema, {
		timestamps: true,
		underscored: true,
		tableName: "active_users",
	});
}

const schema = {
	id: {
		type: DataTypes.BIGINT,
		primaryKey: true,
		// Note: NOT auto-increment - id comes from Manager DB global_user.id
	},
	email: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	role: {
		type: DataTypes.STRING(50),
		allowNull: false,
	},
	roleId: {
		type: DataTypes.INTEGER,
		allowNull: true, // Deprecated — will be removed in a future release
		references: {
			model: "roles",
			key: "id",
		},
		onDelete: "SET NULL",
	},
	isActive: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: true,
	},
	isAgent: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false,
	},
	name: {
		type: DataTypes.STRING(255),
		allowNull: true,
	},
	image: {
		type: DataTypes.STRING(500),
		allowNull: true,
	},
	jobTitle: {
		type: DataTypes.STRING(100),
		allowNull: true,
	},
	phone: {
		type: DataTypes.STRING(50),
		allowNull: true,
	},
	language: {
		type: DataTypes.STRING(10),
		allowNull: false,
		defaultValue: "en",
	},
	timezone: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "UTC",
	},
	location: {
		type: DataTypes.STRING(200),
		allowNull: true,
	},
};

/**
 * Helper to drop a foreign key constraint if it exists (idempotent).
 * @param sequelize - Sequelize instance
 * @param tableName - Table name containing the constraint
 * @param constraintName - Name of the constraint to drop
 */
async function dropForeignKeyIfExists(sequelize: Sequelize, tableName: string, constraintName: string): Promise<void> {
	const result = await sequelize.query(
		`
		SELECT constraint_name FROM information_schema.table_constraints
		WHERE table_schema = current_schema()
		  AND table_name = :tableName
		  AND constraint_name = :constraintName
		  AND constraint_type = 'FOREIGN KEY';
		`,
		{ replacements: { tableName, constraintName } },
	);

	// Handle various result formats from sequelize.query (real DB vs mocks)
	const constraints = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];

	if (constraints.length > 0) {
		await sequelize.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${constraintName}";`);
	}
}

/**
 * Post-sync hook to create indexes and run migrations for active_users table.
 * All operations are idempotent (safe to run multiple times).
 */
export async function postSyncActiveUsers(sequelize: Sequelize): Promise<void> {
	// Migration: rename avatar column to image (idempotent)
	try {
		const [columns] = await sequelize.query(`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = 'active_users' AND column_name = 'avatar';
		`);
		if (Array.isArray(columns) && columns.length > 0) {
			await sequelize.query(`ALTER TABLE active_users RENAME COLUMN avatar TO image;`);
		}
	} catch {
		// Column may not exist or already renamed, safe to ignore
	}

	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS idx_active_users_email ON active_users(email);
	`);
	// Note: Removed idx_active_users_role index - role has only 3 values (owner/admin/member),
	// low cardinality indexes are not efficient and add write overhead
	// Note: Removed idx_active_users_is_active index - boolean field with only 2 values,
	// very low cardinality, index provides no benefit

	// Migration: Drop foreign key constraints to users.id that were removed in commit 1dad66f
	// These FKs were removed because the users table was refactored to active_users table,
	// and the old FK references to users.id are no longer valid in the multi-tenant RBAC model.
	// The migration is idempotent - it only drops constraints that exist.
	const fksToRemove: Array<{ table: string; constraint: string }> = [
		{ table: "archived_users", constraint: "archived_users_removed_by_fkey" }, // JOLLI-508: Allow deleting users who removed others
		{ table: "assets", constraint: "assets_uploaded_by_fkey" },
		{ table: "audit_events", constraint: "audit_events_actor_id_fkey" },
		{ table: "convos", constraint: "convos_user_id_fkey" },
		{ table: "doc_drafts", constraint: "doc_drafts_created_by_fkey" },
		{ table: "doc_drafts", constraint: "doc_drafts_content_last_edited_by_fkey" },
		{ table: "doc_drafts", constraint: "doc_drafts_shared_by_fkey" },
		{ table: "doc_draft_edit_histories", constraint: "doc_draft_edit_histories_user_id_fkey" },
		{ table: "doc_histories", constraint: "doc_histories_user_id_fkey" },
		{ table: "docsites", constraint: "docsites_user_id_fkey" },
		{ table: "sites", constraint: "sites_user_id_fkey" },
		{ table: "spaces", constraint: "spaces_owner_id_fkey" },
		{ table: "user_space_preferences", constraint: "user_space_preferences_user_id_fkey" },
		{ table: "visits", constraint: "visits_user_id_fkey" },
	];

	for (const { table, constraint } of fksToRemove) {
		await dropForeignKeyIfExists(sequelize, table, constraint);
	}
}

/**
 * PII schema for active_user resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 * Note: Class body contains TypeScript property declarations that don't generate runtime code,
 * but decorators execute at class definition time to register PII fields.
 */
/* v8 ignore start - decorator class with TypeScript-only property declarations */
@PIISchema("active_user")
class ActiveUserPII {
	@PIIField({ description: "User email address" })
	email!: string;

	@PIIField({ description: "User display name" })
	name!: string;

	@PIIField({ description: "User phone number" })
	phone!: string;

	@PIIField({ description: "User location" })
	location!: string;
}
/* v8 ignore stop */

// Reference the class to ensure decorators are executed
void ActiveUserPII;
