import type { ModelDef } from "../util/ModelDef.js";
import { DataTypes, type Sequelize } from "sequelize";

/**
 * Authentication record for global users (password + OAuth)
 */
export interface GlobalAuth {
	readonly id: number;
	readonly userId: number;
	readonly provider: string;
	readonly providerId?: string | undefined;
	readonly providerEmail?: string | undefined;
	readonly passwordHash?: string | undefined;
	readonly passwordSalt?: string | undefined;
	readonly passwordAlgo?: string | undefined;
	readonly passwordIterations?: number | undefined;
	readonly accessToken?: string | undefined;
	readonly refreshToken?: string | undefined;
	readonly tokenExpiresAt?: Date | undefined;
	readonly refreshTokenExpiresAt?: Date | undefined;
	readonly scope?: string | undefined;
	readonly idToken?: string | undefined;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * Define GlobalAuth model
 */
export function defineGlobalAuths(sequelize: Sequelize): ModelDef<GlobalAuth> {
	const existing = sequelize.models?.GlobalAuth;
	if (existing) {
		return existing as ModelDef<GlobalAuth>;
	}
	return sequelize.define("GlobalAuth", schema, {
		tableName: "global_auths",
		timestamps: true,
		underscored: true,
		indexes,
	});
}

const indexes = [
	{
		name: "idx_global_auths_user_id",
		fields: ["user_id"],
	},
	{
		name: "global_auths_provider_provider_id_key",
		unique: true,
		fields: ["provider", "provider_id"],
	},
];

const schema = {
	id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true,
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
