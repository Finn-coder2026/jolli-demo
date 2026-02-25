import { PIIField, PIISchema } from "../audit/PiiDecorators";
import type { ModelDef } from "../util/ModelDef";
import type { OrgUserRole } from "./ActiveUser";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Invitation status
 */
export type InvitationStatus = "pending" | "accepted" | "expired";

/**
 * User invitation record
 */
export interface UserInvitation {
	readonly id: number;
	readonly email: string;
	readonly invitedBy: number;
	readonly role: OrgUserRole;
	readonly name: string | null;
	readonly verificationId: number | null;
	readonly expiresAt: Date;
	readonly status: InvitationStatus;
	readonly createdAt: Date;
}

/**
 * Type for creating a new invitation
 */
export type NewUserInvitation = Omit<UserInvitation, "id" | "createdAt">;

/**
 * Define the UserInvitation model in Sequelize.
 */
export function defineUserInvitations(sequelize: Sequelize): ModelDef<UserInvitation> {
	const existing = sequelize.models?.user_invitation;
	if (existing) {
		return existing as ModelDef<UserInvitation>;
	}
	return sequelize.define("user_invitation", schema, {
		timestamps: true,
		updatedAt: false,
		underscored: true,
		tableName: "user_invitations",
	});
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	email: {
		type: DataTypes.STRING(255),
		allowNull: false,
	},
	invitedBy: {
		type: DataTypes.BIGINT,
		allowNull: false,
		// Note: No FK constraint - inviter may not exist in active_users table yet
		// The invitedBy stores the user ID from the JWT token (Manager DB user.id)
	},
	role: {
		type: DataTypes.STRING(50),
		allowNull: false,
	},
	name: {
		type: DataTypes.STRING(255),
		allowNull: true,
	},
	verificationId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		// Note: References verifications.id in Manager DB - no FK constraint across databases
	},
	expiresAt: {
		type: DataTypes.DATE,
		allowNull: false,
	},
	status: {
		type: DataTypes.STRING(50),
		allowNull: false,
		defaultValue: "pending",
	},
};

/**
 * Post-sync hook to create indexes and constraints for user_invitations table.
 * All operations are idempotent (safe to run multiple times).
 */
export async function postSyncUserInvitations(sequelize: Sequelize): Promise<void> {
	// Remove column comments to avoid Sequelize describeTable bug in multi-schema environments
	// (Sequelize's describeTable query doesn't filter by schema when fetching comments,
	// causing "more than one row returned by a subquery" error when same table exists in multiple schemas)
	await sequelize.query(`COMMENT ON COLUMN user_invitations.verification_id IS NULL`);

	// Drop legacy FK constraint on invited_by (if exists)
	// The invitedBy references GlobalUser.id from Manager DB, not active_users
	// Cannot have real FK constraint across databases
	await sequelize.query(`
		ALTER TABLE user_invitations
		DROP CONSTRAINT IF EXISTS user_invitations_invited_by_fkey;
	`);
	await sequelize.query(`
		ALTER TABLE user_invitations
		DROP CONSTRAINT IF EXISTS user_invitations_invited_by_fkey1;
	`);

	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
	`);
	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS idx_user_invitations_status_expires ON user_invitations(status, expires_at);
	`);
	// Partial unique index: only one pending invitation per email
	await sequelize.query(`
		CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_email_pending_unique
		ON user_invitations(email) WHERE status = 'pending';
	`);

	// Migration: add verification_id column if it doesn't exist
	try {
		const [columns] = await sequelize.query(`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = 'user_invitations' AND column_name = 'verification_id';
		`);
		if (!Array.isArray(columns) || columns.length === 0) {
			await sequelize.query(`
				ALTER TABLE user_invitations ADD COLUMN verification_id INTEGER;
			`);
		}
	} catch {
		// Column may already exist, safe to ignore
	}

	// Index on verification_id for efficient lookups
	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS idx_user_invitations_verification_id ON user_invitations(verification_id);
	`);

	// Migration: drop token_hash column if it exists (no longer needed, using verification_id instead)
	try {
		const [columns] = await sequelize.query(`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = 'user_invitations' AND column_name = 'token_hash';
		`);
		if (Array.isArray(columns) && columns.length > 0) {
			await sequelize.query(`
				ALTER TABLE user_invitations DROP COLUMN token_hash;
			`);
		}
	} catch {
		// Column may not exist, safe to ignore
	}
}

/**
 * PII schema for user_invitation resource type.
 * Registers which fields contain PII and should be encrypted in audit logs.
 * Note: Class body contains TypeScript property declarations that don't generate runtime code,
 * but decorators execute at class definition time to register PII fields.
 */
/* v8 ignore start - decorator class with TypeScript-only property declarations */
@PIISchema("user_invitation")
class UserInvitationPII {
	@PIIField({ description: "Invitee email address" })
	email!: string;

	@PIIField({ description: "Invitee name" })
	name!: string;
}
/* v8 ignore stop */

// Reference the class to ensure decorators are executed
void UserInvitationPII;
