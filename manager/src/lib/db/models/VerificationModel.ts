import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Verification type enum - supported verification token types
 */
export type VerificationType = "password_reset" | "email_verification" | "invitation" | "owner_invitation";

/**
 * Verification record for one-time tokens (password reset, email verification, invitation).
 * Stored in Manager DB.
 */
export interface VerificationRow {
	readonly id: number;
	readonly identifier: string;
	readonly tokenHash: string | null;
	readonly value: string | null;
	readonly type: VerificationType | null;
	readonly expiresAt: Date;
	readonly usedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing verification type */
export interface Verification {
	id: number;
	identifier: string;
	tokenHash: string | null;
	value: string | null;
	type: VerificationType | null;
	expiresAt: Date;
	usedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new verification */
export interface NewVerification {
	identifier: string;
	tokenHash?: string | null;
	value?: string | null;
	type?: VerificationType | null;
	expiresAt: Date;
}

export function defineVerifications(sequelize: Sequelize): ModelDef<VerificationRow> {
	const existing = sequelize.models?.Verification;
	if (existing) {
		return existing as ModelDef<VerificationRow>;
	}
	return sequelize.define("Verification", schema, {
		timestamps: true,
		underscored: true,
		tableName: "verifications",
		indexes: [
			{
				fields: ["token_hash"],
				name: "verifications_token_hash_key",
				unique: true,
			},
			{
				fields: ["identifier", "type"],
				name: "idx_verifications_identifier_type",
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
	identifier: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "identifier",
	},
	tokenHash: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "token_hash",
	},
	value: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	type: {
		type: DataTypes.ENUM("password_reset", "email_verification", "invitation", "owner_invitation"),
		allowNull: true,
		defaultValue: null,
	},
	expiresAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "expires_at",
	},
	usedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "used_at",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "created_at",
		defaultValue: DataTypes.NOW,
	},
	updatedAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "updated_at",
		defaultValue: DataTypes.NOW,
	},
};

/** Convert database row to API type */
export function toVerification(row: VerificationRow): Verification {
	return {
		id: row.id,
		identifier: row.identifier,
		tokenHash: row.tokenHash,
		value: row.value,
		type: row.type,
		expiresAt: row.expiresAt,
		usedAt: row.usedAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
