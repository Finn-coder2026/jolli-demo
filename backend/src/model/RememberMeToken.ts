import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Remember-me token interface for persistent login using Series + Token pattern.
 * Tokens are stored as SHA256 hashes for security.
 * Series stays constant per login session, token rotates on each use.
 * This enables theft detection when series exists but token doesn't match.
 *
 * Grace period support: When a token is rotated, the previous token hash is stored
 * in `previousTokenHash` and remains valid for a short grace period (tracked by `rotatedAt`).
 * This handles concurrent requests that may arrive with the old token.
 */
export interface RememberMeToken {
	readonly series: string;
	readonly userId: number;
	readonly tokenHash: string;
	/** Previous token hash for grace period during rotation (null if never rotated) */
	readonly previousTokenHash: string | null;
	/** Timestamp of the last token rotation (null if never rotated) */
	readonly rotatedAt: Date | null;
	readonly userAgent: string | null;
	readonly ipAddress: string | null;
	readonly expiresAt: Date;
	readonly lastUsed: Date;
	readonly createdAt: Date;
}

/** Input type for creating a new remember-me token */
export interface NewRememberMeToken {
	series: string;
	userId: number;
	tokenHash: string;
	userAgent?: string | null;
	ipAddress?: string | null;
	expiresAt: Date;
}

/**
 * Define RememberMeToken model
 */
export function defineRememberMeTokens(sequelize: Sequelize): ModelDef<RememberMeToken> {
	const existing = sequelize.models?.RememberMeToken;
	if (existing) {
		return existing as ModelDef<RememberMeToken>;
	}
	return sequelize.define("RememberMeToken", schema, {
		tableName: "rememberme_tokens",
		timestamps: false,
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "idx_rememberme_tokens_user_id",
		fields: ["user_id"],
	},
	{
		name: "idx_rememberme_tokens_expires_at",
		fields: ["expires_at"],
	},
];

const schema = {
	series: {
		type: DataTypes.STRING(64),
		primaryKey: true,
		allowNull: false,
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: false,
		field: "user_id",
		references: {
			model: "global_users",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	tokenHash: {
		type: DataTypes.STRING(64),
		allowNull: false,
		field: "token_hash",
	},
	previousTokenHash: {
		type: DataTypes.STRING(64),
		allowNull: true,
		field: "previous_token_hash",
	},
	rotatedAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "rotated_at",
	},
	userAgent: {
		type: DataTypes.STRING(512),
		allowNull: true,
		field: "user_agent",
	},
	ipAddress: {
		type: DataTypes.STRING(45),
		allowNull: true,
		field: "ip_address",
	},
	expiresAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "expires_at",
	},
	lastUsed: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "last_used",
		defaultValue: DataTypes.NOW,
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		field: "created_at",
		defaultValue: DataTypes.NOW,
	},
};
