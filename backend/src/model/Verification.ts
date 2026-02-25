import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Verification type enum - supported verification token types
 */
export type VerificationType = "password_reset" | "email_verification" | "invitation" | "owner_invitation";

/**
 * Verification interface for one-time tokens (password reset, email verification, invitation, etc.)
 */
export interface Verification {
	readonly id: number;
	readonly identifier: string; // Email or user identifier
	readonly tokenHash?: string; // Hashed token (nullable for better-auth compatibility)
	readonly value?: string; // Value associated with verification (e.g., userId for password reset, or JSON metadata)
	readonly type?: VerificationType; // Nullable for better-auth compatibility
	readonly expiresAt: Date;
	readonly usedAt?: Date; // When token was used (null = not used yet)
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Define Verification model
 */
export function defineVerifications(sequelize: Sequelize): ModelDef<Verification> {
	const existing = sequelize.models?.Verification;
	if (existing) {
		return existing as ModelDef<Verification>;
	}
	return sequelize.define("Verification", schema, {
		tableName: "verifications",
		timestamps: true,
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "verifications_token_hash_key",
		unique: true,
		fields: ["token_hash"],
	},
	{
		name: "idx_verifications_identifier_type",
		fields: ["identifier", "type"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	identifier: {
		type: DataTypes.STRING(255),
		allowNull: false,
		comment: "Email or user identifier",
	},
	tokenHash: {
		type: DataTypes.STRING(255),
		allowNull: true, // Nullable for better-auth compatibility
		field: "token_hash",
		comment: "SHA-256 hash of the verification token",
	},
	value: {
		type: DataTypes.JSONB,
		allowNull: true,
		comment: "Value associated with verification (e.g., userId for password reset, or JSON metadata)",
	},
	type: {
		type: DataTypes.ENUM("password_reset", "email_verification", "invitation", "owner_invitation"),
		allowNull: true, // Nullable for better-auth compatibility (better-auth doesn't use type column)
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
		comment: "When token was used (null = not used yet)",
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
