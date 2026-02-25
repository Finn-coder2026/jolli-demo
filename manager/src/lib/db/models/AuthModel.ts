import type { ModelDef } from "../../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

/** OAuth provider types */
export type OAuthProvider = "google";

/** Internal model interface matching database schema */
export interface AuthRow {
	readonly id: number;
	readonly userId: number;
	readonly provider: OAuthProvider;
	readonly providerId: string;
	readonly providerEmail: string | null;
	readonly accessToken: string | null;
	readonly refreshToken: string | null;
	readonly tokenExpiresAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** API-facing auth type */
export interface Auth {
	id: number;
	userId: number;
	provider: OAuthProvider;
	providerId: string;
	providerEmail: string | null;
	accessToken: string | null;
	refreshToken: string | null;
	tokenExpiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

/** Input type for creating a new auth record */
export interface NewAuth {
	userId: number;
	provider: OAuthProvider;
	providerId: string;
	providerEmail?: string | null;
	accessToken?: string | null;
	refreshToken?: string | null;
	tokenExpiresAt?: Date | null;
}

/** Input type for updating auth tokens */
export interface UpdateAuthTokens {
	accessToken?: string | null;
	refreshToken?: string | null;
	tokenExpiresAt?: Date | null;
}

export function defineAuths(sequelize: Sequelize): ModelDef<AuthRow> {
	return sequelize.define("auth", schema, {
		timestamps: true,
		underscored: true,
		tableName: "auths",
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
			model: "users",
			key: "id",
		},
		onDelete: "CASCADE",
	},
	provider: {
		type: DataTypes.ENUM("google"),
		allowNull: false,
	},
	providerId: {
		type: DataTypes.STRING(255),
		allowNull: false,
		field: "provider_id",
	},
	providerEmail: {
		type: DataTypes.STRING(255),
		allowNull: true,
		field: "provider_email",
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
};

/** Convert database row to API type */
export function toAuth(row: AuthRow): Auth {
	return {
		id: row.id,
		userId: row.userId,
		provider: row.provider,
		providerId: row.providerId,
		providerEmail: row.providerEmail,
		accessToken: row.accessToken,
		refreshToken: row.refreshToken,
		tokenExpiresAt: row.tokenExpiresAt,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
