import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Remember-me token record for persistent login using Series + Token pattern.
 * Stored in Manager DB, references global_users.
 *
 * Security: Series stays constant, token rotates on each use.
 * This enables theft detection: if series exists but token doesn't match,
 * the token was likely stolen and used by an attacker.
 *
 * Grace period support: When a token is rotated, the previous token hash is stored
 * in `previousTokenHash` and remains valid for a short grace period (tracked by `rotatedAt`).
 * This handles concurrent requests that may arrive with the old token.
 */
export interface RememberMeTokenRow {
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

/** API-facing remember-me token type */
export interface RememberMeToken {
	series: string;
	userId: number;
	tokenHash: string;
	/** Previous token hash for grace period during rotation (null if never rotated) */
	previousTokenHash: string | null;
	/** Timestamp of the last token rotation (null if never rotated) */
	rotatedAt: Date | null;
	userAgent: string | null;
	ipAddress: string | null;
	expiresAt: Date;
	lastUsed: Date;
	createdAt: Date;
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

export function defineRememberMeTokens(sequelize: Sequelize): ModelDef<RememberMeTokenRow> {
	const existing = sequelize.models?.RememberMeToken;
	if (existing) {
		return existing as ModelDef<RememberMeTokenRow>;
	}
	return sequelize.define("RememberMeToken", schema, {
		timestamps: false,
		underscored: true,
		tableName: "rememberme_tokens",
		indexes: [
			{
				fields: ["user_id"],
				name: "idx_rememberme_tokens_user_id",
			},
			{
				fields: ["expires_at"],
				name: "idx_rememberme_tokens_expires_at",
			},
		],
	});
}

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
		defaultValue: DataTypes.NOW,
		field: "last_used",
	},
	createdAt: {
		type: DataTypes.DATE,
		allowNull: false,
		defaultValue: DataTypes.NOW,
		field: "created_at",
	},
};

/** Convert database row to API type */
export function toRememberMeToken(row: RememberMeTokenRow): RememberMeToken {
	return {
		series: row.series,
		userId: row.userId,
		tokenHash: row.tokenHash,
		previousTokenHash: row.previousTokenHash,
		rotatedAt: row.rotatedAt,
		userAgent: row.userAgent,
		ipAddress: row.ipAddress,
		expiresAt: row.expiresAt,
		lastUsed: row.lastUsed,
		createdAt: row.createdAt,
	};
}
