import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Authentication record for global users (password + OAuth).
 * Stored in Manager DB.
 */
export interface GlobalAuthRow {
	readonly id: number;
	readonly userId: number;
	readonly provider: string;
	readonly providerId: string | null;
	readonly providerEmail: string | null;
	readonly passwordHash: string | null;
	readonly passwordSalt: string | null;
	readonly passwordAlgo: string | null;
	readonly passwordIterations: number | null;
	readonly accessToken: string | null;
	readonly refreshToken: string | null;
	readonly tokenExpiresAt: Date | null;
	readonly refreshTokenExpiresAt: Date | null;
	readonly scope: string | null;
	readonly idToken: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing global auth type */
export interface GlobalAuth {
	id: number;
	userId: number;
	provider: string;
	providerId: string | null;
	providerEmail: string | null;
	passwordHash: string | null;
	passwordSalt: string | null;
	passwordAlgo: string | null;
	passwordIterations: number | null;
	accessToken: string | null;
	refreshToken: string | null;
	tokenExpiresAt: Date | null;
	refreshTokenExpiresAt: Date | null;
	scope: string | null;
	idToken: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new global auth record */
export interface NewGlobalAuth {
	userId: number;
	provider: string;
	providerId?: string | null;
	providerEmail?: string | null;
	passwordHash?: string | null;
	passwordSalt?: string | null;
	passwordAlgo?: string | null;
	passwordIterations?: number | null;
	accessToken?: string | null;
	refreshToken?: string | null;
	tokenExpiresAt?: Date | null;
	refreshTokenExpiresAt?: Date | null;
	scope?: string | null;
	idToken?: string | null;
}

export function defineGlobalAuths(sequelize: Sequelize): ModelDef<GlobalAuthRow> {
	const existing = sequelize.models?.GlobalAuth;
	if (existing) {
		return existing as ModelDef<GlobalAuthRow>;
	}
	return sequelize.define("GlobalAuth", schema, {
		timestamps: true,
		underscored: true,
		tableName: "global_auths",
		indexes: [
			{
				fields: ["user_id"],
				name: "idx_global_auths_user_id",
			},
			{
				fields: ["provider", "provider_id"],
				name: "global_auths_provider_provider_id_key",
				unique: true,
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
	provider: {
		type: DataTypes.STRING(50),
		allowNull: false,
	},
	providerId: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "provider_id",
	},
	providerEmail: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "provider_email",
	},
	passwordHash: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "password_hash",
	},
	passwordSalt: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "password_salt",
	},
	passwordAlgo: {
		type: DataTypes.STRING(50),
		allowNull: true,
		field: "password_algo",
	},
	passwordIterations: {
		type: DataTypes.INTEGER,
		allowNull: true,
		field: "password_iterations",
	},
	accessToken: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "access_token",
	},
	refreshToken: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "refresh_token",
	},
	tokenExpiresAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "token_expires_at",
	},
	refreshTokenExpiresAt: {
		type: DataTypes.DATE,
		allowNull: true,
		field: "refresh_token_expires_at",
	},
	scope: {
		type: DataTypes.TEXT,
		allowNull: true,
	},
	idToken: {
		type: DataTypes.TEXT,
		allowNull: true,
		field: "id_token",
	},
};

/** Convert database row to API type */
export function toGlobalAuth(row: GlobalAuthRow): GlobalAuth {
	return {
		id: row.id,
		userId: row.userId,
		provider: row.provider,
		providerId: row.providerId,
		providerEmail: row.providerEmail,
		passwordHash: row.passwordHash,
		passwordSalt: row.passwordSalt,
		passwordAlgo: row.passwordAlgo,
		passwordIterations: row.passwordIterations,
		accessToken: row.accessToken,
		refreshToken: row.refreshToken,
		tokenExpiresAt: row.tokenExpiresAt,
		refreshTokenExpiresAt: row.refreshTokenExpiresAt,
		scope: row.scope,
		idToken: row.idToken,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
