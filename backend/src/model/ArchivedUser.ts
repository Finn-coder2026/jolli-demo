import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import type { OrgUserRole } from "./ActiveUser";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Archived user record (for removed users)
 */
export interface ArchivedUser {
	readonly id: number;
	readonly userId: number;
	readonly email: string;
	readonly name: string | null;
	readonly role: OrgUserRole | null;
	readonly removedBy: number;
	readonly removedByName: string | null;
	readonly reason: string | null;
	readonly removedAt: Date;
}

/**
 * Type for creating a new archived user record
 * Note: removedByName is excluded as it's derived from a join, not stored
 */
export type NewArchivedUser = Omit<ArchivedUser, "id" | "removedByName">;

/**
 * Define the ArchivedUser model in Sequelize.
 */
export function defineArchivedUsers(sequelize: Sequelize): ModelDef<ArchivedUser> {
	const existing = sequelize.models?.archived_user;
	if (existing) {
		return existing as ModelDef<ArchivedUser>;
	}
	return sequelize.define("archived_user", schema, {
		timestamps: false,
		underscored: true,
		tableName: "archived_users",
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	userId: {
		type: DataTypes.BIGINT,
		allowNull: false,
	},
	email: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	name: {
		type: DataTypes.STRING(200),
		allowNull: true,
	},
	role: {
		type: DataTypes.STRING(50),
		allowNull: true,
	},
	removedBy: {
		type: DataTypes.BIGINT,
		allowNull: false,
	},
	reason: {
		type: DataTypes.STRING(500),
		allowNull: true,
	},
	removedAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
	},
};

/**
 * Post-sync hook to create indexes for archived_users table.
 * All operations are idempotent (safe to run multiple times).
 *
 * Note: FK constraint removal for removedBy is handled in ActiveUser.ts postSyncActiveUsers
 * as part of the centralized FK cleanup (JOLLI-508).
 */
export async function postSyncArchivedUsers(sequelize: Sequelize): Promise<void> {
	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS idx_archived_users_removed_at ON archived_users(removed_at DESC);
	`);
	// Note: Removed idx_archived_users_user_id index - user_id lookups are rare,
	// the table is typically small, and the index adds write overhead
}

/**
 * PII schema for archived_user resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 * Note: Class body contains TypeScript property declarations that don't generate runtime code,
 * but decorators execute at class definition time to register PII fields.
 */
/* v8 ignore start - decorator class with TypeScript-only property declarations */
@PIISchema("archived_user")
class ArchivedUserPII {
	@PIIField({ description: "Archived user email address" })
	email!: string;

	@PIIField({ description: "Archived user name" })
	name!: string;
}
/* v8 ignore stop */

// Reference the class to ensure decorators are executed
void ArchivedUserPII;
